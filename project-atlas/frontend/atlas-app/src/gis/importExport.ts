import { GISFeature } from '../types/gis';

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
      normalized.push({
        id,
        name: props.name || `Marker ${id}`,
        kind: 'marker',
        geometry: geom,
        props: {
          shape: 'pin',
          color: props.color || '#1e40af',
          iconSize: 0.9,
          visible: 1,
          osmTags: props,
          attributes: { name: props.name || `Marker ${id}` },
        },
      });
    } else if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
      const isRoute = !!(props.route_mode || props.routeMode);
      normalized.push({
        id,
        name: props.name || (isRoute ? `Route ${id}` : `Polyline ${id}`),
        kind: isRoute ? 'route' : 'polyline',
        geometry: geom,
        props: {
          color: props.color || '#38bdf8',
          borderColor: props.color || '#38bdf8',
          width: 4,
          borderOpacity: 0.9,
          visible: 1,
          routeMode: props.route_mode || props.routeMode || 'driving',
          waypoints: geom.coordinates,
          attributes: { name: props.name || `Line ${id}` },
        },
      });
    } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      normalized.push({
        id,
        name: props.name || `Polygon ${id}`,
        kind: 'polygon',
        geometry: geom,
        props: {
          color: props.color || '#e8b84a',
          borderColor: props.borderColor || props.color || '#e8b84a',
          borderOpacity: 0.9,
          width: 3,
          fillColor: props.fillColor || '#e8b84a',
          fillOpacity: 0.35,
          visible: 1,
          attributes: { name: props.name || `Polygon ${id}` },
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
