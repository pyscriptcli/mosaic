import { NextRequest, NextResponse } from 'next/server';
import { POI_CONFIG } from '../../../gis/tradeArea';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BODY_BYTES = 64_000;
const MAX_QUERY_BYTES = 48_000;
const MAX_RESPONSE_BYTES = 32_000_000;
const MAX_STATEMENTS = 200;
const MAX_TOTAL_FILTERS = 600;
const ALLOWED_REGEX_SELECTORS = new Set(
  Object.values(POI_CONFIG)
    .flatMap((items) => items.map(([, tag]) => tag))
    .filter((tag) => tag.includes('~'))
    .map((tag) => `[${tag}]`)
);
const overpassRequests = new Map<string, number[]>();

// Best-effort burst control per warm runtime; the proxy accepts only Atlas scan queries below.
function isRateLimited(req: NextRequest): boolean {
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = req.headers.get('x-real-ip') || forwardedFor?.split(',').at(-1)?.trim() || 'unknown';
  const now = Date.now();
  const recent = (overpassRequests.get(ip) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 30) {
    overpassRequests.set(ip, recent);
    return true;
  }
  recent.push(now);
  overpassRequests.set(ip, recent);
  if (overpassRequests.size > 2_000) {
    for (const [key, timestamps] of overpassRequests) {
      if (timestamps.every((timestamp) => now - timestamp >= 60_000)) overpassRequests.delete(key);
    }
  }
  return false;
}

function isValidCoordinate(value: string, limit: number): boolean {
  const number = Number(value);
  return Number.isFinite(number) && number >= -limit && number <= limit;
}

function isAllowedStatement(statement: string): { valid: boolean; filterCount: number } {
  const featureType = statement.startsWith('nwr') ? 'nwr' : statement.startsWith('nw') ? 'nw' : null;
  if (!featureType) return { valid: false, filterCount: 0 };

  const locationIndex = statement.lastIndexOf('](');
  if (locationIndex < featureType.length || !statement.endsWith(');')) return { valid: false, filterCount: 0 };

  const selectorClause = statement.slice(featureType.length, locationIndex + 1);
  const selectorPattern = /\["([a-zA-Z0-9:_-]{1,64})"(=|~)"([^"\\\r\n\[\];]{1,160})"(,i)?\]/g;
  const selectors = Array.from(selectorClause.matchAll(selectorPattern));
  if (selectors.length === 0 || selectors.length > 6 || selectors.map((item) => item[0]).join('') !== selectorClause) {
    return { valid: false, filterCount: 0 };
  }
  if (selectors.some((selector) => selector[2] === '~' && !ALLOWED_REGEX_SELECTORS.has(selector[0]))) {
    return { valid: false, filterCount: 0 };
  }

  const location = statement.slice(locationIndex + 2, -2);
  const around = location.match(/^around:(\d{1,6}),(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);
  if (around) {
    const radius = Number(around[1]);
    if (radius < 1 || radius > 50_000 || !isValidCoordinate(around[2], 90) || !isValidCoordinate(around[3], 180)) {
      return { valid: false, filterCount: 0 };
    }
    return { valid: true, filterCount: selectors.length };
  }

  const bounds = location.match(/^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);
  if (bounds) {
    const [minLat, minLon, maxLat, maxLon] = bounds.slice(1).map(Number);
    if (
      !isValidCoordinate(String(minLat), 90) || !isValidCoordinate(String(maxLat), 90) ||
      !isValidCoordinate(String(minLon), 180) || !isValidCoordinate(String(maxLon), 180) ||
      minLat >= maxLat || minLon >= maxLon || maxLat - minLat > 5 || maxLon - minLon > 5
    ) return { valid: false, filterCount: 0 };
    return { valid: true, filterCount: selectors.length };
  }

  return { valid: false, filterCount: 0 };
}

function validateAtlasQuery(query: unknown): query is string {
  if (typeof query !== 'string' || query.length === 0 || new TextEncoder().encode(query).byteLength > MAX_QUERY_BYTES) return false;
  const match = query.match(/^\s*\[out:json\]\[timeout:(\d{1,2})\];\s*\(([\s\S]*)\);\s*out center;\s*$/);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 60) return false;

  const statements = match[2].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (statements.length === 0 || statements.length > MAX_STATEMENTS) return false;
  let totalFilters = 0;
  for (const statement of statements) {
    const result = isAllowedStatement(statement);
    if (!result.valid) return false;
    totalFilters += result.filterCount;
    if (totalFilters > MAX_TOTAL_FILTERS) return false;
  }
  return true;
}

async function readBodyLimited(req: NextRequest): Promise<unknown> {
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new Error('too_large');
  if (!req.body) throw new Error('invalid_body');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function readResponseLimited(res: Response): Promise<unknown> {
  const declaredLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) throw new Error('response_too_large');
  if (!res.body) throw new Error('empty_response');
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('response_too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function POST(req: NextRequest) {
  if (isRateLimited(req)) {
    return NextResponse.json({ error: 'There have been several map searches. Wait a minute and try again.' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  try {
    const body = await readBodyLimited(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    const { query, timeout = 30 } = body as { query?: unknown; timeout?: unknown };
    if (!validateAtlasQuery(query)) return NextResponse.json({ error: 'This search request is not valid. Please revise the area or selected place types.' }, { status: 400 });
    const timeoutSeconds = typeof timeout === 'number' && Number.isFinite(timeout) ? Math.max(3, Math.min(14, timeout)) : 14;
    const deadline = Date.now() + 28_000;

    // Direct fast Overpass HTTP POST queries with rapid multi-mirror failover
    for (const endpoint of OVERPASS_ENDPOINTS) {
      if (req.signal?.aborted) {
        return NextResponse.json({ error: 'Request aborted by client' }, { status: 499 });
      }

      try {
        const controller = new AbortController();
        const remainingSeconds = Math.max(1, Math.floor((deadline - Date.now()) / 1000));
        const perAttemptTimeout = Math.min(timeoutSeconds, 8, remainingSeconds);
        const tid = setTimeout(() => controller.abort(), perAttemptTimeout * 1000);

        // Chain client abort signal if client cancels
        if (req.signal) {
          req.signal.addEventListener('abort', () => controller.abort());
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'AtlasGIS/3.0 (https://github.com/pyscriptcli/project-atlas)',
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(tid);

        if (res.ok) {
          let data;
          try {
            data = await readResponseLimited(res);
          } catch (error) {
            if (error instanceof Error && error.message === 'response_too_large') {
              return NextResponse.json({ error: 'This search returned too much data. Try a smaller area or fewer place types.' }, { status: 413 });
            }
            continue;
          }
          return NextResponse.json(data);
        }
      } catch (err: any) {
        // Continue to next mirror immediately on timeout or error
      }
    }

    return NextResponse.json(
      { error: 'All Overpass endpoints failed to respond in time. Please try a slightly smaller radius or fewer tags.' },
      { status: 504 }
    );
  } catch (error: any) {
    if (error instanceof Error && error.message === 'too_large') {
      return NextResponse.json({ error: 'The search request is too large. Select fewer place types or a smaller area.' }, { status: 413 });
    }
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Cancelled' }, { status: 499 });
    }
    console.error('Overpass proxy error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
