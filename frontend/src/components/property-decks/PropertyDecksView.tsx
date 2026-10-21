"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Edit3,
  ExternalLink,
  FolderOpen,
  Layers,
  LoaderCircle,
  MapPin,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  applySlideOverrides,
  buildCompilationManifest,
  filterPropertySlides,
  reorderSelectedSlides,
  type DeckCompilationMode,
  type PropertyDeckCatalog,
  type PropertySlideItem,
  type PropertySlideOverride,
  type SlideRole,
} from "@/lib/property-decks";
import { readBrowserPageCache, writeBrowserPageCache } from "@/lib/browserPageCache";

const CONFIG_STORAGE_KEY = "mosaic_property_decks_config_v1";
const OVERRIDES_STORAGE_KEY = "mosaic_property_decks_overrides_v1";
const CART_STORAGE_KEY = "mosaic_property_decks_cart_v1";

interface StoredFolderConfig {
  sourceFolder: string;
  outputFolder: string;
}

interface CompiledResult {
  outputPath: string;
  fileName: string;
  slideCount: number;
  engine: string;
}

export function PropertyDecksView({
  userId,
  userName,
  userEmail,
}: {
  userId?: string;
  userName?: string;
  userEmail?: string;
}) {
  const [catalog, setCatalog] = useState<PropertyDeckCatalog | null>(null);
  const [sourceFolder, setSourceFolder] = useState("");
  const [outputFolder, setOutputFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [draftSourceFolder, setDraftSourceFolder] = useState("");
  const [draftOutputFolder, setDraftOutputFolder] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [deckFilter, setDeckFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState<"all" | SlideRole>("property");
  const [minGlaInput, setMinGlaInput] = useState("");
  const [maxGlaInput, setMaxGlaInput] = useState("");

  // Overrides & Proposal Cart
  const [overrides, setOverrides] = useState<Record<string, PropertySlideOverride>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, PropertySlideOverride>) : {};
    } catch {
      return {};
    }
  });
  const [selectedSlideIds, setSelectedSlideIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PropertySlideOverride>({});

  // Proposal Details
  const [deckMode, setDeckMode] = useState<DeckCompilationMode>("standard");
  const [clientName, setClientName] = useState("");
  const [projectTitle, setProjectTitle] = useState("Industrial Warehouse Property Options");
  const [brokerName, setBrokerName] = useState(() => userName || "PRIME Industrial Advisory");
  const [brokerEmail] = useState(() => userEmail || "industrial@primephilippines.com");
  const [brokerPhone] = useState("+63 2 8888 0000");
  const [proposalDate, setProposalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [compiledResult, setCompiledResult] = useState<CompiledResult | null>(null);

  // Load saved browser config and initial catalog
  useEffect(() => {
    let savedConfig: StoredFolderConfig | null = null;
    try {
      const rawConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (rawConfig) savedConfig = JSON.parse(rawConfig) as StoredFolderConfig;
    } catch {
      // Ignore storage read errors
    }

    async function bootstrap() {
      setLoading(true);
      setError(null);
      try {
        const cachedInDb = await readBrowserPageCache<PropertyDeckCatalog>(
          userId || "local",
          "property-decks:catalog",
        );
        if (cachedInDb?.slides?.length) {
          setCatalog(cachedInDb);
          setSourceFolder(savedConfig?.sourceFolder || cachedInDb.sourceFolder);
          setOutputFolder(savedConfig?.outputFolder || cachedInDb.outputFolder);
        }

        const res = await fetch("/api/property-decks", { cache: "no-store" });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Unable to load Property Decks catalog.");

        if (payload.catalog) {
          setCatalog(payload.catalog);
          const nextSource = savedConfig?.sourceFolder || payload.catalog.sourceFolder;
          const nextOutput = savedConfig?.outputFolder || payload.catalog.outputFolder;
          setSourceFolder(nextSource);
          setOutputFolder(nextOutput);
          void writeBrowserPageCache(userId || "local", "property-decks:catalog", payload.catalog);
        } else {
          const fallbackFolder = savedConfig?.sourceFolder || payload.suggestedDefaultFolder || "";
          const fallbackOutput =
            savedConfig?.outputFolder ||
            (fallbackFolder ? `${fallbackFolder}\\Compiled Proposals` : "");
          setSourceFolder(fallbackFolder);
          setOutputFolder(fallbackOutput);
          setDraftSourceFolder(fallbackFolder);
          setDraftOutputFolder(fallbackOutput);
          setFolderModalOpen(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load Property Decks.");
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, [userId]);

  const persistOverrides = (next: Record<string, PropertySlideOverride>) => {
    setOverrides(next);
    try {
      localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  };

  const persistCart = (next: string[]) => {
    setSelectedSlideIds(next);
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  };

  const runFolderIndex = useCallback(
    async (targetSource: string, targetOutput: string) => {
      if (!targetSource.trim()) {
        setError("Enter a valid OneDrive source folder path to index.");
        return;
      }
      setIndexing(true);
      setError(null);
      setStatusMessage(null);
      try {
        const nextConfig: StoredFolderConfig = {
          sourceFolder: targetSource.trim(),
          outputFolder:
            targetOutput.trim() || `${targetSource.trim().replace(/[\\/]+$/, "")}\\Compiled Proposals`,
        };
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
        setSourceFolder(nextConfig.sourceFolder);
        setOutputFolder(nextConfig.outputFolder);

        const res = await fetch("/api/property-decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceFolder: nextConfig.sourceFolder,
            outputFolder: nextConfig.outputFolder,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Indexing failed.");

        setCatalog(payload.catalog);
        void writeBrowserPageCache(userId || "local", "property-decks:catalog", payload.catalog);
        setFolderModalOpen(false);
        setStatusMessage(
          `Indexed ${payload.catalog.slides.length} slides across ${payload.catalog.decksCount} presentation decks.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to index OneDrive folder.");
      } finally {
        setIndexing(false);
      }
    },
    [userId],
  );

  const allSlides = useMemo(() => catalog?.slides || [], [catalog]);

  const deckOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const slide of allSlides) {
      if (!map.has(slide.deckId)) map.set(slide.deckId, slide.deckFileName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allSlides]);

  const locationOptions = useMemo(() => {
    const locs = new Set<string>();
    for (const slide of allSlides) {
      const effective = applySlideOverrides(slide, overrides);
      const loc = effective.specs.location?.trim();
      if (loc && loc !== "Metro Manila / Luzon") {
        locs.add(loc);
      }
    }
    return Array.from(locs).sort();
  }, [allSlides, overrides]);

  const filteredSlides = useMemo(() => {
    const minGla = minGlaInput.trim() ? Number(minGlaInput) : undefined;
    const maxGla = maxGlaInput.trim() ? Number(maxGlaInput) : undefined;
    return filterPropertySlides(
      allSlides,
      {
        query: searchQuery,
        location: locationFilter,
        deckId: deckFilter,
        roleFilter,
        minGla: Number.isFinite(minGla) ? minGla : undefined,
        maxGla: Number.isFinite(maxGla) ? maxGla : undefined,
      },
      overrides,
    );
  }, [allSlides, searchQuery, locationFilter, deckFilter, roleFilter, minGlaInput, maxGlaInput, overrides]);

  const activeProposalManifest = useMemo(
    () =>
      buildCompilationManifest({
        selectedSlideIds,
        catalogSlides: allSlides,
        overrides,
        proposal: {
          clientName: clientName || "Valued Client",
          projectTitle: projectTitle || "Industrial Warehouse Property Options",
          brokerName: brokerName || "PRIME Industrial Advisory",
          brokerEmail,
          brokerPhone,
          date: proposalDate,
          mode: deckMode,
        },
      }),
    [
      selectedSlideIds,
      allSlides,
      overrides,
      clientName,
      projectTitle,
      brokerName,
      brokerEmail,
      brokerPhone,
      proposalDate,
      deckMode,
    ],
  );

  const toggleSelectSlide = (slideId: string) => {
    if (selectedSlideIds.includes(slideId)) {
      persistCart(selectedSlideIds.filter((id) => id !== slideId));
    } else {
      persistCart([...selectedSlideIds, slideId]);
    }
  };

  const moveCartSlide = (index: number, direction: -1 | 1) => {
    const next = reorderSelectedSlides(selectedSlideIds, index, index + direction);
    persistCart(next);
  };

  const openSpecEditor = (slide: PropertySlideItem) => {
    const effective = applySlideOverrides(slide, overrides);
    setEditingSlideId(slide.id);
    setEditDraft({
      propertyName: effective.specs.propertyName,
      location: effective.specs.location,
      gla: effective.specs.gla,
      ceilingHeight: effective.specs.ceilingHeight,
      leaseRate: effective.specs.leaseRate,
      powerSupply: effective.specs.powerSupply,
      loadingBays: effective.specs.loadingBays,
      notes: effective.specs.notes,
    });
  };

  const saveSpecEditor = () => {
    if (!editingSlideId) return;
    const next = {
      ...overrides,
      [editingSlideId]: editDraft,
    };
    persistOverrides(next);
    setEditingSlideId(null);
  };

  const resetSpecOverride = () => {
    if (!editingSlideId) return;
    const next = { ...overrides };
    delete next[editingSlideId];
    persistOverrides(next);
    setEditingSlideId(null);
  };

  const handleCompileDeck = async () => {
    if (selectedSlideIds.length === 0) {
      setError("Select at least one property slide to compile a deck.");
      return;
    }
    setCompiling(true);
    setError(null);
    setCompiledResult(null);
    try {
      const res = await fetch("/api/property-decks/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedSlideIds,
          slides: allSlides,
          overrides,
          outputFolder:
            outputFolder || (sourceFolder ? `${sourceFolder}\\Compiled Proposals` : undefined),
          proposal: {
            clientName: clientName.trim() || "Valued Client",
            projectTitle: projectTitle.trim() || "Industrial Warehouse Property Options",
            brokerName: brokerName.trim() || "PRIME Industrial Advisory",
            brokerEmail: brokerEmail.trim(),
            brokerPhone: brokerPhone.trim(),
            date: proposalDate,
            mode: deckMode,
          },
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Compilation failed.");

      setCompiledResult({
        outputPath: payload.outputPath,
        fileName: payload.fileName,
        slideCount: payload.slideCount,
        engine: payload.engine,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compile presentation deck.");
    } finally {
      setCompiling(false);
    }
  };

  const triggerWindowsOpen = async (targetPath: string, action: "open-file" | "reveal-folder") => {
    try {
      await fetch("/api/property-decks/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath, action }),
      });
    } catch {
      // Ignore desktop open failure in browser-only test environments
    }
  };

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-5 pb-8">
      {/* Mosaic Standard Page Header */}
      <header className="flex min-h-[58px] flex-col justify-between gap-2 border-b border-[#003366]/15 pb-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-[#C9A84C]/60 bg-[#FBF7E9] text-[#003366]"
          >
            <Presentation className="h-4 w-4" />
          </span>
          <div className="min-w-0 border-l-2 border-[#C9A84C] py-0.5 pl-2.5">
            <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#31577D]">
              Tools · Slide Bank & Proposal Compiler
            </p>
            <h1 className="truncate text-xl font-semibold tracking-tight text-[#003366]">
              Property Decks
            </h1>
            <p className="mt-0.5 truncate text-xs text-slate-600">
              {sourceFolder
                ? `OneDrive: ${sourceFolder} · ${allSlides.length} indexed slides (${catalog?.decksCount || 0} decks)`
                : "Connect your local synced OneDrive folder to index warehouse slides"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDraftSourceFolder(sourceFolder);
              setDraftOutputFolder(outputFolder);
              setFolderModalOpen(true);
            }}
            className="inline-flex h-8 min-h-8 items-center justify-center gap-1.5 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366] transition-colors hover:border-[#003366]"
          >
            <Settings2 aria-hidden="true" className="h-3.5 w-3.5" />
            OneDrive Path
          </button>
          <button
            type="button"
            onClick={() => void runFolderIndex(sourceFolder, outputFolder)}
            disabled={indexing || !sourceFolder}
            className="inline-flex h-8 min-h-8 items-center justify-center gap-1.5 border border-[#003366] bg-[#003366] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#174778] disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${indexing ? "animate-spin" : ""}`} />
            {indexing ? "Indexing OneDrive…" : "Scan & Index Decks"}
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="border border-amber-300 bg-[#FBF7E9] px-4 py-3 text-xs text-[#003366]">
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {statusMessage && (
        <div role="status" className="border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
          {statusMessage}
        </div>
      )}

      {/* Main Split Workspace: Left Gallery (2/3) + Right Proposal Assembler Cart (1/3) */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2.1fr)_minmax(360px,1fr)]">
        {/* Left Column: Filters + Slide Gallery */}
        <div className="space-y-4">
          {/* Filter Bar */}
          <section aria-label="Slide catalog filters" className="border border-slate-200 bg-white p-3.5">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative sm:col-span-2">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  aria-label="Search warehouse slides"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search warehouse name, city, rate, GLA, or notes…"
                  className="h-9 w-full border border-slate-300 bg-white pl-8 pr-3 text-xs text-[#003366] placeholder:text-slate-400 focus:border-[#003366] focus:outline-none"
                />
              </div>

              <select
                aria-label="Filter by location"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="h-9 w-full border border-slate-300 bg-white px-2.5 text-xs text-[#003366] focus:border-[#003366] focus:outline-none"
              >
                <option value="all">All locations</option>
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by source deck"
                value={deckFilter}
                onChange={(e) => setDeckFilter(e.target.value)}
                className="h-9 w-full border border-slate-300 bg-white px-2.5 text-xs text-[#003366] focus:border-[#003366] focus:outline-none"
              >
                <option value="all">All source decks ({deckOptions.length})</option>
                {deckOptions.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
              <div role="tablist" aria-label="Slide type filter" className="inline-flex border border-slate-200 bg-slate-50 p-0.5">
                {(
                  [
                    { id: "property", label: "Warehouse Options" },
                    { id: "all", label: "All Slides" },
                    { id: "vicinity", label: "Vicinity / Maps" },
                    { id: "summary", label: "Summary Matrices" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={roleFilter === tab.id}
                    onClick={() => setRoleFilter(tab.id)}
                    className={`min-h-7 px-2.5 text-[11px] font-semibold transition-colors ${
                      roleFilter === tab.id
                        ? "bg-[#003366] text-white"
                        : "text-slate-600 hover:text-[#003366]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  GLA (sqm):
                </span>
                <input
                  type="number"
                  aria-label="Minimum GLA"
                  placeholder="Min"
                  value={minGlaInput}
                  onChange={(e) => setMinGlaInput(e.target.value)}
                  className="h-7 w-20 border border-slate-300 px-2 text-xs text-[#003366]"
                />
                <span>–</span>
                <input
                  type="number"
                  aria-label="Maximum GLA"
                  placeholder="Max"
                  value={maxGlaInput}
                  onChange={(e) => setMaxGlaInput(e.target.value)}
                  className="h-7 w-20 border border-slate-300 px-2 text-xs text-[#003366]"
                />
                <span className="ml-2 text-[11px] font-semibold text-[#31577D]">
                  {filteredSlides.length} slide{filteredSlides.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </section>

          {/* Slide Cards Gallery */}
          {loading ? (
            <div role="status" className="flex min-h-64 items-center justify-center border border-slate-200 bg-white p-8 text-xs text-slate-500">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[#003366]" />
              Loading Property Decks catalog…
            </div>
          ) : filteredSlides.length === 0 ? (
            <div className="border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <Presentation aria-hidden="true" className="mx-auto h-6 w-6 text-[#31577D]" />
              <h2 className="mt-3 text-base font-semibold text-[#003366]">
                {allSlides.length === 0 ? "No property decks indexed yet" : "No slides match your active filters"}
              </h2>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">
                {allSlides.length === 0
                  ? "Supply your local synced OneDrive folder path and run Scan & Index Decks to populate the gallery."
                  : "Clear one or more filter criteria or switch to All Slides to inspect every slide in the catalog."}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                {allSlides.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setFolderModalOpen(true)}
                    className="inline-flex min-h-9 items-center gap-1.5 border border-[#003366] bg-[#003366] px-3.5 text-xs font-semibold text-white"
                  >
                    Set OneDrive Folder Path
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setLocationFilter("all");
                      setDeckFilter("all");
                      setRoleFilter("all");
                      setMinGlaInput("");
                      setMaxGlaInput("");
                    }}
                    className="inline-flex min-h-9 items-center gap-1.5 border border-slate-300 bg-white px-3.5 text-xs font-semibold text-[#003366]"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {filteredSlides.map((slide) => {
                const isSelected = selectedSlideIds.includes(slide.id);
                const orderNum = selectedSlideIds.indexOf(slide.id) + 1;
                return (
                  <article
                    key={slide.id}
                    className={`flex flex-col border bg-white transition-colors ${
                      isSelected
                        ? "border-[#C9A84C] ring-1 ring-[#C9A84C]"
                        : "border-slate-200 hover:border-[#31577D]"
                    }`}
                  >
                    {/* 16:9 Slide Thumbnail Header */}
                    <div className="relative aspect-video w-full overflow-hidden border-b border-slate-100 bg-slate-100">
                      <img
                        src={slide.thumbnailUrl}
                        alt={slide.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute left-2 top-2 flex items-center gap-1.5">
                        <span className="bg-[#003366]/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                          Slide #{slide.slideNumber}
                        </span>
                        {slide.hasOverrides && (
                          <span className="border border-[#C9A84C] bg-[#FBF7E9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#003366]">
                            Edited Specs
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <div className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center bg-[#C9A84C] px-1.5 text-[11px] font-bold text-[#003366]">
                          Option #{orderNum}
                        </div>
                      )}
                    </div>

                    {/* Slide Card Body */}
                    <div className="flex flex-1 flex-col p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#31577D]"
                            title={slide.deckFileName}
                          >
                            {slide.deckFileName}
                          </p>
                          <h2 className="mt-0.5 line-clamp-1 text-sm font-semibold text-[#003366]" title={slide.title}>
                            {slide.title}
                          </h2>
                        </div>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5 text-xs">
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            Location
                          </span>
                          <span className="flex items-center gap-1 truncate font-medium text-slate-700">
                            <MapPin className="h-3 w-3 shrink-0 text-[#C9A84C]" />
                            <span className="truncate">{slide.specs.location}</span>
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            Leasable Area (GLA)
                          </span>
                          <span className="block truncate font-semibold tabular-nums text-[#003366]">
                            {slide.specs.gla}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            Lease Rate
                          </span>
                          <span className="block truncate font-semibold tabular-nums text-[#003366]">
                            {slide.specs.leaseRate}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            Clear Height
                          </span>
                          <span className="block truncate text-slate-700">
                            {slide.specs.ceilingHeight}
                          </span>
                        </div>
                      </div>

                      {slide.specs.notes && (
                        <p className="mt-2 border-l-2 border-[#C9A84C] bg-[#FBF7E9] px-2 py-1 text-[11px] text-[#003366]">
                          {slide.specs.notes}
                        </p>
                      )}

                      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={() => openSpecEditor(slide)}
                          className="inline-flex min-h-8 items-center gap-1 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366] hover:border-[#003366]"
                        >
                          <Edit3 className="h-3 w-3" />
                          Edit Specs
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleSelectSlide(slide.id)}
                          className={`inline-flex min-h-8 items-center gap-1.5 border px-3 text-[11px] font-semibold transition-colors ${
                            isSelected
                              ? "border-[#C9A84C] bg-[#FBF7E9] text-[#003366]"
                              : "border-[#003366] bg-[#003366] text-white hover:bg-[#174778]"
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              In Proposal (#{orderNum})
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              Add to Deck
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Proposal Compiler & Cart */}
        <aside aria-label="Proposal deck compiler" className="sticky top-4 space-y-4 border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#31577D]">
                Proposal Assembler
              </p>
              <h2 className="text-base font-semibold text-[#003366]">
                Selected Slides ({selectedSlideIds.length})
              </h2>
            </div>
            {selectedSlideIds.length > 0 && (
              <button
                type="button"
                onClick={() => persistCart([])}
                className="text-[11px] font-semibold text-slate-500 hover:text-red-700"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Deck Mode Toggle: Standard vs Comprehensive */}
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Deck Format
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setDeckMode("standard")}
                className={`border p-2.5 text-left transition-colors ${
                  deckMode === "standard"
                    ? "border-[#003366] bg-[#003366] text-white"
                    : "border-slate-200 bg-white text-[#003366] hover:border-[#003366]"
                }`}
              >
                <span className="block text-xs font-semibold">Standard Deck</span>
                <span
                  className={`mt-0.5 block text-[10px] ${
                    deckMode === "standard" ? "text-[#D7E3EF]" : "text-slate-500"
                  }`}
                >
                  Cover + Warehouses + Closing
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDeckMode("comprehensive")}
                className={`border p-2.5 text-left transition-colors ${
                  deckMode === "comprehensive"
                    ? "border-[#003366] bg-[#003366] text-white"
                    : "border-slate-200 bg-white text-[#003366] hover:border-[#003366]"
                }`}
              >
                <span className="block text-xs font-semibold">Comprehensive Deck</span>
                <span
                  className={`mt-0.5 block text-[10px] ${
                    deckMode === "comprehensive" ? "text-[#D7E3EF]" : "text-slate-500"
                  }`}
                >
                  + Summary Matrix & Credentials
                </span>
              </button>
            </div>
          </div>

          {/* Client & Broker Pitch Details */}
          <div className="space-y-2.5 border-t border-slate-100 pt-3">
            <label className="block text-xs font-semibold text-[#003366]">
              Client Name
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g., DHL Supply Chain / Rhenus Logistics"
                className="mt-1 h-9 w-full border border-slate-300 bg-white px-2.5 text-xs font-normal text-[#003366] focus:border-[#003366] focus:outline-none"
              />
            </label>

            <label className="block text-xs font-semibold text-[#003366]">
              Proposal Title
              <input
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="mt-1 h-9 w-full border border-slate-300 bg-white px-2.5 text-xs font-normal text-[#003366] focus:border-[#003366] focus:outline-none"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-[#003366]">
                Lead Broker
                <input
                  type="text"
                  value={brokerName}
                  onChange={(e) => setBrokerName(e.target.value)}
                  className="mt-1 h-8 w-full border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366] focus:border-[#003366] focus:outline-none"
                />
              </label>

              <label className="block text-xs font-semibold text-[#003366]">
                Proposal Date
                <input
                  type="date"
                  value={proposalDate}
                  onChange={(e) => setProposalDate(e.target.value)}
                  className="mt-1 h-8 w-full border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366] focus:border-[#003366] focus:outline-none"
                />
              </label>
            </div>
          </div>

          {/* Selected Slide Sequence List */}
          <div className="border-t border-slate-100 pt-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Slide Sequence ({activeProposalManifest.slides.length} warehouse slides)
            </span>

            {activeProposalManifest.slides.length === 0 ? (
              <p className="mt-2 border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                Click <strong>Add to Deck</strong> on any warehouse card to stage it for compilation.
              </p>
            ) : (
              <ol className="mt-2 max-h-60 divide-y divide-slate-100 overflow-y-auto border border-slate-200">
                {activeProposalManifest.slides.map((slide, idx) => (
                  <li key={slide.id} className="flex items-center justify-between gap-2 bg-white px-2.5 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-[#003366]">
                        {idx + 1}. {slide.title}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {slide.specs.location} · {slide.specs.gla} · {slide.specs.leaseRate}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${slide.title} up`}
                        disabled={idx === 0}
                        onClick={() => moveCartSlide(idx, -1)}
                        className="inline-flex h-6 w-6 items-center justify-center border border-slate-200 text-[#003366] disabled:opacity-30"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${slide.title} down`}
                        disabled={idx === activeProposalManifest.slides.length - 1}
                        onClick={() => moveCartSlide(idx, 1)}
                        className="inline-flex h-6 w-6 items-center justify-center border border-slate-200 text-[#003366] disabled:opacity-30"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${slide.title}`}
                        onClick={() => toggleSelectSlide(slide.id)}
                        className="inline-flex h-6 w-6 items-center justify-center border border-slate-200 text-slate-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleCompileDeck()}
            disabled={compiling || activeProposalManifest.slides.length === 0}
            className="flex min-h-10 w-full items-center justify-center gap-2 border border-[#003366] bg-[#003366] px-4 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-[#174778] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Layers className="h-4 w-4 text-[#C9A84C]" />
            {compiling
              ? "Compiling Presentation…"
              : `Compile PPTX Deck (${
                  deckMode === "comprehensive"
                    ? activeProposalManifest.slides.length + 3
                    : activeProposalManifest.slides.length + 2
                } Slides)`}
          </button>

          {compiledResult && (
            <div className="space-y-2 border border-[#C9A84C] bg-[#FBF7E9] p-3 text-xs text-[#003366]">
              <p className="font-semibold">Compiled to OneDrive:</p>
              <p className="break-all font-mono text-[11px]">{compiledResult.fileName}</p>
              <p className="text-[10px] text-slate-600">
                {compiledResult.slideCount} slides generated · Saved in {outputFolder}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void triggerWindowsOpen(compiledResult.outputPath, "open-file")}
                  className="inline-flex min-h-8 items-center gap-1 border border-[#003366] bg-[#003366] px-2.5 text-[11px] font-semibold text-white"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in PowerPoint
                </button>
                <button
                  type="button"
                  onClick={() => void triggerWindowsOpen(compiledResult.outputPath, "reveal-folder")}
                  className="inline-flex min-h-8 items-center gap-1 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366]"
                >
                  <FolderOpen className="h-3 w-3" />
                  Show in Explorer
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Comprehensive Mode Live Comparison Table Preview */}
      {deckMode === "comprehensive" && activeProposalManifest.comparisonRows.length > 0 && (
        <section aria-label="Executive summary comparison matrix preview" className="border border-slate-200 bg-white">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#31577D]">
                Comprehensive Deck Slide #2 Preview
              </p>
              <h2 className="text-sm font-semibold text-[#003366]">
                Executive Summary Comparison Matrix ({activeProposalManifest.comparisonRows.length} Shortlisted Options)
              </h2>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F7FAFC] text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="border-r border-slate-200 px-3 py-2">Option</th>
                  <th className="border-r border-slate-200 px-3 py-2">Property / Warehouse</th>
                  <th className="border-r border-slate-200 px-3 py-2">Location</th>
                  <th className="border-r border-slate-200 px-3 py-2">Leasable Area (GLA)</th>
                  <th className="border-r border-slate-200 px-3 py-2">Clear Height</th>
                  <th className="border-r border-slate-200 px-3 py-2">Lease Rate</th>
                  <th className="px-3 py-2">Broker Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {activeProposalManifest.comparisonRows.map((row, idx) => (
                  <tr key={row.slideId} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                    <td className="border-r border-slate-200 px-3 py-2 font-semibold text-[#003366]">
                      Option {row.optionNumber}
                    </td>
                    <td className="border-r border-slate-200 px-3 py-2 font-semibold text-[#003366]">
                      {row.propertyName}
                    </td>
                    <td className="border-r border-slate-200 px-3 py-2 text-slate-700">{row.location}</td>
                    <td className="border-r border-slate-200 px-3 py-2 font-semibold tabular-nums text-[#003366]">
                      {row.gla}
                    </td>
                    <td className="border-r border-slate-200 px-3 py-2 text-slate-700">{row.ceilingHeight}</td>
                    <td className="border-r border-slate-200 px-3 py-2 font-semibold tabular-nums text-[#003366]">
                      {row.leaseRate}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.notes || "Standard handover"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal 1: Configure OneDrive Folder Path */}
      {folderModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setFolderModalOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="onedrive-path-modal-title"
            className="w-full max-w-lg border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#31577D]">
                  Local OneDrive Storage
                </p>
                <h2 id="onedrive-path-modal-title" className="mt-1 text-base font-semibold text-[#003366]">
                  Configure OneDrive Deck Folders
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setFolderModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center text-[#003366]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-[#003366]">
                Source Decks Folder Path (OneDrive)
                <input
                  type="text"
                  value={draftSourceFolder}
                  onChange={(e) => setDraftSourceFolder(e.target.value)}
                  placeholder="C:\Users\PRIME_Dave\OneDrive - Jet Innovisions\..."
                  className="mt-1 h-10 w-full border border-slate-300 px-3 font-mono text-xs text-[#003366] focus:border-[#003366] focus:outline-none"
                />
              </label>

              <label className="block text-xs font-semibold text-[#003366]">
                Compiled Proposals Output Folder (OneDrive)
                <input
                  type="text"
                  value={draftOutputFolder}
                  onChange={(e) => setDraftOutputFolder(e.target.value)}
                  placeholder="Defaults to <Source Folder>\Compiled Proposals"
                  className="mt-1 h-10 w-full border border-slate-300 px-3 font-mono text-xs text-[#003366] focus:border-[#003366] focus:outline-none"
                />
              </label>
            </div>

            <footer className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="min-h-9 px-3 text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={indexing || !draftSourceFolder.trim()}
                onClick={() => void runFolderIndex(draftSourceFolder, draftOutputFolder)}
                className="min-h-9 border border-[#003366] bg-[#003366] px-4 text-xs font-semibold text-white disabled:opacity-50"
              >
                {indexing ? "Indexing…" : "Save & Index Folder"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* Modal 2: Edit / Override Warehouse Specifications */}
      {editingSlideId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditingSlideId(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="spec-override-modal-title"
            className="w-full max-w-lg border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#31577D]">
                  Slide Specification Override
                </p>
                <h2 id="spec-override-modal-title" className="mt-1 text-base font-semibold text-[#003366]">
                  Edit Warehouse Specs for Proposal
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close spec editor"
                onClick={() => setEditingSlideId(null)}
                className="inline-flex h-8 w-8 items-center justify-center text-[#003366]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-[#003366] sm:col-span-2">
                Property / Warehouse Title
                <input
                  type="text"
                  value={editDraft.propertyName || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, propertyName: e.target.value })}
                  className="mt-1 h-9 w-full border border-slate-300 px-2.5 text-xs font-normal text-[#003366]"
                />
              </label>

              <label className="block text-xs font-semibold text-[#003366]">
                Location
                <input
                  type="text"
                  value={editDraft.location || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, location: e.target.value })}
                  className="mt-1 h-9 w-full border border-slate-300 px-2.5 text-xs font-normal text-[#003366]"
                />
              </label>

              <label className="block text-xs font-semibold text-[#003366]">
                Gross Leasable Area (GLA)
                <input
                  type="text"
                  value={editDraft.gla || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, gla: e.target.value })}
                  className="mt-1 h-9 w-full border border-slate-300 px-2.5 text-xs font-normal text-[#003366]"
                />
              </label>

              <label className="block text-xs font-semibold text-[#003366]">
                Lease Rate
                <input
                  type="text"
                  value={editDraft.leaseRate || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, leaseRate: e.target.value })}
                  className="mt-1 h-9 w-full border border-slate-300 px-2.5 text-xs font-normal text-[#003366]"
                />
              </label>

              <label className="block text-xs font-semibold text-[#003366]">
                Clear Ceiling Height
                <input
                  type="text"
                  value={editDraft.ceilingHeight || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, ceilingHeight: e.target.value })}
                  className="mt-1 h-9 w-full border border-slate-300 px-2.5 text-xs font-normal text-[#003366]"
                />
              </label>

              <label className="block text-xs font-semibold text-[#003366]">
                Power Supply
                <input
                  type="text"
                  value={editDraft.powerSupply || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, powerSupply: e.target.value })}
                  className="mt-1 h-9 w-full border border-slate-300 px-2.5 text-xs font-normal text-[#003366]"
                />
              </label>

              <label className="block text-xs font-semibold text-[#003366]">
                Loading Bays
                <input
                  type="text"
                  value={editDraft.loadingBays || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, loadingBays: e.target.value })}
                  className="mt-1 h-9 w-full border border-slate-300 px-2.5 text-xs font-normal text-[#003366]"
                />
              </label>

              <label className="block text-xs font-semibold text-[#003366] sm:col-span-2">
                Broker Notes / Client-Specific Remarks
                <textarea
                  rows={2}
                  value={editDraft.notes || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                  placeholder="e.g., Lessor open to 2 months rent-free fit-out period"
                  className="mt-1 w-full border border-slate-300 p-2 text-xs font-normal text-[#003366]"
                />
              </label>
            </div>

            <footer className="mt-5 flex items-center justify-between border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={resetSpecOverride}
                className="text-xs font-semibold text-slate-500 hover:text-red-700"
              >
                Reset to Original
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSlideId(null)}
                  className="min-h-9 px-3 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveSpecEditor}
                  className="min-h-9 border border-[#003366] bg-[#003366] px-4 text-xs font-semibold text-white"
                >
                  Save Specs
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
