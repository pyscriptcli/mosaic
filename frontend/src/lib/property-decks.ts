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
  "Hermosa",
  "Dinalupihan",
  "Bataan",
  "Zabarte",
  "Santulan",
  "Sandoval",
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

function escapeXml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildSlideSvgDataUrl(params: {
  slideNumber: number;
  deckFileName: string;
  title: string;
  location: string;
  gla: string;
  leaseRate: string;
  ceilingHeight: string;
}): string {
  const title = escapeXml((params.title || "Warehouse Property Option").slice(0, 52));
  const deck = escapeXml((params.deckFileName || "Property Deck").replace(/\.pptx$/i, "").slice(0, 46));
  const loc = escapeXml((params.location || "Luzon / Metro Manila").slice(0, 32));
  const gla = escapeXml((params.gla || "Upon Request").slice(0, 24));
  const rate = escapeXml((params.leaseRate || "Upon Request").slice(0, 24));
  const height = escapeXml((params.ceilingHeight || "Standard").slice(0, 24));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <rect width="640" height="360" fill="#F8FAFC"/>
  <rect width="640" height="76" fill="#003366"/>
  <rect y="76" width="640" height="4" fill="#C9A84C"/>
  <text x="24" y="28" fill="#C9A84C" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="1.2">PRIME PHILIPPINES · SLIDE #${params.slideNumber}</text>
  <text x="24" y="56" fill="#FFFFFF" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700">${title}</text>
  <rect x="24" y="102" width="592" height="210" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1"/>
  <text x="42" y="132" fill="#31577D" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700">SOURCE DECK: ${deck}</text>
  <line x1="42" y1="146" x2="596" y2="146" stroke="#E2E8F0" stroke-width="1"/>
  <text x="42" y="176" fill="#64748B" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="700">LOCATION</text>
  <text x="42" y="196" fill="#003366" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${loc}</text>
  <text x="330" y="176" fill="#64748B" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="700">LEASABLE AREA (GLA)</text>
  <text x="330" y="196" fill="#003366" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${gla}</text>
  <text x="42" y="242" fill="#64748B" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="700">LEASE RATE</text>
  <text x="42" y="262" fill="#003366" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${rate}</text>
  <text x="330" y="242" fill="#64748B" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="700">CLEAR HEIGHT</text>
  <text x="330" y="262" fill="#003366" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${height}</text>
  <rect y="334" width="640" height="26" fill="#003366"/>
  <text x="24" y="351" fill="#D7E3EF" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="600">INDUSTRIAL &amp; LOGISTICS ADVISORY · MOSAIC SLIDE BANK</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function extractBrowserSlideThumbnailDataUrl(
  zip: JSZip,
  slideNumber: number,
): Promise<string | null> {
  const relsFile = zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`);
  if (!relsFile) return null;

  const relsXml = await relsFile.async("string");
  const targetMatches = Array.from(
    relsXml.matchAll(/Target="\.\.\/media\/([^"]+\.(?:png|jpg|jpeg))"/gi),
  );
  if (targetMatches.length === 0) return null;

  let bestMediaPath: string | null = null;
  let bestSize = 0;

  for (const match of targetMatches) {
    const mediaName = match[1];
    const zipEntry = zip.file(`ppt/media/${mediaName}`);
    if (!zipEntry) continue;
    const bytes = await zipEntry.async("uint8array");
    if (bytes.byteLength > bestSize) {
      bestSize = bytes.byteLength;
      bestMediaPath = `ppt/media/${mediaName}`;
    }
  }

  if (!bestMediaPath || bestSize < 1500) return null;
  const mediaEntry = zip.file(bestMediaPath);
  if (!mediaEntry) return null;

  const base64 = await mediaEntry.async("base64");
  const isPng = bestMediaPath.toLowerCase().endsWith(".png");
  const mime = isPng ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${base64}`;
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

export interface BrowserPptxFileInput {
  name: string;
  relativePath?: string;
  data: ArrayBuffer | Uint8Array;
}

export async function indexPptxFilesInBrowser(
  files: BrowserPptxFileInput[],
  sourceFolderLabel = "OneDrive Local Folder",
  outputFolderLabel?: string,
  maxDecks = 40,
): Promise<PropertyDeckCatalog> {
  const slides: PropertySlideItem[] = [];
  let indexedDecksCount = 0;

  const pptxFiles = files
    .filter((f) => {
      const base = f.name || "";
      if (base.startsWith("~$") || base.startsWith(".")) return false;
      if (!base.toLowerCase().endsWith(".pptx")) return false;
      if (f.relativePath && /compiled proposals/i.test(f.relativePath)) return false;
      return true;
    })
    .slice(0, maxDecks);

  for (const file of pptxFiles) {
    try {
      const zip = await JSZip.loadAsync(file.data);
      const slideFileNames = await getOrderedSlidePathsFromZip(zip);

      if (slideFileNames.length === 0) continue;
      indexedDecksCount += 1;

      const deckFileName = file.name;
      const deckFilePath = file.relativePath || `${sourceFolderLabel}\\${file.name}`;
      const deckId = `deck-${hashString(deckFilePath)}`;
      const deckSlides: PropertySlideItem[] = [];

      for (let idx = 0; idx < slideFileNames.length; idx += 1) {
        const slideXmlPath = slideFileNames[idx];
        const xmlSlideNumber = Number(slideXmlPath.match(/slide(\d+)\.xml/i)?.[1] || idx + 1);
        const slideNumber = idx + 1;
        const xmlFile = zip.file(slideXmlPath);
        if (!xmlFile) continue;

        const xmlContent = await xmlFile.async("string");
        const rawText = extractTextFromSlideXml(xmlContent);
        if (!rawText.trim()) continue;

        const extracted = extractSpecsFromSlideText(rawText, deckFileName);
        const slideId = `${deckId}:slide:${slideNumber}`;
        const embeddedDataUrl = await extractBrowserSlideThumbnailDataUrl(zip, xmlSlideNumber).catch(
          () => null,
        );
        const thumbnailUrl =
          embeddedDataUrl ||
          buildSlideSvgDataUrl({
            slideNumber,
            deckFileName,
            title: extracted.title,
            location: extracted.specs.location,
            gla: extracted.specs.gla,
            leaseRate: extracted.specs.leaseRate,
            ceilingHeight: extracted.specs.ceilingHeight,
          });

        deckSlides.push({
          id: slideId,
          deckId,
          deckFileName,
          deckFilePath,
          slideNumber,
          slideRole: extracted.slideRole,
          title: extracted.title,
          rawText,
          thumbnailUrl,
          specs: extracted.specs,
        });
      }

      slides.push(...enrichDeckSlidesWithSharedWarehouseSpecs(deckSlides));
    } catch {
      // Skip unreadable PPTX files cleanly
    }
  }

  const cleanSource = sourceFolderLabel.trim() || "OneDrive Local Folder";
  const cleanOutput =
    outputFolderLabel?.trim() || `${cleanSource.replace(/[\\/]+$/, "")}\\Compiled Proposals`;

  return {
    sourceFolder: cleanSource,
    outputFolder: cleanOutput,
    indexedAt: new Date().toISOString(),
    decksCount: indexedDecksCount,
    slides,
  };
}

function buildOpenXmlTextShape(params: {
  id: number;
  name: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  fillHex?: string;
  lines: Array<{
    text: string;
    fontSizePt?: number;
    bold?: boolean;
    colorHex?: string;
  }>;
}): string {
  const fillXml = params.fillHex
    ? `<a:solidFill><a:srgbClr val="${params.fillHex}"/></a:solidFill>`
    : `<a:noFill/>`;

  const paragraphsXml = params.lines
    .map((line) => {
      const sz = Math.round((line.fontSizePt || 14) * 100);
      const b = line.bold ? ' b="1"' : "";
      const color = line.colorHex || "003366";
      return `<a:p><a:r><a:rPr lang="en-US" sz="${sz}"${b} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Century Gothic"/></a:rPr><a:t>${escapeXml(line.text)}</a:t></a:r></a:p>`;
    })
    .join("");

  return `<p:sp>
  <p:nvSpPr>
    <p:cNvPr id="${params.id}" name="${escapeXml(params.name)}"/>
    <p:cNvSpPr txBox="1"/>
    <p:nvPr/>
  </p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${params.x}" y="${params.y}"/><a:ext cx="${params.cx}" cy="${params.cy}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    ${fillXml}
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" lIns="182880" tIns="114300" rIns="182880" bIns="114300"/>
    <a:lstStyle/>
    ${paragraphsXml}
  </p:txBody>
</p:sp>`;
}

function wrapSlideXml(shapesXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm>
      </p:grpSpPr>
      ${shapesXml}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

export async function compilePptxInBrowser(manifest: CompilationManifest): Promise<{
  blob: Blob;
  buffer: Uint8Array;
  fileName: string;
  slideCount: number;
}> {
  const safeClient = (manifest.proposal.clientName || "Client")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const modeLabel = manifest.mode === "comprehensive" ? "Comprehensive" : "Standard";
  const datePart = (manifest.proposal.date || new Date().toISOString().slice(0, 10)).replace(
    /[^0-9-]/g,
    "",
  );
  const fileName = `PRIME_Proposal_${safeClient}_${modeLabel}_${datePart}.pptx`;

  const slideXmlList: string[] = [];

  // 1. Cover Slide
  slideXmlList.push(
    wrapSlideXml(
      [
        buildOpenXmlTextShape({
          id: 2,
          name: "Cover Background",
          x: 0,
          y: 0,
          cx: 12192000,
          cy: 6858000,
          fillHex: "003366",
          lines: [
            {
              text: "PRIME PHILIPPINES · INDUSTRIAL & LOGISTICS ADVISORY",
              fontSizePt: 13,
              bold: true,
              colorHex: "C9A84C",
            },
            {
              text: manifest.proposal.projectTitle || "INDUSTRIAL PROPERTY PROPOSAL",
              fontSizePt: 34,
              bold: true,
              colorHex: "FFFFFF",
            },
            {
              text: `Prepared Exclusively For: ${manifest.proposal.clientName || "Valued Client"}`,
              fontSizePt: 20,
              bold: true,
              colorHex: "FBF7E9",
            },
            {
              text: `${manifest.proposal.brokerName} · ${manifest.proposal.date}`,
              fontSizePt: 13,
              colorHex: "D7E3EF",
            },
          ],
        }),
      ].join("\n"),
    ),
  );

  // 2. Comprehensive Executive Summary Matrix Slide
  if (manifest.includeSummaryTable) {
    const matrixLines = [
      {
        text: "EXECUTIVE SUMMARY — SHORTLISTED WAREHOUSE OPTIONS",
        fontSizePt: 20,
        bold: true,
        colorHex: "003366",
      },
      ...manifest.comparisonRows.map((row) => ({
        text: `Option #${row.optionNumber}: ${row.propertyName} | ${row.location} | GLA: ${row.gla} | Height: ${row.ceilingHeight} | Rate: ${row.leaseRate}${row.notes ? ` | ${row.notes}` : ""}`,
        fontSizePt: 13,
        bold: false,
        colorHex: "1E293B",
      })),
    ];

    slideXmlList.push(
      wrapSlideXml(
        [
          buildOpenXmlTextShape({
            id: 2,
            name: "Header Banner",
            x: 0,
            y: 0,
            cx: 12192000,
            cy: 1050000,
            fillHex: "003366",
            lines: [
              {
                text: "EXECUTIVE SUMMARY COMPARISON MATRIX",
                fontSizePt: 22,
                bold: true,
                colorHex: "FFFFFF",
              },
            ],
          }),
          buildOpenXmlTextShape({
            id: 3,
            name: "Matrix Body",
            x: 457200,
            y: 1250000,
            cx: 11277600,
            cy: 5100000,
            fillHex: "F8FAFC",
            lines: matrixLines,
          }),
        ].join("\n"),
      ),
    );
  }

  // 3. Individual Warehouse Option Slides
  manifest.slides.forEach((slide, index) => {
    const optionLines = [
      {
        text: `OPTION #${index + 1} · ${slide.specs.location.toUpperCase()}`,
        fontSizePt: 12,
        bold: true,
        colorHex: "C9A84C",
      },
      {
        text: slide.specs.propertyName || slide.title,
        fontSizePt: 22,
        bold: true,
        colorHex: "FFFFFF",
      },
    ];

    const specLines = [
      {
        text: "KEY WAREHOUSE SPECIFICATIONS",
        fontSizePt: 15,
        bold: true,
        colorHex: "003366",
      },
      {
        text: `Location: ${slide.specs.location}`,
        fontSizePt: 14,
        bold: true,
        colorHex: "1E293B",
      },
      {
        text: `Gross Leasable Area (GLA): ${slide.specs.gla}`,
        fontSizePt: 14,
        bold: true,
        colorHex: "003366",
      },
      {
        text: `Monthly Lease Rate: ${slide.specs.leaseRate}`,
        fontSizePt: 14,
        bold: true,
        colorHex: "003366",
      },
      {
        text: `Clear Ceiling Height: ${slide.specs.ceilingHeight}`,
        fontSizePt: 13,
        colorHex: "334155",
      },
      {
        text: `Power Supply: ${slide.specs.powerSupply}`,
        fontSizePt: 13,
        colorHex: "334155",
      },
      {
        text: `Loading Bays: ${slide.specs.loadingBays}`,
        fontSizePt: 13,
        colorHex: "334155",
      },
      ...(slide.specs.notes
        ? [
            {
              text: `Broker Remarks: ${slide.specs.notes}`,
              fontSizePt: 13,
              bold: true,
              colorHex: "003366",
            },
          ]
        : []),
      {
        text: `Source Deck: ${slide.deckFileName} (Slide #${slide.slideNumber})`,
        fontSizePt: 10,
        colorHex: "64748B",
      },
    ];

    slideXmlList.push(
      wrapSlideXml(
        [
          buildOpenXmlTextShape({
            id: 2,
            name: "Option Header",
            x: 0,
            y: 0,
            cx: 12192000,
            cy: 1150000,
            fillHex: "003366",
            lines: optionLines,
          }),
          buildOpenXmlTextShape({
            id: 3,
            name: "Specifications Card",
            x: 457200,
            y: 1350000,
            cx: 11277600,
            cy: 5000000,
            fillHex: "FFFFFF",
            lines: specLines,
          }),
        ].join("\n"),
      ),
    );
  });

  // 4. Comprehensive Mode PRIME Credentials Slide
  if (manifest.includeCredentials) {
    slideXmlList.push(
      wrapSlideXml(
        buildOpenXmlTextShape({
          id: 2,
          name: "Credentials Slide",
          x: 0,
          y: 0,
          cx: 12192000,
          cy: 6858000,
          fillHex: "003366",
          lines: [
            {
              text: "WHY PRIME PHILIPPINES",
              fontSizePt: 14,
              bold: true,
              colorHex: "C9A84C",
            },
            {
              text: "SOVEREIGN INDUSTRIAL & LOGISTICS ADVISORY",
              fontSizePt: 28,
              bold: true,
              colorHex: "FFFFFF",
            },
            {
              text: "1. End-to-End Site Selection & Supply Chain Mapping across Luzon, Visayas, and Mindanao",
              fontSizePt: 15,
              colorHex: "D7E3EF",
            },
            {
              text: "2. Commercial Lease Structuring, Rent-Free Fit-Out Negotiation & Technical Due Diligence",
              fontSizePt: 15,
              colorHex: "D7E3EF",
            },
            {
              text: "3. Build-to-Suit (BTS), Cold Storage, PEZA & Ecozone Industrial Park Advisory",
              fontSizePt: 15,
              colorHex: "D7E3EF",
            },
          ],
        }),
      ),
    );
  }

  // 5. Closing Contact Slide
  slideXmlList.push(
    wrapSlideXml(
      buildOpenXmlTextShape({
        id: 2,
        name: "Closing Slide",
        x: 0,
        y: 0,
        cx: 12192000,
        cy: 6858000,
        fillHex: "003366",
        lines: [
          {
            text: "THANK YOU",
            fontSizePt: 38,
            bold: true,
            colorHex: "FFFFFF",
          },
          {
            text: "FOR SITE INSPECTIONS & COMMERCIAL PROPOSALS",
            fontSizePt: 14,
            bold: true,
            colorHex: "C9A84C",
          },
          {
            text: manifest.proposal.brokerName || "PRIME Philippines Industrial Team",
            fontSizePt: 20,
            bold: true,
            colorHex: "FFFFFF",
          },
          {
            text: `${manifest.proposal.brokerEmail || "industrial@primephilippines.com"} · ${manifest.proposal.brokerPhone || "+63 2 8888 0000"}`,
            fontSizePt: 14,
            colorHex: "D7E3EF",
          },
        ],
      }),
    ),
  );

  const zip = new JSZip();

  const slideOverridesContentTypes = slideXmlList
    .map(
      (_, idx) =>
        `<Override PartName="/ppt/slides/slide${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join("");

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideOverridesContentTypes}
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );

  const sldIdEntries = slideXmlList
    .map((_, idx) => `<p:sldId id="${256 + idx}" r:id="rId${idx + 3}"/>`)
    .join("");

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${sldIdEntries}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`,
  );

  const presRelsEntries = slideXmlList
    .map(
      (_, idx) =>
        `<Relationship Id="rId${idx + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${idx + 1}.xml"/>`,
    )
    .join("");

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  ${presRelsEntries}
</Relationships>`,
  );

  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`,
  );

  zip.file(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/slideLayouts/slideLayout1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`,
  );

  zip.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/theme/theme1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PRIME Theme">
  <a:themeElements>
    <a:clrScheme name="PRIME">
      <a:dk1><a:srgbClr val="003366"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1E293B"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="C9A84C"/></a:accent1>
      <a:accent2><a:srgbClr val="31577D"/></a:accent2>
      <a:accent3><a:srgbClr val="003366"/></a:accent3>
      <a:accent4><a:srgbClr val="C9A84C"/></a:accent4>
      <a:accent5><a:srgbClr val="31577D"/></a:accent5>
      <a:accent6><a:srgbClr val="64748B"/></a:accent6>
      <a:hlink><a:srgbClr val="003366"/></a:hlink>
      <a:folHlink><a:srgbClr val="31577D"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="PRIME Fonts">
      <a:majorFont><a:latin typeface="Century Gothic"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Century Gothic"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="PRIME">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`,
  );

  slideXmlList.forEach((xml, idx) => {
    const slideNum = idx + 1;
    zip.file(`ppt/slides/slide${slideNum}.xml`, xml);
    zip.file(
      `ppt/slides/_rels/slide${slideNum}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,
    );
  });

  const buffer = await zip.generateAsync({ type: "uint8array" });
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });

  return {
    blob,
    buffer,
    fileName,
    slideCount: slideXmlList.length,
  };
}
