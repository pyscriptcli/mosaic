'use client';

import React from 'react';
import {
  Sun,
  Layers,
  Video,
  Compass,
  Eye,
  CloudSun,
  Camera,
  Sparkles,
  Mountain,
} from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

interface ViewportStudioDockProps {
  mapInstance: any;
}

export const ViewportStudioDock: React.FC<ViewportStudioDockProps> = ({ mapInstance }) => {
  const {
    isSunDialOpen,
    toggleSunDial,
    isSatelliteXRayActive,
    toggleSatelliteXRay,
    setBasemap,
    currentBasemap,
    isDroneOrbiting,
    setDroneOrbiting,
    isFogEnabled,
    toggleFog,
    is3DMode,
    set3DMode,
    setToast,
  } = useMapStore();

  // Toggle Google Satellite Mode
  const handleToggleSatelliteXRay = () => {
    if (isSatelliteXRayActive) {
      toggleSatelliteXRay(false);
      setBasemap('Midnight Blue');
      setToast('Returned to Midnight Blue 3D Vector theme.');
    } else {
      toggleSatelliteXRay(true);
      setBasemap('Google Satellite');
      setToast('Activated Google Ultra-HD Satellite with editable vector roads.');
    }
  };

  // Toggle Cinematic 360° Drone Flyby
  const handleToggleDroneOrbit = () => {
    if (isDroneOrbiting) {
      setDroneOrbiting(false);
      setToast('Exited cinematic orbit.');
    } else {
      setDroneOrbiting(true);
      setToast('Starting 360° cinematic orbital flyby.');
    }
  };

  // Toggle 2D / 3D camera pitch
  const handleTogglePitch = () => {
    if (!mapInstance) return;
    const currentPitch = mapInstance.getPitch();
    if (currentPitch > 20) {
      mapInstance.easeTo({ pitch: 0, duration: 800 });
      set3DMode(false);
      setToast('Camera aligned to 2D Top-Down Ortho view.');
    } else {
      mapInstance.easeTo({ pitch: 60, duration: 800 });
      set3DMode(true);
      setToast('Camera pitched to 60° 3D Isometric view.');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[1000] flex items-center gap-1.5 p-1.5 bg-black/75 border border-white/15 rounded-full shadow-2xl backdrop-blur-2xl text-white select-none transition hover:border-white/30">
      {/* 1. Sun & Shadow Simulation (Sky Arc) */}
      <button
        type="button"
        onClick={() => toggleSunDial()}
        className={`px-3 py-2 rounded-full font-bold text-xs transition flex items-center gap-1.5 ${
          isSunDialOpen
            ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/20 font-black'
            : 'text-zinc-300 hover:text-white hover:bg-white/10'
        }`}
        title="Open Celestial Sun Dial & Shadow Simulation"
      >
        <Sun className={`w-3.5 h-3.5 ${isSunDialOpen ? 'text-black' : 'text-amber-400'}`} />
        <span className="hidden sm:inline">Sun Dial</span>
      </button>

      {/* 2. Google HD Satellite Mode */}
      <button
        type="button"
        onClick={handleToggleSatelliteXRay}
        className={`px-3 py-2 rounded-full font-bold text-xs transition flex items-center gap-1.5 ${
          isSatelliteXRayActive || currentBasemap === 'Google Satellite'
            ? 'bg-sky-400 text-black shadow-lg shadow-sky-400/20 font-black'
            : 'text-zinc-300 hover:text-white hover:bg-white/10'
        }`}
        title="Toggle Google Ultra-HD Satellite View"
      >
        <Eye className={`w-3.5 h-3.5 ${isSatelliteXRayActive ? 'text-black' : 'text-sky-400'}`} />
        <span className="hidden sm:inline">Satellite</span>
      </button>

      {/* 3. Cinematic 360° Drone Orbit */}
      <button
        type="button"
        onClick={handleToggleDroneOrbit}
        className={`px-3 py-2 rounded-full font-bold text-xs transition flex items-center gap-1.5 ${
          isDroneOrbiting
            ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse font-black'
            : 'text-zinc-300 hover:text-white hover:bg-white/10'
        }`}
        title="Launch 360° Cinematic Drone Flyby"
      >
        <Video className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">360° Orbit</span>
      </button>

      {/* Divider */}
      <div className="w-[1px] h-5 bg-white/15 mx-0.5" />

      {/* 4. 2D / 3D Perspective Pitch */}
      <button
        type="button"
        onClick={handleTogglePitch}
        className="px-2.5 py-2 rounded-full font-mono font-bold text-xs text-zinc-300 hover:text-white hover:bg-white/10 transition flex items-center gap-1"
        title="Toggle 2D Top-Down / 3D Isometric Camera Pitch"
      >
        <Compass className="w-3.5 h-3.5 text-zinc-400" />
        <span>{is3DMode ? '3D' : '2D'}</span>
      </button>

      {/* 5. Atmospheric Horizon Fog Toggle */}
      <button
        type="button"
        onClick={() => {
          toggleFog();
          setToast(isFogEnabled ? 'Atmospheric fog disabled.' : 'Atmospheric horizon fog enabled.');
        }}
        className={`p-2 rounded-full transition ${
          isFogEnabled
            ? 'text-white bg-white/10'
            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
        }`}
        title={isFogEnabled ? 'Atmospheric Horizon Fog Active' : 'Enable Horizon Fog'}
      >
        <CloudSun className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
