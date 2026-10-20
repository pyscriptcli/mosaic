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

export function measureWordRects(text: string, x: number, width: number, measure: (text: string) => number) {
  const words = Array.from(text.matchAll(/\S+/gu));
  if (!words.length || !text.length) return [];
  const segments: Array<{ start: number; end: number; wordIndex: number | null; width: number }> = [];
  let cursor = 0;
  words.forEach((word, wordIndex) => {
    const start = word.index || 0;
    if (start > cursor) segments.push({ start: cursor, end: start, wordIndex: null, width: measure(text.slice(cursor, start)) });
    const end = start + word[0].length;
    segments.push({ start, end, wordIndex, width: measure(word[0]) });
    cursor = end;
  });
  if (cursor < text.length) segments.push({ start: cursor, end: text.length, wordIndex: null, width: measure(text.slice(cursor)) });
  const measuredWidth = segments.reduce((sum, segment) => sum + Math.max(0, segment.width), 0);
  if (!measuredWidth) return words.map((word) => {
    const start = word.index || 0;
    const length = word[0].length;
    const scale = width / text.length;
    return { start, end: start + length, x: x + start * scale, width: length * scale };
  });

  const scale = width / measuredWidth;
  let offset = 0;
  const wordRects: Array<{ start: number; end: number; x: number; width: number }> = [];
  segments.forEach((segment) => {
    if (segment.wordIndex !== null) wordRects.push({ start: segment.start, end: segment.end, x: x + offset * scale, width: segment.width * scale });
    offset += Math.max(0, segment.width);
  });
  return wordRects;
}

function makeMeasurer(fontFamily: string, context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null) {
  if (!context) return null;
  const genericFamily = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/iu.test(fontFamily.trim());
  const family = genericFamily ? fontFamily : `"${fontFamily.replace(/["\\]/gu, "\\$&")}"`;
  context.font = `100px ${family}`;
  return (text: string) => context.measureText(text).width;
}

function createMeasurementContext() {
  try {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(1, 1).getContext("2d");
    if (typeof window !== "undefined") return window.document.createElement("canvas").getContext("2d");
  } catch {
    return null;
  }
  return null;
}

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
    const measurementContext = createMeasurementContext();
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
        const spanWidth = Math.abs(corners[1][0] - corners[0][0]);
        const style = content.styles?.[item.fontName];
        const measure = item.dir === "ltr" && style ? makeMeasurer(style.fontFamily, measurementContext) : null;
        const wordRects = measure
          ? measureWordRects(item.str, left, spanWidth, measure)
          : undefined;
        return [{ text: item.str, x: left, y: top, width: spanWidth, height: Math.abs(corners[1][1] - corners[0][1]), ...(wordRects ? { wordRects } : {}) }];
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
