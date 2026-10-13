'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { MapCanvas } from '../map/MapCanvas';
import { TopToolbar } from '../toolbar/TopToolbar';
import { DataBrowserPanel } from '../panels/DataBrowserPanel';
import { MyLayersPanel } from '../panels/MyLayersPanel';
import { MapContextMenu } from '../map/MapContextMenu';
import { FeaturePopup } from '../map/FeaturePopup';
import { ShapeEditorModal } from '../modals/ShapeEditorModal';
import { TradeAreaSidebar } from '../panels/TradeAreaSidebar';
import { AttributeTableModal } from '../modals/AttributeTableModal';
import { BasemapModal } from '../modals/BasemapModal';
import { BuildingCatalogModal } from '../modals/BuildingCatalogModal';
import { CinematicClusterOverlay } from '../map/CinematicClusterOverlay';
import { SunDialWidget } from '../viewport/SunDialWidget';
import { DroneOrbitHUD } from '../viewport/DroneOrbitHUD';
import { CinematicTourHUD } from '../viewport/CinematicTourHUD';
import { TiltShiftOverlay } from '../viewport/TiltShiftOverlay';
import { HeightCaliperHUD } from '../viewport/HeightCaliperHUD';
import { RadiantBeaconsOverlay } from '../viewport/RadiantBeaconsOverlay';
import { ALL_STYLES } from '../../gis/map';
import { exportFeatureCollection, importFeatureCollection, validateFeatureCollection, type GeoJsonFeatureCollection } from '../../gis/embeddedGeoJson';
import { normalizeGeoJSON } from '../../gis/importExport';
import { useMapStore } from '../../store/useMapStore';

type Mode = 'view' | 'edit';
type InitMessage = { type: 'atlas:init'; protocolVersion: 1; sessionId: string; mode: Mode; revision: string | number; data: GeoJsonFeatureCollection; projectName?: string; basemap?: string; camera?: { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number } };
type ParentMessage = InitMessage | { type: 'atlas:set-mode'; protocolVersion: 1; sessionId: string; mode: Mode } | { type: 'atlas:replace-data'; protocolVersion: 1; sessionId: string; revision: string | number; data: GeoJsonFeatureCollection } | { type: 'atlas:saved'; protocolVersion: 1; sessionId: string; revision: string | number; changeId: string } | { type: 'atlas:revision'; protocolVersion: 1; sessionId: string; revision: string | number };

const DEFAULT_ALLOWED_ORIGINS = ['https://project-echo-next.vercel.app', 'http://localhost:3100', 'http://localhost:3101'];
const allowedOrigins = (process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
  .split(',').map((origin) => origin.trim()).filter(Boolean);
function messageIsValid(value: unknown): value is ParentMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (message.protocolVersion !== 1 || typeof message.sessionId !== 'string' || message.sessionId.length > 160) return false;
  if (message.type === 'atlas:init') {
    if (!['view', 'edit'].includes(String(message.mode)) || (typeof message.revision !== 'string' && typeof message.revision !== 'number') || !validateFeatureCollection(message.data)) return false;
    if (message.projectName !== undefined && (typeof message.projectName !== 'string' || message.projectName.length > 160)) return false;
    if (message.basemap !== undefined && (typeof message.basemap !== 'string' || !Object.hasOwn(ALL_STYLES, message.basemap))) return false;
    if (message.camera !== undefined) {
      if (!message.camera || typeof message.camera !== 'object') return false;
      const camera = message.camera as Record<string, unknown>;
      if (camera.center !== undefined && (!Array.isArray(camera.center) || camera.center.length !== 2 || !Number.isFinite(camera.center[0]) || !Number.isFinite(camera.center[1]) || Math.abs(Number(camera.center[0])) > 180 || Math.abs(Number(camera.center[1])) > 85)) return false;
      if (camera.zoom !== undefined && (!Number.isFinite(camera.zoom) || Number(camera.zoom) < 0 || Number(camera.zoom) > 24)) return false;
      if (camera.pitch !== undefined && (!Number.isFinite(camera.pitch) || Number(camera.pitch) < 0 || Number(camera.pitch) > 85)) return false;
      if (camera.bearing !== undefined && !Number.isFinite(camera.bearing)) return false;
    }
    return true;
  }
  if (message.type === 'atlas:replace-data') return (typeof message.revision === 'string' || typeof message.revision === 'number') && validateFeatureCollection(message.data);
  if (message.type === 'atlas:saved') return (typeof message.revision === 'string' || typeof message.revision === 'number') && typeof message.changeId === 'string';
  if (message.type === 'atlas:revision') return typeof message.revision === 'string' || typeof message.revision === 'number';
  return message.type === 'atlas:set-mode' && (message.mode === 'view' || message.mode === 'edit');
}

export default function EmbeddedGisEditor() {
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [status, setStatus] = useState('Waiting for project data…');
  const [mode, setMode] = useState<Mode>('view');
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [basemap, setBasemap] = useState('Midnight Blue');
  const [projectName, setProjectName] = useState('Project map');
  const [storeChangeSequence, setStoreChangeSequence] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<InitMessage['camera']>(undefined);
  const pendingLoadedRef = useRef<{ sessionId: string; revision: string | number } | null>(null);
  const revisionRef = useRef<string | number>('');
  const metadataRef = useRef<Record<string, unknown>>({});
  const suppressRef = useRef(false);
  const lastChangeSequence = useRef(0);
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeMode = useMapStore((state) => state.embeddedMode);
  const tool = useMapStore((state) => state.activeTool);
  const setStoreTool = useMapStore((state) => state.setActiveTool);
  const setBasemapStore = useMapStore((state) => state.setBasemap);
  const toastMessage = useMapStore((state) => state.toastMessage);
  const undo = useMapStore((state) => state.undo);
  const redo = useMapStore((state) => state.redo);

  const parentOrigin = useMemo(() => {
    const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('parentOrigin');
    let inferred = query;
    if (!inferred && typeof document !== 'undefined' && document.referrer) {
      try { inferred = new URL(document.referrer).origin; } catch { inferred = null; }
    }
    return inferred && allowedOrigins.includes(inferred) ? inferred : null;
  }, []);

  useEffect(() => {
    if (!parentOrigin || window.parent === window) {
      setStatus('This map must be opened inside an approved Project Echo workspace.');
      return;
    }
    const send = (payload: Record<string, unknown>) => window.parent.postMessage(payload, parentOrigin);
    const readyPayload = { type: 'atlas:ready', protocolVersion: 1 };
    window.parent.postMessage(readyPayload, parentOrigin);
    const readyTimer = window.setInterval(() => { if (!ready) window.parent.postMessage(readyPayload, parentOrigin); }, 800);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== parentOrigin || event.source !== window.parent || !messageIsValid(event.data)) return;
      const message = event.data;
      if (message.type === 'atlas:init') {
        if (ready && sessionId && message.sessionId !== sessionId) return;
        suppressRef.current = true;
        const imported = importFeatureCollection(message.data);
        metadataRef.current = imported.metadata;
        revisionRef.current = message.revision;
        setSessionId(message.sessionId);
        setMode(message.mode);
        setProjectName(message.projectName || 'Project map');
        cameraRef.current = message.camera;
        setBasemap(message.basemap && Object.hasOwn(ALL_STYLES, message.basemap) ? message.basemap : 'Midnight Blue');
        useMapStore.getState().setEmbeddedMode(message.mode);
        useMapStore.getState().replaceEmbeddedFeatures(imported.features);
        useMapStore.setState({ currentBasemap: message.basemap && Object.hasOwn(ALL_STYLES, message.basemap) ? message.basemap : 'Midnight Blue', isDirty: false, saveStatus: 'saved', changeSequence: 0 });
        lastChangeSequence.current = 0;
        if (message.camera && mapInstance) mapInstance.jumpTo({ center: message.camera.center, zoom: message.camera.zoom, pitch: message.camera.pitch, bearing: message.camera.bearing });
        if (mapInstance && message.basemap && Object.hasOwn(ALL_STYLES, message.basemap)) useMapStore.getState().setBasemap(message.basemap);
        setReady(true);
        setStatus(message.mode === 'edit' ? 'Editing enabled' : 'Read-only map');
        const loadedMessage = { type: 'atlas:loaded', protocolVersion: 1, sessionId: message.sessionId, revision: message.revision };
        if (mapInstance?.loaded()) send(loadedMessage);
        else if (mapInstance) mapInstance.once('idle', () => send(loadedMessage));
        else pendingLoadedRef.current = { sessionId: message.sessionId, revision: message.revision };
        requestAnimationFrame(() => { suppressRef.current = false; });
      } else if (message.sessionId === sessionId && message.type === 'atlas:revision') {
        revisionRef.current = message.revision;
      } else if (message.sessionId === sessionId && message.type === 'atlas:saved') {
        revisionRef.current = message.revision;
        setStatus('Saved to project workspace');
      } else if (message.sessionId === sessionId && message.type === 'atlas:set-mode') {
        setMode(message.mode);
        useMapStore.getState().setEmbeddedMode(message.mode);
        setStatus(message.mode === 'edit' ? 'Editing enabled' : 'Read-only map');
      } else if (message.sessionId === sessionId && message.type === 'atlas:replace-data') {
        suppressRef.current = true;
        const imported = importFeatureCollection(message.data);
        metadataRef.current = imported.metadata;
        revisionRef.current = message.revision;
        useMapStore.getState().replaceEmbeddedFeatures(imported.features);
        useMapStore.setState({ changeSequence: lastChangeSequence.current, isDirty: false, saveStatus: 'saved' });
        setStatus('Project data refreshed');
        requestAnimationFrame(() => { suppressRef.current = false; });
      }
    };
    window.addEventListener('message', onMessage);
    return () => { window.clearInterval(readyTimer); window.removeEventListener('message', onMessage); };
  }, [parentOrigin, ready, sessionId, mapInstance]);

  useEffect(() => {
    if (!ready || !sessionId || !parentOrigin || mode !== 'edit' || suppressRef.current) return;
    const state = useMapStore.getState();
    if (state.changeSequence === lastChangeSequence.current) return;
    if (initTimerRef.current) clearTimeout(initTimerRef.current);
    initTimerRef.current = setTimeout(() => {
      const current = useMapStore.getState();
      if (suppressRef.current || current.embeddedMode !== 'edit' || current.changeSequence === lastChangeSequence.current) return;
      const data = exportFeatureCollection(current.features, metadataRef.current);
      const changeId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      window.parent.postMessage({ type: 'atlas:change', protocolVersion: 1, sessionId, baseRevision: revisionRef.current, changeId, data }, parentOrigin);
      lastChangeSequence.current = current.changeSequence;
      setStatus('Changes sent to project workspace');
    }, 250);
    return () => { if (initTimerRef.current) clearTimeout(initTimerRef.current); };
  }, [ready, sessionId, parentOrigin, mode, storeMode, storeChangeSequence]);

  useEffect(() => useMapStore.subscribe((state, previous) => {
    if (state.changeSequence !== previous.changeSequence) {
      setStoreChangeSequence(state.changeSequence);
      setStatus(state.embeddedMode === 'edit' ? 'Unsaved map changes' : 'Read-only map');
    }
  }), []);

  useEffect(() => () => useMapStore.getState().setEmbeddedMode(null), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !ready || mode !== 'edit') return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!parentOrigin) return;
        window.parent.postMessage({ type: 'atlas:save-request', protocolVersion: 1, sessionId }, parentOrigin);
        setStatus('Save GeoJSON requested in Project Echo.');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready, mode, undo, redo]);

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    useMapStore.getState().setToast(`Importing ${file.name}…`);
    try {
      const parsed = JSON.parse(await file.text());
      const collection = parsed.type === 'FeatureCollection' ? parsed : { type: 'FeatureCollection', features: [parsed] };
      if (!validateFeatureCollection(collection)) throw new Error('Invalid GeoJSON');
      const current = useMapStore.getState().features;
      const maxId = current.reduce((max, feature) => Math.max(max, feature.id || 0), 0);
      const added = normalizeGeoJSON(collection, maxId);
      useMapStore.getState().setFeatures([...current, ...added]);
      useMapStore.getState().setToast(`Imported ${added.length} map feature${added.length === 1 ? '' : 's'}.`);
    } catch {
      useMapStore.getState().setToast('Import failed. Choose a valid GeoJSON file.');
    } finally { event.target.value = ''; }
  };

  if (!parentOrigin || window.parent === window) return <div className="flex h-screen items-center justify-center bg-[#0a0d12] p-6 text-sm text-white">{status}</div>;
  const modeIsEdit = ready && mode === 'edit';
  const hostSyncStatus = /saving/i.test(status) ? 'saving' : /unsaved|sent to/i.test(status) ? 'unsaved' : /saved/i.test(status) ? 'saved' : 'host';
  return <main className="app-shell relative h-screen w-screen overflow-hidden bg-transparent">
    <input ref={fileInputRef} type="file" accept=".geojson,.json" className="hidden" onChange={handleFileImport} />
    <MapCanvas onMapReady={(map) => {
      setMapInstance(map);
      if (cameraRef.current) map.jumpTo(cameraRef.current);
      const pending = pendingLoadedRef.current;
      if (pending && parentOrigin) {
        pendingLoadedRef.current = null;
        const loadedMessage = { type: 'atlas:loaded', protocolVersion: 1, sessionId: pending.sessionId, revision: pending.revision };
        if (map.loaded()) window.parent.postMessage(loadedMessage, parentOrigin);
        else map.once('idle', () => window.parent.postMessage(loadedMessage, parentOrigin));
      }
    }} />
    {modeIsEdit ? <>
      <TopToolbar mapInstance={mapInstance} embeddedName={projectName} embeddedStatus={hostSyncStatus} />
      <DataBrowserPanel mapInstance={mapInstance} onImportClick={() => fileInputRef.current?.click()} />
      <MyLayersPanel mapInstance={mapInstance} />
      <MapContextMenu />
      <FeaturePopup />
      <ShapeEditorModal />
      <TradeAreaSidebar mapInstance={mapInstance} />
      <AttributeTableModal />
      <BasemapModal mapInstance={mapInstance} />
      <BuildingCatalogModal mapInstance={mapInstance} />
      <CinematicClusterOverlay mapInstance={mapInstance} />
      <SunDialWidget />
      <DroneOrbitHUD mapInstance={mapInstance} />
      <CinematicTourHUD mapInstance={mapInstance} />
      <TiltShiftOverlay />
      <HeightCaliperHUD mapInstance={mapInstance} />
      <RadiantBeaconsOverlay />
    </> : <header className="absolute left-3 top-3 z-[1200] flex items-center gap-3 rounded-xl border border-white/15 bg-[#111820]/95 px-3 py-2 text-white shadow-xl backdrop-blur">
      <strong className="max-w-48 truncate text-xs">{projectName}</strong><span role="status" className="text-[10px] text-slate-300">Read-only map</span>
      <select aria-label="Basemap" disabled={!ready} value={basemap} onChange={(event) => { setBasemap(event.target.value); setBasemapStore(event.target.value); }} className="h-8 rounded-md border border-white/15 bg-[#1c2732] px-2 text-[11px]">{Object.keys(ALL_STYLES).map((name) => <option key={name} value={name}>{name}</option>)}</select>
    </header>}
    {modeIsEdit && toastMessage && <div className="fixed bottom-6 left-1/2 z-[2000] -translate-x-1/2 rounded-full border border-white/20 bg-[rgba(9,16,24,0.98)] px-4 py-2 text-xs font-semibold text-white shadow-2xl">{toastMessage}</div>}
    {!ready && <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-[#0a0d12]/85 text-xs text-white"><span className="rounded-lg border border-white/15 bg-[#111820] px-4 py-3">{status}</span></div>}
  </main>;
}
