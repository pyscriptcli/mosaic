'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer, Map, MapPin, Flag, CarFront, Sparkles, Layers3, Square } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import { GISFeature } from '../../types/gis';

interface RouteAnimationControlsProps {
  route: GISFeature;
  collapsible?: boolean;
}

export const RouteAnimationControls: React.FC<RouteAnimationControlsProps> = ({ route, collapsible = false }) => {
  const updateFeature = useMapStore((state) => state.updateFeature);
  const [routePlaying, setRoutePlaying] = useState(false);
  const [routePaused, setRoutePaused] = useState(false);
  const [routeProgress, setRouteProgress] = useState(0);
  const [routePlaybackStatus, setRoutePlaybackStatus] = useState('');
  const priorRouteId = useRef(route.id);
  const coordinates = route.geometry.type === 'LineString' ? route.geometry.coordinates as [number, number][] : [];
  const routeWaypoints = route.props.waypoints || [coordinates[0], coordinates[coordinates.length - 1]].filter(Boolean) as [number, number][];
  const maxWaypointIndex = Math.max(0, routeWaypoints.length - 1);
  const savedSettings = {
    durationSeconds: 12,
    cameraMode: 'static' as const,
    glowEnabled: true,
    glowIntervalSeconds: 1.2,
    glowIntensity: 0.55,
    startWaypointIndex: 0,
    endWaypointIndex: Math.max(1, routeWaypoints.length - 1),
    headStyle: 'arrow' as const,
    iconDimension: '2d' as const,
    ...route.props.routeAnimation,
  };
  const startWaypointIndex = Math.min(maxWaypointIndex, Math.max(0, Number(savedSettings.startWaypointIndex) || 0));
  let endWaypointIndex = Math.min(maxWaypointIndex, Math.max(0, Number(savedSettings.endWaypointIndex) || 0));
  if (routeWaypoints.length > 1 && endWaypointIndex === startWaypointIndex) {
    endWaypointIndex = startWaypointIndex === maxWaypointIndex ? startWaypointIndex - 1 : startWaypointIndex + 1;
  }
  const settings = { ...savedSettings, startWaypointIndex, endWaypointIndex };

  useEffect(() => {
    if (priorRouteId.current === route.id) return;
    priorRouteId.current = route.id;
    setRoutePlaying(false);
    setRoutePaused(false);
    setRouteProgress(0);
    setRoutePlaybackStatus('');
    window.dispatchEvent(new CustomEvent('atlas:stop-route-animation'));
  }, [route.id]);

  useEffect(() => {
    const onEnded = (event: Event) => {
      if ((event as CustomEvent).detail?.featureId === route.id) {
        setRoutePlaying(false);
        setRoutePaused(false);
        setRouteProgress(1);
        setRoutePlaybackStatus('complete');
      }
    };
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.featureId === route.id) setRouteProgress(Math.floor(Math.max(0, Math.min(1, detail.progress)) * 100) / 100);
    };
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.featureId !== route.id) return;
      setRoutePlaybackStatus(detail.status || '');
      if (detail.status === 'playing') { setRoutePlaying(true); setRoutePaused(false); }
      if (detail.status === 'paused') { setRoutePlaying(false); setRoutePaused(true); }
      if (detail.status === 'complete' || detail.status === 'error') { setRoutePlaying(false); setRoutePaused(false); }
    };
    window.addEventListener('atlas:route-animation-ended', onEnded);
    window.addEventListener('atlas:route-animation-progress', onProgress);
    window.addEventListener('atlas:route-animation-status', onStatus);
    return () => {
      window.removeEventListener('atlas:route-animation-ended', onEnded);
      window.removeEventListener('atlas:route-animation-progress', onProgress);
      window.removeEventListener('atlas:route-animation-status', onStatus);
    };
  }, [route.id]);

  const saveSettings = (patch: Partial<typeof settings>) => {
    updateFeature(route.id, (feature) => ({
      ...feature,
      props: { ...feature.props, routeAnimation: { ...settings, ...patch } },
    }));
  };
  const startPlayback = (replay = false) => {
    if (route.props.visible === 0) return;
    if (routePlaying && !replay) {
      window.dispatchEvent(new CustomEvent('atlas:pause-route-animation'));
      setRoutePlaying(false);
      setRoutePaused(true);
      return;
    }
    if (routePaused && !replay) {
      window.dispatchEvent(new CustomEvent('atlas:resume-route-animation'));
      setRoutePlaying(true);
      setRoutePaused(false);
      return;
    }
    setRouteProgress(0);
    setRoutePlaybackStatus('waiting');
    setRoutePaused(false);
    setRoutePlaying(true);
    window.dispatchEvent(new CustomEvent('atlas:play-route-animation', {
      detail: { featureId: route.id, ...settings },
    }));
  };

  const controls = (
    <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => startPlayback()} disabled={route.props.visible === 0} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-500/15 px-2.5 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
          {routePlaying ? <><Pause className="h-3.5 w-3.5" /> pause</> : <><Play className="h-3.5 w-3.5" /> {routePaused ? 'resume' : 'play route'}</>}
        </button>
        <button type="button" onClick={() => startPlayback(true)} disabled={route.props.visible === 0} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-2 text-xs text-zinc-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
          <RotateCcw className="h-3 w-3" /> start over
        </button>
      </div>
      <div role="progressbar" aria-label="route animation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(routeProgress * 100)} className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-sky-400 transition-[width] duration-100" style={{ width: `${Math.round(routeProgress * 100)}%` }} />
      </div>
      <p aria-live="polite" className="-mt-2 text-[10px] text-zinc-400">{routePlaybackStatus === 'playing' ? 'tracing the path' : routePlaybackStatus === 'paused' ? 'paused' : routePlaybackStatus === 'waiting' ? 'preparing route' : routePlaybackStatus === 'complete' ? 'route finished' : routePlaybackStatus === 'error' ? 'could not play route' : 'watch the route draw from start to finish'}</p>
      <label className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-zinc-400" /> time to draw</span><span className="flex items-center gap-2">
          <input aria-label="route draw duration in seconds" type="range" min="1" max="180" step="1" value={settings.durationSeconds} onChange={(event) => saveSettings({ durationSeconds: Number(event.target.value) })} className="w-28 accent-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" />
          <span className="w-9 text-right text-zinc-400">{settings.durationSeconds}s</span>
        </span>
      </label>
      <label className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5"><Map className="h-3.5 w-3.5 text-zinc-400" /> map view</span><select aria-label="route camera behavior" value={settings.cameraMode} onChange={(event) => saveSettings({ cameraMode: event.target.value as 'static' | 'follow' })} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"><option value="static">keep still</option><option value="follow">follow route</option></select>
      </label>
      <label className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-zinc-400" /> start at</span><select aria-label="route start" value={settings.startWaypointIndex} onChange={(event) => { const nextStart = Number(event.target.value); const currentEnd = settings.endWaypointIndex; saveSettings({ startWaypointIndex: nextStart, ...(nextStart === currentEnd ? { endWaypointIndex: settings.startWaypointIndex } : {}) }); }} className="max-w-44 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">{routeWaypoints.map((point, index) => <option key={index} value={index}>stop {index + 1} · {point[1].toFixed(4)}, {point[0].toFixed(4)}</option>)}</select>
      </label>
      <label className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5"><Flag className="h-3.5 w-3.5 text-zinc-400" /> finish at</span><select aria-label="route finish" value={settings.endWaypointIndex} onChange={(event) => { const nextEnd = Number(event.target.value); const currentStart = settings.startWaypointIndex; saveSettings({ endWaypointIndex: nextEnd, ...(nextEnd === currentStart ? { startWaypointIndex: settings.endWaypointIndex } : {}) }); }} className="max-w-44 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">{routeWaypoints.map((point, index) => <option key={index} value={index}>stop {index + 1} · {point[1].toFixed(4)}, {point[0].toFixed(4)}</option>)}</select>
      </label>
      <label className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5"><CarFront className="h-3.5 w-3.5 text-zinc-400" /> moving icon</span><select aria-label="moving route icon" value={settings.headStyle} onChange={(event) => saveSettings({ headStyle: event.target.value as 'none' | 'arrow' | 'car' })} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"><option value="none">none</option><option value="arrow">arrow</option><option value="car">car</option></select>
      </label>
      {settings.headStyle !== 'none' && <div className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-1.5"><Layers3 className="h-3.5 w-3.5 text-zinc-400" /> icon style</span><div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5"><button type="button" aria-pressed={settings.iconDimension === '2d'} onClick={() => saveSettings({ iconDimension: '2d' })} className={`flex items-center gap-1 rounded-md px-2 py-1 ${settings.iconDimension === '2d' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}><Square className="h-3 w-3" />2d</button><button type="button" aria-pressed={settings.iconDimension === '3d'} onClick={() => saveSettings({ iconDimension: '3d' })} className={`flex items-center gap-1 rounded-md px-2 py-1 ${settings.iconDimension === '3d' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}><Layers3 className="h-3 w-3" />3d</button></div></div>}
      <label className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-zinc-400" /> glowing path</span><input aria-label="glowing path" type="checkbox" checked={settings.glowEnabled} onChange={(event) => saveSettings({ glowEnabled: event.target.checked })} className="accent-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" /></label>
      {settings.glowEnabled && <>
        <label className="flex items-center justify-between gap-2 text-[11px]"><span>glow pulse</span><span className="flex items-center gap-2"><input aria-label="glow pulse interval in seconds" type="range" min="0.25" max="4" step="0.05" value={settings.glowIntervalSeconds} onChange={(event) => saveSettings({ glowIntervalSeconds: Number(event.target.value) })} className="w-28 accent-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" /><span className="w-9 text-right text-zinc-400">{settings.glowIntervalSeconds.toFixed(2)}s</span></span></label>
        <label className="flex items-center justify-between gap-2 text-[11px]"><span>glow strength</span><span className="flex items-center gap-2"><input aria-label="glow strength" type="range" min="0" max="1" step="0.05" value={settings.glowIntensity} onChange={(event) => saveSettings({ glowIntensity: Number(event.target.value) })} className="w-28 accent-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" /><span className="w-9 text-right text-zinc-400">{Math.round(settings.glowIntensity * 100)}%</span></span></label>
      </>}
    </div>
  );

  if (!collapsible) return controls;
  return (
    <details className="rounded-xl border border-white/10 bg-black/20 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
        <Play className="h-3.5 w-3.5 text-sky-400" /><span className="flex-1">route preview</span><span className="max-w-32 truncate text-[10px] font-normal text-zinc-400">{route.name}</span>
      </summary>
      {controls}
    </details>
  );
};
