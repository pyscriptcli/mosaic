import { GISFeature } from '../types/gis';
import { calcBounds, pointInPolygon } from './polygons';

// Full 8-category taxonomy ported directly from proven Open Node GIS engine
export const POI_CONFIG: Record<string, [string, string][]> = {
  "COMMERCIAL & OFFICES": [
    ['Corporate Office', '"building"~"office|commercial",i'],
    ['IT/Tech Center', '"office"~"it|telecommunication",i'],
    ['Business Center', '"building"="commercial"'],
    ['Bank', '"amenity"="bank"'],
    ['ATM', '"amenity"="atm"'],
    ['Office', '"office"="yes"'],
  ],
  "RETAIL": [
    ['Mall/Department Store', '"shop"~"mall|department_store",i'],
    ['Supermarket', '"shop"~"market|grocery",i'],
    ['Convenience Store', '"shop"="convenience"'],
    ['Pharmacy', '"amenity"="pharmacy"'],
    ['Hardware', '"shop"~"hardware|doityourself",i'],
    ['General Shops', '"shop"~"boutique|clothes|shoes",i'],
    ['Beauty', '"shop"="beauty"'],
    ['Bicycle', '"shop"="bicycle"'],
    ['Books/Stationary', '"shop"~"books|stationary",i'],
    ['Car', '"shop"="car"'],
    ['Chemist', '"shop"="chemist"'],
    ['Clothes', '"shop"="clothes"'],
    ['Copyshop', '"shop"="copyshop"'],
    ['Cosmetics', '"shop"="cosmetics"'],
    ['Department store', '"shop"="department_store"'],
    ['DIY/hardware', '"shop"~"hardware|doityourself",i'],
    ['Garden centre', '"shop"="garden_centre"'],
    ['General', '"shop"="general"'],
    ['Gift', '"shop"="gift"'],
    ['Hairdresser', '"shop"="hairdresser"'],
    ['Jewelry', '"shop"="jewelry"'],
    ['Kiosk', '"shop"="kiosk"'],
    ['Leather', '"shop"="leather"'],
    ['Marketplace', '"amenity"="marketplace"'],
    ['Musical instrument', '"shop"="musical_instrument"'],
    ['Optician', '"shop"="optician"'],
    ['Pets', '"shop"="pets"'],
    ['Phone', '"shop"="mobile_phone"'],
    ['Photo', '"shop"="photo"'],
    ['Shoes', '"shop"="shoes"'],
    ['Shopping centre', '"shop"="mall"'],
    ['Textiles', '"shop"="textiles"'],
    ['Toys', '"shop"="toys"'],
    ['Travel agency', '"shop"="travel_agency"'],
  ],
  "FOOD, BEVERAGE & HOSPITALITY": [
    ['Restaurant', '"amenity"="restaurant"'],
    ['Cafe/Coffee Shop', '"amenity"~"cafe|coffee",i'],
    ['Fast Food', '"amenity"="fast_food"'],
    ['Bar/Pub/Nightclub', '"amenity"~"bar|pub|nightclub",i'],
    ['Bakery/Pastry', '"shop"="bakery"'],
    ['BBQ', '"amenity"="bbq"'],
    ['Biergarten', '"amenity"="biergarten"'],
    ['Food court', '"amenity"="food_court"'],
    ['Ice cream', '"amenity"="ice_cream"'],
    ['Pub', '"amenity"="pub"'],
    ['Hotel', '"tourism"="hotel"'],
    ['Motel', '"tourism"="motel"'],
    ['Alpine Hut', '"tourism"="alpine_hut"'],
    ['Apartment', '"tourism"="apartment"'],
    ['Camp Site', '"tourism"="camp_site"'],
    ['Chalet', '"tourism"="chalet"'],
    ['Guest House', '"tourism"="guest_house"'],
    ['Hostel', '"tourism"="hostel"'],
    ['Casino', '"amenity"="casino"'],
  ],
  "RESIDENTIAL": [
    ['Apartments', '"building"="apartments"'],
    ['House', '"building"="house"'],
    ['Residential Area', '"landuse"="residential"'],
    ['Condominium', '"building"="residential"'],
    ['City', '"place"="city"'],
    ['Town', '"place"="town"'],
    ['Village', '"place"="village"'],
    ['Hamlet', '"place"="hamlet"'],
    ['Suburb', '"place"="suburb"'],
    ['Construction', '"landuse"="construction"'],
  ],
  "INDUSTRIAL & LOGISTICS": [
    ['Expressway Exits', '"highway"~"motorway_junction|toll_gantry",i'],
    ['Ports & Terminals', '"industrial"="port"'],
    ['Manufacturing Plants', '"industrial"~"factory|manufacturing|processing",i'],
    ['Cold Storage Facilities', '"warehouse"~"cold_store|cold_storage",i'],
    ['Industrial Parks/Estates', '"landuse"~"industrial|industrial_estate",i'],
    ['Warehouses & Depots', '"building"~"warehouse|depot",i'],
    ['Storage Facilities', '"building"="storage"'],
    ['Truck Access Routes (HGV)', '"hgv"~"designated|yes",i'],
  ],
  "HEALTH & EMERGENCY SERVICES": [
    ['Hospital', '"amenity"~"hospital|clinic",i'],
    ['Clinic', '"amenity"="clinic"'],
    ['Pharmacy', '"amenity"="pharmacy"'],
    ['Police Station', '"amenity"="police"'],
    ['Fire Station', '"amenity"="fire_station"'],
    ['Firestation', '"amenity"="fire_station"'],
    ['Police', '"amenity"="police"'],
    ['Hospital Adv', '"amenity"="hospital"'],
    ['Defibrillator - AED', '"emergency"="defibrillator"'],
    ['Fire hose/extinguisher', '"emergency"~"fire_hose|fire_extinguisher",i'],
  ],
  "GOVERNMENT, EDUCATION & INFRASTRUCTURE": [
    ['City Hall', '"amenity"="townhall"'],
    ['Airport Terminal', '"aeroway"~"terminal|aerodrome",i'],
    ['University/College', '"amenity"~"university|college",i'],
    ['K-12 School', '"amenity"="school"'],
    ['Vocational/Other', '"amenity"="learning_centre"'],
    ['Embassy', '"amenity"="embassy"'],
    ['Library', '"amenity"="library"'],
    ['Music School', '"amenity"="music_school"'],
    ['Letter Box', '"amenity"="letter_box"'],
    ['Post Office', '"amenity"="post_office"'],
    ['School/College', '"amenity"~"school|college",i'],
    ['University', '"amenity"="university"'],
    ['Kindergarten', '"amenity"="kindergarten"'],
    ['Public camera', '"man_made"="surveillance"'],
  ],
  "LEISURE, SPORTS & PUBLIC SPACES": [
    ['Church', '"religion"="christian"'],
    ['Mosque', '"religion"="muslim"'],
    ['Buddhist Temple', '"religion"="buddhist"'],
    ['Hindu Temple', '"religion"="hindu"'],
    ['Synagogue', '"religion"="jewish"'],
    ['Cemetery', '"landuse"="cemetery"'],
    ['Spa', '"leisure"="spa"'],
    ['Sauna', '"leisure"="sauna"'],
    ['Bench', '"amenity"="bench"'],
    ['Bicycle Parking', '"amenity"="bicycle_parking"'],
    ['Bicycle Rental', '"amenity"="bicycle_rental"'],
    ['Cinema', '"amenity"="cinema"'],
    ['Fuel', '"amenity"="fuel"'],
    ['Parking', '"amenity"="parking"'],
    ['Taxi', '"amenity"="taxi"'],
    ['Theatre', '"amenity"="theatre"'],
    ['Toilets', '"amenity"="toilets"'],
    ['American football', '"sport"="american_football"'],
    ['Baseball', '"sport"="baseball"'],
    ['Basketball', '"sport"="basketball"'],
    ['Cycling', '"sport"="cycling"'],
    ['Gymnastics', '"sport"="gymnastics"'],
    ['Golf', '"sport"="golf"'],
    ['Hockey', '"sport"="hockey"'],
    ['Horse racing', '"sport"="horse_racing"'],
    ['Ice hockey', '"sport"="ice_hockey"'],
    ['Soccer', '"sport"="soccer"'],
    ['Sports centre', '"leisure"="sports_centre"'],
    ['Surfing', '"sport"="surfing"'],
    ['Swimming', '"sport"="swimming"'],
    ['Tennis', '"sport"="tennis"'],
    ['Volleyball', '"sport"="volleyball"'],
    ['Busstop', '"highway"="bus_stop"'],
    ['E-bike charging', '"amenity"="charging_station"'],
    ['Recycling', '"amenity"="recycling"'],
    ['Fixme', '"fixme"~".",i'],
    ['Note-Node', '"type"="node"'],
    ['Note-Way', '"type"="way"'],
    ['Image', '"image"~".",i'],
  ],
};

export const CATEGORY_COLORS: Record<string, string> = {
  "COMMERCIAL & OFFICES": "#ffffff", // Pure White / Platinum
  "RETAIL": "#38bdf8", // Ice Sky Blue
  "FOOD, BEVERAGE & HOSPITALITY": "#fbbf24", // Warm Amber Glow
  "HEALTH & EMERGENCY SERVICES": "#f43f5e", // Rose Crimson
  "RESIDENTIAL": "#94a3b8", // Titanium Gray
  "INDUSTRIAL & LOGISTICS": "#a1a1aa", // Steel Slate
  "GOVERNMENT, EDUCATION & INFRASTRUCTURE": "#c084fc", // Violet Lilac
  "LEISURE, SPORTS & PUBLIC SPACES": "#34d399", // Emerald Mint
};

export interface ScannedPOI {
  name: string;
  type: string;
  category: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  osmType?: string;
  osmId?: number;
  searchAreaLabels?: string[];
}

export interface ScanResult {
  features: ScannedPOI[];
  counts: Record<string, number>;
  categoryCounts: Record<string, number>;
}

/** A validated exact-match OSM tag predicate produced by the search builder. */
export interface OsmTagFilter {
  key: string;
  value: string;
}

/** Predicates inside a group are ANDed; separate groups are ORed. */
export interface OsmTagFilterGroup {
  filters: OsmTagFilter[];
}

function compileExactOsmFilter(filter: OsmTagFilter): string | null {
  if (!filter || typeof filter !== 'object' || typeof filter.key !== 'string' || typeof filter.value !== 'string') return null;
  if (!/^[a-zA-Z0-9:_-]{1,64}$/.test(filter.key)) return null;
  if (!filter.value || filter.value.length > 80 || /[\u0000-\u001f\u007f"\\\[\]]/.test(filter.value)) return null;
  return `${JSON.stringify(filter.key)}=${JSON.stringify(filter.value)}`;
}

function buildTagsToQuery(selectedTags: string[], customFilterGroups: OsmTagFilterGroup[] = []): string[] {
  const knownPresetTags = new Set(Object.values(POI_CONFIG).flatMap((items) => items.map(([, tag]) => tag)));
  const tags = selectedTags.filter((tag) => knownPresetTags.has(tag));
  for (const group of Array.isArray(customFilterGroups) ? customFilterGroups.slice(0, 12) : []) {
    if (!group || typeof group !== 'object' || !Array.isArray(group.filters) || group.filters.length === 0 || group.filters.length > 6) continue;
    const compiled = group.filters.map(compileExactOsmFilter);
    if (compiled.every((filter): filter is string => Boolean(filter))) {
      tags.push(compiled.join(']['));
    }
  }
  return Array.from(new Set(tags));
}

/**
 * Compiles a list of POI features into a standard Google Earth KML document string
 */
export function compileFeaturesKml(
  features: Array<{ lat: number; lon: number; name?: string; type?: string; visible?: boolean }>
): string {
  let kml = '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Scanned POIs</name>';
  for (const f of features) {
    if (f.visible === false) continue;
    const name = (f.name || 'Asset').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const classType = (f.type || 'Node').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    kml += `<Placemark><name>${name}</name><description>${classType}</description><Point><coordinates>${f.lon},${f.lat},0</coordinates></Point></Placemark>`;
  }
  return kml + '</Document></kml>';
}

/**
 * Robust fetch helper via our Next.js API proxy with abort signal support
 */
export async function robustOverpassFetch(query: string, timeout = 30, signal?: AbortSignal): Promise<any | null> {
  try {
    const res = await fetch('/api/overpass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, timeout }),
      signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(typeof data?.error === 'string' ? data.error : `OpenStreetMap search failed (HTTP ${res.status}).`);
    }
    return data;
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.log('Overpass scan cancelled by user.');
    } else {
      console.error('Overpass fetch failed:', e);
    }
    throw e instanceof Error ? e : new Error('Could not reach the OpenStreetMap search service. Please try again.');
  }
}

/**
 * Scan POIs around a center coordinate and radius in meters with hybrid FastAPI (OSMnx) & Next.js Overpass fallback.
 */
export async function scanTradeAreaCoordinates(
  lat: number,
  lon: number,
  radius: number,
  selectedTags: string[],
  signal?: AbortSignal,
  customFilterGroups: OsmTagFilterGroup[] = []
): Promise<ScanResult | null> {
  const tagsToQuery = buildTagsToQuery(selectedTags, customFilterGroups);

  if (tagsToQuery.length === 0) return null;

  // Circle radii are calculated geodesically and are usually fractional meters.
  // Overpass accepts integer radii, and the API proxy validates that format.
  const queryRadius = Math.round(radius);
  if (!Number.isFinite(queryRadius) || queryRadius < 1 || queryRadius > 50_000) {
    throw new Error('Search radius must be between 1 m and 50 km. Adjust the circle size and try again.');
  }

  // 1. Attempt Python FastAPI endpoint with OSMnx geometry fallback
  try {
    const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000); // Quick 6s check for FastAPI
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    const res = await fetch(`${fastApiUrl}/api/overpass/fetch-pois`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat,
        lon,
        radius: queryRadius,
        tags: tagsToQuery,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data && data.elements && data.elements.length > 0) {
        return processOverpassElements(data.elements, tagsToQuery);
      }
    }
  } catch (e) {
    // FastAPI is offline or timed out; gracefully proceed to Next.js multi-mirror Overpass proxy
  }

  // 2. Next.js Overpass mirror proxy failover
  const statements = tagsToQuery
    .map((tag) => `  nwr[${tag}](around:${queryRadius},${lat},${lon});`)
    .join('\n');

  const ql = `[out:json][timeout:45];(\n${statements}\n);\nout center;`;

  const data = await robustOverpassFetch(ql, 45, signal);
  if (!data || !Array.isArray(data.elements)) throw new Error('OpenStreetMap returned an invalid search response. Please try again.');

  return processOverpassElements(data.elements, tagsToQuery);
}

/**
 * Scan POIs inside an existing GIS polygon feature.
 */
export async function scanTradeAreaPolygon(
  targetPoly: GISFeature,
  selectedTags: string[],
  signal?: AbortSignal,
  customFilterGroups: OsmTagFilterGroup[] = []
): Promise<ScanResult | null> {
  const bnd = calcBounds(targetPoly);
  if (!bnd) return null;

  const bbox = `${bnd[0][1]},${bnd[0][0]},${bnd[1][1]},${bnd[1][0]}`;
  const tagsToQuery = buildTagsToQuery(selectedTags, customFilterGroups);

  if (tagsToQuery.length === 0) return null;

  // Fetch candidate OSM nodes, ways, and relations in the polygon bounds, then
  // apply the exact polygon test below so areas such as drawn circles stay exact.
  const statements = tagsToQuery
    .map((tag) => `  nwr[${tag}](${bbox});`)
    .join('\n');

  const ql = `[out:json][timeout:30];(\n${statements}\n);\nout center;`;
  const data = await robustOverpassFetch(ql, 30, signal);
  if (!data || !Array.isArray(data.elements)) throw new Error('OpenStreetMap returned an invalid search response. Please try again.');

  // Filter with point-in-polygon if polygon coordinates are present
  let elements = data.elements;
  if (targetPoly.geometry && targetPoly.geometry.coordinates) {
    const polyCoords: [number, number][] = targetPoly.geometry.coordinates[0];
    elements = elements.filter((el: any) => {
      const lat = el.lat || (el.center && el.center.lat);
      const lon = el.lon || (el.center && el.center.lon);
      return lat && lon && pointInPolygon([lon, lat], polyCoords);
    });
  }

  return processOverpassElements(elements, tagsToQuery);
}

function processOverpassElements(elements: any[], selectedTags: string[]): ScanResult {
  const counts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const features: ScannedPOI[] = [];

  elements.forEach((el: any) => {
    const lat = el.lat || (el.center && el.center.lat);
    const lon = el.lon || (el.center && el.center.lon);
    if (!lat || !lon) return;

    const tags = el.tags || {};
    const matchingPlace = Object.entries(POI_CONFIG)
      .flatMap(([catName, items]) => items.map(([label, tagQuery]) => ({ catName, label, tagQuery })))
      .sort((a, b) => Number(a.tagQuery.includes('~')) - Number(b.tagQuery.includes('~')))
      .find(({ tagQuery }) => {
        const match = tagQuery.match(/^"([^"]+)"\s*(=|~)\s*"([^"]+)"\s*(,i)?$/);
        if (!match) return false;
        const [, key, operator, expected, insensitive] = match;
        const actual = tags[key];
        if (actual == null) return false;
        const value = String(actual);
        if (operator === '=') return insensitive ? value.toLowerCase() === expected.toLowerCase() : value === expected;
        try { return new RegExp(expected, insensitive ? 'i' : '').test(value); } catch { return false; }
      });
    const typeKey = ['amenity', 'shop', 'office', 'tourism', 'leisure', 'healthcare', 'craft', 'place', 'building', 'industrial'].find((key) => tags[key]);
    const rawType = matchingPlace?.label || (typeKey ? String(tags[typeKey]) : 'Place');
    const poiType = matchingPlace?.label || rawType.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const sourceName = tags.name || tags['brand'];
    const name = sourceName ? String(sourceName) : `Unnamed ${poiType}`;
    const category = matchingPlace?.catName || humanCategoryForTag(typeKey);

    counts[poiType] = (counts[poiType] || 0) + 1;
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;

    features.push({
      name: String(name),
      type: String(poiType),
      category,
      lat,
      lon,
      tags,
      osmType: typeof el.type === 'string' ? el.type : undefined,
      osmId: el.id != null && Number.isFinite(Number(el.id)) ? Number(el.id) : undefined,
    });
  });

  return { features, counts, categoryCounts };
}

function humanCategoryForTag(key?: string): string {
  if (key === 'shop') return 'RETAIL';
  if (['amenity', 'healthcare'].includes(key || '')) return 'SERVICES';
  if (['tourism', 'leisure'].includes(key || '')) return 'LEISURE & HOSPITALITY';
  if (['office', 'building'].includes(key || '')) return 'PLACES & BUILDINGS';
  if (key === 'industrial') return 'INDUSTRY & LOGISTICS';
  return 'OTHER';
}
