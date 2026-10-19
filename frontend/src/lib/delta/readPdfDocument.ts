import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfPageText } from "./pdfCompare";

export interface LoadedPdfDocument {
  name: string;
  document: PDFDocumentProxy;
  pages: PdfPageText[];
}

export async function readPdfDocument(file: File): Promise<LoadedPdfDocument> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: PdfPageText[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const spans = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        const x = item.transform[4];
        const y = item.transform[5];
        const corners = [viewport.convertToViewportPoint(x, y - item.height), viewport.convertToViewportPoint(x + item.width, y)];
        const left = Math.min(corners[0][0], corners[1][0]);
        const top = Math.min(corners[0][1], corners[1][1]);
        return [{ text: item.str, x: left, y: top, width: Math.abs(corners[1][0] - corners[0][0]), height: Math.abs(corners[1][1] - corners[0][1]) }];
      });
      pages.push({ pageNumber, width: viewport.width, height: viewport.height, spans });
      page.cleanup();
    }

    return { name: file.name, document, pages };
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes(file.name)) throw cause;
    throw new Error(`${file.name} could not be read as a PDF. Check that it is a valid, unlocked PDF and try again.`);
  }
}
