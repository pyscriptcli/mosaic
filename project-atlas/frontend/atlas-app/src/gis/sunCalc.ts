/**
 * Solar position and lighting calculations for 3D Digital Twin simulation
 */

export interface SolarLightingState {
  time: number; // 0 to 24 (decimal hours e.g. 17.25 = 17:15)
  azimuthDeg: number; // 0 to 360 degrees (0 = North, 90 = East, 180 = South, 270 = West)
  altitudeDeg: number; // -90 to 90 degrees above horizon
  lightPosition: [number, number, number]; // [radial_distance, azimuthal_angle, polar_angle] for MapLibre
  lightColor: string;
  lightIntensity: number;
  fogColor: string;
  fogHighColor: string;
  fogHorizonBlend: number;
}

/**
 * Approximate solar position and lighting based on time of day (0-24h)
 * and latitude/longitude.
 */
export function calculateSolarLighting(
  time: number,
  lat = 14.5995,
  _lon = 120.9842
): SolarLightingState {
  // Normalize time to 0-24 range
  const normTime = ((time % 24) + 24) % 24;

  // Sun path approximation:
  // Sunrise ~ 06:00 (East, azimuth 90°), Noon ~ 12:00 (South, azimuth 180°), Sunset ~ 18:00 (West, azimuth 270°)
  const hourAngle = (normTime - 12) * 15; // -90° at 6am, 0° at noon, +90° at 6pm

  // Solar altitude (elevation above horizon)
  // At noon: max altitude ~ 90° - abs(lat - 15°)
  const maxAltitude = 90 - Math.abs(lat - 14.6);
  // Base altitude curve on cosine of hour angle
  const radHour = (hourAngle * Math.PI) / 180;
  const altitudeDeg = Math.max(-25, Math.min(88, maxAltitude * Math.cos(radHour)));

  // Solar azimuth (compass bearing)
  // East (90°) in morning -> South (180°) -> West (270°) in evening
  let azimuthDeg = 180 + hourAngle * 1.15;
  if (azimuthDeg < 0) azimuthDeg += 360;
  if (azimuthDeg >= 360) azimuthDeg -= 360;

  // MapLibre setLight position: [r, azimuth, polar_angle]
  // polar_angle is 0 at zenith, 90 at horizon, >90 below horizon
  const polarAngle = Math.max(5, Math.min(105, 90 - altitudeDeg));
  const lightPosition: [number, number, number] = [1.5, azimuthDeg, polarAngle];

  // Dynamic light color & atmospheric fog based on time and altitude
  let lightColor = '#ffffff';
  let lightIntensity = 0.5;
  let fogColor = '#080c14';
  let fogHighColor = '#162238';
  let fogHorizonBlend = 0.2;

  if (normTime >= 5.5 && normTime < 7.5) {
    // Dawn / Sunrise: Soft coral-rose to warm amber
    const progress = (normTime - 5.5) / 2.0;
    lightColor = progress > 0.5 ? '#ffb366' : '#ff7e67';
    lightIntensity = 0.35 + progress * 0.25;
    fogColor = '#1f1325';
    fogHighColor = '#4a2538';
    fogHorizonBlend = 0.35;
  } else if (normTime >= 7.5 && normTime < 11.0) {
    // Morning: Warm crisp sunlight
    lightColor = '#fff5e6';
    lightIntensity = 0.65;
    fogColor = '#101726';
    fogHighColor = '#1b2d4b';
    fogHorizonBlend = 0.25;
  } else if (normTime >= 11.0 && normTime < 14.5) {
    // Solar Noon: High overhead crisp neutral white
    lightColor = '#ffffff';
    lightIntensity = 0.8;
    fogColor = '#0c1424';
    fogHighColor = '#1e3256';
    fogHorizonBlend = 0.2;
  } else if (normTime >= 14.5 && normTime < 16.75) {
    // Afternoon: Soft golden transition
    lightColor = '#fff2d6';
    lightIntensity = 0.7;
    fogColor = '#121828';
    fogHighColor = '#243450';
    fogHorizonBlend = 0.22;
  } else if (normTime >= 16.75 && normTime < 18.25) {
    // Golden Hour: Deep radiant amber gold, dramatic long shadows
    lightColor = '#ffaa33';
    lightIntensity = 0.6;
    fogColor = '#281710';
    fogHighColor = '#5c2d1b';
    fogHorizonBlend = 0.4;
  } else if (normTime >= 18.25 && normTime < 19.5) {
    // Dusk / Blue Hour: Twilight violet to deep indigo
    lightColor = '#a880ff';
    lightIntensity = 0.3;
    fogColor = '#150f24';
    fogHighColor = '#2a1a4a';
    fogHorizonBlend = 0.3;
  } else {
    // Night / Midnight Cyberpunk: Moonlit cool blue ambient wash
    lightColor = '#5c78a3';
    lightIntensity = 0.2;
    fogColor = '#04070d';
    fogHighColor = '#0c1424';
    fogHorizonBlend = 0.15;
  }

  return {
    time: normTime,
    azimuthDeg,
    altitudeDeg,
    lightPosition,
    lightColor,
    lightIntensity,
    fogColor,
    fogHighColor,
    fogHorizonBlend,
  };
}

/**
 * Format decimal hours (e.g. 17.5) into clean display string "5:30 PM"
 */
export function formatSolarTime(decimalHours: number): string {
  const norm = ((decimalHours % 24) + 24) % 24;
  const hours = Math.floor(norm);
  const minutes = Math.floor((norm - hours) * 60);

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMins = minutes.toString().padStart(2, '0');

  return `${displayHours}:${displayMins} ${period}`;
}
