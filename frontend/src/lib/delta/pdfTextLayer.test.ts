// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { measurePdfTextAnchors } from "./pdfTextLayer";

describe("measurePdfTextAnchors", () => {
  it("maps native rendered text ranges into page coordinates at any display scale", () => {
    const node = document.createTextNode("Pay forty days");
    const textDiv = document.createElement("span");
    textDiv.append(node);
    const page = document.createElement("div");
    vi.spyOn(page, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, width: 600, height: 1200 } as DOMRect);
    const range = {
      setStart: vi.fn(),
      setEnd: vi.fn(),
      getClientRects: () => [{ left: 150, top: 80, width: 80, height: 12 }],
    } as unknown as Range;
    vi.spyOn(document, "createRange").mockReturnValue(range);

    expect(measurePdfTextAnchors(page, [textDiv], [{ textItemIndex: 0, start: 4, end: 9 }], { width: 300, height: 600 })).toEqual([
      { x: 25, y: 15, width: 40, height: 6 },
    ]);
    expect(range.setStart).toHaveBeenCalledWith(node, 4);
    expect(range.setEnd).toHaveBeenCalledWith(node, 9);
  });
});
