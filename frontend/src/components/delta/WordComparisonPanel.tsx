"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { DeltaEntry } from "@/lib/delta/compare";
import { markWordSections } from "@/lib/delta/wordDocument";

type WordComparisonPanelProps = {
  originalName: string;
  revisedName: string;
  originalHtml: string;
  revisedHtml: string;
  entries: DeltaEntry[];
  cardView?: ReactNode;
  onViewChange?: (view: "side-by-side" | "cards") => void;
};

function WordPane({ side, name, html, selectedChangeId, containerRef }: {
  side: "original" | "revised";
  name: string;
  html: string;
  selectedChangeId: string;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  return <section className="min-w-0 border border-slate-200 bg-[#E9EDF0]" aria-label={`Contract ${side === "original" ? "1" : "2"} Word document`}>
    <header className="flex min-h-11 items-center gap-2 border-b border-slate-200 bg-white px-3"><div className="min-w-0"><h2 className="text-xs font-semibold text-[#003366]">Contract {side === "original" ? "1" : "2"}</h2><span className="block truncate text-[10px] text-slate-500">{name}</span></div></header>
    <div className="max-h-[72vh] min-h-[520px] overflow-auto p-3">
      <div
        ref={containerRef}
        data-selected-change={selectedChangeId}
        className="mx-auto min-h-full max-w-[780px] bg-white p-6 text-xs leading-6 text-slate-800 shadow-sm sm:p-8 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_h1]:my-4 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:my-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:my-3 [&_h3]:font-semibold [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:my-2 [&_table]:my-4 [&_table]:w-full [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-2"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  </section>;
}

export function WordComparisonPanel({ originalName, revisedName, originalHtml, revisedHtml, entries, cardView, onViewChange }: WordComparisonPanelProps) {
  const [view, setView] = useState<"side-by-side" | "cards">("side-by-side");
  const [selectedChangeId, setSelectedChangeId] = useState(entries[0]?.id || "");
  const originalRef = useRef<HTMLDivElement>(null);
  const revisedRef = useRef<HTMLDivElement>(null);
  const markedOriginal = useMemo(() => markWordSections(originalHtml, entries, "original"), [entries, originalHtml]);
  const markedRevised = useMemo(() => markWordSections(revisedHtml, entries, "revised"), [entries, revisedHtml]);

  useEffect(() => {
    [originalRef.current, revisedRef.current].forEach((container) => {
      if (!container) return;
      const blocks = Array.from(container.querySelectorAll<HTMLElement>("[data-word-change]"));
      blocks.forEach((block) => {
        block.removeAttribute("data-word-selected");
        block.style.outline = "";
        block.style.outlineOffset = "";
        block.style.backgroundColor = "";
      });
      const target = blocks.find((block) => block.getAttribute("data-word-change") === selectedChangeId);
      if (target) {
        target.setAttribute("data-word-selected", "true");
        target.style.outline = "2px solid #C9A84C";
        target.style.outlineOffset = "2px";
        target.style.backgroundColor = "#FCFAF2";
        target.scrollIntoView?.({ block: "center", behavior: "smooth" });
      }
    });
  }, [selectedChangeId, view]);

  const selectView = (next: "side-by-side" | "cards") => {
    setView(next);
    onViewChange?.(next);
  };

  return <section className="space-y-3" aria-label="Word comparison">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex border border-slate-300 bg-white p-1" role="group" aria-label="Comparison view">
        <button type="button" aria-pressed={view === "side-by-side"} onClick={() => selectView("side-by-side")} className={`min-h-9 px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] ${view === "side-by-side" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-[#F7FAFC]"}`}>Side by side</button>
        <button type="button" aria-pressed={view === "cards"} onClick={() => selectView("cards")} className={`min-h-9 px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C] ${view === "cards" ? "bg-[#003366] text-white" : "text-[#003366] hover:bg-[#F7FAFC]"}`}>Cards</button>
      </div>
    </div>

    {view === "cards" ? cardView : <>
      <p role="note" className="border border-slate-200 bg-white px-3 py-2 text-[10px] leading-5 text-slate-600">Word content is rendered in this browser. Page breaks and some Word formatting may differ; source files stay unchanged.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600"><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-rose-200 ring-1 ring-rose-600" />Removed from Contract 1</span><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-emerald-200 ring-1 ring-emerald-600" />Added in Contract 2</span><span className="ml-auto">Source DOCX files stay unchanged</span></div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,0.82fr)]">
        <WordPane side="original" name={originalName} html={markedOriginal} selectedChangeId={selectedChangeId} containerRef={originalRef} />
        <WordPane side="revised" name={revisedName} html={markedRevised} selectedChangeId={selectedChangeId} containerRef={revisedRef} />
        <section className="min-w-0 border border-slate-200 bg-[#FFFCFB]" aria-label="Word differences">
          <header className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3"><h2 className="text-xs font-semibold text-[#003366]">Diff</h2><span className="text-[10px] text-slate-500">{entries.length} change{entries.length === 1 ? "" : "s"}</span></header>
          <div className="max-h-[72vh] min-h-[520px] space-y-2 overflow-auto p-2">
            {entries.map((entry) => <button key={entry.id} type="button" aria-label={`${entry.section} ${entry.summary}`} aria-pressed={selectedChangeId === entry.id} onClick={() => setSelectedChangeId(entry.id)} className={`block w-full border bg-white p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366] ${selectedChangeId === entry.id ? "border-[#C9A84C] shadow-[inset_2px_0_0_#C9A84C]" : "border-slate-200 hover:border-[#31577D]"}`}>
              <span className="block text-[9px] font-bold uppercase tracking-wide text-[#31577D]">{entry.section} · {entry.summary}</span>
              {entry.originalText && <span className="mt-1 block whitespace-pre-wrap text-xs leading-5 text-rose-900"><del>{entry.originalText}</del></span>}
              {entry.revisedText && <span className="mt-1 block whitespace-pre-wrap text-xs leading-5 text-emerald-900"><ins>{entry.revisedText}</ins></span>}
              <span className="mt-2 block text-[10px] text-slate-500">Select to locate this section in both Word files.</span>
            </button>)}
            {entries.length === 0 && <p className="border border-slate-200 bg-white p-3 text-xs text-slate-600">No wording changes were found between these Word documents.</p>}
          </div>
        </section>
      </div>
    </>}
  </section>;
}
