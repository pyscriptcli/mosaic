import type { GISFeature } from '../types/gis';

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; id?: string | number; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }>;
  [key: string]: unknown;
};

const supportedGeometryKinds: Record<string, GISFeature['kind']> = {
  Point: 'marker',
  LineString: 'polyline',
  MultiLineString: 'polyline',
  Polygon: 'polygon',
  MultiPolygon: 'polygon',
};

export function validateFeatureCollection(value: unknown, maxBytes = 450_000): value is GeoJsonFeatureCollection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const collection = value as Record<string, unknown>;
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) || collection.features.length > 10_000) return false;
  try {
    if (new TextEncoder().encode(JSON.stringify(collection)).length > maxBytes) return false;
  } catch { return false; }
  const ids = new Set<string>();
  return collection.features.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const feature = item as Record<string, unknown>;
    const geometry = feature.geometry as Record<string, unknown> | null;
    if (feature.id !== undefined) {
      if ((typeof feature.id !== 'string' && typeof feature.id !== 'number') || (typeof feature.id === 'string' && (!feature.id || feature.id.length > 256)) || (typeof feature.id === 'number' && !Number.isSafeInteger(feature.id))) return false;
      const id = String(feature.id);
      if (ids.has(id)) return false;
      ids.add(id);
    }
    return feature.type === 'Feature' && Boolean(geometry) && typeof geometry?.type === 'string'
      && geometry.type in supportedGeometryKinds && validCoordinates(geometry.coordinates)
      && (feature.properties == null || (typeof feature.properties === 'object' && !Array.isArray(feature.properties)));
  });
}

function validCoordinates(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!Array.isArray(value) || value.length === 0) return false;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
  }
  return value.every((part) => validCoordinates(part, depth + 1));
}

export function importFeatureCollection(collection: GeoJsonFeatureCollection): { features: GISFeature[]; metadata: Record<string, unknown> } {
  let generatedId = 0;
  const usedIds = new Set<number>();
  const features = collection.features.flatMap((feature) => {
    const geometry = feature.geometry;
    const kind = supportedGeometryKinds[geometry.type];
    if (!kind) return [];
    let id = typeof feature.id === 'number' && Number.isSafeInteger(feature.id) && feature.id > 0 ? feature.id : 0;
    if (!id || usedIds.has(id)) {
      while (usedIds.has(++generatedId)) { /* find a free reversible internal id */ }
      id = generatedId;
    }
    usedIds.add(id);
    const hostProperties = (feature.properties || {}) as Record<string, unknown>;
    const name = String(hostProperties.name || `${kind} ${id}`);
    const savedProps = hostProperties._atlasEditorProps && typeof hostProperties._atlasEditorProps === 'object'
      ? hostProperties._atlasEditorProps as Record<string, unknown> : {};
    return [{
      id,
      name,
      kind: (hostProperties.kind && ['marker', 'textbox', 'polyline', 'polygon', 'rectangle', 'circle', 'route', 'polygon3d'].includes(String(hostProperties.kind)) ? hostProperties.kind : kind) as GISFeature['kind'],
      geometry: geometry as unknown as GISFeature['geometry'],
      props: {
        ...savedProps,
        color: String(hostProperties.color || savedProps.color || (kind === 'marker' ? '#1e40af' : '#e8b84a')),
        borderColor: String(hostProperties.borderColor || savedProps.borderColor || hostProperties.color || '#e8b84a'),
        fillColor: String(hostProperties.fillColor || savedProps.fillColor || hostProperties.color || '#e8b84a'),
        fillOpacity: Number(hostProperties.fillOpacity ?? savedProps.fillOpacity ?? 0.35),
        width: Number(hostProperties.width ?? savedProps.width ?? 3),
        visible: hostProperties.visible === false || savedProps.visible === 0 ? 0 : 1,
        shape: String(hostProperties.shape || savedProps.shape || 'pin') as GISFeature['props']['shape'],
        text: String(hostProperties.text || savedProps.text || name),
        waypoints: Array.isArray(hostProperties.waypoints) ? hostProperties.waypoints as [number, number][] : savedProps.waypoints as [number, number][] | undefined,
        routeMode: String(hostProperties.routeMode || savedProps.routeMode || 'driving') as GISFeature['props']['routeMode'],
        atlasHostId: feature.id ?? `generated-${id}`,
        atlasHostProperties: hostProperties,
      } as GISFeature['props'],
    }];
  });
  const { type: _type, features: _features, ...metadata } = collection;
  return { features, metadata };
}

export function exportFeatureCollection(features: GISFeature[], metadata: Record<string, unknown>): GeoJsonFeatureCollection {
  return {
    ...metadata,
    type: 'FeatureCollection',
    features: features.map((feature) => {
      const featureProps = feature.props as GISFeature['props'] & Record<string, unknown>;
      const hostProperties = (featureProps.atlasHostProperties || {}) as Record<string, unknown>;
      const { atlasHostProperties: _hostProperties, atlasHostId, ...editorProps } = featureProps;
      const properties = {
        ...hostProperties,
        name: feature.name,
        kind: feature.kind,
        color: feature.props.color,
        borderColor: feature.props.borderColor,
        fillColor: feature.props.fillColor,
        fillOpacity: feature.props.fillOpacity,
        width: feature.props.width,
        visible: feature.props.visible !== 0,
        shape: feature.props.shape,
        text: feature.props.text,
        waypoints: feature.props.waypoints,
        routeMode: feature.props.routeMode,
        _atlasEditorProps: editorProps,
      };
      return {
        type: 'Feature' as const,
        id: (atlasHostId ?? feature.id) as string | number,
        geometry: feature.geometry as unknown as { type: string; coordinates: unknown },
        properties,
      };
    }),
  };
}
