import { GISFeature } from '../types/gis';

const STYLE_PROPERTIES = new Set([
  'fillColor', 'fillOpacity', 'borderColor', 'borderOpacity', 'color', 'width', 'visible',
  'styleUrl', 'kmlLineColor', 'kmlPolyColor',
]);

function importedAttributes(properties: Record<string, unknown>, name: string): Record<string, string> {
  const nested = properties.attributes && typeof properties.attributes === 'object'
    ? properties.attributes as Record<string, unknown>
    : {};
  const attributes: Record<string, string> = {};

  for (const [key, value] of Object.entries({ ...properties, ...nested })) {
    if (STYLE_PROPERTIES.has(key) || value == null || typeof value === 'object') continue;
    attributes[key] = String(value);
  }

  attributes.name = name;
  return attributes;
}

function numericProperty(value: unknown, fallback: number, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

/**
 * Normalizes GeoJSON FeatureCollection into standard Project Atlas GISFeature items
 */
export function normalizeGeoJSON(geojson: any, nextFidStart: number): GISFeature[] {
  const feats = geojson.features || [];
  let curId = nextFidStart;

  const normalized: GISFeature[] = [];

  feats.forEach((f: any) => {
    if (!f.geometry) return;
    const geom = f.geometry;
    const props = f.properties || {};
    const id = ++curId;

    if (geom.type === 'Point') {
      const name = props.siteName || props.name || `Marker ${id}`;
      normalized.push({
        id,
        name,
        kind: 'marker',
        geometry: geom,
        props: {
          shape: 'pin',
          color: props.color || '#1e40af',
          iconSize: 0.9,
          visible: 1,
          osmTags: props,
          attributes: importedAttributes(props, name),
        },
      });
    } else if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
      const isRoute = !!(props.route_mode || props.routeMode);
      const name = props.siteName || props.name || `${isRoute ? 'Route' : 'Line'} ${id}`;
      normalized.push({
        id,
        name,
        kind: isRoute ? 'route' : 'polyline',
        geometry: geom,
        props: {
          color: props.color || '#38bdf8',
          borderColor: props.color || '#38bdf8',
          width: numericProperty(props.width, 4, 0.1),
          borderOpacity: numericProperty(props.borderOpacity, 0.9, 0, 1),
          visible: 1,
          routeMode: props.route_mode || props.routeMode || 'driving',
          waypoints: geom.coordinates,
          attributes: importedAttributes(props, name),
        },
      });
    } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      const name = props.siteName || props.name || `Polygon ${id}`;
      normalized.push({
        id,
        name,
        kind: 'polygon',
        geometry: geom,
        props: {
          color: props.color || '#e8b84a',
          borderColor: props.borderColor || props.color || '#e8b84a',
          borderOpacity: numericProperty(props.borderOpacity, 0.9, 0, 1),
          width: numericProperty(props.width, 3, 0.1),
          fillColor: props.fillColor || '#e8b84a',
          fillOpacity: numericProperty(props.fillOpacity, 0.35, 0, 1),
          visible: 1,
          attributes: importedAttributes(props, name),
        },
      });
    }
  });

  return normalized;
}

/**
 * Directly exports MapLibre canvas buffer to PNG
 */
export function exportMapToPNG(map: any, projectName: string) {
  map.once('render', () => {
    try {
      const srcCanvas = map.getCanvas();
      const a = document.createElement('a');
      const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${safeName}_${Date.now()}.png`;
      a.href = srcCanvas.toDataURL('image/png', 0.98);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Export failed:', e);
    }
  });
  map.triggerRepaint();
}
