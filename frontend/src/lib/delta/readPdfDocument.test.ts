import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDocumentMock, pdfDocumentMock, pageMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
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
    getTextContent: vi.fn(async () => ({ items: [{ str: "Payment", transform: [1, 0, 0, 1, 10, 700], width: 42, height: 12 }] })),
    cleanup: vi.fn(),
  },
}));

vi.mock("pdfjs-dist", () => ({
  version: "test-version",
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: getDocumentMock,
}));

import { readPdfDocument } from "./readPdfDocument";

describe("readPdfDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfDocumentMock.getPage.mockResolvedValue(pageMock);
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(pdfDocumentMock) });
  });

  it("extracts selectable text and its page position locally", async () => {
    const file = new File(["pdf bytes"], "contract.pdf", { type: "application/pdf" });

    const result = await readPdfDocument(file);

    expect(getDocumentMock).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
    expect(result.pages).toEqual([{ pageNumber: 1, width: 612, height: 792, spans: [{ text: "Payment", x: 10, y: 92, width: 42, height: 12 }] }]);
    expect(pageMock.cleanup).toHaveBeenCalledOnce();
  });

  it("returns a clear message for an unreadable PDF", async () => {
    const file = new File(["bad"], "broken.pdf", { type: "application/pdf" });
    vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("invalid PDF"));

    await expect(readPdfDocument(file)).rejects.toThrow("broken.pdf could not be read as a PDF");
  });
});
