"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { resolvePairedPage, type PdfComparisonResult, type PdfPageText, type PdfTextAnchor, type PdfTextRect } from "@/lib/delta/pdfCompare";
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

function PdfPage({ document, pageNumber, page, highlights, anchors, side, textSelection }: {
  document?: PDFDocumentProxy;
  pageNumber: number;
  page?: PdfPageText;
  highlights: PdfTextRect[];
  anchors: PdfTextAnchor[];
  side: "original" | "revised";
  textSelection: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState(false);
  const [scale, setScale] = useState(1);
  const [measuredHighlights, setMeasuredHighlights] = useState<PdfTextRect[] | null>(null);
  const [nearViewport, setNearViewport] = useState(typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const node = pageRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNearViewport(true); observer.disconnect(); } }, { rootMargin: "900px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
    if (!canvas || !context || !document || !page || !nearViewport) return;
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
      if (!active || (!anchors.length && !textSelection) || !textLayerRef.current || !pageRef.current) return;
      try {
        const [{ TextLayer }, textContent] = await Promise.all([import("pdfjs-dist"), pdfPage.getTextContent()]);
        if (!active || !textLayerRef.current) return;
        textLayerRef.current.replaceChildren();
        textLayer = new TextLayer({ textContentSource: textContent, container: textLayerRef.current, viewport });
        await textLayer.render();
        if (active && anchors.length) setMeasuredHighlights(measurePdfTextAnchors(pageRef.current!, textLayer.textDivs, anchors, page));
      } catch {
        if (active) setMeasuredHighlights(null);
      }
    }).catch(() => { if (active) setRenderError(true); });

    return () => { active = false; task?.cancel(); textLayer?.cancel(); };
  }, [anchors, document, page, pageNumber, scale, nearViewport, textSelection]);

  const visibleHighlights = measuredHighlights?.length ? measuredHighlights : highlights;

  return <div ref={pageRef} data-pdf-page={pageNumber} className="relative mx-auto w-full bg-white shadow-sm" style={{ aspectRatio: page ? `${page.width} / ${page.height}` : "612 / 792" }}>
    {document && page
      ? <>
        <canvas ref={canvasRef} aria-label={`${side === "original" ? "Earlier version" : "Later version"}, page ${pageNumber}`} className="relative z-0 block h-full w-full" />
        <div ref={textLayerRef} aria-hidden={!textSelection} className={`contracts-pdf-text-layer ${textSelection ? "selectable" : ""}`} style={{ ["--total-scale-factor" as string]: scale }} />
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
  const [view, setView] = useState<"side-by-side" | "single" | "cards">("side-by-side");
  const [singleSide, setSingleSide] = useState<"original" | "revised">("original");
  const [scrollSync, setScrollSync] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [textSelection, setTextSelection] = useState(false);
  const [search, setSearch] = useState("");
  const comparisonRef = useRef<HTMLElement>(null);
  const [selectedChangeId, setSelectedChangeId] = useState(comparison.changes[0]?.id || "");
  const [originalPageNumber, setOriginalPageNumber] = useState(comparison.changes[0]?.originalPageNumber || 1);
  const [revisedPageNumber, setRevisedPageNumber] = useState(comparison.changes[0]?.revisedPageNumber || 1);
  const originalPageCount = originalPages[originalPages.length - 1]?.pageNumber || 1;
  const revisedPageCount = revisedPages[revisedPages.length - 1]?.pageNumber || 1;
  const scanCount = comparison.scannedPages.original.length + comparison.scannedPages.revised.length;
  const selectedChange = comparison.changes.find((change) => change.id === selectedChangeId);
  const selectedChangeIndex = comparison.changes.findIndex((change) => change.id === selectedChangeId);
  const changeGroups = useMemo(() => groupPdfChanges(comparison.changes, originalPages, revisedPages), [comparison.changes, originalPages, revisedPages]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const originalPane = useRef<HTMLDivElement>(null);
  const revisedPane = useRef<HTMLDivElement>(null);
  const syncLock = useRef(false);

  const goToPage = (side: "original" | "revised", pageNumber: number) => {
    const pane = side === "original" ? originalPane.current : revisedPane.current;
    pane?.querySelector<HTMLElement>(`[data-pdf-page="${pageNumber}"]`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    if (side === "original") setOriginalPageNumber(pageNumber); else setRevisedPageNumber(pageNumber);
  };
  const syncScroll = (side: "original" | "revised") => {
    if (syncLock.current) return;
    const source = side === "original" ? originalPane.current : revisedPane.current;
    const target = side === "original" ? revisedPane.current : originalPane.current;
    if (!source) return;
    const sourcePages = Array.from(source.querySelectorAll<HTMLElement>("[data-pdf-page]"));
    const current = sourcePages.find((element) => element.getBoundingClientRect().bottom > source.getBoundingClientRect().top + 15);
    if (!current) return;
    const sourcePage = Number(current.dataset.pdfPage);
    if (side === "original") setOriginalPageNumber(sourcePage); else setRevisedPageNumber(sourcePage);
    if (!scrollSync || !target) return;
    const targetPage = resolvePairedPage(comparison.pageAlignment, side, sourcePage);
    const destination = targetPage == null ? null : target.querySelector<HTMLElement>(`[data-pdf-page="${targetPage}"]`);
    if (!destination) return;
    const ratio = Math.min(1, Math.max(0, (source.scrollTop - current.offsetTop) / Math.max(1, current.offsetHeight)));
    syncLock.current = true;
    target.scrollTop = destination.offsetTop + ratio * destination.offsetHeight;
    requestAnimationFrame(() => { syncLock.current = false; });
  };

  const selectChange = (id: string) => {
    setSelectedChangeId(id);
    const group = changeGroups.find((candidate) => candidate.changes.some((item) => item.id === id));
    if (group) setExpandedGroupId(group.id);
    const change = comparison.changes.find((item) => item.id === id);
    if (!change) return;
    if (change.originalPageNumber) goToPage("original", change.originalPageNumber);
    if (change.revisedPageNumber) goToPage("revised", change.revisedPageNumber);
  };
  const selectView = (next: "side-by-side" | "single" | "cards") => {
    setView(next);
    if (next !== "single") onViewChange?.(next);
  };

  return <section ref={comparisonRef} className="space-y-3" aria-label="PDF comparison">
    <div className="contracts-pdf-toolbar flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex border border-slate-300 bg-white p-1" role="group" aria-label="Comparison view">
        <button type="button" aria-pressed={view === "side-by-side"} onClick={() => selectView("side-by-side")} className={`min-h-9 px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] ${view === "side-by-side" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-[#F7FAFC]"}`}>Side by side</button>
        <button type="button" aria-pressed={view === "single"} onClick={() => selectView("single")} className={`min-h-9 px-3 text-xs font-semibold ${view === "single" ? "bg-[#003366] text-white" : "text-[#003366]"}`}>Single</button>
        <button type="button" aria-pressed={view === "cards"} onClick={() => selectView("cards")} className={`min-h-9 px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] ${view === "cards" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-[#F7FAFC]"}`}>Cards</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view === "single" && <label className="text-xs text-[#003366]">Version <select aria-label="Single version" value={singleSide} onChange={(event) => setSingleSide(event.target.value as "original" | "revised")} className="border border-slate-300 bg-white p-2"><option value="original">Earlier</option><option value="revised">Later</option></select></label>}
        {view !== "cards" && <><button type="button" aria-pressed={scrollSync} onClick={() => setScrollSync((value) => !value)} className="min-h-9 border border-slate-300 bg-white px-3 text-xs text-[#003366]">Scroll sync {scrollSync ? "On" : "Off"}</button><button type="button" aria-pressed={textSelection} onClick={() => setTextSelection((value) => !value)} className="min-h-9 border border-slate-300 bg-white px-3 text-xs text-[#003366]">{textSelection ? "Select text" : "Pan page"}</button><button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.65, value - 0.1))} className="h-9 w-9 border border-slate-300 bg-white text-[#003366]">−</button><span className="text-xs text-slate-600">{Math.round(zoom * 100)}%</span><button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} className="h-9 w-9 border border-slate-300 bg-white text-[#003366]">+</button><button type="button" onClick={() => setZoom(1)} className="min-h-9 border border-slate-300 bg-white px-2 text-xs text-[#003366]">Fit width</button></>}
      </div>
      <div className="flex items-center gap-2" aria-label="Change navigation"><button type="button" aria-label="Previous change" disabled={selectedChangeIndex <= 0} onClick={() => selectChange(comparison.changes[selectedChangeIndex - 1]?.id)} className="h-9 w-9 border border-slate-300 bg-white text-[#003366] disabled:opacity-40">‹</button><span role="status" aria-live="polite" className="text-[10px] text-slate-600">{comparison.changes.length ? `Change ${selectedChangeIndex + 1} of ${comparison.changes.length}` : "No changes"}</span><button type="button" aria-label="Next change" disabled={selectedChangeIndex < 0 || selectedChangeIndex >= comparison.changes.length - 1} onClick={() => selectChange(comparison.changes[selectedChangeIndex + 1]?.id)} className="h-9 w-9 border border-slate-300 bg-white text-[#003366] disabled:opacity-40">›</button></div>
      {view !== "cards" && <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        {view === "side-by-side" && <><label>Earlier page <input aria-label="Earlier page" type="number" min={1} max={originalPageCount} value={originalPageNumber} onChange={(event) => goToPage("original", Math.min(originalPageCount, Math.max(1, Number(event.target.value))))} className="w-16 border border-slate-300 bg-white p-2" /> of {originalPageCount}</label><label>Later page <input aria-label="Later page" type="number" min={1} max={revisedPageCount} value={revisedPageNumber} onChange={(event) => goToPage("revised", Math.min(revisedPageCount, Math.max(1, Number(event.target.value))))} className="w-16 border border-slate-300 bg-white p-2" /> of {revisedPageCount}</label></>}
        {view === "single" && <label>{singleSide === "original" ? "Earlier" : "Later"} page <input aria-label={`${singleSide === "original" ? "Earlier" : "Later"} page`} type="number" min={1} max={singleSide === "original" ? originalPageCount : revisedPageCount} value={singleSide === "original" ? originalPageNumber : revisedPageNumber} onChange={(event) => goToPage(singleSide, Math.max(1, Number(event.target.value)))} className="w-16 border border-slate-300 bg-white p-2" /> of {singleSide === "original" ? originalPageCount : revisedPageCount}</label>}
        <label className="sr-only" htmlFor="pdf-doc-search">Search documents</label><input id="pdf-doc-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents" className="min-h-9 w-36 border border-slate-300 bg-white px-2 text-xs" onKeyDown={(event) => { if (event.key === "Enter" && search.trim()) { const query = search.toLocaleLowerCase(); const originalHit = originalPages.find((page) => page.spans.some((span) => span.text.toLocaleLowerCase().includes(query))); const revisedHit = revisedPages.find((page) => page.spans.some((span) => span.text.toLocaleLowerCase().includes(query))); if (originalHit) goToPage("original", originalHit.pageNumber); if (revisedHit) goToPage("revised", revisedHit.pageNumber); } }} />
        <button type="button" onClick={() => window.print()} className="min-h-9 border border-slate-300 bg-white px-3 text-xs text-[#003366]">Print</button><button type="button" onClick={() => { if (!document.fullscreenElement) void comparisonRef.current?.requestFullscreen(); else void document.exitFullscreen(); }} className="min-h-9 border border-slate-300 bg-white px-3 text-xs text-[#003366]">Full screen</button><details className="relative"><summary className="min-h-9 cursor-pointer border border-slate-300 bg-white px-3 py-2 text-xs text-[#003366]">More</summary><div className="absolute right-0 z-20 mt-1 w-56 border border-slate-300 bg-white p-3 text-xs shadow-lg">Use page jump to locate a PDF page. Changes Settings controls blank-only wording. Scroll sync follows matched pages.</div></details>
      </div>}
    </div>

    {scanCount > 0 && <p role="status" className="border border-amber-300 bg-[#FCFAF2] px-3 py-2 text-xs leading-5 text-[#66551F]">{scanCount} page{scanCount === 1 ? " has" : "s have"} no selectable text, so text differences can’t be checked there. Scanned pages remain visible in the source PDFs.</p>}

    {view === "cards" ? cardView : <>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600"><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-rose-200 ring-1 ring-rose-600" />Removed from earlier version</span><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-emerald-200 ring-1 ring-emerald-600" />Added in later version</span><span className="ml-auto">Source PDFs stay unchanged</span></div>
      <div className={`grid min-w-0 gap-3 ${view === "single" ? "xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.82fr)]" : "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,0.82fr)]"}`}>
        <section className={`min-w-0 border border-slate-200 bg-[#E9EDF0] ${view === "single" && singleSide !== "original" ? "hidden" : ""}`} aria-label="Earlier version PDF">
          <header className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3"><div className="min-w-0"><h2 className="text-xs font-semibold text-[#003366]">Earlier version</h2><span className="block truncate text-[10px] text-slate-500">{originalName}</span></div><span className="shrink-0 text-[10px] text-slate-500">Page {originalPageNumber} of {originalPageCount}</span></header>
          <div ref={originalPane} onScroll={() => syncScroll("original")} className="max-h-[72vh] min-h-[520px] space-y-3 overflow-auto p-3">{originalPages.map((page) => { const changes = comparison.changes.filter((change) => change.originalPageNumber === page.pageNumber); return <div key={page.pageNumber} style={{ width: `${zoom * 100}%` }}><PdfPage document={originalDocument} pageNumber={page.pageNumber} page={page} highlights={changes.flatMap((change) => change.originalRects)} anchors={changes.flatMap((change) => change.originalAnchors)} side="original" textSelection={textSelection} /></div>; })}</div>
        </section>
        <section className={`min-w-0 border border-slate-200 bg-[#E9EDF0] ${view === "single" && singleSide !== "revised" ? "hidden" : ""}`} aria-label="Later version PDF">
          <header className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3"><div className="min-w-0"><h2 className="text-xs font-semibold text-[#003366]">Later version</h2><span className="block truncate text-[10px] text-slate-500">{revisedName}</span></div><span className="shrink-0 text-[10px] text-slate-500">Page {revisedPageNumber} of {revisedPageCount}</span></header>
          <div ref={revisedPane} onScroll={() => syncScroll("revised")} className="max-h-[72vh] min-h-[520px] space-y-3 overflow-auto p-3">{revisedPages.map((page) => { const changes = comparison.changes.filter((change) => change.revisedPageNumber === page.pageNumber); return <div key={page.pageNumber} style={{ width: `${zoom * 100}%` }}><PdfPage document={revisedDocument} pageNumber={page.pageNumber} page={page} highlights={changes.flatMap((change) => change.revisedRects)} anchors={changes.flatMap((change) => change.revisedAnchors)} side="revised" textSelection={textSelection} /></div>; })}</div>
        </section>
        <section className="contracts-diff-rail min-w-0 border border-slate-200 bg-[#FFFCFB]" aria-label="PDF differences">
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
