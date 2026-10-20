import { describe, expect, it } from "vitest";
import { comparePdfPages, type PdfPageText } from "./pdfCompare";

const page = (pageNumber: number, text: string, x = 18): PdfPageText => ({
  pageNumber,
  width: 612,
  height: 792,
  spans: text ? [{ text, x, y: 120, width: text.length * 5, height: 10 }] : [],
});

describe("comparePdfPages", () => {
  it("reports changed wording with source page numbers and locations", () => {
    const result = comparePdfPages(
      [page(3, "Payment is due within thirty days.")],
      [page(3, "Payment is due within forty five days.", 22)],
    );

    expect(result.changes).toEqual([
      expect.objectContaining({
        originalPageNumber: 3,
        revisedPageNumber: 3,
        originalText: "thirty",
        revisedText: "forty five",
        originalRects: [expect.objectContaining({ x: 128, y: 120 })],
        revisedRects: [expect.objectContaining({ x: 132, y: 120 })],
      }),
    ]);
    expect(result.scannedPages).toEqual({ original: [], revised: [] });
  });

  it("reports pages added to the revised PDF", () => {
    const result = comparePdfPages([page(1, "Existing clause.")], [page(1, "Existing clause."), page(2, "New appendix.")]);

    expect(result.changes).toEqual([
      expect.objectContaining({ revisedPageNumber: 2, kind: "added", originalText: "", revisedText: "New appendix.", revisedRects: [expect.any(Object)] }),
    ]);
    expect(result.changes[0].revisedRects).toHaveLength(1);
  });

  it("marks pages without selectable text as scan pages rather than claiming they match", () => {
    const result = comparePdfPages([page(1, "")], [page(1, "")]);

    expect(result.changes).toEqual([]);
    expect(result.scannedPages).toEqual({ original: [1], revised: [1] });
  });

  it("does not report unchanged text as a difference", () => {
    const result = comparePdfPages([page(1, "Terms remain the same.")], [page(1, "Terms remain the same.")]);

    expect(result.changes).toEqual([]);
  });

  it("aligns corresponding pages when added content pushes unchanged clauses onto later pages", () => {
    const result = comparePdfPages(
      [page(1, "Start of agreement."), page(2, "Payment remains due within thirty days.")],
      [page(1, "New permit clause."), page(2, "Start of agreement."), page(3, "Payment remains due within thirty days.")],
    );

    expect(result.changes).toEqual([
      expect.objectContaining({
        kind: "added",
        originalPageNumber: null,
        revisedPageNumber: 1,
        revisedText: "New permit clause.",
      }),
    ]);
  });

  it("ignores different underscore lengths used for fill-in blanks", () => {
    const result = comparePdfPages(
      [page(1, "Signed by ____________________ on __________.")],
      [page(1, "Signed by ______________________________ on ______________.")],
    );

    expect(result.changes).toEqual([]);
  });

  it("does not flag a fill-in underline when the other PDF renders that blank as empty", () => {
    const result = comparePdfPages(
      [page(1, "Signed by ____________________ on file.")],
      [page(1, "Signed by on file.")],
    );

    expect(result.changes).toEqual([]);
  });

  it("normalizes non-breaking spaces without reporting text changes", () => {
    const original = page(1, "The Lease Agreement.");
    const revised = page(1, "The Lease\u00a0Agreement.");

    expect(comparePdfPages([original], [revised]).changes).toEqual([]);
  });

  it("does not flag changing page counters in the repeated page footer", () => {
    const makePage = (total: string): PdfPageText => ({
      pageNumber: 1,
      width: 612,
      height: 792,
      spans: [
        { text: "Terms remain unchanged.", x: 18, y: 120, width: 110, height: 10 },
        { text: `Page 1 of ${total}`, x: 18, y: 770, width: 50, height: 10 },
      ],
    });
    const result = comparePdfPages([makePage("13")], [makePage("21")]);

    expect(result.changes).toEqual([]);
  });

  it("merges adjacent changed-word rectangles into a phrase highlight", () => {
    const result = comparePdfPages(
      [page(1, "Payment is due in thirty days.")],
      [page(1, "Payment is due in forty five days.")],
    );

    expect(result.changes[0].revisedRects).toHaveLength(1);
  });

  it("uses PDF font-measured word rectangles instead of equal character widths", () => {
    const original: PdfPageText = {
      pageNumber: 1,
      width: 100,
      height: 100,
      spans: [{ text: "Wide i", x: 10, y: 20, width: 40, height: 10, wordRects: [
        { start: 0, end: 4, x: 10, width: 32 },
        { start: 5, end: 6, x: 45, width: 5 },
      ] }],
    };
    const revised: PdfPageText = {
      ...original,
      spans: [{ text: "Wide m", x: 10, y: 20, width: 40, height: 10, wordRects: [
        { start: 0, end: 4, x: 10, width: 32 },
        { start: 5, end: 6, x: 38, width: 12 },
      ] }],
    };

    const result = comparePdfPages([original], [revised]);

    expect(result.changes[0].originalRects).toEqual([{ x: 45, y: 20, width: 5, height: 10 }]);
    expect(result.changes[0].revisedRects).toEqual([{ x: 38, y: 20, width: 12, height: 10 }]);
  });
});
