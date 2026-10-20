import type { PdfPageChange, PdfPageText } from "./pdfCompare";
import type { DeltaEntry } from "./compare";

export type PdfChangeGroup = { id: string; label: string; changes: PdfPageChange[] };
export type DeltaChangeGroup = { id: string; label: string; entries: DeltaEntry[] };

function excerpt(text: string) {
  const compact = text.replace(/\s+/gu, " ").trim();
  return compact.length > 56 ? `${compact.slice(0, 56).trimEnd()}…` : compact;
}

export function deltaEntryPreview(entry: DeltaEntry) {
  if (entry.originalText && entry.revisedText) return `Earlier: ${excerpt(entry.originalText)} · Later: ${excerpt(entry.revisedText)}`;
  return entry.originalText ? `Removed: ${excerpt(entry.originalText)}` : `Added: ${excerpt(entry.revisedText)}`;
}

export function groupDeltaEntries(entries: DeltaEntry[]): DeltaChangeGroup[] {
  const groups = new Map<string, DeltaChangeGroup>();
  entries.forEach((entry) => {
    const key = entry.section || entry.revisedSection || entry.originalSection || `Change ${groups.size + 1}`;
    const label = entry.revisedSection !== "Not present" ? entry.revisedSection : entry.originalSection;
    const group = groups.get(key) || { id: key, label, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  });
  return [...groups.values()];
}

type TextLine = { y: number; text: string };

function pageLines(page: PdfPageText): TextLine[] {
  const lines: Array<{ y: number; height: number; spans: PdfPageText["spans"] }> = [];
  [...page.spans].sort((left, right) => left.y - right.y || left.x - right.x).forEach((span) => {
    const line = lines.find((candidate) => Math.abs(candidate.y - span.y) <= Math.max(2, Math.min(candidate.height, span.height) * 0.45));
    if (line) {
      line.spans.push(span);
      line.y = Math.min(line.y, span.y);
      line.height = Math.max(line.height, span.height);
    } else lines.push({ y: span.y, height: span.height, spans: [span] });
  });
  return lines.map((line) => ({ y: line.y, text: line.spans.sort((left, right) => left.x - right.x).map(({ text }) => text.trim()).filter(Boolean).join(" ") }));
}

function sectionHeading(text: string) {
  const heading = text.trim().replace(/\s+/gu, " ");
  const match = heading.match(/^(article|section|clause|schedule|annex|appendix)\s+([ivxlcdm]+|\d+(?:\.\d+)*[a-z]?)(?:[.)]?)/iu);
  if (!match) return null;
  const remainder = heading.slice(match[0].length).trim().replace(/^[.)]\s*/u, "");
  const title = remainder.split(/(?<=[.!?])\s+/u)[0]?.replace(/[.!?]+$/u, "").trim();
  return `${match[1]} ${match[2]}${title ? `. ${title}` : ""}`;
}

type SectionLookup = { pages: Map<number, TextLine[]>; preceding: Map<number, string | null> };

function createSectionLookup(pages: PdfPageText[]): SectionLookup {
  const linesByPage = new Map<number, TextLine[]>();
  const preceding = new Map<number, string | null>();
  let current: string | null = null;
  [...pages].sort((left, right) => left.pageNumber - right.pageNumber).forEach((page) => {
    const lines = pageLines(page);
    preceding.set(page.pageNumber, current);
    linesByPage.set(page.pageNumber, lines);
    lines.forEach((line) => { current = sectionHeading(line.text) || current; });
  });
  return { pages: linesByPage, preceding };
}

function sectionAt(lookup: SectionLookup, pageNumber: number | null, y: number) {
  if (!pageNumber) return null;
  let current = lookup.preceding.get(pageNumber) || null;
  for (const line of lookup.pages.get(pageNumber) || []) {
    if (line.y > y) break;
    current = sectionHeading(line.text) || current;
  }
  return current;
}

export function groupPdfChanges(changes: PdfPageChange[], originalPages: PdfPageText[], revisedPages: PdfPageText[]): PdfChangeGroup[] {
  const groups = new Map<string, PdfChangeGroup>();
  const originalSections = createSectionLookup(originalPages);
  const revisedSections = createSectionLookup(revisedPages);
  changes.forEach((change) => {
    const originalY = change.originalRects[0]?.y ?? Number.POSITIVE_INFINITY;
    const revisedY = change.revisedRects[0]?.y ?? Number.POSITIVE_INFINITY;
    const label = sectionAt(revisedSections, change.revisedPageNumber, revisedY)
      || sectionAt(originalSections, change.originalPageNumber, originalY)
      || `Page ${change.revisedPageNumber ?? change.originalPageNumber ?? "unknown"}`;
    const group = groups.get(label) || { id: label, label, changes: [] };
    group.changes.push(change);
    groups.set(label, group);
  });
  return [...groups.values()];
}
