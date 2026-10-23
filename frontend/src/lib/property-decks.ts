import JSZip from "jszip";

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
  proposalLocation?: string;
  sourceLocation?: string;
  hasOverrides?: boolean;
}

export interface PropertySlideGroup {
  groupId: string;
  title: string;
  deckId: string;
  deckFileName: string;
  deckFilePath: string;
  leadSlide: PropertySlideItem;
  slides: PropertySlideItem[];
}

export interface PitchProposalDetails {
  clientName: string;
  clientDesignation?: string;
  clientCompany?: string;
  preparedByName?: string;
  preparedByDesignation?: string;
  preparedByCompany?: string;
  clientLogoDataUrl?: string;
  ctaContacts?: ProposalContact[];
  projectTitle: string;
  brokerName: string;
  brokerEmail: string;
  brokerPhone: string;
  date: string;
  mode: DeckCompilationMode;
}

export interface ProposalContact {
  id: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  photoDataUrl?: string;
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

export interface PptxSourceFile {
  name: string;
  relativePath?: string;
  data: ArrayBuffer | Uint8Array;
}

function hashString(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
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
  "Hermosa",
  "Dinalupihan",
  "Bataan",
  "Zabarte",
  "Santulan",
  "Sandoval",
];

const NON_CITY_LOCATION_LABELS = new Set(["sandoval", "zabarte", "santulan"]);

export function cityNameFromLocation(location: string): string {
  const value = location.trim();
  if (!value || value === "Metro Manila / Luzon") return value;
  const normalized = value.toLocaleLowerCase();
  const matches = KNOWN_CITIES
    .filter((candidate) => !NON_CITY_LOCATION_LABELS.has(candidate.toLocaleLowerCase()))
    .map((candidate) => ({ city: candidate, index: normalized.indexOf(candidate.toLocaleLowerCase()) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index || b.city.length - a.city.length);
  return matches[0]?.city || value.split(",")[0].trim() || value;
}

export function isIndustrialFacilityProposalSlide(slide: Pick<PropertySlideItem, "title" | "rawText" | "slideRole">): boolean {
  return slide.slideRole === "cover" && /industrial\s+facility\s+proposal/i.test(`${slide.title}\n${slide.rawText}`);
}

export function groupPropertyLocationsByCity(locations: string[]): Array<{ city: string; locations: string[] }> {
  const grouped = new Map<string, Set<string>>();
  for (const rawLocation of locations) {
    const location = rawLocation.trim();
    if (!location || location === "Metro Manila / Luzon") continue;

    const city = cityNameFromLocation(location) || "Other locations";
    const cityLocations = grouped.get(city) || new Set<string>();
    cityLocations.add(location);
    grouped.set(city, cityLocations);
  }

  return Array.from(grouped.entries())
    .map(([city, cityLocations]) => ({
      city,
      locations: Array.from(cityLocations).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.city.localeCompare(b.city, undefined, { sensitivity: "base" }));
}

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
    .map((line) => line.replace(/[\u200B-\u200D\uFEFF]/g, "").trim())
    .filter(Boolean);

  const joined = lines.join(" \n ");
  const lower = joined.toLowerCase();

  let slideRole: SlideRole = "property";
  if (
    /thank\s+you|for\s+inquiries|schedule\s+a\s+viewing\s+contact\s+us|contact\s+us|disclaimer\s+and\s+confidentiality/i.test(
      joined,
    ) &&
    !/gross\s+leasable|floor\s+area|lot\s+area|ceiling\s+height|rental\s+rate/i.test(joined)
  ) {
    slideRole = "closing";
  } else if (
    (/prepared\s+(?:exclusively\s+)?for|property\s+information\s+sheet|property\s+deck\s+presentation|commercial\s+real\s+estate\s+proposal|exclusively\s+prepared|industrial\s+facility\s+proposal/i.test(
      joined,
    ) &&
      !/sqm|sq\.?\s*m|lease\s+rate|rental\s+rate/i.test(joined))
  ) {
    slideRole = "cover";
  } else if (/about\s+prime\s+philippines|company\s+profile|our\s+services|track\s+record/i.test(joined)) {
    slideRole = "credentials";
  } else if (/summary\s+of\s+options|comparative\s+matrix|property\s+comparison/i.test(joined)) {
    slideRole = "summary";
  } else if (/vicinity\s+map|location\s+map|aerial\s+view|distance\s+to\s+key/i.test(joined) && !/lease\s+rate/i.test(joined)) {
    slideRole = "vicinity";
  }

  const cleanDeckTitle = fallbackDeckName
    .replace(/\.pptx$/i, "")
    .replace(/PRIME_IW_/i, "")
    .replace(/\s*-\s*UPDATED/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  const titleLine =
    lines.find(
      (line) =>
        line.length >= 4 &&
        line.length <= 90 &&
        !/^(location|address|gla|gross leasable|floor area|lot area|ceiling|monthly|lease rate|rental rate|rate|power|loading|prepared|lease terms|specifications)/i.test(
          line,
        ),
    ) ||
    lines[0] ||
    cleanDeckTitle;

  const locationLabelMatch = joined.match(
    /(?:location|address|city\/municipality|municipality|site\s+location)\s*[:\-–\n]\s*([^\n|•]+)/i,
  );
  let location = locationLabelMatch ? locationLabelMatch[1].trim() : "";
  if (
    !location &&
    lines[1] &&
    lines[1].length <= 60 &&
    !/^(lease\s+terms|specifications|property\s+specifications|property\s+photos|prepared)/i.test(lines[1]) &&
    /(?:city|park|road|ave|rd|bataan|laguna|cavite|bulacan|tarlac|pasig|caloocan|malabon)/i.test(lines[1])
  ) {
    location = lines[1].trim();
  }
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
      /(?:gross\s+leasable\s+area(?:\s*\(gla\))?|total\s+leasable|gla|covered\s+area|floor\s+area|total\s+area|leasable\s+area|warehouse\s+area|lot\s+area)\s*[:\-–\n]?\s*([\d,]+(?:\.\d+)?\s*(?:sqm|sq\.?\s*m\.?|square\s+meters?))/i,
    ) || joined.match(/\b([\d,]+(?:\.\d+)?\s*(?:sqm|sq\.?\s*m\.?))\b/i);
  const gla = glaMatch ? glaMatch[1].replace(/\s+/g, " ").trim() : "";

  const ceilingMatch =
    joined.match(
      /(?:clear\s+ceiling\s+height|ceiling\s+height(?:\s*\([^)]*\))?|clear\s+height|apex\s+height(?:\s*\([^)]*\))?|apex|shoulder\s+height(?:\s*\([^)]*\))?)\s*[:\-–\n]+\s*([^\n|•]+)/i,
    ) ||
    joined.match(/\b(\d+(?:\.\d+)?\s*(?:m|meters?)\s*(?:\(\s*(?:apex|clear|shoulder)\s*\))?)\b/i);
  const ceilingHeight = ceilingMatch ? ceilingMatch[1].replace(/^approximately\s+/i, "Approx. ").trim() : "";

  const rateMatch =
    joined.match(
      /(?:monthly\s+lease\s+rate|lease\s+rate|rental\s+rate(?:\s*\(covered\))?|asking\s+rate)\s*[:\-–\n]+\s*((?:php|₱|p)\s*[\d,]+[^\n|•]*)/i,
    ) ||
    joined.match(
      /(?:monthly\s+lease\s+rate|lease\s+rate|rental\s+rate|asking\s+rate|rate|price)\s*[:\-–]\s*([^\n|•]+)/i,
    ) ||
    joined.match(/((?:php|₱|p)\s*[\d,]+(?:\.\d+)?\s*(?:\/\s*(?:sq\.?\s*m\.?|month)|per\s*sqm)[^\n|•]*)/i);
  const leaseRate = rateMatch ? rateMatch[1].trim() : "";

  const powerMatch =
    joined.match(/(?:power\s+supply|electrical\s+load|electrical|power)\s*[:\-–\n]+\s*([^\n|•]+)/i) ||
    joined.match(/\b([13]\s*-\s*phase[^\n|•]*|three[\s-]+phase[^\n|•]*|single\s+phase[^\n|•]*)/i);
  const powerSupply = powerMatch ? powerMatch[1].trim() : "";

  const baysMatch =
    joined.match(/(?:elevated\s+loading\s+dock|loading\s+bays?|loading\s+docks?|loading\s+area|dock\s+bays?)\s*[:\-–\n]+\s*([^\n|•]+)/i) ||
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
        if (cityNameFromLocation(slide.specs.location).toLowerCase() !== locationFilter) return false;
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

export function groupPropertySlidesByTitle(slides: PropertySlideItem[]): PropertySlideGroup[] {
  const groups: PropertySlideGroup[] = [];
  const groupMap = new Map<string, PropertySlideGroup>();

  for (const slide of slides) {
    if (slide.slideRole === "property") {
      const rawTitle = (slide.specs.propertyName || slide.title || "Warehouse Property")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\s*[-–—]\s*(?:lease terms|specifications|photos|property photos|site development|site plan|available units).*$/i, "")
        .trim();

      const key = `${slide.deckId}:::${rawTitle.toLowerCase()}`;
      let group = groupMap.get(key);
      if (!group) {
        group = {
          groupId: `group-${hashString(key)}`,
          title: rawTitle,
          deckId: slide.deckId,
          deckFileName: slide.deckFileName,
          deckFilePath: slide.deckFilePath,
          leadSlide: slide,
          slides: [],
        };
        groupMap.set(key, group);
        groups.push(group);
      }
      group.slides.push(slide);
    } else {
      // Standalone slide (Cover, Section Divider, Closing)
      groups.push({
        groupId: `group-slide-${slide.id}`,
        title: slide.title,
        deckId: slide.deckId,
        deckFileName: slide.deckFileName,
        deckFilePath: slide.deckFilePath,
        leadSlide: slide,
        slides: [slide],
      });
    }
  }

  return groups;
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

  const propertyDeckIds = Array.from(new Set(
    resolvedSlides.filter((slide) => slide.slideRole === "property").map((slide) => slide.deckId),
  ));
  const selectedIds = new Set(resolvedSlides.map((slide) => slide.id));
  const includedIds = new Set<string>();
  const presentationSlides: PropertySlideItem[] = [];
  const proposalCover = propertyDeckIds.length > 0
    ? params.catalogSlides
        .filter((slide) => slide.deckId === propertyDeckIds[0] && slide.slideRole === "cover")
        .filter((slide) => !isIndustrialFacilityProposalSlide(slide))
        .sort((a, b) => a.slideNumber - b.slideNumber)[0]
    : undefined;
  if (proposalCover && !selectedIds.has(proposalCover.id)) {
    presentationSlides.push(applySlideOverrides(proposalCover, params.overrides));
    includedIds.add(proposalCover.id);
  }

  const insertedPropertyHeaders = new Set<string>();
  for (const slide of resolvedSlides) {
    const locationKey = slide.specs.location.trim().toLocaleLowerCase();
    const propertyHeaderKey = `${slide.deckId}:${locationKey}`;
    if (slide.slideRole === "property" && !insertedPropertyHeaders.has(propertyHeaderKey)) {
      const sectionTitle = params.catalogSlides.find((candidate) =>
        candidate.deckId === slide.deckId &&
        isIndustrialFacilityProposalSlide(candidate),
      );
      if (sectionTitle && !selectedIds.has(sectionTitle.id)) {
        const header = applySlideOverrides(sectionTitle, params.overrides);
        presentationSlides.push({
          ...header,
          sourceLocation: header.specs.location,
          specs: { ...header.specs, location: proposalCityLabel(slide.specs.location) },
          id: insertedPropertyHeaders.size === 0
            ? header.id
            : `${header.id}:location:${hashString(locationKey)}`,
          proposalLocation: proposalCityLabel(slide.specs.location),
        });
        includedIds.add(sectionTitle.id);
      }
      insertedPropertyHeaders.add(propertyHeaderKey);
    }
    if (!includedIds.has(slide.id)) {
      presentationSlides.push(slide);
      includedIds.add(slide.id);
    }
  }

  for (const deckId of propertyDeckIds) {
    for (const closingSlide of params.catalogSlides
      .filter((slide) => slide.deckId === deckId && slide.slideRole === "closing")
      .sort((a, b) => a.slideNumber - b.slideNumber)) {
      if (!selectedIds.has(closingSlide.id) && !includedIds.has(closingSlide.id)) {
        presentationSlides.push(applySlideOverrides(closingSlide, params.overrides));
        includedIds.add(closingSlide.id);
      }
    }
  }

  const isComprehensive = params.proposal.mode === "comprehensive";

  const comparisonRows: ComparisonTableRow[] = isComprehensive
    ? resolvedSlides.map((slide, index) => ({
        optionNumber: index + 1,
        slideId: slide.id,
        propertyName: slide.specs.propertyName || slide.title,
        location: cityNameFromLocation(slide.specs.location),
        gla: slide.specs.gla,
        ceilingHeight: slide.specs.ceilingHeight,
        leaseRate: slide.specs.leaseRate,
        powerSupply: slide.specs.powerSupply,
        loadingBays: slide.specs.loadingBays,
        notes: slide.specs.notes,
      }))
    : [];

  const exportSlides = presentationSlides.map((slide) => {
    if (slide.slideRole !== "property") return slide;
    return {
      ...slide,
      sourceLocation: slide.specs.location,
      specs: { ...slide.specs, location: cityNameFromLocation(slide.specs.location) },
    };
  });

  return {
    mode: params.proposal.mode,
    proposal: params.proposal,
    includeSummaryTable: isComprehensive,
    includeCredentials: isComprehensive,
    slides: exportSlides,
    comparisonRows,
  };
}

function proposalCityLabel(location: string): string {
  return cityNameFromLocation(location);
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function extractTextFromSlideXml(xml: string): string {
  const hasParagraphTags = /<\/a:p>|<\/a:tr>/.test(xml);
  const paragraphs = hasParagraphTags ? xml.split(/<\/a:p>|<\/a:tr>/) : xml.split(/<\/a:t>/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const tokens: string[] = [];
    const regex = hasParagraphTags
      ? /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g
      : /<a:t(?:\s[^>]*)?>([\s\S]*?)$/g;
    let match: RegExpExecArray | null = regex.exec(para);
    while (match) {
      const cleaned = decodeXmlEntities(match[1]).trim();
      if (cleaned) tokens.push(cleaned);
      match = regex.exec(para);
    }
    if (tokens.length > 0) {
      lines.push(tokens.join(" "));
    }
  }

  return lines.join("\n");
}

export async function getOrderedSlidePathsFromZip(zip: JSZip): Promise<string[]> {
  const presFile = zip.file("ppt/presentation.xml");
  const relsFile = zip.file("ppt/_rels/presentation.xml.rels");

  if (presFile && relsFile) {
    try {
      const [presXml, relsXml] = await Promise.all([
        presFile.async("string"),
        relsFile.async("string"),
      ]);
      const rIdToTarget = new Map<string, string>();
      for (const match of relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/gi)) {
        rIdToTarget.set(match[1], match[2]);
      }
      for (const match of relsXml.matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId="([^"]+)"/gi)) {
        if (!rIdToTarget.has(match[2])) {
          rIdToTarget.set(match[2], match[1]);
        }
      }

      const sldListMatch = presXml.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/i);
      if (sldListMatch) {
        const orderedPaths: string[] = [];
        for (const sldMatch of sldListMatch[1].matchAll(/r:id="([^"]+)"/gi)) {
          const target = rIdToTarget.get(sldMatch[1]);
          if (target) {
            const normalized = target.startsWith("ppt/")
              ? target
              : `ppt/${target.replace(/^\.?\//, "")}`;
            if (zip.file(normalized)) {
              orderedPaths.push(normalized);
            }
          }
        }
        if (orderedPaths.length > 0) {
          return orderedPaths;
        }
      }
    } catch {
      // Fallback to filename sorting
    }
  }

  return Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const numB = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return numA - numB;
    });
}

export function enrichDeckSlidesWithSharedWarehouseSpecs(
  deckSlides: PropertySlideItem[],
): PropertySlideItem[] {
  let activeSpecs: PropertySlideSpecs | null = null;
  let activeWarehouseName = "";

  // First pass: group consecutive property slides belonging to the same warehouse
  const enriched = deckSlides.map((slide) => ({
    ...slide,
    specs: { ...slide.specs },
  }));

  for (let i = 0; i < enriched.length; i += 1) {
    const slide = enriched[i];
    if (slide.slideRole !== "property") {
      continue;
    }

    const isPhotoOrSiteSlide =
      /^(property\s+photos|property\s+layout|site\s+development)/i.test(slide.title) ||
      /^(property\s+photos|property\s+layout|site\s+development)/i.test(slide.specs.propertyName);

    const isNewWarehouseHeader =
      !isPhotoOrSiteSlide &&
      (!activeWarehouseName ||
        (slide.specs.propertyName.toLowerCase() !== activeWarehouseName.toLowerCase() &&
          !/^property\s+details/i.test(slide.specs.propertyName)));

    if (isNewWarehouseHeader) {
      activeWarehouseName = slide.specs.propertyName;
      activeSpecs = { ...slide.specs };
      // Peek ahead at the next 1-2 slides of the same warehouse to merge Specifications + Lease Terms
      for (let j = i + 1; j < Math.min(i + 3, enriched.length); j += 1) {
        const nextSlide = enriched[j];
        if (nextSlide.slideRole !== "property") break;
        const nextIsSameOrSubSlide =
          nextSlide.specs.propertyName.toLowerCase() === activeWarehouseName.toLowerCase() ||
          /^(property\s+details|property\s+photos|property\s+layout|site\s+development)/i.test(
            nextSlide.specs.propertyName,
          );
        if (!nextIsSameOrSubSlide) break;

        if (activeSpecs.location === "Metro Manila / Luzon" && nextSlide.specs.location !== "Metro Manila / Luzon") {
          activeSpecs.location = nextSlide.specs.location;
        }
        if (activeSpecs.gla === "Upon Request" && nextSlide.specs.gla !== "Upon Request") {
          activeSpecs.gla = nextSlide.specs.gla;
        }
        if (activeSpecs.leaseRate === "Upon Request" && nextSlide.specs.leaseRate !== "Upon Request") {
          activeSpecs.leaseRate = nextSlide.specs.leaseRate;
        }
        if (
          activeSpecs.ceilingHeight === "Standard Industrial" &&
          nextSlide.specs.ceilingHeight !== "Standard Industrial"
        ) {
          activeSpecs.ceilingHeight = nextSlide.specs.ceilingHeight;
        }
        if (activeSpecs.powerSupply === "Standard" && nextSlide.specs.powerSupply !== "Standard") {
          activeSpecs.powerSupply = nextSlide.specs.powerSupply;
        }
        if (activeSpecs.loadingBays === "Available" && nextSlide.specs.loadingBays !== "Available") {
          activeSpecs.loadingBays = nextSlide.specs.loadingBays;
        }
      }
    }

    if (activeSpecs) {
      const subLabel = /lease\s+terms/i.test(slide.rawText)
        ? "Lease Terms & Units"
        : /specifications/i.test(slide.rawText)
          ? "Specifications & Access"
          : isPhotoOrSiteSlide
            ? "Photos & Site Plan"
            : "";

      const displayTitle =
        activeWarehouseName && subLabel
          ? `${activeWarehouseName} — ${subLabel}`
          : slide.title;

      slide.title = displayTitle;
      slide.specs = {
        ...activeSpecs,
        propertyName: activeWarehouseName || slide.specs.propertyName,
      };
    }
  }

  return enriched;
}
