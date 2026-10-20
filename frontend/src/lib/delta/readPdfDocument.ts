import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { PdfPageText } from "./pdfCompare";

export interface LoadedPdfDocument {
  name: string;
  document: PDFDocumentProxy;
  loadingTask: PDFDocumentLoadingTask;
  pages: PdfPageText[];
}

export const MAX_PDF_PAGES = 200;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 500_000;

export async function readPdfDocument(file: File): Promise<LoadedPdfDocument> {
  let loadingTask: PDFDocumentLoadingTask | undefined;
  try {
    if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`${file.name} exceeds the 20 MiB file limit.`);
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const document = await loadingTask.promise;
    if (document.numPages > MAX_PDF_PAGES) throw new Error(`${file.name} exceeds the 200 page limit.`);
    const pages: PdfPageText[] = [];
    let characters = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const spans = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        characters += item.str.length;
        if (characters > MAX_EXTRACTED_CHARACTERS) throw new Error(`${file.name} exceeds the 500,000 extracted character limit.`);
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

    return { name: file.name, document, loadingTask, pages };
  } catch (cause) {
    try { await loadingTask?.destroy(); } catch { /* Worker may already be shutting down after a parse failure. */ }
    if (cause instanceof Error && (cause.message.includes(file.name) || cause.message.includes("20 MiB"))) throw cause;
    throw new Error(`${file.name} could not be read as a PDF. Check that it is a valid, unlocked PDF and try again.`);
  }
}
