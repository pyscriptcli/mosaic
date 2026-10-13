'use client';

import React, { useState, useMemo } from 'react';
import {
  FolderTree,
  X,
  Plus,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  ChevronRight,
  ChevronDown,
  Trash2,
  Table,
  Maximize2,
  Palette,
  Pencil,
  Search,
  GripVertical,
  SlidersHorizontal,
  MapPin,
  Building2,
  Route as RouteIcon,
  Circle as CircleIcon,
  Square as PolygonIcon,
  Type,
  MoreVertical,
} from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import { calcBounds } from '../../gis/polygons';
import { bulkStyleGroupMarkers, moveFeatureToGroup, reorderFeatures } from '../../gis/layers';
import { GISFeature } from '../../types/gis';

interface MyLayersPanelProps {
  mapInstance: any;
  embedded?: boolean;
}

const getFeatureKindIcon = (kind: string) => {
  switch (kind) {
    case 'marker':
      return <MapPin className="w-3.5 h-3.5 text-blue-400" />;
    case 'polygon3d':
      return <Building2 className="w-3.5 h-3.5 text-amber-400" />;
    case 'route':
      return <RouteIcon className="w-3.5 h-3.5 text-emerald-400" />;
    case 'circle':
      return <CircleIcon className="w-3.5 h-3.5 text-sky-400" />;
    case 'textbox':
      return <Type className="w-3.5 h-3.5 text-purple-400" />;
    case 'polygon':
    case 'rectangle':
    case 'polyline':
    default:
      return <PolygonIcon className="w-3.5 h-3.5 text-indigo-400" />;
  }
};

export const MyLayersPanel: React.FC<MyLayersPanelProps> = ({ mapInstance, embedded = false }) => {
  const {
    activePanels,
    togglePanel,
    features,
    setFeatures,
    customGroups,
    setCustomGroups,
    selectedLayerIds,
    toggleLayerSelection,
    selectAllLayers,
    clearLayerSelection,
    removeFeature,
    updateFeature,
    setSelectedId,
    setEditMode,
    setToast,
  } = useMapStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [stylingGroupId, setStylingGroupId] = useState<string | null>(null);
  const [bulkColor, setBulkColor] = useState('#003366');
  const [bulkShape, setBulkShape] = useState('');
  const [bulkSize, setBulkSize] = useState(0.9);
  const [expandedLayerId, setExpandedLayerId] = useState<number | null>(null);

  // Grouped vs Ungrouped features
  const groupedIds = useMemo(() => {
    const s = new Set<number>();
    Object.values(customGroups).forEach((g) => g.ids.forEach((id) => s.add(id)));
    return s;
  }, [customGroups]);

  const openNodeIds = useMemo(() => {
    const s = new Set(customGroups['Trade Area Scan']?.ids || []);
    features.forEach((feature) => {
      if (feature.props?.managedBy === 'open-node') s.add(feature.id);
    });
    return s;
  }, [customGroups, features]);

  const layerFeatures = useMemo(() => {
    return features.filter((feature) => !openNodeIds.has(feature.id));
  }, [features, openNodeIds]);

  const filteredFeatures = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return layerFeatures;
    return layerFeatures.filter(
      (f) =>
        (f.name && f.name.toLowerCase().includes(q)) ||
        (f.kind && f.kind.toLowerCase().includes(q)) ||
        (f.props?.description && f.props.description.toLowerCase().includes(q))
    );
  }, [layerFeatures, searchQuery]);

  const ungroupedFeats = useMemo(() => {
    return filteredFeatures.filter((f) => !groupedIds.has(f.id));
  }, [filteredFeatures, groupedIds]);

  if (!activePanels.myLayers) return null;

  const handleAddGroup = () => {
    const name = prompt('Enter group name:', `Group ${Object.keys(customGroups).length + 1}`);
    if (name && name.trim() && !customGroups[name.trim()]) {
      setCustomGroups({
        ...customGroups,
        [name.trim()]: { collapsed: false, ids: [] },
      });
    }
  };

  const handleToggleGroupCollapse = (gName: string) => {
    setCustomGroups({
      ...customGroups,
      [gName]: {
        ...customGroups[gName],
        collapsed: !customGroups[gName].collapsed,
      },
    });
  };

  const handleRenameGroup = (oldName: string, newName: string) => {
    if (!newName || newName === oldName || customGroups[newName]) return;
    const next = { ...customGroups };
    next[newName] = next[oldName];
    delete next[oldName];
    setCustomGroups(next);
  };

  const handleDeleteGroup = (gName: string) => {
    const next = { ...customGroups };
    delete next[gName];
    setCustomGroups(next);
  };

  const handleToggleGroupEye = (gName: string) => {
    const ids = customGroups[gName]?.ids || [];
    const anyVisible = features.some((f) => ids.includes(f.id) && f.props?.visible !== 0);
    const newVis = anyVisible ? 0 : 1;

    setFeatures(
      features.map((f) => (ids.includes(f.id) ? { ...f, props: { ...f.props, visible: newVis } } : f))
    );
  };

  const handleBulkStyleApply = (gName: string) => {
    const ids = customGroups[gName]?.ids || [];
    setFeatures(bulkStyleGroupMarkers(features, ids, bulkColor, bulkShape || undefined, bulkSize));
    setStylingGroupId(null);
    setToast(`Styling applied to "${gName}"`);
  };

  const handleZoomTo = (f: GISFeature) => {
    if (!mapInstance) return;
    const b = calcBounds(f);
    if (b) {
      mapInstance.fitBounds(b, { padding: 60, maxZoom: 18 });
    }
  };

  const handleBulkHideUnhide = () => {
    if (!selectedLayerIds.length) {
      setToast('Select at least one layer');
      return;
    }
    const allHidden = selectedLayerIds.every((id) => {
      const f = features.find((x) => x.id === id);
      return f && f.props?.visible === 0;
    });
    const newVis = allHidden ? 1 : 0;
    setFeatures(
      features.map((f) =>
        selectedLayerIds.includes(f.id) ? { ...f, props: { ...f.props, visible: newVis } } : f
      )
    );
    setToast(allHidden ? 'Selected layers shown' : 'Selected layers hidden');
  };

  const handleBulkDeleteSelected = () => {
    if (!selectedLayerIds.length) return;
    const count = selectedLayerIds.length;
    const remaining = features.filter((f) => !selectedLayerIds.includes(f.id));
    setFeatures(remaining);
    clearLayerSelection();
    setToast(`Deleted ${count} selected layer(s)`);
  };

  const renderLayerCard = (f: GISFeature, renderIndex: number) => {
    const isSelected = selectedLayerIds.includes(f.id);
    const isExpanded = expandedLayerId === f.id;
    const isVisible = f.props.visible !== 0;

    let subInfo: string = f.kind;
    if (f.kind === 'circle' && f.props.radiusMeters) {
      subInfo = `Radius ${
        f.props.radiusMeters >= 1000
          ? (f.props.radiusMeters / 1000).toFixed(2) + ' km'
          : Math.round(f.props.radiusMeters) + ' m'
      }`;
    } else if (f.kind === 'route' && f.props.description) {
      subInfo = f.props.description;
    } else if (f.kind === 'polygon3d') {
      subInfo = '3D Building';
    }

    return (
      <div
        key={`${f.id}-${renderIndex}`}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', String(f.id))}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = parseInt(e.dataTransfer.getData('text/plain'), 10);
          if (draggedId && draggedId !== f.id) {
            setFeatures(reorderFeatures(features, draggedId, f.id));
          }
        }}
        className={`group relative rounded-xl border transition-all duration-150 ${
          isSelected
            ? 'bg-blue-950/25 border-blue-500/40 shadow-sm shadow-blue-900/20'
            : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08] hover:border-white/20'
        }`}
      >
        <div className="flex items-center gap-1.5 p-2 min-h-[40px]">
          {/* Drag Handle */}
          <div
            title="Drag to reorder"
            className="cursor-grab active:cursor-grabbing text-zinc-600 group-hover:text-zinc-400 p-0.5 rounded transition"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>

          {/* Selection Checkbox */}
          <button
            type="button"
            onClick={() => toggleLayerSelection(f.id)}
            title={isSelected ? 'Deselect' : 'Select'}
            className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 transition focus-visible:outline-none"
          >
            {isSelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Square className="w-3.5 h-3.5 text-zinc-600 hover:text-zinc-400" />
            )}
          </button>

          {/* Geometry Kind Icon */}
          <div
            title={`Geometry: ${f.kind}`}
            className="flex-shrink-0 w-6 h-6 rounded-md bg-white/[0.05] border border-white/10 flex items-center justify-center"
          >
            {getFeatureKindIcon(f.kind)}
          </div>

          {/* Inline Editable Layer Title & Subtext */}
          <div className="flex-1 min-w-0 flex flex-col justify-center px-1">
            <input
              value={f.name}
              onChange={(e) =>
                updateFeature(f.id, (feat) => ({
                  ...feat,
                  name: e.target.value,
                  props: { ...feat.props, attributes: { ...feat.props.attributes, name: e.target.value } },
                }))
              }
              title="Click to rename"
              className="w-full bg-transparent text-xs font-semibold text-zinc-200 hover:text-white px-1 py-0.5 -mx-1 rounded border border-transparent hover:border-white/10 focus:border-blue-500 focus:bg-black/60 outline-none truncate transition"
            />
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-medium">
              <span className="truncate max-w-[140px]">{subInfo}</span>
              {f.props.showLabel && (
                <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25">
                  Label: {f.props.labelPos || 'center'}
                </span>
              )}
            </div>
          </div>

          {/* Action Button Cluster */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Direct Visibility Toggle */}
            <button
              onClick={() =>
                updateFeature(f.id, (feat) => ({
                  ...feat,
                  props: { ...feat.props, visible: isVisible ? 0 : 1 },
                }))
              }
              title={isVisible ? 'Hide layer' : 'Show layer'}
              className="p-1 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition"
            >
              {isVisible ? (
                <Eye className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
              )}
            </button>

            {/* Direct Zoom to Bounds */}
            <button
              onClick={() => handleZoomTo(f)}
              title="Zoom to layer bounds"
              className="p-1 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* Expand / Details Toggle */}
            <button
              onClick={() => setExpandedLayerId(isExpanded ? null : f.id)}
              title="Layer options & controls"
              className={`p-1 rounded-md transition ${
                isExpanded
                  ? 'bg-white/15 text-white'
                  : 'hover:bg-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Secondary Controls Tray (Labels, Edit, Attributes, Delete) */}
        {isExpanded && (
          <div className="px-3 py-2.5 bg-black/40 border-t border-white/[0.08] rounded-b-xl flex flex-col gap-2 animate-in fade-in duration-100">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!f.props.showLabel}
                  onChange={(e) =>
                    updateFeature(f.id, (feat) => ({
                      ...feat,
                      props: { ...feat.props, showLabel: e.target.checked },
                    }))
                  }
                  className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                />
                <span className="font-medium text-zinc-300">Show Map Label</span>
              </label>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Position</span>
                <select
                  value={f.props.labelPos || 'center'}
                  onChange={(e) =>
                    updateFeature(f.id, (feat) => ({
                      ...feat,
                      props: { ...feat.props, labelPos: e.target.value as any },
                    }))
                  }
                  className="bg-zinc-900 border border-white/15 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none focus:border-blue-500"
                >
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.06]">
              <button
                onClick={() => {
                  setSelectedId(f.id);
                  setEditMode(true, f.id);
                  togglePanel('shapeEditor', true);
                }}
                className="flex-1 py-1 px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white flex items-center justify-center gap-1.5 text-[11px] font-medium transition border border-white/10"
              >
                <Pencil className="w-3 h-3 text-blue-400" />
                <span>Edit Shape</span>
              </button>

              <button
                onClick={() => {
                  setSelectedId(f.id);
                  togglePanel('attributeTable', true);
                }}
                className="flex-1 py-1 px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 hover:text-white flex items-center justify-center gap-1.5 text-[11px] font-medium transition border border-white/10"
              >
                <Table className="w-3 h-3 text-emerald-400" />
                <span>Attributes</span>
              </button>

              <button
                onClick={() => removeFeature(f.id)}
                title="Delete layer"
                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition border border-rose-500/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${embedded ? 'absolute top-4 left-4 bottom-4' : 'fixed top-16 left-4 bottom-4'} w-96 z-[999] bg-zinc-950/90 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-2xl flex flex-col overflow-hidden text-xs text-zinc-300`}>
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <FolderTree className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 font-semibold text-white text-sm">
              <span>My Layers</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 border border-white/15 text-zinc-300 font-mono">
                {layerFeatures.length}
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 font-medium">GIS spatial management</span>
          </div>
        </div>
        <button
          onClick={() => togglePanel('myLayers', false)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Layer Search Filter */}
      <div className="px-3 pt-3 pb-2 border-b border-white/10 flex flex-col gap-2">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search layers by name or kind..."
            className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-blue-500 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-zinc-500 outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 p-0.5 text-zinc-500 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5">
            <button
              onClick={selectAllLayers}
              className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 text-zinc-300 hover:text-white transition font-medium flex items-center gap-1.5 border border-white/10"
            >
              <CheckSquare className="w-3 h-3 text-zinc-400" />
              <span>Select All</span>
            </button>
            {selectedLayerIds.length > 0 && (
              <button
                onClick={handleBulkDeleteSelected}
                className="px-2 py-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-lg flex items-center gap-1 text-[11px] transition font-medium"
                title={`Delete ${selectedLayerIds.length} selected layer(s)`}
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
                <span>Delete ({selectedLayerIds.length})</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleAddGroup}
              className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg font-medium flex items-center gap-1 text-[11px] transition border border-blue-500/30"
            >
              <Plus className="w-3 h-3" />
              <span>Group</span>
            </button>
            <button
              onClick={handleBulkHideUnhide}
              className="px-2 py-1 bg-white/[0.05] hover:bg-white/10 border border-white/10 rounded-lg text-zinc-300 text-[11px] transition font-medium"
            >
              Hide/Show
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Layers List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Custom Groups */}
        {Object.entries(customGroups)
          .filter(([gName]) => gName !== 'Trade Area Scan')
          .map(([gName, grp]) => {
            const groupFeats = filteredFeatures.filter((f) => grp.ids.includes(f.id));
            const isStylingOpen = stylingGroupId === gName;

            return (
              <div
                key={gName}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
                  if (id) {
                    setCustomGroups(moveFeatureToGroup(customGroups, id, gName));
                    setToast(`Moved to "${gName}"`);
                  }
                }}
                className="bg-black/30 border border-white/10 rounded-2xl overflow-hidden shadow-sm"
              >
                {/* Group Header */}
                <div className="flex items-center justify-between p-2.5 bg-white/[0.04] hover:bg-white/[0.07] transition">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <button
                      onClick={() => handleToggleGroupCollapse(gName)}
                      className="p-1 rounded text-zinc-400 hover:text-white transition"
                    >
                      {grp.collapsed ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <input
                      value={gName}
                      onChange={(e) => handleRenameGroup(gName, e.target.value)}
                      className="bg-transparent font-semibold text-xs text-white outline-none w-32 border-b border-transparent focus:border-blue-500 px-0.5"
                    />
                    <span className="text-[10px] text-zinc-500 font-mono">({groupFeats.length})</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setStylingGroupId(isStylingOpen ? null : gName)}
                      title="Bulk style group markers"
                      className={`p-1.5 rounded-lg border transition ${
                        isStylingOpen
                          ? 'bg-blue-600/30 border-blue-500/40 text-blue-300'
                          : 'border-transparent hover:bg-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Palette className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggleGroupEye(gName)}
                      title="Toggle group visibility"
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(gName)}
                      title="Delete group"
                      className="p-1.5 rounded-lg hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Bulk Styling Flyout */}
                {isStylingOpen && (
                  <div className="p-3 bg-zinc-900/90 border-t border-white/10 flex flex-col gap-2.5">
                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                      Bulk Marker Styling
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Color</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-zinc-500">{bulkColor}</span>
                        <input
                          type="color"
                          value={bulkColor}
                          onChange={(e) => setBulkColor(e.target.value)}
                          className="w-6 h-6 rounded border border-white/20 bg-transparent cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Shape</span>
                      <select
                        value={bulkShape}
                        onChange={(e) => setBulkShape(e.target.value)}
                        className="bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                      >
                        <option value="">Keep Existing</option>
                        <option value="pin">Classic Pin</option>
                        <option value="pin-drop">3D Drop Pin</option>
                        <option value="pinball">3D Pinball Drop</option>
                        <option value="center-pinball">Pulse Pinball</option>
                        <option value="pinball-glow">Glow Pinball</option>
                        <option value="circle">Circle</option>
                        <option value="circle-dot">Bullseye Circle</option>
                        <option value="star">5-Point Star</option>
                        <option value="star-four">Sparkle Star</option>
                        <option value="diamond">Diamond Gem</option>
                        <option value="square">Square Badge</option>
                        <option value="flag">Flag</option>
                        <option value="heart">Heart</option>
                        <option value="navigation">Nav Beacon</option>
                        <option value="shield">Shield</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Scale</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0.4"
                          max="5"
                          step="0.1"
                          value={bulkSize}
                          onChange={(e) => setBulkSize(parseFloat(e.target.value))}
                          className="accent-blue-500 w-24 cursor-pointer"
                        />
                        <span className="font-mono text-[10px] text-zinc-500 w-6 text-right">
                          {bulkSize.toFixed(1)}x
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleBulkStyleApply(gName)}
                      className="mt-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-center text-xs transition"
                    >
                      Apply to Group
                    </button>
                  </div>
                )}

                {/* Group Items */}
                {!grp.collapsed && (
                  <div className="p-2 flex flex-col gap-1.5">
                    {groupFeats.length ? (
                      groupFeats.map((feature, index) => renderLayerCard(feature, index))
                    ) : (
                      <div className="p-3 text-center text-[11px] text-zinc-500 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                        Empty group — drag layers here
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {/* Ungrouped Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (id) {
              setCustomGroups(moveFeatureToGroup(customGroups, id, null));
              setToast('Moved to Ungrouped');
            }
          }}
          className="flex flex-col gap-2 pt-2 border-t border-white/10"
        >
          <div className="flex items-center justify-between px-1">
            <span className="font-semibold text-zinc-400 text-xs">Ungrouped Layers</span>
            <span className="text-[10px] text-zinc-500 font-mono">{ungroupedFeats.length}</span>
          </div>
          {ungroupedFeats.length ? (
            ungroupedFeats.map((feature, index) => renderLayerCard(feature, index))
          ) : (
            <div className="p-4 text-center text-zinc-500 text-xs rounded-xl border border-dashed border-white/10 bg-white/[0.01]">
              {searchQuery ? 'No matching layers found' : 'No ungrouped layers'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
