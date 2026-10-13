export type GeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon';

export type FeatureKind = 'marker' | 'textbox' | 'polyline' | 'polygon' | 'rectangle' | 'circle' | 'route' | 'polygon3d';

export interface GeoJSONGeometry {
  type: GeometryType;
  coordinates: any;
}

export type BuildingArchetype =
  | 'skyscraper'
  | 'commercial'
  | 'residential'
  | 'hospital'
  | 'warehouse'
  | 'civic'
  | 'villa'
  | 'custom';

export type FacadeTheme =
  | 'glass'
  | 'steel'
  | 'concrete'
  | 'brick'
  | 'marble'
  | 'neon';

export type RoofType =
  | 'flat'
  | 'penthouse'
  | 'helipad'
  | 'spire'
  | 'gable';

export type MarkerShape =
  | 'pin'
  | 'pin-drop'
  | 'pinball'
  | 'center-pinball'
  | 'pinball-glow'
  | 'circle'
  | 'circle-dot'
  | 'star'
  | 'star-four'
  | 'diamond'
  | 'square'
  | 'flag'
  | 'heart'
  | 'navigation'
  | 'shield'
  | 'modern-pin'
  | 'dots'
  | 'hexagon'
  | 'octagon'
  | 'squircle-badge'
  | 'pill-badge'
  | 'crosshair'
  | 'beacon-ring'
  | 'teardrop-ring'
  | 'vicinity-logo';

export type MarkerStylePreset = 'classic' | 'glass' | 'metallic' | 'dark-slate' | 'neon';

export interface FeatureProps {
  color?: string;
  borderColor?: string;
  borderOpacity?: number;
  width?: number;
  fillColor?: string;
  fillOpacity?: number;
  showLabel?: boolean;
  labelPos?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  iconSize?: number;
  iconSizeMode?: 'static' | 'dynamic';
  visible?: number; // 1 or 0 for MapLibre expression multiplication
  rotation?: number;

  // 3D Extrusion & Architectural Building specific
  is3D?: boolean;
  height?: number; // Height in meters above ground
  baseHeight?: number; // Base height in meters
  buildingArchetype?: BuildingArchetype;
  floors?: number;
  floorHeight?: number;
  facadeTheme?: FacadeTheme;
  roofType?: RoofType;
  hasPodium?: boolean;
  podiumFloors?: number;
  podiumHeight?: number;
  hasHelipad?: boolean;
  hasSpire?: boolean;
  spireHeight?: number;
  tierRole?: 'podium' | 'tower' | 'penthouse' | 'spire' | 'helipad';
  parentBuildingId?: number;

  // Marker specific
  shape?: MarkerShape;
  iconKey?: string;
  customImageDataUrl?: string;
  markerStylePreset?: MarkerStylePreset;

  // Vicinity Logo specific
  logoUrl?: string;
  logoFrame?: 'circle' | 'squircle' | 'hexagon' | 'pin-badge';
  logoBg?: string;
  logoBorder?: string;
  logoText?: string;
  logoScale?: number;

  // Text specific
  text?: string;
  fontSize?: number;
  opacity?: number;
  fontFamily?: string;

  // Circle specific
  centerCoord?: [number, number];
  radiusMeters?: number;

  // Route specific
  waypoints?: [number, number][];
  routeMode?: 'driving' | 'walking' | 'cycling';
  routingFailed?: boolean;
  description?: string;
  metadata?: {
    distance: number;
    duration: number;
  };
  routeAnimation?: {
    durationSeconds: number;
    cameraMode: 'static' | 'follow';
    glowEnabled: boolean;
    glowIntervalSeconds: number;
    glowIntensity: number;
    startWaypointIndex?: number;
    endWaypointIndex?: number;
    headStyle?: 'none' | 'arrow' | 'car';
    iconDimension?: '2d' | '3d';
  };

  // Attributes table
  attributes?: Record<string, string>;
  attrTypes?: Record<string, 'text' | 'image'>;
  attrRows?: Record<string, string>[];
  
  // OSM / Trade area scan metadata
  category?: string;
  poiType?: string;
  amenityGroupLabel?: string;
  managedBy?: 'open-node';
  osmTags?: Record<string, string>;
  osmType?: string;
  osmId?: number;
  searchAreaLabels?: string[];
  // Flexible, externally researched/enriched fields kept separate from source OSM tags.
  researchData?: Record<string, unknown>;
}

export interface GISFeature {
  id: number;
  name: string;
  kind: FeatureKind;
  geometry: GeoJSONGeometry;
  props: FeatureProps;
}

export interface CustomGroup {
  collapsed: boolean;
  ids: number[];
}

export type CustomGroups = Record<string, CustomGroup>;

export interface LayerVisibilities {
  label_city: boolean;
  label_brgy: boolean;
  label_street: boolean;
  poi_icons: boolean;
  poi_labels: boolean;
  road_exp: boolean;
  road_main: boolean;
  road_sec: boolean;
  road_ter: boolean;
  rd_rail: boolean;
  bound_prov: boolean;
  bound_city: boolean;
  bound_brgy: boolean;
  building2d: boolean;
  building3d: boolean;
  water: boolean;
  waterway: boolean;
  [key: string]: boolean;
}

export interface MapProject {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  basemap: string;
  zoom: number;
  center: [number, number];
  pitch?: number;
  bearing?: number;
  features: GISFeature[];
  custom_groups: CustomGroups;
  layer_visibilities: LayerVisibilities;
}

export interface ColorPalette {
  name: string;
  colors: string[];
}
