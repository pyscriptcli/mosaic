/**
 * Calculates geodesic distance between two points [lon, lat] in meters
 */
export function haversineDist(a: [number, number], b: [number, number]): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Creates 64-point geodesic polygon ring and returns coordinates & radius
 */
export function circleCoords(
  c: [number, number],
  edge: [number, number]
): { coords: [number, number][][]; r: number } {
  const r = haversineDist(c, edge);
  return {
    coords: circleCoordsFromRadius(c, r),
    r,
  };
}

/**
 * Creates 64-point geodesic polygon ring from explicit center [lon, lat] and radius in meters
 */
export function circleCoordsFromRadius(
  c: [number, number],
  radiusMeters: number
): [number, number][][] {
  const coords: [number, number][] = [];
  const cosLat = Math.cos((c[1] * Math.PI) / 180);

  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    coords.push([
      c[0] + (radiusMeters / (111320 * cosLat)) * Math.cos(a),
      c[1] + (radiusMeters / 111320) * Math.sin(a),
    ]);
  }
  return [coords];
}

/**
 * Pretty prints distance (meters / kilometers)
 */
export function formatDistance(meters: number): string {
  if (meters > 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}
