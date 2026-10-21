export type SlideRole = "cover" | "property" | "summary" | "vicinity" | "credentials" | "closing";
export type DeckCompilationMode = "standard" | "comprehensive";

export interface PropertySlideSpecs {
  propertyName: string;
  location: string;
  gla: string;
  ceilingHeight: string;
  leaseRate: string;
  powerSupply: string;
  loadingBays: string;
  notes: string;
}

export type PropertySlideOverride = Partial<PropertySlideSpecs>;

export interface PropertySlideItem {
  id: string;
  deckId: string;
  deckFileName: string;
  deckFilePath: string;
  slideNumber: number;
  slideRole: SlideRole;
  title: string;
  rawText: string;
  thumbnailUrl: string;
  specs: PropertySlideSpecs;
  hasOverrides?: boolean;
}

export interface PitchProposalDetails {
  clientName: string;
  projectTitle: string;
  brokerName: string;
  brokerEmail: string;
  brokerPhone: string;
  date: string;
  mode: DeckCompilationMode;
}

export interface ComparisonTableRow {
  optionNumber: number;
  slideId: string;
  propertyName: string;
  location: string;
  gla: string;
  ceilingHeight: string;
  leaseRate: string;
  powerSupply: string;
  loadingBays: string;
  notes: string;
}

export interface CompilationManifest {
  mode: DeckCompilationMode;
  proposal: PitchProposalDetails;
  includeSummaryTable: boolean;
  includeCredentials: boolean;
  slides: PropertySlideItem[];
  comparisonRows: ComparisonTableRow[];
}

export interface PropertyDeckCatalog {
  sourceFolder: string;
  outputFolder: string;
  indexedAt: string;
  decksCount: number;
  slides: PropertySlideItem[];
}

const KNOWN_CITIES = [
  "Calamba",
  "Cabuyao",
  "Biñan",
  "Binan",
  "Sta. Rosa",
  "Santa Rosa",
  "San Pedro",
  "Laguna",
  "Carmona",
  "Silang",
  "Dasmariñas",
  "Dasmarinas",
  "Imus",
  "Bacoor",
  "General Trias",
  "Cavite",
  "Plaridel",
  "Marilao",
  "Meycauayan",
  "Bocaue",
  "Guiguinto",
  "Balagtas",
  "Sta. Maria",
  "Bulacan",
  "Sto. Tomas",
  "Lipa",
  "Tanauan",
  "Batangas",
  "San Fernando",
  "Clark",
  "Porac",
  "Mexico",
  "Pampanga",
  "Subic",
  "Tarlac",
  "Pasig",
  "Taguig",
  "Parañaque",
  "Paranaque",
  "Muntinlupa",
  "Las Piñas",
  "Valenzuela",
  "Caloocan",
  "Malabon",
  "Navotas",
  "Quezon City",
  "Manila",
  "Mandaluyong",
  "Makati",
  "Marikina",
  "Cainta",
  "Taytay",
  "Antipolo",
  "Rizal",
  "Cebu",
  "Mandaue",
  "Lapu-Lapu",
  "Davao",
  "Cagayan de Oro",
  "Iloilo",
  "Bacolod",
  "Zamboanga",
];

export function parseNumericGla(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const num = Number.parseFloat(match[1]);
  return Number.isFinite(num) ? num : null;
}

export function extractSpecsFromSlideText(
  rawText: string,
  fallbackDeckName = "Property Deck",
): { slideRole: SlideRole; title: string; specs: PropertySlideSpecs } {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const joined = lines.join(" \n ");
  const lower = joined.toLowerCase();

  let slideRole: SlideRole = "property";
  if (
    /thank\s+you|for\s+inquiries|contact\s+us|disclaimer\s+and\s+confidentiality/i.test(joined) &&
    !/gross\s+leasable|floor\s+area|lot\s+area|ceiling\s+height/i.test(joined)
  ) {
    slideRole = "closing";
  } else if (
    /prepared\s+(?:exclusively\s+)?for|property\s+information\s+sheet|commercial\s+real\s+estate\s+proposal|exclusively\s+prepared/i.test(
      joined,
    ) &&
    lines.length <= 8 &&
    !/sqm|sq\.?\s*m|lease\s+rate/i.test(joined)
  ) {
    slideRole = "cover";
  } else if (/about\s+prime\s+philippines|company\s+profile|our\s+services|track\s+record/i.test(joined)) {
    slideRole = "credentials";
  } else if (/summary\s+of\s+options|comparative\s+matrix|property\s+comparison/i.test(joined)) {
    slideRole = "summary";
  } else if (/vicinity\s+map|location\s+map|aerial\s+view|distance\s+to\s+key/i.test(joined) && !/lease\s+rate/i.test(joined)) {
    slideRole = "vicinity";
  }

  const cleanDeckTitle = fallbackDeckName.replace(/\.pptx$/i, "").replace(/[_-]+/g, " ").trim();
  const titleLine =
    lines.find(
      (line) =>
        line.length >= 4 &&
        line.length <= 90 &&
        !/^(location|address|gla|gross leasable|floor area|lot area|ceiling|monthly|lease rate|rate|power|loading|prepared)/i.test(
          line,
        ),
    ) ||
    lines[0] ||
    cleanDeckTitle;

  const locationLabelMatch = joined.match(/(?:location|address|city\/municipality|municipality|site\s+location)\s*[:\-–]\s*([^\n|•]+)/i);
  let location = locationLabelMatch ? locationLabelMatch[1].trim() : "";
  if (!location) {
    const matchedCities = KNOWN_CITIES.filter((city) =>
      new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(joined + " " + cleanDeckTitle),
    );
    if (matchedCities.length > 0) {
      location = matchedCities.slice(0, 2).join(", ");
    }
  }

  const glaMatch =
    joined.match(
      /(?:gross\s+leasable\s+area(?:\s*\(gla\))?|gla|floor\s+area|total\s+area|leasable\s+area|warehouse\s+area|lot\s+area)\s*[:\-–]?\s*([\d,]+(?:\.\d+)?\s*(?:sqm|sq\.?\s*m\.?|square\s+meters?))/i,
    ) || joined.match(/\b([\d,]+(?:\.\d+)?\s*(?:sqm|sq\.?\s*m\.?))\b/i);
  const gla = glaMatch ? glaMatch[1].replace(/\s+/g, " ").trim() : "";

  const ceilingMatch =
    joined.match(/(?:clear\s+ceiling\s+height|ceiling\s+height|clear\s+height|apex\s+height|apex|shoulder\s+height)\s*[:\-–]?\s*([^\n|•]+)/i) ||
    joined.match(/\b(\d+(?:\.\d+)?\s*(?:m|meters?)\s*(?:\(\s*(?:apex|clear|shoulder)\s*\))?)\b/i);
  const ceilingHeight = ceilingMatch ? ceilingMatch[1].trim() : "";

  const rateMatch =
    joined.match(/(?:monthly\s+lease\s+rate|lease\s+rate|rental\s+rate|asking\s+rate|rate|price)\s*[:\-–]?\s*([^\n|•]+)/i) ||
    joined.match(/((?:php|₱|p)\s*[\d,]+(?:\.\d+)?\s*(?:\/\s*sq\.?\s*m\.?|per\s*sqm)[^\n|•]*)/i);
  const leaseRate = rateMatch ? rateMatch[1].trim() : "";

  const powerMatch =
    joined.match(/(?:power\s+supply|electrical|power)\s*[:\-–]\s*([^\n|•]+)/i) ||
    joined.match(/\b([13]\s*-\s*phase[^\n|•]*|three\s+phase[^\n|•]*|single\s+phase[^\n|•]*)/i);
  const powerSupply = powerMatch ? powerMatch[1].trim() : "";

  const baysMatch =
    joined.match(/(?:loading\s+bays?|loading\s+docks?|dock\s+bays?)\s*[:\-–]\s*([^\n|•]+)/i) ||
    joined.match(/\b(\d+\s+(?:elevated\s+)?(?:loading\s+)?bays?[^\n|•]*)/i);
  const loadingBays = baysMatch ? baysMatch[1].trim() : "";

  if (
    slideRole === "property" &&
    !gla &&
    !leaseRate &&
    !ceilingHeight &&
    lower.length < 40 &&
    /proposal|deck|presentation|prime philippines/i.test(lower)
  ) {
    slideRole = "cover";
  }

  return {
    slideRole,
    title: titleLine,
    specs: {
      propertyName: titleLine,
      location: location || "Metro Manila / Luzon",
      gla: gla || "Upon Request",
      ceilingHeight: ceilingHeight || "Standard Industrial",
      leaseRate: leaseRate || "Upon Request",
      powerSupply: powerSupply || "Standard",
      loadingBays: loadingBays || "Available",
      notes: "",
    },
  };
}

export function applySlideOverrides(
  slide: PropertySlideItem,
  overrides?: Record<string, PropertySlideOverride>,
): PropertySlideItem {
  const custom = overrides?.[slide.id];
  if (!custom) return { ...slide, hasOverrides: Boolean(slide.hasOverrides) };

  const mergedSpecs: PropertySlideSpecs = {
    propertyName: custom.propertyName?.trim() ? custom.propertyName.trim() : slide.specs.propertyName,
    location: custom.location?.trim() ? custom.location.trim() : slide.specs.location,
    gla: custom.gla?.trim() ? custom.gla.trim() : slide.specs.gla,
    ceilingHeight: custom.ceilingHeight?.trim() ? custom.ceilingHeight.trim() : slide.specs.ceilingHeight,
    leaseRate: custom.leaseRate?.trim() ? custom.leaseRate.trim() : slide.specs.leaseRate,
    powerSupply: custom.powerSupply?.trim() ? custom.powerSupply.trim() : slide.specs.powerSupply,
    loadingBays: custom.loadingBays?.trim() ? custom.loadingBays.trim() : slide.specs.loadingBays,
    notes: custom.notes !== undefined ? custom.notes.trim() : slide.specs.notes,
  };

  const hasOverrides = Object.values(custom).some((val) => Boolean(val && val.trim().length > 0));

  return {
    ...slide,
    title: mergedSpecs.propertyName || slide.title,
    specs: mergedSpecs,
    hasOverrides,
  };
}

export function filterPropertySlides(
  slides: PropertySlideItem[],
  filters: {
    query?: string;
    location?: string;
    minGla?: number;
    maxGla?: number;
    roleFilter?: "all" | SlideRole;
    deckId?: string;
  },
  overrides?: Record<string, PropertySlideOverride>,
): PropertySlideItem[] {
  const query = (filters.query || "").trim().toLowerCase();
  const locationFilter = (filters.location || "").trim().toLowerCase();
  const roleFilter = filters.roleFilter || "all";

  return slides
    .map((slide) => applySlideOverrides(slide, overrides))
    .filter((slide) => {
      if (filters.deckId && filters.deckId !== "all" && slide.deckId !== filters.deckId) {
        return false;
      }
      if (roleFilter !== "all" && slide.slideRole !== roleFilter) {
        return false;
      }
      if (locationFilter && locationFilter !== "all") {
        const hay = `${slide.specs.location} ${slide.title} ${slide.deckFileName}`.toLowerCase();
        if (!hay.includes(locationFilter)) return false;
      }
      if (filters.minGla !== undefined || filters.maxGla !== undefined) {
        const glaVal = parseNumericGla(slide.specs.gla);
        if (glaVal === null) return false;
        if (filters.minGla !== undefined && glaVal < filters.minGla) return false;
        if (filters.maxGla !== undefined && glaVal > filters.maxGla) return false;
      }
      if (query) {
        const searchable = [
          slide.title,
          slide.deckFileName,
          slide.rawText,
          slide.specs.propertyName,
          slide.specs.location,
          slide.specs.gla,
          slide.specs.ceilingHeight,
          slide.specs.leaseRate,
          slide.specs.powerSupply,
          slide.specs.loadingBays,
          slide.specs.notes,
        ]
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
}

export function reorderSelectedSlides(slideIds: string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= slideIds.length ||
    toIndex >= slideIds.length ||
    fromIndex === toIndex
  ) {
    return [...slideIds];
  }
  const next = [...slideIds];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function buildCompilationManifest(params: {
  selectedSlideIds: string[];
  catalogSlides: PropertySlideItem[];
  overrides?: Record<string, PropertySlideOverride>;
  proposal: PitchProposalDetails;
}): CompilationManifest {
  const byId = new Map(params.catalogSlides.map((slide) => [slide.id, slide]));
  const resolvedSlides = params.selectedSlideIds
    .map((id) => byId.get(id))
    .filter((slide): slide is PropertySlideItem => Boolean(slide))
    .map((slide) => applySlideOverrides(slide, params.overrides));

  const isComprehensive = params.proposal.mode === "comprehensive";

  const comparisonRows: ComparisonTableRow[] = isComprehensive
    ? resolvedSlides.map((slide, index) => ({
        optionNumber: index + 1,
        slideId: slide.id,
        propertyName: slide.specs.propertyName || slide.title,
        location: slide.specs.location,
        gla: slide.specs.gla,
        ceilingHeight: slide.specs.ceilingHeight,
        leaseRate: slide.specs.leaseRate,
        powerSupply: slide.specs.powerSupply,
        loadingBays: slide.specs.loadingBays,
        notes: slide.specs.notes,
      }))
    : [];

  return {
    mode: params.proposal.mode,
    proposal: params.proposal,
    includeSummaryTable: isComprehensive,
    includeCredentials: isComprehensive,
    slides: resolvedSlides,
    comparisonRows,
  };
}
