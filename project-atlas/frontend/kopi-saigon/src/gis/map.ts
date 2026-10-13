type LayerVisibilities = Record<string, boolean>;

export interface ThemeColors {
  overlay: string;
  text: string;
  land: string;
  landcover: string;
  water: string;
  waterway: string;
  parks: string;
  buildings: string;
  aeroway: string;
  rail: string;
  rd_express: string;
  rd_major: string;
  rd_secondary: string;
  rd_tertiary: string;
  rd_min_md: string;
  rd_min_lo: string;
  rd_path: string;
  rd_case: string;
  sec_opacity: number;
  ter_opacity: number;
  building_opacity: number;
  boundary: string;
  muted: string;
}

export const THEMES: Record<string, ThemeColors> = {
  "Midnight Blue": {
    overlay: "#0a1628", text: "#d9b451", land: "#0d1830",
    landcover: "#0f1d33", water: "#0a1424", waterway: "#081120",
    parks: "#142440", buildings: "#8e7258", aeroway: "#152640",
    rail: "#d9b451", rd_express: "#ffaa00", rd_major: "#e8b84a",
    rd_secondary: "#c99c37", rd_tertiary: "#7d5f14", rd_min_md: "#46463e",
    rd_min_lo: "#2f2f2a", rd_path: "#4a4333", rd_case: "#685c37",
    sec_opacity: 0.8, ter_opacity: 0.65, building_opacity: 0.35,
    boundary: "#ff1e1e", muted: "#8b949e",
  },
  "Monochrome": {
    overlay: "#FAF5EE", text: "#181D1E", land: "#F3E8D7",
    landcover: "#EFE3D0", water: "#C9D6DF", waterway: "#B5C6D1",
    parks: "#E2E8D8", buildings: "#D8C7B5", aeroway: "#E5DDD1",
    rail: "#783819", rd_express: "#5A2911", rd_major: "#783819",
    rd_secondary: "#8A4E21", rd_tertiary: "#A2683A", rd_min_md: "#C4AC94",
    rd_min_lo: "#D6C4B0", rd_path: "#DECDBB", rd_case: "#5A2911",
    sec_opacity: 0.85, ter_opacity: 0.7, building_opacity: 0.65,
    boundary: "#EE3F24", muted: "#7A7A7A",
  },
  "White Gold": {
    overlay: "#ffffff", text: "#a07d1c", land: "#fafafa",
    landcover: "#f1f1ec", water: "#d4dadc", waterway: "#c2c9cc",
    parks: "#e6ebe4", buildings: "#d8d8d4", aeroway: "#e4e4e4",
    rail: "#c99c37", rd_express: "#f59e0b", rd_major: "#e5a91d",
    rd_secondary: "#b08a24", rd_tertiary: "#9c7a1a", rd_min_md: "#e0be74",
    rd_min_lo: "#ead9b0", rd_path: "#e6dabd", rd_case: "#b08a24",
    sec_opacity: 0.7, ter_opacity: 0.6, building_opacity: 0.5,
    boundary: "#ff1e1e", muted: "#6b7280",
  },
  "Satellite": {
    overlay: "#000000", text: "#ffffff", land: "#000000",
    landcover: "#000000", water: "#000000", waterway: "#38bdf8",
    parks: "#000000", buildings: "#dedad2", aeroway: "#e2e8f0",
    rail: "#facc15", rd_express: "#ffaa00", rd_major: "#ffffff",
    rd_secondary: "#ffffff", rd_tertiary: "#e2e8f0", rd_min_md: "#cbd5e1",
    rd_min_lo: "#94a3b8", rd_path: "#cbd5e1", rd_case: "#000000",
    sec_opacity: 0.85, ter_opacity: 0.7, building_opacity: 0,
    boundary: "#ff1e1e", muted: "#cbd5e1",
  },
  "OSM": {
    overlay: "#ffffff", text: "#2d2a26", land: "#f2efe9",
    landcover: "#e5e2da", water: "#aad3df", waterway: "#84b7cf",
    parks: "#c8facc", buildings: "#dedad2", aeroway: "#bbbbcc",
    rail: "#787878", rd_express: "#ffaa00", rd_major: "#e8b84a",
    rd_secondary: "#c99c37", rd_tertiary: "#ffffff", rd_min_md: "#ffffff",
    rd_min_lo: "#ffffff", rd_path: "#ffffff", rd_case: "#b0a89d",
    sec_opacity: 0.85, ter_opacity: 0.7, building_opacity: 0,
    boundary: "#ff1e1e", muted: "#716b61",
  },
};

function w(...stops: [number, number][]): any[] {
  const out: any[] = ["interpolate", ["exponential", 1.2], ["zoom"]];
  for (const stop of stops) {
    out.push(stop[0], stop[1]);
  }
  return out;
}

function road_layer(p: ThemeColors, lid: string, classes: string[], color: string | null, widths: [number, number][], casing = false, opacity = 1.0, minzoom = 0) {
  const lyr: any = {
    id: lid,
    type: "line",
    source: "omt",
    "source-layer": "transportation",
    filter: ["match", ["get", "class"], classes, true, false],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": color, "line-width": w(...widths), "line-opacity": opacity },
  };
  if (minzoom) lyr.minzoom = minzoom;
  if (casing) {
    lyr.paint["line-color"] = p.rd_case;
    // Keep the casing directly beneath the road stroke so thickened roads have no outline.
    lyr.paint["line-width"] = w(...widths);
    lyr.id = lid + "_casing";
  }
  return lyr;
}

export function vectorStyle(p: ThemeColors) {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      omt: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet"
      }
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": p.overlay } },
      { id: "landcover", type: "fill", source: "omt", "source-layer": "landcover", paint: { "fill-color": p.landcover, "fill-opacity": 0.6 } },
      { id: "landuse", type: "fill", source: "omt", "source-layer": "landuse", paint: { "fill-color": p.land, "fill-opacity": 0.8 } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": p.parks } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": p.water } },
      { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": p.waterway, "line-width": w([9, 1], [20, 6]) } },
      { id: "aeroway", type: "line", source: "omt", "source-layer": "aeroway", paint: { "line-color": p.aeroway, "line-width": w([11, 1], [20, 12]) } },
      {
        id: "building-2d", type: "fill", source: "omt", "source-layer": "building", minzoom: 13,
        layout: { visibility: "none" },
        paint: { "fill-color": p.buildings, "fill-opacity": p.building_opacity, "fill-outline-color": p.buildings }
      },
      {
        id: "building-3d", type: "fill-extrusion", source: "omt", "source-layer": "building", minzoom: 13,
        layout: { visibility: p.building_opacity > 0 ? "visible" : "none" },
        paint: {
          "fill-extrusion-color": p.buildings,
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 12],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": p.building_opacity
        }
      },
      {
        id: "bound_prov", type: "line", source: "omt", "source-layer": "boundary",
        filter: ["match", ["get", "admin_level"], [2, 4], true, false],
        layout: { visibility: "none" },
        paint: { "line-color": "#ff1e1e", "line-width": 2.2, "line-dasharray": [4, 2] }
      },
      {
        id: "bound_city", type: "line", source: "omt", "source-layer": "boundary",
        filter: ["match", ["get", "admin_level"], [6, 7, 8], true, false], minzoom: 7,
        layout: { visibility: "none" },
        paint: { "line-color": "#ff1e1e", "line-width": 1.8, "line-dasharray": [2, 2], "line-opacity": 0.9 }
      },
      {
        id: "bound_brgy", type: "line", source: "omt", "source-layer": "boundary",
        filter: ["match", ["get", "admin_level"], [9, 10], true, false], minzoom: 11,
        layout: { visibility: "none" },
        paint: { "line-color": "#ff1e1e", "line-width": 1.2, "line-dasharray": [1, 2], "line-opacity": 0.8 }
      },
      road_layer(p, "case_express", ["motorway"], null, [[5, 1.5], [14, 5.5], [20, 24]], true),
      road_layer(p, "case_major", ["trunk", "primary"], null, [[6, 1.0], [14, 3.8], [20, 18]], true),
      road_layer(p, "case_secondary", ["secondary"], null, [[8, 0.8], [14, 2.8], [20, 15]], true, p.sec_opacity),
      road_layer(p, "case_tertiary", ["tertiary"], null, [[9, 0.6], [14, 2.0], [20, 12]], true, p.ter_opacity),
      road_layer(p, "rd_path", ["path", "pedestrian", "footway"], p.rd_path, [[14, 0.6], [20, 5]], false, 1.0, 14),
      road_layer(p, "rd_min_lo", ["service", "track"], p.rd_min_lo, [[14, 0.6], [20, 6]], false, 1.0, 14),
      road_layer(p, "rd_min_md", ["minor"], p.rd_min_md, [[13, 0.8], [16, 3.5], [20, 10]], false, 1.0, 13),
      road_layer(p, "rd_tertiary", ["tertiary"], p.rd_tertiary, [[9, 0.6], [14, 2.0], [20, 12]], false, p.ter_opacity),
      road_layer(p, "rd_secondary", ["secondary"], p.rd_secondary, [[8, 0.8], [14, 2.8], [20, 15]], false, p.sec_opacity),
      road_layer(p, "rd_major", ["trunk", "primary"], p.rd_major, [[6, 1.0], [14, 3.8], [20, 18]]),
      road_layer(p, "rd_express", ["motorway"], p.rd_express, [[5, 1.5], [14, 5.5], [20, 24]]),
      {
        id: "rd_rail", type: "line", source: "omt", "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["rail", "transit"], true, false], minzoom: 10,
        paint: { "line-color": p.rail, "line-width": w([10, 1.2], [15, 2.5], [20, 4]), "line-dasharray": [3, 2] }
      },
      {
        id: "label_city", type: "symbol", source: "omt", "source-layer": "place",
        filter: ["match", ["get", "class"], ["city", "town"], true, false], minzoom: 6,
        layout: {
          "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": w([6, 12], [14, 18]),
          "text-transform": "uppercase",
          "text-letter-spacing": 0.1
        },
        paint: { "text-color": p.text, "text-halo-color": p.overlay, "text-halo-width": 2 }
      },
      {
        id: "label_brgy", type: "symbol", source: "omt", "source-layer": "place",
        filter: ["match", ["get", "class"], ["suburb", "neighbourhood", "village", "quarter", "hamlet"], true, false], minzoom: 11,
        layout: {
          "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": w([11, 10], [16, 14]),
          "text-letter-spacing": 0.05
        },
        paint: { "text-color": p.text, "text-halo-color": p.overlay, "text-halo-width": 1.5 }
      },
      {
        id: "label_street", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 13,
        layout: {
          "symbol-placement": "line",
          "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": w([13, 9], [18, 13])
        },
        paint: { "text-color": p.text, "text-halo-color": p.overlay, "text-halo-width": 1.5 }
      },
    ]
  };
}

export function rasterStyle(tileUrls: string[], bg: string, maxzoom = 20, bgOpacity = 1) {
  return {
    version: 8,
    sources: {
      r: { type: "raster", tiles: tileUrls, tileSize: 256, maxzoom }
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": bg, "background-opacity": bgOpacity } },
      { id: "r", type: "raster", source: "r" }
    ]
  };
}

export const GOOGLE_SATELLITE_TILES = [
  "https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  "https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  "https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
];

export const ESRI_SATELLITE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];

/** Satellite imagery with the same editable OpenFreeMap vector layers used by
 * the vector basemaps. Defaults to crystal-clear Google Satellite clean tiles (lyrs=s, maxzoom 22)
 * with background and buildings set to 0 by default so roads and high-zoom views are sharp and editable.
 */
export function satelliteVectorStyle(
  tileUrls: string[] = GOOGLE_SATELLITE_TILES,
  maxzoom = 22
) {
  const vector = vectorStyle(THEMES["Satellite"]);
  const satellite = rasterStyle(tileUrls, "#000000", maxzoom, 0);
  const vectorLayers = vector.layers.filter((layer: any) =>
    !["bg", "landcover", "landuse", "park", "water", "waterway"].includes(layer.id)
  );

  return {
    ...vector,
    sources: { ...vector.sources, ...satellite.sources },
    layers: [satellite.layers[0], satellite.layers[1], ...vectorLayers],
  };
}

/** OpenStreetMap raster basemap with editable vector road and label layers on top.
 * Enables road color, thickness, opacity editing and visibility toggles on top of OSM,
 * with background and buildings set to 0 by default.
 */
export function osmVectorStyle() {
  const vector = vectorStyle(THEMES["OSM"]);
  const osm = rasterStyle(
    ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    "#f2efe9",
    19,
    0
  );
  const vectorLayers = vector.layers.filter((layer: any) =>
    !["bg", "landcover", "landuse", "park", "water", "waterway"].includes(layer.id)
  );

  return {
    ...vector,
    sources: { ...vector.sources, ...osm.sources },
    layers: [osm.layers[0], osm.layers[1], ...vectorLayers],
  };
}

export function mapboxSatelliteXRayStyle(token?: string) {
  const satTiles = token
    ? [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.webp?access_token=${token}`]
    : GOOGLE_SATELLITE_TILES;

  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      sat: {
        type: "raster",
        tiles: satTiles,
        tileSize: token ? 512 : 256,
        maxzoom: 21
      },
      terrain: {
        type: "raster-dem",
        tiles: token
          ? [`https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${token}`]
          : ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 14,
        encoding: token ? "mapbox" : "terrarium"
      },
      omt: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet"
      }
    },
    terrain: {
      source: "terrain",
      exaggeration: 1.5
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#000000" } },
      { id: "sat_layer", type: "raster", source: "sat", paint: { "raster-opacity": 0.95 } },
      // Subtle architectural vector building footprints
      {
        id: "building-footprint-xray",
        type: "line",
        source: "omt",
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "line-color": "#38bdf8",
          "line-width": 0.75,
          "line-opacity": 0.35
        }
      },
      // Architectural 3D Towers & Extrusions (Smart Height Filter: keeps low-rise houses natural to satellite)
      {
        id: "building-3d",
        type: "fill-extrusion",
        source: "omt",
        "source-layer": "building",
        minzoom: 13,
        filter: [">=", ["coalesce", ["get", "render_height"], ["get", "height"], 0], 15],
        layout: { visibility: "visible" },
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], ["get", "height"], 20],
            15, "#94a3b8",
            35, "#64748b",
            75, "#38bdf8",
            140, "#1e40af",
            260, "#0f172a"
          ],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 18],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.88
        }
      },
      // Editable Vector Road Layers
      road_layer(THEMES["Satellite"], "case_express", ["motorway"], null, [[5, 1.5], [14, 5.5], [20, 24]], true),
      road_layer(THEMES["Satellite"], "case_major", ["trunk", "primary"], null, [[6, 1.0], [14, 3.8], [20, 18]], true),
      road_layer(THEMES["Satellite"], "case_secondary", ["secondary"], null, [[8, 0.8], [14, 2.8], [20, 15]], true, THEMES["Satellite"].sec_opacity),
      road_layer(THEMES["Satellite"], "case_tertiary", ["tertiary"], null, [[9, 0.6], [14, 2.0], [20, 12]], true, THEMES["Satellite"].ter_opacity),
      road_layer(THEMES["Satellite"], "rd_path", ["path", "pedestrian", "footway"], THEMES["Satellite"].rd_path, [[14, 0.6], [20, 5]], false, 1.0, 14),
      road_layer(THEMES["Satellite"], "rd_min_lo", ["service", "track"], THEMES["Satellite"].rd_min_lo, [[14, 0.6], [20, 6]], false, 1.0, 14),
      road_layer(THEMES["Satellite"], "rd_min_md", ["minor"], THEMES["Satellite"].rd_min_md, [[13, 0.8], [16, 3.5], [20, 10]], false, 1.0, 13),
      road_layer(THEMES["Satellite"], "rd_tertiary", ["tertiary"], THEMES["Satellite"].rd_tertiary, [[9, 0.6], [14, 2.0], [20, 12]], false, THEMES["Satellite"].ter_opacity),
      road_layer(THEMES["Satellite"], "rd_secondary", ["secondary"], THEMES["Satellite"].rd_secondary, [[8, 0.8], [14, 2.8], [20, 15]], false, THEMES["Satellite"].sec_opacity),
      road_layer(THEMES["Satellite"], "rd_major", ["trunk", "primary"], THEMES["Satellite"].rd_major, [[6, 1.0], [14, 3.8], [20, 18]]),
      road_layer(THEMES["Satellite"], "rd_express", ["motorway"], THEMES["Satellite"].rd_express, [[5, 1.5], [14, 5.5], [20, 24]]),
      // Street & City Labels with high-contrast halos
      {
        id: "label_street",
        type: "symbol",
        source: "omt",
        "source-layer": "transportation_name",
        minzoom: 13,
        layout: {
          "symbol-placement": "line",
          "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 2
        }
      },
      {
        id: "label_city",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        filter: ["match", ["get", "class"], ["city", "town", "suburb"], true, false],
        minzoom: 6,
        layout: {
          "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 14,
          "text-transform": "uppercase"
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 2.5
        }
      }
    ]
  };
}

export const ALL_STYLES: Record<string, any> = {
  "Midnight Blue": vectorStyle(THEMES["Midnight Blue"]),
  "Monochrome": vectorStyle(THEMES["Monochrome"]),
  "White Gold": vectorStyle(THEMES["White Gold"]),
  "OSM": osmVectorStyle(),
  "Google Satellite": satelliteVectorStyle(GOOGLE_SATELLITE_TILES, 22),
  "Esri Satellite": satelliteVectorStyle(ESRI_SATELLITE_TILES, 19),
};

export const VIS_MAP: Record<string, string[]> = {
  label_city: ['label_city'],
  label_brgy: ['label_brgy'],
  label_street: ['label_street'],
  poi_icons: ['poi_icons', 'poi'],
  poi_labels: ['poi_labels'],
  road_exp: ['case_express_casing', 'rd_express'],
  road_main: ['case_major_casing', 'rd_major'],
  road_sec: ['case_secondary_casing', 'rd_secondary'],
  road_ter: ['case_tertiary_casing', 'rd_tertiary', 'rd_min_md', 'rd_min_lo', 'rd_path'],
  rd_rail: ['rd_rail'],
  bound_prov: ['bound_prov'],
  bound_city: ['bound_city'],
  bound_brgy: ['bound_brgy'],
  building2d: ['building-2d'],
  building3d: ['building-3d'],
  water: ['water'],
  waterway: ['waterway']
};

export const DEFAULT_VISIBILITIES: LayerVisibilities = {
  label_city: true, label_brgy: true, label_street: true,
  poi_icons: true, poi_labels: true,
  road_exp: true, road_main: true, road_sec: true, road_ter: true, rd_rail: true,
  bound_prov: false, bound_city: false, bound_brgy: false,
  building2d: false, building3d: true, water: true, waterway: true
};

export const COLOR_PALETTES = [
  { name: "Primary", colors: ["#1e40af", "#dc2626", "#16a34a", "#ca8a04", "#0a1628", "#ffffff"] },
  { name: "Secondary", colors: ["#38bdf8", "#3fb950", "#f85149", "#a371f7", "#fb923c", "#f43f5e"] },
  { name: "Tertiary", colors: ["#0d9488", "#e8b84a", "#8b5cf6", "#64748b", "#8e7258", "#334155"] }
];
