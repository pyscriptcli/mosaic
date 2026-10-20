"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { PdfComparisonResult, PdfPageText, PdfTextAnchor, PdfTextRect } from "@/lib/delta/pdfCompare";
import { groupPdfChanges } from "@/lib/delta/changeGroups";
import { measurePdfTextAnchors } from "@/lib/delta/pdfTextLayer";

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

function excerpt(text: string) {
  const compact = text.replace(/\s+/gu, " ").trim();
  return compact.length > 72 ? `${compact.slice(0, 72).trimEnd()}…` : compact;
}

function changePreview(originalText: string, revisedText: string) {
  if (originalText && revisedText) return `Earlier: ${excerpt(originalText)} · Later: ${excerpt(revisedText)}`;
  return originalText ? `Removed: ${excerpt(originalText)}` : `Added: ${excerpt(revisedText)}`;
}

function PdfPage({ document, pageNumber, page, highlights, anchors, side }: {
  document?: PDFDocumentProxy;
  pageNumber: number;
  page?: PdfPageText;
  highlights: PdfTextRect[];
  anchors: PdfTextAnchor[];
  side: "original" | "revised";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState(false);
  const [scale, setScale] = useState(1);
  const [measuredHighlights, setMeasuredHighlights] = useState<PdfTextRect[] | null>(null);

  useEffect(() => {
    const surface = pageRef.current;
    if (!surface || !page) return;
    const resize = () => {
      const nextScale = surface.clientWidth / page.width;
      if (nextScale > 0) setScale(nextScale);
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [page]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !document || !page) return;
    let active = true;
    let task: RenderTask | undefined;
    let textLayer: import("pdfjs-dist").TextLayer | undefined;
    setRenderError(false);
    setMeasuredHighlights(null);

    void document.getPage(pageNumber).then(async (pdfPage) => {
      if (!active) return;
      const viewport = pdfPage.getViewport({ scale });
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      task = pdfPage.render({ canvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      try {
        await task.promise;
      } catch {
        if (active) setRenderError(true);
        return;
      }
      if (!active || !anchors.length || !textLayerRef.current || !pageRef.current) return;
      try {
        const [{ TextLayer }, textContent] = await Promise.all([import("pdfjs-dist"), pdfPage.getTextContent()]);
        if (!active || !textLayerRef.current) return;
        textLayerRef.current.replaceChildren();
        textLayer = new TextLayer({ textContentSource: textContent, container: textLayerRef.current, viewport });
        await textLayer.render();
        if (active) setMeasuredHighlights(measurePdfTextAnchors(pageRef.current!, textLayer.textDivs, anchors, page));
      } catch {
        if (active) setMeasuredHighlights(null);
      }
    }).catch(() => { if (active) setRenderError(true); });

    return () => { active = false; task?.cancel(); textLayer?.cancel(); };
  }, [anchors, document, page, pageNumber, scale]);

  const visibleHighlights = measuredHighlights?.length ? measuredHighlights : highlights;

  return <div ref={pageRef} className="relative mx-auto w-full max-w-[520px] bg-white shadow-sm" style={{ aspectRatio: page ? `${page.width} / ${page.height}` : "612 / 792" }}>
    {document && page
      ? <>
        <canvas ref={canvasRef} aria-label={`${side === "original" ? "Earlier version" : "Later version"}, page ${pageNumber}`} className="relative z-0 block h-full w-full" />
        <div ref={textLayerRef} aria-hidden="true" className="contracts-pdf-text-layer" style={{ ["--total-scale-factor" as string]: scale }} />
      </>
      : <div className="grid h-full place-items-center bg-white px-5 text-center text-xs text-slate-500">{page ? "PDF page preview" : `Page ${pageNumber} is not present in this PDF.`}</div>}
    {page && <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">{visibleHighlights.map((rect, index) => {
      const left = Math.max(0, rect.x - 0.5);
      const top = Math.max(0, rect.y - 0.5);
      const right = Math.min(page.width, rect.x + rect.width + 0.5);
      const bottom = Math.min(page.height, rect.y + rect.height + 0.5);
      return <span key={`${index}-${rect.x}`} className={`absolute ${side === "original" ? "bg-rose-300/50" : "bg-emerald-300/50"}`} style={{ left: `${left / page.width * 100}%`, top: `${top / page.height * 100}%`, width: `${Math.max((right - left) / page.width * 100, 0.5)}%`, height: `${Math.max((bottom - top) / page.height * 100, 0.7)}%` }} />;
    })}</div>}
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
  const originalPageChanges = useMemo(() => comparison.changes.filter((change) => change.originalPageNumber === originalPageNumber), [comparison.changes, originalPageNumber]);
  const revisedPageChanges = useMemo(() => comparison.changes.filter((change) => change.revisedPageNumber === revisedPageNumber), [comparison.changes, revisedPageNumber]);
  const originalHighlights = useMemo(() => originalPageChanges.flatMap((change) => change.originalRects), [originalPageChanges]);
  const revisedHighlights = useMemo(() => revisedPageChanges.flatMap((change) => change.revisedRects), [revisedPageChanges]);
  const originalAnchors = useMemo(() => originalPageChanges.flatMap((change) => change.originalAnchors), [originalPageChanges]);
  const revisedAnchors = useMemo(() => revisedPageChanges.flatMap((change) => change.revisedAnchors), [revisedPageChanges]);
  const scanCount = comparison.scannedPages.original.length + comparison.scannedPages.revised.length;
  const selectedChange = comparison.changes.find((change) => change.id === selectedChangeId);
  const selectedChangeIndex = comparison.changes.findIndex((change) => change.id === selectedChangeId);
  const changeGroups = useMemo(() => groupPdfChanges(comparison.changes, originalPages, revisedPages), [comparison.changes, originalPages, revisedPages]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const selectChange = (id: string) => {
    setSelectedChangeId(id);
    const group = changeGroups.find((candidate) => candidate.changes.some((item) => item.id === id));
    if (group) setExpandedGroupId(group.id);
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
          <div className="max-h-[72vh] min-h-[520px] overflow-auto p-3"><PdfPage document={originalDocument} pageNumber={originalPageNumber} page={originalPage} highlights={originalHighlights} anchors={originalAnchors} side="original" /></div>
        </section>
        <section className="min-w-0 border border-slate-200 bg-[#E9EDF0]" aria-label="Later version PDF">
          <header className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3"><div className="min-w-0"><h2 className="text-xs font-semibold text-[#003366]">Later version</h2><span className="block truncate text-[10px] text-slate-500">{revisedName}</span></div><span className="shrink-0 text-[10px] text-slate-500">Page {revisedPageNumber} of {revisedPageCount}</span></header>
          <div className="max-h-[72vh] min-h-[520px] overflow-auto p-3"><PdfPage document={revisedDocument} pageNumber={revisedPageNumber} page={revisedPage} highlights={revisedHighlights} anchors={revisedAnchors} side="revised" /></div>
        </section>
        <section className="min-w-0 border border-slate-200 bg-[#FFFCFB]" aria-label="PDF differences">
          <header className="flex min-h-11 items-center justify-between border-b border-slate-200 bg-white px-3"><h2 className="text-xs font-semibold text-[#003366]">Diff</h2><span className="text-[10px] text-slate-500">{comparison.changes.length} change{comparison.changes.length === 1 ? "" : "s"}</span></header>
          <div className="max-h-[72vh] min-h-[520px] space-y-2 overflow-auto p-2">
            {changeGroups.map((group) => <details key={group.id} open={expandedGroupId === group.id} onToggle={(event) => event.currentTarget.open ? setExpandedGroupId(group.id) : setExpandedGroupId((current) => current === group.id ? null : current)} className={`border bg-white ${group.changes.some((change) => change.id === selectedChangeId) ? "border-[#C9A84C]" : "border-slate-200"}`}>
              <summary className="cursor-pointer p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">
                <span className="flex items-start justify-between gap-2"><span className="min-w-0 text-xs font-semibold leading-5 text-[#003366]">{group.label}</span><span className="shrink-0 text-[10px] text-slate-500">{group.changes.length} change{group.changes.length === 1 ? "" : "s"}</span></span>
                <span className="mt-1 block truncate text-[10px] leading-4 text-slate-600">{changePreview(group.changes[0].originalText, group.changes[0].revisedText)}{group.changes.length > 1 ? ` · +${group.changes.length - 1} more` : ""}</span>
              </summary>
              <div className="space-y-1 border-t border-slate-100 p-2">
                {group.changes.map((change) => <button key={change.id} type="button" aria-label={`Earlier version page ${change.originalPageNumber ?? "not present"}, later version page ${change.revisedPageNumber ?? "not present"}, ${change.kind} wording`} aria-pressed={selectedChangeId === change.id} onClick={() => selectChange(change.id)} className={`block min-h-11 w-full border p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366] ${selectedChangeId === change.id ? "border-[#C9A84C] bg-[#FCFAF2]" : "border-transparent hover:border-slate-200"}`}>
                  <span className={`block text-[9px] font-bold uppercase tracking-wide ${change.kind === "added" ? "text-emerald-800" : change.kind === "removed" ? "text-rose-800" : "text-[#31577D]"}`}>{change.kind === "added" ? "Added to later version" : change.kind === "removed" ? "Removed from earlier version" : "Changed wording"}</span>
                  {change.originalText && <span className="mt-1 block text-xs leading-5 text-rose-900"><del>{change.originalText}</del></span>}
                  {change.revisedText && <span className="mt-1 block text-xs leading-5 text-emerald-900"><ins>{change.revisedText}</ins></span>}
                  <span className="mt-2 block text-[10px] text-slate-500">Earlier page {change.originalPageNumber ?? "not present"} · Later page {change.revisedPageNumber ?? "not present"}{selectedChangeId === change.id && selectedChange ? " · highlighted in source pages" : " · select to locate"}</span>
                </button>)}
              </div>
            </details>)}
            {comparison.changes.length === 0 && <p className="border border-slate-200 bg-white p-3 text-xs text-slate-600">{scanCount ? "No text differences can be reported for the scanned pages." : "No wording changes were found between these PDFs."}</p>}
          </div>
        </section>
      </div>
      <p className="text-[10px] leading-5 text-slate-500">Text-based comparison is a review aid. Pages are matched by their text, though heavily rewritten or scanned pages may still need manual review. Confirm each change against the source documents.</p>
    </>}
  </section>;
}
