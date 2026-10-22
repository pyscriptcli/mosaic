"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
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
  groupPropertyLocationsByCity,
  isIndustrialFacilityProposalSlide,
  groupPropertySlidesByTitle,
  reorderSelectedSlides,
  type PropertyDeckCatalog,
  type PropertySlideGroup,
  type PropertySlideItem,
  type PropertySlideOverride,
  type SlideRole,
} from "@/lib/property-decks";
import { PropertyDecksLayoutPrototype } from "./PropertyDecksLayoutPrototype";

const CONFIG_STORAGE_KEY = "mosaic_property_decks_config_v1";
const OVERRIDES_STORAGE_KEY = "mosaic_property_decks_overrides_v1";
const CART_STORAGE_KEY = "mosaic_property_decks_cart_v1";
const MOSAIC_HELPER_URL = "http://127.0.0.1:43127";
const PREPARED_BY_PRESETS = {
  cedtrix: { name: "Cedtrix Rena", designation: "Sr. Leasing Advisor", company: "PRIME Philippines" },
  sondi: { name: "Sondi Tuazon", designation: "Leasing Advisor", company: "PRIME Philippines" },
} as const;

function helperCatalog(catalog: PropertyDeckCatalog): PropertyDeckCatalog {
  return {
    ...catalog,
    slides: catalog.slides.map((slide) => ({
      ...slide,
      thumbnailUrl: slide.thumbnailUrl.startsWith("/api/property-decks/thumbnail")
        ? `${MOSAIC_HELPER_URL}${slide.thumbnailUrl}`
        : slide.thumbnailUrl,
    })),
  };
}

function helperRequestError(error: unknown, fallback: string): string {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return "Mosaic Helper is unreachable. Start it and allow this site to access your local network in the browser.";
  }
  return error instanceof Error ? error.message : fallback;
}

function formatElapsedTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

interface StoredFolderConfig {
  sourceFolder: string;
  outputFolder: string;
}

interface CompiledResult {
  downloadId: string;
  outputPath: string;
  fileName: string;
  pdfFileName: string | null;
  pdfError: string | null;
  slideCount: number;
  engine: string;
}

export function PropertyDecksView() {
  const [prototypeVariant, setPrototypeVariant] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<PropertyDeckCatalog | null>(null);
  const [sourceFolder, setSourceFolder] = useState("");
  const [outputFolder, setOutputFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [helperConnected, setHelperConnected] = useState(false);
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
  const [assemblerSections, setAssemblerSections] = useState({ coverpage: true, properties: true, cta: true });

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
  const [previewSlideIds, setPreviewSlideIds] = useState<Record<string, string>>({});

  // Export filename
  const [clientName, setClientName] = useState("");
  const [clientDesignation, setClientDesignation] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [preparedByPreset, setPreparedByPreset] = useState<keyof typeof PREPARED_BY_PRESETS>("cedtrix");
  const [preparedByName, setPreparedByName] = useState<string>(PREPARED_BY_PRESETS.cedtrix.name);
  const [preparedByDesignation, setPreparedByDesignation] = useState<string>(PREPARED_BY_PRESETS.cedtrix.designation);
  const [preparedByCompany, setPreparedByCompany] = useState<string>(PREPARED_BY_PRESETS.cedtrix.company);
  const [clientLogoDataUrl, setClientLogoDataUrl] = useState("");
  const [compiledResult, setCompiledResult] = useState<CompiledResult | null>(null);
  const [exportStage, setExportStage] = useState<"idle" | "pptx" | "pdf" | "ready" | "pdf-error">("idle");
  const [exportElapsedSeconds, setExportElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!compiling) return;
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setExportElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [compiling]);

  useEffect(() => {
    const syncVariant = () => {
      const value = new URLSearchParams(window.location.search).get("variant");
      setPrototypeVariant(["A", "B", "C", "D"].includes(value || "") ? value : null);
    };
    syncVariant();
    window.addEventListener("popstate", syncVariant);
    return () => window.removeEventListener("popstate", syncVariant);
  }, []);

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
        const health = await fetch(`${MOSAIC_HELPER_URL}/health`, { cache: "no-store" });
        if (!health.ok) throw new Error("Mosaic Helper did not respond. Start the helper and reload this page.");
        setHelperConnected(true);

        const res = await fetch(`${MOSAIC_HELPER_URL}/api/property-decks`, { cache: "no-store" });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Unable to load Property Decks catalog.");

        if (payload.catalog) {
          const nextCatalog = helperCatalog(payload.catalog as PropertyDeckCatalog);
          setCatalog(nextCatalog);
          const nextSource = savedConfig?.sourceFolder || nextCatalog.sourceFolder;
          const nextOutput = savedConfig?.outputFolder || nextCatalog.outputFolder;
          setSourceFolder(nextSource);
          setOutputFolder(nextOutput);
        } else {
          setCatalog(null);
          const fallbackFolder = savedConfig?.sourceFolder || "";
          const fallbackOutput =
            savedConfig?.outputFolder ||
            (fallbackFolder ? `${fallbackFolder}\\Compiled Proposals` : "");
          setSourceFolder(fallbackFolder);
          setOutputFolder(fallbackOutput);
          setDraftSourceFolder(fallbackFolder);
          setDraftOutputFolder(fallbackOutput);
          if (!fallbackFolder) setFolderModalOpen(true);
        }
      } catch (err) {
        setHelperConnected(false);
        setError(helperRequestError(err, "Could not load Property Decks."));
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, []);

  const persistOverrides = (next: Record<string, PropertySlideOverride>) => {
    setOverrides(next);
    try {
      localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  };

  const persistCart = useCallback((next: string[]) => {
    setSelectedSlideIds(next);
    setCompiledResult(null);
    setExportStage("idle");
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  }, []);

  const runFolderIndex = useCallback(
    async (targetSource: string, targetOutput: string) => {
      if (!targetSource.trim()) {
        setDraftSourceFolder(sourceFolder);
        setDraftOutputFolder(outputFolder);
        setFolderModalOpen(true);
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

        const res = await fetch(`${MOSAIC_HELPER_URL}/api/property-decks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceFolder: nextConfig.sourceFolder,
            outputFolder: nextConfig.outputFolder,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(String(payload.error || "Indexing failed."));
        }

        const nextCatalog = helperCatalog(payload.catalog as PropertyDeckCatalog);
        setHelperConnected(true);
        setCatalog(nextCatalog);
        const slideIds = new Set(nextCatalog.slides.map((slide) => slide.id));
        persistCart(selectedSlideIds.filter((id) => slideIds.has(id)));
        setFolderModalOpen(false);
        setStatusMessage(
          `Refreshed ${nextCatalog.slides.length} slides across ${nextCatalog.decksCount} presentation decks.`,
        );
      } catch (err) {
        setError(helperRequestError(err, "Unable to index the local folder."));
      } finally {
        setIndexing(false);
      }
    },
    [outputFolder, persistCart, selectedSlideIds, sourceFolder],
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
      if (slide.slideRole !== "property") continue;
      const effective = applySlideOverrides(slide, overrides);
      const loc = effective.specs.location?.trim();
      if (loc && loc !== "Metro Manila / Luzon") {
        locs.add(loc);
      }
    }
    return groupPropertyLocationsByCity(Array.from(locs));
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

  const slideGroups = useMemo(
    () => groupPropertySlidesByTitle(filteredSlides),
    [filteredSlides],
  );

  const activeProposalManifest = useMemo(
    () =>
      buildCompilationManifest({
        selectedSlideIds,
        catalogSlides: allSlides,
        overrides,
        proposal: {
          clientName: clientName || "Client",
          clientDesignation,
          clientCompany,
          preparedByName,
          preparedByDesignation,
          preparedByCompany,
          clientLogoDataUrl,
          projectTitle: "",
          brokerName: "",
          brokerEmail: "",
          brokerPhone: "",
          date: new Date().toISOString().slice(0, 10),
          mode: "standard",
        },
      }),
    [
      selectedSlideIds,
      allSlides,
      overrides,
      clientName,
      clientDesignation,
      clientCompany,
      preparedByName,
      preparedByDesignation,
      preparedByCompany,
      clientLogoDataUrl,
    ],
  );

  if (process.env.NODE_ENV !== "production" && prototypeVariant && !loading && catalog) {
    return (
      <PropertyDecksLayoutPrototype
        variant={prototypeVariant}
        groups={slideGroups}
        selectedCount={selectedSlideIds.length}
      />
    );
  }

  const toggleSelectSlide = (slideId: string) => {
    if (selectedSlideIds.includes(slideId)) {
      persistCart(selectedSlideIds.filter((id) => id !== slideId));
    } else {
      persistCart([...selectedSlideIds, slideId]);
    }
  };

  const toggleSelectGroup = (group: PropertySlideGroup) => {
    const groupSlideIds = group.slides.map((s) => s.id);
    const allSelected = groupSlideIds.every((id) => selectedSlideIds.includes(id));
    if (allSelected) {
      persistCart(selectedSlideIds.filter((id) => !groupSlideIds.includes(id)));
    } else {
      const next = [...selectedSlideIds];
      for (const id of groupSlideIds) {
        if (!next.includes(id)) {
          next.push(id);
        }
      }
      persistCart(next);
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
    setExportElapsedSeconds(0);
    setError(null);
    setCompiledResult(null);
    setExportStage("pptx");
    let pptxCreated = false;
    try {
      const res = await fetch(`${MOSAIC_HELPER_URL}/api/property-decks/compile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedSlideIds,
            overrides,
            outputFolder:
              outputFolder || (sourceFolder ? `${sourceFolder}\\Compiled Proposals` : undefined),
            proposal: {
              clientName: clientName.trim() || "Client",
              clientDesignation: clientDesignation.trim(),
              clientCompany: clientCompany.trim(),
              preparedByName: preparedByName.trim(),
              preparedByDesignation: preparedByDesignation.trim(),
              preparedByCompany: preparedByCompany.trim(),
              clientLogoDataUrl,
              projectTitle: "",
              brokerName: "",
              brokerEmail: "",
              brokerPhone: "",
              date: new Date().toISOString().slice(0, 10),
              mode: "standard",
            },
          }),
        });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.fileName) {
        const result: CompiledResult = {
          downloadId: payload.downloadId,
          outputPath: payload.outputPath,
          fileName: payload.fileName,
          pdfFileName: null,
          pdfError: null,
          slideCount: payload.slideCount,
          engine: payload.engine,
        };
        setCompiledResult(result);
        pptxCreated = true;
        setExportStage("pdf");
        try {
          const pdfRes = await fetch(`${MOSAIC_HELPER_URL}/api/property-decks/compile`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ downloadId: payload.downloadId }),
          });
          const pdfPayload = await pdfRes.json().catch(() => ({}));
          if (pdfRes.ok && pdfPayload.pdfFileName) {
            setCompiledResult({ ...result, pdfFileName: pdfPayload.pdfFileName });
            setExportStage("ready");
          } else {
            setCompiledResult({ ...result, pdfError: pdfPayload.error || "PDF conversion failed." });
            setExportStage("pdf-error");
          }
        } catch (pdfError) {
          setCompiledResult({
            ...result,
            pdfError: helperRequestError(pdfError, "PDF conversion failed."),
          });
          setExportStage("pdf-error");
        }
        return;
      }
      throw new Error(payload.error || "The source slides could not be exported.");
    } catch (err) {
      if (pptxCreated) {
        const message = err instanceof Error ? err.message : "PDF conversion failed.";
        setCompiledResult((current) => current ? { ...current, pdfError: message } : current);
        setExportStage("pdf-error");
      } else {
        setError(helperRequestError(err, "Failed to compile presentation deck."));
        setExportStage("idle");
      }
    } finally {
      setCompiling(false);
    }
  };

  const triggerWindowsOpen = async (targetPath: string) => {
    try {
      await fetch(`${MOSAIC_HELPER_URL}/api/property-decks/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath, action: "reveal-folder" }),
      });
    } catch {
      // Ignore desktop open failure in browser-only test environments
    }
  };

  const downloadExport = async (downloadId: string, format: "pptx" | "pdf", fileName: string) => {
    try {
      const response = await fetch(
        `${MOSAIC_HELPER_URL}/api/property-decks/compile?id=${downloadId}&format=${format}`,
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `The ${format.toUpperCase()} download is unavailable.`);
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      setError(helperRequestError(err, `The ${format.toUpperCase()} download failed.`));
    }
  };

  const coverSlides = activeProposalManifest.slides.filter(
    (slide) => slide.slideRole === "cover" && !isIndustrialFacilityProposalSlide(slide),
  );
  const propertySlides = activeProposalManifest.slides.filter(
    (slide) => slide.slideRole === "property" || isIndustrialFacilityProposalSlide(slide),
  );
  const ctaSlides = activeProposalManifest.slides.filter((slide) => slide.slideRole === "closing");
  const toggleAssemblerSection = (section: keyof typeof assemblerSections) => {
    setAssemblerSections((current) => ({ ...current, [section]: !current[section] }));
  };
  const choosePreparedByPreset = (preset: keyof typeof PREPARED_BY_PRESETS) => {
    setPreparedByPreset(preset);
    setPreparedByName(PREPARED_BY_PRESETS[preset].name);
    setPreparedByDesignation(PREPARED_BY_PRESETS[preset].designation);
    setPreparedByCompany(PREPARED_BY_PRESETS[preset].company);
  };
  const handleClientLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setClientLogoDataUrl(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  };
  const renderAssemblerSlides = (slides: PropertySlideItem[]) => {
    if (slides.length === 0) {
      return (
        <p className="mt-2 border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-[11px] text-slate-500">
          {selectedSlideIds.length === 0 ? "Add warehouse slides to build this section." : "No pages in this section yet."}
        </p>
      );
    }

    return (
      <ol className="mt-2 divide-y divide-slate-100 border border-slate-200">
        {slides.map((slide) => {
          const cartIndex = selectedSlideIds.indexOf(slide.id);
          const sequence = activeProposalManifest.slides.findIndex((item) => item.id === slide.id) + 1;
          return (
            <li key={slide.id} className="flex items-center justify-between gap-2 bg-white px-2.5 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-[#003366]">{sequence}. {slide.title}</span>
                <span className="block truncate text-[10px] text-slate-500">
                  {slide.specs.location || slide.deckFileName} · {slide.specs.gla} · {slide.specs.leaseRate}
                </span>
              </div>
              {cartIndex >= 0 ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label={`Move ${slide.title} up`} disabled={cartIndex === 0} onClick={() => moveCartSlide(cartIndex, -1)} className="inline-flex h-6 w-6 items-center justify-center border border-slate-200 text-[#003366] disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                  <button type="button" aria-label={`Move ${slide.title} down`} disabled={cartIndex === selectedSlideIds.length - 1} onClick={() => moveCartSlide(cartIndex, 1)} className="inline-flex h-6 w-6 items-center justify-center border border-slate-200 text-[#003366] disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                  <button type="button" aria-label={`Remove ${slide.title}`} onClick={() => toggleSelectSlide(slide.id)} className="inline-flex h-6 w-6 items-center justify-center border border-slate-200 text-slate-500 hover:text-red-700"><Trash2 className="h-3 w-3" /></button>
                </div>
              ) : (
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-[#31577D]">Included</span>
              )}
            </li>
          );
        })}
      </ol>
    );
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
                ? `Local folder: ${sourceFolder} · ${allSlides.length} indexed slides (${catalog?.decksCount || 0} decks)`
                : "Set a local folder path to index warehouse slides"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span
            role="status"
            className={`inline-flex h-8 items-center gap-1.5 border px-2.5 text-[11px] font-semibold ${helperConnected ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-[#FBF7E9] text-[#735600]"}`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${helperConnected ? "bg-emerald-600" : "bg-amber-500"}`} />
            {helperConnected ? "Mosaic Helper connected" : "Mosaic Helper offline"}
          </span>
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
            Folder Paths
          </button>
          <button
            type="button"
            onClick={() => void runFolderIndex(sourceFolder, outputFolder)}
            disabled={indexing}
            className="inline-flex h-8 min-h-8 items-center justify-center gap-1.5 border border-[#003366] bg-[#003366] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#174778] disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${indexing ? "animate-spin" : ""}`} />
            {indexing ? "Rescanning…" : "Rescan Folder"}
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
                {locationOptions.map((group) => (
                  <optgroup key={group.city} label={group.city}>
                    {group.locations.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </optgroup>
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
                  ? "Set the source folder path, then rescan to populate the gallery."
                  : "Clear one or more filter criteria or switch to All Slides to inspect every slide in the catalog."}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                {allSlides.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setFolderModalOpen(true)}
                    className="inline-flex min-h-9 items-center gap-1.5 border border-[#003366] bg-[#003366] px-3.5 text-xs font-semibold text-white"
                  >
                    Set Folder Paths
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
              {slideGroups.map((group) => {
                const isMultiSlide = group.slides.length > 1;
                const groupSlideIds = group.slides.map((s) => s.id);
                const selectedCountInGroup = groupSlideIds.filter((id) =>
                  selectedSlideIds.includes(id),
                ).length;
                const isAllGroupSelected =
                  groupSlideIds.length > 0 && selectedCountInGroup === groupSlideIds.length;
                const isPartialGroupSelected =
                  selectedCountInGroup > 0 && !isAllGroupSelected;
                const requestedPreviewId = previewSlideIds[group.groupId];
                const requestedPreviewIndex = group.slides.findIndex((slide) => slide.id === requestedPreviewId);
                const previewIndex = requestedPreviewIndex >= 0 ? requestedPreviewIndex : 0;
                const previewSlide = group.slides[previewIndex] ?? group.leadSlide;
                const isPreviewSelected = selectedSlideIds.includes(previewSlide.id);
                const previewOrderNum = selectedSlideIds.indexOf(previewSlide.id) + 1;
                const selectPreviewSlide = () => toggleSelectSlide(previewSlide.id);

                return (
                  <article
                    key={group.groupId}
                    className={`flex flex-col border bg-white transition-colors ${
                      isAllGroupSelected || (isMultiSlide ? isPartialGroupSelected : isPreviewSelected)
                        ? "border-[#C9A84C] ring-1 ring-[#C9A84C]"
                        : "border-slate-200 hover:border-[#31577D]"
                    }`}
                  >
                    {/* 16:9 source slide preview */}
                    <div className="relative aspect-video w-full overflow-hidden border-b border-slate-100 bg-slate-100">
                      <img
                        src={previewSlide.thumbnailUrl}
                        alt={previewSlide.title}
                        crossOrigin="anonymous"
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div className="flex min-h-9 items-center justify-between border-b border-slate-100 bg-white px-3 text-[11px] text-slate-600">
                      <button
                        type="button"
                        onClick={() => setPreviewSlideIds((current) => ({
                          ...current,
                          [group.groupId]: group.slides[previewIndex - 1].id,
                        }))}
                        disabled={previewIndex === 0}
                        aria-label="Previous slide"
                        className="inline-flex h-7 w-7 items-center justify-center border border-slate-300 text-[#003366] hover:border-[#003366] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <span aria-live="polite" className="tabular-nums">
                        Slide #{previewSlide.slideNumber} · {previewIndex + 1} of {group.slides.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewSlideIds((current) => ({
                          ...current,
                          [group.groupId]: group.slides[previewIndex + 1].id,
                        }))}
                        disabled={previewIndex === group.slides.length - 1}
                        aria-label="Next slide"
                        className="inline-flex h-7 w-7 items-center justify-center border border-slate-300 text-[#003366] hover:border-[#003366] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Dedicated Metadata Strip Below Thumbnail */}
                    <div className="flex items-center justify-between border-b border-slate-100 bg-[#F8FAFC] px-3.5 py-1.5 text-[11px]">
                      <div className="flex items-center gap-1.5 font-semibold text-[#003366]">
                        {isMultiSlide ? (
                          <span>
                            Slides #{group.slides[0].slideNumber}–#
                            {group.slides[group.slides.length - 1].slideNumber}
                            <span className="ml-1 font-normal text-slate-500">
                              ({group.slides.length} slides)
                            </span>
                          </span>
                        ) : (
                          <span>Slide #{previewSlide.slideNumber}</span>
                        )}
                        {previewSlide.hasOverrides && (
                          <span className="border border-[#C9A84C] bg-[#FBF7E9] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#003366]">
                            Edited Specs
                          </span>
                        )}
                      </div>

                      <div>
                        {isMultiSlide ? (
                          isAllGroupSelected ? (
                            <span className="bg-[#C9A84C] px-2 py-0.5 text-[10px] font-bold text-[#003366]">
                              All {group.slides.length} Selected
                            </span>
                          ) : isPartialGroupSelected ? (
                            <span className="bg-[#003366] px-2 py-0.5 text-[10px] font-bold text-white">
                              {selectedCountInGroup}/{group.slides.length} Selected
                            </span>
                          ) : null
                        ) : isPreviewSelected ? (
                          <span className="bg-[#C9A84C] px-2 py-0.5 text-[10px] font-bold text-[#003366]">
                            Option #{previewOrderNum}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Slide Group Body */}
                    <div className="flex flex-1 flex-col p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#31577D]"
                            title={group.deckFileName}
                          >
                            {group.deckFileName}
                          </p>
                          <h2
                            className="mt-0.5 line-clamp-1 text-sm font-semibold text-[#003366]"
                            title={group.title}
                          >
                            {group.title}
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
                            <span className="truncate">{previewSlide.specs.location}</span>
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            Leasable Area (GLA)
                          </span>
                          <span className="block truncate font-semibold tabular-nums text-[#003366]">
                            {previewSlide.specs.gla}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            Lease Rate
                          </span>
                          <span className="block truncate font-semibold tabular-nums text-[#003366]">
                            {previewSlide.specs.leaseRate}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            Clear Height
                          </span>
                          <span className="block truncate text-slate-700">
                            {previewSlide.specs.ceilingHeight}
                          </span>
                        </div>
                      </div>

                      {previewSlide.specs.notes && (
                        <p className="mt-2 border-l-2 border-[#C9A84C] bg-[#FBF7E9] px-2 py-1 text-[11px] text-[#003366]">
                          {previewSlide.specs.notes}
                        </p>
                      )}

                      {/* Group Action Controls */}
                      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        {!isMultiSlide && (
                          <button
                            type="button"
                            onClick={() => openSpecEditor(previewSlide)}
                            className="inline-flex min-h-8 items-center gap-1 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366] hover:border-[#003366]"
                          >
                            <Edit3 className="h-3 w-3" />
                            Edit Specs
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={selectPreviewSlide}
                          aria-pressed={isPreviewSelected}
                          className={`inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 border px-3 text-[11px] font-semibold transition-colors ${
                            isPreviewSelected
                              ? "border-[#C9A84C] bg-[#FBF7E9] text-[#003366]"
                              : "border-[#003366] bg-[#003366] text-white hover:bg-[#174778]"
                          }`}
                        >
                          {isPreviewSelected ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Remove This Slide (#{previewOrderNum})
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              Add This Slide
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSelectGroup(group)}
                          className={`inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 border px-3 text-[11px] font-semibold transition-colors ${
                            isAllGroupSelected
                              ? "border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400"
                              : "border-slate-300 bg-white text-[#003366] hover:border-[#003366]"
                          }`}
                        >
                          {isAllGroupSelected ? (
                            <>
                              <X className="h-3.5 w-3.5" />
                              Remove All ({group.slides.length})
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              Add All ({group.slides.length})
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
        <aside aria-label="Proposal deck compiler" className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col border border-slate-200 bg-white p-4">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#31577D]">
                Proposal Assembler
              </p>
              <h2 className="text-base font-semibold text-[#003366]">
                Selected Slides ({activeProposalManifest.slides.length})
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

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3 pr-1">
            <section className="border border-slate-200">
              <button type="button" aria-label={`${assemblerSections.coverpage ? "Collapse" : "Expand"} Coverpage`} aria-expanded={assemblerSections.coverpage} aria-controls="assembler-coverpage" onClick={() => toggleAssemblerSection("coverpage")} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-xs font-semibold text-[#003366] hover:bg-slate-50">
                {assemblerSections.coverpage ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="flex-1">Coverpage</span><span className="text-[9px] font-normal text-slate-500">Client &amp; prepared by</span>
              </button>
              {assemblerSections.coverpage && <div id="assembler-coverpage" className="space-y-2.5 border-t border-slate-100 p-3">
                <label className="block text-[10px] font-semibold text-[#31577D]">Client name<input aria-label="Client name" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Contact person" className="mt-1 h-8 w-full border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366] focus:border-[#003366] focus:outline-none" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-[10px] font-semibold text-[#31577D]">Designation<input aria-label="Client designation" type="text" value={clientDesignation} onChange={(e) => setClientDesignation(e.target.value)} placeholder="Job title" className="mt-1 h-8 w-full border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366] focus:border-[#003366] focus:outline-none" /></label>
                  <label className="block text-[10px] font-semibold text-[#31577D]">Company<input aria-label="Client company" type="text" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} placeholder="Company name" className="mt-1 h-8 w-full border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366] focus:border-[#003366] focus:outline-none" /></label>
                </div>
                <label htmlFor="proposal-client-logo" className="flex cursor-pointer items-center gap-2 border border-dashed border-slate-300 bg-slate-50 px-2.5 py-2 text-[10px] font-semibold text-[#003366] hover:bg-slate-100">
                  <Presentation className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{clientLogoDataUrl ? "Company logo selected" : "Upload company logo"}<span className="block font-normal text-slate-500">PNG or JPG · client brand area</span></span>
                  {clientLogoDataUrl && <img src={clientLogoDataUrl} alt="Client logo preview" className="h-8 w-12 object-contain" />}
                </label>
                <input id="proposal-client-logo" aria-label="Upload company logo" type="file" accept="image/png,image/jpeg" onChange={handleClientLogoChange} className="sr-only" />
                {coverSlides.length > 0 && <div className="pt-1"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Cover page</p>{renderAssemblerSlides(coverSlides)}</div>}
                <div className="border-t border-slate-100 pt-2.5">
                  <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold text-[#31577D]">Prepared by</span><div className="flex gap-1"><button type="button" aria-pressed={preparedByPreset === "cedtrix"} onClick={() => choosePreparedByPreset("cedtrix")} className={`border px-2 py-1 text-[10px] ${preparedByPreset === "cedtrix" ? "border-[#003366] bg-[#003366] text-white" : "border-slate-300 text-[#003366]"}`}>Cedtrix</button><button type="button" aria-pressed={preparedByPreset === "sondi"} onClick={() => choosePreparedByPreset("sondi")} className={`border px-2 py-1 text-[10px] ${preparedByPreset === "sondi" ? "border-[#003366] bg-[#003366] text-white" : "border-slate-300 text-[#003366]"}`}>Sondi</button></div></div>
                  <div className="space-y-2"><label className="block text-[10px] font-semibold text-[#31577D]">Name<input aria-label="Prepared by name" value={preparedByName} onChange={(e) => setPreparedByName(e.target.value)} className="mt-1 h-8 w-full border border-slate-300 px-2 text-xs font-normal text-[#003366]" /></label><div className="grid grid-cols-2 gap-2"><label className="block text-[10px] font-semibold text-[#31577D]">Designation<input aria-label="Prepared by designation" value={preparedByDesignation} onChange={(e) => setPreparedByDesignation(e.target.value)} className="mt-1 h-8 w-full border border-slate-300 px-2 text-xs font-normal text-[#003366]" /></label><label className="block text-[10px] font-semibold text-[#31577D]">Company<input aria-label="Prepared by company" value={preparedByCompany} onChange={(e) => setPreparedByCompany(e.target.value)} className="mt-1 h-8 w-full border border-slate-300 px-2 text-xs font-normal text-[#003366]" /></label></div></div>
                </div>
              </div>}
            </section>

            <section className="border border-slate-200">
              <button type="button" aria-label={`${assemblerSections.properties ? "Collapse" : "Expand"} Properties`} aria-expanded={assemblerSections.properties} aria-controls="assembler-properties" onClick={() => toggleAssemblerSection("properties")} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-xs font-semibold text-[#003366] hover:bg-slate-50">
                {assemblerSections.properties ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="flex-1">Properties</span><span className="text-[9px] font-normal text-slate-500">{propertySlides.length} pages</span>
              </button>
              {assemblerSections.properties && <div id="assembler-properties" className="border-t border-slate-100 p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Property pages · Industrial Facility Proposal is included for each selected source deck</p>
                {renderAssemblerSlides(propertySlides)}
              </div>}
            </section>

            <section className="border border-slate-200">
              <button type="button" aria-label={`${assemblerSections.cta ? "Collapse" : "Expand"} CTA`} aria-expanded={assemblerSections.cta} aria-controls="assembler-cta" onClick={() => toggleAssemblerSection("cta")} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-xs font-semibold text-[#003366] hover:bg-slate-50">
                {assemblerSections.cta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="flex-1">CTA</span><span className="text-[9px] font-normal text-slate-500">{ctaSlides.length} pages</span>
              </button>
              {assemblerSections.cta && <div id="assembler-cta" className="border-t border-slate-100 p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Call to action pages are included from the selected source decks</p>
                {renderAssemblerSlides(ctaSlides)}
              </div>}
            </section>
          </div>

          <button
            type="button"
            onClick={() => void handleCompileDeck()}
            disabled={compiling || activeProposalManifest.slides.length === 0}
            className="flex min-h-10 w-full items-center justify-center gap-2 border border-[#003366] bg-[#003366] px-4 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-[#174778] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Layers className="h-4 w-4 text-[#C9A84C]" />
            {compiling
              ? exportStage === "pdf" ? "Converting to PDF…" : "Building PowerPoint…"
              : `Export Selected Slides (${activeProposalManifest.slides.length})`}
          </button>
          {compiling && (
            <div className="flex items-start gap-2 border-l-2 border-[#C9A84C] bg-[#FBF7E9] px-3 py-2 text-[11px] text-[#003366]">
              <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              <div className="space-y-0.5">
                <p role="status" aria-live="polite" className="font-semibold">
                  {exportStage === "pdf"
                    ? "Converting PowerPoint to PDF with Microsoft PowerPoint…"
                    : `Compiling ${selectedSlideIds.length} selected slide${selectedSlideIds.length === 1 ? "" : "s"} into PowerPoint…`}
                </p>
                <p aria-live="off" className="text-slate-600">
                  Elapsed {formatElapsedTime(exportElapsedSeconds)} · Large decks may take a few minutes. Keep this page open.
                </p>
                {exportStage === "pdf" && compiledResult && (
                  <p className="text-slate-600">The PowerPoint file is ready; PDF conversion is still running.</p>
                )}
              </div>
            </div>
          )}
          {exportStage === "ready" && <p role="status" className="text-[11px] text-green-700">PPTX and PDF ready to download.</p>}

          {compiledResult && (
            <div className="space-y-2 border border-[#C9A84C] bg-[#FBF7E9] p-3 text-xs text-[#003366]">
              <p className="font-semibold">{exportStage === "ready" ? "PPTX and PDF are ready:" : "PPTX created:"}</p>
              <p className="break-all font-mono text-[11px]">{compiledResult.fileName}</p>
              <p className="text-[10px] text-slate-600">
                {compiledResult.slideCount} slides copied · {compiledResult.outputPath}
              </p>
              {compiledResult.pdfError && (
                <p role="alert" className="text-[11px] text-red-700">
                  PPTX download is ready. PDF conversion failed: {compiledResult.pdfError}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void downloadExport(compiledResult.downloadId, "pptx", compiledResult.fileName)}
                  className="inline-flex min-h-8 items-center gap-1 border border-[#003366] bg-[#003366] px-2.5 text-[11px] font-semibold text-white"
                >
                  Download PPTX
                </button>
                {compiledResult.pdfFileName && (
                  <button
                    type="button"
                    onClick={() => void downloadExport(compiledResult.downloadId, "pdf", compiledResult.pdfFileName || "proposal.pdf")}
                    className="inline-flex min-h-8 items-center gap-1 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366]"
                  >
                    Download PDF
                  </button>
                )}
                {!compiledResult.outputPath.startsWith("/tmp/") && (
                  <>
                    <button
                      type="button"
                      onClick={() => void triggerWindowsOpen(compiledResult.outputPath)}
                      className="inline-flex min-h-8 items-center gap-1 border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-[#003366]"
                    >
                      <FolderOpen className="h-3 w-3" />
                      Show in Explorer
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Modal 1: Configure local folder paths */}
      {folderModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setFolderModalOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="local-folder-modal-title"
            className="w-full max-w-lg border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#31577D]">
                  Local folder storage
                </p>
                <h2 id="local-folder-modal-title" className="mt-1 text-base font-semibold text-[#003366]">
                  Set source and output folders
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
                Source decks folder path
                <input
                  type="text"
                  value={draftSourceFolder}
                  onChange={(e) => setDraftSourceFolder(e.target.value)}
                  placeholder="C:\Users\Name\Documents\Property Decks"
                  className="mt-1 h-10 w-full border border-slate-300 px-3 font-mono text-xs text-[#003366] focus:border-[#003366] focus:outline-none"
                />
                <span className="mt-1 block text-[11px] font-normal text-slate-600">
                  Mosaic Helper must be running on this computer to read the folder path.
                </span>
              </label>

              <label className="block text-xs font-semibold text-[#003366]">
                Compiled proposals output folder
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
                {indexing ? "Rescanning…" : "Save & Rescan Folder"}
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
