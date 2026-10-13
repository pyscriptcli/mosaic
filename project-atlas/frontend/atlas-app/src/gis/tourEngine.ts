/**
 * Cinematic Tour & Street Flyby Engine
 * Resolves street geometry waypoints, calculates camera bearings,
 * and discovers POI anchors along the corridor for autonomous visualization.
 */

export interface TourPoi {
  name: string;
  category: string;
  lon: number;
  lat: number;
  highlight?: string;
}

export interface TourSequence {
  streetName: string;
  waypoints: [number, number][]; // [lon, lat]
  bearings: number[]; // bearing in degrees for each waypoint
  pois: TourPoi[];
}

/**
 * Extract street or corridor name from user query
 * e.g. "Tour me to Tomas Morato", "flyby EDSA", "show me Timog Ave"
 */
export function extractStreetQuery(prompt: string): string | null {
  const lower = prompt.toLowerCase().trim();

  // Pattern matches
  const match = lower.match(
    /(?:tour|flyby|fly by|walk me down|drive down|show me|inspect|take me to)\s+(?:the\s+)?(?:street\s+|corridor\s+|avenue\s+|road\s+)?([^,.?!]+)/i
  );

  if (match && match[1]) {
    let clean = match[1].trim();
    // Clean trailing phrases
    clean = clean.replace(/(?:please|now|slowly|and show me.*|pointing out.*)$/i, '').trim();
    if (clean.length > 2) return clean;
  }

  // Fallback keyword check
  const fallbackKeywords = ['edsa', 'tomas morato', 'timog', 'quezon ave', 'ayala ave', 'roces', 'katipunan', 'shaw'];
  for (const kw of fallbackKeywords) {
    if (lower.includes(kw)) return kw;
  }

  return null;
}

/**
 * Calculate compass bearing between two coordinates
 */
export function calculateBearing(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));

  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return brng;
}

/**
 * Fetch real street geometry and commercial POIs from OpenStreetMap Overpass
 */
export async function buildStreetTour(
  streetQuery: string,
  fallbackCenter: [number, number] = [121.0335, 14.636] // Default to Quezon City / Tomas Morato area
): Promise<TourSequence> {
  const [fLon, fLat] = fallbackCenter;

  // Clean street query
  const searchName = streetQuery
    .replace(/(avenue|ave|street|st|road|rd|highway|hwy|boulevard|blvd)\b/gi, '')
    .trim();

  let waypoints: [number, number][] = [];
  let resolvedName = streetQuery;
  const pois: TourPoi[] = [];

  try {
    // 1. Query OSM Overpass for the street geometry and surrounding POIs
    const ql = `
      [out:json][timeout:25];
      (
        way["highway"]["name"~"${searchName}",i](around:5000,${fLat},${fLon});
        node["amenity"~"restaurant|cafe|fast_food|bank|pharmacy|hospital|supermarket|mall"](around:2500,${fLat},${fLon});
        node["shop"~"supermarket|convenience|department_store|mall"](around:2500,${fLat},${fLon});
      );
      out body;
      >;
      out skel qt;
    `;

    const res = await fetch('/api/overpass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ql, timeout: 25 }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.elements) {
        // Collect nodes lookup
        const nodesMap = new Map<number, [number, number]>();
        data.elements.forEach((el: any) => {
          if (el.type === 'node' && el.lat && el.lon) {
            nodesMap.set(el.id, [el.lon, el.lat]);
          }
        });

        // Collect street ways
        const ways = data.elements.filter(
          (el: any) =>
            el.type === 'way' &&
            el.tags?.name &&
            el.tags.name.toLowerCase().includes(searchName.toLowerCase())
        );

        if (ways.length > 0) {
          resolvedName = ways[0].tags.name;

          // Assemble sequential coordinates from longest road segment
          const sortedWays = [...ways].sort((a, b) => (b.nodes?.length || 0) - (a.nodes?.length || 0));
          const primaryWay = sortedWays[0];

          primaryWay.nodes.forEach((nid: number) => {
            const pt = nodesMap.get(nid);
            if (pt) waypoints.push(pt);
          });
        }

        // Collect commercial POIs
        const rawPois = data.elements.filter(
          (el: any) =>
            el.type === 'node' &&
            el.tags?.name &&
            (el.tags.amenity || el.tags.shop)
        );

        rawPois.slice(0, 10).forEach((p: any) => {
          const category = p.tags.amenity || p.tags.shop || 'Commercial';
          pois.push({
            name: p.tags.name,
            category: category.toUpperCase(),
            lon: p.lon,
            lat: p.lat,
            highlight: p.tags.brand || p.tags.cuisine || 'Commercial Anchor',
          });
        });
      }
    }
  } catch (err) {
    console.warn('Tour generation fallback triggered:', err);
  }

  // Fallback synthetic waypoints if Overpass yields sparse line
  if (waypoints.length < 3) {
    // Generate smooth forward glide path around center
    waypoints = [
      [fLon - 0.005, fLat - 0.003],
      [fLon - 0.002, fLat - 0.001],
      [fLon, fLat],
      [fLon + 0.002, fLat + 0.001],
      [fLon + 0.005, fLat + 0.003],
    ];
  }

  // Calculate bearings along waypoints
  const bearings: number[] = [];
  for (let i = 0; i < waypoints.length; i++) {
    if (i < waypoints.length - 1) {
      const b = calculateBearing(
        waypoints[i][0],
        waypoints[i][1],
        waypoints[i + 1][0],
        waypoints[i + 1][1]
      );
      bearings.push(b);
    } else if (bearings.length > 0) {
      bearings.push(bearings[bearings.length - 1]);
    } else {
      bearings.push(0);
    }
  }

  // Ensure default POIs if none found
  if (pois.length === 0) {
    waypoints.slice(1, -1).forEach((pt, idx) => {
      pois.push({
        name: `${resolvedName} Commercial Hub ${idx + 1}`,
        category: idx % 2 === 0 ? 'RETAIL ANCHOR' : 'DINING & HOSPITALITY',
        lon: pt[0] + 0.0004,
        lat: pt[1] + 0.0003,
        highlight: 'Primary Traffic Generator',
      });
    });
  }

  return {
    streetName: resolvedName,
    waypoints,
    bearings,
    pois,
  };
}
