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
        pageNumber: 3,
        originalText: "thirty",
        revisedText: "forty five",
        originalRects: [expect.objectContaining({ x: 128, y: 120 })],
        revisedRects: [expect.objectContaining({ x: 132, y: 120 }), expect.objectContaining({ x: 162, y: 120 })],
      }),
    ]);
    expect(result.scannedPages).toEqual({ original: [], revised: [] });
  });

  it("reports pages added to the revised PDF", () => {
    const result = comparePdfPages([page(1, "Existing clause.")], [page(1, "Existing clause."), page(2, "New appendix.")]);

    expect(result.changes).toEqual([
      expect.objectContaining({ pageNumber: 2, kind: "added", originalText: "", revisedText: "New appendix." }),
    ]);
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
});
