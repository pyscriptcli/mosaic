export interface PdfTextSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  wordRects?: Array<{ start: number; end: number; x: number; width: number }>;
}

export interface PdfPageText {
  pageNumber: number;
  width: number;
  height: number;
  spans: PdfTextSpan[];
}

export interface PdfTextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageChange {
  id: string;
  originalPageNumber: number | null;
  revisedPageNumber: number | null;
  kind: "changed" | "added" | "removed";
  originalText: string;
  revisedText: string;
  originalRects: PdfTextRect[];
  revisedRects: PdfTextRect[];
}

export interface PdfComparisonResult {
  changes: PdfPageChange[];
  scannedPages: { original: number[]; revised: number[] };
}

interface WordToken {
  text: string;
  key: string;
  rect: PdfTextRect;
}

function pageTokens(page: PdfPageText): WordToken[] {
  const tokens = page.spans.flatMap((span) => {
    const matches = Array.from(span.text.matchAll(/\S+/gu));
    const measuredWords = new Map(span.wordRects?.map((word) => [word.start, word]) || []);
    return matches.map((match) => {
      const start = match.index || 0;
      const length = match[0].length;
      const scale = span.text.length ? span.width / span.text.length : 0;
      const text = match[0].replace(/[\u00ad\u200b\ufeff]/gu, "");
      const measuredWord = measuredWords.get(start);
      return {
        text,
        key: text.replace(/^_+([.,;:!?)]*)$/u, "_$1"),
        rect: { x: measuredWord?.x ?? span.x + start * scale, y: span.y, width: measuredWord?.width ?? length * scale, height: span.height },
      };
    });
  });
  const counters = new Set<number>();
  tokens.forEach((token, index) => {
    const nearPageEdge = token.rect.y <= page.height * 0.08 || token.rect.y >= page.height * 0.92;
    if (!nearPageEdge || token.text.toLocaleLowerCase() !== "page") return;
    const counter = tokens.slice(index, index + 4);
    if (counter.length !== 4 || !/^\d+$/u.test(counter[1].text) || counter[2].text.toLocaleLowerCase() !== "of" || !/^\d+$/u.test(counter[3].text)) return;
    if (counter.slice(1).some((part) => Math.abs(part.rect.y - token.rect.y) > Math.max(3, token.rect.height * 0.5))) return;
    counter.forEach((_, offset) => counters.add(index + offset));
  });
  return tokens.filter((_, index) => !counters.has(index));
}

function mergeRects(rectangles: PdfTextRect[]): PdfTextRect[] {
  const sorted = [...rectangles].sort((left, right) => left.y - right.y || left.x - right.x);
  const merged: PdfTextRect[] = [];
  sorted.forEach((rect) => {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push({ ...rect });
      return;
    }
    const centerDelta = Math.abs((previous.y + previous.height / 2) - (rect.y + rect.height / 2));
    const sameLine = centerDelta <= Math.max(2, Math.min(previous.height, rect.height) * 0.35);
    const gap = rect.x - (previous.x + previous.width);
    if (!sameLine || gap > Math.max(3, Math.min(previous.height, rect.height) * 0.7)) {
      merged.push({ ...rect });
      return;
    }
    const right = Math.max(previous.x + previous.width, rect.x + rect.width);
    const bottom = Math.max(previous.y + previous.height, rect.y + rect.height);
    previous.x = Math.min(previous.x, rect.x);
    previous.y = Math.min(previous.y, rect.y);
    previous.width = right - previous.x;
    previous.height = bottom - previous.y;
  });
  return merged;
}

const ignoredPageWords = new Set(["the", "and", "for", "with", "from", "that", "this", "shall", "hereof", "thereof"]);

function pageSimilarity(original: PdfPageText, revised: PdfPageText, originalTokens: WordToken[], revisedTokens: WordToken[]) {
  const bodyWords = (page: PdfPageText, tokens: WordToken[]) => new Set(tokens
    .filter((token) => token.rect.y >= page.height * 0.08 && token.rect.y <= page.height * 0.92)
    .map((token) => token.key.toLocaleLowerCase())
    .filter((word) => word.length > 2 && word !== "_" && !ignoredPageWords.has(word)));
  const left = bodyWords(original, originalTokens);
  const right = bodyWords(revised, revisedTokens);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach((word) => { if (right.has(word)) shared += 1; });
  return 2 * shared / (left.size + right.size);
}

type PageAlignment = { original?: PdfPageText; revised?: PdfPageText };

function alignPages(originalPages: PdfPageText[], revisedPages: PdfPageText[], tokensByOriginal: Map<number, WordToken[]>, tokensByRevised: Map<number, WordToken[]>): PageAlignment[] {
  const gapPenalty = -0.25;
  const scores = Array.from({ length: originalPages.length + 1 }, () => new Float64Array(revisedPages.length + 1));
  const steps = Array.from({ length: originalPages.length + 1 }, () => new Uint8Array(revisedPages.length + 1));
  for (let i = 1; i <= originalPages.length; i += 1) { scores[i][0] = scores[i - 1][0] + gapPenalty; steps[i][0] = 1; }
  for (let j = 1; j <= revisedPages.length; j += 1) { scores[0][j] = scores[0][j - 1] + gapPenalty; steps[0][j] = 2; }

  for (let i = 1; i <= originalPages.length; i += 1) {
    for (let j = 1; j <= revisedPages.length; j += 1) {
      const original = originalPages[i - 1];
      const revised = revisedPages[j - 1];
      const similarity = pageSimilarity(original, revised, tokensByOriginal.get(original.pageNumber) || [], tokensByRevised.get(revised.pageNumber) || []);
      const match = similarity >= 0.28 ? scores[i - 1][j - 1] + 2 * similarity - 1 : Number.NEGATIVE_INFINITY;
      const skipOriginal = scores[i - 1][j] + gapPenalty;
      const skipRevised = scores[i][j - 1] + gapPenalty;
      if (match >= skipOriginal && match >= skipRevised) { scores[i][j] = match; steps[i][j] = 3; }
      else if (skipOriginal >= skipRevised) { scores[i][j] = skipOriginal; steps[i][j] = 1; }
      else { scores[i][j] = skipRevised; steps[i][j] = 2; }
    }
  }

  const alignment: PageAlignment[] = [];
  let i = originalPages.length;
  let j = revisedPages.length;
  while (i > 0 || j > 0) {
    const step = steps[i][j];
    if (step === 3) { alignment.push({ original: originalPages[--i], revised: revisedPages[--j] }); }
    else if (step === 1) alignment.push({ original: originalPages[--i] });
    else alignment.push({ revised: revisedPages[--j] });
  }
  return alignment.reverse();
}

function lcs(left: WordToken[], right: WordToken[]) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const lengths = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = left[i].key === right[j].key
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  return lengths;
}

function comparePage(original: PdfPageText, revised: PdfPageText, changes: PdfPageChange[], oldTokens: WordToken[], newTokens: WordToken[]) {
  if (!oldTokens.length || !newTokens.length) return;

  // ponytail: bound the LCS matrix for unusually long pages; compare only the unmatched middle.
  const tooLarge = oldTokens.length * newTokens.length > 1_500_000;
  const lengths = tooLarge ? null : lcs(oldTokens, newTokens);
  let i = 0;
  let j = 0;
  let removed: WordToken[] = [];
  let added: WordToken[] = [];
  let group = 0;
  const flush = () => {
    if (!removed.length && !added.length) return;
    if (![...removed, ...added].some((token) => !/^_[.,;:!?)]*$/u.test(token.key))) {
      removed = [];
      added = [];
      return;
    }
    changes.push({
      id: `pdf-page-${original.pageNumber}-change-${group++}`,
      originalPageNumber: original.pageNumber,
      revisedPageNumber: revised.pageNumber,
      kind: removed.length && added.length ? "changed" : removed.length ? "removed" : "added",
      originalText: removed.map((token) => token.text).join(" "),
      revisedText: added.map((token) => token.text).join(" "),
      originalRects: mergeRects(removed.map((token) => token.rect)),
      revisedRects: mergeRects(added.map((token) => token.rect)),
    });
    removed = [];
    added = [];
  };

  if (tooLarge) {
    while (i < oldTokens.length && i < newTokens.length && oldTokens[i].key === newTokens[i].key) i += 1;
    let oldEnd = oldTokens.length;
    let newEnd = newTokens.length;
    while (oldEnd > i && newEnd > i && oldTokens[oldEnd - 1].key === newTokens[newEnd - 1].key) { oldEnd -= 1; newEnd -= 1; }
    removed = oldTokens.slice(i, oldEnd);
    added = newTokens.slice(i, newEnd);
    flush();
    return;
  }

  while (i < oldTokens.length || j < newTokens.length) {
    if (i < oldTokens.length && j < newTokens.length && oldTokens[i].key === newTokens[j].key) {
      flush();
      i += 1;
      j += 1;
    } else if (i < oldTokens.length && (j === newTokens.length || lengths![i + 1][j] >= lengths![i][j + 1])) {
      removed.push(oldTokens[i++]);
    } else {
      added.push(newTokens[j++]);
    }
  }
  flush();
}

function wholePageChange(page: PdfPageText, kind: "added" | "removed"): PdfPageChange {
  const tokens = pageTokens(page);
  return {
    id: `pdf-page-${page.pageNumber}-${kind}`,
    originalPageNumber: kind === "removed" ? page.pageNumber : null,
    revisedPageNumber: kind === "added" ? page.pageNumber : null,
    kind,
    originalText: kind === "removed" ? tokens.map((token) => token.text).join(" ") : "",
    revisedText: kind === "added" ? tokens.map((token) => token.text).join(" ") : "",
    originalRects: kind === "removed" ? mergeRects(tokens.map((token) => token.rect)) : [],
    revisedRects: kind === "added" ? mergeRects(tokens.map((token) => token.rect)) : [],
  };
}

export function comparePdfPages(originalPages: PdfPageText[], revisedPages: PdfPageText[]): PdfComparisonResult {
  const scannedPages = { original: [] as number[], revised: [] as number[] };
  const changes: PdfPageChange[] = [];
  const tokensByOriginal = new Map(originalPages.map((page) => [page.pageNumber, pageTokens(page)]));
  const tokensByRevised = new Map(revisedPages.map((page) => [page.pageNumber, pageTokens(page)]));
  originalPages.forEach((page) => { if (!tokensByOriginal.get(page.pageNumber)?.length) scannedPages.original.push(page.pageNumber); });
  revisedPages.forEach((page) => { if (!tokensByRevised.get(page.pageNumber)?.length) scannedPages.revised.push(page.pageNumber); });

  for (const { original, revised } of alignPages(originalPages, revisedPages, tokensByOriginal, tokensByRevised)) {
    if (original && revised) {
      const oldTokens = tokensByOriginal.get(original.pageNumber) || [];
      const newTokens = tokensByRevised.get(revised.pageNumber) || [];
      if (oldTokens.length && newTokens.length) comparePage(original, revised, changes, oldTokens, newTokens);
      continue;
    }
    const page = original || revised;
    if (!page) continue;
    const tokens = (original ? tokensByOriginal : tokensByRevised).get(page.pageNumber) || [];
    if (tokens.length) changes.push(wholePageChange(page, original ? "removed" : "added"));
  }

  return { changes, scannedPages };
}
