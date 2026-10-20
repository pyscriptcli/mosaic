import { describe, expect, it } from "vitest";
import { groupPdfChanges } from "./changeGroups";
import { groupDeltaEntries } from "./changeGroups";
import type { DeltaEntry } from "./compare";
import type { PdfPageText } from "./pdfCompare";

const page = (pageNumber: number, spans: PdfPageText["spans"]): PdfPageText => ({ pageNumber, width: 612, height: 792, spans });
const entry = (id: string, section: string, originalSection = section, revisedSection = section): DeltaEntry => ({
  id, section, originalSection, revisedSection, comments: [], originalText: "Earlier wording", revisedText: "Later wording", summary: "Wording revised",
});

describe("groupPdfChanges", () => {
  it("groups edits beneath their nearest contract section heading", () => {
    const originalPages = [page(1, [
      { text: "ARTICLE II. TERM", x: 30, y: 40, width: 100, height: 12 },
      { text: "Section 2.3. Pre-Termination", x: 30, y: 120, width: 160, height: 12 },
      { text: "shall pay thirty days", x: 30, y: 140, width: 120, height: 12 },
      { text: "Section 2.4. Renewal", x: 30, y: 220, width: 120, height: 12 },
      { text: "renewal term five years", x: 30, y: 240, width: 130, height: 12 },
    ])];
    const revisedPages = [page(1, [
      { text: "ARTICLE II. TERM", x: 30, y: 40, width: 100, height: 12 },
      { text: "Section 2.3. Pre-Termination", x: 30, y: 120, width: 160, height: 12 },
      { text: "shall pay forty days", x: 30, y: 140, width: 120, height: 12 },
      { text: "Section 2.4. Renewal", x: 30, y: 220, width: 120, height: 12 },
      { text: "renewal term ten years", x: 30, y: 240, width: 130, height: 12 },
    ])];
    const changes = [
      { id: "change-a", originalPageNumber: 1, revisedPageNumber: 1, kind: "changed" as const, originalText: "thirty", revisedText: "forty", originalRects: [{ x: 90, y: 140, width: 30, height: 12 }], revisedRects: [{ x: 90, y: 140, width: 25, height: 12 }], originalAnchors: [], revisedAnchors: [] },
      { id: "change-b", originalPageNumber: 1, revisedPageNumber: 1, kind: "changed" as const, originalText: "five", revisedText: "ten", originalRects: [{ x: 120, y: 240, width: 20, height: 12 }], revisedRects: [{ x: 120, y: 240, width: 15, height: 12 }], originalAnchors: [], revisedAnchors: [] },
    ];

    expect(groupPdfChanges(changes, originalPages, revisedPages).map(({ label, changes: grouped }) => [label, grouped.map(({ id }) => id)])).toEqual([
      ["Section 2.3. Pre-Termination", ["change-a"]],
      ["Section 2.4. Renewal", ["change-b"]],
    ]);
  });

  it("keeps unanchored changes traceable with a page fallback", () => {
    const changes = [{ id: "change-a", originalPageNumber: 2, revisedPageNumber: 3, kind: "added" as const, originalText: "", revisedText: "New clause", originalRects: [], revisedRects: [{ x: 20, y: 50, width: 40, height: 12 }], originalAnchors: [], revisedAnchors: [] }];

    expect(groupPdfChanges(changes, [], []).map(({ label }) => label)).toEqual(["Page 3"]);
  });
});

describe("groupDeltaEntries", () => {
  it("groups text edits that share an explicit section label", () => {
    expect(groupDeltaEntries([
      entry("one", "Section 2.3. Term", "Section 2.3. Term", "Section 2.3. Term"),
      entry("two", "Section 2.3. Term", "Section 2.3. Term", "Section 2.3. Term"),
      entry("three", "Section 2.4. Renewal", "Section 2.4. Renewal", "Section 2.4. Renewal"),
    ]).map(({ label, entries }) => [label, entries.map(({ id }) => id)])).toEqual([
      ["Section 2.3. Term", ["one", "two"]],
      ["Section 2.4. Renewal", ["three"]],
    ]);
  });
});
