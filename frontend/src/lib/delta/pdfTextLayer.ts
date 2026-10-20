import type { PdfTextAnchor, PdfTextRect } from "./pdfCompare";

export function measurePdfTextAnchors(pageElement: HTMLElement, textDivs: HTMLElement[], anchors: PdfTextAnchor[], pageSize: { width: number; height: number }): PdfTextRect[] {
  const pageRect = pageElement.getBoundingClientRect();
  if (!pageRect.width || !pageRect.height) return [];
  return anchors.flatMap((anchor) => {
    const textDiv = textDivs[anchor.textItemIndex];
    const textNode = textDiv?.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || anchor.start < 0 || anchor.end > (textNode.textContent?.length || 0) || anchor.end <= anchor.start) return [];
    const range = document.createRange();
    range.setStart(textNode, anchor.start);
    range.setEnd(textNode, anchor.end);
    return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => ({
      x: (rect.left - pageRect.left) / pageRect.width * pageSize.width,
      y: (rect.top - pageRect.top) / pageRect.height * pageSize.height,
      width: rect.width / pageRect.width * pageSize.width,
      height: rect.height / pageRect.height * pageSize.height,
    }));
  });
}
