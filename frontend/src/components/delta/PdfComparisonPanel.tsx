"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { PdfComparisonResult, PdfPageText, PdfTextRect } from "@/lib/delta/pdfCompare";

type PdfComparisonPanelProps = {
  originalName: string;
  revisedName: string;
  originalPages: PdfPageText[];
  revisedPages: PdfPageText[];
  originalDocument?: PDFDocumentProxy;
  revisedDocument?: PDFDocumentProxy;
  comparison: PdfComparisonResult;
  cardView?: ReactNode;
  onViewChange?: (view: "side-by-side" | "cards") => void;
};

function PdfPage({ document, pageNumber, page, highlights, side }: {
  document?: PDFDocumentProxy;
  pageNumber: number;
  page?: PdfPageText;
  highlights: PdfTextRect[];
  side: "original" | "revised";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !document || !page) return;
    let active = true;
    let task: RenderTask | undefined;
    setRenderError(false);

    void document.getPage(pageNumber).then((pdfPage) => {
      if (!active) return;
      const viewport = pdfPage.getViewport({ scale: 1.25 });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      task = pdfPage.render({ canvas, canvasContext: context, viewport });
      return task.promise;
    }).catch(() => { if (active) setRenderError(true); });

    return () => { active = false; task?.cancel(); };
  }, [document, page, pageNumber]);

  return <div className="relative mx-auto w-full max-w-[520px] bg-white shadow-sm" style={{ aspectRatio: page ? `${page.width} / ${page.height}` : "612 / 792" }}>
    {document && page
      ? <canvas ref={canvasRef} aria-label={`${side === "original" ? "Earlier version" : "Later version"}, page ${pageNumber}`} className="block h-full w-full" />
      : <div className="grid h-full place-items-center bg-white px-5 text-center text-xs text-slate-500">{page ? "PDF page preview" : `Page ${pageNumber} is not present in this PDF.`}</div>}
    {page && <div className="pointer-events-none absolute inset-0" aria-hidden="true">{highlights.map((rect, index) => <span key={`${index}-${rect.x}`} className={`absolute border ${side === "original" ? "border-rose-700 bg-rose-300/35" : "border-emerald-700 bg-emerald-300/35"}`} style={{ left: `${rect.x / page.width * 100}%`, top: `${rect.y / page.height * 100}%`, width: `${Math.max(rect.width / page.width * 100, 0.5)}%`, height: `${Math.max(rect.height / page.height * 100, 0.7)}%` }} />)}</div>}
    {renderError && <p role="alert" className="absolute inset-x-2 bottom-2 border border-red-300 bg-white p-2 text-center text-[10px] text-red-900">This PDF page could not be rendered.</p>}
  </div>;
}

export function PdfComparisonPanel({ originalName, revisedName, originalPages, revisedPages, originalDocument, revisedDocument, comparison, cardView, onViewChange }: PdfComparisonPanelProps) {
  const [view, setView] = useState<"side-by-side" | "cards">("side-by-side");
  const [selectedChangeId, setSelectedChangeId] = useState(comparison.changes[0]?.id || "");
  const [originalPageNumber, setOriginalPageNumber] = useState(comparison.changes[0]?.originalPageNumber || 1);
  const [revisedPageNumber, setRevisedPageNumber] = useState(comparison.changes[0]?.revisedPageNumber || 1);
  const originalPageCount = originalPages[originalPages.length - 1]?.pageNumber || 1;
  const revisedPageCount = revisedPages[revisedPages.length - 1]?.pageNumber || 1;
  const originalPage = originalPages.find((page) => page.pageNumber === originalPageNumber);
  const revisedPage = revisedPages.find((page) => page.pageNumber === revisedPageNumber);
  const originalPageChanges = comparison.changes.filter((change) => change.originalPageNumber === originalPageNumber);
  const revisedPageChanges = comparison.changes.filter((change) => change.revisedPageNumber === revisedPageNumber);
  const scanCount = comparison.scannedPages.original.length + comparison.scannedPages.revised.length;
  const selectedChange = comparison.changes.find((change) => change.id === selectedChangeId);
  const selectedChangeIndex = comparison.changes.findIndex((change) => change.id === selectedChangeId);

  const selectChange = (id: string) => {
    setSelectedChangeId(id);
    const change = comparison.changes.find((item) => item.id === id);
    if (!change) return;
    if (change.originalPageNumber) setOriginalPageNumber(change.originalPageNumber);
    if (change.revisedPageNumber) setRevisedPageNumber(change.revisedPageNumber);
  };
  const selectView = (next: "side-by-side" | "cards") => {
    setView(next);
    onViewChange?.(next);
  };

  return <section className="space-y-3" aria-label="PDF comparison">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex border border-slate-300 bg-white p-1" role="group" aria-label="Comparison view">
        <button type="button" aria-pressed={view === "side-by-side"} onClick={() => selectView("side-by-side")} className={`min-h-9 px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] ${view === "side-by-side" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-[#F7FAFC]"}`}>Side by side</button>
        <button type="button" aria-pressed={view === "cards"} onClick={() => selectView("cards")} className={`min-h-9 px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] ${view === "cards" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-[#F7FAFC]"}`}>Cards</button>
      </div>
      <div className="flex items-center gap-2" aria-label="Change navigation"><button type="button" aria-label="Previous change" disabled={selectedChangeIndex <= 0} onClick={() => selectChange(comparison.changes[selectedChangeIndex - 1]?.id)} className="h-9 w-9 border border-slate-300 bg-white text-[#003366] disabled:opacity-40">‹</button><span role="status" aria-live="polite" className="text-[10px] text-slate-600">{comparison.changes.length ? `Change ${selectedChangeIndex + 1} of ${comparison.changes.length}` : "No changes"}</span><button type="button" aria-label="Next change" disabled={selectedChangeIndex < 0 || selectedChangeIndex >= comparison.changes.length - 1} onClick={() => selectChange(comparison.changes[selectedChangeIndex + 1]?.id)} className="h-9 w-9 border border-slate-300 bg-white text-[#003366] disabled:opacity-40">›</button></div>
      {view === "side-by-side" && <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-xs text-slate-600">
        <div className="flex items-center gap-2"><span className="text-[10px] text-slate-500">Earlier version</span><button type="button" aria-label="Previous earlier version page" disabled={originalPageNumber <= 1} onClick={() => setOriginalPageNumber((current) => Math.max(1, current - 1))} className="h-9 w-9 border border-slate-300 bg-white text-[#003366] disabled:opacity-40">‹</button><span>Page <strong className="text-[#003366]">{originalPageNumber}</strong> of {originalPageCount}</span><button type="button" aria-label="Next earlier version page" disabled={originalPageNumber >= originalPageCount} onClick={() => setOriginalPageNumber((current) => Math.min(originalPageCount, current + 1))} className="h-9 w-9 border border-slate-300 bg-white text-[#003366] disabled:opacity-40">›</button></div>
        <div className="flex items-center gap-2"><span className="text-[10px] text-slate-500">Later version</span><button type="button" aria-label="Previous later version page" disabled={revisedPageNumber <= 1} onClick={() => setRevisedPageNumber((current) => Math.max(1, current - 1))} className="h-9 w-9 border border-slate-300 bg-white text-[#003366] disabled:opacity-40">‹</button><span>Page <strong className="text-[#003366]">{revisedPageNumber}</strong> of {revisedPageCount}</span><button type="button" aria-label="Next later version page" disabled={revisedPageNumber >= revisedPageCount} onClick={() => setRevisedPageNumber((current) => Math.min(revisedPageCount, current + 1))} className="h-9 w-9 border border-slate-300 bg-white text-[#003366] disabled:opacity-40">›</button></div>
      </div>}
    </div>

    {scanCount > 0 && <p role="status" className="border border-amber-300 bg-[#FCFAF2] px-3 py-2 text-xs leading-5 text-[#66551F]">{scanCount} page{scanCount === 1 ? " has" : "s have"} no selectable text, so text differences can’t be checked there. Scanned pages remain visible in the source PDFs.</p>}

    {view === "cards" ? cardView : <>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600"><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-rose-200 ring-1 ring-rose-600" />Removed from earlier version</span><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-emerald-200 ring-1 ring-emerald-600" />Added in later version</span><span className="ml-auto">Source PDFs stay unchanged</span></div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,0.82fr)]">
        <section className="min-w-0 border border-slate-200 bg-[#E9EDF0]" aria-label="Earlier version PDF">
          <header className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3"><div className="min-w-0"><h2 className="text-xs font-semibold text-[#003366]">Earlier version</h2><span className="block truncate text-[10px] text-slate-500">{originalName}</span></div><span className="shrink-0 text-[10px] text-slate-500">Page {originalPageNumber} of {originalPageCount}</span></header>
          <div className="max-h-[72vh] min-h-[520px] overflow-auto p-3"><PdfPage document={originalDocument} pageNumber={originalPageNumber} page={originalPage} highlights={originalPageChanges.flatMap((change) => change.originalRects)} side="original" /></div>
        </section>
        <section className="min-w-0 border border-slate-200 bg-[#E9EDF0]" aria-label="Later version PDF">
          <header className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3"><div className="min-w-0"><h2 className="text-xs font-semibold text-[#003366]">Later version</h2><span className="block truncate text-[10px] text-slate-500">{revisedName}</span></div><span className="shrink-0 text-[10px] text-slate-500">Page {revisedPageNumber} of {revisedPageCount}</span></header>
          <div className="max-h-[72vh] min-h-[520px] overflow-auto p-3"><PdfPage document={revisedDocument} pageNumber={revisedPageNumber} page={revisedPage} highlights={revisedPageChanges.flatMap((change) => change.revisedRects)} side="revised" /></div>
        </section>
        <section className="min-w-0 border border-slate-200 bg-[#FFFCFB]" aria-label="PDF differences">
          <header className="flex min-h-11 items-center justify-between border-b border-slate-200 bg-white px-3"><h2 className="text-xs font-semibold text-[#003366]">Diff</h2><span className="text-[10px] text-slate-500">{comparison.changes.length} change{comparison.changes.length === 1 ? "" : "s"}</span></header>
          <div className="max-h-[72vh] min-h-[520px] space-y-2 overflow-auto p-2">
            {comparison.changes.map((change) => <button key={change.id} type="button" aria-label={`Earlier version page ${change.originalPageNumber ?? "not present"}, later version page ${change.revisedPageNumber ?? "not present"}, ${change.kind} wording`} aria-pressed={selectedChangeId === change.id} onClick={() => selectChange(change.id)} className={`block w-full border bg-white p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366] ${selectedChangeId === change.id ? "border-[#C9A84C] shadow-[inset_2px_0_0_#C9A84C]" : "border-slate-200 hover:border-[#31577D]"}`}>
              <span className={`block text-[9px] font-bold uppercase tracking-wide ${change.kind === "added" ? "text-emerald-800" : change.kind === "removed" ? "text-rose-800" : "text-[#31577D]"}`}>{change.kind === "added" ? "Added to later version" : change.kind === "removed" ? "Removed from earlier version" : "Changed wording"}</span>
              {change.originalText && <span className="mt-1 block text-xs leading-5 text-rose-900"><del>{change.originalText}</del></span>}
              {change.revisedText && <span className="mt-1 block text-xs leading-5 text-emerald-900"><ins>{change.revisedText}</ins></span>}
              <span className="mt-2 block text-[10px] text-slate-500">Earlier page {change.originalPageNumber ?? "not present"} · Later page {change.revisedPageNumber ?? "not present"}{selectedChangeId === change.id && selectedChange ? " · highlighted in source pages" : " · select to locate"}</span>
            </button>)}
            {comparison.changes.length === 0 && <p className="border border-slate-200 bg-white p-3 text-xs text-slate-600">{scanCount ? "No text differences can be reported for the scanned pages." : "No wording changes were found between these PDFs."}</p>}
          </div>
        </section>
      </div>
      <p className="text-[10px] leading-5 text-slate-500">Text-based comparison is a review aid. Pages are matched by their text, though heavily rewritten or scanned pages may still need manual review. Confirm each change against the source documents.</p>
    </>}
  </section>;
}
