import type { DeltaEntry } from "./compare";
import { readTextSections } from "./textDocument";

function entry(index: number, originalText: string, revisedText: string): DeltaEntry {
  return {
    id: `text-${index}`,
    section: `Paragraph ${index + 1}`,
    originalSection: originalText ? `Paragraph ${index + 1}` : "Not present",
    revisedSection: revisedText ? `Paragraph ${index + 1}` : "Not present",
    comments: [], originalText, revisedText,
    summary: originalText && revisedText ? "Wording revised" : originalText ? "Text removed" : "Text added",
  };
}

export function compareTextDocuments(earlier: string, later: string): DeltaEntry[] {
  const left = readTextSections(earlier).map((section) => section.text);
  const right = readTextSections(later).map((section) => section.text);
  if (left.length * right.length > 150_000) return [entry(0, earlier, later)];

  const lengths = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = left[i] === right[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const changes: DeltaEntry[] = [];
  let i = 0;
  let j = 0;
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    const pairs = Math.max(removed.length, added.length);
    for (let offset = 0; offset < pairs; offset += 1) changes.push(entry(changes.length, removed[offset] || "", added[offset] || ""));
    removed = [];
    added = [];
  };
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      flush(); i += 1; j += 1;
    } else if (i < left.length && (j === right.length || lengths[i + 1][j] >= lengths[i][j + 1])) removed.push(left[i++]);
    else added.push(right[j++]);
  }
  flush();
  return changes;
}
