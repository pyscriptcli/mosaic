'use client';

import React from 'react';
import {
  X,
  Building2,
  Building,
  Store,
  Cross,
  Warehouse,
  Landmark,
  Home,
  Box,
  Layers,
  Sparkles,
  MapPin,
  Pencil,
} from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import { ARCHETYPE_CONFIGS, FACADE_PALETTES } from '../../gis/buildings3d';
import { BuildingArchetype } from '../../types/gis';

const ICON_MAP: Record<string, any> = {
  Building2,
  Building,
  Store,
  Cross,
  Warehouse,
  Landmark,
  Home,
  Box,
};

interface BuildingCatalogModalProps {
  mapInstance?: any;
}

export const BuildingCatalogModal: React.FC<BuildingCatalogModalProps> = ({ mapInstance }) => {
  const {
    activePanels,
    togglePanel,
    setSelectedBuildingArchetype,
    setActiveTool,
    setToast,
  } = useMapStore();

  if (!activePanels.buildingCatalog) return null;

  const handlePlace = (archetype: BuildingArchetype, label: string) => {
    setSelectedBuildingArchetype(archetype);
    setActiveTool('placeBuilding');
    togglePanel('buildingCatalog', false);
    if (mapInstance && mapInstance.getPitch() < 40) {
      mapInstance.easeTo({ pitch: 60 });
    }
    setToast(`Click anywhere on the map to place ${label}`);
  };

  const handleDraw = (archetype: BuildingArchetype, label: string) => {
    setSelectedBuildingArchetype(archetype);
    setActiveTool('polygon3d');
    togglePanel('buildingCatalog', false);
    if (mapInstance && mapInstance.getPitch() < 40) {
      mapInstance.easeTo({ pitch: 60 });
    }
    setToast(`Draw polygon footprint for ${label}, then click the first point to close`);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-4xl max-h-[85vh] bg-[rgba(9,16,24,0.98)] border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 text-xs text-gray-300 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-sky-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                3D Architectural Building Catalog
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-sky-300 border border-blue-400/30">
                  Architectural Suite
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Choose an architectural archetype to drop directly onto the map or draw custom footprints
              </p>
            </div>
          </div>
          <button
            onClick={() => togglePanel('buildingCatalog', false)}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Catalog Grid */}
        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {Object.values(ARCHETYPE_CONFIGS).map((cfg) => {
            const Icon = ICON_MAP[cfg.icon] || Box;
            const theme = FACADE_PALETTES[cfg.facadeTheme];
            const heightMeters = cfg.defaultFloors * cfg.floorHeight;

            return (
              <div
                key={cfg.id}
                className="bg-white/5 border border-white/10 hover:border-sky-400/50 rounded-2xl p-4 flex flex-col justify-between gap-3 transition hover:shadow-lg hover:shadow-sky-500/10 group"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center border shadow"
                      style={{
                        backgroundColor: `${theme.wall}22`,
                        borderColor: theme.border,
                        color: theme.wall,
                      }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/30">
                        {cfg.defaultFloors} Floors ({heightMeters.toFixed(0)}m)
                      </span>
                      {cfg.hasPodium && (
                        <span className="text-[9px] font-semibold text-emerald-400 flex items-center gap-1">
                          <Layers className="w-2.5 h-2.5" /> Multi-tier Podium
                        </span>
                      )}
                      {cfg.roofType === 'helipad' && (
                        <span className="text-[9px] font-semibold text-amber-400 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" /> Helipad Deck
                        </span>
                      )}
                      {cfg.roofType === 'spire' && (
                        <span className="text-[9px] font-semibold text-purple-400">
                          Crown Spire (+18m)
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-sky-300 transition">
                      {cfg.label}
                    </h3>
                    <p className="text-[11px] text-gray-400 line-clamp-2 mt-0.5">
                      {cfg.tagline}
                    </p>
                  </div>

                  {/* Architectural Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[9px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-300">
                      Facade: <span className="capitalize text-white font-medium">{cfg.facadeTheme}</span>
                    </span>
                    <span className="text-[9px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-gray-300">
                      Footprint: <span className="text-white font-medium">{cfg.baseWidth}m × {cfg.baseDepth}m</span>
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => handlePlace(cfg.id, cfg.label)}
                    className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs shadow-md shadow-blue-500/20 transition"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Place on Map
                  </button>
                  <button
                    onClick={() => handleDraw(cfg.id, cfg.label)}
                    title="Draw custom footprint with this archetype"
                    className="py-1.5 px-2.5 bg-white/10 hover:bg-white/20 text-gray-200 hover:text-white rounded-xl flex items-center justify-center transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-gray-400 text-[11px]">
          <span>Tip: Placed buildings can be edited in 3D (adjust floors, podium setbacks, facade colors) using the Shape Editor.</span>
          <button
            onClick={() => togglePanel('buildingCatalog', false)}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
