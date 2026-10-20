import type { DeltaEntry, DeltaSection } from "./compare";
import { readTextSections } from "./textDocument";

function entry(index: number, original?: DeltaSection, revised?: DeltaSection): DeltaEntry {
  const originalText = original?.text || "";
  const revisedText = revised?.text || "";
  const section = revised?.heading || original?.heading || `Paragraph ${index + 1}`;
  return {
    id: `text-${index}`,
    section,
    originalSection: original ? original.heading : "Not present",
    revisedSection: revised ? revised.heading : "Not present",
    comments: [], originalText, revisedText,
    summary: originalText && revisedText ? "Wording revised" : originalText ? "Text removed" : "Text added",
  };
}

export function compareTextDocuments(earlier: string, later: string): DeltaEntry[] {
  const left = readTextSections(earlier);
  const right = readTextSections(later);
  if (left.length * right.length > 150_000) return [entry(0, { number: "1", heading: "Document", text: earlier, comments: [] }, { number: "1", heading: "Document", text: later, comments: [] })];

  const lengths = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = left[i].text === right[j].text ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const changes: DeltaEntry[] = [];
  let i = 0;
  let j = 0;
  let removed: DeltaSection[] = [];
  let added: DeltaSection[] = [];
  const flush = () => {
    const pairs = Math.max(removed.length, added.length);
    for (let offset = 0; offset < pairs; offset += 1) changes.push(entry(changes.length, removed[offset], added[offset]));
    removed = [];
    added = [];
  };
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i].text === right[j].text) {
      flush(); i += 1; j += 1;
    } else if (i < left.length && (j === right.length || lengths[i + 1][j] >= lengths[i][j + 1])) removed.push(left[i++]);
    else added.push(right[j++]);
  }
  flush();
  return changes;
}
