'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  MapPin,
  Navigation,
  Compass,
} from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

interface CinematicTourHUDProps {
  mapInstance: any;
}

export const CinematicTourHUD: React.FC<CinematicTourHUDProps> = ({ mapInstance }) => {
  const { activeTour, setActiveTour, setTourPoiIndex, setTourPlaying } = useMapStore();
  const [speed, setSpeed] = useState<number>(1);
  const animRef = useRef<number | null>(null);

  const currentPoi = activeTour?.pois[activeTour?.currentPoiIndex || 0];

  // Camera glide to current POI or waypoint
  useEffect(() => {
    if (!mapInstance || !activeTour || !currentPoi) return;

    // Fly camera towards current POI with dramatic street pitch
    const targetLon = currentPoi.lon;
    const targetLat = currentPoi.lat;

    // Determine road bearing from closest waypoint
    let bearing = -25;
    if (activeTour.waypoints.length > 1) {
      let closestIdx = 0;
      let minD = Infinity;
      activeTour.waypoints.forEach((wp, idx) => {
        const d = Math.hypot(wp[0] - targetLon, wp[1] - targetLat);
        if (d < minD) {
          minD = d;
          closestIdx = idx;
        }
      });
      bearing = activeTour.bearings[closestIdx] || -25;
    }

    mapInstance.flyTo({
      center: [targetLon, targetLat],
      zoom: 17.2,
      pitch: 62,
      bearing: bearing,
      duration: 3500 / speed,
      essential: true,
    });
  }, [mapInstance, activeTour?.currentPoiIndex, speed]);

  // Auto-advance POIs if tour is playing
  useEffect(() => {
    if (!activeTour || !activeTour.isPlaying) {
      if (animRef.current) clearTimeout(animRef.current);
      return;
    }

    const interval = (6500 / speed);
    animRef.current = window.setTimeout(() => {
      if (activeTour.currentPoiIndex < activeTour.pois.length - 1) {
        setTourPoiIndex(activeTour.currentPoiIndex + 1);
      } else {
        // Loop back to start
        setTourPoiIndex(0);
      }
    }, interval);

    return () => {
      if (animRef.current) clearTimeout(animRef.current);
    };
  }, [activeTour?.isPlaying, activeTour?.currentPoiIndex, speed, setTourPoiIndex]);

  if (!activeTour) return null;

  const handleNext = () => {
    if (activeTour.currentPoiIndex < activeTour.pois.length - 1) {
      setTourPoiIndex(activeTour.currentPoiIndex + 1);
    } else {
      setTourPoiIndex(0);
    }
  };

  const handlePrev = () => {
    if (activeTour.currentPoiIndex > 0) {
      setTourPoiIndex(activeTour.currentPoiIndex - 1);
    } else {
      setTourPoiIndex(activeTour.pois.length - 1);
    }
  };

  return (
    <>
      {/* Top Cinematic Flight Bar */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1200] select-none animate-in fade-in slide-in-from-top-4">
        <div className="bg-zinc-950/95 border border-white/20 rounded-full px-4 py-2 shadow-2xl backdrop-blur-2xl flex items-center gap-3 text-white">
          {/* Live Flight Indicator */}
          <div className="flex items-center gap-2 pr-2.5 border-r border-white/15">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] font-black tracking-wider text-emerald-400 uppercase leading-none">
                CINEMATIC FLYBY
              </span>
              <span className="font-bold text-xs text-white max-w-[150px] truncate leading-tight mt-0.5">
                {activeTour.streetName}
              </span>
            </div>
          </div>

          {/* Stepper Controls */}
          <button
            type="button"
            onClick={handlePrev}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition"
            title="Previous Asset"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setTourPlaying(!activeTour.isPlaying)}
            className="p-1.5 rounded-full hover:bg-white/10 text-white transition"
            title={activeTour.isPlaying ? 'Pause Tour' : 'Resume Auto Flight'}
          >
            {activeTour.isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white" />}
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition"
            title="Next Asset"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Step Counter Badge */}
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-zinc-200">
            {activeTour.currentPoiIndex + 1} / {activeTour.pois.length}
          </span>

          {/* Speed Toggle */}
          <button
            type="button"
            onClick={() => setSpeed(speed === 1 ? 2 : 1)}
            className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border border-white/15 bg-white/5 hover:bg-white/15 transition text-zinc-200"
          >
            {speed}x
          </button>

          {/* Exit Tour */}
          <button
            type="button"
            onClick={() => setActiveTour(null)}
            className="p-1.5 rounded-full hover:bg-white/15 text-zinc-400 hover:text-white transition ml-1"
            title="Exit Tour (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Holographic Active POI Beacon Card (Bottom Center) */}
      {currentPoi && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1200] max-w-md w-full px-4 pointer-events-none animate-in fade-in slide-in-from-bottom-3 select-none">
          <div className="pointer-events-auto bg-zinc-950/95 border border-white/25 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl text-white space-y-2 relative overflow-hidden">
            {/* Top Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-sky-400 to-amber-400" />

            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-400/40 text-[9px] font-mono font-bold text-emerald-300 uppercase">
                    {currentPoi.category}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400">
                    STOP {activeTour.currentPoiIndex + 1} OF {activeTour.pois.length}
                  </span>
                </div>
                <h3 className="font-extrabold text-sm text-white tracking-tight pt-1">
                  {currentPoi.name}
                </h3>
              </div>
              <div className="p-2 rounded-2xl bg-white/5 border border-white/15 text-sky-400">
                <Navigation className="w-4 h-4 transform rotate-45" />
              </div>
            </div>

            <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">
              {currentPoi.highlight || 'Prominent commercial anchor contributing to street vitality and pedestrian footfall.'}
            </p>

            <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[9px] font-mono text-zinc-400">
              <span>Coordinates: {currentPoi.lat.toFixed(4)}, {currentPoi.lon.toFixed(4)}</span>
              <span className="text-zinc-500">Auto-flyby active</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
