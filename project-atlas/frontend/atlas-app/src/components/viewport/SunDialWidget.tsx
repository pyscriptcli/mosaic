'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Play,
  Pause,
  X,
  Compass,
  Mountain,
  Eye,
  Video,
  CloudSun,
  Sparkles,
  Ruler,
  Camera,
  Flame,
} from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import { calculateSolarLighting, formatSolarTime } from '../../gis/sunCalc';
import { RouteAnimationControls } from './RouteAnimationControls';

export const SunDialWidget: React.FC = () => {
  const {
    solarTime,
    setSolarTime,
    isSunDialOpen,
    toggleSunDial,
    is3DTerrain,
    toggleTerrain,
    isSatelliteXRayActive,
    toggleSatelliteXRay,
    setBasemap,
    currentBasemap,
    isDroneOrbiting,
    setDroneOrbiting,
    isFogEnabled,
    toggleFog,
    isSmartHeightFilter,
    toggleSmartHeightFilter,
    isNightGlowEnabled,
    toggleNightGlow,
    isHeightCaliperEnabled,
    toggleHeightCaliper,
    isTiltShiftEnabled,
    toggleTiltShift,
    is3DHeatmapBeacons,
    toggle3DHeatmapBeacons,
    setToast,
    selectedId,
    features,
  } = useMapStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const selectedRoute = features.find((feature) => feature.id === selectedId && feature.kind === 'route');
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const arcRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Time lapse auto play
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setSolarTime((useMapStore.getState().solarTime + 0.1) % 24);
      }, 100);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, setSolarTime]);

  if (!isSunDialOpen) return null;

  // Calculate current solar stats
  const solarStats = calculateSolarLighting(solarTime);

  // Arc math: semi-circle from left (East / Sunrise 06:00) to top (Noon 12:00) to right (West / Sunset 18:00)
  const daylightHours = Math.max(6, Math.min(18, solarTime));
  const daylightProgress = (daylightHours - 6) / 12; // 0 to 1
  const angleRad = Math.PI - daylightProgress * Math.PI; // PI (left) -> PI/2 (top) -> 0 (right)

  // Arc dimensions
  const cx = 140;
  const cy = 100;
  const r = 80;
  const sunX = cx + r * Math.cos(angleRad);
  const sunY = cy - r * Math.sin(angleRad);

  // Handle pointer dragging on celestial arc
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging && e.type !== 'pointerdown') return;
    if (!arcRef.current) return;

    const rect = arcRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - (cx * rect.width) / 280;
    const y = cy * (rect.height / 115) - (e.clientY - rect.top);

    let angle = Math.atan2(y, -x);
    if (angle < 0) angle = 0;
    if (angle > Math.PI) angle = Math.PI;

    const progress = 1 - angle / Math.PI;
    const hours = 6 + progress * 12;
    setSolarTime(parseFloat(hours.toFixed(2)));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Quick preset jumpers
  const presets = [
    { label: 'Dawn', time: 6.5, icon: '🌅' },
    { label: 'Morning', time: 9.0, icon: '🌤️' },
    { label: 'Noon', time: 12.0, icon: '☀️' },
    { label: 'Golden', time: 17.25, icon: '🌇' },
    { label: 'Night', time: 21.0, icon: '🌙' },
  ];

  // Google Satellite toggle
  const handleToggleSatellite = () => {
    if (isSatelliteXRayActive || currentBasemap === 'Google Satellite') {
      toggleSatelliteXRay(false);
      setBasemap('Midnight Blue');
      setToast('Switched to Midnight Blue 3D Vector theme.');
    } else {
      toggleSatelliteXRay(true);
      setBasemap('Google Satellite');
      setToast('Activated Google Ultra-HD Satellite with editable vector roads.');
    }
  };

  return (
    <div
      className="fixed top-16 left-1/2 -translate-x-1/2 z-[1100] w-[360px] max-w-[94vw] max-h-[calc(100vh-5rem)] overflow-y-auto bg-[#0c1322] border border-white/20 rounded-3xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.95)] backdrop-blur-2xl text-white select-none"
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400">
            <Sun className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-extrabold text-xs tracking-tight text-white flex items-center gap-1.5">
              <span>Studio Mode</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-white/10 text-zinc-300 font-normal">
                3D Lighting
              </span>
            </h4>
            <p className="text-[9.5px] text-zinc-400">Solar pathing, 3D shadows &amp; visual realism</p>
          </div>
        </div>
        <button
          onClick={() => toggleSunDial(false)}
          className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
          title="Close Studio Menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {selectedRoute ? (
        <div className="mb-3"><RouteAnimationControls route={selectedRoute} collapsible /></div>
      ) : (
        <details className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            <span className="flex-1">route animation</span><span className="text-[10px] font-normal text-zinc-400">select a route</span>
          </summary>
          <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-zinc-400">select a route on the map or in my layers to configure playback.</p>
        </details>
      )}

      {/* Interactive Celestial Arc Canvas */}
      <div className="relative py-1 flex flex-col items-center">
        <svg
          ref={arcRef}
          viewBox="0 0 280 115"
          className="w-full h-28 cursor-pointer touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
          <defs>
            <linearGradient id="sunArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#fef08a" stopOpacity="1" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
            </linearGradient>
            <radialGradient id="sunGlow">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Horizon Reference Line */}
          <line
            x1="35"
            y1={cy}
            x2="245"
            y2={cy}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />

          <text x="36" y={cy + 12} fill="#9ca3af" fontSize="8" fontWeight="bold" textAnchor="middle">
            EAST (06:00)
          </text>
          <text x="140" y="14" fill="#9ca3af" fontSize="8" fontWeight="bold" textAnchor="middle">
            ZENITH (12:00)
          </text>
          <text x="244" y={cy + 12} fill="#9ca3af" fontSize="8" fontWeight="bold" textAnchor="middle">
            WEST (18:00)
          </text>

          {/* Semicircle Track */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Illuminated Arc Progress */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="url(#sunArcGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Connecting Ray */}
          <line
            x1={cx}
            y1={cy}
            x2={sunX}
            y2={sunY}
            stroke={solarStats.lightColor}
            strokeWidth="1.5"
            strokeOpacity="0.4"
            strokeDasharray="2 2"
          />

          {/* Center Pivot Marker */}
          <circle cx={cx} cy={cy} r="2.5" fill="#ffffff" opacity="0.6" />

          {/* Sun Halo Pulse */}
          <circle cx={sunX} cy={sunY} r="16" fill="url(#sunGlow)" opacity="0.4" />

          {/* Draggable Sun Puck */}
          <circle
            cx={sunX}
            cy={sunY}
            r="7.5"
            fill={solarStats.lightColor}
            stroke="#ffffff"
            strokeWidth="2"
            className="filter drop-shadow-md cursor-grab active:cursor-grabbing"
          />
        </svg>

        {/* Current Time Badge & Solar Telemetry */}
        <div className="w-full flex items-center justify-between px-2 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-black text-white">
              {formatSolarTime(solarTime)}
            </span>
            <span
              className="text-[8.5px] font-mono px-1.5 py-0.2 rounded border border-white/20 uppercase"
              style={{ color: solarStats.lightColor, borderColor: solarStats.lightColor }}
            >
              Alt: {Math.round(solarStats.altitudeDeg)}° • Az: {Math.round(solarStats.azimuthDeg)}°
            </span>
          </div>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1 ${
              isPlaying
                ? 'bg-amber-400 text-black border-amber-300 shadow-md'
                : 'bg-white/5 hover:bg-white/15 border-white/15 text-zinc-300'
            }`}
            title="Auto Solar Timelapse"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="text-[9.5px]">{isPlaying ? 'Stop' : 'Timelapse'}</span>
          </button>
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="pt-2 border-t border-white/10 grid grid-cols-5 gap-1">
        {presets.map((p) => {
          const isActive = Math.abs(solarTime - p.time) < 0.75;
          return (
            <button
              key={p.label}
              onClick={() => {
                setIsPlaying(false);
                setSolarTime(p.time);
              }}
              className={`py-1.5 px-1 rounded-xl text-[9.5px] font-semibold transition flex flex-col items-center gap-0.5 border ${
                isActive
                  ? 'bg-white text-black border-white shadow-md font-bold'
                  : 'bg-white/[0.03] text-zinc-400 border-white/10 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className="text-xs">{p.icon}</span>
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* Studio Environment Toggles Deck */}
      <div className="pt-2.5 mt-2 border-t border-white/10 grid grid-cols-3 gap-1.5">
        {/* 1. 3D Terrain Elevation */}
        <button
          type="button"
          onClick={() => {
            toggleTerrain();
            setToast(is3DTerrain ? '3D terrain elevation disabled.' : '3D terrain elevation mesh enabled.');
          }}
          className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition flex items-center justify-center gap-1.5 ${
            is3DTerrain
              ? 'bg-emerald-400/20 text-emerald-300 border-emerald-400/40 shadow-sm'
              : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
          }`}
          title="Toggle 3D Elevation Terrain Mesh"
        >
          <Mountain className="w-3.5 h-3.5" />
          <span>3D Terrain</span>
        </button>

        {/* 2. 3D Satellite X-Ray */}
        <button
          type="button"
          onClick={handleToggleSatellite}
          className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition flex items-center justify-center gap-1.5 ${
            isSatelliteXRayActive || currentBasemap === 'Satellite 3D X-Ray'
              ? 'bg-sky-400 text-black border-sky-300 shadow-sm font-extrabold'
              : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
          }`}
          title="Toggle 3D Satellite Mode"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>3D Satellite</span>
        </button>

        {/* 3. 360° Drone Orbit */}
        <button
          type="button"
          onClick={() => {
            setDroneOrbiting(!isDroneOrbiting);
            toggleSunDial(false);
          }}
          className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition flex items-center justify-center gap-1.5 ${
            isDroneOrbiting
              ? 'bg-red-500 text-white border-red-400 shadow-sm'
              : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
          }`}
          title="Launch 360° Drone Orbit"
        >
          <Video className="w-3.5 h-3.5" />
          <span>360° Orbit</span>
        </button>
      </div>

      {/* Visual FX & Realism Quick Chips */}
      <div className="pt-2 mt-2 border-t border-white/10">
        <div className="flex items-center justify-between pb-1 px-0.5">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Visual FX &amp; Realism
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {/* Smart Height Filter */}
          <button
            type="button"
            onClick={() => toggleSmartHeightFilter()}
            className={`py-1 px-2 rounded-xl text-[9.5px] font-medium border flex items-center justify-between transition ${
              isSmartHeightFilter
                ? 'bg-emerald-400/20 text-emerald-300 border-emerald-400/40'
                : 'bg-white/5 text-zinc-400 border-white/10'
            }`}
          >
            <span className="truncate">Smart Height</span>
            <span className="text-[8px] font-mono font-bold px-1 rounded bg-white/10">
              {isSmartHeightFilter ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Night Glow */}
          <button
            type="button"
            onClick={() => toggleNightGlow()}
            className={`py-1 px-2 rounded-xl text-[9.5px] font-medium border flex items-center justify-between transition ${
              isNightGlowEnabled
                ? 'bg-indigo-400/20 text-indigo-300 border-indigo-400/40'
                : 'bg-white/5 text-zinc-400 border-white/10'
            }`}
          >
            <span className="truncate">Night Glow</span>
            <span className="text-[8px] font-mono font-bold px-1 rounded bg-white/10">
              {isNightGlowEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Height Caliper */}
          <button
            type="button"
            onClick={() => toggleHeightCaliper()}
            className={`py-1 px-2 rounded-xl text-[9.5px] font-medium border flex items-center justify-between transition ${
              isHeightCaliperEnabled
                ? 'bg-cyan-400/20 text-cyan-300 border-cyan-400/40'
                : 'bg-white/5 text-zinc-400 border-white/10'
            }`}
          >
            <span className="truncate">Height Caliper</span>
            <span className="text-[8px] font-mono font-bold px-1 rounded bg-white/10">
              {isHeightCaliperEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Tilt-Shift */}
          <button
            type="button"
            onClick={() => toggleTiltShift()}
            className={`py-1 px-2 rounded-xl text-[9.5px] font-medium border flex items-center justify-between transition ${
              isTiltShiftEnabled
                ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                : 'bg-white/5 text-zinc-400 border-white/10'
            }`}
          >
            <span className="truncate">Tilt-Shift Diorama</span>
            <span className="text-[8px] font-mono font-bold px-1 rounded bg-white/10">
              {isTiltShiftEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Radiant Beacons */}
          <button
            type="button"
            onClick={() => toggle3DHeatmapBeacons()}
            className={`col-span-2 py-1 px-2 rounded-xl text-[9.5px] font-medium border flex items-center justify-between transition ${
              is3DHeatmapBeacons
                ? 'bg-rose-400/20 text-rose-300 border-rose-400/40'
                : 'bg-white/5 text-zinc-400 border-white/10'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Flame className="w-3 h-3 text-rose-400" />
              <span>3D Radiant POI Sky Beacons</span>
            </span>
            <span className="text-[8px] font-mono font-bold px-1 rounded bg-white/10">
              {is3DHeatmapBeacons ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
