'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Trash2,
  Check,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Sliders,
  Search,
  Globe,
  Shield,
  Hexagon,
  Circle,
  Square,
  MapPin,
  Tag,
  Store,
  Layers,
  Palette,
  Play,
  Settings2,
  Route as RouteIcon,
  Camera,
} from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import { ColorPicker } from '../toolbar/ColorPicker';
import { fetchMultiPointRoute } from '../../gis/routes';
import { ARCHETYPE_CONFIGS, FACADE_PALETTES } from '../../gis/buildings3d';
import { BuildingArchetype, FacadeTheme, RoofType, MarkerShape } from '../../types/gis';
import { RouteAnimationControls } from '../viewport/RouteAnimationControls';
import { RouteCaptureControls } from '../viewport/RouteCaptureControls';
import {
  SHAPE_OPTIONS,
  ICON_SVGS,
  VICINITY_PRESET_LOGOS,
  renderUniformLogoMarker,
  VicinityPresetLogo,
} from '../../gis/markers';

export const ShapeEditorModal: React.FC = () => {
  const {
    activePanels,
    togglePanel,
    selectedId,
    features,
    updateFeature,
    removeFeature,
    setEditMode,
    editingRoutePoints,
    setEditingRoutePoints,
    setSelectedId,
    setToast,
  } = useMapStore();

  const f = features.find((x) => x.id === selectedId);

  // Vicinity Logo & Shape Customization State
  const [markerSubTab, setMarkerSubTab] = useState<'shapes' | 'logos'>(
    f?.props.shape === 'vicinity-logo' ? 'logos' : 'shapes'
  );
  const [routeEditorTab, setRouteEditorTab] = useState<'route' | 'studio'>('route');
  const [shapeCategory, setShapeCategory] = useState<string>('All');
  const [logoCategory, setLogoCategory] = useState<string>('All');
  const [brandSearchQuery, setBrandSearchQuery] = useState<string>('');
  const [domainInput, setDomainInput] = useState<string>('');
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [customLogoUrl, setCustomLogoUrl] = useState<string>(f?.props.logoUrl || '');
  const [monogramInput, setMonogramInput] = useState<string>(f?.props.logoText || '');
  const [logoFrame, setLogoFrame] = useState<'circle' | 'squircle' | 'hexagon' | 'pin-badge'>(
    f?.props.logoFrame || 'circle'
  );
  const [logoBg, setLogoBg] = useState<string>(f?.props.logoBg || '#ffffff');
  const [logoBorder, setLogoBorder] = useState<string>(f?.props.logoBorder || '#ffffff');
  const [logoScale, setLogoScale] = useState<number>(f?.props.logoScale || 0.72);
  const [isRenderingLogo, setIsRenderingLogo] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processImageFileRef = useRef<(file: File) => void>(() => {});
  const applyDomainOrUrlRef = useRef<(text: string) => void>(() => {});

  // Keep hook order stable while the modal is closed, and refresh its draft fields
  // when the user opens the editor for a different feature.
  useEffect(() => {
    const currentFeature = useMapStore.getState().features.find((feature) => feature.id === selectedId);
    if (!currentFeature) return;
    setMarkerSubTab(currentFeature.props.shape === 'vicinity-logo' ? 'logos' : 'shapes');
    setRouteEditorTab('route');
    setShapeCategory('All');
    setLogoCategory('All');
    setBrandSearchQuery(
      currentFeature.kind === 'marker' && !/^Pin\s+\d+$/i.test(currentFeature.name)
        ? currentFeature.name
        : ''
    );
    setDomainInput('');
    setImgErrors({});
    setIsDragging(false);
    setCustomLogoUrl(currentFeature.props.logoUrl || '');
    setMonogramInput(currentFeature.props.logoText || '');
    setLogoFrame(currentFeature.props.logoFrame || 'circle');
    setLogoBg(currentFeature.props.logoBg || '#ffffff');
    setLogoBorder(currentFeature.props.logoBorder || '#ffffff');
    setLogoScale(currentFeature.props.logoScale || 0.72);
    setIsRenderingLogo(false);
  }, [selectedId]);

  useEffect(() => {
    if (activePanels.shapeEditor) return;
    setEditingRoutePoints(false);
  }, [activePanels.shapeEditor, setEditingRoutePoints]);

  // Global paste handler for frictionless logo ingestion
  useEffect(() => {
    if (!activePanels.shapeEditor || markerSubTab !== 'logos') return;

    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement;

      const items = e.clipboardData?.items;
      if (!items) return;

      // 1. Prioritize image binary in clipboard (from screenshot / copy-image from web)
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processImageFileRef.current(file);
            return;
          }
        }
      }

      // 2. If user is not typing in a text field, check if clipboard text is a URL or domain
      if (!isInput) {
        const text = e.clipboardData?.getData('text')?.trim();
        if (text && (text.startsWith('http://') || text.startsWith('https://') || text.includes('.'))) {
          e.preventDefault();
          applyDomainOrUrlRef.current(text);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activePanels.shapeEditor, markerSubTab]);

  if (!activePanels.shapeEditor || !selectedId || !f) return null;

  const isPolygon = ['polygon', 'rectangle', 'circle', 'polygon3d'].includes(f.kind);
  const isMarker = f.kind === 'marker';
  const isText = f.kind === 'textbox';
  const isRoute = f.kind === 'route';

  const handleApplyPresetLogo = async (preset: VicinityPresetLogo) => {
    setIsRenderingLogo(true);
    setToast(`Formatting symmetric ${preset.name} badge...`);
    try {
      const map = (window as any).__map;
      const { key, dataUrl } = await renderUniformLogoMarker(
        {
          logoUrl: preset.logoUrl,
          monogramText: preset.monogram,
          frame: logoFrame,
          bg: logoBg,
          border: logoBorder,
          scale: logoScale,
          color: preset.color,
        },
        map
      );

      updateFeature(f.id, (feat) => ({
        ...feat,
        name: preset.name,
        props: {
          ...feat.props,
          shape: 'vicinity-logo',
          iconKey: key,
          customImageDataUrl: dataUrl,
          logoUrl: preset.logoUrl,
          logoFrame,
          logoBg,
          logoBorder,
          logoText: preset.monogram,
          logoScale,
          color: preset.color,
          borderColor: preset.border,
        },
      }));
      setToast(`Applied ${preset.name} uniform badge!`);
    } catch (err) {
      console.error(err);
      setToast('Failed to format logo');
    } finally {
      setIsRenderingLogo(false);
    }
  };

  const handleUpdateHousing = async (
    newFrame?: 'circle' | 'squircle' | 'hexagon' | 'pin-badge',
    newBg?: string,
    newBorder?: string,
    newScale?: number
  ) => {
    const frameToUse = newFrame ?? logoFrame;
    const bgToUse = newBg ?? logoBg;
    const borderToUse = newBorder ?? logoBorder;
    const scaleToUse = newScale ?? logoScale;

    if (newFrame) setLogoFrame(newFrame);
    if (newBg) setLogoBg(newBg);
    if (newBorder) setLogoBorder(newBorder);
    if (newScale !== undefined) setLogoScale(newScale);

    if (f.props.shape === 'vicinity-logo') {
      try {
        const map = (window as any).__map;
        const { key, dataUrl } = await renderUniformLogoMarker(
          {
            logoUrl: f.props.logoUrl,
            monogramText: f.props.logoText || '',
            frame: frameToUse,
            bg: bgToUse,
            border: borderToUse,
            scale: scaleToUse,
            color: f.props.color,
          },
          map
        );

        updateFeature(f.id, (feat) => ({
          ...feat,
          props: {
            ...feat.props,
            iconKey: key,
            customImageDataUrl: dataUrl,
            logoFrame: frameToUse,
            logoBg: bgToUse,
            logoBorder: borderToUse,
            logoScale: scaleToUse,
          },
        }));
      } catch (err) {
        console.error('Failed to update housing:', err);
      }
    }
  };

  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      setIsRenderingLogo(true);
      setToast('Formatting symmetric badge from image...');
      try {
        const map = (window as any).__map;
        const { key, dataUrl } = await renderUniformLogoMarker(
          {
            logoUrl: result,
            monogramText: file.name.slice(0, 3).toUpperCase() || 'LOGO',
            frame: logoFrame,
            bg: logoBg,
            border: logoBorder,
            scale: logoScale,
          },
          map
        );

        const cleanName = file.name.split('.')[0] || f.name;
        updateFeature(f.id, (feat) => ({
          ...feat,
          name: cleanName,
          props: {
            ...feat.props,
            shape: 'vicinity-logo',
            iconKey: key,
            customImageDataUrl: dataUrl,
            logoUrl: result,
            logoFrame,
            logoBg,
            logoBorder,
            logoScale,
          },
        }));
        setToast('Uniform logo badge placed!');
      } catch (err) {
        console.error(err);
        setToast('Failed to format logo image');
      } finally {
        setIsRenderingLogo(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyDomainOrUrl = async (inputStr: string) => {
    const trimmed = inputStr.trim();
    if (!trimmed) return;

    setIsRenderingLogo(true);
    let targetUrl = trimmed;
    let brandLabel = 'Brand';

    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:')) {
      const domainClean = trimmed.replace(/^https?:\/\//, '').split('/')[0];
      targetUrl = `https://www.google.com/s2/favicons?domain=${domainClean}&sz=128`;
      brandLabel = domainClean.split('.')[0].toUpperCase();
      setToast(`Fetching brand logo for ${domainClean}...`);
    } else {
      setToast('Generating symmetric logo badge from URL...');
    }

    try {
      const map = (window as any).__map;
      const { key, dataUrl } = await renderUniformLogoMarker(
        {
          logoUrl: targetUrl,
          monogramText: brandLabel.slice(0, 3),
          frame: logoFrame,
          bg: logoBg,
          border: logoBorder,
          scale: logoScale,
        },
        map
      );

      updateFeature(f.id, (feat) => ({
        ...feat,
        props: {
          ...feat.props,
          shape: 'vicinity-logo',
          iconKey: key,
          customImageDataUrl: dataUrl,
          logoUrl: targetUrl,
          logoFrame,
          logoBg,
          logoBorder,
          logoScale,
        },
      }));
      setToast('Applied brand logo badge!');
      setDomainInput('');
      setCustomLogoUrl('');
    } catch (err) {
      console.error(err);
      setToast('Could not load logo from source');
    } finally {
      setIsRenderingLogo(false);
    }
  };

  processImageFileRef.current = processImageFile;
  applyDomainOrUrlRef.current = handleApplyDomainOrUrl;

  const handleApplyCustomUrl = async () => {
    if (!customLogoUrl.trim()) return;
    await handleApplyDomainOrUrl(customLogoUrl.trim());
  };

  const handleApplyMonogram = async () => {
    if (!monogramInput.trim()) return;
    setIsRenderingLogo(true);
    setToast('Generating monogram logo badge...');
    try {
      const map = (window as any).__map;
      const { key, dataUrl } = await renderUniformLogoMarker(
        {
          monogramText: monogramInput.trim().toUpperCase(),
          frame: logoFrame,
          bg: logoBg,
          border: logoBorder,
          scale: logoScale,
          color: f.props.color || '#003366',
        },
        map
      );

      updateFeature(f.id, (feat) => ({
        ...feat,
        props: {
          ...feat.props,
          shape: 'vicinity-logo',
          iconKey: key,
          customImageDataUrl: dataUrl,
          logoText: monogramInput.trim().toUpperCase(),
          logoFrame,
          logoBg,
          logoBorder,
          logoScale,
        },
      }));
      setToast(`Generated ${monogramInput.trim().toUpperCase()} monogram badge!`);
      setMonogramInput('');
    } catch (err) {
      console.error(err);
      setToast('Failed to generate monogram');
    } finally {
      setIsRenderingLogo(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleRecalculateRoute = async () => {
    if (isRoute && f.props.waypoints) {
      setToast('Recalculating route...');
      const res = await fetchMultiPointRoute(f.props.waypoints, f.props.routeMode);
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
      setToast('Route updated');
    }
  };

  const handleRemoveWaypoint = async (idx: number) => {
    if (isRoute && f.props.waypoints && f.props.waypoints.length > 2) {
      const wp = [...f.props.waypoints];
      wp.splice(idx, 1);
      const res = await fetchMultiPointRoute(wp, f.props.routeMode);
      updateFeature(f.id, (feat) => ({
        ...feat,
        geometry: res.geometry,
        props: {
          ...feat.props,
          waypoints: wp,
          description: res.description,
          metadata: { distance: res.distance, duration: res.duration },
          routingFailed: res.routingFailed,
        },
      }));
    }
  };

  const handleClose = () => {
    window.dispatchEvent(new CustomEvent('atlas:stop-route-animation'));
    togglePanel('shapeEditor', false);
    setSelectedId(null);
    setEditMode(false);
  };

  return (
    <div className="fixed top-16 right-4 z-[998] w-88 sm:w-[380px] max-h-[85vh] overflow-y-auto bg-[#0c1322] border border-white/20 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl flex flex-col gap-3 text-xs text-gray-300 animate-in fade-in slide-in-from-top-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <h3 className="font-bold text-white text-sm">Edit {f.name}</h3>
        <button
          onClick={handleClose}
          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Name */}
      <div className="flex items-center justify-between">
        <span>Name</span>
        <input
          type="text"
          value={f.name}
          onChange={(e) => {
            const name = e.target.value;
            updateFeature(f.id, (feat) => ({
              ...feat,
              name,
              props: { ...feat.props, attributes: { ...feat.props.attributes, name } },
            }));
            if (isMarker) setBrandSearchQuery(/^Pin\s+\d+$/i.test(name) ? '' : name);
          }}
          className="w-36 bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-white text-xs outline-none focus:border-sky-400"
        />
      </div>

      {/* Marker Color (if marker) or Border Color (for polygons/lines) */}
      {isMarker ? (
        <div className="flex flex-col gap-1 border-t border-white/5 pt-2">
          <ColorPicker
            label="Marker Color"
            color={f.props.color || f.props.borderColor || '#1e40af'}
            onChange={(col) =>
              updateFeature(f.id, (feat) => {
                const shp = feat.props.shape || 'pin';
                const clean = (col || '#1e40af').replace('#', '');
                return {
                  ...feat,
                  props: {
                    ...feat.props,
                    color: col,
                    borderColor: col,
                    iconKey: `ico_${shp}_${clean}`,
                  },
                };
              })
            }
          />
        </div>
      ) : (
        <>
          {/* Border Color */}
          <div className="flex flex-col gap-1 border-t border-white/5 pt-2">
            <ColorPicker
              label="Border / Stroke Color"
              color={f.props.borderColor || f.props.color || '#e8b84a'}
              onChange={(col) =>
                updateFeature(f.id, (feat) => ({
                  ...feat,
                  props: { ...feat.props, borderColor: col, color: col },
                }))
              }
            />
          </div>

          {/* Border Opacity & Width */}
          <div className="flex items-center justify-between">
            <span>Border Opacity</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={f.props.borderOpacity ?? 0.9}
              onChange={(e) =>
                updateFeature(f.id, (feat) => ({
                  ...feat,
                  props: { ...feat.props, borderOpacity: parseFloat(e.target.value) },
                }))
              }
              className="accent-blue-600 w-28 cursor-pointer"
            />
          </div>
          <div className="flex items-center justify-between">
            <span>Border Width</span>
            <input
              type="range"
              min="1"
              max="16"
              step="1"
              value={f.props.width || 3}
              onChange={(e) =>
                updateFeature(f.id, (feat) => ({
                  ...feat,
                  props: { ...feat.props, width: parseFloat(e.target.value) },
                }))
              }
              className="accent-blue-600 w-28 cursor-pointer"
            />
          </div>
        </>
      )}

      {/* Fill Color for Polygons */}
      {isPolygon && (
        <>
          <div className="flex flex-col gap-1 border-t border-white/5 pt-2">
            <ColorPicker
              label="Fill Color"
              color={f.props.fillColor || '#e8b84a'}
              onChange={(col) =>
                updateFeature(f.id, (feat) => ({
                  ...feat,
                  props: { ...feat.props, fillColor: col },
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <span>Fill Opacity</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={f.props.fillOpacity ?? 0.35}
              onChange={(e) =>
                updateFeature(f.id, (feat) => ({
                  ...feat,
                  props: { ...feat.props, fillOpacity: parseFloat(e.target.value) },
                }))
              }
              className="accent-blue-600 w-28 cursor-pointer"
            />
          </div>

          {/* 3D Extrusion & Architectural Building Suite */}
          <div className="border-t border-white/10 pt-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-white">3D Building</span>
                {((f.props.height || 0) > 0 || !!f.props.is3D) && (
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-sky-400 border border-blue-400/30">
                    Active
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(f.props.height || 0) > 0 || !!f.props.is3D}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    updateFeature(f.id, (feat) => ({
                      ...feat,
                      kind: enabled ? 'polygon3d' : (feat.kind === 'polygon3d' ? 'polygon' : feat.kind),
                      props: {
                        ...feat.props,
                        is3D: enabled,
                        height: enabled ? (feat.props.height || 35) : 0,
                        buildingArchetype: enabled ? (feat.props.buildingArchetype || 'skyscraper') : undefined,
                        facadeTheme: enabled ? (feat.props.facadeTheme || 'glass') : undefined,
                        floors: enabled ? (feat.props.floors || 10) : undefined,
                      },
                    }));
                  }}
                  className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                />
                <span className="text-[11px] text-sky-400 font-bold">
                  {(f.props.height || 0) > 0 || !!f.props.is3D ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>

            {((f.props.height || 0) > 0 || !!f.props.is3D) && (
              <div className="flex flex-col gap-3 pt-1">
                {/* Architectural Archetype Pills */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-gray-400 font-medium">Architectural Archetype</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.values(ARCHETYPE_CONFIGS).map((cfg) => {
                      const isSel = (f.props.buildingArchetype || 'skyscraper') === cfg.id;
                      return (
                        <button
                          key={cfg.id}
                          type="button"
                          onClick={() => {
                            const pal = FACADE_PALETTES[cfg.facadeTheme];
                            const totalH = cfg.defaultFloors * cfg.floorHeight;
                            updateFeature(f.id, (feat) => ({
                              ...feat,
                              name: `${cfg.label} ${feat.id}`,
                              props: {
                                ...feat.props,
                                buildingArchetype: cfg.id,
                                facadeTheme: cfg.facadeTheme,
                                floors: cfg.defaultFloors,
                                floorHeight: cfg.floorHeight,
                                height: totalH,
                                roofType: cfg.roofType,
                                hasPodium: cfg.hasPodium,
                                color: pal.wall,
                                fillColor: pal.wall,
                                borderColor: pal.border,
                                fillOpacity: pal.opacity,
                              },
                            }));
                          }}
                          className={`px-2 py-1.5 rounded-xl border text-[10px] font-semibold text-left truncate transition ${
                            isSel
                              ? 'bg-blue-600/30 border-sky-400 text-white shadow'
                              : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10'
                          }`}
                        >
                          {cfg.label.split(' ')[0]} {cfg.label.split(' ')[1] || ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Facade Theme Selector */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-gray-400 font-medium">Facade Theme</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(['glass', 'steel', 'concrete', 'brick', 'marble', 'neon'] as FacadeTheme[]).map((thm) => {
                      const pal = FACADE_PALETTES[thm];
                      const isSel = f.props.facadeTheme === thm;
                      return (
                        <button
                          key={thm}
                          type="button"
                          onClick={() => {
                            updateFeature(f.id, (feat) => ({
                              ...feat,
                              props: {
                                ...feat.props,
                                facadeTheme: thm,
                                color: pal.wall,
                                fillColor: pal.wall,
                                borderColor: pal.border,
                                fillOpacity: pal.opacity,
                              },
                            }));
                          }}
                          title={thm}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] capitalize transition ${
                            isSel
                              ? 'border-sky-400 bg-sky-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full border border-white/30" style={{ backgroundColor: pal.wall }} />
                          {thm}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Floors Slider */}
                <div className="flex items-center justify-between">
                  <span>Floors / Levels</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={f.props.floors || Math.max(Math.round((f.props.height || 35) / (f.props.floorHeight || 3.5)), 1)}
                      onChange={(e) => {
                        const nextFloors = parseInt(e.target.value, 10);
                        const fh = f.props.floorHeight || 3.5;
                        const nextH = Math.round(nextFloors * fh);
                        updateFeature(f.id, (feat) => ({
                          ...feat,
                          props: { ...feat.props, floors: nextFloors, height: nextH },
                        }));
                      }}
                      className="accent-blue-600 w-24 cursor-pointer"
                    />
                    <span className="font-mono text-xs w-12 text-right text-sky-400 font-bold">
                      {f.props.floors || Math.round((f.props.height || 35) / 3.5)} fl
                    </span>
                  </div>
                </div>

                {/* Total Height Slider */}
                <div className="flex items-center justify-between">
                  <span>Total Height</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="3"
                      max="400"
                      step="1"
                      value={f.props.height || 35}
                      onChange={(e) => {
                        const h = parseFloat(e.target.value);
                        const fl = Math.max(Math.round(h / (f.props.floorHeight || 3.5)), 1);
                        updateFeature(f.id, (feat) => ({
                          ...feat,
                          props: { ...feat.props, height: h, floors: fl },
                        }));
                      }}
                      className="accent-blue-600 w-24 cursor-pointer"
                    />
                    <span className="font-mono text-xs w-12 text-right text-sky-400 font-bold">
                      {f.props.height || 35}m
                    </span>
                  </div>
                </div>

                {/* Base Elevation */}
                <div className="flex items-center justify-between">
                  <span>Base Elevation</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="2"
                      value={f.props.baseHeight || 0}
                      onChange={(e) =>
                        updateFeature(f.id, (feat) => ({
                          ...feat,
                          props: { ...feat.props, baseHeight: parseFloat(e.target.value) },
                        }))
                      }
                      className="accent-blue-600 w-24 cursor-pointer"
                    />
                    <span className="font-mono text-xs w-12 text-right text-gray-400">
                      {f.props.baseHeight || 0}m
                    </span>
                  </div>
                </div>

                {/* Roof Style Selector */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <span className="text-[11px] text-gray-400">Rooftop Feature</span>
                  <select
                    value={f.props.roofType || 'flat'}
                    onChange={(e) => {
                      const rt = e.target.value as RoofType;
                      updateFeature(f.id, (feat) => ({
                        ...feat,
                        props: {
                          ...feat.props,
                          roofType: rt,
                          hasHelipad: rt === 'helipad',
                          hasSpire: rt === 'spire',
                        },
                      }));
                    }}
                    className="bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-white text-[11px] outline-none"
                  >
                    <option value="flat">Flat Roof</option>
                    <option value="penthouse">Penthouse Crown</option>
                    <option value="helipad">Helipad Deck [H]</option>
                    <option value="spire">Antenna Spire</option>
                    <option value="gable">Gable Pitch</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Marker specifics */}
      {isMarker && (
        <div className="border-t border-white/10 pt-2.5 flex flex-col gap-2.5">
          {/* Sub-tab switcher: Shapes & Icons vs Vicinity Logo Studio */}
          <div className="flex rounded-xl p-1 bg-black/40 border border-white/10">
            <button
              type="button"
              onClick={() => setMarkerSubTab('shapes')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                markerSubTab === 'shapes'
                  ? 'bg-white text-black shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Pin style</span>
            </button>
            <button
              type="button"
              onClick={() => setMarkerSubTab('logos')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                markerSubTab === 'logos'
                  ? 'bg-white text-black shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Add logo</span>
            </button>
          </div>

          {markerSubTab === 'shapes' ? (
            <>
              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] no-scrollbar">
                {['All', 'Pins & Needles', '3D Pinballs', 'Geometric Badges', 'Beacons & Targets', 'Symbols'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setShapeCategory(cat)}
                    className={`px-2 py-0.5 rounded-full border whitespace-nowrap transition ${
                      shapeCategory === cat
                        ? 'bg-white text-black border-white font-bold'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Shape Grid */}
              <div className="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-1">
                {SHAPE_OPTIONS
                  .filter((shp) => shapeCategory === 'All' || shp.category === shapeCategory)
                  .map((shp) => {
                    const isSel = (f.props.shape || 'pin') === shp.id;
                    const svgHtml = ICON_SVGS[shp.id] || ICON_SVGS.pin;
                    return (
                      <button
                        key={shp.id}
                        type="button"
                        onClick={() =>
                          updateFeature(f.id, (feat) => {
                            const clean = (feat.props.color || '#1e40af').replace('#', '');
                            return {
                              ...feat,
                              props: {
                                ...feat.props,
                                shape: shp.id,
                                iconKey: `ico_${shp.id}_${clean}`,
                                customImageDataUrl: undefined,
                              },
                            };
                          })
                        }
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border transition ${
                          isSel
                            ? 'bg-white/15 border-white text-white shadow'
                            : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                        }`}
                        title={shp.label}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill={isSel ? (f.props.color || '#ffffff') : 'currentColor'}
                          stroke={isSel ? '#ffffff' : 'currentColor'}
                          strokeWidth="1.5"
                          className="w-5 h-5 mb-1"
                          dangerouslySetInnerHTML={{ __html: svgHtml }}
                        />
                        <span className="text-[9px] font-medium truncate w-full text-center">
                          {shp.label}
                        </span>
                      </button>
                    );
                  })}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span>Icon Size</span>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Pin sizing mode"
                    value={f.props.iconSizeMode || 'static'}
                    onChange={(e) => updateFeature(f.id, (feat) => ({ ...feat, props: { ...feat.props, iconSizeMode: e.target.value as 'static' | 'dynamic' } }))}
                    className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[10px] text-white"
                  >
                    <option value="static">Static</option>
                    <option value="dynamic">Dynamic</option>
                  </select>
                  <input
                    type="range"
                    min="0.4"
                    max="5"
                    step="0.1"
                    value={f.props.iconSize || 0.9}
                    onChange={(e) =>
                      updateFeature(f.id, (feat) => ({
                        ...feat,
                        props: { ...feat.props, iconSize: parseFloat(e.target.value) },
                      }))
                    }
                    className="accent-blue-600 w-24 cursor-pointer"
                  />
                  <span className="font-mono text-xs w-10 text-right text-white font-bold">
                    {(f.props.iconSize || 0.9).toFixed(1)}x
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* VICINITY LOGO STUDIO */
            (() => {
              const searchTokens = brandSearchQuery.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);
              const filteredPresets = VICINITY_PRESET_LOGOS.filter((p) => {
                const matchesCategory = logoCategory === 'All' || p.category === logoCategory;
                const searchable = `${p.name} ${p.monogram} ${p.category}`.toLowerCase();
                const matchesSearch = searchTokens.length === 0 || searchTokens.some((token) => searchable.includes(token));
                return matchesCategory && matchesSearch;
              });

              return (
                <div className="flex flex-col gap-3">
                  {/* 1. Live WYSIWYG Badge Preview & Housing Geometry */}
                  <div className="p-2.5 rounded-2xl bg-black/40 border border-white/10 space-y-2.5">
                    <div className="flex items-center gap-3 bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                      {/* Left: Live Preview */}
                      <div className="flex flex-col items-center justify-center shrink-0 w-16">
                        <div className="w-14 h-14 flex items-center justify-center relative">
                          {f.props.customImageDataUrl ? (
                            <img
                              src={f.props.customImageDataUrl}
                              alt="Current badge"
                              className="w-14 h-14 object-contain filter drop-shadow-md"
                            />
                          ) : (
                            <div
                              className={`w-12 h-12 flex items-center justify-center border shadow-md ${
                                logoFrame === 'squircle'
                                  ? 'rounded-2xl'
                                  : logoFrame === 'hexagon'
                                  ? 'rounded-lg rotate-45'
                                  : 'rounded-full'
                              }`}
                              style={{
                                backgroundColor: logoBg,
                                borderColor: logoBorder,
                                borderWidth: 2,
                              }}
                            >
                              {f.props.logoText ? (
                                <span
                                  className={`font-black text-xs ${logoFrame === 'hexagon' ? '-rotate-45' : ''}`}
                                  style={{ color: f.props.color || '#000000' }}
                                >
                                  {f.props.logoText}
                                </span>
                              ) : (
                                <span className="text-[9px] text-zinc-400 font-semibold tracking-tight uppercase">
                                  Blank
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="text-[8.5px] text-zinc-400 font-medium tracking-tight mt-0.5">
                          Live Badge
                        </span>
                      </div>

                      {/* Right: Housing & Geometry Controls */}
                      <div className="flex-1 space-y-2">
                        {/* Frame Shapes */}
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                            <span className="font-semibold text-white uppercase tracking-wider text-[9.5px]">Frame Shape</span>
                            <span className="text-[9px] text-zinc-400">Uniform</span>
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            {[
                              { id: 'circle', label: 'Circle', Icon: Circle },
                              { id: 'squircle', label: 'Squircle', Icon: Square },
                              { id: 'hexagon', label: 'Hexagon', Icon: Hexagon },
                              { id: 'pin-badge', label: 'Pin Stalk', Icon: MapPin },
                            ].map((fm) => {
                              const FIcon = fm.Icon;
                              const isSel = logoFrame === fm.id;
                              return (
                                <button
                                  key={fm.id}
                                  type="button"
                                  onClick={() => handleUpdateHousing(fm.id as any)}
                                  className={`py-1 px-1 rounded-lg border text-center transition flex flex-col items-center justify-center gap-0.5 ${
                                    isSel
                                      ? 'bg-white text-black font-bold border-white shadow-sm'
                                      : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                                  }`}
                                  title={fm.label}
                                >
                                  <FIcon className="w-3 h-3" />
                                  <span className="text-[8.5px] truncate">{fm.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Frame Background Swatches */}
                        <div className="flex items-center justify-between pt-0.5 text-[10px]">
                          <span className="text-zinc-400">Badge Background</span>
                          <div className="flex items-center gap-1.5">
                            {[
                              { col: '#ffffff', label: 'White' },
                              { col: '#0f172a', label: 'Slate' },
                              { col: '#00205b', label: 'Navy' },
                              { col: '#783819', label: 'Kopi Brown' },
                              { col: '#d97706', label: 'Amber' },
                              { col: '#da291c', label: 'Red' },
                            ].map((b) => (
                              <button
                                key={b.col}
                                type="button"
                                onClick={() => handleUpdateHousing(undefined, b.col, b.col === '#ffffff' ? '#ffffff' : '#ffffff')}
                                className={`w-4 h-4 rounded-full border transition active:scale-90 ${
                                  logoBg === b.col ? 'ring-2 ring-white scale-110' : 'border-white/30 hover:border-white'
                                }`}
                                style={{ backgroundColor: b.col }}
                                title={b.label}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Scale Fit Slider */}
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-zinc-400 text-[10px]">Inner Logo Scale</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0.5"
                              max="0.85"
                              step="0.05"
                              value={logoScale}
                              onChange={(e) => handleUpdateHousing(undefined, undefined, undefined, parseFloat(e.target.value))}
                              className="accent-blue-600 w-16 cursor-pointer"
                            />
                            <span className="font-mono text-[10.5px] text-white w-7 text-right">
                              {Math.round(logoScale * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Frictionless Ingestion: Drag/Drop/Paste & Domain Fetcher */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) processImageFile(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-3 rounded-2xl border-2 border-dashed cursor-pointer transition text-center flex flex-col items-center justify-center gap-1 ${
                      isDragging
                        ? 'border-blue-400 bg-blue-500/20 scale-[1.01]'
                        : 'border-white/20 bg-white/[0.03] hover:border-white/40 hover:bg-white/[0.06]'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2 text-white text-xs font-semibold">
                      <Upload className="w-4 h-4 text-blue-400" />
                      <span>Drop logo file or click to browse</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 flex items-center gap-1.5 flex-wrap justify-center">
                      <span>Copy an image and press</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[9px] border border-white/20">
                        Ctrl + V
                      </kbd>
                      <span>to paste directly</span>
                    </div>
                  </div>

                  {/* Domain / Website Logo Resolver */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <Globe className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Domain or URL (e.g. kopisaigon.com, jollibee.com.ph)..."
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApplyDomainOrUrl(domainInput);
                          }
                        }}
                        className="w-full bg-black/50 border border-white/15 rounded-xl pl-8 pr-2 py-1.5 text-white text-xs outline-none focus:border-blue-400 transition"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyDomainOrUrl(domainInput)}
                      disabled={!domainInput.trim() || isRenderingLogo}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-xs transition flex items-center gap-1 shrink-0"
                    >
                      {isRenderingLogo ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      <span>Fetch</span>
                    </button>
                  </div>

                  {/* 3. Popular Brand Catalog with Search & Self-Healing Monograms */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-xs">Logo matches</span>
                      <span className="text-[10px] text-zinc-400">Based on pin name</span>
                    </div>

                    {/* Search catalog bar */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search brands or match the pin name..."
                        value={brandSearchQuery}
                        onChange={(e) => setBrandSearchQuery(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-2 py-1 text-white text-xs outline-none focus:border-white/30 transition"
                      />
                    </div>

                    {/* Category filter buttons */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[9.5px] no-scrollbar">
                      {['All', 'Cafe & Dining', 'Retail & Malls', 'Banking', 'Fuel & Transit', 'Convenience'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setLogoCategory(cat)}
                          className={`px-2 py-0.5 rounded-full border whitespace-nowrap transition ${
                            logoCategory === cat
                              ? 'bg-white text-black border-white font-bold'
                              : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Grid with self-healing fallback to brand monogram on broken image */}
                    <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto pr-1">
                      {filteredPresets.length === 0 ? (
                        <div className="col-span-4 py-4 text-center text-xs text-zinc-500">
                          No preset matches &quot;{brandSearchQuery}&quot;. Enter a website or upload a logo.
                        </div>
                      ) : (
                        filteredPresets.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleApplyPresetLogo(preset)}
                            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/30 flex flex-col items-center justify-center gap-1 transition group active:scale-95"
                            title={`${preset.name} (${preset.category})`}
                          >
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center p-1 shadow-sm overflow-hidden group-hover:scale-105 transition">
                              {preset.logoUrl && !imgErrors[preset.id] ? (
                                <img
                                  src={preset.logoUrl}
                                  alt={preset.name}
                                  onError={() => setImgErrors((prev) => ({ ...prev, [preset.id]: true }))}
                                  className="max-h-full max-w-full object-contain"
                                />
                              ) : (
                                <div
                                  className="w-full h-full rounded-full flex items-center justify-center font-black text-[10px]"
                                  style={{ backgroundColor: preset.color, color: preset.bg || '#ffffff' }}
                                >
                                  {preset.monogram}
                                </div>
                              )}
                            </div>
                            <span className="text-[8.5px] text-zinc-300 truncate w-full text-center font-medium">
                              {preset.name}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 4. Monogram Acronym Generator */}
                  <div className="p-2.5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                          Monogram Acronym Badge
                        </span>
                      </div>
                      <span className="text-[9px] text-zinc-400">1-5 Letters</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Monogram (e.g. PRIME, BDO, HQ)"
                        value={monogramInput}
                        maxLength={5}
                        onChange={(e) => setMonogramInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApplyMonogram();
                          }
                        }}
                        className="flex-1 bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-white text-xs outline-none focus:border-white"
                      />
                      <button
                        type="button"
                        onClick={handleApplyMonogram}
                        className="px-2.5 py-1 rounded-lg bg-white text-black font-bold text-xs hover:bg-zinc-200 transition"
                      >
                        Generate
                      </button>
                    </div>
                  </div>

                  {/* 5. Marker Badge Size Slider */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-zinc-300">Marker Badge Size</span>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Badge sizing mode"
                        value={f.props.iconSizeMode || 'static'}
                        onChange={(e) => updateFeature(f.id, (feat) => ({ ...feat, props: { ...feat.props, iconSizeMode: e.target.value as 'static' | 'dynamic' } }))}
                        className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-[10px] text-white"
                      >
                        <option value="static">Static</option>
                        <option value="dynamic">Dynamic</option>
                      </select>
                      <input
                        type="range"
                        min="0.5"
                        max="5"
                        step="0.1"
                        value={f.props.iconSize || 1.0}
                        onChange={(e) =>
                          updateFeature(f.id, (feat) => ({
                            ...feat,
                            props: { ...feat.props, iconSize: parseFloat(e.target.value) },
                          }))
                        }
                        className="accent-blue-600 w-24 cursor-pointer"
                      />
                      <span className="font-mono text-xs w-10 text-right text-white font-bold">
                        {(f.props.iconSize || 1.0).toFixed(1)}x
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Text specifics */}
      {isText && (
        <>
          <div className="flex items-center justify-between border-t border-white/5 pt-2">
            <span>Text Label</span>
            <input
              type="text"
              value={f.props.text || ''}
              onChange={(e) =>
                updateFeature(f.id, (feat) => ({
                  ...feat,
                  props: { ...feat.props, text: e.target.value },
                }))
              }
              className="w-36 bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-white text-xs outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <span>Font Size</span>
            <input
              type="range"
              min="10"
              max="42"
              step="1"
              value={f.props.fontSize || 16}
              onChange={(e) =>
                updateFeature(f.id, (feat) => ({
                  ...feat,
                  props: { ...feat.props, fontSize: parseInt(e.target.value, 10) },
                }))
              }
              className="accent-blue-600 w-28 cursor-pointer"
            />
          </div>
        </>
      )}

      {/* Label display */}
      <div className="flex items-center justify-between border-t border-white/5 pt-2">
        <span>Show On-Map Label</span>
        <input
          type="checkbox"
          checked={!!f.props.showLabel}
          onChange={(e) =>
            updateFeature(f.id, (feat) => ({
              ...feat,
              props: { ...feat.props, showLabel: e.target.checked },
            }))
          }
          className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
        />
      </div>
      <div className="flex items-center justify-between">
        <span>Label Position</span>
        <select
          value={f.props.labelPos || 'center'}
          onChange={(e) =>
            updateFeature(f.id, (feat) => ({
              ...feat,
              props: { ...feat.props, labelPos: e.target.value as any },
            }))
          }
          className="bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-white outline-none"
        >
          <option value="center">Center</option>
          <option value="top">Above</option>
          <option value="bottom">Below</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>

      {/* Route Specifics */}
      {isRoute && (
        <div role="tablist" aria-label="route editor sections" className="flex rounded-xl border border-white/10 bg-black/30 p-1">
          <button type="button" role="tab" aria-selected={routeEditorTab === 'route'} onClick={() => setRouteEditorTab('route')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${routeEditorTab === 'route' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
            <RouteIcon className="h-4 w-4" /><span>Route</span>
          </button>
          <button type="button" role="tab" aria-selected={routeEditorTab === 'studio'} onClick={() => setRouteEditorTab('studio')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${routeEditorTab === 'studio' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
            <Play className="h-4 w-4" /><span>studio mode</span>
          </button>
        </div>
      )}
      {isRoute && <>
        <div hidden={routeEditorTab !== 'route'}>
        <details className="border-t border-white/10 pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-2 font-semibold text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            <Settings2 className="h-4 w-4 text-zinc-400" />
            <span className="flex-1">Route settings</span>
            <span className="text-xs font-normal text-gray-400">{f.props.description || 'Preview and edit this route'}</span>
          </summary>
          <div className="flex flex-col gap-2 pb-2">
          <div className="flex items-center justify-between">
            <span>Travel mode</span>
            <select
              value={f.props.routeMode || 'driving'}
              onChange={(e) => {
                const mode = e.target.value as any;
                updateFeature(f.id, (feat) => ({ ...feat, props: { ...feat.props, routeMode: mode } }));
                if (f.props.waypoints) {
                  fetchMultiPointRoute(f.props.waypoints, mode).then((res) => {
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
              }}
              className="bg-black/40 border border-white/15 rounded px-2 py-1 text-white"
            >
              <option value="driving">Driving</option>
              <option value="walking">Walking</option>
              <option value="cycling">Cycling</option>
            </select>
          </div>
          <RouteAnimationControls route={f} collapsible />
          <div className="flex items-center justify-between text-sky-400 font-bold">
            <span>Route length · time</span>
            <span>{f.props.description || '-'}</span>
          </div>

          <span className="text-[10px] font-bold text-gray-400 uppercase">Stops</span>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2">
            <div className="min-w-0">
              <span className="font-medium text-gray-200">Adjust the path</span>
              <p className="mt-0.5 text-[10px] text-gray-500">Add a stop on the map or drag a stop to change the path.</p>
            </div>
            <button
              type="button"
              aria-pressed={editingRoutePoints}
              onClick={() => {
                const next = !editingRoutePoints;
                setEditMode(next, f.id);
                setEditingRoutePoints(next);
              }}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${editingRoutePoints ? 'bg-sky-500 text-white' : 'border border-white/10 text-gray-300 hover:bg-white/5'}`}
            >
              {editingRoutePoints ? 'Done' : 'Edit path'}
            </button>
          </div>
          <div className="max-h-24 overflow-y-auto flex flex-col gap-1">
            {f.props.waypoints?.map((pt, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-1 rounded bg-white/5 text-[10px]"
              >
                <span>
                  Pt {i + 1}: {pt[1].toFixed(4)}, {pt[0].toFixed(4)}
                </span>
                {f.props.waypoints && f.props.waypoints.length > 2 && (
                  <button
                    aria-label={`remove waypoint ${i + 1}`}
                    onClick={() => handleRemoveWaypoint(i)}
                    className="p-0.5 rounded text-rose-400 hover:bg-rose-500/20"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleRecalculateRoute}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded-lg font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Update route</span>
          </button>
          </div>
        </details>
        </div>
          <section hidden={routeEditorTab !== 'studio'} role="tabpanel" className="rounded-xl border border-white/10 bg-black/20 p-3">
            <header className="mb-3 flex items-center gap-2 border-b border-white/10 pb-3">
              <Camera className="h-4 w-4 text-sky-400" />
              <div><h3 className="text-sm font-semibold text-white">studio mode</h3><p className="text-xs text-zinc-400">capture the map while your route plays.</p></div>
            </header>
            <RouteCaptureControls route={f} />
          </section>
      </>}

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-white/10 pt-3 mt-1">
        <button
          onClick={() => {
            removeFeature(f.id);
            handleClose();
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>

        <button
          onClick={handleClose}
          className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-lg shadow-blue-500/20"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Done</span>
        </button>
      </div>
    </div>
  );
};
