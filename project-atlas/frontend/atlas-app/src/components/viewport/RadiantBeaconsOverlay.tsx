'use client';

import React from 'react';
import { Flame, X } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

export const RadiantBeaconsOverlay: React.FC = () => {
  const { is3DHeatmapBeacons, toggle3DHeatmapBeacons, features } = useMapStore();

  if (!is3DHeatmapBeacons) return null;

  const markerCount = features.filter((f) => f.geometry.type === 'Point').length;

  return (
    <div className="pointer-events-none fixed top-16 right-6 z-[20] select-none animate-in fade-in slide-in-from-right-3">
      <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/85 border border-rose-500/40 text-rose-300 font-mono text-[10px] tracking-wider uppercase backdrop-blur-md shadow-2xl">
        <Flame className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
        <span>3D Radiant Sky Beacons ({markerCount} POIs active)</span>
        <button
          type="button"
          onClick={() => toggle3DHeatmapBeacons(false)}
          className="text-zinc-400 hover:text-white text-xs ml-1"
          title="Disable Radiant Beacons"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
