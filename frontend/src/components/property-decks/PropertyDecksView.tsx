"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
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
import { rankDemandMatches, type DemandMatchCriteria } from "@/lib/property-deck-demand-matching";
import {
  applySlideOverrides,
  buildCompilationManifest,
  cityNameFromLocation,
  filterPropertySlides,
  isIndustrialFacilityProposalSlide,
  groupPropertySlidesByTitle,
  reorderSelectedSlides,
  type PropertyDeckCatalog,
  type PropertySlideGroup,
  type PropertySlideItem,
  type PropertySlideOverride,
  type ProposalContact,
  type SlideRole,
} from "@/lib/property-decks";

const CONFIG_STORAGE_KEY = "mosaic_property_decks_config_v1";
const OVERRIDES_STORAGE_KEY = "mosaic_property_decks_overrides_v1";
const CART_STORAGE_KEY = "mosaic_property_decks_cart_v1";
const MOSAIC_HELPER_URL = "http://127.0.0.1:43127";
const PREPARED_BY_PRESETS = {
  cedtrix: { name: "Cedtrix Rena", designation: "Sr. Leasing Advisor", company: "PRIME Philippines" },
  sondi: { name: "Sondi Tuazon", designation: "Sr. Head · Retail and Industrial Markets", company: "PRIME Philippines" },
} as const;

const CTA_CONTACT_PRESETS: ProposalContact[] = [
  { id: "sondi", name: "Sondi Tuazon", title: "Sr. Head · Retail and Industrial Markets", phone: "+63 917 845 6128", email: "sondi.tuazon@primephilippines.com" },
  { id: "cedtrix", name: "Cedtrix Rena", title: "Sr. Leasing Advisor", phone: "+63 968 880 5399", email: "cedtrix.rena@primephilippines.com" },
];

const EMPTY_CUSTOM_CONTACT = { name: "", title: "", phone: "", email: "" };
const EMPTY_DEMAND_CRITERIA: DemandMatchCriteria = {
  locations: [],
  minGla: "",
  maxGla: "",
  minLeaseRate: "",
  maxLeaseRate: "",
  minClearHeight: "",
  powerSupplies: [],
  requiresLoadingDock: false,
  requiresTruckAccess: false,
  otherRequirements: "",
};

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
  slideCount: number;
  engine: string;
}

interface ExportJobProgress {
  stage: string;
  currentSlide: number;
  totalSlides: number;
  title: string;
}

interface ExportJobPreview {
  slide: number;
  title: string;
  url: string;
}

interface ExportChecklistItem {
  id: string;
  label: string;
  status: "passed" | "failed";
  detail?: string;
}

export function PropertyDecksView() {
  const [activeAssemblerTab, setActiveAssemblerTab] = useState<"coverpage" | "properties" | "cta">("coverpage");
  const [catalog, setCatalog] = useState<PropertyDeckCatalog | null>(null);
  const [sourceFolder, setSourceFolder] = useState("");
  const [outputFolder, setOutputFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [helperConnected, setHelperConnected] = useState(false);
  const [restartingHelper, setRestartingHelper] = useState(false);
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
  const [demandPanelOpen, setDemandPanelOpen] = useState(false);
  const [demandCriteria, setDemandCriteria] = useState<DemandMatchCriteria>(EMPTY_DEMAND_CRITERIA);
  const [submittedDemandCriteria, setSubmittedDemandCriteria] = useState<DemandMatchCriteria | null>(null);

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
  const [preparedByDetailsOpen, setPreparedByDetailsOpen] = useState(false);
  const [clientLogoDataUrl, setClientLogoDataUrl] = useState("");
  const [selectedCtaContactIds, setSelectedCtaContactIds] = useState<string[]>(["sondi", "cedtrix"]);
  const [presetCtaPhotoDataUrls, setPresetCtaPhotoDataUrls] = useState<Record<string, string>>({});
  const [customCtaContacts, setCustomCtaContacts] = useState<ProposalContact[]>([]);
  const [customContactDraft, setCustomContactDraft] = useState(EMPTY_CUSTOM_CONTACT);
  const [customContactPhotoDataUrl, setCustomContactPhotoDataUrl] = useState("");
  const [customContactFormOpen, setCustomContactFormOpen] = useState(false);
  const [compiledResult, setCompiledResult] = useState<CompiledResult | null>(null);
  const [exportStage, setExportStage] = useState<"idle" | "assembling" | "validating" | "ready" | "failed">("idle");
  const [exportElapsedSeconds, setExportElapsedSeconds] = useState(0);
  const [exportProgress, setExportProgress] = useState<ExportJobProgress | null>(null);
  const [exportPreviews, setExportPreviews] = useState<ExportJobPreview[]>([]);
  const [exportChecklist, setExportChecklist] = useState<ExportChecklistItem[]>([]);
  const [previewWarning, setPreviewWarning] = useState(false);

  useEffect(() => {
    if (!compiling) return;
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setExportElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [compiling]);

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

  useEffect(() => {
    const reference = new Image();
    reference.onload = () => {
      const cropPhoto = (x: number, y: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = 120;
        canvas.height = 120;
        const context = canvas.getContext("2d");
        context?.drawImage(reference, x, y, 60, 60, 0, 0, 120, 120);
        return canvas.toDataURL("image/png");
      };
      setPresetCtaPhotoDataUrls({ sondi: cropPhoto(23, 21), cedtrix: cropPhoto(23, 94) });
    };
    reference.src = "/property-decks/cta-contact-reference.png";
    return () => { reference.onload = null; };
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
        return false;
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
        return true;
      } catch (err) {
        const message = helperRequestError(err, "Unable to index the local folder.");
        setError(message);
        if (/source folder not found/i.test(message)) {
          setDraftSourceFolder(targetSource);
          setDraftOutputFolder(targetOutput);
          setFolderModalOpen(true);
        }
        return false;
      } finally {
        setIndexing(false);
      }
    },
    [outputFolder, persistCart, selectedSlideIds, sourceFolder],
  );

  const restartHelper = async () => {
    setError(null);
    setStatusMessage(null);
    setRestartingHelper(true);
    try {
      const response = await fetch(`${MOSAIC_HELPER_URL}/api/property-decks/helper/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Mosaic Helper could not be restarted.");

      let helperReady = false;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        try {
          const health = await fetch(`${MOSAIC_HELPER_URL}/health`, { cache: "no-store" });
          const healthPayload = await health.json().catch(() => ({}));
          if (health.ok && healthPayload.pid && healthPayload.pid !== payload.pid) {
            helperReady = true;
            break;
          }
        } catch {
          // Wait for the replacement helper to bind its local port.
        }
      }
      if (!helperReady) throw new Error("The helper did not return after restart. Start it using the installed Windows helper task or launcher.");

      setHelperConnected(true);
      const refreshed = await runFolderIndex(sourceFolder, outputFolder);
      if (!refreshed) return;
      setStatusMessage("Mosaic Helper restarted and catalog refreshed.");
    } catch (err) {
      setError(helperRequestError(err, "Unable to restart Mosaic Helper."));
    } finally {
      setRestartingHelper(false);
    }
  };

  const allSlides = useMemo(() => catalog?.slides || [], [catalog]);

  const deckOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const slide of allSlides) {
      if (!map.has(slide.deckId)) map.set(slide.deckId, slide.deckFileName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allSlides]);

  const locationOptions = useMemo(() => {
    const cities = new Set<string>();
    for (const slide of allSlides) {
      if (slide.slideRole !== "property") continue;
      const effective = applySlideOverrides(slide, overrides);
      const loc = effective.specs.location?.trim();
      if (loc && loc !== "Metro Manila / Luzon") {
        const city = cityNameFromLocation(loc);
        if (city) cities.add(city);
      }
    }
    return Array.from(cities).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [allSlides, overrides]);

  const filteredSlides = useMemo(() => {
    return filterPropertySlides(
      allSlides,
      {
        query: searchQuery,
        location: locationFilter,
        deckId: deckFilter,
        roleFilter,
      },
      overrides,
    );
  }, [allSlides, searchQuery, locationFilter, deckFilter, roleFilter, overrides]);

  const slideGroups = useMemo(
    () => groupPropertySlidesByTitle(filteredSlides),
    [filteredSlides],
  );

  const demandMatches = useMemo(
    () => submittedDemandCriteria
      ? rankDemandMatches(slideGroups.map((group) => group.leadSlide), submittedDemandCriteria)
      : null,
    [slideGroups, submittedDemandCriteria],
  );
  const demandMatchBySlideId = useMemo(
    () => new Map((demandMatches || []).map((match) => [match.property.id, match])),
    [demandMatches],
  );
  const displayedSlideGroups = useMemo(() => {
    if (!demandMatches) return slideGroups;
    const matchOrder = new Map(demandMatches.map((match, index) => [match.property.id, index]));
    return slideGroups
      .filter((group) => matchOrder.has(group.leadSlide.id))
      .sort((left, right) => (matchOrder.get(left.leadSlide.id) ?? 0) - (matchOrder.get(right.leadSlide.id) ?? 0));
  }, [demandMatches, slideGroups]);

  const toggleDemandLocation = (city: string) => {
    setDemandCriteria((current) => ({
      ...current,
      locations: current.locations.includes(city)
        ? current.locations.filter((location) => location !== city)
        : [...current.locations, city],
    }));
  };
  const toggleDemandPower = (phase: "three-phase" | "single-phase") => {
    setDemandCriteria((current) => ({
      ...current,
      powerSupplies: current.powerSupplies.includes(phase)
        ? current.powerSupplies.filter((value) => value !== phase)
        : [...current.powerSupplies, phase],
    }));
  };
  const resetDemandCriteria = () => {
    setDemandCriteria(EMPTY_DEMAND_CRITERIA);
    setSubmittedDemandCriteria(null);
  };

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
          ctaContacts: selectedCtaContactIds
            .map((id) => [...CTA_CONTACT_PRESETS, ...customCtaContacts].find((contact) => contact.id === id))
            .filter((contact): contact is ProposalContact => Boolean(contact))
            .map((contact) => ({ ...contact, photoDataUrl: contact.photoDataUrl || presetCtaPhotoDataUrls[contact.id] })),
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
      selectedCtaContactIds,
      customCtaContacts,
      presetCtaPhotoDataUrls,
    ],
  );

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
    setExportStage("assembling");
    setExportProgress(null);
    setExportPreviews([]);
    setExportChecklist([]);
    setPreviewWarning(false);
    try {
      const res = await fetch(`${MOSAIC_HELPER_URL}/api/property-decks/export-jobs`, {
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
              ctaContacts: activeProposalManifest.proposal.ctaContacts || [],
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
      if (!res.ok) throw new Error(payload.error || "The export job could not be started.");
      if (typeof payload.jobId !== "string" || !payload.jobId) throw new Error("Mosaic Helper did not return an export job ID.");
      while (true) {
        const statusResponse = await fetch(`${MOSAIC_HELPER_URL}/api/property-decks/export-jobs?id=${encodeURIComponent(payload.jobId)}`);
        const statusPayload = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(statusPayload.error || "The export job status is unavailable.");
        setExportProgress(statusPayload.progress || null);
        setExportPreviews(Array.isArray(statusPayload.previews) ? statusPayload.previews : []);
        setPreviewWarning((current) => current || Boolean(statusPayload.previewWarning));
        const checklist = Array.isArray(statusPayload.checklist) ? statusPayload.checklist : [];
        setExportChecklist(checklist);
        if (statusPayload.status === "failed") {
          setExportStage("failed");
          throw new Error(statusPayload.error || "Proposal export validation failed. Downloads are blocked.");
        }
        if (statusPayload.status === "validating") setExportStage("validating");
        if (statusPayload.status === "ready") {
          if (!statusPayload.result?.downloadId || !statusPayload.result?.pdfFileName || !checklist.length || checklist.some((item: ExportChecklistItem) => item.status !== "passed")) {
            setExportStage("failed");
            throw new Error("Export checklist failed. PPTX and PDF downloads are blocked until all required checks pass.");
          }
          setCompiledResult({
            downloadId: statusPayload.result.downloadId,
            outputPath: statusPayload.result.outputPath,
            fileName: statusPayload.result.fileName,
            pdfFileName: statusPayload.result.pdfFileName,
            slideCount: statusPayload.result.slideCount,
            engine: statusPayload.result.engine,
          });
          setExportStage("ready");
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    } catch (err) {
      setError(helperRequestError(err, "Failed to compile presentation deck."));
      setExportStage((stage) => stage === "failed" ? "failed" : "idle");
    } finally {
      setCompiling(false);
    }
  };

  const triggerWindowsOpen = async (targetPath: string) => {
    setError(null);
    setStatusMessage(null);
    try {
      const response = await fetch(`${MOSAIC_HELPER_URL}/api/property-decks/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath, action: "reveal-folder" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The local helper could not open the export location.");
      setStatusMessage("Opened the proposal location in File Explorer.");
    } catch (err) {
      const detail = err instanceof Error ? err.message : "The local helper could not open the export location.";
      setError(`Could not open the proposal in File Explorer: ${detail}`);
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
  const ctaPageCount = activeProposalManifest.slides.length > 0 ? 1 : 0;
  const coverPageCount = coverSlides.length || Number(Boolean(activeProposalManifest.generatedCover));
  const handleAssemblerTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: "coverpage" | "properties" | "cta",
  ) => {
    const tabs = ["coverpage", "properties", "cta"] as const;
    const currentIndex = tabs.indexOf(currentTab);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % tabs.length
      : event.key === "ArrowLeft"
        ? (currentIndex + tabs.length - 1) % tabs.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveAssemblerTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`assembler-tab-${nextTab}`)?.focus());
  };
  const choosePreparedByPreset = (preset: keyof typeof PREPARED_BY_PRESETS) => {
    setPreparedByPreset(preset);
    setPreparedByName(PREPARED_BY_PRESETS[preset].name);
    setPreparedByDesignation(PREPARED_BY_PRESETS[preset].designation);
    setPreparedByCompany(PREPARED_BY_PRESETS[preset].company);
  };
  const handleCustomContactPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setError("Use a PNG or JPG photo for a contact.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Contact photos must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCustomContactPhotoDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  };
  const addCustomCtaContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = customContactDraft.name.trim();
    if (!name) return;
    const contact: ProposalContact = {
      id: `custom-${Date.now()}`,
      name,
      title: customContactDraft.title.trim(),
      phone: customContactDraft.phone.trim(),
      email: customContactDraft.email.trim(),
      photoDataUrl: customContactPhotoDataUrl || undefined,
    };
    setCustomCtaContacts((current) => [...current, contact]);
    setSelectedCtaContactIds((current) => [...current, contact.id]);
    setCustomContactDraft(EMPTY_CUSTOM_CONTACT);
    setCustomContactPhotoDataUrl("");
    setCustomContactFormOpen(false);
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
                  <button type="button" aria-label={`Move ${slide.title} up`} disabled={cartIndex === 0} onClick={() => moveCartSlide(cartIndex, -1)} className="inline-flex h-7 w-7 items-center justify-center border border-slate-200 text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C9A84C] disabled:opacity-30"><ArrowUp aria-hidden="true" className="h-3 w-3" /></button>
                  <button type="button" aria-label={`Move ${slide.title} down`} disabled={cartIndex === selectedSlideIds.length - 1} onClick={() => moveCartSlide(cartIndex, 1)} className="inline-flex h-7 w-7 items-center justify-center border border-slate-200 text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C9A84C] disabled:opacity-30"><ArrowDown aria-hidden="true" className="h-3 w-3" /></button>
                  <button type="button" aria-label={`Remove ${slide.title}`} onClick={() => toggleSelectSlide(slide.id)} className="inline-flex h-7 w-7 items-center justify-center border border-slate-200 text-slate-500 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C9A84C]"><Trash2 aria-hidden="true" className="h-3 w-3" /></button>
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
          <button
            type="button"
            onClick={() => void restartHelper()}
            disabled={restartingHelper}
            aria-label={`Mosaic Helper ${helperConnected ? "connected. Restart helper" : "offline. Start or restart helper"}`}
            className={`inline-flex h-8 min-h-8 items-center justify-center gap-1.5 border px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C9A84C] disabled:cursor-wait disabled:opacity-60 ${helperConnected ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400" : "border-amber-300 bg-[#FBF7E9] text-[#735600] hover:border-amber-500"}`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${helperConnected ? "bg-emerald-600" : "bg-amber-500"}`} />
            <span aria-live="polite">Mosaic Helper {helperConnected ? "connected" : "offline"}</span>
            <span aria-hidden="true" className="mx-0.5 h-4 border-l border-current/25" />
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${restartingHelper ? "animate-spin" : ""}`} />
            {restartingHelper ? "Restarting…" : helperConnected ? "Restart" : "Start / Restart"}
          </button>
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
                {locationOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
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

              <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs text-slate-600">
                <span className="ml-2 text-[11px] font-semibold text-[#31577D]">
                  {filteredSlides.length} slide{filteredSlides.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  aria-expanded={demandPanelOpen}
                  aria-controls="demand-matching-panel"
                  onClick={() => setDemandPanelOpen((open) => !open)}
                  className={`ml-1 inline-flex min-h-8 items-center justify-center gap-1.5 border px-2.5 text-[10px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C9A84C] ${demandPanelOpen ? "border-[#003366] bg-[#003366] text-white" : "border-[#003366] bg-white text-[#003366] hover:bg-slate-50"}`}
                >
                  Demand Matching
                  {submittedDemandCriteria && <span className="bg-[#C9A84C] px-1.5 py-0.5 text-[9px] text-[#003366]">Active</span>}
                </button>
              </div>
            </div>

            {demandPanelOpen && (
              <section id="demand-matching-panel" role="region" aria-label="Demand matching requirements" className="mt-3 border border-slate-200 bg-slate-50/70 p-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-semibold text-[#003366]">Client demand</h2>
                    <p className="mt-0.5 text-[10px] text-slate-500">Set requirements to rank properties in the current catalog view.</p>
                  </div>
                  <button type="button" onClick={resetDemandCriteria} className="min-h-7 border border-slate-300 bg-white px-2 text-[10px] font-semibold text-[#31577D] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C]">Reset criteria</button>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <fieldset className="min-w-0 border-0 p-0 sm:col-span-2 lg:col-span-4">
                    <legend className="mb-1.5 text-[10px] font-semibold text-[#31577D]">Preferred locations</legend>
                    <details className="group relative max-w-full">
                      <summary aria-label={`Preferred locations${demandCriteria.locations.length ? `, ${demandCriteria.locations.length} selected` : ""}`} className="flex min-h-8 w-full max-w-sm cursor-pointer list-none items-center justify-between gap-3 border border-slate-300 bg-white px-2.5 text-left text-xs text-[#003366] marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C9A84C] [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 truncate">
                          {demandCriteria.locations.length
                            ? demandCriteria.locations.join(", ")
                            : "All cities"}
                        </span>
                        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full max-w-sm overflow-y-auto border border-slate-300 bg-white p-1.5 shadow-md">
                        {locationOptions.map((city) => (
                          <label key={city} className="flex min-h-8 cursor-pointer items-center gap-2 px-2 text-xs text-[#003366] hover:bg-slate-50">
                            <input type="checkbox" aria-label={`Prefer ${city}`} checked={demandCriteria.locations.includes(city)} onChange={() => toggleDemandLocation(city)} className="accent-[#003366]" />
                            {city}
                          </label>
                        ))}
                        {locationOptions.length === 0 && <p className="px-2 py-2 text-xs text-slate-500">Locations appear after a catalog is loaded.</p>}
                      </div>
                    </details>
                    <p className="mt-1 text-[10px] text-slate-500">Select any cities that work.</p>
                  </fieldset>

                  <label className="min-w-0 text-[10px] font-semibold text-[#31577D]">Leasable area (sqm)
                    <span className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-slate-400">
                      <input type="number" min="0" aria-label="Minimum leasable area (sqm)" placeholder="Min" value={demandCriteria.minGla} onChange={(event) => setDemandCriteria((current) => ({ ...current, minGla: event.target.value }))} className="h-8 w-full border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366]" />
                      <span>to</span>
                      <input type="number" min="0" aria-label="Maximum leasable area (sqm)" placeholder="Max" value={demandCriteria.maxGla} onChange={(event) => setDemandCriteria((current) => ({ ...current, maxGla: event.target.value }))} className="h-8 w-full border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366]" />
                    </span>
                  </label>

                  <label className="min-w-0 text-[10px] font-semibold text-[#31577D]">Lease rate (Php/sqm)
                    <span className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-slate-400">
                      <input type="number" min="0" aria-label="Minimum lease rate (Php/sqm)" placeholder="Min" value={demandCriteria.minLeaseRate} onChange={(event) => setDemandCriteria((current) => ({ ...current, minLeaseRate: event.target.value }))} className="h-8 w-full border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366]" />
                      <span>to</span>
                      <input type="number" min="0" aria-label="Maximum lease rate (Php/sqm)" placeholder="Max" value={demandCriteria.maxLeaseRate} onChange={(event) => setDemandCriteria((current) => ({ ...current, maxLeaseRate: event.target.value }))} className="h-8 w-full border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366]" />
                    </span>
                  </label>

                  <label className="min-w-0 text-[10px] font-semibold text-[#31577D]">Minimum clear height (m)
                    <input type="number" min="0" aria-label="Minimum clear height (m)" placeholder="Any" value={demandCriteria.minClearHeight} onChange={(event) => setDemandCriteria((current) => ({ ...current, minClearHeight: event.target.value }))} className="mt-1 h-8 w-full border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366]" />
                  </label>

                  <fieldset className="min-w-0 border-0 p-0">
                    <legend className="mb-1.5 text-[10px] font-semibold text-[#31577D]">Power supply</legend>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-700"><input type="checkbox" aria-label="Three-phase power" checked={demandCriteria.powerSupplies.includes("three-phase")} onChange={() => toggleDemandPower("three-phase")} className="accent-[#003366]" />Three-phase</label>
                      <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-700"><input type="checkbox" aria-label="Single-phase power" checked={demandCriteria.powerSupplies.includes("single-phase")} onChange={() => toggleDemandPower("single-phase")} className="accent-[#003366]" />Single-phase</label>
                    </div>
                  </fieldset>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-2.5">
                  <span className="text-[10px] font-semibold text-[#31577D]">Required access</span>
                  <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-700"><input type="checkbox" aria-label="Loading dock or bay" checked={demandCriteria.requiresLoadingDock} onChange={(event) => setDemandCriteria((current) => ({ ...current, requiresLoadingDock: event.target.checked }))} className="accent-[#003366]" />Loading dock or bay</label>
                  <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-700"><input type="checkbox" aria-label="Truck access" checked={demandCriteria.requiresTruckAccess} onChange={(event) => setDemandCriteria((current) => ({ ...current, requiresTruckAccess: event.target.checked }))} className="accent-[#003366]" />Truck access</label>
                </div>

                <label className="mt-3 block text-[10px] font-semibold text-[#31577D]" htmlFor="demand-other-requirements">Other requirements
                  <span className="ml-1 font-normal text-slate-500">Included in the match request</span>
                  <textarea id="demand-other-requirements" aria-label="Other requirements" value={demandCriteria.otherRequirements} onChange={(event) => setDemandCriteria((current) => ({ ...current, otherRequirements: event.target.value }))} placeholder="For requirements beyond these filters, such as 24/7 access, proximity to a port, or trailer parking." className="mt-1 min-h-16 w-full resize-y border border-slate-300 bg-white px-2.5 py-2 text-xs font-normal text-[#003366] placeholder:text-slate-400" />
                  <span className="mt-1 block font-normal text-slate-500">Compared with indexed slide details; criteria without evidence are shown as not confirmed.</span>
                </label>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
                  <p className="text-[10px] text-slate-500">Exact matches appear first. Partial matches show which details are missing or unconfirmed.</p>
                  <button type="button" onClick={() => setSubmittedDemandCriteria({ ...demandCriteria, locations: [...demandCriteria.locations], powerSupplies: [...demandCriteria.powerSupplies] })} className="inline-flex min-h-8 items-center justify-center border border-[#003366] bg-[#003366] px-3 text-[10px] font-semibold text-white hover:bg-[#174778] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C9A84C]">Find matching properties</button>
                </div>
              </section>
            )}
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
                    }}
                    className="inline-flex min-h-9 items-center gap-1.5 border border-slate-300 bg-white px-3.5 text-xs font-semibold text-[#003366]"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          ) : submittedDemandCriteria && demandMatches?.length === 0 ? (
            <div role="status" className="border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <h2 className="text-sm font-semibold text-[#003366]">No properties match these requirements</h2>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">Try widening the area or lease range, selecting more locations, or removing a requirement. Your catalog filters and proposal selection are unchanged.</p>
              <button type="button" onClick={resetDemandCriteria} className="mt-3 min-h-8 border border-slate-300 bg-white px-3 text-[10px] font-semibold text-[#003366] hover:border-[#003366]">Reset demand criteria</button>
            </div>
          ) : (
            <>
              {demandMatches && (
                <div className="border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-xs font-semibold text-[#003366]">Demand match results <span className="font-normal text-slate-500">{demandMatches.length} properties · {demandMatches.filter((match) => match.matchKind === "exact").length} exact · {demandMatches.filter((match) => match.matchKind === "partial").length} partial</span></p>
                  {submittedDemandCriteria?.otherRequirements && <p className="mt-1 border-l-2 border-[#C9A84C] bg-[#FBF7E9] px-2 py-1 text-[10px] text-[#5F573F]">Other requirement included in match request: “{submittedDemandCriteria.otherRequirements}”</p>}
                </div>
              )}
            <div className="grid gap-3.5 sm:grid-cols-2" role={demandMatches ? "region" : undefined} aria-label={demandMatches ? "Demand match results" : undefined}>
              {displayedSlideGroups.map((group) => {
                const isMultiSlide = group.slides.length > 1;
                const demandMatch = demandMatchBySlideId.get(group.leadSlide.id);
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
                          {demandMatch && <span className={`mt-1 inline-flex items-center border px-1.5 py-0.5 text-[9px] font-semibold ${demandMatch.matchKind === "exact" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-[#FBF7E9] text-[#735600]"}`}>{demandMatch.matchKind === "exact" ? "Exact match" : "Partial match"} · {demandMatch.matchedCount}/{demandMatch.requirementCount} criteria</span>}
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

                      {demandMatch && (
                        <ul aria-label={`${demandMatch.matchKind} match criteria for ${group.title}`} className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-[9px] text-slate-600">
                          {demandMatch.criteria.map((criterion) => (
                            <li key={criterion.key} className="flex min-w-0 gap-1.5">
                              <span className={criterion.matched ? "font-semibold text-emerald-800" : "font-semibold text-amber-800"}>{criterion.matched ? "Meets" : "Not met"}</span>
                              <span className="font-semibold text-[#31577D]">{criterion.label}:</span>
                              <span className="min-w-0 break-words">{criterion.evidence}</span>
                            </li>
                          ))}
                        </ul>
                      )}

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
            </>
          )}
        </div>

        {/* Right Column: Proposal Compiler & Cart */}
        <aside aria-label="Proposal deck compiler" className="flex min-w-0 w-full flex-col border border-slate-200 bg-white p-3 sm:p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#31577D]">
                Proposal Assembler
              </p>
              <h2 className="text-base font-semibold text-[#003366]">
                Selected Slides ({activeProposalManifest.slides.length + Number(Boolean(activeProposalManifest.generatedCover)) + ctaPageCount})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void handleCompileDeck()}
              disabled={compiling || activeProposalManifest.slides.length === 0}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 border border-[#003366] bg-[#003366] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#174778] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Layers aria-hidden="true" className="h-3.5 w-3.5 text-[#C9A84C]" />
              {compiling ? exportStage === "validating" ? "Checking…" : "Building…" : "Export Proposal"}
            </button>
          </div>

          {compiling && (
            <div className="flex items-start gap-2 border-l-2 border-[#C9A84C] bg-[#FBF7E9] px-3 py-2 text-[11px] text-[#003366]">
              <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              <div className="space-y-0.5">
                <p role="status" aria-live="polite" className="font-semibold">
                  {exportStage === "validating"
                    ? "Checking the exported PowerPoint and PDF…"
                    : (exportProgress?.title || `Building ${selectedSlideIds.length} selected property slide${selectedSlideIds.length === 1 ? "" : "s"} in Mosaic…`)}
                </p>
                <p aria-live="off" className="text-slate-600">
                  {exportProgress ? `Slide ${exportProgress.currentSlide} of ${exportProgress.totalSlides}` : "Starting the assembly"} · Elapsed {formatElapsedTime(exportElapsedSeconds)}
                </p>
                {exportPreviews.length > 0 && (
                  <div aria-label="Live slide previews" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {exportPreviews.map((preview) => (
                      <figure key={preview.slide} className="min-w-0 border border-slate-200 bg-white p-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${MOSAIC_HELPER_URL}${preview.url}`} alt={`Slide ${preview.slide} preview: ${preview.title}`} crossOrigin="anonymous" className="aspect-video w-full object-contain" onError={() => setPreviewWarning(true)} />
                        <figcaption className="truncate px-1 py-0.5 text-[9px] text-slate-600">{preview.slide}. {preview.title}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                {previewWarning && <p role="status" className="text-slate-600">Some slide previews could not render. File validation continues.</p>}
                {exportChecklist.length > 0 && (
                  <ul aria-label="Export validation checklist" className="space-y-1 pt-1">
                    {exportChecklist.map((item) => <li key={item.id} className={item.status === "passed" ? "text-green-700" : "text-red-700"}>{item.status === "passed" ? "✓" : "✕"} {item.label}{item.detail ? ` — ${item.detail}` : ""}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
          {exportStage === "ready" && <p role="status" className="text-[11px] text-green-700">PPTX and PDF passed the export checklist and are ready to download.</p>}
          {exportStage === "failed" && <p role="alert" className="text-[11px] text-red-700">Required export checks failed. Downloads are blocked.</p>}
          {exportStage === "ready" && exportChecklist.length > 0 && (
            <ul aria-label="Export validation checklist" className="mt-2 space-y-1 border-l-2 border-green-600 bg-green-50 px-3 py-2 text-[10px]">
              {exportChecklist.map((item) => <li key={item.id} className={item.status === "passed" ? "text-green-800" : "text-red-700"}>{item.status === "passed" ? "✓" : "✕"} {item.label}{item.detail ? ` — ${item.detail}` : ""}</li>)}
            </ul>
          )}
          {exportStage === "failed" && exportChecklist.length > 0 && (
            <ul aria-label="Export validation checklist" className="mt-2 space-y-1 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-[10px]">
              {exportChecklist.map((item) => <li key={item.id} className={item.status === "passed" ? "text-green-800" : "text-red-700"}>{item.status === "passed" ? "✓" : "✕"} {item.label}{item.detail ? ` — ${item.detail}` : ""}</li>)}
            </ul>
          )}
          {exportStage === "ready" && previewWarning && <p role="status" className="mt-2 text-[10px] text-amber-700">Some thumbnails could not render; the validated PPTX and PDF are still available.</p>}

          {compiledResult && (
            <div className="mt-3 shrink-0 space-y-2 border-t border-slate-200 pt-3 text-xs text-[#003366]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Proposal files are ready</p>
                <span className="text-[10px] text-slate-500">{compiledResult.slideCount} slides</span>
              </div>
              <p className="break-all text-[10px] text-slate-500">{compiledResult.fileName}</p>
              <div role="group" aria-label="Proposal export options" className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void downloadExport(compiledResult.downloadId, "pptx", compiledResult.fileName)}
                  className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 border border-[#003366] bg-[#003366] px-3 text-[11px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]"
                >
                  Download PPTX
                </button>
                <button
                  type="button"
                  disabled={!compiledResult.pdfFileName}
                  title={compiledResult.pdfFileName ? undefined : "PDF is unavailable because conversion failed."}
                  onClick={() => compiledResult.pdfFileName && void downloadExport(compiledResult.downloadId, "pdf", compiledResult.pdfFileName)}
                  className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 border border-slate-300 bg-white px-3 text-[11px] font-semibold text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  disabled={compiledResult.outputPath.startsWith("/tmp/")}
                  title={compiledResult.outputPath.startsWith("/tmp/") ? "The output folder is unavailable in this environment." : undefined}
                  onClick={() => void triggerWindowsOpen(compiledResult.outputPath)}
                  className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 border border-slate-300 bg-white px-3 text-[11px] font-semibold text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <FolderOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Show in Explorer
                </button>
              </div>
            </div>
          )}

          <div role="tablist" aria-label="Proposal sections" className="-mx-1 flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-1 pt-3">
            {([
              { id: "coverpage", label: "Coverpage", count: coverPageCount },
              { id: "properties", label: "Properties", count: propertySlides.length },
              { id: "cta", label: "CTA", count: ctaPageCount },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                id={`assembler-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeAssemblerTab === tab.id}
                aria-controls={`assembler-panel-${tab.id}`}
                tabIndex={activeAssemblerTab === tab.id ? 0 : -1}
                onClick={() => setActiveAssemblerTab(tab.id)}
                onKeyDown={(event) => handleAssemblerTabKeyDown(event, tab.id)}
                className={`relative inline-flex min-h-10 shrink-0 items-center gap-1.5 border border-transparent border-b-0 px-3 text-[11px] font-semibold transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#C9A84C] ${activeAssemblerTab === tab.id ? "border-slate-200 bg-white text-[#003366] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[#C9A84C]" : "text-slate-500 hover:bg-slate-50 hover:text-[#003366]"}`}
              >
                {tab.label}<span className={`text-[9px] font-normal ${activeAssemblerTab === tab.id ? "text-slate-500" : "text-slate-400"}`}>{tab.count} {tab.count === 1 ? "page" : "pages"}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-3 pr-1">
            <section id="assembler-panel-coverpage" role="tabpanel" aria-labelledby="assembler-tab-coverpage" tabIndex={0} hidden={activeAssemblerTab !== "coverpage"} className="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C]">
              {activeAssemblerTab === "coverpage" && <div className="space-y-2.5">
                <div className="mb-3 flex items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-[#003366]">Coverpage details</h3><span className="text-[10px] text-slate-500">Client &amp; prepared by</span></div>
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="min-w-0 block text-[10px] font-semibold text-[#31577D]">Contact person<input aria-label="Contact person" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Full name" className="mt-1 h-8 w-full min-w-0 border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366] focus:border-[#003366] focus:outline-none" /></label>
                  <label className="min-w-0 block text-[10px] font-semibold text-[#31577D]">Job title<input aria-label="Job title" type="text" value={clientDesignation} onChange={(e) => setClientDesignation(e.target.value)} placeholder="Title" className="mt-1 h-8 w-full min-w-0 border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366] focus:border-[#003366] focus:outline-none" /></label>
                  <label className="min-w-0 block text-[10px] font-semibold text-[#31577D]">Company<input aria-label="Company" type="text" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} placeholder="Company name" className="mt-1 h-8 w-full min-w-0 border border-slate-300 bg-white px-2 text-xs font-normal text-[#003366] focus:border-[#003366] focus:outline-none" /></label>
                </div>
                <label htmlFor="proposal-client-logo" className="flex cursor-pointer items-center gap-2 border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-[#003366] hover:bg-slate-50 focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#C9A84C]">
                  <Presentation className="h-4 w-4 shrink-0 text-[#31577D]" />
                  <span className="min-w-0 flex-1 truncate">{clientLogoDataUrl ? "Company logo selected" : "Company logo"}<span className="block font-normal text-slate-500">Optional · PNG or JPG</span></span>
                  <span className="shrink-0 border border-slate-300 px-2 py-1 text-[9px] font-semibold">{clientLogoDataUrl ? "Replace" : "Upload"}</span>
                  {clientLogoDataUrl && <img src={clientLogoDataUrl} alt="Client logo preview" className="h-8 w-12 object-contain" />}
                </label>
                <input id="proposal-client-logo" aria-label="Upload company logo" type="file" accept="image/png,image/jpeg" onChange={handleClientLogoChange} className="sr-only" />
                <div className="border-t border-slate-100 pt-2.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-semibold text-[#31577D]">Prepared by</span><div role="group" aria-label="Choose prepared by representative" className="flex gap-1"><button type="button" aria-pressed={preparedByPreset === "cedtrix"} onClick={() => choosePreparedByPreset("cedtrix")} className={`border px-2 py-1 text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C9A84C] ${preparedByPreset === "cedtrix" ? "border-[#003366] bg-[#003366] text-white" : "border-slate-300 text-[#003366]"}`}>Cedtrix</button><button type="button" aria-pressed={preparedByPreset === "sondi"} onClick={() => choosePreparedByPreset("sondi")} className={`border px-2 py-1 text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C9A84C] ${preparedByPreset === "sondi" ? "border-[#003366] bg-[#003366] text-white" : "border-slate-300 text-[#003366]"}`}>Sondi</button></div></div>
                  <div className="flex min-w-0 items-center gap-2 border border-slate-200 bg-slate-50 px-2 py-2">
                    {presetCtaPhotoDataUrls[preparedByPreset] ? <img src={presetCtaPhotoDataUrls[preparedByPreset]} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#003366] text-[10px] font-semibold text-white">{preparedByName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}
                    <span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-[#003366]">{preparedByName || "Prepared by"}</strong><span className="block truncate text-[9px] text-slate-500">{[preparedByDesignation, preparedByCompany].filter(Boolean).join(" · ")}</span></span>
                    <button type="button" aria-expanded={preparedByDetailsOpen} aria-controls="prepared-by-details" onClick={() => setPreparedByDetailsOpen((open) => !open)} className="min-h-8 shrink-0 border border-slate-300 bg-white px-2 text-[9px] font-semibold text-[#31577D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C]">{preparedByDetailsOpen ? "Hide details" : "Edit details"}</button>
                  </div>
                  {preparedByDetailsOpen && <div id="prepared-by-details" className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3"><label className="min-w-0 block text-[10px] font-semibold text-[#31577D]">Name<input aria-label="Prepared by name" value={preparedByName} onChange={(e) => setPreparedByName(e.target.value)} className="mt-1 h-8 w-full min-w-0 border border-slate-300 px-2 text-xs font-normal text-[#003366]" /></label><label className="min-w-0 block text-[10px] font-semibold text-[#31577D]">Designation<input aria-label="Prepared by designation" value={preparedByDesignation} onChange={(e) => setPreparedByDesignation(e.target.value)} className="mt-1 h-8 w-full min-w-0 border border-slate-300 px-2 text-xs font-normal text-[#003366]" /></label><label className="min-w-0 block text-[10px] font-semibold text-[#31577D]">Company<input aria-label="Prepared by company" value={preparedByCompany} onChange={(e) => setPreparedByCompany(e.target.value)} className="mt-1 h-8 w-full min-w-0 border border-slate-300 px-2 text-xs font-normal text-[#003366]" /></label></div>}
                </div>
              </div>}
            </section>

            <section id="assembler-panel-properties" role="tabpanel" aria-labelledby="assembler-tab-properties" tabIndex={0} hidden={activeAssemblerTab !== "properties"} className="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C]">
              {activeAssemblerTab === "properties" && <div>
                <div className="mb-3 flex items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-[#003366]">Selected properties</h3><span className="text-[10px] text-slate-500">{propertySlides.length} {propertySlides.length === 1 ? "page" : "pages"}</span></div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Property pages · Industrial Facility Proposal is included for each selected source deck</p>
                {renderAssemblerSlides(propertySlides)}
              </div>}
            </section>

            <section id="assembler-panel-cta" role="tabpanel" aria-labelledby="assembler-tab-cta" tabIndex={0} hidden={activeAssemblerTab !== "cta"} className="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C]">
              {activeAssemblerTab === "cta" && <div className="space-y-3">
                <div className="mb-3 flex items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-[#003366]">Call to action</h3><span className="text-[10px] text-slate-500">{ctaPageCount} {ctaPageCount === 1 ? "page" : "pages"} · included</span></div>
                <div className="mb-3 border border-slate-200 bg-slate-50 px-2.5 py-2 text-[10px] text-slate-600">One generated contact page is included in every proposal export.</div>
                <p className="text-[10px] leading-4 text-slate-600">Choose who appears on the included contact slide. Selected contacts are also added to the exported proposal in this order.</p>
                <div className="grid min-w-0 grid-cols-1 gap-3 min-[440px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="min-w-0 border border-slate-200">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-2"><strong className="text-[10px] text-[#003366]">Contact presets</strong><span className="text-[9px] text-slate-500">{selectedCtaContactIds.length} selected</span></div>
                    <div className="grid gap-1.5 p-2">
                      {CTA_CONTACT_PRESETS.map((contact) => {
                        const selected = selectedCtaContactIds.includes(contact.id);
                        const position = contact.id === "sondi" ? "-23px -21px" : "-23px -94px";
                        return <label key={contact.id} className={`flex min-w-0 cursor-pointer items-center gap-2 border px-2 py-2 ${selected ? "border-[#C9A84C] bg-[#FBF7E9]" : "border-slate-200 bg-white"}`}>
                          <input type="checkbox" checked={selected} onChange={(event) => setSelectedCtaContactIds((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} aria-label={`Select ${contact.name}`} className="h-3.5 w-3.5 shrink-0 accent-[#003366]" />
                          <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-full border border-[#C9A84C] bg-white" style={{ backgroundImage: "url('/property-decks/cta-contact-reference.png')", backgroundSize: "300px 160px", backgroundPosition: position }} />
                          <span className="min-w-0"><strong className="block truncate text-[10px] text-[#003366]">{contact.name}</strong><span className="block text-[9px] leading-3 text-slate-500">{contact.title}</span></span>
                        </label>;
                      })}
                      {customCtaContacts.map((contact) => <label key={contact.id} className={`flex min-w-0 cursor-pointer items-center gap-2 border px-2 py-2 ${selectedCtaContactIds.includes(contact.id) ? "border-[#C9A84C] bg-[#FBF7E9]" : "border-slate-200 bg-white"}`}>
                        <input type="checkbox" checked={selectedCtaContactIds.includes(contact.id)} onChange={(event) => setSelectedCtaContactIds((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} aria-label={`Select ${contact.name}`} className="h-3.5 w-3.5 shrink-0 accent-[#003366]" />
                        {contact.photoDataUrl ? <img src={contact.photoDataUrl} alt="" className="h-9 w-9 shrink-0 rounded-full border border-[#C9A84C] object-cover" /> : <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#003366] text-[9px] font-semibold text-white">{contact.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}
                        <span className="min-w-0"><strong className="block truncate text-[10px] text-[#003366]">{contact.name}</strong><span className="block truncate text-[9px] text-slate-500">{contact.title || "Custom contact"}</span></span>
                      </label>)}
                    </div>
                    <div className="border-t border-slate-200 p-2">
                      <button type="button" aria-expanded={customContactFormOpen} onClick={() => setCustomContactFormOpen((open) => !open)} className="min-h-8 w-full border border-[#003366] bg-white px-2 text-[10px] font-semibold text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C9A84C]">{customContactFormOpen ? "Cancel custom contact" : "+ Add custom contact"}</button>
                      {customContactFormOpen && <form onSubmit={addCustomCtaContact} className="mt-2 grid grid-cols-2 gap-2">
                        <label className="col-span-2 block text-[9px] font-semibold text-[#31577D]">Name<input required aria-label="Custom contact name" value={customContactDraft.name} onChange={(event) => setCustomContactDraft({ ...customContactDraft, name: event.target.value })} className="mt-1 h-8 w-full border border-slate-300 px-2 text-[10px] font-normal text-[#003366]" /></label>
                        <label className="col-span-2 block text-[9px] font-semibold text-[#31577D]">Title<input aria-label="Custom contact title" value={customContactDraft.title} onChange={(event) => setCustomContactDraft({ ...customContactDraft, title: event.target.value })} className="mt-1 h-8 w-full border border-slate-300 px-2 text-[10px] font-normal text-[#003366]" /></label>
                        <label className="block text-[9px] font-semibold text-[#31577D]">Phone<input aria-label="Custom contact phone" value={customContactDraft.phone} onChange={(event) => setCustomContactDraft({ ...customContactDraft, phone: event.target.value })} className="mt-1 h-8 w-full border border-slate-300 px-2 text-[10px] font-normal text-[#003366]" /></label>
                        <label className="block text-[9px] font-semibold text-[#31577D]">Email<input type="email" aria-label="Custom contact email" value={customContactDraft.email} onChange={(event) => setCustomContactDraft({ ...customContactDraft, email: event.target.value })} className="mt-1 h-8 w-full border border-slate-300 px-2 text-[10px] font-normal text-[#003366]" /></label>
                        <label className="col-span-2 block text-[9px] font-semibold text-[#31577D]">Photo · optional PNG or JPG<input type="file" accept="image/png,image/jpeg" aria-label="Custom contact photo" onChange={handleCustomContactPhotoChange} className="mt-1 block w-full text-[9px] font-normal text-slate-600 file:mr-2 file:border file:border-slate-300 file:bg-white file:px-2 file:py-1" /></label>
                        {customContactPhotoDataUrl && <img src={customContactPhotoDataUrl} alt="Custom contact photo selected" className="col-span-2 h-10 w-10 rounded-full border border-[#C9A84C] object-cover" />}
                        <button type="submit" className="col-span-2 min-h-8 border border-[#003366] bg-[#003366] px-2 text-[10px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C9A84C]">Save contact</button>
                      </form>}
                    </div>
                  </div>
                  <section aria-label="CTA contact slide preview" className="min-w-0 border border-slate-200 bg-slate-50 p-2.5">
                    <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">Slide preview · CTA contacts</p>
                    <p className="mb-2 text-[11px] italic text-[#003366]">For more information and to schedule a viewing, contact us:</p>
                    <div aria-live="polite" className="grid gap-2">
                      {selectedCtaContactIds.map((id) => [...CTA_CONTACT_PRESETS, ...customCtaContacts].find((contact) => contact.id === id)).filter((contact): contact is ProposalContact => Boolean(contact)).map((contact) => {
                        const photo = contact.photoDataUrl || presetCtaPhotoDataUrls[contact.id];
                        return <div key={contact.id} className="flex min-w-0 items-center gap-2 border border-slate-200 bg-white p-2">
                          {photo ? <img src={photo} alt="" className="h-10 w-10 shrink-0 rounded-full border border-[#C9A84C] object-cover" /> : <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#003366] text-[10px] font-semibold text-white">{contact.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}
                          <span className="min-w-0 text-[9px] leading-4 text-slate-600"><strong className="block truncate text-[10px] text-[#003366]">{contact.name}</strong><span className="block truncate">{contact.title}</span>{contact.phone && <span className="block truncate">{contact.phone}</span>}{contact.email && <span className="block break-all">{contact.email}</span>}</span>
                        </div>;
                      })}
                      {selectedCtaContactIds.length === 0 && <p className="border border-dashed border-slate-300 bg-white px-2 py-4 text-center text-[10px] text-slate-500">Select one or more contacts to preview them here.</p>}
                    </div>
                    <p className="mt-2 text-[9px] text-slate-500">Contacts appear in this order in the exported proposal.</p>
                  </section>
                </div>
              </div>}
            </section>
          </div>

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
              {error && /source folder not found/i.test(error) && (
                <p role="status" className="border border-amber-300 bg-[#FBF7E9] px-3 py-2 text-xs text-[#735600]">
                  The saved source folder could not be found. Check the path below; OneDrive folder names may include extra spaces.
                </p>
              )}
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
