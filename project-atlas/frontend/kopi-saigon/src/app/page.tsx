'use client';

import maplibregl, { LngLatBounds, Map as MapLibreMap } from 'maplibre-gl';
import { Box, ChevronLeft, ChevronRight, Coffee, Compass, ExternalLink, Flame, LoaderCircle, Map as MapIcon, MapPin, MapPinned, Network, Table2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Feature as GeoFeature, FeatureCollection, Geometry } from 'geojson';
import { ALL_STYLES, VIS_MAP } from '../gis/map';
import 'maplibre-gl/dist/maplibre-gl.css';
import LoginScreen from './login-screen';

type AtlasFeature = { id: number; name: string; kind: string; geometry: Geometry; props?: Record<string, any> };
type AtlasProject = { id: string; name: string; basemap?: string; center?: [number, number]; zoom?: number; pitch?: number; bearing?: number; features?: AtlasFeature[]; layer_visibilities?: Record<string, boolean>; updated_at?: string };
type Stop = { id: string; title: string; subtitle: string; tier: PriceTier; featureIds: number[]; match: (f: AtlasFeature) => boolean };
type PriceTier = 'high' | 'mid' | 'low';
type DisplayMode = 'pins' | 'heatmap' | 'clusters';
type FocusArea = { id: string; name: string; bounds: [number, number, number, number]; match: (feature: AtlasFeature) => boolean };
const TIER_COLORS: Record<PriceTier, string> = { high: '#EE3F24', mid: '#E6B549', low: '#22c55e' };
function isPointInPolygon([x, y]: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToLine([px, py]: [number, number], line: [number, number][]): number {
  let minDist = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, y1] = line[i];
    const [x2, y2] = line[i + 1];
    const midLat = (y1 + y2) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);
    const dx = (x2 - x1) * 111320 * cosLat;
    const dy = (y2 - y1) * 110540;
    const lenSq = dx * dx + dy * dy;
    let projX = x1;
    let projY = y1;
    if (lenSq > 0) {
      const pDx = (px - x1) * 111320 * cosLat;
      const pDy = (py - y1) * 110540;
      const t = Math.max(0, Math.min(1, (pDx * dx + pDy * dy) / lenSq));
      projX = x1 + t * (x2 - x1);
      projY = y1 + t * (y2 - y1);
    }
    const dX = (px - projX) * 111320 * cosLat;
    const dY = (py - projY) * 110540;
    const dist = Math.sqrt(dX * dX + dY * dY);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

function makeFocusAreas(features: AtlasFeature[]): FocusArea[] {
  const scoutFeature = features.find(f => f.kind === 'polygon' && /scout/i.test(f.name));
  const magFeature = features.find(f => f.kind === 'route' && /maginhawa/i.test(f.name));
  const katFeature = features.find(f => f.kind === 'route' && /katipunan/i.test(f.name));

  const scoutRing = scoutFeature?.geometry?.type === 'Polygon' ? (scoutFeature.geometry.coordinates[0] as [number, number][]) : [];
  const magLine = magFeature?.geometry?.type === 'LineString' ? (magFeature.geometry.coordinates as [number, number][]) : [];
  const katLine = katFeature?.geometry?.type === 'LineString' ? (katFeature.geometry.coordinates as [number, number][]) : [];

  return [
    {
      id: 'scout',
      name: 'Scout Area',
      bounds: [121.0157, 14.62761, 121.04577, 14.64419],
      match: feature => {
        if (feature.kind !== 'marker') return /scout/i.test(feature.name);
        if (feature.geometry.type !== 'Point') return false;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        if (scoutRing.length && isPointInPolygon([lng, lat], scoutRing)) return true;
        const tags = feature.props?.osmTags || {};
        const street = String(tags['addr:street'] || tags['addr:full'] || '').toLowerCase();
        return street.includes('scout') && !street.includes('maginhawa') && !street.includes('katipunan');
      },
    },
    {
      id: 'maginhawa',
      name: 'Maginhawa',
      bounds: [121.05356, 14.63636, 121.06154, 14.65171],
      match: feature => {
        if (feature.kind !== 'marker') return /maginhawa/i.test(feature.name);
        if (feature.geometry.type !== 'Point') return false;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        if (magLine.length && distanceToLine([lng, lat], magLine) <= 180) return true;
        const tags = feature.props?.osmTags || {};
        const street = String(tags['addr:street'] || tags['addr:full'] || '').toLowerCase();
        return street.includes('maginhawa');
      },
    },
    {
      id: 'katipunan',
      name: 'Katipunan',
      bounds: [121.07049, 14.61536, 121.07482, 14.65757],
      match: feature => {
        if (feature.kind !== 'marker') return /katipunan/i.test(feature.name);
        if (feature.geometry.type !== 'Point') return false;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        if (katLine.length && distanceToLine([lng, lat], katLine) <= 180) return true;
        const tags = feature.props?.osmTags || {};
        const street = String(tags['addr:street'] || tags['addr:full'] || '').toLowerCase();
        return street.includes('katipunan');
      },
    },
  ];
}
const PROJECT_NAME = 'KOPI SAIGON';
const PROJECT_ID = 'c5e014fa-2c16-4ad5-8f00-5d525ba954d7';
const DEFAULT_SUPABASE_URL = 'https://cyczyaswxkpdcremqnkn.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_pUppHGjwmT1mLlhWGZH6Og_4GcCLCPR';

function applyDisplayMode(map: MapLibreMap, mode: DisplayMode) {
  const visibility: Record<string, boolean> = {
    'kopi-poi-dots': mode === 'pins',
    'kopi-poi-labels': mode === 'pins',
    'kopi-poi-halo': mode === 'pins',
    'kopi-poi-heatmap': mode === 'heatmap',
    'kopi-cluster-circles': mode === 'clusters',
    'kopi-cluster-count': mode === 'clusters',
    'kopi-cluster-points': mode === 'clusters',
  };
  Object.entries(visibility).forEach(([id, visible]) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  });
}

function applyPerspectiveLayers(map: MapLibreMap, threeD: boolean) {
  [['building-2d', !threeD], ['building-3d', threeD]].forEach(([layerId, visible]) => {
    if (map.getLayer(layerId as string)) map.setLayoutProperty(layerId as string, 'visibility', visible ? 'visible' : 'none');
  });
}

function pointCollection(collection: FeatureCollection<Geometry>, focusArea: FocusArea | null): FeatureCollection<Geometry> {
  const points = collection.features.filter(feature => feature.geometry.type === 'Point' && (!focusArea || feature.properties?.focusMatch));
  return { type: 'FeatureCollection', features: points } as FeatureCollection<Geometry>;
}

function getActiveBoundaryCollection(features: AtlasFeature[], focusArea: FocusArea | null): FeatureCollection<Geometry> {
  const activeBoundaryFeatures = focusArea
    ? features.filter(f => f.kind !== 'marker' && focusArea.match(f))
    : [];
  return {
    type: 'FeatureCollection',
    features: activeBoundaryFeatures.map(f => ({
      type: 'Feature', id: f.id, geometry: f.geometry, properties: { id: f.id, name: f.name, kind: f.kind }
    })) as GeoFeature<Geometry>[],
  };
}

function addProjectLayers(map: MapLibreMap, features: AtlasFeature[], selectedId: string, focusArea: FocusArea | null = null, displayMode: DisplayMode = 'pins') {
  [
    'kopi-areas-fill', 'kopi-circle-casing', 'kopi-circle-line', 'kopi-areas-line',
    'kopi-active-fill', 'kopi-active-ripple-2', 'kopi-active-ripple-1', 'kopi-active-glow', 'kopi-active-line', 'kopi-active-core',
    'kopi-poi-halo', 'kopi-poi-dots', 'kopi-poi-labels', 'kopi-poi-heatmap',
    'kopi-cluster-circles', 'kopi-cluster-count', 'kopi-cluster-points'
  ].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource('kopi-features')) map.removeSource('kopi-features');
  if (map.getSource('kopi-clusters')) map.removeSource('kopi-clusters');
  if (map.getSource('kopi-active-boundary')) map.removeSource('kopi-active-boundary');

  const active = makeStops(features).find(stop => stop.id === selectedId);
  const collection = featureCollection(features, active?.match, active?.tier, focusArea);
  map.addSource('kopi-features', { type: 'geojson', data: collection });
  map.addSource('kopi-clusters', { type: 'geojson', data: pointCollection(collection, focusArea), cluster: true, clusterMaxZoom: 14, clusterRadius: 48 });
  map.addSource('kopi-active-boundary', {
    type: 'geojson',
    data: getActiveBoundaryCollection(features, focusArea),
  });

  // Base area fills
  map.addLayer({
    id: 'kopi-areas-fill',
    type: 'fill',
    source: 'kopi-features',
    filter: ['all', ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]], ['!=', ['get', 'kind'], 'circle']],
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['case', ['get', 'selected'], 0.16, 0.035]
    }
  });

  // Radius Circle (bold prominent border width with casing so it's clearly noticeable)
  map.addLayer({
    id: 'kopi-circle-casing',
    type: 'line',
    source: 'kopi-features',
    filter: ['==', ['get', 'kind'], 'circle'],
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 13, 18, 18],
      'line-opacity': 0.95
    }
  });
  map.addLayer({
    id: 'kopi-circle-line',
    type: 'line',
    source: 'kopi-features',
    filter: ['==', ['get', 'kind'], 'circle'],
    paint: {
      'line-color': ['coalesce', ['get', 'borderColor'], ['get', 'color'], '#EE3F24'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 14, 9, 18, 13],
      'line-opacity': 1
    }
  });

  // Non-circle boundary & route lines
  map.addLayer({
    id: 'kopi-areas-line',
    type: 'line',
    source: 'kopi-features',
    filter: ['all', ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']]], ['!=', ['get', 'kind'], 'circle']],
    paint: {
      'line-color': ['coalesce', ['get', 'borderColor'], ['get', 'color']],
      'line-width': ['case', ['get', 'focusMatch'], 4, ['case', ['get', 'selected'], 2.5, 1.2]],
      'line-opacity': ['case', ['get', 'focusMatch'], 0.95, ['case', ['get', 'selected'], 0.85, 0.25]]
    }
  });

  // Active Explore Area: Glowing Red Polygon Fill & Animated Pulsing/Ripple Red Street/Border
  map.addLayer({
    id: 'kopi-active-fill',
    type: 'fill',
    source: 'kopi-active-boundary',
    filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
    paint: {
      'fill-color': '#FF1E27',
      'fill-opacity': 0.15
    }
  });
  map.addLayer({
    id: 'kopi-active-ripple-2',
    type: 'line',
    source: 'kopi-active-boundary',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FF2222',
      'line-width': 6,
      'line-opacity': 0,
      'line-blur': 2
    }
  });
  map.addLayer({
    id: 'kopi-active-ripple-1',
    type: 'line',
    source: 'kopi-active-boundary',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FF2222',
      'line-width': 6,
      'line-opacity': 0,
      'line-blur': 2
    }
  });
  map.addLayer({
    id: 'kopi-active-glow',
    type: 'line',
    source: 'kopi-active-boundary',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FF1E27',
      'line-width': 14,
      'line-blur': 6,
      'line-opacity': 0.85
    }
  });
  map.addLayer({
    id: 'kopi-active-line',
    type: 'line',
    source: 'kopi-active-boundary',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FF1E27',
      'line-width': 5.5,
      'line-opacity': 1
    }
  });
  map.addLayer({
    id: 'kopi-active-core',
    type: 'line',
    source: 'kopi-active-boundary',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FFFFFF',
      'line-width': 1.8,
      'line-opacity': 0.9
    }
  });

  map.addLayer({ id: 'kopi-poi-halo', type: 'circle', source: 'kopi-features', filter: ['all', ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]], ['==', ['get', 'focusMatch'], true]], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 9, 15, 15], 'circle-color': '#E6B549', 'circle-opacity': 0.35, 'circle-blur': 0.55 } });
  map.addLayer({ id: 'kopi-poi-dots', type: 'circle', source: 'kopi-features', filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3.5, 15, 7], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['case', ['get', 'focusMatch'], 2.5, 1.5], 'circle-opacity': ['case', ['get', 'focusMode'], ['case', ['get', 'focusMatch'], 0.98, 0.12], ['case', ['get', 'selected'], 0.96, 0.18]] } });
  map.addLayer({ id: 'kopi-poi-labels', type: 'symbol', source: 'kopi-features', filter: ['all', ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]], ['!=', ['get', 'label'], '']], layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 16, 13], 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-max-width': 12, 'text-optional': true }, paint: { 'text-color': '#181D1E', 'text-halo-color': '#FAF5EE', 'text-halo-width': 2, 'text-opacity': ['case', ['get', 'focusMode'], ['case', ['get', 'focusMatch'], 0.98, 0.15], ['case', ['get', 'selected'], 0.98, 0.25]] }, minzoom: 13 });
  map.addLayer({ id: 'kopi-poi-heatmap', type: 'heatmap', source: 'kopi-features', filter: ['all', ['==', ['geometry-type'], 'Point'], ['any', ['==', ['get', 'focusMode'], false], ['==', ['get', 'focusMatch'], true]]], maxzoom: 16, paint: { 'heatmap-weight': ['case', ['get', 'selected'], 1, 0.35], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 15, 2.2], 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 5, 18, 15, 42], 'heatmap-opacity': 0.82, 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(34,197,94,0)', 0.25, '#22c55e', 0.55, '#E6B549', 0.8, '#FFBC7D', 1, '#EE3F24'] } });
  map.addLayer({ id: 'kopi-cluster-circles', type: 'circle', source: 'kopi-clusters', filter: ['has', 'point_count'], paint: { 'circle-color': ['step', ['get', 'point_count'], '#E6B549', 15, '#E2A334', 50, '#EE3F24'], 'circle-radius': ['step', ['get', 'point_count'], 17, 15, 22, 50, 28], 'circle-opacity': 0.92, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
  map.addLayer({ id: 'kopi-cluster-count', type: 'symbol', source: 'kopi-clusters', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 11 }, paint: { 'text-color': '#5A2911' } });
  map.addLayer({ id: 'kopi-cluster-points', type: 'circle', source: 'kopi-clusters', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-opacity': ['case', ['get', 'focusMode'], ['case', ['get', 'focusMatch'], 0.98, 0.12], ['case', ['get', 'selected'], 0.96, 0.18]], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff' } });
  applyDisplayMode(map, displayMode);
}

function positions(geometry: Geometry): number[][] {
  const out: number[][] = [];
  const visit = (value: any): void => {
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') out.push([value[0], value[1]]);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(g => out.push(...positions(g)));
  else visit((geometry as any).coordinates);
  return out;
}

function formatResearchPrice(value: unknown, currency: 'PHP' | 'MYR'): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!raw || /^(unknown|unclear|not available|n\/?a|—|-)$/i.test(raw)) return null;
  const withoutCurrency = raw.replace(currency === 'PHP' ? /(?:\bPHP\b|₱)\s*/gi : /(?:\bMYR\b|\bRM\b)\s*/gi, '').trim();
  const range = withoutCurrency.replace(/(\d)\s*[-–—]\s*(?=\d)/g, '$1–');
  return range ? `${currency} ${range}` : null;
}

function getPriceRanges(feature: AtlasFeature): { php: string | null; myr: string | null } {
  const research = feature.props?.researchData;
  if (!research || typeof research !== 'object') return { php: null, myr: null };
  return {
    php: formatResearchPrice(research.priceRangePhp ?? research.priceRangePHP, 'PHP'),
    myr: formatResearchPrice(research.priceRangeMyr ?? research.priceRangeMYR, 'MYR'),
  };
}

function getPriceLabel(feature: AtlasFeature): string {
  const { php, myr } = getPriceRanges(feature);
  return php || myr ? `${php || 'PHP —'} / ${myr || 'MYR —'}` : 'Price not available';
}

function getLocationLabel(feature: AtlasFeature): string {
  const tags = feature.props?.osmTags || {};
  const address = tags['addr:full'] || [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', ');
  const point = feature.geometry.type === 'Point' ? feature.geometry.coordinates : null;
  const coordinates = point && point.every(Number.isFinite) ? `${point[1].toFixed(5)}, ${point[0].toFixed(5)}` : '';
  return String(address || '').trim() || coordinates || feature.name || 'Location unavailable';
}


function getGoogleMapsUrl(feature: AtlasFeature): string {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  const point = feature.geometry.type === 'Point' ? feature.geometry.coordinates : null;
  url.searchParams.set('query', point && point.every(Number.isFinite) ? `${point[1]},${point[0]}` : feature.name);
  return url.toString();
}

function featureCollection(features: AtlasFeature[], selectedPoi?: (feature: AtlasFeature) => boolean, selectedTier?: PriceTier, focusArea: FocusArea | null = null): FeatureCollection<Geometry> {
  return {
    type: 'FeatureCollection',
    // Tier navigation filters POIs by feature data, not numeric feature IDs.
    // Imported Atlas IDs can collide when markers are created in quick scans.
    features: features.filter(f => f?.geometry && f.props?.visible !== 0 && (!selectedPoi || f.kind !== 'marker' || selectedPoi(f))).map(f => ({
      type: 'Feature', id: f.id,
      geometry: f.geometry,
      properties: {
        id: f.id, name: f.name || 'Unnamed place', kind: f.kind,
        color: f.kind === 'marker' && selectedTier && selectedPoi?.(f) ? TIER_COLORS[selectedTier] : f.props?.color || f.props?.fillColor || '#39c6be',
        borderColor: f.props?.borderColor || f.props?.color || f.props?.fillColor || '#39c6be',
        label: f.props?.showLabel === false ? '' : (f.name || ''),
        category: f.props?.amenityGroupLabel || f.props?.category || f.props?.poiType || f.kind,
        priceLabel: getPriceLabel(f),
        selected: !selectedPoi || selectedPoi(f),
        focusMatch: !!focusArea?.match(f),
        focusMode: !!focusArea,
      },
    })) as GeoFeature<Geometry>[],
  };
}

function getPricePhp(feature: AtlasFeature): number | null {
  const research = feature.props?.researchData;
  if (!research || typeof research !== 'object') return null;
  const rawRange = research.priceRangePhp ?? research.priceRangePHP;
  if (rawRange != null) {
    const values = String(rawRange).match(/\d+(?:[,.]\d+)?/g)?.map(value => Number(value.replace(',', ''))).filter(Number.isFinite) || [];
    if (values.length) return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  const menuPrices = research.menuPrices;
  if (Array.isArray(menuPrices)) {
    const values = menuPrices.flatMap((entry: any) => {
      if (!entry || typeof entry !== 'object' || !/^(PHP|₱|P)$/i.test(String(entry.currency || ''))) return [];
      const match = String(entry.amount ?? entry.price ?? '').match(/\d+(?:[,.]\d+)?/);
      return match ? [Number(match[0].replace(',', ''))] : [];
    }).filter(Number.isFinite);
    if (values.length) return values.reduce((sum: number, value: number) => sum + value, 0) / values.length;
  }
  return null;
}

function getExplicitPriceTier(feature: AtlasFeature): PriceTier | null {
  const research = feature.props?.researchData;
  const value = String(research?.tier ?? research?.priceTier ?? research?.priceLevel ?? '').trim().toLowerCase();
  if (value === 'high' || value === 'premium' || value === 'expensive') return 'high';
  if (value === 'mid' || value === 'medium' || value === 'moderate') return 'mid';
  if (value === 'low' || value === 'budget' || value === 'affordable') return 'low';
  return null;
}

function makeStops(features: AtlasFeature[]): Stop[] {
  const places = features.filter(feature => feature.kind === 'marker' && feature.geometry?.type === 'Point');
  const tierFor = (feature: AtlasFeature): PriceTier | null => {
    const explicit = getExplicitPriceTier(feature);
    if (explicit) return explicit;
    const php = getPricePhp(feature);
    if (php != null) {
      if (php >= 190) return 'high';
      if (php >= 125) return 'mid';
      return 'low';
    }
    return null;
  };
  return (['high', 'mid', 'low'] as const).map(tier => {
    const matching = places.filter(feature => tierFor(feature) === tier);
    const title = `${tier[0].toUpperCase()}${tier.slice(1)} tier`;
    return {
      id: `tier:${tier}`, title, subtitle: `${matching.length} places · ${tier} recorded coffee prices`,
      tier, featureIds: matching.map(feature => feature.id), match: feature => tierFor(feature) === tier,
    };
  });
}

const FALLBACK_OSM_STYLE = {
  version: 8 as const,
  sources: { fallback: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 } },
  layers: [
    { id: 'fallback-background', type: 'background' as const, paint: { 'background-color': '#F3E8D7' } },
    { id: 'fallback-osm', type: 'raster' as const, source: 'fallback' },
  ],
};

export default function KopiSaigonPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const handleAuthenticated = useCallback(() => setAuthenticated(true), []);

  if (!authenticated) return <LoginScreen onAuthenticated={handleAuthenticated} />;
  return <KopiSaigonDashboard />;
}

function KopiSaigonDashboard() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const tableDialogRef = useRef<HTMLDialogElement>(null);
  const sourceReady = useRef(false);
  const selectedRef = useRef('overview');
  const focusAreaRef = useRef<FocusArea | null>(null);
  const displayModeRef = useRef<DisplayMode>('pins');
  const styleNameRef = useRef('');
  const editorCameraRef = useRef('');
  const rippleAnimRef = useRef<number | null>(null);
  const [project, setProject] = useState<AtlasProject | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('overview');
  const [menuOpen, setMenuOpen] = useState(true);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableTier, setTableTier] = useState<PriceTier | 'all'>('all');
  const [focusArea, setFocusArea] = useState<FocusArea | null>(null);
  const [is3D, setIs3D] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('pins');
  const features = useMemo(() => project?.features || [], [project]);
  const focusAreas = useMemo(() => makeFocusAreas(features), [features]);
  const stops = useMemo(() => makeStops(features), [features]);
  const tierGroups = useMemo(() => stops.map(stop => ({
    stop,
    places: features.filter(stop.match).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id),
  })), [features, stops]);
  const tableCount = tierGroups.reduce((total, group) => total + group.places.length, 0);

  useEffect(() => {
    if (focusAreaRef.current) {
      const updated = focusAreas.find(a => a.id === focusAreaRef.current?.id);
      if (updated) {
        focusAreaRef.current = updated;
        setFocusArea(updated);
      }
    }
  }, [focusAreas]);

  const stopRippleAnimation = useCallback(() => {
    if (rippleAnimRef.current != null) {
      cancelAnimationFrame(rippleAnimRef.current);
      rippleAnimRef.current = null;
    }
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer('kopi-active-ripple-1')) {
        map.setPaintProperty('kopi-active-ripple-1', 'line-opacity', 0);
      }
      if (map.getLayer('kopi-active-ripple-2')) {
        map.setPaintProperty('kopi-active-ripple-2', 'line-opacity', 0);
      }
      if (map.getLayer('kopi-active-glow')) {
        map.setPaintProperty('kopi-active-glow', 'line-opacity', 0.85);
      }
    } catch {
      // Map may be destroyed or style reloading
    }
  }, []);

  const startRippleAnimation = useCallback(() => {
    stopRippleAnimation();
    const map = mapRef.current;
    if (!map) return;

    const DURATION = 1800;
    let startTimestamp: number | null = null;

    const step = (now: number) => {
      if (!mapRef.current) return;
      if (startTimestamp === null) startTimestamp = now;
      const elapsed = now - startTimestamp;

      // Two ripples offset by half cycle (900ms)
      const p1 = (elapsed % DURATION) / DURATION;
      const p2 = ((elapsed + DURATION / 2) % DURATION) / DURATION;

      // Width expands smoothly from 6px to 40px
      // Opacity decays from 0.85 to 0
      // Blur increases from 2px to 14px
      const w1 = 6 + p1 * 34;
      const o1 = (1 - p1) * 0.85;
      const b1 = 2 + p1 * 12;

      const w2 = 6 + p2 * 34;
      const o2 = (1 - p2) * 0.85;
      const b2 = 2 + p2 * 12;

      // Glowing red aura breathes with rhythmic intensity
      const glowPulse = 0.75 + 0.2 * Math.sin((elapsed / DURATION) * Math.PI * 2);

      try {
        if (map.getLayer('kopi-active-ripple-1')) {
          map.setPaintProperty('kopi-active-ripple-1', 'line-width', w1);
          map.setPaintProperty('kopi-active-ripple-1', 'line-opacity', o1);
          map.setPaintProperty('kopi-active-ripple-1', 'line-blur', b1);
        }
        if (map.getLayer('kopi-active-ripple-2')) {
          map.setPaintProperty('kopi-active-ripple-2', 'line-width', w2);
          map.setPaintProperty('kopi-active-ripple-2', 'line-opacity', o2);
          map.setPaintProperty('kopi-active-ripple-2', 'line-blur', b2);
        }
        if (map.getLayer('kopi-active-glow')) {
          map.setPaintProperty('kopi-active-glow', 'line-opacity', glowPulse);
        }
      } catch {
        return;
      }

      rippleAnimRef.current = requestAnimationFrame(step);
    };

    rippleAnimRef.current = requestAnimationFrame(step);
  }, [stopRippleAnimation]);

  useEffect(() => {
    return () => {
      stopRippleAnimation();
    };
  }, [stopRippleAnimation]);

  useEffect(() => {
    const dialog = tableDialogRef.current;
    if (!dialog) return;
    if (tableOpen && !dialog.open) dialog.showModal();
    if (!tableOpen && dialog.open) dialog.close();
  }, [tableOpen]);

  useEffect(() => {
    if (project) setIs3D(false);
  }, [project?.id]);

  const refreshMap = useCallback((focus?: Stop, area?: FocusArea | null) => {
    const map = mapRef.current;
    if (!map || !sourceReady.current) return;
    const chosenStop = focus || stops.find(stop => stop.id === selectedRef.current);
    const activeArea = area === undefined ? focusAreaRef.current : area;
    const source = map.getSource('kopi-features') as maplibregl.GeoJSONSource | undefined;
    const collection = featureCollection(features, chosenStop?.match, chosenStop?.tier, activeArea);
    source?.setData(collection);
    (map.getSource('kopi-clusters') as maplibregl.GeoJSONSource | undefined)?.setData(pointCollection(collection, activeArea));

    const boundaryData = getActiveBoundaryCollection(features, activeArea);
    (map.getSource('kopi-active-boundary') as maplibregl.GeoJSONSource | undefined)?.setData(boundaryData);
    if (boundaryData.features.length > 0) {
      startRippleAnimation();
    } else {
      stopRippleAnimation();
    }

    const targetFeatures = activeArea ? features.filter(activeArea.match) : chosenStop ? features.filter(chosenStop.match) : features;
    const points = targetFeatures.flatMap(f => positions(f.geometry));
    if (activeArea) {
      map.fitBounds([[activeArea.bounds[0], activeArea.bounds[1]], [activeArea.bounds[2], activeArea.bounds[3]]], { padding: { top: 100, bottom: 80, left: menuOpen ? 420 : 90, right: 90 }, maxZoom: 15.5, duration: 1100 });
    } else if (points.length) {
      const bounds = new LngLatBounds(points[0] as [number, number], points[0] as [number, number]);
      points.slice(1).forEach(p => bounds.extend(p as [number, number]));
      if (bounds.getNorthEast().distanceTo(bounds.getSouthWest()) < 80) map.flyTo({ center: points[0] as [number, number], zoom: 16.5, speed: 0.9, curve: 1.25 });
      else map.fitBounds(bounds, { padding: { top: 105, bottom: 90, left: menuOpen ? 420 : 90, right: 100 }, maxZoom: 16, duration: 1100 });
    }
  }, [features, menuOpen, startRippleAnimation, stopRippleAnimation, stops]);

  useEffect(() => {
    if (sourceReady.current) refreshMap(stops.find(stop => stop.id === selectedRef.current), focusAreaRef.current);
  }, [menuOpen, refreshMap, stops]);

  const loadProject = useCallback(async () => {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;
      const query = new URLSearchParams({ select: '*', id: `eq.${PROJECT_ID}`, limit: '1' });
      const response = await fetch(`${url}/rest/v1/map_projects?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Atlas could not read the KOPI SAIGON project. Check Supabase read permissions.' : `Could not load the KOPI SAIGON project (HTTP ${response.status}).`);
      const projects = await response.json() as AtlasProject[];
      if (!projects.length) throw new Error(`KOPI SAIGON project ${PROJECT_ID} was not found or is not readable.`);
      const latest = projects[0];
      if (latest.id !== PROJECT_ID) throw new Error('The KOPI SAIGON viewer received an unexpected project.');
      // Atlas is the source of truth. Compare the full row as a fallback in
      // case two saves share the same timestamp precision.
      setProject(current => current && JSON.stringify(current) === JSON.stringify(latest) ? current : latest);
      setError('');
    } catch (err) {
      setError(current => current || (err instanceof Error ? err.message : 'Could not load the KOPI SAIGON project.'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void loadProject();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadProject();
    }, 15000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadProject();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadProject]);

  useEffect(() => {
    if (!project || !mapNode.current || mapRef.current) return;
    const styleName = project.basemap || 'Midnight Blue';
    styleNameRef.current = styleName;
    const resolvedStyle = ALL_STYLES[styleName]
      || (styleName === 'Satellite' || styleName === 'Satellite 3D X-Ray' ? ALL_STYLES['Google Satellite'] : null)
      || ALL_STYLES['Midnight Blue'];
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: resolvedStyle,
      center: project.center || [120.9842, 14.5995], zoom: project.zoom || 12, pitch: project.pitch || 0, bearing: project.bearing || 0,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    let fallbackApplied = false;
    const switchToOsmFallback = () => {
      if (fallbackApplied) return;
      fallbackApplied = true;
      sourceReady.current = false;
      map.once('style.load', () => {
        addProjectLayers(map, features, selectedRef.current, focusAreaRef.current, displayModeRef.current);
        Object.entries(VIS_MAP).forEach(([key, layerIds]) => {
          const visible = project.layer_visibilities?.[key] !== false;
          layerIds.forEach(layerId => { if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none'); });
        });
        sourceReady.current = true;
        if (focusAreaRef.current && getActiveBoundaryCollection(features, focusAreaRef.current).features.length > 0) {
          startRippleAnimation();
        }
      });
      map.setStyle(FALLBACK_OSM_STYLE as any);
    };
    map.on('error', event => {
      console.error('KOPI SAIGON map error:', event.error);
      switchToOsmFallback();
    });
    map.on('load', () => {
      addProjectLayers(map, features, selectedRef.current, focusAreaRef.current, displayModeRef.current);
      Object.entries(VIS_MAP).forEach(([key, layerIds]) => {
        const visible = project.layer_visibilities?.[key] !== false;
        layerIds.forEach(layerId => { if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none'); });
      });
      applyPerspectiveLayers(map, false);
      sourceReady.current = true;
      if (focusAreaRef.current && getActiveBoundaryCollection(features, focusAreaRef.current).features.length > 0) {
        startRippleAnimation();
      }
      const coordinates = features.flatMap(feature => positions(feature.geometry));
      if (coordinates.length) {
        const bounds = new LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number]);
        coordinates.slice(1).forEach(point => bounds.extend(point as [number, number]));
        map.fitBounds(bounds, { padding: { top: 100, bottom: 90, left: menuOpen ? 390 : 90, right: 90 }, maxZoom: 15.5, duration: 0 });
      }
      map.once('idle', () => {
        const basemapLayers = ['landcover', 'landuse', 'park', 'water', 'rd_major', 'rd_secondary', 'label_city']
          .filter(layerId => map.getLayer(layerId));
        if (basemapLayers.length && map.queryRenderedFeatures({ layers: basemapLayers }).length === 0) switchToOsmFallback();
      });
    });
    const openPoiPopup = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0]; if (!f || !e.lngLat) return;
      const name = String(f.properties?.name || 'Unnamed place');
      const price = String(f.properties?.priceLabel || 'Price not available');
      const coordinates = f.geometry.type === 'Point' ? f.geometry.coordinates : [e.lngLat.lng, e.lngLat.lat];
      const mapsUrl = new URL('https://www.google.com/maps/search/');
      mapsUrl.searchParams.set('api', '1');
      mapsUrl.searchParams.set('query', `${coordinates[1]},${coordinates[0]}`);
      const card = document.createElement('div');
      card.className = 'poi-card';
      const heading = document.createElement('strong');
      heading.className = 'poi-card-name';
      heading.textContent = name;
      const priceLabel = document.createElement('span');
      priceLabel.className = 'poi-card-kicker';
      priceLabel.textContent = 'COFFEE PRICE';
      const priceValue = document.createElement('span');
      priceValue.className = 'poi-card-price';
      priceValue.textContent = price;
      const mapsLink = document.createElement('a');
      mapsLink.className = 'poi-card-link';
      mapsLink.href = mapsUrl.toString();
      mapsLink.target = '_blank';
      mapsLink.rel = 'noopener noreferrer';
      mapsLink.textContent = 'View in Google Maps ↗';
      card.append(heading, priceLabel, priceValue, mapsLink);
      new maplibregl.Popup({ closeButton: true, offset: 12, className: 'kopi-popup' }).setLngLat(e.lngLat).setDOMContent(card).addTo(map);
    };
    ['kopi-poi-dots', 'kopi-cluster-points', 'kopi-poi-heatmap'].forEach(layerId => {
      map.on('click', layerId, openPoiPopup);
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
    });
    map.on('click', 'kopi-cluster-circles', event => {
      const cluster = event.features?.[0];
      const clusterId = cluster?.properties?.cluster_id;
      const source = map.getSource('kopi-clusters') as maplibregl.GeoJSONSource | undefined;
      if (!cluster || typeof clusterId !== 'number' || !source || cluster.geometry.type !== 'Point') return;
      const center = cluster.geometry.coordinates as [number, number];
      void source.getClusterExpansionZoom(clusterId).then(zoom => map.easeTo({ center, zoom, duration: 450 }));
    });
    map.on('mouseenter', 'kopi-cluster-circles', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'kopi-cluster-circles', () => { map.getCanvas().style.cursor = ''; });
    mapRef.current = map;
    return () => {
      stopRippleAnimation();
      sourceReady.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, [project?.id, startRippleAnimation, stopRippleAnimation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!project || !map) return;
    const stop = makeStops(features).find(item => item.id === selectedRef.current);
    const updateSource = () => {
      const source = map.getSource('kopi-features') as maplibregl.GeoJSONSource | undefined;
      const collection = featureCollection(features, stop?.match, stop?.tier, focusAreaRef.current);
      source?.setData(collection);
      (map.getSource('kopi-clusters') as maplibregl.GeoJSONSource | undefined)?.setData(pointCollection(collection, focusAreaRef.current));
      const boundaryData = getActiveBoundaryCollection(features, focusAreaRef.current);
      (map.getSource('kopi-active-boundary') as maplibregl.GeoJSONSource | undefined)?.setData(boundaryData);
      if (boundaryData.features.length > 0) {
        startRippleAnimation();
      } else {
        stopRippleAnimation();
      }
    };
    const desiredStyle = project.basemap || 'Midnight Blue';
    const editorCamera = JSON.stringify([project.center, project.zoom, project.pitch, project.bearing]);
    if (map.isStyleLoaded() && editorCamera !== editorCameraRef.current) {
      editorCameraRef.current = editorCamera;
      map.easeTo({ center: project.center || [120.9842, 14.5995], zoom: project.zoom || 12, pitch: project.pitch || 0, bearing: project.bearing || 0, duration: 850 });
    }
    if (sourceReady.current && styleNameRef.current !== desiredStyle) {
      styleNameRef.current = desiredStyle;
      sourceReady.current = false;
      map.once('style.load', () => {
        addProjectLayers(map, features, selectedRef.current, focusAreaRef.current, displayModeRef.current);
        sourceReady.current = true;
        if (focusAreaRef.current && getActiveBoundaryCollection(features, focusAreaRef.current).features.length > 0) {
          startRippleAnimation();
        }
      });
      map.setStyle(
        ALL_STYLES[desiredStyle]
          || (desiredStyle === 'Satellite' || desiredStyle === 'Satellite 3D X-Ray' ? ALL_STYLES['Google Satellite'] : null)
          || ALL_STYLES['Midnight Blue']
      );
    } else updateSource();
  }, [features, project, startRippleAnimation, stopRippleAnimation]);

  const navigate = (stop?: Stop) => {
    selectedRef.current = stop?.id || 'overview';
    setSelected(stop?.id || 'overview');
    refreshMap(stop, focusAreaRef.current);
    setMenuOpen(true);
  };
  const showAllPlaces = () => {
    selectedRef.current = 'overview';
    focusAreaRef.current = null;
    setSelected('overview');
    setFocusArea(null);
    stopRippleAnimation();
    refreshMap(undefined, null);
    setMenuOpen(true);
  };
  const showAllTiers = () => {
    selectedRef.current = 'overview';
    setSelected('overview');
    refreshMap(undefined, focusAreaRef.current);
    setMenuOpen(true);
  };
  const toggleArea = (area: FocusArea) => {
    const nextArea = focusAreaRef.current?.id === area.id ? null : area;
    focusAreaRef.current = nextArea;
    setFocusArea(nextArea);
    refreshMap(stops.find(stop => stop.id === selectedRef.current), nextArea);
    setMenuOpen(true);
  };
  const chooseDisplayMode = (mode: DisplayMode) => {
    displayModeRef.current = mode;
    setDisplayMode(mode);
    if (mapRef.current) applyDisplayMode(mapRef.current, mode);
  };
  const setMapMode = (threeD: boolean) => {
    setIs3D(threeD);
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: threeD ? 60 : 0, bearing: threeD ? -15 : 0, duration: 800 });
    applyPerspectiveLayers(map, threeD);
  };
  return <main className="viewer-shell">
    <div ref={mapNode} className="map-canvas" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label="KOPI SAIGON competitor map" />
    <header className="topbar"><a className="brand" href="#overview" onClick={e => { e.preventDefault(); showAllPlaces(); }}><span className="brand-mark">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/logos/logo-brown.svg" alt="KOPI SAIGON" width={32} height={32} /></span><span><strong>KOPI SAIGON</strong><small>TIADA HARI TANPA KOPI</small></span></a><div className="top-actions"><div className="map-view-toggle" role="group" aria-label="Map perspective"><button type="button" className={`map-view-button ${!is3D ? 'active' : ''}`} aria-label="Switch to 2D map" aria-pressed={!is3D} onClick={() => setMapMode(false)}><MapIcon size={14}/><span>2D</span></button><button type="button" className={`map-view-button ${is3D ? 'active' : ''}`} aria-label="Switch to 3D map" aria-pressed={is3D} onClick={() => setMapMode(true)}><Box size={14}/><span>3D</span></button></div><button className="icon-button menu-toggle" aria-label="Toggle navigation" onClick={() => setMenuOpen(v => !v)}><MapPinned size={18}/></button></div></header>
    <aside className={`navigation ${menuOpen ? 'is-open' : 'is-closed'}`}>
      <div className="nav-heading"><div><h1 className="nav-heading-title">Competitors Landscape</h1></div><button className="icon-button nav-collapse" aria-label="Hide menu" onClick={() => setMenuOpen(false)}><ChevronLeft size={18}/></button></div>
      {loading && <div className="state-card"><LoaderCircle className="spin" size={21}/> Loading project from Atlas…</div>}
      {error && <div className="state-card state-error"><strong>Map unavailable</strong><p>{error}</p><button onClick={() => location.reload()}>Try again</button></div>}
      {project && <>
        <div className="display-section"><span className="eyebrow">MAP DISPLAY</span><div className="display-toggle" role="group" aria-label="POI map display">{([
          { id: 'pins', name: 'Pins', icon: MapPin },
          { id: 'heatmap', name: 'Heatmap', icon: Flame },
          { id: 'clusters', name: 'Clusters', icon: Network },
        ] as const).map(option => <button key={option.id} type="button" className={`display-button ${displayMode === option.id ? 'active' : ''}`} aria-pressed={displayMode === option.id} onClick={() => chooseDisplayMode(option.id)}><option.icon size={14}/><span>{option.name}</span></button>)}</div></div>
        <div className="nav-section area-section"><div className="area-heading-row"><span className="eyebrow">EXPLORE AN AREA</span><button type="button" className={`all-places-compact ${selected === 'overview' && !focusArea ? 'active' : ''}`} aria-pressed={selected === 'overview' && !focusArea} onClick={showAllPlaces}><Compass size={14}/><span>All places</span></button></div><p className="section-hint">Zoom to an area and highlight nearby cafés.</p>{focusAreas.map(area => {
          const areaCount = features.filter(feature => feature.kind === 'marker' && area.match(feature)).length;
          return <button key={area.id} className={`area-button ${focusArea?.id === area.id ? 'active' : ''}`} aria-pressed={focusArea?.id === area.id} onClick={() => toggleArea(area)}><span className="area-button-icon"><MapPinned size={16}/></span><span><b>{area.name}</b><small>{areaCount} places</small></span><span className="area-check">{focusArea?.id === area.id ? 'On' : 'View'}</span></button>;
        })}</div>
        <div className="nav-section tier-section"><div className="area-heading-row"><span className="eyebrow">FILTER BY PRICE</span><button type="button" className={`all-places-compact ${selected === 'overview' ? 'active' : ''}`} aria-pressed={selected === 'overview'} onClick={showAllTiers}><Coffee size={14}/><span>All tiers</span></button></div>{stops.map(stop => <button key={stop.id} className={`tier-button ${selected === stop.id ? 'active' : ''}`} aria-pressed={selected === stop.id} onClick={() => navigate(stop)}><span className={`tier-dot tier-${stop.id.slice(5)}`} /><span><b>{stop.title}</b><small>{stop.featureIds.length} cafés</small></span><span className="nav-count">{stop.featureIds.length}</span></button>)}<button className="open-table-button" onClick={() => setTableOpen(true)}><Table2 size={16}/><span>Open price table</span><ChevronRight size={15}/></button></div>
      </>}
    </aside>
    {!menuOpen && project && <button className="reopen-nav" onClick={() => setMenuOpen(true)}><MapPinned size={16}/> Explore map <ChevronRight size={16}/></button>}
    <dialog ref={tableDialogRef} className="poi-table-dialog" aria-labelledby="poi-table-title" onClose={() => setTableOpen(false)}>
      <div className="table-dialog-shell">
        <div className="table-dialog-header"><div><span className="eyebrow">KOPI SAIGON · TIADA HARI TANPA KOPI</span><h2 id="poi-table-title">Places by coffee price tier</h2><p>{tableCount.toLocaleString()} cafés grouped by High, Mid, and Low tier</p></div><button className="table-close-button" onClick={() => setTableOpen(false)} aria-label="Close places table"><X size={18}/></button></div>
        <div className="table-tier-tabs" role="tablist" aria-label="Filter places by price tier"><button id="tab-all" type="button" role="tab" aria-selected={tableTier === 'all'} aria-controls="tier-table-panel" className={`table-tier-tab ${tableTier === 'all' ? 'active' : ''}`} onClick={() => setTableTier('all')}><Coffee size={14}/><span>All tiers</span><small>{tableCount}</small></button>{tierGroups.map(({ stop, places }) => <button key={stop.id} id={`tab-${stop.tier}`} type="button" role="tab" aria-selected={tableTier === stop.tier} aria-controls="tier-table-panel" className={`table-tier-tab ${tableTier === stop.tier ? 'active' : ''} tier-${stop.tier}`} onClick={() => setTableTier(stop.tier)}><span className={`tier-dot tier-${stop.id.slice(5)}`}/><span>{stop.title}</span><small>{places.length}</small></button>)}</div>
        <div className="table-dialog-body" id="tier-table-panel" role="tabpanel" aria-labelledby={`tab-${tableTier}`}>{tierGroups.filter(group => tableTier === 'all' || group.stop.tier === tableTier).map(({ stop, places }) => <section key={stop.id} className="table-tier-section" aria-label={`${stop.title}: ${places.length} places`}>
          <div className="table-tier-heading"><span className={`tier-dot tier-${stop.id.slice(5)}`}/><h3>{stop.title}</h3><span>{places.length.toLocaleString()} places</span></div>
          <div className="table-scroll"><table className="poi-table"><thead><tr><th scope="col">Name</th><th scope="col">Tier</th><th scope="col">Price range · PHP</th><th scope="col">Price range · MYR</th><th scope="col">Location · Google Maps</th></tr></thead><tbody>{places.map(feature => {
            const { php, myr } = getPriceRanges(feature);
            return <tr key={feature.id}><td className="table-place-name">{feature.name || 'Unnamed place'}</td><td><span className={`table-tier-chip tier-${stop.id.slice(5)}`}>{stop.title}</span></td><td>{php || '—'}</td><td>{myr || '—'}</td><td><a className="table-location-link" href={getGoogleMapsUrl(feature)} target="_blank" rel="noopener noreferrer"><span>{getLocationLabel(feature)}</span><ExternalLink size={14}/></a></td></tr>;
          })}</tbody></table></div>
        </section>)}</div>
      </div>
    </dialog>
  </main>;
}
