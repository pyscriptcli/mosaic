import { cityNameFromLocation, parseNumericGla, type PropertySlideItem } from "./property-decks";

export interface DemandMatchCriteria {
  locations: string[];
  minGla: string;
  maxGla: string;
  minLeaseRate: string;
  maxLeaseRate: string;
  minClearHeight: string;
  powerSupplies: Array<"three-phase" | "single-phase">;
  requiresLoadingDock: boolean;
  requiresTruckAccess: boolean;
  otherRequirements: string;
}

export interface DemandMatchCriterion {
  key: string;
  label: string;
  matched: boolean;
  evidence: string;
}

export interface DemandMatchResult {
  property: PropertySlideItem;
  matchKind: "exact" | "partial";
  matchedCount: number;
  requirementCount: number;
  criteria: DemandMatchCriterion[];
}

const STOP_WORDS = new Set(["a", "an", "and", "are", "for", "in", "near", "of", "or", "the", "to", "with"]);

function parseNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseHeight(value: string): number | null {
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function normalizedText(slide: PropertySlideItem): string {
  return [slide.title, slide.rawText, ...Object.values(slide.specs)].join(" ").toLocaleLowerCase();
}

function textTerms(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase().match(/[a-z0-9]+/g) || [])]
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function isLoadingAccessAvailable(value: string): boolean {
  const normalized = value.toLocaleLowerCase();
  if (!normalized || /not\s+(available|provided|confirmed)|unavailable|none|no\b|tbd|upon request/i.test(normalized)) return false;
  return /bay|dock|loading|available|yes|ramp|leveler/i.test(normalized);
}

function hasTruckAccess(slide: PropertySlideItem): boolean {
  return /truck\s+access|truck\s+accessible|trailer\s+access|container\s+truck|truck\s+route/i.test(normalizedText(slide));
}

export function rankDemandMatches(
  slides: PropertySlideItem[],
  criteria: DemandMatchCriteria,
): DemandMatchResult[] {
  const minGla = parseNumber(criteria.minGla);
  const maxGla = parseNumber(criteria.maxGla);
  const minLeaseRate = parseNumber(criteria.minLeaseRate);
  const maxLeaseRate = parseNumber(criteria.maxLeaseRate);
  const minHeight = parseHeight(criteria.minClearHeight);
  const preferredLocations = new Set(criteria.locations.map((location) => cityNameFromLocation(location).toLocaleLowerCase()));
  const requestedTextTerms = textTerms(criteria.otherRequirements);

  const matches = slides.map((property): DemandMatchResult => {
    const result: DemandMatchCriterion[] = [];
    const add = (key: string, label: string, matched: boolean, evidence: string) => result.push({ key, label, matched, evidence });
    const area = parseNumericGla(property.specs.gla);
    const rate = parseNumber(property.specs.leaseRate);
    const height = parseHeight(property.specs.ceilingHeight);
    const propertyCity = cityNameFromLocation(property.specs.location);

    if (preferredLocations.size) {
      add("location", "Location", preferredLocations.has(propertyCity.toLocaleLowerCase()), propertyCity || "Location not listed");
    }
    if (minGla !== null || maxGla !== null) {
      const withinRange = area !== null && (minGla === null || area >= minGla) && (maxGla === null || area <= maxGla);
      add("gla", "Leasable area", withinRange, property.specs.gla || "Area not listed");
    }
    if (minLeaseRate !== null || maxLeaseRate !== null) {
      const withinRange = rate !== null && (minLeaseRate === null || rate >= minLeaseRate) && (maxLeaseRate === null || rate <= maxLeaseRate);
      add("lease-rate", "Lease rate", withinRange, property.specs.leaseRate || "Rate not listed");
    }
    if (minHeight !== null) {
      const meetsHeight = height !== null && height >= minHeight;
      add("clear-height", "Clear height", meetsHeight, property.specs.ceilingHeight || "Height not listed");
    }
    if (criteria.powerSupplies.length) {
      const availablePhases = [
        /(?:3\s*[- ]?phase|three\s*[- ]?phase)/i.test(property.specs.powerSupply) ? "three-phase" : "",
        /(?:single\s*[- ]?phase|1\s*[- ]?phase)/i.test(property.specs.powerSupply) ? "single-phase" : "",
      ].filter(Boolean);
      const matchingPhases = criteria.powerSupplies.filter((phase) => availablePhases.includes(phase));
      add("power", "Power supply", matchingPhases.length > 0, matchingPhases.length ? matchingPhases.join(" or ") : property.specs.powerSupply || "Power supply not listed");
    }
    if (criteria.requiresLoadingDock) {
      add("loading-dock", "Loading dock or bay", isLoadingAccessAvailable(property.specs.loadingBays), property.specs.loadingBays || "Loading access not listed");
    }
    if (criteria.requiresTruckAccess) {
      const available = hasTruckAccess(property);
      add("truck-access", "Truck access", available, available ? "Truck access stated" : "Truck access not stated");
    }
    if (requestedTextTerms.length) {
      const searchable = normalizedText(property);
      const found = requestedTextTerms.filter((term) => searchable.includes(term));
      add(
        "other-requirements",
        "Other requirements",
        found.length === requestedTextTerms.length,
        found.length ? `Indexed details mention: ${found.join(", ")}${found.length < requestedTextTerms.length ? `. Not stated: ${requestedTextTerms.filter((term) => !found.includes(term)).join(", ")}` : ""}` : "No matching terms in indexed details",
      );
    }

    const matchedCount = result.filter((criterion) => criterion.matched).length;
    const requirementCount = result.length;
    return {
      property,
      matchKind: matchedCount === requirementCount && requirementCount > 0 ? "exact" : "partial",
      matchedCount,
      requirementCount,
      criteria: result,
    };
  }).filter((match) => match.matchedCount > 0);

  return matches.sort((left, right) => {
    if (left.matchKind !== right.matchKind) return left.matchKind === "exact" ? -1 : 1;
    const scoreDifference = right.matchedCount / right.requirementCount - left.matchedCount / left.requirementCount;
    if (scoreDifference) return scoreDifference;
    const rateDifference = (parseNumber(left.property.specs.leaseRate) ?? Number.POSITIVE_INFINITY) -
      (parseNumber(right.property.specs.leaseRate) ?? Number.POSITIVE_INFINITY);
    return rateDifference || left.property.specs.propertyName.localeCompare(right.property.specs.propertyName);
  });
}
