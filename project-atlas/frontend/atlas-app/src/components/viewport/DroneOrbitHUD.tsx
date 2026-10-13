'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Video, Pause, Play, FastForward, X, Camera, Compass } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

interface DroneOrbitHUDProps {
  mapInstance: any;
}

export const DroneOrbitHUD: React.FC<DroneOrbitHUDProps> = ({ mapInstance }) => {
  const { isDroneOrbiting, setDroneOrbiting, droneOrbitSpeed, setDroneOrbitSpeed } = useMapStore();
  const [isPaused, setIsPaused] = useState(false);
  const animFrameRef = useRef<number | null>(null);

  // Run orbital rotation loop
  useEffect(() => {
    if (!mapInstance || !isDroneOrbiting) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    // Set cinematic camera pitch on initial activation
    mapInstance.easeTo({
      pitch: 65,
      duration: 1200,
    });

    const rotateLoop = () => {
      if (!isPaused && mapInstance) {
        const currentBearing = mapInstance.getBearing();
        const delta = 0.15 * (droneOrbitSpeed || 1);
        mapInstance.setBearing((currentBearing + delta) % 360);
      }
      animFrameRef.current = requestAnimationFrame(rotateLoop);
    };

    animFrameRef.current = requestAnimationFrame(rotateLoop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [mapInstance, isDroneOrbiting, isPaused, droneOrbitSpeed]);

  if (!isDroneOrbiting) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1200] animate-in fade-in slide-in-from-top-4 select-none">
      <div className="bg-zinc-950/90 border border-white/20 rounded-full px-4 py-2 shadow-2xl backdrop-blur-2xl flex items-center gap-3 text-white">
        {/* Recording Indicator */}
        <div className="flex items-center gap-2 pr-2 border-r border-white/15">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="font-mono text-xs font-black tracking-wider text-white uppercase">
            360° CINEMATIC ORBIT
          </span>
        </div>

        {/* Play/Pause Control */}
        <button
          type="button"
          onClick={() => setIsPaused(!isPaused)}
          className="p-1.5 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition"
          title={isPaused ? 'Resume Orbit' : 'Pause Orbit'}
        >
          {isPaused ? <Play className="w-4 h-4 text-white" /> : <Pause className="w-4 h-4 text-white" />}
        </button>

        {/* Speed Toggle (1x / 2x) */}
        <button
          type="button"
          onClick={() => setDroneOrbitSpeed(droneOrbitSpeed === 1 ? 2 : 1)}
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border transition ${
            droneOrbitSpeed === 2
              ? 'bg-white text-black border-white shadow-sm'
              : 'bg-white/5 text-zinc-300 border-white/15 hover:text-white'
          }`}
          title="Toggle Orbit Speed"
        >
          {droneOrbitSpeed}x SPEED
        </button>

        {/* Exit Button */}
        <button
          type="button"
          onClick={() => setDroneOrbiting(false)}
          className="p-1.5 rounded-full hover:bg-white/15 text-zinc-400 hover:text-white transition ml-1"
          title="Exit Cinematic Drone View (ESC)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
