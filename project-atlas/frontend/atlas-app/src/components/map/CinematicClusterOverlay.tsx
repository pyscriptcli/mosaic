'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useMapStore } from '../../store/useMapStore';
import { circleCoordsFromRadius } from '../../gis/circles';
import {
  X,
  Radar,
  Users,
  Car,
  TrendingUp,
  Building2,
  Sparkles,
  MapPin,
  RotateCcw,
  PanelRightClose,
  Map,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Compass,
  Navigation2,
  Orbit,
  Eye,
  Layers,
  CircleDot
} from 'lucide-react';

interface CinematicClusterOverlayProps {
  mapInstance: any;
}

interface OsmStreetData {
  primaryFeatures: any[];
  crossFeatures: any[];
  primaryRoadName: string;
  crossRoadNames: string[];
}

// Fetch and intelligently categorize real street geometries from OpenStreetMap via Overpass API
async function fetchOsmStreetGeometry(
  lat: number,
  lon: number,
  corridorHint?: string
): Promise<OsmStreetData> {
  try {
    const ql = `[out:json][timeout:25];(way["highway"~"primary|secondary|tertiary|trunk|residential|unclassified"](around:350,${lat},${lon}););out geom;`;
    const res = await fetch('/api/overpass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ql, timeout: 25 }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.elements) {
        const validWays = data.elements.filter(
          (el: any) => el.geometry && el.geometry.length > 1 && el.tags?.name
        );

        // Normalize corridor hint (e.g. "Timog Avenue" -> "timog")
        const cleanHint = (corridorHint || '')
          .toLowerCase()
          .replace(/(avenue|ave|street|st|road|rd|highway|hwy|boulevard|blvd)\b/gi, '')
          .trim();

        // 1. Identify primary road: matches corridorHint or has highest highway tier
        let primaryName = '';
        const matchingWay = validWays.find((w: any) => {
          const name = (w.tags?.name || '').toLowerCase();
          return cleanHint.length >= 3 && name.includes(cleanHint);
        });

        if (matchingWay) {
          primaryName = matchingWay.tags.name;
        } else {
          // Rank by road tier
          const tierRank: Record<string, number> = {
            trunk: 5,
            primary: 4,
            secondary: 3,
            tertiary: 2,
            residential: 1,
            unclassified: 1,
          };
          const sorted = [...validWays].sort(
            (a, b) => (tierRank[b.tags?.highway] || 0) - (tierRank[a.tags?.highway] || 0)
          );
          primaryName = sorted[0]?.tags?.name || corridorHint || 'Primary Corridor';
        }

        const primaryFeatures: any[] = [];
        const crossFeatures: any[] = [];
        const crossNameSet = new Set<string>();

        validWays.forEach((el: any) => {
          const name = el.tags?.name;
          const feat = {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: el.geometry.map((pt: any) => [pt.lon, pt.lat]),
            },
            properties: {
              name,
              highway: el.tags?.highway,
            },
          };

          if (name && name.toLowerCase() === primaryName.toLowerCase()) {
            primaryFeatures.push(feat);
          } else if (name && name !== 'Street Corridor') {
            crossFeatures.push(feat);
            crossNameSet.add(name);
          }
        });

        return {
          primaryFeatures,
          crossFeatures,
          primaryRoadName: primaryName,
          crossRoadNames: Array.from(crossNameSet).slice(0, 3),
        };
      }
    }
  } catch (e) {
    console.warn('Failed to fetch OSM street geometry:', e);
  }

  return {
    primaryFeatures: [],
    crossFeatures: [],
    primaryRoadName: corridorHint || 'Primary Corridor',
    crossRoadNames: [],
  };
}

export const CinematicClusterOverlay: React.FC<CinematicClusterOverlayProps> = ({ mapInstance }) => {
  const {
    activeCinematicCluster,
    setActiveCinematicCluster,
    focusDisplayMode,
    setFocusDisplayMode,
    features,
  } = useMapStore();

  const [screenPos, setScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [primaryRoadName, setPrimaryRoadName] = useState<string>('');
  const [crossRoadNames, setCrossRoadNames] = useState<string[]>([]);
  
  // Walkthrough & Cinematic Modes
  const [cameraMode, setCameraMode] = useState<'glide' | 'orbit' | 'stepper'>('glide');
  const [poiVizMode, setPoiVizMode] = useState<'halos' | 'beacons'>('halos');
  const [activeAnchorIndex, setActiveAnchorIndex] = useState<number>(0);
  const [isPlayingTour, setIsPlayingTour] = useState<boolean>(false);

  const animFrameRef = useRef<number | null>(null);
  const cameraBearingRef = useRef<number>(-28);

  // Cluster POIs extraction from MapStore
  const clusterPois = useMemo(() => {
    if (!activeCinematicCluster?.center) return [];
    const [lat, lon] = activeCinematicCluster.center;
    return features.filter((f) => {
      if (f.kind !== 'marker' || f.geometry.type !== 'Point') return false;
      const [pLon, pLat] = f.geometry.coordinates;
      return Math.hypot(pLon - lon, pLat - lat) < 0.0045;
    });
  }, [features, activeCinematicCluster]);

  const anchors = useMemo(() => {
    if (activeCinematicCluster?.keyTenants && activeCinematicCluster.keyTenants.length > 0) {
      return activeCinematicCluster.keyTenants;
    }
    if (clusterPois.length > 0) {
      return clusterPois.slice(0, 4).map((p) => p.name);
    }
    return ['Commercial Center'];
  }, [activeCinematicCluster, clusterPois]);

  // Sync screen projection of the cluster center on map move/zoom/pitch
  useEffect(() => {
    if (!mapInstance || !activeCinematicCluster || !activeCinematicCluster.center) {
      setScreenPos(null);
      return;
    }

    const [lat, lon] = activeCinematicCluster.center;

    const updateScreenPos = () => {
      try {
        const point = mapInstance.project([lon, lat]);
        setScreenPos({ x: point.x, y: point.y });
      } catch (e) {}
    };

    updateScreenPos();
    mapInstance.on('move', updateScreenPos);
    mapInstance.on('zoom', updateScreenPos);
    mapInstance.on('pitch', updateScreenPos);
    mapInstance.on('rotate', updateScreenPos);

    return () => {
      mapInstance.off('move', updateScreenPos);
      mapInstance.off('zoom', updateScreenPos);
      mapInstance.off('pitch', updateScreenPos);
      mapInstance.off('rotate', updateScreenPos);
    };
  }, [mapInstance, activeCinematicCluster]);

  // Auto-tour player stepper interval
  useEffect(() => {
    let interval: any;
    if (isPlayingTour && anchors.length > 1) {
      interval = setInterval(() => {
        setActiveAnchorIndex((prev) => (prev + 1) % anchors.length);
      }, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlayingTour, anchors.length]);

  // Camera flight when active anchor changes in stepper mode or manual click
  useEffect(() => {
    if (!mapInstance || !activeCinematicCluster?.center) return;
    const currentAnchorName = anchors[activeAnchorIndex];
    if (!currentAnchorName) return;

    const matchedPoi = clusterPois.find((p) =>
      p.name.toLowerCase().includes(currentAnchorName.toLowerCase())
    );

    if (matchedPoi && matchedPoi.geometry.type === 'Point') {
      const [aLon, aLat] = matchedPoi.geometry.coordinates;
      mapInstance.easeTo({
        center: [aLon, aLat],
        zoom: 17.5,
        pitch: 65,
        bearing: (mapInstance.getBearing() + 15) % 360,
        duration: 1600,
      });
    }
  }, [activeAnchorIndex, anchors, clusterPois, mapInstance]);

  // Handle camera flight and map animation layers
  useEffect(() => {
    if (!mapInstance || !activeCinematicCluster || !activeCinematicCluster.center) {
      cleanupMapLayers();
      setPrimaryRoadName('');
      setCrossRoadNames([]);
      return;
    }

    const [lat, lon] = activeCinematicCluster.center;

    // Initial cinematic 3D oblique camera flight
    mapInstance.easeTo({
      center: [lon, lat],
      zoom: 16.5,
      pitch: 62,
      bearing: -28,
      duration: 2000,
    });

    cameraBearingRef.current = -28;
    let isCancelled = false;

    const initMapLayers = async () => {
      setupRadarLayers(lon, lat);

      // Fetch actual street geometries from OpenStreetMap with corridor matching
      const osmData = await fetchOsmStreetGeometry(lat, lon, activeCinematicCluster.corridor);
      if (isCancelled) return;

      setPrimaryRoadName(osmData.primaryRoadName);
      setCrossRoadNames(osmData.crossRoadNames);

      if (osmData.primaryFeatures.length > 0 || osmData.crossFeatures.length > 0) {
        setupOsmCorridorLayers(osmData.primaryFeatures, osmData.crossFeatures);
      } else {
        setupFallbackCorridorLayers(lon, lat);
      }

      setupPoiWalkthroughLayers(lon, lat, clusterPois);
    };

    initMapLayers();

    // Animation loop for continuous radar, POI ripples, and drone orbit
    let step = 0;
    const animate = () => {
      step += 0.025;
      updateAnimatedRadar(lon, lat, step);
      updatePoiWalkthroughAnimations(lon, lat, clusterPois, step, activeAnchorIndex, poiVizMode);

      // Continuous slow 360-degree drone orbit if in orbit mode
      if (cameraMode === 'orbit' && mapInstance) {
        cameraBearingRef.current = (cameraBearingRef.current + 0.09) % 360;
        mapInstance.setBearing(cameraBearingRef.current);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isCancelled = true;
      cleanupMapLayers();
    };
  }, [mapInstance, activeCinematicCluster, cameraMode, poiVizMode, activeAnchorIndex, clusterPois]);

  const setupRadarLayers = (lon: number, lat: number) => {
    if (!mapInstance) return;
    cleanupRadarLayers();

    try {
      mapInstance.addSource('cinematic-radar-pulse-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      mapInstance.addLayer({
        id: 'cinematic-radar-pulse-fill',
        type: 'fill',
        source: 'cinematic-radar-pulse-source',
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': ['get', 'opacity'],
        },
      });

      mapInstance.addLayer({
        id: 'cinematic-radar-pulse-stroke',
        type: 'line',
        source: 'cinematic-radar-pulse-source',
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
          'line-opacity': ['get', 'strokeOpacity'],
        },
      });
    } catch (e) {
      console.warn('Could not add radar layers:', e);
    }
  };

  const setupOsmCorridorLayers = (primaryFeatures: any[], crossFeatures: any[]) => {
    if (!mapInstance) return;
    cleanupCorridorLayers();

    try {
      // 1. Primary Corridor Layer (Thick Obsidian Base + Pure White Vehicle Dash Flow)
      mapInstance.addSource('cinematic-corridor-primary-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: primaryFeatures },
      });

      mapInstance.addLayer({
        id: 'cinematic-corridor-primary-base',
        type: 'line',
        source: 'cinematic-corridor-primary-source',
        paint: {
          'line-color': '#000000',
          'line-width': 10,
          'line-opacity': 0.9,
        },
      });

      mapInstance.addLayer({
        id: 'cinematic-corridor-primary-dash',
        type: 'line',
        source: 'cinematic-corridor-primary-source',
        paint: {
          'line-color': '#ffffff',
          'line-width': 3,
          'line-dasharray': [2, 3],
        },
      });

      // 2. Intersecting Cross Streets (Subtle Secondary Dash Lines)
      if (crossFeatures.length > 0) {
        mapInstance.addSource('cinematic-corridor-cross-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: crossFeatures },
        });

        mapInstance.addLayer({
          id: 'cinematic-corridor-cross-base',
          type: 'line',
          source: 'cinematic-corridor-cross-source',
          paint: {
            'line-color': '#18181b',
            'line-width': 5,
            'line-opacity': 0.7,
          },
        });

        mapInstance.addLayer({
          id: 'cinematic-corridor-cross-dash',
          type: 'line',
          source: 'cinematic-corridor-cross-source',
          paint: {
            'line-color': '#a1a1aa',
            'line-width': 1.5,
            'line-dasharray': [3, 4],
            'line-opacity': 0.8,
          },
        });
      }
    } catch (e) {
      console.warn('Could not add OSM corridor layers:', e);
    }
  };

  const setupFallbackCorridorLayers = (lon: number, lat: number) => {
    if (!mapInstance) return;
    cleanupCorridorLayers();

    try {
      const delta = 0.0025;
      const fallbackCoords = [
        [lon - delta, lat - delta * 0.4],
        [lon, lat],
        [lon + delta, lat + delta * 0.4],
      ];

      mapInstance.addSource('cinematic-corridor-primary-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: fallbackCoords },
              properties: {},
            },
          ],
        },
      });

      mapInstance.addLayer({
        id: 'cinematic-corridor-primary-base',
        type: 'line',
        source: 'cinematic-corridor-primary-source',
        paint: {
          'line-color': '#000000',
          'line-width': 8,
          'line-opacity': 0.8,
        },
      });

      mapInstance.addLayer({
        id: 'cinematic-corridor-primary-dash',
        type: 'line',
        source: 'cinematic-corridor-primary-source',
        paint: {
          'line-color': '#ffffff',
          'line-width': 2.5,
          'line-dasharray': [2, 3],
        },
      });
    } catch (e) {}
  };

  const setupPoiWalkthroughLayers = (lon: number, lat: number, pois: any[]) => {
    if (!mapInstance) return;
    cleanupPoiLayers();

    try {
      // Connectors from each POI to the center / corridor axis
      const connectorLines = pois
        .filter((p) => p.geometry?.type === 'Point')
        .map((p) => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [p.geometry.coordinates, [lon, lat]],
          },
          properties: {},
        }));

      mapInstance.addSource('cinematic-poi-connectors-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: connectorLines },
      });

      mapInstance.addLayer({
        id: 'cinematic-poi-connectors-line',
        type: 'line',
        source: 'cinematic-poi-connectors-source',
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.5,
          'line-dasharray': [1, 2],
          'line-opacity': 0.45,
        },
      });

      // Animated POI Halos / Beacons source
      mapInstance.addSource('cinematic-poi-halos-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      mapInstance.addLayer({
        id: 'cinematic-poi-halos-fill',
        type: 'fill',
        source: 'cinematic-poi-halos-source',
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': ['get', 'opacity'],
        },
      });

      mapInstance.addLayer({
        id: 'cinematic-poi-halos-stroke',
        type: 'line',
        source: 'cinematic-poi-halos-source',
        paint: {
          'line-color': '#ffffff',
          'line-width': ['get', 'strokeWidth'],
          'line-opacity': ['get', 'strokeOpacity'],
        },
      });
    } catch (e) {
      console.warn('Could not add POI walkthrough layers:', e);
    }
  };

  const updateAnimatedRadar = (lon: number, lat: number, step: number) => {
    if (!mapInstance) return;
    try {
      const radarSource = mapInstance.getSource('cinematic-radar-pulse-source');
      if (radarSource) {
        const wave1 = (step % 2) / 2;
        const wave2 = ((step + 1) % 2) / 2;

        const r1 = 20 + wave1 * 120;
        const r2 = 20 + wave2 * 120;

        const poly1 = circleCoordsFromRadius([lon, lat], r1);
        const poly2 = circleCoordsFromRadius([lon, lat], r2);

        radarSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: poly1 },
              properties: { opacity: Math.max(0, (1 - wave1) * 0.15), strokeOpacity: Math.max(0, (1 - wave1) * 0.8) },
            },
            {
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: poly2 },
              properties: { opacity: Math.max(0, (1 - wave2) * 0.15), strokeOpacity: Math.max(0, (1 - wave2) * 0.8) },
            },
          ],
        });
      }
    } catch (e) {}
  };

  const updatePoiWalkthroughAnimations = (
    lon: number,
    lat: number,
    pois: any[],
    step: number,
    activeIdx: number,
    vizMode: 'halos' | 'beacons'
  ) => {
    if (!mapInstance) return;
    try {
      const halosSource = mapInstance.getSource('cinematic-poi-halos-source');
      if (halosSource && pois.length > 0) {
        const haloFeatures: any[] = [];

        pois.forEach((poi, idx) => {
          if (poi.geometry?.type !== 'Point') return;
          const [pLon, pLat] = poi.geometry.coordinates;
          const isInspected = idx === activeIdx;

          if (vizMode === 'halos') {
            const wave = ((step + idx * 0.4) % 1.5) / 1.5;
            const radius = (isInspected ? 22 : 12) + wave * (isInspected ? 30 : 18);
            const poly = circleCoordsFromRadius([pLon, pLat], radius);
            haloFeatures.push({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: poly },
              properties: {
                opacity: (1 - wave) * (isInspected ? 0.35 : 0.15),
                strokeOpacity: (1 - wave) * (isInspected ? 1.0 : 0.6),
                strokeWidth: isInspected ? 2.5 : 1.5,
              },
            });
          } else {
            // Luminous Spotlight Beacons
            const pulse = (Math.sin(step * 4 + idx) + 1) / 2;
            const radius = (isInspected ? 18 : 10) + pulse * (isInspected ? 12 : 6);
            const poly = circleCoordsFromRadius([pLon, pLat], radius);
            haloFeatures.push({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: poly },
              properties: {
                opacity: 0.2 + pulse * (isInspected ? 0.4 : 0.2),
                strokeOpacity: 0.7 + pulse * 0.3,
                strokeWidth: isInspected ? 3 : 1.5,
              },
            });
          }
        });

        halosSource.setData({
          type: 'FeatureCollection',
          features: haloFeatures,
        });
      }
    } catch (e) {}
  };

  const cleanupRadarLayers = () => {
    if (!mapInstance) return;
    try {
      if (mapInstance.getLayer('cinematic-radar-pulse-stroke')) mapInstance.removeLayer('cinematic-radar-pulse-stroke');
      if (mapInstance.getLayer('cinematic-radar-pulse-fill')) mapInstance.removeLayer('cinematic-radar-pulse-fill');
      if (mapInstance.getSource('cinematic-radar-pulse-source')) mapInstance.removeSource('cinematic-radar-pulse-source');
    } catch (e) {}
  };

  const cleanupCorridorLayers = () => {
    if (!mapInstance) return;
    try {
      if (mapInstance.getLayer('cinematic-corridor-primary-dash')) mapInstance.removeLayer('cinematic-corridor-primary-dash');
      if (mapInstance.getLayer('cinematic-corridor-primary-base')) mapInstance.removeLayer('cinematic-corridor-primary-base');
      if (mapInstance.getSource('cinematic-corridor-primary-source')) mapInstance.removeSource('cinematic-corridor-primary-source');

      if (mapInstance.getLayer('cinematic-corridor-cross-dash')) mapInstance.removeLayer('cinematic-corridor-cross-dash');
      if (mapInstance.getLayer('cinematic-corridor-cross-base')) mapInstance.removeLayer('cinematic-corridor-cross-base');
      if (mapInstance.getSource('cinematic-corridor-cross-source')) mapInstance.removeSource('cinematic-corridor-cross-source');
    } catch (e) {}
  };

  const cleanupPoiLayers = () => {
    if (!mapInstance) return;
    try {
      if (mapInstance.getLayer('cinematic-poi-halos-stroke')) mapInstance.removeLayer('cinematic-poi-halos-stroke');
      if (mapInstance.getLayer('cinematic-poi-halos-fill')) mapInstance.removeLayer('cinematic-poi-halos-fill');
      if (mapInstance.getSource('cinematic-poi-halos-source')) mapInstance.removeSource('cinematic-poi-halos-source');

      if (mapInstance.getLayer('cinematic-poi-connectors-line')) mapInstance.removeLayer('cinematic-poi-connectors-line');
      if (mapInstance.getSource('cinematic-poi-connectors-source')) mapInstance.removeSource('cinematic-poi-connectors-source');
    } catch (e) {}
  };

  const cleanupMapLayers = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    cleanupRadarLayers();
    cleanupCorridorLayers();
    cleanupPoiLayers();
  };

  if (!activeCinematicCluster) return null;

  const handleResetCamera = () => {
    if (!mapInstance || !activeCinematicCluster.center) return;
    const [lat, lon] = activeCinematicCluster.center;
    mapInstance.easeTo({
      center: [lon, lat],
      zoom: 14.5,
      pitch: 0,
      bearing: 0,
      duration: 1500,
    });
  };

  const handleClose = () => {
    setActiveCinematicCluster(null);
  };

  // Shared inner content component for both Popup and Right Panel presentations
  const renderClusterContent = (isPanelMode: boolean) => (
    <div className="flex flex-col h-full space-y-3">
      {/* Top Controls: Header, Mode Switcher & Close */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-white/20 flex items-center justify-center text-white shadow-sm shrink-0">
            <Radar className="w-4 h-4 animate-spin" style={{ animationDuration: '6s' }} />
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 block">
              Cinematic Analysis Walkthrough
            </span>
            <h3 className="font-extrabold text-sm text-white tracking-tight leading-none mt-0.5">
              {activeCinematicCluster.name}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Popup vs Panel Switcher */}
          <div className="flex bg-black/60 p-0.5 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setFocusDisplayMode('popup')}
              className={`px-2 py-1 rounded-lg text-[9px] font-bold transition flex items-center gap-1 ${
                focusDisplayMode === 'popup'
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Switch to On-Map Floating Popup"
            >
              <Map className="w-3 h-3" />
              <span className="hidden sm:inline">Popup</span>
            </button>
            <button
              type="button"
              onClick={() => setFocusDisplayMode('rightPanel')}
              className={`px-2 py-1 rounded-lg text-[9px] font-bold transition flex items-center gap-1 ${
                focusDisplayMode === 'rightPanel'
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Switch to Right Slide-in Panel"
            >
              <PanelRightClose className="w-3 h-3" />
              <span className="hidden sm:inline">Panel</span>
            </button>
          </div>

          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-xl bg-zinc-900 border border-white/15 text-zinc-400 hover:text-white hover:border-white/30 flex items-center justify-center transition shrink-0"
            title="Close Cinematic Focus"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 1. Ground-Truth Verified Street Corridor Card */}
      <div className="bg-black/60 border border-white/15 rounded-2xl p-2.5 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <div>
              <span className="text-[9px] text-zinc-400 uppercase font-bold tracking-wider block leading-none">
                Primary Corridor
              </span>
              <span className="font-extrabold text-white text-xs block mt-0.5">
                {primaryRoadName || activeCinematicCluster.corridor}
              </span>
            </div>
          </div>
          <span className="font-mono text-zinc-300 font-bold text-[10px] px-2 py-0.5 bg-white/5 rounded-md border border-white/15 shrink-0">
            {activeCinematicCluster.center[0].toFixed(4)}°, {activeCinematicCluster.center[1].toFixed(4)}°
          </span>
        </div>

        {crossRoadNames.length > 0 && (
          <div className="pt-1.5 border-t border-white/10 flex items-center gap-1.5 text-[10px]">
            <span className="text-zinc-500 font-semibold shrink-0">Cross Streets:</span>
            <span className="text-zinc-300 font-medium truncate">
              {crossRoadNames.join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* 2. Cinematic Walkthrough Controls & Mode Selector */}
      <div className="bg-zinc-950/70 border border-white/10 rounded-2xl p-2.5 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
            <Compass className="w-3 h-3 text-zinc-300" />
            <span>Walkthrough Controls</span>
          </span>

          {/* Camera Motion Selector */}
          <div className="flex gap-1 p-0.5 bg-black/60 rounded-xl border border-white/10 text-[9px] font-bold">
            <button
              type="button"
              onClick={() => setCameraMode('glide')}
              className={`px-2 py-0.5 rounded-lg transition flex items-center gap-1 ${
                cameraMode === 'glide' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
              }`}
              title="Corridor Glide"
            >
              <Navigation2 className="w-2.5 h-2.5" />
              <span>Glide</span>
            </button>
            <button
              type="button"
              onClick={() => setCameraMode('orbit')}
              className={`px-2 py-0.5 rounded-lg transition flex items-center gap-1 ${
                cameraMode === 'orbit' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
              }`}
              title="Drone 360° Orbit"
            >
              <Orbit className="w-2.5 h-2.5" />
              <span>Orbit</span>
            </button>
            <button
              type="button"
              onClick={() => setCameraMode('stepper')}
              className={`px-2 py-0.5 rounded-lg transition flex items-center gap-1 ${
                cameraMode === 'stepper' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
              }`}
              title="Step through Anchor POIs"
            >
              <Eye className="w-2.5 h-2.5" />
              <span>Inspect</span>
            </button>
          </div>
        </div>

        {/* POI Visuals Style Selector */}
        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
          <span className="text-zinc-400 font-medium">POI Visuals:</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPoiVizMode('halos')}
              className={`px-2 py-0.5 rounded-lg font-semibold transition flex items-center gap-1 text-[9px] ${
                poiVizMode === 'halos'
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'text-zinc-400 hover:text-white bg-white/5 border border-white/5'
              }`}
            >
              <CircleDot className="w-2.5 h-2.5" />
              <span>Radar Halos</span>
            </button>
            <button
              type="button"
              onClick={() => setPoiVizMode('beacons')}
              className={`px-2 py-0.5 rounded-lg font-semibold transition flex items-center gap-1 text-[9px] ${
                poiVizMode === 'beacons'
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'text-zinc-400 hover:text-white bg-white/5 border border-white/5'
              }`}
            >
              <Sparkles className="w-2.5 h-2.5" />
              <span>Beacons</span>
            </button>
          </div>
        </div>

        {/* Mini Stepper Player */}
        <div className="flex items-center justify-between pt-1.5 border-t border-white/10">
          <button
            type="button"
            onClick={() =>
              setActiveAnchorIndex((prev) => (prev > 0 ? prev - 1 : anchors.length - 1))
            }
            className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition"
            title="Previous POI"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsPlayingTour(!isPlayingTour)}
            className={`px-3 py-1 rounded-xl font-bold text-[10px] transition flex items-center gap-1.5 ${
              isPlayingTour
                ? 'bg-white text-black shadow-md animate-pulse'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
            }`}
          >
            {isPlayingTour ? (
              <>
                <Pause className="w-3 h-3" />
                <span>Pause Tour</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-white" />
                <span>Auto-Tour</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveAnchorIndex((prev) => (prev + 1) % anchors.length)
            }
            className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition"
            title="Next POI"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Current Anchor Callout */}
        <div className="text-center text-[10px] text-zinc-300 font-medium truncate px-1">
          <span className="text-zinc-500 font-mono font-bold">
            [{activeAnchorIndex + 1}/{anchors.length}]
          </span>{' '}
          <strong className="text-white">{anchors[activeAnchorIndex]}</strong>
        </div>
      </div>

      {/* 3. Interactive Anchor Tenants Badges */}
      <div className="space-y-1.5 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
          <Building2 className="w-3 h-3 text-zinc-300" />
          <span>Anchor Establishments ({anchors.length})</span>
        </span>
        <div className="flex flex-wrap gap-1">
          {anchors.map((tenant: string, idx: number) => {
            const isSelected = idx === activeAnchorIndex;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setActiveAnchorIndex(idx);
                  setCameraMode('stepper');
                }}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-medium transition cursor-pointer ${
                  isSelected
                    ? 'bg-white text-black font-extrabold shadow-md border border-white'
                    : 'bg-black/60 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white'
                }`}
              >
                {tenant}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Live Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 shrink-0">
        <div className="bg-black/60 border border-white/10 rounded-2xl p-2.5 text-center">
          <span className="text-[9px] text-zinc-400 uppercase font-bold block">Density</span>
          <span className="text-base font-black text-white font-mono leading-tight block mt-0.5">
            {activeCinematicCluster.poiCount}
          </span>
          <span className="text-[9px] text-zinc-400 font-medium">POIs</span>
        </div>

        <div className="bg-black/60 border border-white/10 rounded-2xl p-2.5 text-center">
          <span className="text-[9px] text-zinc-400 uppercase font-bold block flex items-center justify-center gap-1">
            <Users className="w-2.5 h-2.5 text-white" />
            <span>Traffic</span>
          </span>
          <span className="text-xs font-black text-white leading-tight block mt-1">
            {activeCinematicCluster.footTrafficRating}
          </span>
          <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-wider block mt-0.5">
            Radar Active
          </span>
        </div>

        <div className="bg-black/60 border border-white/10 rounded-2xl p-2.5 text-center">
          <span className="text-[9px] text-zinc-400 uppercase font-bold block">Saturation</span>
          <span className="text-xs font-black text-white leading-tight block mt-1">
            {activeCinematicCluster.saturation}
          </span>
          <span className="text-[8px] text-zinc-400 font-medium block mt-0.5">
            {activeCinematicCluster.dominantCategory || 'Commercial'}
          </span>
        </div>
      </div>

      {/* 5. Deep Strategic Insight */}
      <div className="bg-black/60 border-l-2 border-white p-3 rounded-r-2xl rounded-l-none text-[11px] text-zinc-300 italic leading-relaxed shrink-0">
        "{activeCinematicCluster.insight}"
      </div>

      {/* 6. Bottom Action Controls */}
      <div className="flex gap-2 pt-2 border-t border-white/10 mt-auto shrink-0">
        <button
          onClick={handleResetCamera}
          className="flex-1 py-2 px-3 bg-zinc-900 hover:bg-zinc-800 border border-white/15 hover:border-white/30 text-white font-bold rounded-xl text-[11px] transition flex items-center justify-center gap-1.5 shadow-sm"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Camera</span>
        </button>
        <button
          onClick={handleClose}
          className="py-2 px-4 bg-white hover:bg-zinc-200 text-black font-extrabold rounded-xl text-[11px] transition flex items-center justify-center gap-1 shadow-md"
        >
          <span>Dismiss</span>
        </button>
      </div>
    </div>
  );

  // 1. Right Side-Docked Slide-In Panel
  if (focusDisplayMode === 'rightPanel') {
    return (
      <div className="fixed top-16 right-4 bottom-4 w-[420px] max-w-[calc(100vw-2rem)] z-[1200] bg-black/85 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_24px_70px_rgba(0,0,0,0.95)] p-4 overflow-y-auto text-xs text-zinc-300 animate-in slide-in-from-right-4 duration-200">
        {renderClusterContent(true)}
      </div>
    );
  }

  // 2. On-Map Anchored Floating Popup Card
  if (!screenPos) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1200] overflow-hidden"
      style={{ isolation: 'isolate' }}
    >
      <div
        className="pointer-events-auto absolute transition-transform duration-75 ease-out"
        style={{
          left: `${screenPos.x}px`,
          top: `${screenPos.y - 45}px`,
          transform: 'translate(-50%, -100%)',
        }}
      >
        {/* Connection Needle line to 3D Pinball anchor in pure monochrome */}
        <div className="absolute left-1/2 -bottom-4 w-[2px] h-4 bg-white -translate-x-1/2 shadow-[0_0_8px_#ffffff]" />
        <div className="absolute left-1/2 -bottom-5 w-2.5 h-2.5 rounded-full bg-white -translate-x-1/2 border border-black shadow-[0_0_10px_#ffffff]" />

        {/* Modal Container: Monochrome Glassmorphism */}
        <div className="w-[380px] max-w-[92vw] bg-black/85 border border-white/20 rounded-3xl p-4 shadow-[0_25px_80px_rgba(0,0,0,0.95)] text-white backdrop-blur-2xl animate-in zoom-in-95 duration-200">
          {renderClusterContent(false)}
        </div>
      </div>
    </div>
  );
};
