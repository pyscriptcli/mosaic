'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapCanvas } from '../components/map/MapCanvas';
import { TopToolbar } from '../components/toolbar/TopToolbar';
import { DataBrowserPanel } from '../components/panels/DataBrowserPanel';
import { MyLayersPanel } from '../components/panels/MyLayersPanel';
import { MapContextMenu } from '../components/map/MapContextMenu';
import { FeaturePopup } from '../components/map/FeaturePopup';
import { ShapeEditorModal } from '../components/modals/ShapeEditorModal';
import { TradeAreaSidebar } from '../components/panels/TradeAreaSidebar';
import { AttributeTableModal } from '../components/modals/AttributeTableModal';
import { BasemapModal } from '../components/modals/BasemapModal';
import { WorkspaceLauncherModal } from '../components/modals/WorkspaceLauncherModal';
import { BuildingCatalogModal } from '../components/modals/BuildingCatalogModal';
import { CinematicClusterOverlay } from '../components/map/CinematicClusterOverlay';
import { SunDialWidget } from '../components/viewport/SunDialWidget';
import { DroneOrbitHUD } from '../components/viewport/DroneOrbitHUD';
import { CinematicTourHUD } from '../components/viewport/CinematicTourHUD';
import { TiltShiftOverlay } from '../components/viewport/TiltShiftOverlay';
import { HeightCaliperHUD } from '../components/viewport/HeightCaliperHUD';
import { RadiantBeaconsOverlay } from '../components/viewport/RadiantBeaconsOverlay';
import { useMapStore } from '../store/useMapStore';
import { useProjectStore } from '../store/useProjectStore';
import { normalizeGeoJSON } from '../gis/importExport';

export default function WorkspacePage() {
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isDirty,
    toastMessage,
    setToast,
    undo,
    redo,
    setActiveTool,
    closeContextMenu,
    features,
    setFeatures,
  } = useMapStore();

  const { fetchProjects, saveCurrentProject } = useProjectStore();

  // Load the saved workspace before mounting MapLibre so its first style is
  // the user's saved basemap instead of the store's default style.
  useEffect(() => {
    let mounted = true;
    fetchProjects().finally(() => {
      if (mounted) setWorkspaceReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [fetchProjects]);

  // Auto-save every 20 seconds if dirty
  useEffect(() => {
    const timer = setInterval(() => {
      if (isDirty) {
        saveCurrentProject(mapInstance);
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [isDirty, mapInstance]);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveCurrentProject(mapInstance);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Escape') {
        closeContextMenu();
        setActiveTool(null);
        useMapStore.getState().setDroneOrbiting(false);
        useMapStore.getState().closeAllPanels();
        useMapStore.getState().setActiveTour(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mapInstance]);

  // Handle spatial file imports
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setToast(`Importing ${file.name}...`);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const geojson = data.type === 'FeatureCollection' ? data : { type: 'FeatureCollection', features: [data] };

      const maxId = features.reduce((m, f) => Math.max(m, f.id || 0), 0);
      const imported = normalizeGeoJSON(geojson, maxId);

      setFeatures([...features, ...imported]);
      setToast(`Imported ${imported.length} spatial features successfully!`);
    } catch (err: any) {
      setToast('Import failed: Ensure valid GeoJSON format.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <main className="app-shell relative w-screen h-screen overflow-hidden bg-transparent">
      {!workspaceReady ? (
        <div className="absolute inset-0 z-[10000] flex items-center justify-center bg-[#0a0d12] text-[#f5f5f7]">
          <div className="flex items-center gap-3 rounded-2xl bg-white/90 px-5 py-4 shadow-lg ring-1 ring-white/10">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#3a3a3c] border-t-[#0a84ff]" />
            <span className="text-sm font-medium">Loading your workspace...</span>
          </div>
        </div>
      ) : (
        <>
      {/* Hidden Spatial Data File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileImport}
        accept=".geojson,.json,.kml,.kmz"
        className="hidden"
      />

      {/* MapLibre Canvas Viewport */}
      <MapCanvas onMapReady={setMapInstance} />

      {/* Top Floating Pill Toolbar */}
      <TopToolbar
        mapInstance={mapInstance}
      />

      {/* Left Panels */}
      <DataBrowserPanel
        mapInstance={mapInstance}
        onImportClick={() => fileInputRef.current?.click()}
      />
      <MyLayersPanel mapInstance={mapInstance} />

      {/* Context Menu & Feature Inspection Popup */}
      <MapContextMenu />
      <FeaturePopup />

      {/* Floating Modals & Sidebars */}
      <ShapeEditorModal />
      <TradeAreaSidebar mapInstance={mapInstance} />
      <AttributeTableModal />
      <BasemapModal mapInstance={mapInstance} />
      <WorkspaceLauncherModal />
      <BuildingCatalogModal mapInstance={mapInstance} />
      <CinematicClusterOverlay mapInstance={mapInstance} />

      {/* Visual Excellence Suite: Studio Deck, Drone Orbit, Tilt-Shift & Caliper HUD */}
      <SunDialWidget />
      <DroneOrbitHUD mapInstance={mapInstance} />
      <TiltShiftOverlay />
      <HeightCaliperHUD mapInstance={mapInstance} />
      <RadiantBeaconsOverlay />

      <CinematicTourHUD mapInstance={mapInstance} />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] px-4 py-2 bg-[rgba(9,16,24,0.98)] border border-white/20 text-white font-semibold text-xs rounded-full shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          {toastMessage}
        </div>
      )}
        </>
      )}
    </main>
  );
}
