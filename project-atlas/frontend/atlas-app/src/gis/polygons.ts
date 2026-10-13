import { GISFeature } from '../types/gis';

/**
 * Computes the 5-point closed coordinate ring for a rectangle from 2 opposite corners
 */
export function rectCoords(a: [number, number], b: [number, number]): [number, number][][] {
  return [
    [
      [a[0], a[1]],
      [a[0], b[1]],
      [b[0], b[1]],
      [b[0], a[1]],
      [a[0], a[1]],
    ],
  ];
}

/**
 * Fast ray-casting algorithm to test whether a point [lon, lat] is inside a polygon ring
 */
export function pointInPolygon(point: [number, number], vs: [number, number][]): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0];
    const yi = vs[i][1];
    const xj = vs[j][0];
    const yj = vs[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculates [[minLon, minLat], [maxLon, maxLat]] bounds for any GIS feature
 */
export function calcBounds(f: GISFeature): [[number, number], [number, number]] | null {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, ok = false;

  const walk = (c: any) => {
    if (typeof c[0] === 'number') {
      ok = true;
      minX = Math.min(minX, c[0]);
      maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]);
      maxY = Math.max(maxY, c[1]);
    } else {
      c.forEach(walk);
    }
  };

  if (!f.geometry || !f.geometry.coordinates) return null;
  walk(f.geometry.coordinates);

  if (!ok) return null;
  if (minX === maxX && minY === maxY) {
    return [
      [minX - 0.005, minY - 0.005],
      [maxX + 0.005, maxY + 0.005],
    ];
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

/**
 * Rotates geometry coordinates around a center point by an angle in radians
 */
export function rotateGeometry(f: GISFeature, angleRad: number, center: [number, number]): void {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const rotPt = (pt: [number, number]): [number, number] => {
    const dx = pt[0] - center[0];
    const dy = pt[1] - center[1];
    return [center[0] + dx * cosA - dy * sinA, center[1] + dx * sinA + dy * cosA];
  };

  if (f.geometry.type === 'Point') {
    f.props.rotation = (((f.props.rotation || 0) + (angleRad * 180) / Math.PI) % 360);
  } else if (f.geometry.type === 'LineString') {
    f.geometry.coordinates = (f.geometry.coordinates as [number, number][]).map(rotPt);
    if (f.props.waypoints) {
      f.props.waypoints = f.props.waypoints.map(rotPt);
    }
  } else if (f.geometry.type === 'Polygon') {
    f.geometry.coordinates = (f.geometry.coordinates as [number, number][][]).map((ring) =>
      ring.map(rotPt)
    );
  } else if (f.geometry.type === 'MultiPolygon') {
    f.geometry.coordinates = (f.geometry.coordinates as [number, number][][][]).map((poly) =>
      poly.map((ring) => ring.map(rotPt))
    );
  }
}

/**
 * Translates coordinates recursively by delta [dx, dy]
 */
export function translateCoordinates(coords: any, dx: number, dy: number): any {
  if (typeof coords[0] === 'number') {
    return [coords[0] + dx, coords[1] + dy];
  }
  return coords.map((c: any) => translateCoordinates(c, dx, dy));
}

/**
 * Helper to construct a standard 3D Polygon / Extrusion feature
 */
export function create3DPolygonFeature(
  id: number,
  coordinates: [number, number][][],
  height: number = 35,
  baseHeight: number = 0,
  customProps: Partial<GISFeature['props']> = {}
): GISFeature {
  return {
    id,
    name: `3D Building ${id}`,
    kind: 'polygon3d',
    geometry: { type: 'Polygon', coordinates },
    props: {
      is3D: true,
      height,
      baseHeight,
      color: '#38bdf8',
      fillColor: '#38bdf8',
      fillOpacity: 0.85,
      borderColor: '#38bdf8',
      width: 2,
      visible: 1,
      attributes: {
        name: `3D Building ${id}`,
        height: `${height}m`,
      },
      ...customProps,
    },
  };
}

