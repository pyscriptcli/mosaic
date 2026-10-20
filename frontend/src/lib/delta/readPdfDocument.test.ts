import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDocumentMock, pdfDocumentMock, pageMock, loadingTaskMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  loadingTaskMock: { destroy: vi.fn() },
  pdfDocumentMock: {
    numPages: 1,
    getPage: vi.fn(),
  },
  pageMock: {
    getViewport: vi.fn(() => ({
      width: 612,
      height: 792,
      convertToViewportPoint: (x: number, y: number) => [x, 792 - y],
    })),
    getTextContent: vi.fn(async () => ({ items: [{ str: "Payment", dir: "ltr", transform: [1, 0, 0, 1, 10, 700], width: 42, height: 12, fontName: "custom-font" }], styles: { "custom-font": { fontFamily: "sans-serif" } } })),
    cleanup: vi.fn(),
  },
}));

vi.mock("pdfjs-dist", () => ({
  version: "test-version",
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: getDocumentMock,
}));

import { measureWordRects, readPdfDocument } from "./readPdfDocument";

describe("readPdfDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfDocumentMock.getPage.mockResolvedValue(pageMock);
    getDocumentMock.mockReturnValue({ ...loadingTaskMock, promise: Promise.resolve(pdfDocumentMock) });
  });

  it("positions words using measured glyph widths for proportional fonts", () => {
    const rects = measureWordRects("Wide i", 10, 44, (text) => Array.from(text).reduce((width, character) => width + (character === "W" ? 4 : character === " " ? 1 : character === "i" ? 1 : 2), 0));

    expect(rects).toEqual([
      { start: 0, end: 4, x: 10, width: 36 },
      { start: 5, end: 6, x: 50, width: 4 },
    ]);
  });

  it("stores measured word positions from PDF font styles", async () => {
    const measuredWidths: Record<string, number> = { W: 4, i: 1, d: 2, e: 2, " ": 1 };
    const measureText = vi.fn((text: string) => ({ width: Array.from(text).reduce((sum, character) => sum + (measuredWidths[character] ?? 2), 0) }));
    class MockOffscreenCanvas {
      getContext() { return { font: "", measureText }; }
    }
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);
    pageMock.getTextContent.mockResolvedValueOnce({
      items: [{ str: "Wide i", dir: "ltr", transform: [1, 0, 0, 1, 10, 700], width: 44, height: 12, fontName: "custom-font" }],
      styles: { "custom-font": { fontFamily: "serif" } },
    });

    try {
      const result = await readPdfDocument(new File(["pdf bytes"], "contract.pdf", { type: "application/pdf" }));
      expect(result.pages[0].spans[0].wordRects).toEqual([
        { start: 0, end: 4, x: 10, width: 36 },
        { start: 5, end: 6, x: 50, width: 4 },
      ]);
      expect(measureText).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("extracts selectable text and its page position locally", async () => {
    const file = new File(["pdf bytes"], "contract.pdf", { type: "application/pdf" });

    const result = await readPdfDocument(file);

    expect(getDocumentMock).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
    expect(result.pages).toEqual([{ pageNumber: 1, width: 612, height: 792, spans: [{ text: "Payment", x: 10, y: 92, width: 42, height: 12 }] }]);
    expect(result.loadingTask).toBeDefined();
    expect(pageMock.cleanup).toHaveBeenCalledOnce();
  });

  it("returns a clear message for an unreadable PDF", async () => {
    const file = new File(["bad"], "broken.pdf", { type: "application/pdf" });
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("invalid PDF"));

    await expect(readPdfDocument(file)).rejects.toThrow("broken.pdf could not be read as a PDF");
  });

  it("rejects oversized page counts and releases the local worker", async () => {
    pdfDocumentMock.numPages = 201;
    const file = new File(["pdf bytes"], "long.pdf", { type: "application/pdf" });
    await expect(readPdfDocument(file)).rejects.toThrow("long.pdf exceeds the 200 page limit");
    expect(loadingTaskMock.destroy).toHaveBeenCalled();
    pdfDocumentMock.numPages = 1;
  });
});
