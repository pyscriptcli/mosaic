/**
 * Mapbox Access Token Manager & Isochrone Client
 * Supports token pooling & round-robin rotation between MAPBOX_ACCESS_TOKEN_1,
 * MAPBOX_ACCESS_TOKEN_2, MAPBOX_ACCESS_TOKENS, and MAPBOX_ACCESS_TOKEN.
 */

let tokenIndex = 0;

export function getMapboxTokens(): string[] {
  const tokens: string[] = [];

  if (process.env.MAPBOX_ACCESS_TOKEN_1) {
    tokens.push(process.env.MAPBOX_ACCESS_TOKEN_1.trim());
  }
  if (process.env.MAPBOX_ACCESS_TOKEN_2) {
    tokens.push(process.env.MAPBOX_ACCESS_TOKEN_2.trim());
  }
  if (process.env.MAPBOX_ACCESS_TOKENS) {
    const split = process.env.MAPBOX_ACCESS_TOKENS.split(',').map((t) => t.trim()).filter(Boolean);
    tokens.push(...split);
  }
  if (process.env.MAPBOX_ACCESS_TOKEN) {
    const single = process.env.MAPBOX_ACCESS_TOKEN.trim();
    if (!tokens.includes(single)) tokens.push(single);
  }

  return Array.from(new Set(tokens.filter((t) => t.length > 0 && !t.includes('FIRST_TOKEN_HERE'))));
}

export function getNextMapboxToken(): string | null {
  const tokens = getMapboxTokens();
  if (tokens.length === 0) return null;
  const token = tokens[tokenIndex % tokens.length];
  tokenIndex++;
  return token;
}

export interface IsochroneRequest {
  lon: number;
  lat: number;
  minutes: number;
  profile: 'driving' | 'walking' | 'cycling';
}

export interface IsochroneResult {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      contour: number;
      profile: string;
      metric: string;
      fillColor?: string;
      color?: string;
      opacity?: number;
    };
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    };
  }>;
}

/**
 * Fetch Mapbox Isochrone with automatic token rotation and failover
 */
export async function fetchMapboxIsochrone(
  params: IsochroneRequest,
  signal?: AbortSignal
): Promise<IsochroneResult | null> {
  const { lon, lat, minutes, profile } = params;
  const tokens = getMapboxTokens();

  if (tokens.length === 0) {
    console.warn('No active Mapbox tokens configured in environment.');
    return null;
  }

  // Try available tokens in order if one fails
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[(tokenIndex + i) % tokens.length];
    const url = `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${lon},${lat}?contours_minutes=${minutes}&polygons=true&access_token=${token}`;

    try {
      const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
      if (res.ok) {
        tokenIndex = (tokenIndex + i + 1) % tokens.length;
        const data = await res.json();
        return data as IsochroneResult;
      }
      console.warn(`Mapbox token ${token.slice(0, 10)}... returned status ${res.status}. Trying next token if available.`);
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      console.error('Error fetching Mapbox Isochrone:', err);
    }
  }

  return null;
}
