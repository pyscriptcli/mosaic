"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { resolvePairedPage, type PdfComparisonResult, type PdfPageText, type PdfTextAnchor, type PdfTextRect } from "@/lib/delta/pdfCompare";
import { groupPdfChanges } from "@/lib/delta/changeGroups";
import { measurePdfTextAnchors } from "@/lib/delta/pdfTextLayer";
import { createFrameScheduler } from "@/lib/delta/frameScheduler";

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

type ZoomAnchor = { pageNumber: number; xRatio: number; yRatio: number };
type ZoomAnchors = Partial<Record<"original" | "revised", ZoomAnchor>>;

function excerpt(text: string) {
  const compact = text.replace(/\s+/gu, " ").trim();
  return compact.length > 72 ? `${compact.slice(0, 72).trimEnd()}…` : compact;
}

function changePreview(originalText: string, revisedText: string) {
  if (originalText && revisedText) return `Earlier: ${excerpt(originalText)} · Later: ${excerpt(revisedText)}`;
  return originalText ? `Removed: ${excerpt(originalText)}` : `Added: ${excerpt(revisedText)}`;
}

function PdfPage({ document, pageNumber, page, highlights, anchors, selectedHighlights = [], side }: {
  document?: PDFDocumentProxy;
  pageNumber: number;
  page?: PdfPageText;
  highlights: PdfTextRect[];
  anchors: PdfTextAnchor[];
  selectedHighlights?: PdfTextRect[];
  side: "original" | "revised";
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
      if (!active || !anchors.length || !textLayerRef.current || !pageRef.current) return;
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
  }, [anchors, document, page, pageNumber, scale, nearViewport]);

  const visibleHighlights = measuredHighlights?.length ? measuredHighlights : highlights;

  return <div ref={pageRef} data-pdf-page={pageNumber} className="relative mx-auto w-full bg-white shadow-sm" style={{ aspectRatio: page ? `${page.width} / ${page.height}` : "612 / 792" }}>
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
    {page && selectedHighlights.length > 0 && <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">{selectedHighlights.map((rect, index) => <span key={`selected-${index}`} data-selected-diff-region="true" className="absolute rounded-[1px] ring-2 ring-[#C9A84C] ring-offset-1" style={{ left: `${rect.x / page.width * 100}%`, top: `${rect.y / page.height * 100}%`, width: `${Math.max(rect.width / page.width * 100, 0.7)}%`, height: `${Math.max(rect.height / page.height * 100, 0.8)}%` }} />)}</div>}
    {renderError && <p role="alert" className="absolute inset-x-2 bottom-2 border border-red-300 bg-white p-2 text-center text-[10px] text-red-900">This PDF page could not be rendered.</p>}
  </div>;
}

export function PdfComparisonPanel({ originalName, revisedName, originalPages, revisedPages, originalDocument, revisedDocument, comparison, cardView, onViewChange }: PdfComparisonPanelProps) {
  const [view, setView] = useState<"side-by-side" | "single" | "cards">("side-by-side");
  const [singleSide, setSingleSide] = useState<"original" | "revised">("original");
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedChangeId, setSelectedChangeId] = useState(comparison.changes[0]?.id || "");
  const [originalPageNumber, setOriginalPageNumber] = useState(comparison.changes[0]?.originalPageNumber || 1);
  const [revisedPageNumber, setRevisedPageNumber] = useState(comparison.changes[0]?.revisedPageNumber || 1);
  const originalPageCount = originalPages[originalPages.length - 1]?.pageNumber || 1;
  const revisedPageCount = revisedPages[revisedPages.length - 1]?.pageNumber || 1;
  const scanCount = comparison.scannedPages.original.length + comparison.scannedPages.revised.length;
  const selectedChange = comparison.changes.find((change) => change.id === selectedChangeId);
  const [pagePairIndex, setPagePairIndex] = useState(() => Math.max(0, comparison.pageAlignment.findIndex((pair) => pair.originalPageNumber === originalPageNumber && pair.revisedPageNumber === revisedPageNumber)));
  const changeGroups = useMemo(() => groupPdfChanges(comparison.changes, originalPages, revisedPages), [comparison.changes, originalPages, revisedPages]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const originalPane = useRef<HTMLDivElement>(null);
  const revisedPane = useRef<HTMLDivElement>(null);
  const zoomAnchors = useRef<ZoomAnchors>({});
  const syncLock = useRef(false);
  const pendingScrollSide = useRef<"original" | "revised">("original");
  const visiblePages = useRef({ original: originalPageNumber, revised: revisedPageNumber });
  const scheduleScrollSync = useMemo(() => createFrameScheduler((callback) => requestAnimationFrame(callback)), []);
  const changes = comparison.changes;
  const originalChangesByPage = useMemo(() => {
    const pages = new Map<number, typeof changes>();
    for (const change of changes) {
      if (change.originalPageNumber == null) continue;
      const changes = pages.get(change.originalPageNumber) || [];
      changes.push(change);
      pages.set(change.originalPageNumber, changes);
    }
    return pages;
  }, [changes]);
  const revisedChangesByPage = useMemo(() => {
    const pages = new Map<number, typeof changes>();
    for (const change of changes) {
      if (change.revisedPageNumber == null) continue;
      const changes = pages.get(change.revisedPageNumber) || [];
      changes.push(change);
      pages.set(change.revisedPageNumber, changes);
    }
    return pages;
  }, [changes]);

  useEffect(() => () => scheduleScrollSync.cancel(), [scheduleScrollSync]);

  const setZoomCentered = (nextZoom: number) => {
    if (nextZoom === zoom) return;
    const anchors: ZoomAnchors = {};
    for (const side of ["original", "revised"] as const) {
      const pane = side === "original" ? originalPane.current : revisedPane.current;
      if (!pane) continue;
      const paneRect = pane.getBoundingClientRect();
      const centerX = paneRect.left + pane.clientWidth / 2;
      const centerY = paneRect.top + pane.clientHeight / 2;
      const pages = Array.from(pane.querySelectorAll<HTMLElement>("[data-pdf-page]"));
      const pageAtCenter = pages.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.left <= centerX && rect.right >= centerX && rect.top <= centerY && rect.bottom >= centerY;
      });
      const page = pageAtCenter ?? pages.reduce<HTMLElement | null>((nearest, candidate) => {
        const rect = candidate.getBoundingClientRect();
        const distance = centerY < rect.top ? rect.top - centerY : centerY > rect.bottom ? centerY - rect.bottom : 0;
        if (!nearest) return candidate;
        const nearestRect = nearest.getBoundingClientRect();
        const nearestDistance = centerY < nearestRect.top ? nearestRect.top - centerY : centerY > nearestRect.bottom ? centerY - nearestRect.bottom : 0;
        return distance < nearestDistance ? candidate : nearest;
      }, null);
      if (!page) continue;
      const rect = page.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      anchors[side] = {
        pageNumber: Number(page.dataset.pdfPage),
        xRatio: Math.min(1, Math.max(0, (centerX - rect.left) / rect.width)),
        yRatio: Math.min(1, Math.max(0, (centerY - rect.top) / rect.height)),
      };
    }
    zoomAnchors.current = anchors;
    setZoom(nextZoom);
  };

  useLayoutEffect(() => {
    const anchors = zoomAnchors.current;
    const hasAnchors = Boolean(anchors.original || anchors.revised);
    if (hasAnchors) {
      scheduleScrollSync.cancel();
      syncLock.current = true;
    }
    for (const side of ["original", "revised"] as const) {
      const anchor = anchors[side];
      const pane = side === "original" ? originalPane.current : revisedPane.current;
      if (!anchor || !pane) continue;
      const page = pane.querySelector<HTMLElement>(`[data-pdf-page="${anchor.pageNumber}"]`);
      if (!page) continue;
      const paneRect = pane.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      pane.scrollLeft += pageRect.left + anchor.xRatio * pageRect.width - (paneRect.left + pane.clientWidth / 2);
      pane.scrollTop += pageRect.top + anchor.yRatio * pageRect.height - (paneRect.top + pane.clientHeight / 2);
    }
    zoomAnchors.current = {};
    if (hasAnchors) requestAnimationFrame(() => requestAnimationFrame(() => { syncLock.current = false; }));
  }, [scheduleScrollSync, zoom]);

  const goToPage = (side: "original" | "revised", pageNumber: number) => {
    const pane = side === "original" ? originalPane.current : revisedPane.current;
    pane?.querySelector<HTMLElement>(`[data-pdf-page="${pageNumber}"]`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    visiblePages.current[side] = pageNumber;
    if (side === "original") setOriginalPageNumber(pageNumber); else setRevisedPageNumber(pageNumber);
  };
  const goToAlignment = (index: number) => {
    const nextIndex = Math.max(0, Math.min(comparison.pageAlignment.length - 1, index));
    const pair = comparison.pageAlignment[nextIndex];
    if (!pair) return;
    setPagePairIndex(nextIndex);
    if (pair.originalPageNumber != null) goToPage("original", pair.originalPageNumber);
    if (pair.revisedPageNumber != null) goToPage("revised", pair.revisedPageNumber);
  };
  const centerChange = (side: "original" | "revised", pageNumber: number, rects: PdfTextRect[]) => {
    const pane = side === "original" ? originalPane.current : revisedPane.current;
    const pageElement = pane?.querySelector<HTMLElement>(`[data-pdf-page="${pageNumber}"]`);
    if (!pane || !pageElement) return;
    visiblePages.current[side] = pageNumber;
    if (side === "original") setOriginalPageNumber(pageNumber); else setRevisedPageNumber(pageNumber);
    const rect = rects[0];
    if (!rect) { pageElement.scrollIntoView?.({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); return; }
    const bounds = pageElement.getBoundingClientRect();
    const page = (side === "original" ? originalPages : revisedPages).find((candidate) => candidate.pageNumber === pageNumber);
    if (!page || !bounds.height) return;
    const targetY = bounds.top - pane.getBoundingClientRect().top + pane.scrollTop + ((rect.y + rect.height / 2) / page.height) * bounds.height;
    pane.scrollTo({ top: Math.max(0, targetY - pane.clientHeight / 2), behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  const syncScroll = (side: "original" | "revised") => {
    if (syncLock.current) return;
    pendingScrollSide.current = side;
    scheduleScrollSync(() => {
      const activeSide = pendingScrollSide.current;
      const source = activeSide === "original" ? originalPane.current : revisedPane.current;
      const target = activeSide === "original" ? revisedPane.current : originalPane.current;
      if (!source) return;
      const sourceRect = source.getBoundingClientRect();
      const current = Array.from(source.querySelectorAll<HTMLElement>("[data-pdf-page]"))
        .find((element) => element.getBoundingClientRect().bottom > sourceRect.top + 15);
      if (!current) return;
      const sourcePage = Number(current.dataset.pdfPage);
      const pairIndex = comparison.pageAlignment.findIndex((pair) => pair[activeSide === "original" ? "originalPageNumber" : "revisedPageNumber"] === sourcePage);
      if (pairIndex >= 0) setPagePairIndex(pairIndex);
      const sidePage = activeSide === "original" ? "original" : "revised";
      if (visiblePages.current[sidePage] !== sourcePage) {
        visiblePages.current[sidePage] = sourcePage;
        if (activeSide === "original") setOriginalPageNumber(sourcePage); else setRevisedPageNumber(sourcePage);
      }
      if (!target) return;
      const targetPage = resolvePairedPage(comparison.pageAlignment, activeSide, sourcePage);
      const destination = targetPage == null ? null : target.querySelector<HTMLElement>(`[data-pdf-page="${targetPage}"]`);
      if (!destination) return;
      const sourcePageTop = current.getBoundingClientRect().top - sourceRect.top + source.scrollTop;
      const ratio = Math.min(1, Math.max(0, (source.scrollTop - sourcePageTop) / Math.max(1, current.offsetHeight)));
      const targetRect = target.getBoundingClientRect();
      const destinationTop = destination.getBoundingClientRect().top - targetRect.top + target.scrollTop;
      const nextScrollTop = destinationTop + ratio * destination.offsetHeight;
      if (Math.abs(target.scrollTop - nextScrollTop) <= 2) return;
      syncLock.current = true;
      target.scrollTop = nextScrollTop;
      requestAnimationFrame(() => requestAnimationFrame(() => { syncLock.current = false; }));
    });
  };

  const selectChange = (id: string) => {
    setSelectedChangeId(id);
    const group = changeGroups.find((candidate) => candidate.changes.some((item) => item.id === id));
    if (group) setExpandedGroupId(group.id);
    const change = comparison.changes.find((item) => item.id === id);
    if (!change) return;
    const pairIndex = comparison.pageAlignment.findIndex((pair) => (change.originalPageNumber != null && pair.originalPageNumber === change.originalPageNumber) || (change.revisedPageNumber != null && pair.revisedPageNumber === change.revisedPageNumber));
    if (pairIndex >= 0) setPagePairIndex(pairIndex);
    syncLock.current = true;
    if (change.originalPageNumber) centerChange("original", change.originalPageNumber, change.originalRects);
    else if (change.revisedPageNumber) { const paired = resolvePairedPage(comparison.pageAlignment, "revised", change.revisedPageNumber); if (paired != null) goToPage("original", paired); }
    if (change.revisedPageNumber) centerChange("revised", change.revisedPageNumber, change.revisedRects);
    else if (change.originalPageNumber) { const paired = resolvePairedPage(comparison.pageAlignment, "original", change.originalPageNumber); if (paired != null) goToPage("revised", paired); }
    window.setTimeout(() => { syncLock.current = false; }, 350);
  };
  const selectView = (next: "side-by-side" | "single" | "cards") => {
    setView(next);
    if (next !== "single") onViewChange?.(next);
  };
  const cardsContent = cardView ?? (
    <section className="grid gap-2 md:grid-cols-2" aria-label="PDF change cards">
      {comparison.changes.map((change) => <button key={change.id} type="button" aria-pressed={selectedChangeId === change.id} onClick={() => selectChange(change.id)} className={`border bg-white p-3 text-left ${selectedChangeId === change.id ? "border-[#C9A84C]" : "border-slate-200"}`}>
        <span className="block text-xs font-semibold text-[#003366]">Earlier page {change.originalPageNumber ?? "not present"} · Later page {change.revisedPageNumber ?? "not present"}</span>
        {change.originalText && <span className="mt-2 block text-xs text-rose-900"><del>{change.originalText}</del></span>}
        {change.revisedText && <span className="mt-1 block text-xs text-emerald-900"><ins>{change.revisedText}</ins></span>}
      </button>)}
    </section>
  );

  return <section className="space-y-3" aria-label="PDF comparison">
    <div role="toolbar" aria-label="PDF comparison controls" className="contracts-pdf-toolbar flex flex-wrap items-center gap-2 border border-slate-200 bg-[#F7FAFC] p-2">
      <div className="inline-flex shrink-0 border border-slate-300 bg-white p-1" role="group" aria-label="PDF comparison view">
        <button type="button" aria-pressed={view === "side-by-side"} onClick={() => selectView("side-by-side")} className={`min-h-9 px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] ${view === "side-by-side" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-[#F7FAFC]"}`}>Side by side</button>
        <button type="button" aria-pressed={view === "single"} onClick={() => selectView("single")} className={`min-h-9 px-3 text-xs font-semibold ${view === "single" ? "bg-[#003366] text-white" : "text-[#003366]"}`}>Single</button>
        <button type="button" aria-pressed={view === "cards"} onClick={() => selectView("cards")} className={`min-h-9 px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] ${view === "cards" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-[#F7FAFC]"}`}>Cards</button>
      </div>
      {view === "single" && <>
        <label className="sr-only" htmlFor="pdf-single-version">Single version</label>
        <select id="pdf-single-version" value={singleSide} onChange={(event) => setSingleSide(event.target.value as "original" | "revised")} className="h-9 border border-slate-300 bg-white px-2 text-xs text-[#003366]"><option value="original">Earlier</option><option value="revised">Later</option></select>
        <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">{singleSide === "original" ? "Earlier" : "Later"} <input aria-label={`${singleSide === "original" ? "Earlier" : "Later"} page`} type="number" min={1} max={singleSide === "original" ? originalPageCount : revisedPageCount} value={singleSide === "original" ? originalPageNumber : revisedPageNumber} onChange={(event) => goToPage(singleSide, Math.min(singleSide === "original" ? originalPageCount : revisedPageCount, Math.max(1, Number(event.target.value))))} className="w-12 border border-slate-300 bg-white px-1.5 py-1.5 tabular-nums text-[#003366]" /> / {singleSide === "original" ? originalPageCount : revisedPageCount}</label>
      </>}
      {view !== "cards" && <div className="ml-auto flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
      <label className="sr-only" htmlFor="pdf-doc-search">Search documents</label>
      <input id="pdf-doc-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents" className="min-h-9 w-36 min-w-0 border border-slate-300 bg-white px-2 text-xs" onKeyDown={(event) => { if (event.key === "Enter" && search.trim()) { const query = search.toLocaleLowerCase(); const originalHit = originalPages.find((page) => page.spans.some((span) => span.text.toLocaleLowerCase().includes(query))); const revisedHit = revisedPages.find((page) => page.spans.some((span) => span.text.toLocaleLowerCase().includes(query))); if (originalHit) goToPage("original", originalHit.pageNumber); if (revisedHit) goToPage("revised", revisedHit.pageNumber); } }} />
      {view === "side-by-side" && <div className="inline-flex h-9 items-center border border-slate-300 bg-white" role="group" aria-label="Page pair selector">
        <button type="button" aria-label="Previous page pair" disabled={pagePairIndex <= 0} onClick={() => goToAlignment(pagePairIndex - 1)} className="grid h-8 w-8 place-items-center text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] disabled:text-slate-300"><ChevronLeft aria-hidden="true" size={16} /></button>
        <span aria-live="polite" className="min-w-16 px-1 text-center text-[11px] tabular-nums text-slate-600">{pagePairIndex + 1} / {comparison.pageAlignment.length}</span>
        <button type="button" aria-label="Next page pair" disabled={pagePairIndex >= comparison.pageAlignment.length - 1} onClick={() => goToAlignment(pagePairIndex + 1)} className="grid h-8 w-8 place-items-center text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] disabled:text-slate-300"><ChevronRight aria-hidden="true" size={16} /></button>
      </div>}
      <details className="relative">
        <summary role="button" aria-label="Zoom options" title="Zoom options" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center border border-slate-300 bg-white text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFBF00]"><MoreHorizontal aria-hidden="true" className="h-5 w-5" /></summary>
        <div className="absolute right-0 z-30 mt-1 w-48 border border-slate-300 bg-white p-2 shadow-lg">
          <p className="px-2 py-1 text-[11px] font-semibold text-slate-600">Zoom · {Math.round(zoom * 100)}%</p>
          <div className="grid grid-cols-3 gap-1">
            {[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((preset) => <button key={preset} type="button" aria-pressed={zoom === preset} onClick={() => setZoomCentered(preset)} className={`min-h-9 border px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] ${zoom === preset ? "border-[#003366] bg-[#003366] text-white" : "border-slate-200 bg-white text-[#003366] hover:bg-[#F7FAFC]"}`}>{preset === 1 ? "Fit width" : `${Math.round(preset * 100)}%`}</button>)}
          </div>
        </div>
      </details>
      </div>}
    </div>

    {scanCount > 0 && <p role="status" className="border border-amber-300 bg-[#FCFAF2] px-3 py-2 text-xs leading-5 text-[#66551F]">{scanCount} page{scanCount === 1 ? " has" : "s have"} no selectable text, so text differences can’t be checked there. Scanned pages remain visible in the source PDFs.</p>}

    {view === "cards" ? cardsContent : <>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600"><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-rose-200 ring-1 ring-rose-600" />Removed from earlier version</span><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-emerald-200 ring-1 ring-emerald-600" />Added in later version</span><span className="ml-auto">Source PDFs stay unchanged</span></div>
      <div className={`grid min-w-0 gap-3 ${view === "single" ? "xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.82fr)]" : "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,0.82fr)]"}`}>
        <section className={`min-w-0 border border-slate-200 bg-[#E9EDF0] ${view === "single" && singleSide !== "original" ? "hidden" : ""}`} aria-label="Earlier version PDF">
          <header className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3"><div className="min-w-0"><h2 className="text-xs font-semibold text-[#003366]">Earlier version</h2><span className="block truncate text-[10px] text-slate-500">{originalName}</span></div><span className="shrink-0 text-[10px] text-slate-500">Page {originalPageNumber} of {originalPageCount}</span></header>
          <div ref={originalPane} onScroll={() => syncScroll("original")} className="max-h-[72vh] min-h-[520px] space-y-3 overflow-auto p-3">{originalPages.map((page) => { const changes = originalChangesByPage.get(page.pageNumber) || []; return <div key={page.pageNumber} style={{ width: `${zoom * 100}%` }}><PdfPage document={originalDocument} pageNumber={page.pageNumber} page={page} highlights={changes.flatMap((change) => change.originalRects)} anchors={changes.flatMap((change) => change.originalAnchors)} selectedHighlights={selectedChange?.originalPageNumber === page.pageNumber ? selectedChange.originalRects : []} side="original" /></div>; })}</div>
        </section>
        <section className={`min-w-0 border border-slate-200 bg-[#E9EDF0] ${view === "single" && singleSide !== "revised" ? "hidden" : ""}`} aria-label="Later version PDF">
          <header className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3"><div className="min-w-0"><h2 className="text-xs font-semibold text-[#003366]">Later version</h2><span className="block truncate text-[10px] text-slate-500">{revisedName}</span></div><span className="shrink-0 text-[10px] text-slate-500">Page {revisedPageNumber} of {revisedPageCount}</span></header>
          <div ref={revisedPane} onScroll={() => syncScroll("revised")} className="max-h-[72vh] min-h-[520px] space-y-3 overflow-auto p-3">{revisedPages.map((page) => { const changes = revisedChangesByPage.get(page.pageNumber) || []; return <div key={page.pageNumber} style={{ width: `${zoom * 100}%` }}><PdfPage document={revisedDocument} pageNumber={page.pageNumber} page={page} highlights={changes.flatMap((change) => change.revisedRects)} anchors={changes.flatMap((change) => change.revisedAnchors)} selectedHighlights={selectedChange?.revisedPageNumber === page.pageNumber ? selectedChange.revisedRects : []} side="revised" /></div>; })}</div>
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
