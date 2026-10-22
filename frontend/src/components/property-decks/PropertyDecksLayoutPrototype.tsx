"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, Layers, X } from "lucide-react";
import type { PropertySlideGroup, PropertySlideItem } from "@/lib/property-decks";

// Four read-only Property Decks layout concepts, switchable with ?variant=A|B|C|D.
const variants = [
  { key: "A", name: "Wide comparison", note: "One warehouse per row, with a large lead slide and the key lease facts beside it." },
  { key: "B", name: "Focused preview", note: "A compact option list drives a large slide viewer and a readable slide strip." },
  { key: "C", name: "Slide-by-slide", note: "Every warehouse slide gets a full-width preview so detail is easy to inspect." },
  { key: "D", name: "Arrow-through selection", note: "Use the arrows to browse a warehouse's slides, then add only the slide currently shown." },
] as const;

type Props = { variant: string; groups: PropertySlideGroup[]; selectedCount: number };

function SlideImage({ src, title, className = "" }: { src: string; title: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center overflow-hidden bg-slate-100 ${className}`}>
      <img src={src} alt={title} className="h-full w-full object-contain" />
    </div>
  );
}

function Facts({ group, slide = group.leadSlide }: { group: PropertySlideGroup; slide?: PropertySlideItem }) {
  const specs = slide.specs;
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-slate-200 pt-4 text-sm">
      {[
        ["Location", specs.location], ["Leasable area (GLA)", specs.gla],
        ["Lease rate", specs.leaseRate], ["Clear height", specs.ceilingHeight],
      ].map(([label, value]) => (
        <div key={label} className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="mt-0.5 truncate font-semibold text-[#003366]">{value || "—"}</dd></div>
      ))}
    </dl>
  );
}

function Heading({ group, index }: { group: PropertySlideGroup; index: number }) {
  return <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31577D]">Warehouse option {index + 1}</p><h2 className="mt-1 text-xl font-semibold text-[#003366]">{group.title}</h2><p className="mt-1 text-xs text-slate-500">{group.deckFileName} · {group.slides.length} slides</p></div><span className="shrink-0 border border-[#C9A84C]/70 bg-[#FBF7E9] px-2.5 py-1 text-xs font-semibold text-[#003366]">{group.slides.length} slides</span></div>;
}

function SelectButton({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-10 items-center justify-center gap-2 border px-4 text-sm font-semibold ${selected ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-[#003366] bg-[#003366] text-white hover:bg-[#174778]"}`}>{selected ? <><Check className="h-4 w-4" /> Added to mock shortlist</> : <><Layers className="h-4 w-4" /> Add warehouse to shortlist</>}</button>;
}

export function PropertyDecksLayoutPrototype({ variant, groups, selectedCount }: Props) {
  const [activeVariant, setActiveVariant] = useState(variant);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [shortlisted, setShortlisted] = useState<string[]>([]);
  const [slideIndexByGroup, setSlideIndexByGroup] = useState<Record<string, number>>({});
  const [shortlistedSlideIds, setShortlistedSlideIds] = useState<string[]>([]);
  const activeGroup = groups[Math.min(activeGroupIndex, Math.max(groups.length - 1, 0))];
  const current = variants.find((item) => item.key === activeVariant) || variants[0];

  const switchVariant = useCallback((key: string) => {
    setActiveVariant(key);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.pushState({}, "", url);
  }, []);
  const exitPrototype = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("variant");
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const index = variants.findIndex((item) => item.key === activeVariant);
        switchVariant(variants[(index + (event.key === "ArrowRight" ? 1 : variants.length - 1)) % variants.length].key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeVariant, switchVariant]);

  useEffect(() => {
    const syncFromUrl = () => {
      const key = new URLSearchParams(window.location.search).get("variant");
      if (variants.some((item) => item.key === key)) setActiveVariant(key || "A");
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const toggleShortlist = (groupId: string) => setShortlisted((currentIds) => currentIds.includes(groupId) ? currentIds.filter((id) => id !== groupId) : [...currentIds, groupId]);

  const renderGroup = (group: PropertySlideGroup, index: number) => {
    const added = shortlisted.includes(group.groupId);
    return <article key={group.groupId} className="border border-slate-200 bg-white">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-stretch">
        <div className="w-full lg:w-[58%]"><SlideImage src={group.leadSlide.thumbnailUrl} title={`${group.title}, slide ${group.leadSlide.slideNumber}`} className="aspect-video border border-slate-200" /><p className="mt-2 text-xs text-slate-500">Lead slide · #{group.leadSlide.slideNumber}</p></div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-5"><div><Heading group={group} index={index} /><div className="mt-5"><Facts group={group} /></div>{group.leadSlide.specs.notes && <p className="mt-4 border-l-2 border-[#C9A84C] bg-[#FBF7E9] px-3 py-2 text-xs text-[#003366]">{group.leadSlide.specs.notes}</p>}</div><SelectButton selected={added} onClick={() => toggleShortlist(group.groupId)} /></div>
      </div>
      {group.slides.length > 1 && <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{group.slides.map((slide, slideIndex) => <button type="button" key={slide.id} onClick={() => { setActiveGroupIndex(index); setActiveSlideIndex(slideIndex); switchVariant("B"); }} className="inline-flex items-center gap-2 border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-[#003366] hover:border-[#003366]"><span className="flex h-9 w-14 items-center justify-center bg-slate-100"><img src={slide.thumbnailUrl} alt="" className="max-h-full max-w-full object-contain" /></span>Slide #{slide.slideNumber}</button>)}</div>}
    </article>;
  };

  const moveGroupSlide = (group: PropertySlideGroup, direction: -1 | 1) => {
    setSlideIndexByGroup((currentIndexes) => {
      const currentIndex = currentIndexes[group.groupId] || 0;
      return {
        ...currentIndexes,
        [group.groupId]: (currentIndex + direction + group.slides.length) % group.slides.length,
      };
    });
  };

  const toggleMockSlide = (slideId: string) => {
    setShortlistedSlideIds((currentIds) => currentIds.includes(slideId)
      ? currentIds.filter((id) => id !== slideId)
      : [...currentIds, slideId]);
  };

  const toggleMockGroup = (group: PropertySlideGroup) => {
    const groupSlideIds = group.slides.map((slide) => slide.id);
    const allSelected = groupSlideIds.every((id) => shortlistedSlideIds.includes(id));
    setShortlistedSlideIds((currentIds) => allSelected
      ? currentIds.filter((id) => !groupSlideIds.includes(id))
      : [...new Set([...currentIds, ...groupSlideIds])]);
  };

  const arrowSelectionLayout = <div className="grid items-start gap-4 sm:grid-cols-2">
    {groups.map((group, index) => {
      const slideIndex = Math.min(slideIndexByGroup[group.groupId] || 0, group.slides.length - 1);
      const slide = group.slides[slideIndex] || group.leadSlide;
      const isSelected = shortlistedSlideIds.includes(slide.id);
      const allSelected = group.slides.length > 0 && group.slides.every((part) => shortlistedSlideIds.includes(part.id));
      return <article key={group.groupId} className="flex flex-col border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4"><Heading group={group} index={index} /></div>
        <div className="p-3 pb-0"><SlideImage src={slide.thumbnailUrl} title={`${group.title}, slide ${slide.slideNumber}`} className="aspect-video border border-slate-200" /></div>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
          <button type="button" aria-label={`Previous slide for ${group.title}`} onClick={() => moveGroupSlide(group, -1)} className="grid h-9 w-9 shrink-0 place-items-center border border-slate-300 bg-white text-[#003366] hover:border-[#003366]"><ArrowLeft className="h-4 w-4" /></button>
          <span className="min-w-0 flex-1 truncate text-center text-xs font-semibold text-[#31577D]">Slide #{slide.slideNumber} · {slideIndex + 1} of {group.slides.length}</span>
          <button type="button" aria-label={`Next slide for ${group.title}`} onClick={() => moveGroupSlide(group, 1)} className="grid h-9 w-9 shrink-0 place-items-center border border-slate-300 bg-white text-[#003366] hover:border-[#003366]"><ArrowRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => toggleMockSlide(slide.id)} className={`shrink-0 border px-3 py-2 text-xs font-semibold ${isSelected ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-[#003366] bg-[#003366] text-white hover:bg-[#174778]"}`}>{isSelected ? <><Check className="mr-1 inline h-3.5 w-3.5" />Selected</> : `＋ Add this slide`}</button>
        </div>
        <div className="flex flex-1 flex-col p-4"><Facts group={group} slide={slide} />{slide.specs.notes && <p className="mt-3 border-l-2 border-[#C9A84C] bg-[#FBF7E9] px-2.5 py-2 text-xs text-[#003366]">{slide.specs.notes}</p>}<div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className="text-[11px] text-slate-500">{shortlistedSlideIds.filter((id) => group.slides.some((part) => part.id === id)).length} of {group.slides.length} selected</span><button type="button" onClick={() => toggleMockGroup(group)} className={`border px-3 py-2 text-[11px] font-semibold ${allSelected ? "border-slate-300 bg-white text-[#003366]" : "border-[#003366] bg-white text-[#003366] hover:bg-slate-50"}`}>{allSelected ? "Remove all" : `Add all (${group.slides.length})`}</button></div></div>
      </article>;
    })}
  </div>;

  return <main className="mx-auto w-full max-w-[1440px] space-y-5 pb-28">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#003366]/15 pb-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#31577D]">Property Decks · Layout concepts</p><h1 className="mt-1 text-2xl font-semibold text-[#003366]">Warehouse options</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">Four ways to make the source slides easier to read while reviewing lease details.</p></div><div className="flex items-center gap-3 text-xs text-slate-600"><span>{groups.length} warehouses · {selectedCount} currently in proposal</span><button onClick={exitPrototype} type="button" className="inline-flex min-h-9 items-center gap-1.5 border border-slate-300 bg-white px-3 font-semibold text-[#003366]"><X className="h-3.5 w-3.5" /> Exit layouts</button></div></header>
    <section className="flex items-start gap-3 border border-[#C9A84C]/50 bg-[#FBF7E9] px-4 py-3"><Eye className="mt-0.5 h-4 w-4 shrink-0 text-[#003366]" /><div><p className="text-sm font-semibold text-[#003366]">{current.name}</p><p className="mt-0.5 text-xs text-slate-700">{current.note} Preview images are kept at full slide proportions for legibility.</p></div></section>
    {groups.length === 0 ? <div className="border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">No warehouse slides match the current filters. Exit the layouts and clear the filters to see options.</div> : activeVariant === "A" ? <div className="space-y-4">{groups.map(renderGroup)}</div> : activeVariant === "D" ? arrowSelectionLayout : activeVariant === "B" ? <div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,0.72fr)_minmax(0,2fr)]">
      <nav aria-label="Warehouse options" className="space-y-2 lg:sticky lg:top-4">{groups.map((group, index) => <button type="button" key={group.groupId} onClick={() => { setActiveGroupIndex(index); setActiveSlideIndex(0); }} className={`w-full border p-3 text-left ${index === activeGroupIndex ? "border-[#003366] bg-[#003366] text-white" : "border-slate-200 bg-white text-[#003366] hover:border-[#31577D]"}`}><span className="block text-sm font-semibold">{group.title}</span><span className={`mt-1 block text-xs ${index === activeGroupIndex ? "text-blue-100" : "text-slate-500"}`}>{group.slides.length} slides · {group.leadSlide.specs.gla}</span></button>)}</nav>
      {activeGroup && <article className="border border-slate-200 bg-white p-5"><Heading group={activeGroup} index={activeGroupIndex} /><SlideImage src={activeGroup.slides[Math.min(activeSlideIndex, activeGroup.slides.length - 1)]?.thumbnailUrl || activeGroup.leadSlide.thumbnailUrl} title={`${activeGroup.title}, slide ${activeGroup.slides[Math.min(activeSlideIndex, activeGroup.slides.length - 1)]?.slideNumber}`} className="mt-5 aspect-video border border-slate-200" /><div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>Slide {activeSlideIndex + 1} of {activeGroup.slides.length}</span><span>Use the thumbnails to inspect each slide</span></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{activeGroup.slides.map((slide, index) => <button key={slide.id} type="button" onClick={() => setActiveSlideIndex(index)} className={`border p-1.5 text-left ${index === activeSlideIndex ? "border-[#003366] ring-1 ring-[#003366]" : "border-slate-200"}`}><SlideImage src={slide.thumbnailUrl} title={slide.title} className="aspect-video" /><span className="mt-1 block text-xs font-medium text-[#003366]">Slide #{slide.slideNumber}</span></button>)}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><Facts group={activeGroup} /><SelectButton selected={shortlisted.includes(activeGroup.groupId)} onClick={() => toggleShortlist(activeGroup.groupId)} /></div></article>}
    </div> : <div className="space-y-6">{groups.map((group, index) => <article key={group.groupId} className="border border-slate-200 bg-white"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-5"><Heading group={group} index={index} /><SelectButton selected={shortlisted.includes(group.groupId)} onClick={() => toggleShortlist(group.groupId)} /></div><div className="divide-y divide-slate-200">{group.slides.map((slide, slideIndex) => <section key={slide.id} className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(240px,0.7fr)] xl:items-center"><div><div className="mb-2 flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold text-[#003366]">Slide #{slide.slideNumber} · {slide.slideRole === "property" ? "Warehouse details" : slide.slideRole}</h3><span className="text-xs text-slate-500">{slideIndex + 1} of {group.slides.length}</span></div><SlideImage src={slide.thumbnailUrl} title={`${group.title}, slide ${slide.slideNumber}`} className="aspect-video border border-slate-200" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#31577D]">{slide.title}</p><Facts group={group} />{slide.specs.notes && <p className="mt-3 text-xs leading-5 text-slate-600">{slide.specs.notes}</p>}</div></section>)}</div></article>)}</div>}
    <PrototypeSwitcher active={activeVariant} onSwitch={switchVariant} selectedCount={activeVariant === "D" ? shortlistedSlideIds.length : shortlisted.length} />
  </main>;
}

function PrototypeSwitcher({ active, onSwitch, selectedCount }: { active: string; onSwitch: (value: string) => void; selectedCount: number }) {
  const index = useMemo(() => variants.findIndex((item) => item.key === active), [active]);
  const change = (direction: number) => onSwitch(variants[(index + direction + variants.length) % variants.length].key);
  return <aside aria-label="Prototype layout switcher" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 border border-slate-700 bg-[#10283f] px-3 py-2 text-white shadow-xl"><button type="button" aria-label="Previous layout" onClick={() => change(-1)} className="grid h-9 w-9 place-items-center border border-white/30 hover:bg-white/10"><ArrowLeft className="h-4 w-4" /></button><div className="min-w-40 text-center"><p className="text-xs font-semibold">{active} · {variants[index]?.name}</p><p className="mt-0.5 text-[10px] text-blue-100">Use ← → to switch · {selectedCount} in mock shortlist</p></div><button type="button" aria-label="Next layout" onClick={() => change(1)} className="grid h-9 w-9 place-items-center border border-white/30 hover:bg-white/10"><ArrowRight className="h-4 w-4" /></button></aside>;
}
