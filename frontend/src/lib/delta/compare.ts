import JSZip from "jszip";

export interface DeltaComment {
  author: string;
  text: string;
}

export interface DeltaSection {
  number: string;
  heading: string;
  text: string;
  comments: DeltaComment[];
}

export interface DeltaEntry {
  id: string;
  section: string;
  originalSection: string;
  revisedSection: string;
  comments: DeltaComment[];
  originalText: string;
  revisedText: string;
  summary: string;
  explanation?: string;
  approval?: "approved";
  amendment?: {
    comment?: string;
    wording?: string;
  };
}

export function assertWordArchiveWithinLimits(files: Record<string, unknown>) {
  const entries = Object.values(files);
  if (entries.length > 10_000) throw new Error("DOCX contains too many archive entries.");
  const expandedBytes = entries.reduce<number>((total, entry) => total + (((entry as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize) || 0), 0);
  if (expandedBytes > 100 * 1024 * 1024) throw new Error("DOCX expanded content exceeds the 100 MiB safety limit.");
}

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function paragraphText(element: Element) {
  return Array.from(element.getElementsByTagNameNS(WORD_NS, "t"))
    .map((node) => node.textContent || "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function getAttribute(element: Element, name: string) {
  return element.getAttributeNS(WORD_NS, name) || element.getAttribute(`w:${name}`) || "";
}

function parseComments(xml: string | undefined) {
  const comments = new Map<string, DeltaComment>();
  if (!xml || typeof DOMParser === "undefined") return comments;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  Array.from(doc.getElementsByTagNameNS(WORD_NS, "comment")).forEach((comment) => {
    const id = getAttribute(comment, "id");
    if (!id) return;
    const text = Array.from(comment.getElementsByTagNameNS(WORD_NS, "t"))
      .map((node) => node.textContent || "")
      .join("")
      .trim();
    if (text) comments.set(id, { author: getAttribute(comment, "author") || "Word comment", text });
  });
  return comments;
}

function headingParts(value: string, style: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const numbered = normalized.match(/^(?:(?:section|article|clause|schedule|annex|appendix)\s+)?((?:\d+\.)*\d+[A-Z]?|[IVXLCDM]+)(?:[.)\s]+)(.+)$/i);
  if (numbered) return { number: numbered[1].replace(/\.$/, ""), heading: numbered[2].trim() };
  if (/^(title|heading\s*[1-6])$/i.test(style)) return { number: "", heading: normalized };
  return null;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/^(?:(?:section|article|clause|schedule|annex|appendix)\s+)?(?:\d+\.)*\d+[a-z]?[.)\s]+/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function splitSections(paragraphs: Array<{ text: string; style: string; comments: DeltaComment[] }>): DeltaSection[] {
  const headingIndexes = paragraphs.map((paragraph, index) => headingParts(paragraph.text, paragraph.style) ? index : -1).filter((index) => index >= 0);
  if (!headingIndexes.length) {
    const text = paragraphs.map((paragraph) => paragraph.text).filter(Boolean);
    return text.length ? [{ number: "", heading: "Document", text: text.join("\n\n"), comments: paragraphs.flatMap((paragraph) => paragraph.comments) }] : [];
  }

  const sections: DeltaSection[] = [];
  let current: DeltaSection | null = null;
  let preamble: string[] = [];
  paragraphs.forEach((paragraph) => {
    const heading = headingParts(paragraph.text, paragraph.style);
    if (heading) {
      if (current) sections.push(current);
      if (preamble.length) {
        sections.push({ number: "", heading: "Introduction", text: preamble.join("\n\n"), comments: [] });
        preamble = [];
      }
      current = { ...heading, text: "", comments: [...paragraph.comments] };
      return;
    }
    if (current) {
      current.text = [current.text, paragraph.text].filter(Boolean).join("\n\n");
      current.comments.push(...paragraph.comments);
    } else if (paragraph.text) {
      preamble.push(paragraph.text);
    }
  });
  if (current) sections.push(current);
  if (preamble.length) sections.unshift({ number: "", heading: "Introduction", text: preamble.join("\n\n"), comments: [] });
  return sections;
}

export async function readWordSections(file: File): Promise<DeltaSection[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MiB file limit.`);
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  assertWordArchiveWithinLimits(zip.files);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) throw new Error(`${file.name} does not contain a readable Word document.`);
  const commentsXml = await zip.file("word/comments.xml")?.async("text");
  const commentMap = parseComments(commentsXml);
  const doc = new DOMParser().parseFromString(documentXml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error(`${file.name} has invalid Word document data.`);
  const paragraphs = Array.from(doc.getElementsByTagNameNS(WORD_NS, "p")).map((paragraph) => {
    const styleNode = paragraph.getElementsByTagNameNS(WORD_NS, "pStyle")[0];
    const style = styleNode ? getAttribute(styleNode, "val") : "";
    const commentIds = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, "commentReference"))
      .map((reference) => getAttribute(reference, "id"));
    return {
      text: paragraphText(paragraph),
      style,
      comments: commentIds.map((id) => commentMap.get(id)).filter((value): value is DeltaComment => Boolean(value)),
    };
  });
  const sections = splitSections(paragraphs);
  if (sections.reduce((total, section) => total + section.heading.length + section.text.length, 0) > 500_000) throw new Error(`${file.name} exceeds the 500,000 extracted character limit.`);
  return sections;
}

function wordSet(value: string) {
  return new Set(normalize(value).split(" ").filter((word) => word.length > 2));
}

function similarity(left: string, right: string) {
  const a = wordSet(left);
  const b = wordSet(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  a.forEach((word) => { if (b.has(word)) overlap += 1; });
  return overlap / (a.size + b.size - overlap);
}

function cleanNumber(value: string, index: number) {
  return value || String(index + 1);
}

export function compareSections(original: DeltaSection[], revised: DeltaSection[]): DeltaEntry[] {
  const usedOriginal = new Set<number>();
  const entries: DeltaEntry[] = [];
  revised.forEach((next, nextIndex) => {
    const nextKey = normalize(next.heading);
    let matchIndex = original.findIndex((previous, index) => !usedOriginal.has(index) && normalize(previous.heading) === nextKey && nextKey.length > 0);
    if (matchIndex < 0) {
      let bestScore = 0;
      original.forEach((previous, index) => {
        if (usedOriginal.has(index)) return;
        const headingScore = similarity(previous.heading, next.heading);
        const bodyScore = similarity(previous.text, next.text);
        const score = Math.max(headingScore, bodyScore * 0.86);
        if (score > bestScore) { bestScore = score; matchIndex = index; }
      });
      if (bestScore < 0.24) matchIndex = -1;
    }

    const previous = matchIndex >= 0 ? original[matchIndex] : null;
    if (matchIndex >= 0) usedOriginal.add(matchIndex);
    const originalNumber = previous ? cleanNumber(previous.number, matchIndex) : "";
    const revisedNumber = cleanNumber(next.number, nextIndex);
    const originalText = previous ? [previous.heading, previous.text].filter(Boolean).join("\n\n") : "";
    const revisedText = [next.heading, next.text].filter(Boolean).join("\n\n");
    const renumbered = Boolean(previous && originalNumber !== revisedNumber);
    const wordingChanged = Boolean(previous && originalText !== revisedText);
    const comments = [...(previous?.comments || []), ...next.comments];
    if (previous && !renumbered && !wordingChanged && !comments.length) return;
    const changeText = !previous ? "New section added" : !next ? "Section removed" : wordingChanged ? "Wording revised" : "Section renumbered";
    const section = renumbered ? `${originalNumber} → ${revisedNumber}` : revisedNumber;
    const summary = previous
      ? [wordingChanged ? "Wording revised" : "Wording unchanged", renumbered ? `renumbered ${originalNumber} to ${revisedNumber}` : ""].filter(Boolean).join("; ")
      : changeText;
    entries.push({
      id: `delta-${nextIndex}-${matchIndex}`,
      section,
      originalSection: previous ? `${originalNumber}${previous.heading ? ` ${previous.heading}` : ""}` : "Not present",
      revisedSection: `${revisedNumber}${next.heading ? ` ${next.heading}` : ""}`,
      comments,
      originalText,
      revisedText,
      summary,
    });
  });
  original.forEach((previous, index) => {
    if (usedOriginal.has(index)) return;
    const number = cleanNumber(previous.number, index);
    entries.push({
      id: `delta-removed-${index}`,
      section: number,
      originalSection: `${number}${previous.heading ? ` ${previous.heading}` : ""}`,
      revisedSection: "Removed",
      comments: previous.comments,
      originalText: [previous.heading, previous.text].filter(Boolean).join("\n\n"),
      revisedText: "",
      summary: "Section removed",
    });
  });
  return entries;
}
