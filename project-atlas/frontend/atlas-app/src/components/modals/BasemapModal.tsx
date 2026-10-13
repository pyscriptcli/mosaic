'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Palette, X } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import { ALL_STYLES } from '../../gis/map';
import { ColorPicker } from '../toolbar/ColorPicker';

interface BasemapModalProps {
  mapInstance: any;
}

const isSatelliteOrOsm = (name: string) => /satellite|osm/i.test(name);

const BASEMAP_PREVIEWS: Record<string, {
  bg: string;
  water: string;
  landuse?: string;
  roads: string[];
  expressway: string;
  tileUrl?: string;
}> = {
  "Midnight Blue": {
    bg: "#0a1628",
    water: "#060d18",
    landuse: "#0d1a30",
    roads: ["#7d5f14", "#c99c37"],
    expressway: "#ffaa00",
  },
  "Monochrome": {
    bg: "#ece9e2",
    water: "#cdd7db",
    landuse: "#e5e2da",
    roads: ["#8a8377", "#47423b"],
    expressway: "#1a1816",
  },
  "White Gold": {
    bg: "#fafafa",
    water: "#d4dadc",
    landuse: "#f1f1ec",
    roads: ["#e0be74", "#b08a24"],
    expressway: "#f59e0b",
  },
  "OSM": {
    bg: "#f2efe9",
    water: "#aad3df",
    landuse: "#c8facc",
    roads: ["#ffffff", "#fdbf6f"],
    expressway: "#e892a2",
    tileUrl: "https://tile.openstreetmap.org/12/3424/1878.png",
  },
  "Google Satellite": {
    bg: "#09131a",
    water: "#0b1924",
    roads: ["#ffffff", "#cbd5e1"],
    expressway: "#ffaa00",
    tileUrl: "https://mt1.google.com/vt/lyrs=s&x=3424&y=1878&z=12",
  },
  "Esri Satellite": {
    bg: "#0f1715",
    water: "#0a141c",
    roads: ["#ffffff", "#cbd5e1"],
    expressway: "#ffaa00",
    tileUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1878/3424",
  },
};

const BasemapThumbnail: React.FC<{ name: string; isSelected: boolean }> = ({ name }) => {
  const [imgError, setImgError] = useState(false);
  const preview = BASEMAP_PREVIEWS[name] || BASEMAP_PREVIEWS["Midnight Blue"];

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none">
      {preview.tileUrl && !imgError ? (
        <>
          <img
            src={preview.tileUrl}
            alt={name}
            loading="lazy"
            crossOrigin="anonymous"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {/* Luminous vector road network overlay */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 75" preserveAspectRatio="none">
            {/* Expressways */}
            <path d="M-5 55 Q 35 48 55 25 T 105 12" fill="none" stroke={preview.expressway} strokeWidth="3" opacity="0.95" />
            <path d="M45 -5 Q 52 35 55 80" fill="none" stroke={preview.expressway} strokeWidth="2.2" opacity="0.9" />
            {/* Major roads */}
            <path d="M20 -5 L 30 80" fill="none" stroke={preview.roads[0]} strokeWidth="1.8" opacity="0.8" />
            <path d="M80 -5 L 70 80" fill="none" stroke={preview.roads[0]} strokeWidth="1.4" opacity="0.7" />
            <path d="M0 32 L 100 32" fill="none" stroke={preview.roads[0]} strokeWidth="1.2" opacity="0.6" />
            {/* Cities/nodes */}
            <circle cx="55" cy="25" r="2.5" fill="#ffffff" stroke={preview.expressway} strokeWidth="1" />
            <circle cx="30" cy="50" r="2" fill="#ffffff" stroke={preview.roads[0]} strokeWidth="1" />
          </svg>
        </>
      ) : (
        <svg className="w-full h-full transition-transform duration-300 group-hover:scale-105" viewBox="0 0 100 75" preserveAspectRatio="none">
          {/* Land / Background */}
          <rect width="100" height="75" fill={preview.bg} />
          {/* Water body / Coastline & Bay */}
          <path d="M 0 0 L 28 0 C 24 22 36 38 28 58 C 20 70 8 72 0 75 Z" fill={preview.water} />
          <path d="M 18 35 C 32 30 45 42 38 52 C 30 60 22 48 18 35 Z" fill={preview.water} opacity="0.95" />
          {/* Landuse / Park */}
          {preview.landuse && (
            <path d="M 52 10 C 68 8 82 14 78 28 C 72 38 56 36 52 25 Z" fill={preview.landuse} opacity="0.85" />
          )}
          {/* Local road grid */}
          <path d="M 28 24 L 100 24 M 32 45 L 100 45 M 50 0 L 50 75 M 78 0 L 78 75" fill="none" stroke={preview.roads[0]} strokeWidth="1" opacity="0.4" />
          {/* Secondary road */}
          <path d="M 25 60 Q 52 50 100 38" fill="none" stroke={preview.roads[1]} strokeWidth="2" opacity="0.85" />
          {/* Expressway */}
          <path d="M 12 75 Q 42 38 88 0" fill="none" stroke={preview.expressway} strokeWidth="2.8" />
          {/* City node */}
          <circle cx="48" cy="38" r="2.5" fill="#ffffff" stroke={preview.expressway} strokeWidth="1" />
          <circle cx="75" cy="20" r="2" fill="#ffffff" stroke={preview.roads[1]} strokeWidth="1" />
        </svg>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
    </div>
  );
};

const STYLE_CONTROLS = [
  { id: 'expressways', label: 'Expressways', color: '#ffaa00', colorLayers: ['rd_express'], visibilityKeys: ['road_exp'], layers: [{ id: 'case_express_casing', width: 'line-width', opacity: 'line-opacity' }, { id: 'rd_express', width: 'line-width', opacity: 'line-opacity' }], thickness: true, opacity: true },
  { id: 'mainRoads', label: 'Main roads', color: '#e8b84a', colorLayers: ['rd_major'], visibilityKeys: ['road_main'], layers: [{ id: 'case_major_casing', width: 'line-width', opacity: 'line-opacity' }, { id: 'rd_major', width: 'line-width', opacity: 'line-opacity' }], thickness: true, opacity: true },
  { id: 'secondaryRoads', label: 'Secondary roads', color: '#c99c37', colorLayers: ['rd_secondary'], visibilityKeys: ['road_sec'], layers: [{ id: 'case_secondary_casing', width: 'line-width', opacity: 'line-opacity' }, { id: 'rd_secondary', width: 'line-width', opacity: 'line-opacity' }], thickness: true, opacity: true },
  { id: 'tertiaryRoads', label: 'Tertiary roads', color: '#7d5f14', colorLayers: ['rd_tertiary', 'rd_min_md', 'rd_min_lo', 'rd_path'], visibilityKeys: ['road_ter'], layers: [{ id: 'case_tertiary_casing', width: 'line-width', opacity: 'line-opacity' }, { id: 'rd_tertiary', width: 'line-width', opacity: 'line-opacity' }, { id: 'rd_min_md', width: 'line-width', opacity: 'line-opacity' }, { id: 'rd_min_lo', width: 'line-width', opacity: 'line-opacity' }, { id: 'rd_path', width: 'line-width', opacity: 'line-opacity' }], thickness: true, opacity: true },
  { id: 'railways', label: 'Railways', color: '#d9b451', colorLayers: ['rd_rail'], visibilityKeys: ['rd_rail'], layers: [{ id: 'rd_rail', width: 'line-width', opacity: 'line-opacity' }], thickness: true, opacity: true },
  { id: 'boundaries', label: 'Boundaries', color: '#ff1e1e', colorLayers: ['bound_prov', 'bound_city', 'bound_brgy'], visibilityKeys: ['bound_prov', 'bound_city', 'bound_brgy'], layers: [{ id: 'bound_prov', width: 'line-width', opacity: 'line-opacity' }, { id: 'bound_city', width: 'line-width', opacity: 'line-opacity' }, { id: 'bound_brgy', width: 'line-width', opacity: 'line-opacity' }], thickness: true, opacity: true },
  { id: 'background', label: 'Background', layers: [{ id: 'bg', opacity: 'background-opacity' }], thickness: false, opacity: true },
  { id: 'buildings', label: 'Buildings', visibilityKeys: ['building2d', 'building3d'], layers: [{ id: 'building-2d', opacity: 'fill-opacity' }, { id: 'building-3d', opacity: 'fill-extrusion-opacity' }], thickness: false, opacity: true },
] as const;

const INITIAL_VALUES = Object.fromEntries(
  STYLE_CONTROLS.flatMap(({ id, thickness, opacity }) => [
    ...(thickness ? [[`${id}Thickness`, 100]] : []),
    ...(opacity ? [[`${id}Opacity`, 100]] : []),
  ])
) as Record<string, number>;

function scaleLineWidth(width: any, scale: number) {
  if (typeof width === 'number') return width * scale;
  if (!Array.isArray(width)) return width;

  // Keep zoom as the top-level camera expression; MapLibre rejects wrapping it in `*`.
  if (width[0] === 'interpolate' || width[0] === 'step') {
    const scaled = [...width];
    const firstOutput = width[0] === 'step' ? 2 : 4;
    for (let index = firstOutput; index < scaled.length; index += 2) {
      if (typeof scaled[index] === 'number') scaled[index] *= scale;
      else scaled[index] = ['*', scaled[index], scale];
    }
    return scaled;
  }

  return ['*', width, scale];
}

export const BasemapModal: React.FC<BasemapModalProps> = ({ mapInstance }) => {
  const { activePanels, togglePanel, currentBasemap, setBasemap, visibilities, setVisibility } = useMapStore();
  const [values, setValues] = useState(INITIAL_VALUES);
  const [colors, setColors] = useState<Record<string, string>>(
    Object.fromEntries(STYLE_CONTROLS.filter((group) => 'color' in group).map((group) => [group.id, group.color!]))
  );
  const [openRoadGroup, setOpenRoadGroup] = useState<string | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const [failedGroups, setFailedGroups] = useState<Record<string, boolean>>({});
  const basePaintRef = useRef<Map<string, Record<string, any>>>(new Map());
  const touchedOpacityRef = useRef(new Set<string>());
  const mixedOpacityRef = useRef(new Set<string>());

  const setMapPaint = (layerId: string, prop: string, val: any) => {
    if (mapInstance && mapInstance.getLayer(layerId)) {
      mapInstance.setPaintProperty(layerId, prop, val);
    }
  };

  const captureStyle = useCallback(() => {
    const styleLayers = mapInstance?.getStyle?.()?.layers;
    if (!Array.isArray(styleLayers)) return;
    const basePaint = new Map<string, Record<string, any>>();
    const styleColors: Record<string, string> = {};
    const opacityDefaults: Record<string, number> = {};
    const mixedOpacityGroups = new Set<string>();
    for (const group of STYLE_CONTROLS) {
      if ('colorLayers' in group) {
        const colorLayer = group.colorLayers.find((id) => mapInstance.getLayer(id));
        const color = colorLayer && mapInstance.getPaintProperty(colorLayer, 'line-color');
        if (typeof color === 'string') styleColors[group.id] = color;
      }
      for (const layer of group.layers) {
        if (!mapInstance.getLayer(layer.id)) continue;
        const paint: Record<string, any> = {};
        if ('width' in layer) paint[layer.width] = mapInstance.getPaintProperty(layer.id, layer.width);
        if ('opacity' in layer) paint[layer.opacity] = mapInstance.getPaintProperty(layer.id, layer.opacity) ?? 1;
        basePaint.set(layer.id, paint);
      }
      if (group.opacity && !touchedOpacityRef.current.has(group.id)) {
        const opacities = group.layers
          .map((layer) => basePaint.get(layer.id)?.[layer.opacity])
          .filter((opacity): opacity is number => typeof opacity === 'number');
        if (opacities.length) {
          opacityDefaults[`${group.id}Opacity`] = Math.round(opacities.reduce((sum, opacity) => sum + opacity, 0) / opacities.length * 100);
          if (opacities.some((opacity) => Math.abs(opacity - opacities[0]) > 0.001)) mixedOpacityGroups.add(group.id);
        }
      }
    }
    if (isSatelliteOrOsm(currentBasemap)) {
      opacityDefaults['buildingsOpacity'] = 0;
      opacityDefaults['backgroundOpacity'] = 0;
    }
    basePaintRef.current = basePaint;
    mixedOpacityRef.current = mixedOpacityGroups;
    if (Object.keys(styleColors).length) setColors((current) => ({ ...current, ...styleColors }));
    if (Object.keys(opacityDefaults).length) setValues((current) => ({ ...current, ...opacityDefaults }));
    setStyleVersion((version) => version + 1);
  }, [mapInstance, currentBasemap]);

  // When switching to Satellite or OSM, ensure buildings and background are 0 by default
  useEffect(() => {
    if (!mapInstance) return;
    if (isSatelliteOrOsm(currentBasemap)) {
      touchedOpacityRef.current.add('buildings');
      touchedOpacityRef.current.add('background');
      setValues((current) => ({
        ...current,
        buildingsOpacity: 0,
        backgroundOpacity: 0,
      }));
      try {
        if (mapInstance.getLayer('bg')) mapInstance.setPaintProperty('bg', 'background-opacity', 0);
        if (mapInstance.getLayer('building-2d')) mapInstance.setPaintProperty('building-2d', 'fill-opacity', 0);
        if (mapInstance.getLayer('building-3d')) mapInstance.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0);
      } catch {}
    }
  }, [currentBasemap, mapInstance]);

  useEffect(() => {
    if (!Array.isArray(mapInstance?.getStyle?.()?.layers)) return;
    const failures: Record<string, boolean> = {};
    // Keep each control independent if one layer rejects its paint update.
    for (const group of STYLE_CONTROLS) {
      if (!touchedOpacityRef.current.has(group.id)) continue;
      for (const layer of group.layers) {
        const base = basePaintRef.current.get(layer.id);
        if (!base || !('opacity' in layer) || base[layer.opacity] == null || !mapInstance.getLayer(layer.id)) continue;
        try {
          mapInstance.setPaintProperty(layer.id, layer.opacity, values[`${group.id}Opacity`] / 100);
        } catch (error) {
          failures[group.id] = true;
          console.warn(`Could not apply ${group.label} opacity`, error);
        }
      }
    }
    for (const group of STYLE_CONTROLS) {
      for (const layer of group.layers) {
        const base = basePaintRef.current.get(layer.id);
        if (!base || !mapInstance.getLayer(layer.id) || !('width' in layer) || base[layer.width] == null) continue;
        try {
          mapInstance.setPaintProperty(layer.id, layer.width, scaleLineWidth(base[layer.width], values[`${group.id}Thickness`] / 100));
        } catch (error) {
          failures[group.id] = true;
          console.warn(`Could not apply ${group.label} thickness`, error);
        }
      }
    }
    setFailedGroups(failures);
  }, [mapInstance, values, styleVersion]);

  useEffect(() => {
    if (!mapInstance) return;
    mapInstance.on('style.load', captureStyle);
    // onMapReady fires after the initial map load; style.load handles later basemap changes.
    captureStyle();
    return () => mapInstance.off('style.load', captureStyle);
  }, [mapInstance, captureStyle]);

  const getGroupStatus = (group: (typeof STYLE_CONTROLS)[number]) => {
    if (failedGroups[group.id]) return 'Update failed';
    const styleLayers = mapInstance?.getStyle?.()?.layers;
    if (!Array.isArray(styleLayers)) return 'Loading style';
    const existing = group.layers
      .map((layer) => styleLayers.find((styleLayer: any) => styleLayer.id === layer.id))
      .filter(Boolean);
    if (!existing.length) return 'Unavailable';
    if ('visibilityKeys' in group && !group.visibilityKeys.some((key) => visibilities[key])) return 'Hidden';
    const zoom = mapInstance?.getZoom?.() ?? 0;
    const visible = existing.some((layer: any) => {
      return zoom >= (layer.minzoom ?? 0) && zoom < (layer.maxzoom ?? Infinity);
    });
    if (!visible) {
      const nextMinZoom = Math.min(...existing.map((layer: any) => layer.minzoom ?? 0));
      return zoom < nextMinZoom ? `Zoom ${nextMinZoom}+` : 'Hidden';
    }
    return 'Ready';
  };

  if (!activePanels.customMap) return null;

  return (
    <div className="fixed top-16 right-4 z-[998] w-[calc(100vw_-_2rem)] max-w-[430px] max-h-[84vh] overflow-y-auto bg-[rgba(9,16,24,0.98)] border border-white/15 rounded-3xl p-4 shadow-2xl backdrop-blur-xl flex flex-col gap-3.5 text-xs text-gray-300 animate-in fade-in slide-in-from-top-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-2 font-bold text-white text-sm">
          <Palette className="w-4 h-4 text-sky-400" />
          <span>Vector & Basemap Style</span>
        </div>
        <button
          onClick={() => togglePanel('customMap', false)}
          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Preset List with map preview and name below it in a 3x2 landscape layout */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Basemap Presets
          </span>
          <span className="text-[9px] text-gray-500 font-medium">
            {Object.keys(ALL_STYLES).length} styles
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Object.keys(ALL_STYLES).map((name) => {
            const isSelected = currentBasemap === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setBasemap(name)}
                className={`group relative flex flex-col items-center gap-1.5 p-1.5 rounded-xl border text-center transition-all ${
                  isSelected
                    ? 'bg-sky-500/15 border-sky-400 text-white shadow-[0_0_14px_rgba(56,189,248,0.3)] ring-1 ring-sky-400'
                    : 'bg-white/[0.03] border-white/10 text-gray-300 hover:bg-white/[0.07] hover:border-white/20 hover:text-white'
                }`}
              >
                <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-white/10 bg-slate-950 shadow-inner flex items-center justify-center">
                  <BasemapThumbnail name={name} isSelected={isSelected} />
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center shadow-md">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                </div>
                <span className={`text-[10px] sm:text-[10.5px] font-medium leading-tight px-0.5 line-clamp-1 ${isSelected ? 'text-sky-300 font-bold' : 'text-gray-300 group-hover:text-white'}`}>
                  {name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Per-road controls stay compact until the user opens a group. */}
      <section className="border-t border-white/10 pt-3 flex flex-col gap-2">
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Road & boundary styles</h2>
        {STYLE_CONTROLS.filter((group) => 'color' in group).map((group) => {
          const isOpen = openRoadGroup === group.id;
          const status = getGroupStatus(group);
          const unavailable = status === 'Unavailable' || status === 'Loading style';
          return (
            <div key={group.id} className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={isOpen ? `style-controls-${group.id}` : undefined}
                disabled={unavailable}
                onClick={() => setOpenRoadGroup(isOpen ? null : group.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="w-6 shrink-0 rounded-full" style={{ height: `${Math.max(2, values[`${group.id}Thickness`] / 50)}px`, backgroundColor: colors[group.id], opacity: values[`${group.id}Opacity`] / 100 }} />
                <span className="flex-1 text-[11px] font-bold uppercase tracking-wide text-gray-200">{group.label}</span>
                <span className="text-[9px] text-gray-500">{status}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div id={`style-controls-${group.id}`} className="border-t border-white/10 px-3 py-3 flex flex-col gap-3">
                  <ColorPicker
                    label="Color preset or custom"
                    color={colors[group.id]}
                    onChange={(color) => {
                      setColors((current) => ({ ...current, [group.id]: color }));
                      group.colorLayers!.forEach((layerId) => setMapPaint(layerId, 'line-color', color));
                    }}
                  />
                  <label className="grid grid-cols-[60px_1fr_38px] items-center gap-2 text-[10px] text-gray-400">
                    <span>Thickness</span>
                    <input aria-label={`${group.label} thickness`} type="range" min="50" max="1000" step="10" value={values[`${group.id}Thickness`]} onChange={(e) => setValues((current) => ({ ...current, [`${group.id}Thickness`]: Number(e.target.value) }))} className="w-full accent-sky-400" />
                    <span className="text-right text-sky-300">{(values[`${group.id}Thickness`] / 100).toFixed(1)}×</span>
                  </label>
                  <label className="grid grid-cols-[60px_1fr_38px] items-center gap-2 text-[10px] text-gray-400">
                    <span>Opacity</span>
                    <input aria-label={`${group.label} opacity`} type="range" min="0" max="100" step="1" value={values[`${group.id}Opacity`]} onChange={(e) => {
                      touchedOpacityRef.current.add(group.id);
                      setValues((current) => ({ ...current, [`${group.id}Opacity`]: Number(e.target.value) }));
                    }} className="w-full accent-sky-400" />
                    <span className="text-right text-sky-300">{mixedOpacityRef.current.has(group.id) && !touchedOpacityRef.current.has(group.id) ? 'Mixed' : `${values[`${group.id}Opacity`]}%`}</span>
                  </label>
                  {status === 'Hidden' && 'visibilityKeys' in group && (
                    <button type="button" onClick={() => group.visibilityKeys!.forEach((key) => setVisibility(key, true))} className="self-start rounded-md border border-sky-400/30 px-2 py-1 text-[10px] font-semibold text-sky-300 hover:bg-sky-400/10">
                      Show on map
                    </button>
                  )}
                  {status.startsWith('Zoom ') && <p className="text-[10px] text-amber-300">Zoom in to see this layer.</p>}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Layer opacity</h2>
        {STYLE_CONTROLS.filter((group) => group.id === 'background' || group.id === 'buildings').map((group) => (
          <div key={group.id} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <label className="grid grid-cols-[70px_1fr_38px] items-center gap-2 text-[10px] text-gray-400">
              <span className="font-bold uppercase tracking-wide">{group.label}</span>
              <input aria-label={`${group.label} opacity`} type="range" min="0" max="100" step="1" value={values[`${group.id}Opacity`]} disabled={getGroupStatus(group) === 'Unavailable'} onChange={(e) => {
                touchedOpacityRef.current.add(group.id);
                setValues((current) => ({ ...current, [`${group.id}Opacity`]: Number(e.target.value) }));
              }} className="w-full accent-sky-400 disabled:opacity-40" />
              <span className="text-right text-sky-300">{mixedOpacityRef.current.has(group.id) && !touchedOpacityRef.current.has(group.id) ? 'Mixed' : `${values[`${group.id}Opacity`]}%`}</span>
            </label>
            {getGroupStatus(group) !== 'Ready' && <span className="pl-[78px] text-[9px] text-gray-500">{getGroupStatus(group)}</span>}
          </div>
        ))}
      </section>

      <details className="rounded-xl border border-white/10 bg-white/[0.03]">
        <summary className="cursor-pointer px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Other colors</summary>
        <div className="border-t border-white/10 px-3 py-3 flex flex-col gap-4">
          <ColorPicker label="Background color" color="#0a1628" onChange={(color) => setMapPaint('bg', 'background-color', color)} />
          <ColorPicker label="Buildings" color="#8e7258" onChange={(color) => {
            setMapPaint('building-2d', 'fill-color', color);
            setMapPaint('building-3d', 'fill-extrusion-color', color);
          }} />
          <ColorPicker label="Water bodies" color="#0a1424" onChange={(color) => {
            setMapPaint('water', 'fill-color', color);
            setMapPaint('waterway', 'line-color', color);
          }} />
        </div>
      </details>
    </div>
  );
};
