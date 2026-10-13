import { haversineDist } from './circles';

export interface RouteResult {
  geometry: any;
  distance: number;
  duration: number;
  description: string;
  routingFailed: boolean;
}

/**
 * Robust multi-point route calculation using OSRM with straight-line fallback
 */
export async function fetchMultiPointRoute(
  waypoints: [number, number][],
  mode: 'driving' | 'walking' | 'cycling' = 'driving'
): Promise<RouteResult> {
  const coordStr = waypoints.map((p) => `${p[0]},${p[1]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/${mode}/${coordStr}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();

    if (data.routes && data.routes[0]) {
      const route = data.routes[0];
      const dist = route.distance;
      const dur = route.duration;
      const distStr = dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;
      const durStr = dur > 3600 ? `${(dur / 3600).toFixed(1)} hr` : `${Math.round(dur / 60)} min`;
      const desc = `${distStr} · ${durStr}`;

      return {
        geometry: route.geometry,
        distance: dist,
        duration: dur,
        description: desc,
        routingFailed: false,
      };
    } else {
      throw new Error('No route returned by OSRM');
    }
  } catch (err) {
    console.warn('OSRM routing failed, falling back to straight-line:', err);
    return {
      geometry: { type: 'LineString', coordinates: waypoints },
      distance: 0,
      duration: 0,
      description: 'Routing unavailable – straight line shown',
      routingFailed: true,
    };
  }
}

/**
 * Finds the nearest line segment and inserts a new waypoint
 */
export function insertWaypoint(
  waypoints: [number, number][],
  point: [number, number]
): [number, number][] {
  if (waypoints.length < 2) return [...waypoints, point];

  let bestIdx = -1;
  let bestDist = 1e12;
  const newWaypoints = [...waypoints];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = haversineDist(waypoints[i], point) + haversineDist(point, waypoints[i + 1]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i + 1;
    }
  }

  if (bestIdx !== -1) {
    newWaypoints.splice(bestIdx, 0, point);
  } else {
    newWaypoints.push(point);
  }
  return newWaypoints;
}

/** Return the route segment between selected waypoints in the requested direction. */
export function getRouteSegment(
  routeCoordinates: [number, number][],
  waypoints: [number, number][],
  startWaypointIndex = 0,
  endWaypointIndex = waypoints.length - 1
): [number, number][] {
  if (routeCoordinates.length < 2 || waypoints.length < 2) return routeCoordinates;

  const clampIndex = (index: number) => Math.max(0, Math.min(waypoints.length - 1, Math.round(index)));
  const startWaypoint = waypoints[clampIndex(startWaypointIndex)];
  const endWaypoint = waypoints[clampIndex(endWaypointIndex)];
  const nearestIndex = (point: [number, number]) => {
    let index = 0;
    let distance = Infinity;
    routeCoordinates.forEach((coordinate, candidate) => {
      const candidateDistance = haversineDist(coordinate, point);
      if (candidateDistance < distance) {
        distance = candidateDistance;
        index = candidate;
      }
    });
    return index;
  };

  const start = nearestIndex(startWaypoint);
  const end = nearestIndex(endWaypoint);
  if (start === end) return [routeCoordinates[start], routeCoordinates[start]];
  const segment = start < end
    ? routeCoordinates.slice(start, end + 1)
    : routeCoordinates.slice(end, start + 1).reverse();
  return segment;
}

export function getRouteBearing(from: [number, number], to: [number, number]): number {
  const radians = Math.PI / 180;
  const lat1 = from[1] * radians;
  const lat2 = to[1] * radians;
  const deltaLng = (to[0] - from[0]) * radians;
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (Math.atan2(y, x) / radians + 360) % 360;
}
