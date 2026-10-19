export interface PdfTextSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
  pageNumber: number;
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
  rect: PdfTextRect;
}

function pageTokens(page: PdfPageText): WordToken[] {
  return page.spans.flatMap((span) => {
    const matches = Array.from(span.text.matchAll(/\S+/gu));
    return matches.map((match) => {
      const start = match.index || 0;
      const length = match[0].length;
      const scale = span.text.length ? span.width / span.text.length : 0;
      return {
        text: match[0],
        rect: { x: span.x + start * scale, y: span.y, width: length * scale, height: span.height },
      };
    });
  });
}

function lcs(left: WordToken[], right: WordToken[]) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const lengths = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = left[i].text === right[j].text
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  return lengths;
}

function comparePage(original: PdfPageText, revised: PdfPageText, changes: PdfPageChange[]) {
  const oldTokens = pageTokens(original);
  const newTokens = pageTokens(revised);
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
    changes.push({
      id: `pdf-page-${original.pageNumber}-change-${group++}`,
      pageNumber: original.pageNumber,
      kind: removed.length && added.length ? "changed" : removed.length ? "removed" : "added",
      originalText: removed.map((token) => token.text).join(" "),
      revisedText: added.map((token) => token.text).join(" "),
      originalRects: removed.map((token) => token.rect),
      revisedRects: added.map((token) => token.rect),
    });
    removed = [];
    added = [];
  };

  if (tooLarge) {
    while (i < oldTokens.length && i < newTokens.length && oldTokens[i].text === newTokens[i].text) i += 1;
    let oldEnd = oldTokens.length;
    let newEnd = newTokens.length;
    while (oldEnd > i && newEnd > i && oldTokens[oldEnd - 1].text === newTokens[newEnd - 1].text) { oldEnd -= 1; newEnd -= 1; }
    removed = oldTokens.slice(i, oldEnd);
    added = newTokens.slice(i, newEnd);
    flush();
    return;
  }

  while (i < oldTokens.length || j < newTokens.length) {
    if (i < oldTokens.length && j < newTokens.length && oldTokens[i].text === newTokens[j].text) {
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
    pageNumber: page.pageNumber,
    kind,
    originalText: kind === "removed" ? tokens.map((token) => token.text).join(" ") : "",
    revisedText: kind === "added" ? tokens.map((token) => token.text).join(" ") : "",
    originalRects: kind === "removed" ? tokens.map((token) => token.rect) : [],
    revisedRects: kind === "added" ? tokens.map((token) => token.rect) : [],
  };
}

export function comparePdfPages(originalPages: PdfPageText[], revisedPages: PdfPageText[]): PdfComparisonResult {
  const scannedPages = { original: [] as number[], revised: [] as number[] };
  const originalByPage = new Map(originalPages.map((page) => [page.pageNumber, page]));
  const revisedByPage = new Map(revisedPages.map((page) => [page.pageNumber, page]));
  const pageNumbers = [...new Set([...originalByPage.keys(), ...revisedByPage.keys()])].sort((a, b) => a - b);
  const changes: PdfPageChange[] = [];

  for (const pageNumber of pageNumbers) {
    const original = originalByPage.get(pageNumber);
    const revised = revisedByPage.get(pageNumber);
    const oldHasText = Boolean(original && pageTokens(original).length);
    const newHasText = Boolean(revised && pageTokens(revised).length);
    if (original && !oldHasText) scannedPages.original.push(pageNumber);
    if (revised && !newHasText) scannedPages.revised.push(pageNumber);
    if (!original || !revised) {
      const page = original || revised;
      if (page && pageTokens(page).length) changes.push(wholePageChange(page, original ? "removed" : "added"));
      continue;
    }
    // A page with no text may be a scan or a blank page; never label its contents as deleted/added text.
    if (!oldHasText || !newHasText) continue;
    comparePage(original, revised, changes);
  }

  return { changes, scannedPages };
}
