import { BuildingArchetype, FacadeTheme, FeatureProps, GISFeature, RoofType } from '../types/gis';

export interface ArchetypeConfig {
  id: BuildingArchetype;
  label: string;
  tagline: string;
  icon: string;
  defaultFloors: number;
  floorHeight: number; // meters
  facadeTheme: FacadeTheme;
  roofType: RoofType;
  hasPodium: boolean;
  podiumFloors: number;
  baseWidth: number; // meters
  baseDepth: number; // meters
}

export const ARCHETYPE_CONFIGS: Record<BuildingArchetype, ArchetypeConfig> = {
  skyscraper: {
    id: 'skyscraper',
    label: 'Modern Glass Skyscraper',
    tagline: 'Multi-tier tower with podium base, glass curtain facade, and crown spire',
    icon: 'Building2',
    defaultFloors: 36,
    floorHeight: 3.5,
    facadeTheme: 'glass',
    roofType: 'spire',
    hasPodium: true,
    podiumFloors: 3,
    baseWidth: 55,
    baseDepth: 55,
  },
  commercial: {
    id: 'commercial',
    label: 'Commercial Plaza & Mall',
    tagline: 'Wide multi-level shopping & business complex with atrium',
    icon: 'Store',
    defaultFloors: 5,
    floorHeight: 4.5,
    facadeTheme: 'steel',
    roofType: 'penthouse',
    hasPodium: true,
    podiumFloors: 2,
    baseWidth: 70,
    baseDepth: 50,
  },
  residential: {
    id: 'residential',
    label: 'Residential High-Rise',
    tagline: 'Urban apartment tower with entrance lobby and rooftop penthouse',
    icon: 'Building',
    defaultFloors: 18,
    floorHeight: 3.2,
    facadeTheme: 'brick',
    roofType: 'penthouse',
    hasPodium: true,
    podiumFloors: 1,
    baseWidth: 40,
    baseDepth: 40,
  },
  hospital: {
    id: 'hospital',
    label: 'Medical Center & Helipad',
    tagline: 'Emergency medical pavilion equipped with active rooftop helipad deck',
    icon: 'Cross',
    defaultFloors: 9,
    floorHeight: 4.0,
    facadeTheme: 'marble',
    roofType: 'helipad',
    hasPodium: true,
    podiumFloors: 2,
    baseWidth: 60,
    baseDepth: 45,
  },
  warehouse: {
    id: 'warehouse',
    label: 'Logistics Distribution Hub',
    tagline: 'Wide-span single-level storage & industrial fulfillment center',
    icon: 'Warehouse',
    defaultFloors: 1,
    floorHeight: 12.0,
    facadeTheme: 'concrete',
    roofType: 'flat',
    hasPodium: false,
    podiumFloors: 0,
    baseWidth: 80,
    baseDepth: 60,
  },
  civic: {
    id: 'civic',
    label: 'Civic Monument & Landmark',
    tagline: 'Colonnaded stone hall with central stepped crown',
    icon: 'Landmark',
    defaultFloors: 4,
    floorHeight: 5.0,
    facadeTheme: 'marble',
    roofType: 'spire',
    hasPodium: true,
    podiumFloors: 1,
    baseWidth: 50,
    baseDepth: 50,
  },
  villa: {
    id: 'villa',
    label: 'Suburban Villa / Townhouse',
    tagline: 'Two-story residential residence with sloped roof geometry',
    icon: 'Home',
    defaultFloors: 2,
    floorHeight: 3.5,
    facadeTheme: 'brick',
    roofType: 'gable',
    hasPodium: false,
    podiumFloors: 0,
    baseWidth: 22,
    baseDepth: 18,
  },
  custom: {
    id: 'custom',
    label: 'Custom Architectural Building',
    tagline: 'Freely configurable architectural building parameters',
    icon: 'Box',
    defaultFloors: 10,
    floorHeight: 3.5,
    facadeTheme: 'glass',
    roofType: 'flat',
    hasPodium: false,
    podiumFloors: 0,
    baseWidth: 35,
    baseDepth: 35,
  },
};

export interface ThemeColors {
  wall: string;
  roof: string;
  border: string;
  opacity: number;
}

export const FACADE_PALETTES: Record<FacadeTheme, ThemeColors> = {
  glass: {
    wall: '#38bdf8',
    roof: '#0369a1',
    border: '#7dd3fc',
    opacity: 0.88,
  },
  steel: {
    wall: '#64748b',
    roof: '#1e293b',
    border: '#94a3b8',
    opacity: 0.92,
  },
  concrete: {
    wall: '#94a3b8',
    roof: '#334155',
    border: '#cbd5e1',
    opacity: 0.95,
  },
  brick: {
    wall: '#b45309',
    roof: '#78350f',
    border: '#f59e0b',
    opacity: 0.92,
  },
  marble: {
    wall: '#f8fafc',
    roof: '#cbd5e1',
    border: '#ffffff',
    opacity: 0.95,
  },
  neon: {
    wall: '#06b6d4',
    roof: '#083344',
    border: '#22d3ee',
    opacity: 0.90,
  },
};

/**
 * Generate a rectangular closed ring centered at [lng, lat]
 */
export function generateBuildingBox(
  center: [number, number],
  widthMeters: number,
  depthMeters: number
): [number, number][] {
  const [lng, lat] = center;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);

  const dLng = (widthMeters / 2) / metersPerDegLng;
  const dLat = (depthMeters / 2) / metersPerDegLat;

  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ];
}

/**
 * Inset a closed ring towards its centroid by a scale factor (e.g. 0.75)
 */
export function createInsetRing(
  ring: [number, number][],
  scaleFactor: number
): [number, number][] {
  if (!ring || ring.length < 4) return ring;

  // Calculate centroid
  let cx = 0;
  let cy = 0;
  const count = ring.length - 1;
  for (let i = 0; i < count; i++) {
    cx += ring[i][0];
    cy += ring[i][1];
  }
  cx /= count;
  cy /= count;

  const inset = ring.map(([x, y]) => [
    cx + (x - cx) * scaleFactor,
    cy + (y - cy) * scaleFactor,
  ] as [number, number]);

  // Ensure closed
  inset[inset.length - 1] = [...inset[0]];
  return inset;
}

/**
 * Create a full compound architectural building with all tiers (Podium, Tower, Crown/Helipad)
 */
export function generateCompoundBuildingFeatures(
  startId: number,
  name: string,
  archetype: BuildingArchetype,
  center: [number, number],
  customOptions?: Partial<FeatureProps>,
  customFootprint?: [number, number][]
): GISFeature[] {
  const cfg = ARCHETYPE_CONFIGS[archetype] || ARCHETYPE_CONFIGS.skyscraper;
  const theme = customOptions?.facadeTheme || cfg.facadeTheme;
  const colors = FACADE_PALETTES[theme] || FACADE_PALETTES.glass;

  const floors = customOptions?.floors ?? cfg.defaultFloors;
  const floorHeight = customOptions?.floorHeight ?? cfg.floorHeight;
  const totalHeight = Math.max(floors * floorHeight, 6);

  const hasPodium = customOptions?.hasPodium ?? cfg.hasPodium;
  const podiumFloors = customOptions?.podiumFloors ?? cfg.podiumFloors;
  const podiumHeight = hasPodium ? Math.min(podiumFloors * floorHeight, totalHeight * 0.4) : 0;

  const roofType = customOptions?.roofType ?? cfg.roofType;
  const hasHelipad = roofType === 'helipad';
  const hasSpire = roofType === 'spire';

  // Base footprint
  const baseRing = customFootprint || generateBuildingBox(center, cfg.baseWidth, cfg.baseDepth);
  const features: GISFeature[] = [];

  let currentId = startId;
  const parentId = startId;

  if (hasPodium && podiumHeight > 0 && totalHeight > podiumHeight) {
    // Tier 1: Podium Base
    features.push({
      id: currentId++,
      name: `${name} (Podium)`,
      kind: 'polygon3d',
      geometry: { type: 'Polygon', coordinates: [baseRing] },
      props: {
        is3D: true,
        height: podiumHeight,
        baseHeight: 0,
        buildingArchetype: archetype,
        facadeTheme: theme,
        tierRole: 'podium',
        parentBuildingId: parentId,
        color: colors.roof,
        fillColor: colors.roof,
        borderColor: colors.border,
        width: 2,
        fillOpacity: colors.opacity,
        borderOpacity: 0.95,
        visible: 1,
        attributes: {
          name: `${name} (Podium)`,
          archetype: cfg.label,
          tier: 'Ground Podium',
          height: `${podiumHeight.toFixed(1)}m`,
        },
      },
    });

    // Tier 2: Tower Shaft (inset setback)
    const towerRing = createInsetRing(baseRing, 0.78);
    features.push({
      id: currentId++,
      name: `${name} (Tower)`,
      kind: 'polygon3d',
      geometry: { type: 'Polygon', coordinates: [towerRing] },
      props: {
        is3D: true,
        height: totalHeight,
        baseHeight: podiumHeight,
        buildingArchetype: archetype,
        facadeTheme: theme,
        roofType,
        floors,
        floorHeight,
        hasPodium,
        podiumFloors,
        hasHelipad,
        hasSpire,
        tierRole: 'tower',
        parentBuildingId: parentId,
        color: colors.wall,
        fillColor: colors.wall,
        borderColor: colors.border,
        width: 2,
        fillOpacity: colors.opacity,
        borderOpacity: 0.95,
        visible: 1,
        attributes: {
          name,
          archetype: cfg.label,
          floors: `${floors} Floors`,
          height: `${totalHeight.toFixed(1)}m`,
          facade: theme,
          roof: roofType,
        },
      },
    });

    // Optional Tier 3: Rooftop Penthouse / Crown
    if (roofType === 'penthouse' || roofType === 'spire') {
      const crownHeight = totalHeight + (roofType === 'spire' ? 18 : 6);
      const crownRing = createInsetRing(towerRing, 0.55);
      features.push({
        id: currentId++,
        name: `${name} (Crown)`,
        kind: 'polygon3d',
        geometry: { type: 'Polygon', coordinates: [crownRing] },
        props: {
          is3D: true,
          height: crownHeight,
          baseHeight: totalHeight,
          tierRole: 'penthouse',
          parentBuildingId: parentId,
          color: colors.roof,
          fillColor: colors.roof,
          borderColor: colors.border,
          width: 2,
          fillOpacity: 0.95,
          borderOpacity: 1,
          visible: 1,
          attributes: {
            name: `${name} (Crown)`,
            height: `${(crownHeight - totalHeight).toFixed(1)}m`,
          },
        },
      });
    }

    // Optional Tier 4: Helipad marking on top of tower
    if (hasHelipad) {
      const helipadRing = createInsetRing(towerRing, 0.45);
      features.push({
        id: currentId++,
        name: `${name} (Helipad)`,
        kind: 'polygon3d',
        geometry: { type: 'Polygon', coordinates: [helipadRing] },
        props: {
          is3D: true,
          height: totalHeight + 0.8,
          baseHeight: totalHeight,
          tierRole: 'helipad',
          parentBuildingId: parentId,
          color: '#facc15', // Yellow Helipad
          fillColor: '#0f172a', // Dark asphalt pad
          borderColor: '#facc15',
          width: 3,
          fillOpacity: 1,
          borderOpacity: 1,
          visible: 1,
          attributes: {
            name: `${name} [H] Helipad`,
            elevation: `${totalHeight.toFixed(1)}m`,
          },
        },
      });
    }
  } else {
    // Single-tier building (e.g. Warehouse, Villa, or Flat)
    features.push({
      id: currentId++,
      name,
      kind: 'polygon3d',
      geometry: { type: 'Polygon', coordinates: [baseRing] },
      props: {
        is3D: true,
        height: totalHeight,
        baseHeight: 0,
        buildingArchetype: archetype,
        facadeTheme: theme,
        roofType,
        floors,
        floorHeight,
        hasPodium: false,
        hasHelipad,
        tierRole: 'tower',
        parentBuildingId: parentId,
        color: colors.wall,
        fillColor: colors.wall,
        borderColor: colors.border,
        width: 2,
        fillOpacity: colors.opacity,
        borderOpacity: 0.95,
        visible: 1,
        attributes: {
          name,
          archetype: cfg.label,
          floors: `${floors} Floors`,
          height: `${totalHeight.toFixed(1)}m`,
          facade: theme,
        },
      },
    });
  }

  return features;
}
