'use client';

import React from 'react';
import { Camera } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

export const TiltShiftOverlay: React.FC = () => {
  const { isTiltShiftEnabled, toggleTiltShift } = useMapStore();

  if (!isTiltShiftEnabled) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[15] select-none overflow-hidden">
      {/* Top optical blur band */}
      <div className="absolute top-0 left-0 right-0 h-[24vh] backdrop-blur-[5px] [mask-image:linear-gradient(to_bottom,black_0%,rgba(0,0,0,0.85)_40%,transparent_100%)]" />
      {/* Bottom optical blur band */}
      <div className="absolute bottom-0 left-0 right-0 h-[24vh] backdrop-blur-[5px] [mask-image:linear-gradient(to_top,black_0%,rgba(0,0,0,0.85)_40%,transparent_100%)]" />
      {/* Subtle lens vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_60%,rgba(0,0,0,0.35)_100%)]" />

      {/* Floating Indicator */}
      <div className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/85 border border-amber-400/40 text-amber-300 font-mono text-[10px] tracking-wider uppercase backdrop-blur-md shadow-2xl">
        <Camera className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
        <span>Tilt-Shift Scale Model Active</span>
        <button
          type="button"
          onClick={() => toggleTiltShift(false)}
          className="text-zinc-400 hover:text-white text-xs ml-1.5"
          title="Disable Tilt-Shift"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
