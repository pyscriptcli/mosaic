'use client';

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore } from '../../store/useMapStore';
import { ALL_STYLES, VIS_MAP, mapboxSatelliteXRayStyle } from '../../gis/map';
import { rectCoords, rotateGeometry, translateCoordinates, calcBounds } from '../../gis/polygons';
import { circleCoords, haversineDist } from '../../gis/circles';
import { getIconKey, registerCustomImageMarker } from '../../gis/markers';
import { fetchMultiPointRoute, getRouteBearing, getRouteSegment, insertWaypoint } from '../../gis/routes';
import { generateLabelsGeoJSON } from '../../gis/labels';
import { generateCompoundBuildingFeatures, ARCHETYPE_CONFIGS } from '../../gis/buildings3d';
import { calculateSolarLighting } from '../../gis/sunCalc';
import { GISFeature } from '../../types/gis';

interface MapCanvasProps {
  onMapReady: (map: maplibregl.Map) => void;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({ onMapReady }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const {
    currentBasemap,
    visibilities,
    features,
    activeTool,
    setActiveTool,
    draft,
    setDraft,
    cursorLL,
    setCursorLL,
    editMode,
    editingRoutePoints,
    selectedId,
    setSelectedId,
    addFeature,
    updateFeature,
    commitFeatureChanges,
    pushHistory,
    setContextMenu,
    closeContextMenu,
    closeAllPanels,
    togglePanel,
    markerShape,
    markerColor,
    markerSize,
    markerSizeMode,
    customMarkerKey,
    textContent,
    textSize,
    textColor,
    textOpacity,
    routeMode,
    routeColor,
    setToast,
    selectedBuildingArchetype,
    solarTime,
    isFogEnabled,
    is3DTerrain,
    isSmartHeightFilter,
    isNightGlowEnabled,
    openNodeDisplayMode,
  } = useMapStore();

  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const featuresRef = useRef(features);
  featuresRef.current = features;
  const customImageRegistrationsRef = useRef(new Map<string, Promise<string>>());
  const routeAnimationRef = useRef<{
    frame: number;
    map: maplibregl.Map;
    featureId: number;
    captureMode: boolean;
    renderFrame: (progress: number, timestamp: number) => void;
    pause: () => void;
    resume: () => void;
  } | null>(null);
  const activeRouteAnimationIdRef = useRef<number | null>(null);
  const pendingRouteAnimationRef = useRef<any>(null);
  const routeEditRequestRef = useRef(new Map<number, number>());

  // Fetch Mapbox token on mount for high-res satellite tiles
  useEffect(() => {
    fetch('/api/gis/token')
      .then((res) => res.json())
      .then((data) => {
        if (data.token) {
          setMapboxToken(data.token);
        }
      })
      .catch(() => {});
  }, []);

  // Internal drag state refs
  const dragRef = useRef({
    isDragging: false,
    dragFeatureId: null as number | null,
    dragStartCoord: null as [number, number] | null,
    dragOriginalCoords: null as any,
    dragStartPoint: null as [number, number, number, number] | null,
    dragUndoRecorded: false,
    dragPanWasEnabled: true,
    isDraggingVertex: false,
    draggedPolyId: null as number | null,
    draggedVertexIdx: -1,
    isRadiusHandle: false,
    isDraggingRotation: false,
    rotatingPolyId: null as number | null,
    rotCenter: null as [number, number] | null,
    rotStartAngle: 0,
  });

  const nextFid = useRef(features.reduce((m, f) => Math.max(m, f.id || 0), 0));

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialStyle = ALL_STYLES[currentBasemap]
      || (currentBasemap === 'Satellite' || currentBasemap === 'Satellite 3D X-Ray' ? ALL_STYLES['Google Satellite'] : null)
      || ALL_STYLES['Midnight Blue'];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      center: [120.9842, 14.5995],
      zoom: 14,
      pitch: 60,
      bearing: -15,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    } as any);

    mapRef.current = map;
    if (typeof window !== 'undefined') {
      (window as any).__map = map;
      (window as any).__store = useMapStore;
    }
    map.getCanvas().addEventListener('contextmenu', (e) => e.preventDefault());

    map.on('load', () => {
      setupLayers(map);
      applyVisibilities(map, useMapStore.getState().visibilities);
      syncData(map, useMapStore.getState().features);
      syncLabels(map, useMapStore.getState().features);
      map.on('click', (event) => {
        if (!map.getLayer('open-node-cluster-circles')) return;
        const features = map.queryRenderedFeatures(event.point, { layers: ['open-node-cluster-circles'] });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource('open-node-clusters') as any;
        if (clusterId != null && source?.getClusterExpansionZoom) {
          source.getClusterExpansionZoom(clusterId, (error: Error | null, zoom: number) => {
            if (!error) map.easeTo({ center: (features[0].geometry as any).coordinates, zoom });
          });
        }
      });
      onMapReady(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update basemap style
  const prevBasemapRef = useRef(currentBasemap);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (prevBasemapRef.current === currentBasemap) return;
    prevBasemapRef.current = currentBasemap;
    const style = ALL_STYLES[currentBasemap]
      || (currentBasemap === 'Satellite' || currentBasemap === 'Satellite 3D X-Ray' ? ALL_STYLES['Google Satellite'] : null)
      || ALL_STYLES['Midnight Blue'];

    if (style) {
      window.dispatchEvent(new CustomEvent('atlas:stop-route-animation'));
      customImageRegistrationsRef.current.clear();
      map.setStyle(style);
      map.once('styledata', () => {
        setupLayers(map);
        applyVisibilities(map, visibilities);
        syncData(map, features);
        syncLabels(map, features);

        // Apply solar lighting & fog immediately upon style load
        try {
          const center = map.getCenter();
          const solar = calculateSolarLighting(solarTime, center?.lat || 14.5995, center?.lng || 120.9842);
          if (typeof map.setLight === 'function') {
            map.setLight({
              anchor: 'map',
              position: solar.lightPosition,
              color: solar.lightColor,
              intensity: solar.lightIntensity,
            });
          }
          if (typeof (map as any).setFog === 'function' && isFogEnabled) {
            (map as any).setFog({
              range: [0.5, 10],
              color: solar.fogColor,
              'high-color': solar.fogHighColor,
              'horizon-blend': solar.fogHorizonBlend,
              'space-color': '#030712',
            });
          }
        } catch (_) {}
      });
    }
  }, [currentBasemap, mapboxToken]);

  // Apply Real-Time Dynamic Solar Lighting, Facade Shadows, and Depth Fog
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const center = map.getCenter();
      const solar = calculateSolarLighting(solarTime, center?.lat || 14.5995, center?.lng || 120.9842);

      // MapLibre setLight (direction, color, altitude angle, azimuth angle)
      if (typeof map.setLight === 'function') {
        map.setLight({
          anchor: 'map',
          position: solar.lightPosition,
          color: solar.lightColor,
          intensity: solar.lightIntensity,
        });
      }

      // MapLibre setFog (Dynamic Celestial Atmospheric Horizon)
      if (typeof (map as any).setFog === 'function') {
        if (isFogEnabled) {
          (map as any).setFog({
            range: [0.5, 10],
            color: solar.fogColor,
            'high-color': solar.fogHighColor,
            'horizon-blend': solar.fogHorizonBlend,
            'space-color': '#030712',
          });
        } else {
          (map as any).setFog(null);
        }
      }
    } catch (_) {
      // Graceful fallback if style is raster-only without 3D extrusion lighting
    }
  }, [solarTime, isFogEnabled]);

  // Apply 3D Terrain Elevation Mesh
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (typeof (map as any).setTerrain === 'function') {
        if (is3DTerrain) {
          if (!map.getSource('terrain-dem')) {
            const demSource: any = {
              type: 'raster-dem',
              tiles: mapboxToken
                ? [`https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${mapboxToken}`]
                : ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
              tileSize: 256,
              maxzoom: 14,
              encoding: mapboxToken ? 'mapbox' : 'terrarium',
            };
            map.addSource('terrain-dem', demSource);
          }
          (map as any).setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
        } else {
          (map as any).setTerrain(null);
        }
      }
    } catch (_) {}
  }, [is3DTerrain, mapboxToken]);

  // Apply Smart Height Filter & Night Illumination dynamic shader styling
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    try {
      // 1. Smart Height Filter: preserve natural satellite imagery on residential homes vs towers
      if (map.getLayer('building-3d')) {
        if (isSmartHeightFilter) {
          map.setFilter('building-3d', [
            '>=',
            ['coalesce', ['get', 'render_height'], ['get', 'height'], 0],
            15,
          ]);
        } else {
          map.setFilter('building-3d', null);
        }
      }

      // 2. Night Illumination: neon glowing city arteries after sunset
      const isNightTime = solarTime < 6.25 || solarTime > 18.25;
      if (map.getLayer('rd_major_xray')) {
        if (isNightGlowEnabled && isNightTime) {
          map.setPaintProperty('rd_major_xray', 'line-color', '#38bdf8');
          map.setPaintProperty('rd_major_xray', 'line-width', 2.2);
          map.setPaintProperty('rd_major_xray', 'line-opacity', 0.85);
        } else {
          map.setPaintProperty('rd_major_xray', 'line-color', '#ffffff');
          map.setPaintProperty('rd_major_xray', 'line-width', 1.5);
          map.setPaintProperty('rd_major_xray', 'line-opacity', 0.6);
        }
      }
    } catch (_) {}
  }, [isSmartHeightFilter, isNightGlowEnabled, solarTime]);

  // Update visibilities
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyVisibilities(map, visibilities);
  }, [visibilities]);

  // Update features data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncData(map, features);
    syncLabels(map, features);
    syncVertexHandles(map, features, editMode, selectedId);
  }, [features, editMode, selectedId, openNodeDisplayMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const reportStatus = (featureId: string | number, status: string) => {
      window.dispatchEvent(new CustomEvent('atlas:route-animation-status', { detail: { featureId, status } }));
    };
    const stop = () => {
      if (routeAnimationRef.current) cancelAnimationFrame(routeAnimationRef.current.frame);
      routeAnimationRef.current = null;
      const activeRouteId = activeRouteAnimationIdRef.current;
      activeRouteAnimationIdRef.current = null;
      pendingRouteAnimationRef.current = null;
      try {
        (map.getSource('route-animation') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] } as any);
        (map.getSource('route-animation-head-data') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] } as any);
        if (map.getSource('route-animation')) map.removeFeatureState({ source: 'route-animation', id: 'active-route' });
        if (activeRouteId != null && map.getSource('draw')) syncData(map, useMapStore.getState().features);
        const state = useMapStore.getState();
        syncVertexHandles(map, state.features, state.editMode, state.selectedId);
      } catch (_) {}
    };
    const play = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const route = useMapStore.getState().features.find((feature) => feature.id === detail.featureId && feature.kind === 'route');
      if (!route || route.props.visible === 0 || route.geometry.type !== 'LineString' || route.geometry.coordinates.length < 2) {
        if (detail.featureId != null) reportStatus(detail.featureId, 'error');
        return;
      }
      if (map.isStyleLoaded() && (!map.getSource('route-animation') || !map.getSource('route-animation-head-data') || !map.getLayer('route-animation-line'))) {
        try { setupLayers(map); } catch (_) {}
      }
      if (!map.getSource('route-animation') || !map.getSource('route-animation-head-data') || !map.getLayer('route-animation-line')) {
        pendingRouteAnimationRef.current = detail;
        reportStatus(route.id, 'waiting');
        return;
      }
      stop();
      activeRouteAnimationIdRef.current = route.id;
      syncData(map, useMapStore.getState().features);
      (map.getSource('vertex-handles') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] } as any);
      const routeCoordinates = route.geometry.coordinates as [number, number][];
      const waypoints = route.props.waypoints || [routeCoordinates[0], routeCoordinates[routeCoordinates.length - 1]];
      const settings = route.props.routeAnimation;
      const coords = getRouteSegment(
        routeCoordinates,
        waypoints,
        Number(detail.startWaypointIndex ?? settings?.startWaypointIndex ?? 0),
        Number(detail.endWaypointIndex ?? settings?.endWaypointIndex ?? waypoints.length - 1)
      );
      if (coords.length < 2) { reportStatus(route.id, 'error'); return; }
      const routeBounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
      coords.forEach((coordinate) => routeBounds.extend(coordinate));
      const viewBounds = map.getBounds();
      const routeIsInView = viewBounds.contains(routeBounds.getSouthWest()) && viewBounds.contains(routeBounds.getNorthEast());
      const captureMode = Boolean(detail.captureMode);
      const cameraFrameDuration = routeIsInView || captureMode ? 0 : 500;
      if (!routeIsInView) {
        map.fitBounds(routeBounds, { padding: 96, maxZoom: 16, duration: cameraFrameDuration, essential: true });
      }
      const segmentLengths: number[] = [];
      let totalLength = 0;
      const cumulativeLengths = [0];
      for (let i = 1; i < coords.length; i++) {
        const dx = (coords[i][0] - coords[i - 1][0]) * Math.cos(((coords[i][1] + coords[i - 1][1]) * Math.PI) / 360);
        const dy = coords[i][1] - coords[i - 1][1];
        const length = Math.hypot(dx, dy);
        segmentLengths.push(length);
        totalLength += length;
        cumulativeLengths.push(totalLength);
      }
      const duration = Math.max(1, Number(detail.durationSeconds ?? settings?.durationSeconds ?? 12)) * 1000;
      const follow = (detail.cameraMode ?? settings?.cameraMode) === 'follow';
      const glowEnabled = detail.glowEnabled ?? settings?.glowEnabled ?? true;
      const interval = Math.max(0.25, Number(detail.glowIntervalSeconds ?? settings?.glowIntervalSeconds ?? 1.2)) * 1000;
      const intensity = Math.max(0, Math.min(1, Number(detail.glowIntensity ?? settings?.glowIntensity ?? 0.55)));
      const headStyle = detail.headStyle ?? settings?.headStyle ?? 'arrow';
      const iconDimension = detail.iconDimension ?? settings?.iconDimension ?? '2d';
      const color = route.props.color || route.props.borderColor || '#38bdf8';
      const width = Math.max(2, Number(route.props.width) || 4);
      const routeSource = map.getSource('route-animation') as maplibregl.GeoJSONSource;
      const headSource = map.getSource('route-animation-head-data') as maplibregl.GeoJSONSource;
      try {
        routeSource.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', id: 'active-route', geometry: { type: 'LineString', coordinates: coords }, properties: { color, width } }],
        } as any);
        headSource.setData({ type: 'FeatureCollection', features: [] } as any);
      } catch (_) { reportStatus(route.id, 'error'); stop(); return; }
      let started = performance.now() + cameraFrameDuration;
      let lastCameraUpdate = 0;
      let lastUiProgressUpdate = 0;
      let headSegmentIndex = 0;
      let lastReportedStatus = '';
      const renderFrame = (progressValue: number, now: number) => {
        const progress = Math.max(0, Math.min(1, progressValue));
        const distance = totalLength * progress;
        while (headSegmentIndex < segmentLengths.length - 1 && cumulativeLengths[headSegmentIndex + 1] < distance) headSegmentIndex++;
        const segmentLength = segmentLengths[headSegmentIndex] || 1;
        const fraction = Math.max(0, Math.min(1, (distance - cumulativeLengths[headSegmentIndex]) / segmentLength));
        const from = coords[headSegmentIndex];
        const next = coords[Math.min(headSegmentIndex + 1, coords.length - 1)];
        const head: [number, number] = [from[0] + (next[0] - from[0]) * fraction, from[1] + (next[1] - from[1]) * fraction];
        const glowOpacity = glowEnabled ? intensity * (0.65 + 0.35 * Math.sin((now - started) * 2 * Math.PI / interval)) : 0;
        const edge = Math.max(0.0001, Math.min(0.9998, progress));
        const gradient = (colorValue: string) => ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(0, 0, 0, 0)', edge, colorValue, edge + 0.0001, 'rgba(0, 0, 0, 0)', 1, 'rgba(0, 0, 0, 0)'] as any;
        try {
          map.setPaintProperty('route-animation-glow', 'line-gradient', gradient(color));
          map.setPaintProperty('route-animation-casing', 'line-gradient', gradient('#f8fafc'));
          map.setPaintProperty('route-animation-line', 'line-gradient', gradient(color));
          map.setFeatureState({ source: 'route-animation', id: 'active-route' }, { glowOpacity });
        } catch (_) {}
        const animatedFeatures: any[] = [];
        if (headStyle !== 'none') {
          animatedFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: head },
            properties: {
              iconKey: `route-animation-${headStyle}${iconDimension === '3d' ? '-3d' : ''}`,
              iconDimension,
              bearing: getRouteBearing(from, next),
            },
          });
        }
        try { headSource.setData({ type: 'FeatureCollection', features: animatedFeatures } as any); } catch (_) { reportStatus(route.id, 'error'); stop(); return; }
        if (captureMode && lastReportedStatus !== 'playing') { reportStatus(route.id, 'playing'); lastReportedStatus = 'playing'; }
        if (captureMode && (now - lastUiProgressUpdate >= 80 || progress >= 1)) {
          window.dispatchEvent(new CustomEvent('atlas:route-animation-progress', { detail: { featureId: route.id, progress } }));
          lastUiProgressUpdate = now;
        }
        if (follow && (captureMode || now - lastCameraUpdate > 70)) {
          if (captureMode) map.jumpTo({ center: head });
          else map.easeTo({ center: head, duration: 70, essential: true });
          lastCameraUpdate = now;
        }
      };
      const frame = (now: number) => {
        const waitingForCamera = now < started;
        const progress = totalLength === 0 ? 1 : Math.max(0, Math.min(1, (now - started) / duration));
        renderFrame(progress, now);
        if (waitingForCamera && lastReportedStatus !== 'waiting') { reportStatus(route.id, 'waiting'); lastReportedStatus = 'waiting'; }
        if (now - lastUiProgressUpdate >= 80 || progress >= 1) {
          window.dispatchEvent(new CustomEvent('atlas:route-animation-progress', { detail: { featureId: route.id, progress } }));
          lastUiProgressUpdate = now;
        }
        if (progress < 1 && routeAnimationRef.current && !captureMode) routeAnimationRef.current.frame = requestAnimationFrame(frame);
        else {
          if (!captureMode) {
            reportStatus(route.id, 'complete');
            window.dispatchEvent(new CustomEvent('atlas:route-animation-ended', { detail: { featureId: route.id } }));
            stop();
          }
        }
      };
      let paused = false;
      let pausedAt = 0;
      routeAnimationRef.current = {
        frame: 0, map, featureId: route.id, captureMode, renderFrame,
        pause: () => {
          const current = routeAnimationRef.current;
          if (!current || paused) return;
          cancelAnimationFrame(current.frame);
          pausedAt = performance.now();
          paused = true;
          reportStatus(route.id, 'paused');
        },
        resume: () => {
          const current = routeAnimationRef.current;
          if (!current || !paused) return;
          started += performance.now() - pausedAt;
          paused = false;
          reportStatus(route.id, 'playing');
          current.frame = requestAnimationFrame(frame);
        },
      };
      if (captureMode) renderFrame(0, performance.now());
      else routeAnimationRef.current.frame = requestAnimationFrame(frame);
    };
    const renderExportFrame = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const current = routeAnimationRef.current;
      if (!current?.captureMode || current.featureId !== detail.featureId) {
        detail.reject?.(new Error('route export is not ready'));
        return;
      }
      try {
        current.renderFrame(Number(detail.progress) || 0, performance.now() + (Number(detail.elapsedMs) || 0));
        const timeout = window.setTimeout(() => detail.reject?.(new Error('map frame timed out')), 5000);
        map.once('render', () => {
          window.clearTimeout(timeout);
          detail.resolve?.();
        });
        map.triggerRepaint();
      } catch (error) {
        detail.reject?.(error);
      }
    };
    const pause = () => routeAnimationRef.current?.pause();
    const resume = () => routeAnimationRef.current?.resume();
    const resumePending = () => {
      const detail = pendingRouteAnimationRef.current;
      if (!detail) return;
      if (!map.getSource('route-animation') || !map.getLayer('route-animation-line')) {
        if (!map.isStyleLoaded()) return;
        try { setupLayers(map); } catch (_) { return; }
      }
      if (!map.getSource('route-animation') || !map.getLayer('route-animation-line')) return;
      pendingRouteAnimationRef.current = null;
      play(new CustomEvent('atlas:play-route-animation', { detail }));
    };
    window.addEventListener('atlas:play-route-animation', play);
    window.addEventListener('atlas:stop-route-animation', stop);
    window.addEventListener('atlas:pause-route-animation', pause);
    window.addEventListener('atlas:resume-route-animation', resume);
    window.addEventListener('atlas:render-route-export-frame', renderExportFrame);
    map.on('styledata', resumePending);
    resumePending();
    return () => {
      window.removeEventListener('atlas:play-route-animation', play);
      window.removeEventListener('atlas:stop-route-animation', stop);
      window.removeEventListener('atlas:pause-route-animation', pause);
      window.removeEventListener('atlas:resume-route-animation', resume);
      window.removeEventListener('atlas:render-route-export-frame', renderExportFrame);
      map.off('styledata', resumePending);
      stop();
    };
  }, []);

  // Update draft rendering
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    renderDraftGeometry(map, draft, cursorLL, activeTool);
  }, [draft, cursorLL, activeTool]);

  // Manage doubleClickZoom & cursor based on activeTool
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (editingRoutePoints) {
      map.getCanvas().style.cursor = 'crosshair';
      return () => { map.getCanvas().style.cursor = ''; };
    }
    if (activeTool) {
      map.doubleClickZoom.disable();
      map.getCanvas().style.cursor = 'crosshair';
    } else {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = '';
    }
  }, [activeTool, editingRoutePoints]);

  const setupRouteAnimationIcons = (map: maplibregl.Map) => {
    if (typeof document === 'undefined') return;
    const makeIcon = (name: string, draw: (ctx: CanvasRenderingContext2D) => void, dimensional = false) => {
      if (map.hasImage(name)) return;
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (dimensional) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 5;
      }
      draw(ctx);
      map.addImage(name, { width: 32, height: 32, data: ctx.getImageData(0, 0, 32, 32).data });
    };

    const drawArrow = (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(16, 1);
      ctx.lineTo(30, 29);
      ctx.lineTo(16, 23);
      ctx.lineTo(2, 29);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1677ff';
      ctx.beginPath();
      ctx.moveTo(16, 5);
      ctx.lineTo(26, 25);
      ctx.lineTo(16, 20);
      ctx.lineTo(6, 25);
      ctx.closePath();
      ctx.fill();
    };
    makeIcon('route-animation-arrow', drawArrow);
    makeIcon('route-animation-arrow-3d', drawArrow, true);

    const drawCar = (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(16, 17, 12, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#143d85';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(7, 3, 18, 26, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.roundRect(9, 8, 14, 9, 3);
      ctx.fill();
      ctx.fillStyle = '#bfdbfe';
      ctx.beginPath();
      ctx.roundRect(10, 9, 12, 6, 2);
      ctx.fill();
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.roundRect(10, 19, 12, 5, 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(8, 4, 3, 2);
      ctx.fillRect(21, 4, 3, 2);
    };
    makeIcon('route-animation-car', drawCar);
    makeIcon('route-animation-car-3d', drawCar, true);
  };

  const setupLayers = (map: maplibregl.Map) => {
    if (!map.getSource('draw')) {
      map.addSource('draw', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'draw-fill',
        type: 'fill',
        source: 'draw',
        filter: [
          'all',
          ['==', ['geometry-type'], 'Polygon'],
          ['!=', ['coalesce', ['get', 'visible'], 1], 0],
          ['!=', ['get', 'is3D'], true],
          ['!=', ['get', 'kind'], 'polygon3d'],
          ['<=', ['coalesce', ['get', 'height'], 0], 0],
        ],
        paint: {
          'fill-color': ['coalesce', ['get', 'fillColor'], ['get', 'color'], '#ffffff'],
          'fill-opacity': ['*', ['coalesce', ['get', 'fillOpacity'], 0.04], ['coalesce', ['get', 'visible'], 1]],
        },
      });

      map.addLayer({
        id: 'draw-outline',
        type: 'line',
        source: 'draw',
        filter: [
          'all',
          ['==', ['geometry-type'], 'Polygon'],
          ['!=', ['coalesce', ['get', 'visible'], 1], 0],
        ],
        paint: {
          'line-color': ['coalesce', ['get', 'borderColor'], ['get', 'color'], '#ffffff'],
          'line-width': ['coalesce', ['get', 'width'], 1.5],
          'line-opacity': ['*', ['coalesce', ['get', 'borderOpacity'], 0.8], ['coalesce', ['get', 'visible'], 1]],
        },
      });

      map.addLayer({
        id: 'draw-extrusion',
        type: 'fill-extrusion',
        source: 'draw',
        filter: [
          'all',
          ['==', ['geometry-type'], 'Polygon'],
          ['!=', ['coalesce', ['get', 'visible'], 1], 0],
          ['any',
            ['==', ['get', 'is3D'], true],
            ['==', ['get', 'kind'], 'polygon3d'],
            ['>', ['coalesce', ['get', 'height'], 0], 0]
          ],
        ],
        paint: {
          'fill-extrusion-color': ['coalesce', ['get', 'fillColor'], ['get', 'color'], '#38bdf8'],
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 35],
          'fill-extrusion-base': ['coalesce', ['get', 'baseHeight'], 0],
          'fill-extrusion-opacity': 0.85,
        },
      });

      map.addLayer({
        id: 'draw-line',
        type: 'line',
        source: 'draw',
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'animationHidden'], true]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'case',
            ['boolean', ['get', 'routingFailed'], false],
            '#f85149',
            ['coalesce', ['get', 'borderColor'], ['get', 'color'], '#38bdf8'],
          ],
          'line-width': ['coalesce', ['get', 'width'], 4],
          'line-opacity': ['*', ['coalesce', ['get', 'borderOpacity'], 0.9], ['get', 'visible']],
          'line-dasharray': [
            'case',
            ['boolean', ['get', 'routingFailed'], false],
            ['literal', [2, 2]],
            ['literal', [1, 0]],
          ],
        },
      });

      map.addLayer({
        id: 'draw-marker',
        type: 'symbol',
        source: 'draw',
        filter: [
          'all',
          ['==', ['geometry-type'], 'Point'],
          ['!=', ['coalesce', ['get', 'kind'], 'marker'], 'textbox'],
          ['!=', ['coalesce', ['get', 'visible'], 1], 0],
        ],
        layout: {
          visibility: 'visible',
          'icon-image': ['get', 'iconKey'],
          // Keep zoom as the top-level camera expression (MapLibre requirement).
          // Static pins use the same size at every stop; dynamic pins scale with zoom.
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            3, ['*', ['coalesce', ['get', 'iconSize'], 0.9], ['case', ['==', ['get', 'iconSizeMode'], 'dynamic'], 0.55, 1]],
            10, ['*', ['coalesce', ['get', 'iconSize'], 0.9], ['case', ['==', ['get', 'iconSizeMode'], 'dynamic'], 0.75, 1]],
            14, ['*', ['coalesce', ['get', 'iconSize'], 0.9], 1],
            18, ['*', ['coalesce', ['get', 'iconSize'], 0.9], ['case', ['==', ['get', 'iconSizeMode'], 'dynamic'], 1.3, 1]],
            22, ['*', ['coalesce', ['get', 'iconSize'], 0.9], ['case', ['==', ['get', 'iconSizeMode'], 'dynamic'], 1.6, 1]],
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'bottom',
        },
        paint: { 'icon-opacity': ['coalesce', ['get', 'visible'], 1] },
      });

      map.addLayer({
        id: 'draw-poi-labels',
        type: 'symbol',
        source: 'draw',
        minzoom: 15,
        filter: [
          'all',
          ['==', ['geometry-type'], 'Point'],
          ['==', ['get', 'managedBy'], 'open-node'],
          ['!=', ['coalesce', ['get', 'visible'], 1], 0],
          ['!=', ['coalesce', ['get', 'name'], ''], ''],
        ],
        layout: {
          visibility: 'visible',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 18, 13],
          'text-anchor': 'bottom',
          'text-offset': [0, -1.8],
          'text-max-width': 12,
          'text-padding': 2,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#111827',
          'text-halo-width': 1.5,
          'text-halo-blur': 0.2,
        },
      });

      map.addLayer({
        id: 'draw-text',
        type: 'symbol',
        source: 'draw',
        filter: [
          'all',
          ['==', ['geometry-type'], 'Point'],
          ['==', ['get', 'kind'], 'textbox'],
          ['!=', ['coalesce', ['get', 'visible'], 1], 0],
        ],
        layout: {
          visibility: 'visible',
          'text-field': ['get', 'text'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['coalesce', ['get', 'fontSize'], 16],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-anchor': 'center',
        },
        paint: {
          'text-color': ['coalesce', ['get', 'color'], '#d9b451'],
          'text-opacity': ['*', ['coalesce', ['get', 'opacity'], 1], ['coalesce', ['get', 'visible'], 1]],
          'text-halo-color': '#0a1628',
          'text-halo-width': 2,
        },
      });
    }

    // Keep route playback independent of the main draw source. Style changes and
    // hot reloads may preserve `draw` while recreating other sources and layers.
    if (!map.getSource('route-animation')) {
      map.addSource('route-animation', { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } });
    }
    if (!map.getSource('route-animation-head-data')) {
      map.addSource('route-animation-head-data', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    const revealedLine = (color: string) => ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(0, 0, 0, 0)', 0.0001, color, 0.0002, 'rgba(0, 0, 0, 0)', 1, 'rgba(0, 0, 0, 0)'] as any;
    if (!map.getLayer('route-animation-glow')) {
      map.addLayer({ id: 'route-animation-glow', type: 'line', source: 'route-animation', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-gradient': revealedLine('#38bdf8'), 'line-width': ['+', ['coalesce', ['get', 'width'], 4], 10], 'line-opacity': ['coalesce', ['feature-state', 'glowOpacity'], 0], 'line-blur': 8 } as any });
    }
    if (!map.getLayer('route-animation-casing')) {
      map.addLayer({ id: 'route-animation-casing', type: 'line', source: 'route-animation', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-gradient': revealedLine('#f8fafc'), 'line-width': ['+', ['coalesce', ['get', 'width'], 4], 6], 'line-opacity': 0.95 } as any });
    }
    if (!map.getLayer('route-animation-line')) {
      map.addLayer({ id: 'route-animation-line', type: 'line', source: 'route-animation', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-gradient': revealedLine('#38bdf8'), 'line-width': ['+', ['coalesce', ['get', 'width'], 4], 1], 'line-opacity': 1 } as any });
    }
    setupRouteAnimationIcons(map);
    if (!map.getLayer('route-animation-head')) {
      map.addLayer({
        id: 'route-animation-head',
        type: 'symbol',
        source: 'route-animation-head-data',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'iconDimension'], '3d']],
        layout: {
          'icon-image': ['get', 'iconKey'],
          'icon-size': 0.85,
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }
    if (!map.getLayer('route-animation-head-3d')) {
      map.addLayer({
        id: 'route-animation-head-3d',
        type: 'symbol',
        source: 'route-animation-head-data',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'iconDimension'], '3d']],
        layout: {
          'icon-image': ['get', 'iconKey'],
          'icon-size': 0.85,
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }

    if (!map.getSource('open-node-clusters')) {
      map.addSource('open-node-clusters', {
        type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 48, clusterMaxZoom: 15,
      } as any);
      map.addLayer({
        id: 'open-node-cluster-circles', type: 'circle', source: 'open-node-clusters', filter: ['has', 'point_count'],
        layout: { visibility: 'none' },
        paint: { 'circle-color': '#06b6d4', 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 21, 30, 27], 'circle-opacity': 0.9, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
      });
      map.addLayer({
        id: 'open-node-cluster-count', type: 'symbol', source: 'open-node-clusters', filter: ['has', 'point_count'],
        layout: { visibility: 'none', 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'open-node-cluster-points', type: 'circle', source: 'open-node-clusters', filter: ['!', ['has', 'point_count']],
        layout: { visibility: 'none' },
        paint: { 'circle-color': ['coalesce', ['get', 'color'], '#22d3ee'], 'circle-radius': 6, 'circle-opacity': 0.9, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff' },
      });
    }
    if (!map.getSource('open-node-heat')) {
      map.addSource('open-node-heat', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'open-node-heatmap', type: 'heatmap', source: 'open-node-heat', layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 2],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 15, 2],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 12, 15, 32],
          'heatmap-opacity': 0.85,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(34,211,238,0)', 0.2, '#22d3ee', 0.45, '#a3e635', 0.7, '#facc15', 1, '#ef4444'],
        },
      });
    }

    if (!map.getSource('label-src')) {
      map.addSource('label-src', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'draw-poly-labels',
        type: 'symbol',
        source: 'label-src',
        filter: ['!=', ['coalesce', ['get', 'labelMode'], 'static'], 'zoomed'],
        layout: {
          visibility: 'visible',
          'text-field': ['get', 'labelText'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 13,
          'text-allow-overlap': true,
          'text-anchor': 'center',
          'text-justify': 'center',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#0a1628',
          'text-halo-width': 2,
        },
      });
      map.addLayer({
        id: 'draw-zoomed-labels',
        type: 'symbol',
        source: 'label-src',
        minzoom: 14,
        filter: ['==', ['get', 'labelMode'], 'zoomed'],
        layout: {
          visibility: 'visible',
          'text-field': ['get', 'labelText'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 13,
          'text-allow-overlap': true,
          'text-anchor': 'center',
          'text-justify': 'center',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#0a1628',
          'text-halo-width': 2,
        },
      });
    }

    if (!map.getSource('draft')) {
      map.addSource('draft', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'draft-line',
        type: 'line',
        source: 'draft',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#38bdf8', 'line-width': 2.5, 'line-dasharray': [2, 2] },
      });
      map.addLayer({
        id: 'draft-point',
        type: 'circle',
        source: 'draft',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': ['case', ['get', 'isLastPoint'], '#38bdf8', '#e8b84a'],
          'circle-radius': ['case', ['get', 'isLastPoint'], 10, ['case', ['get', 'isOrigin'], 8, 5]],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });
    }

    if (!map.getSource('vertex-handles')) {
      map.addSource('vertex-handles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'vertex-points',
        type: 'circle',
        source: 'vertex-handles',
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['get', 'isRotHandle'], false],
            '#e8b84a',
            ['case', ['boolean', ['get', 'isRadiusHandle'], false], '#3fb950', '#38bdf8'],
          ],
          'circle-radius': 6,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    }

    // Keep all application overlays above whichever basemap style is active.
    // Order from bottom to top so polygons sit below lines, labels and pins;
    // edit handles and drafts remain accessible above the finished features.
    const overlayStack = [
      'draw-fill',
      'draw-extrusion',
      'draw-outline',
      'draw-line',
      'open-node-heatmap',
      'open-node-cluster-circles',
      'open-node-cluster-points',
      'open-node-cluster-count',
      'draw-poly-labels',
      'draw-zoomed-labels',
      'draw-poi-labels',
      'draw-text',
      'draw-marker',
      'route-animation-glow',
      'route-animation-casing',
      'route-animation-line',
      'route-animation-head',
      'route-animation-head-3d',
      'draft-line',
      'draft-point',
      'vertex-points',
    ];
    overlayStack.forEach((layerId) => {
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    });
  };

  const applyVisibilities = (map: maplibregl.Map, vis: any) => {
    for (const g in VIS_MAP) {
      VIS_MAP[g].forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', vis[g] ? 'visible' : 'none');
        }
      });
    }
  };

  const syncData = (map: maplibregl.Map, featList: GISFeature[]) => {
    const src = map.getSource('draw') as maplibregl.GeoJSONSource;
    if (!src) return;

    const openNodePoints = featList.filter((f) => f.props.managedBy === 'open-node' && f.kind === 'marker' && f.geometry.type === 'Point' && f.props.visible !== 0);
    const openNodeData: any = {
      type: 'FeatureCollection',
      features: openNodePoints.map((f) => ({
        type: 'Feature', geometry: f.geometry as any,
        properties: { id: f.id, name: f.name, color: f.props.color || '#22d3ee', category: f.props.amenityGroupLabel || f.props.poiType || '' },
      })),
    };
    const heatSource = map.getSource('open-node-heat') as maplibregl.GeoJSONSource | undefined;
    const clusterSource = map.getSource('open-node-clusters') as maplibregl.GeoJSONSource | undefined;
    heatSource?.setData(openNodeData);
    clusterSource?.setData(openNodeData);
    const drawMarker = map.getLayer('draw-marker');
    if (drawMarker) {
      map.setFilter('draw-marker', [
        'all', ['==', ['geometry-type'], 'Point'], ['!=', ['coalesce', ['get', 'kind'], 'marker'], 'textbox'],
        ['!=', ['coalesce', ['get', 'visible'], 1], 0],
        ...(openNodeDisplayMode === 'pins' ? [] : [['!=', ['get', 'managedBy'], 'open-node'] as any]),
      ] as any);
    }
    const poiLabels = map.getLayer('draw-poi-labels');
    if (poiLabels) map.setLayoutProperty('draw-poi-labels', 'visibility', openNodeDisplayMode === 'pins' ? 'visible' : 'none');
    const clusterVisibility = openNodeDisplayMode === 'clusters' ? 'visible' : 'none';
    ['open-node-cluster-circles', 'open-node-cluster-count', 'open-node-cluster-points'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', clusterVisibility);
    });
    if (map.getLayer('open-node-heatmap')) map.setLayoutProperty('open-node-heatmap', 'visibility', openNodeDisplayMode === 'heatmap' ? 'visible' : 'none');

    const synchronizedFeatures = featList.filter((feature) => !(feature.kind === 'route' && feature.id === activeRouteAnimationIdRef.current));
    src.setData({
      type: 'FeatureCollection',
      features: synchronizedFeatures.map((f) => {
        let iconKey = f.props.iconKey;
        if (f.kind === 'marker') {
          const shp = f.props.shape || 'pin';
          const col = f.props.color || '#1e40af';
          if (f.props.customImageDataUrl) {
            if (!iconKey || !map.hasImage(iconKey)) {
              // Render a normal pin while the uploaded logo loads, then refresh
              // the source once MapLibre has registered the real image.
              iconKey = getIconKey(shp, col, map);
              const dataUrl = f.props.customImageDataUrl;
              let registration = customImageRegistrationsRef.current.get(dataUrl);
              if (!registration) {
                registration = registerCustomImageMarker(dataUrl, map);
                customImageRegistrationsRef.current.set(dataUrl, registration);
                registration.then((registeredKey) => {
                  if (!map.hasImage(registeredKey)) {
                    customImageRegistrationsRef.current.delete(dataUrl);
                    syncData(map, useMapStore.getState().features);
                    return;
                  }
                  const latestFeatures = useMapStore.getState().features;
                  const currentFeature = latestFeatures.find((feature) => feature.id === f.id);
                  if (currentFeature?.props.customImageDataUrl === dataUrl) {
                    currentFeature.props.iconKey = registeredKey;
                  }
                  customImageRegistrationsRef.current.delete(dataUrl);
                  syncData(map, latestFeatures);
                }).catch(() => {
                  customImageRegistrationsRef.current.delete(dataUrl);
                });
              }
            }
          } else {
            iconKey = getIconKey(shp, col, map);
          }
        }
        return {
          type: 'Feature',
          geometry: f.geometry as any,
          properties: {
            ...f.props,
            id: f.id,
            name: f.name,
            kind: f.kind,
            visible: f.props.visible ?? 1,
            iconKey: iconKey || f.props.iconKey,
          },
        };
        }),
    });
  };

  const syncLabels = (map: maplibregl.Map, featList: GISFeature[]) => {
    const src = map.getSource('label-src') as maplibregl.GeoJSONSource;
    if (src) {
      src.setData(generateLabelsGeoJSON(featList) as any);
    }
  };

  const syncVertexHandles = (
    map: maplibregl.Map,
    featList: GISFeature[],
    isEdit: boolean,
    selected: number | null
  ) => {
    const src = map.getSource('vertex-handles') as maplibregl.GeoJSONSource;
    if (!src) return;

    if (!isEdit || selected == null || activeRouteAnimationIdRef.current === selected) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const f = featList.find((x) => x.id === selected);
    if (!f || f.props.visible === 0) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const handleFeats: any[] = [];

    if (f.kind === 'circle' && f.props.centerCoord && f.props.radiusMeters) {
      const c = f.props.centerCoord;
      const r = f.props.radiusMeters;
      const edgeCoord = [c[0] + r / (111320 * Math.cos((c[1] * Math.PI) / 180)), c[1]];
      handleFeats.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: edgeCoord },
        properties: { polyId: f.id, isRadiusHandle: true },
      });
    } else if (
      ['polygon', 'rectangle', 'polygon3d'].includes(f.kind) &&
      f.geometry.type === 'Polygon' &&
      f.geometry.coordinates?.[0]
    ) {
      const coords = f.geometry.coordinates[0];
      for (let i = 0; i < coords.length - 1; i++) {
        handleFeats.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coords[i] },
          properties: { polyId: f.id, vIdx: i },
        });
      }
    } else if (['polyline', 'route'].includes(f.kind) && f.geometry.coordinates) {
      const coords = f.props.waypoints || f.geometry.coordinates;
      for (let i = 0; i < coords.length; i++) {
        handleFeats.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coords[i] },
          properties: { polyId: f.id, vIdx: i },
        });
      }
    }

    const b = calcBounds(f);
    if (b) {
      const cx = (b[0][0] + b[1][0]) / 2;
      const offset = (b[1][1] - b[0][1]) * 0.25 || 0.001;
      handleFeats.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [cx, b[1][1] + offset] },
        properties: { polyId: f.id, isRotHandle: true },
      });
    }

    src.setData({ type: 'FeatureCollection', features: handleFeats });
  };

  const renderDraftGeometry = (
    map: maplibregl.Map,
    pts: [number, number][],
    cursor: [number, number] | null,
    tool: any
  ) => {
    const src = map.getSource('draft') as maplibregl.GeoJSONSource;
    if (!src) return;

    const feats: any[] = [];
    const ptFeat = (c: [number, number], isOrigin = false, isLast = false) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: c },
      properties: { isOrigin, isLastPoint: isLast },
    });
    const lnFeat = (c: [number, number][]) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: c },
      properties: {},
    });

    pts.forEach((p, i) => {
      feats.push(
        ptFeat(
          p,
          i === 0 && (tool === 'polygon' || tool === 'polygon3d'),
          i === pts.length - 1 && tool === 'route'
        )
      );
    });

    if ((tool === 'polyline' || tool === 'route') && pts.length) {
      feats.push(lnFeat(cursor ? [...pts, cursor] : pts));
    }
    if ((tool === 'polygon' || tool === 'polygon3d') && pts.length) {
      const allPts = cursor ? [...pts, cursor] : pts;
      if (allPts.length > 1) feats.push(lnFeat([...allPts, allPts[0]]));
    }
    if (tool === 'rectangle' && pts.length === 1 && cursor) {
      feats.push(lnFeat(rectCoords(pts[0], cursor)[0]));
    }
    if (tool === 'circle' && pts.length === 1 && cursor) {
      const { coords } = circleCoords(pts[0], cursor);
      feats.push(lnFeat(coords[0]));
    }

    src.setData({ type: 'FeatureCollection', features: feats });
  };

  // Map Event Bindings
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const ll: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      setCursorLL(ll);

      const d = dragRef.current;
      if (!d.isDragging && !d.isDraggingVertex && !d.isDraggingRotation) {
        const overMarker = map.queryRenderedFeatures(e.point, { layers: ['draw-marker'] }).length > 0;
        map.getCanvas().style.cursor = activeTool ? 'crosshair' : overMarker ? 'grab' : '';
      }

      if (d.isDraggingRotation && d.rotatingPolyId != null && d.rotCenter) {
        if (!d.dragUndoRecorded) {
          pushHistory();
          d.dragUndoRecorded = true;
        }
        const currentAngle = Math.atan2(ll[1] - d.rotCenter[1], ll[0] - d.rotCenter[0]);
        const deltaAngle = currentAngle - d.rotStartAngle;
        updateFeature(d.rotatingPolyId, (f) => {
          const next = { ...f };
          rotateGeometry(next, deltaAngle, d.rotCenter!);
          return next;
        }, false);
        d.rotStartAngle = currentAngle;
      }

      if (d.isDraggingVertex && d.draggedPolyId != null) {
        if (!d.dragUndoRecorded) {
          pushHistory();
          d.dragUndoRecorded = true;
        }
        updateFeature(d.draggedPolyId, (f) => {
          const next = { ...f, geometry: { ...f.geometry } };
          if (d.isRadiusHandle && f.kind === 'circle' && f.props.centerCoord) {
            const newRadius = haversineDist(f.props.centerCoord, ll);
            next.props.radiusMeters = newRadius;
            next.geometry.coordinates = circleCoords(f.props.centerCoord, ll).coords;
          } else if (
            ['polygon', 'rectangle', 'polygon3d'].includes(f.kind) &&
            next.geometry.type === 'Polygon' &&
            next.geometry.coordinates?.[0]
          ) {
            const ring = [...next.geometry.coordinates[0]];
            ring[d.draggedVertexIdx] = ll;
            if (d.draggedVertexIdx === 0) ring[ring.length - 1] = ll;
            next.geometry.coordinates = [ring];
          } else if (f.kind === 'polyline') {
            const coords = [...next.geometry.coordinates];
            coords[d.draggedVertexIdx] = ll;
            next.geometry.coordinates = coords;
          } else if (f.kind === 'route' && f.props.waypoints) {
            const wp = [...f.props.waypoints];
            wp[d.draggedVertexIdx] = ll;
            next.props.waypoints = wp;
          }
          return next;
        }, false);
      }
    };

    const handleWindowPointerMove = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d.isDragging || d.dragFeatureId == null || !d.dragStartCoord || !d.dragOriginalCoords || !d.dragStartPoint) return;

      const rect = map.getContainer().getBoundingClientRect();
      const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
      if (!d.dragUndoRecorded) {
        if (Math.hypot(event.clientX - d.dragStartPoint[0], event.clientY - d.dragStartPoint[1]) < 3) return;
        pushHistory();
        d.dragUndoRecorded = true;
      }

      const startPixel = map.project(d.dragStartCoord);
      const ll = map.unproject([startPixel.x + point[0] - d.dragStartPoint[2], startPixel.y + point[1] - d.dragStartPoint[3]]);
      const dx = ll.lng - d.dragStartCoord[0];
      const dy = ll.lat - d.dragStartCoord[1];
      updateFeature(d.dragFeatureId, (feature) => {
        const next = { ...feature, geometry: { ...feature.geometry } };
        next.geometry.coordinates = translateCoordinates(d.dragOriginalCoords, dx, dy);
        if (feature.kind === 'circle' && feature.props.centerCoord) {
          next.props.centerCoord = [feature.props.centerCoord[0] + dx, feature.props.centerCoord[1] + dy];
        }
        if (feature.props.waypoints) {
          next.props.waypoints = feature.props.waypoints.map((pt) => [pt[0] + dx, pt[1] + dy]);
        }
        return next;
      }, false);
      map.getCanvas().style.cursor = 'grabbing';
    };

    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      const nativeEvent = e.originalEvent as MouseEvent;
      if (nativeEvent.button !== undefined && nativeEvent.button !== 0) return;
      if (!editMode && activeTool) return;
      const d = dragRef.current;

      const vHits = editMode ? map.queryRenderedFeatures(e.point, { layers: ['vertex-points'] }) : [];
      if (vHits.length && vHits[0].properties.polyId != null) {
        const prop = vHits[0].properties;
        if (prop.isRotHandle) {
          d.dragUndoRecorded = false;
          d.dragPanWasEnabled = map.dragPan.isEnabled();
          d.isDraggingRotation = true;
          d.rotatingPolyId = parseInt(prop.polyId, 10);
          const f = featuresRef.current.find((x) => x.id === d.rotatingPolyId);
          if (f) {
            const b = calcBounds(f);
            if (b) {
              d.rotCenter = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
              d.rotStartAngle = Math.atan2(e.lngLat.lat - d.rotCenter[1], e.lngLat.lng - d.rotCenter[0]);
              map.dragPan.disable();
              return;
            }
          }
        }

        d.isDraggingVertex = true;
        d.draggedPolyId = parseInt(prop.polyId, 10);
        d.draggedVertexIdx = prop.vIdx != null ? parseInt(prop.vIdx, 10) : -1;
        d.isRadiusHandle = !!prop.isRadiusHandle;
        d.dragUndoRecorded = false;
        d.dragPanWasEnabled = map.dragPan.isEnabled();
        map.dragPan.disable();
        return;
      }

      const fs = map.queryRenderedFeatures(e.point, {
        layers: ['draw-fill', 'draw-extrusion', 'draw-line', 'draw-outline', 'draw-marker', 'draw-text'],
      });
      const hits = editMode
        ? fs
        : [...fs.filter((hit) => hit.layer.id === 'draw-marker'), ...fs.filter((hit) => hit.layer.id !== 'draw-marker')];
      const hitId = hits.find((hit) => hit.properties.id != null)?.properties.id;
      if (hitId == null) return;
      const id = Number(hitId);
      const feature = featuresRef.current.find((item) => item.id === id);
      if (!feature || (!editMode && feature.kind !== 'marker')) return;

      d.isDragging = true;
      d.dragFeatureId = id;
      const startCoordinate = feature.geometry.type === 'Point'
        ? feature.geometry.coordinates as [number, number]
        : [e.lngLat.lng, e.lngLat.lat] as [number, number];
      const rect = map.getContainer().getBoundingClientRect();
      d.dragStartCoord = startCoordinate;
      // Keep client coordinates for the movement threshold and map-local coordinates for projected movement.
      d.dragStartPoint = [nativeEvent.clientX, nativeEvent.clientY, nativeEvent.clientX - rect.left, nativeEvent.clientY - rect.top];
      d.dragOriginalCoords = JSON.parse(JSON.stringify(feature.geometry.coordinates));
      d.dragUndoRecorded = false;
      d.dragPanWasEnabled = map.dragPan.isEnabled();
      setSelectedId(id);
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
    };

    const handleMouseUp = () => {
      const d = dragRef.current;
      if (d.isDragging || d.isDraggingVertex || d.isDraggingRotation) {
        commitFeatureChanges();
        if (d.isDraggingVertex && d.draggedPolyId != null) {
          const f = featuresRef.current.find((x) => x.id === d.draggedPolyId);
          if (f && f.kind === 'route' && f.props.waypoints) {
            const requestId = (routeEditRequestRef.current.get(f.id) || 0) + 1;
            routeEditRequestRef.current.set(f.id, requestId);
            fetchMultiPointRoute(f.props.waypoints, f.props.routeMode).then((res) => {
              if (routeEditRequestRef.current.get(f.id) !== requestId) return;
              updateFeature(f.id, (feat) => ({
                ...feat,
                geometry: res.geometry,
                props: {
                  ...feat.props,
                  description: res.description,
                  metadata: { distance: res.distance, duration: res.duration },
                  routingFailed: res.routingFailed,
                },
              }));
            });
          }
        }
        d.isDragging = false;
        d.dragFeatureId = null;
        d.dragStartCoord = null;
        d.dragOriginalCoords = null;
        d.dragStartPoint = null;
        d.dragUndoRecorded = false;
        d.isDraggingVertex = false;
        d.draggedPolyId = null;
        d.draggedVertexIdx = -1;
        d.isRadiusHandle = false;
        d.isDraggingRotation = false;
        d.rotatingPolyId = null;
        d.rotCenter = null;
        if (d.dragPanWasEnabled) map.dragPan.enable();
        else map.dragPan.disable();
        map.getCanvas().style.cursor = activeTool ? 'crosshair' : '';
      }
    };

    const handleClick = async (e: maplibregl.MapMouseEvent) => {
      closeContextMenu();
      const ll: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      if (editingRoutePoints) {
        const state = useMapStore.getState();
        const selectedRoute = state.features.find((feature) => feature.id === state.selectedId && feature.kind === 'route');
        const currentWaypoints = selectedRoute?.props.waypoints;
        if (!selectedRoute || !currentWaypoints || currentWaypoints.length < 2) {
          state.setEditingRoutePoints(false);
          setToast('select a route with at least two points to edit its path');
          return;
        }

        const nextWaypoints = insertWaypoint(currentWaypoints, ll);
        updateFeature(selectedRoute.id, (feature) => ({
          ...feature,
          props: { ...feature.props, waypoints: nextWaypoints },
        }));
        const requestId = (routeEditRequestRef.current.get(selectedRoute.id) || 0) + 1;
        routeEditRequestRef.current.set(selectedRoute.id, requestId);
        setToast('updating route...');
        fetchMultiPointRoute(nextWaypoints, selectedRoute.props.routeMode).then((result) => {
          if (routeEditRequestRef.current.get(selectedRoute.id) !== requestId) return;
          updateFeature(selectedRoute.id, (feature) => ({
            ...feature,
            geometry: result.geometry,
            props: {
              ...feature.props,
              waypoints: nextWaypoints,
              description: result.description,
              metadata: { distance: result.distance, duration: result.duration },
              routingFailed: result.routingFailed,
            },
          }));
          setToast(result.routingFailed ? 'waypoint added; showing straight line' : 'waypoint added and route updated');
        }).catch(() => {
          setToast('route update failed. the waypoint is saved; try recalculate route.');
        });
        return;
      }

      if (!activeTool) {
        if (!editMode) {
          const fs = map.queryRenderedFeatures(e.point, {
            layers: ['draw-fill', 'draw-extrusion', 'draw-line', 'draw-outline', 'draw-marker', 'draw-text'],
          });
          if (fs.length && fs[0].properties.id != null) {
            const id = parseInt(fs[0].properties.id, 10);
            setSelectedId(id);
          }
        }
        return;
      }

      const id = ++nextFid.current;

      if (activeTool === 'placeBuilding') {
        const archCfg = ARCHETYPE_CONFIGS[selectedBuildingArchetype] || ARCHETYPE_CONFIGS.skyscraper;
        const bName = `${archCfg.label} ${id}`;
        const compoundFeats = generateCompoundBuildingFeatures(
          id,
          bName,
          selectedBuildingArchetype,
          ll
        );
        nextFid.current += compoundFeats.length + 1;
        compoundFeats.forEach((feat) => addFeature(feat));
        const mainTower = compoundFeats.find((f) => f.props.tierRole === 'tower') || compoundFeats[0];
        setSelectedId(mainTower.id);
        togglePanel('shapeEditor', true);
        setActiveTool(null);
        setToast(`Placed ${archCfg.label}!`);
        return;
      }

      if (activeTool === 'marker') {
        const nextPinNumber = featuresRef.current.reduce((highest, feature) => {
          if (feature.kind !== 'marker') return highest;
          const match = /^Pin(?:\s+(\d+))?$/i.exec(feature.name.trim());
          return match ? Math.max(highest, Number(match[1] || 1)) : highest;
        }, 0) + 1;
        const pinName = `Pin ${nextPinNumber}`;
        const iconKey = customMarkerKey || getIconKey(markerShape, markerColor, map);
        addFeature({
          id,
          name: pinName,
          kind: 'marker',
          geometry: { type: 'Point', coordinates: ll },
          props: {
            shape: markerShape,
            color: markerColor,
            iconSize: markerSize,
            iconSizeMode: markerSizeMode,
            iconKey,
            visible: 1,
            attributes: { name: pinName },
          },
        });
        setSelectedId(id);
        togglePanel('shapeEditor', true);
        setActiveTool(null);
        setToast(`${pinName} placed`);
      } else if (activeTool === 'textbox') {
        addFeature({
          id,
          name: `Text ${id}`,
          kind: 'textbox',
          geometry: { type: 'Point', coordinates: ll },
          props: {
            text: textContent || 'Label',
            fontSize: textSize,
            color: textColor,
            opacity: textOpacity,
            visible: 1,
            attributes: { name: `Text ${id}` },
          },
        });
        setActiveTool(null);
        setToast('Label placed');
      } else if (activeTool === 'rectangle') {
        const nextDraft = [...draft, ll];
        if (nextDraft.length === 2) {
          addFeature({
            id,
            name: `Rectangle ${id}`,
            kind: 'rectangle',
            geometry: { type: 'Polygon', coordinates: rectCoords(nextDraft[0], nextDraft[1]) },
            props: {
              color: '#e8b84a',
              borderColor: '#e8b84a',
              width: 3,
              fillColor: '#e8b84a',
              fillOpacity: 0.35,
              borderOpacity: 0.9,
              visible: 1,
              attributes: { name: `Rectangle ${id}` },
            },
          });
          setDraft([]);
          setActiveTool(null);
          setToast('Rectangle created');
        } else {
          setDraft(nextDraft);
        }
      } else if (activeTool === 'circle') {
        const nextDraft = [...draft, ll];
        if (nextDraft.length === 2) {
          const { coords, r } = circleCoords(nextDraft[0], nextDraft[1]);
          addFeature({
            id,
            name: `Circle ${id}`,
            kind: 'circle',
            geometry: { type: 'Polygon', coordinates: coords },
            props: {
              color: '#e8b84a',
              borderColor: '#e8b84a',
              width: 3,
              fillColor: '#e8b84a',
              fillOpacity: 0.35,
              borderOpacity: 0.9,
              centerCoord: nextDraft[0],
              radiusMeters: r,
              visible: 1,
              attributes: { name: `Circle ${id}` },
            },
          });
          setDraft([]);
          setActiveTool(null);
          setToast('Circle created');
        } else {
          setDraft(nextDraft);
        }
      } else if (activeTool === 'polyline') {
        const nextDraft = [...draft, ll];
        if (nextDraft.length >= 2) {
          const pScreen = map.project(ll);
          const lastScreen = map.project(draft[draft.length - 1]);
          if (Math.hypot(pScreen.x - lastScreen.x, pScreen.y - lastScreen.y) < 18) {
            addFeature({
              id,
              name: `Polyline ${id}`,
              kind: 'polyline',
              geometry: { type: 'LineString', coordinates: draft },
              props: {
                color: '#38bdf8',
                borderColor: '#38bdf8',
                width: 4,
                borderOpacity: 0.9,
                visible: 1,
                attributes: { name: `Polyline ${id}` },
              },
            });
            setDraft([]);
            setActiveTool(null);
            setToast('Polyline created');
            return;
          }
        }
        setDraft(nextDraft);
      } else if (activeTool === 'polygon' || activeTool === 'polygon3d') {
        const is3D = activeTool === 'polygon3d';
        if (draft.length >= 3) {
          const pScreen = map.project(ll);
          const originScreen = map.project(draft[0]);
          if (Math.hypot(pScreen.x - originScreen.x, pScreen.y - originScreen.y) < 32) {
            const rawRing = [...draft, draft[0]];
            if (is3D) {
              const archCfg = ARCHETYPE_CONFIGS[selectedBuildingArchetype] || ARCHETYPE_CONFIGS.skyscraper;
              const bName = `${archCfg.label} ${id}`;
              const compoundFeats = generateCompoundBuildingFeatures(
                id,
                bName,
                selectedBuildingArchetype,
                ll,
                undefined,
                rawRing
              );
              nextFid.current += compoundFeats.length + 1;
              compoundFeats.forEach((feat) => addFeature(feat));
              const mainTower = compoundFeats.find((f) => f.props.tierRole === 'tower') || compoundFeats[0];
              setSelectedId(mainTower.id);
              togglePanel('shapeEditor', true);
              setDraft([]);
              setActiveTool(null);
              setToast(`${archCfg.label} created!`);
              return;
            } else {
              addFeature({
                id,
                name: `Polygon ${id}`,
                kind: 'polygon',
                geometry: { type: 'Polygon', coordinates: [rawRing] },
                props: {
                  color: '#e8b84a',
                  borderColor: '#e8b84a',
                  width: 3,
                  fillColor: '#e8b84a',
                  fillOpacity: 0.35,
                  borderOpacity: 0.9,
                  visible: 1,
                  attributes: { name: `Polygon ${id}` },
                },
              });
              setDraft([]);
              setActiveTool(null);
              setToast('Polygon closed');
              return;
            }
          }
        }
        setDraft([...draft, ll]);
      } else if (activeTool === 'route') {
        const nextDraft = [...draft, ll];
        if (nextDraft.length >= 2) {
          const pScreen = map.project(ll);
          const lastScreen = map.project(draft[draft.length - 1]);
          if (Math.hypot(pScreen.x - lastScreen.x, pScreen.y - lastScreen.y) < 22) {
            setToast('Calculating route...');
            const res = await fetchMultiPointRoute(draft, routeMode);
            addFeature({
              id,
              name: `Route ${id}`,
              kind: 'route',
              geometry: res.geometry,
              props: {
                color: routeColor,
                borderColor: routeColor,
                width: 4,
                borderOpacity: 0.9,
                routeMode,
                waypoints: draft,
                description: res.description,
                metadata: { distance: res.distance, duration: res.duration },
                routingFailed: res.routingFailed,
                showLabel: true,
                visible: 1,
                attributes: { name: `Route ${id}`, description: res.description },
              },
            });
            setDraft([]);
            setActiveTool(null);
            setToast('Route created');
            return;
          }
        }
        setDraft(nextDraft);
      }
    };

    const handleDblClick = async (e: maplibregl.MapMouseEvent) => {
      if ((activeTool === 'polygon' || activeTool === 'polygon3d') && draft.length >= 3) {
        e.preventDefault();
        const is3D = activeTool === 'polygon3d';
        const id = ++nextFid.current;
        const pts = draft.filter(
          (pt, i) => i === 0 || Math.hypot(pt[0] - draft[i - 1][0], pt[1] - draft[i - 1][1]) > 1e-6
        );
        if (pts.length >= 3) {
          const rawRing = [...pts, pts[0]];
          if (is3D) {
            const archCfg = ARCHETYPE_CONFIGS[selectedBuildingArchetype] || ARCHETYPE_CONFIGS.skyscraper;
            const bName = `${archCfg.label} ${id}`;
            const compoundFeats = generateCompoundBuildingFeatures(
              id,
              bName,
              selectedBuildingArchetype,
              pts[0],
              undefined,
              rawRing
            );
            nextFid.current += compoundFeats.length + 1;
            compoundFeats.forEach((feat) => addFeature(feat));
            const mainTower = compoundFeats.find((f) => f.props.tierRole === 'tower') || compoundFeats[0];
            setSelectedId(mainTower.id);
            togglePanel('shapeEditor', true);
            setDraft([]);
            setActiveTool(null);
            setToast(`${archCfg.label} finalized!`);
            return;
          } else {
            addFeature({
              id,
              name: `Polygon ${id}`,
              kind: 'polygon',
              geometry: { type: 'Polygon', coordinates: [rawRing] },
              props: {
                color: '#e8b84a',
                borderColor: '#e8b84a',
                width: 3,
                fillColor: '#e8b84a',
                fillOpacity: 0.35,
                borderOpacity: 0.9,
                visible: 1,
                attributes: { name: `Polygon ${id}` },
              },
            });
            setDraft([]);
            setActiveTool(null);
            setToast('Polygon finalized');
            return;
          }
        }
      }
      if (activeTool === 'route' && draft.length >= 2) {
        e.preventDefault();
        setToast('Calculating route...');
        const id = ++nextFid.current;
        const res = await fetchMultiPointRoute(draft, routeMode);
        addFeature({
          id,
          name: `Route ${id}`,
          kind: 'route',
          geometry: res.geometry,
          props: {
            color: routeColor,
            borderColor: routeColor,
            width: 4,
            borderOpacity: 0.9,
            routeMode,
            waypoints: draft,
            description: res.description,
            metadata: { distance: res.distance, duration: res.duration },
            routingFailed: res.routingFailed,
            showLabel: true,
            visible: 1,
            attributes: { name: `Route ${id}`, description: res.description },
          },
        });
        setDraft([]);
        setActiveTool(null);
        setToast('Route finalized');
      }
    };

    const handleContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      const fs = map.queryRenderedFeatures(e.point, {
        layers: ['draw-fill', 'draw-extrusion', 'draw-line', 'draw-outline', 'draw-marker', 'draw-text'],
      });
      const hitId = fs.length && fs[0].properties.id != null ? parseInt(fs[0].properties.id, 10) : null;

      setContextMenu({
        visible: true,
        x: e.point.x,
        y: e.point.y,
        lngLat: [e.lngLat.lng, e.lngLat.lat],
        featureId: hitId,
      });
    };

    map.on('mousemove', handleMouseMove);
    map.on('mousedown', handleMouseDown);
    map.on('mouseup', handleMouseUp);
    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);
    map.on('contextmenu', handleContextMenu);
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('pointercancel', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);

    return () => {
      handleMouseUp();
      map.off('mousemove', handleMouseMove);
      map.off('mousedown', handleMouseDown);
      map.off('mouseup', handleMouseUp);
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
      map.off('contextmenu', handleContextMenu);
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('pointercancel', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
    };
  }, [
    activeTool,
    editingRoutePoints,
    editMode,
    draft,
    markerShape,
    markerColor,
    markerSize,
    markerSizeMode,
    customMarkerKey,
    textContent,
    textSize,
    textColor,
    textOpacity,
    routeMode,
    routeColor,
    selectedBuildingArchetype,
    updateFeature,
    setToast,
  ]);

  return <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />;
};
