'use client';

import React, { useEffect, useState } from 'react';
import { Ruler, Building, Compass, Layers, X } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

interface HeightCaliperHUDProps {
  mapInstance: any;
}

export const HeightCaliperHUD: React.FC<HeightCaliperHUDProps> = ({ mapInstance }) => {
  const { isHeightCaliperEnabled, toggleHeightCaliper, selectedId, features } = useMapStore();
  const [mapTelemetry, setMapTelemetry] = useState({
    pitch: 60,
    bearing: -15,
    zoom: 14,
    altitudeEstimate: 420,
  });

  useEffect(() => {
    if (!mapInstance || !isHeightCaliperEnabled) return;

    const updateTelemetry = () => {
      const p = Math.round(mapInstance.getPitch());
      const b = Math.round(mapInstance.getBearing());
      const z = parseFloat(mapInstance.getZoom().toFixed(1));
      const alt = Math.round(40000 / Math.pow(2, z - 10));
      setMapTelemetry({ pitch: p, bearing: b, zoom: z, altitudeEstimate: alt });
    };

    updateTelemetry();
    mapInstance.on('move', updateTelemetry);
    mapInstance.on('pitch', updateTelemetry);
    mapInstance.on('rotate', updateTelemetry);

    return () => {
      mapInstance.off('move', updateTelemetry);
      mapInstance.off('pitch', updateTelemetry);
      mapInstance.off('rotate', updateTelemetry);
    };
  }, [mapInstance, isHeightCaliperEnabled]);

  if (!isHeightCaliperEnabled) return null;

  const selectedFeature = features.find((f) => f.id === selectedId);
  const featureHeight = selectedFeature?.props?.height || 45;
  const storeys = Math.max(1, Math.round(featureHeight / 3.2));

  return (
    <aside
      aria-label="3D Height Caliper Telemetry HUD"
      className="fixed left-6 bottom-10 z-[20] flex flex-col gap-2 pointer-events-none select-none"
    >
      <div className="pointer-events-auto bg-[#0c1322] border border-cyan-400/40 rounded-2xl p-3.5 shadow-2xl backdrop-blur-xl text-white w-64">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-1.5 text-cyan-400">
            <Ruler className="w-4 h-4" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider">3D Height Caliper</span>
          </div>
          <button
            type="button"
            onClick={() => toggleHeightCaliper(false)}
            className="text-zinc-400 hover:text-white p-0.5"
            title="Close Caliper HUD"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Selected 3D Structure Telemetry */}
        <div className="py-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 flex items-center gap-1">
              <Building className="w-3.5 h-3.5 text-sky-400" />
              <span>Target Height</span>
            </span>
            <span className="font-mono font-black text-cyan-300">
              {featureHeight}m <span className="text-[10px] text-zinc-400">({Math.round(featureHeight * 3.28)}ft)</span>
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Est. Storeys</span>
            </span>
            <span className="font-mono font-bold text-white">{storeys} Floors</span>
          </div>

          {/* Visual Caliper Measurement Tape */}
          <div className="pt-1">
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden flex">
              <div
                className="bg-gradient-to-r from-sky-400 to-cyan-300 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (featureHeight / 120) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[8px] font-mono text-zinc-500 pt-0.5">
              <span>0m</span>
              <span>30m</span>
              <span>60m</span>
              <span>120m+</span>
            </div>
          </div>
        </div>

        {/* Real-time Viewport Telemetry */}
        <div className="pt-2 border-t border-white/10 grid grid-cols-3 gap-1 text-[10px] font-mono text-zinc-300">
          <div className="bg-white/5 rounded-lg p-1 text-center">
            <div className="text-[8px] text-zinc-400 uppercase">Pitch</div>
            <div className="font-bold text-cyan-300">{mapTelemetry.pitch}°</div>
          </div>
          <div className="bg-white/5 rounded-lg p-1 text-center">
            <div className="text-[8px] text-zinc-400 uppercase">Azimuth</div>
            <div className="font-bold text-amber-300">{mapTelemetry.bearing}°</div>
          </div>
          <div className="bg-white/5 rounded-lg p-1 text-center">
            <div className="text-[8px] text-zinc-400 uppercase">Altitude</div>
            <div className="font-bold text-emerald-300">~{mapTelemetry.altitudeEstimate}m</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
