'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { buffer as turfBuffer } from '@turf/turf';
import {
  Radar,
  X,
  Crosshair,
  Search,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  MapPin,
  Flame,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  Building2,
  CheckCircle2,
  Circle as CircleIcon,
  RotateCcw,
  Trash2,
  Download,
  FileJson,
  Upload,
  Edit3,
  Eye,
  EyeOff,
  Layers,
  Table2,
  MapPin as MapPinIcon,
  Maximize2,
  Minimize2,
  ArrowUpDown,
  Sliders,
  Palette,
  Send,
  MessageSquare,
  Bot,
  User,
  CheckSquare,
  Square,
  MinusSquare,
  ShoppingBag,
  ShoppingCart,
  Store,
  Utensils,
  Coffee,
  Pill,
  HeartPulse,
  Home,
  Factory,
  Package,
  GraduationCap,
  Shield,
  Car,
  Bike,
  Bus,
  Fuel,
  Dumbbell,
  Wrench,
  Smartphone,
  BookOpen,
  Camera,
  Film,
  Plane,
  Mail,
  Hotel,
  Truck,
  Scissors,
  Printer,
  Gift,
  Beer,
  Zap,
  Tag,
  Music,
  Trees,
  Church,
  Activity,
  Landmark,
  Anchor,
  HelpCircle,
  Clock,
  Route,
  Footprints,
  Cpu,
} from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import {
  POI_CONFIG,
  CATEGORY_COLORS,
  scanTradeAreaCoordinates,
  scanTradeAreaPolygon,
  ScannedPOI,
  ScanResult,
  compileFeaturesKml,
} from '../../gis/tradeArea';
import { circleCoordsFromRadius } from '../../gis/circles';
import { getIconKey } from '../../gis/markers';
import { GISFeature, MarkerShape } from '../../types/gis';
import { AIInsightsPayload, CommercialCluster } from '../../app/api/ai/insights/route';

// Category icon helper
const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'COMMERCIAL & OFFICES':
      return <Building2 className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
    case 'RETAIL':
      return <ShoppingBag className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
    case 'FOOD, BEVERAGE & HOSPITALITY':
      return <Utensils className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
    case 'RESIDENTIAL':
      return <Home className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
    case 'INDUSTRIAL & LOGISTICS':
      return <Factory className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
    case 'HEALTH & EMERGENCY SERVICES':
      return <HeartPulse className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
    case 'GOVERNMENT, EDUCATION & INFRASTRUCTURE':
      return <GraduationCap className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
    case 'LEISURE, SPORTS & PUBLIC SPACES':
    case 'LEISURE, SPORTS & CULTURE':
      return <Dumbbell className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
    default:
      return <Tag className="w-3.5 h-3.5 text-zinc-300 shrink-0" />;
  }
};

// Sub-item icon helper
const getPoiItemIcon = (label: string, category: string) => {
  const l = label.toLowerCase();
  if (l.includes('bank') || l.includes('atm')) return <Landmark className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('office') || l.includes('corporate') || l.includes('business')) return <Building2 className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('tech') || l.includes('phone')) return <Smartphone className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('supermarket') || l.includes('grocery')) return <ShoppingCart className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('mall') || l.includes('department store') || l.includes('shopping')) return <ShoppingBag className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('convenience') || l.includes('kiosk') || l.includes('general')) return <Store className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('pharmacy') || l.includes('chemist')) return <Pill className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('hardware') || l.includes('diy')) return <Wrench className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('beauty') || l.includes('hairdresser') || l.includes('cosmetics')) return <Scissors className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('bicycle') || l.includes('cycling')) return <Bike className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('car')) return <Car className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('book') || l.includes('library')) return <BookOpen className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('photo')) return <Camera className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('copy')) return <Printer className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('gift') || l.includes('toy') || l.includes('jewelry')) return <Gift className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('cafe') || l.includes('coffee') || l.includes('bakery')) return <Coffee className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('restaurant') || l.includes('food court')) return <Utensils className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('fast food') || l.includes('bbq') || l.includes('ice cream')) return <Flame className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('bar') || l.includes('pub') || l.includes('biergarten') || l.includes('nightclub') || l.includes('casino')) return <Beer className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('hotel') || l.includes('motel') || l.includes('hostel') || l.includes('guest house') || l.includes('chalet')) return <Hotel className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('house') || l.includes('apartment') || l.includes('residential') || l.includes('condominium') || l.includes('village') || l.includes('town') || l.includes('city') || l.includes('hamlet') || l.includes('suburb')) return <Home className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('expressway') || l.includes('truck') || l.includes('hgv')) return <Truck className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('port') || l.includes('terminal')) return <Anchor className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('factory') || l.includes('manufacturing') || l.includes('industrial')) return <Factory className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('warehouse') || l.includes('storage')) return <Package className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('hospital') || l.includes('clinic')) return <HeartPulse className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('police')) return <Shield className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('fire')) return <Flame className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('defibrillator')) return <Zap className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('airport')) return <Plane className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('school') || l.includes('college') || l.includes('university') || l.includes('kindergarten')) return <GraduationCap className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('post') || l.includes('letter')) return <Mail className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('camera')) return <Camera className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('church') || l.includes('mosque') || l.includes('temple') || l.includes('synagogue')) return <Church className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('cinema') || l.includes('theatre')) return <Film className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('fuel')) return <Fuel className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('parking')) return <Car className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('bus')) return <Bus className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('sport') || l.includes('soccer') || l.includes('tennis') || l.includes('basketball') || l.includes('baseball') || l.includes('football') || l.includes('gym')) return <Activity className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('music')) return <Music className="w-3.5 h-3.5 shrink-0" />;
  if (l.includes('park') || l.includes('garden')) return <Trees className="w-3.5 h-3.5 shrink-0" />;
  
  return <Tag className="w-3.5 h-3.5 shrink-0" />;
};

const humanizeOsmValue = (value: unknown) => String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const getPoiClassification = (tags: Record<string, unknown>) => {
  const candidates = Object.entries(POI_CONFIG).flatMap(([category, items]) => items.map(([label, tagQuery]) => ({ category, label, tagQuery })))
    .sort((a, b) => Number(a.tagQuery.includes('~')) - Number(b.tagQuery.includes('~')));
  for (const { category, label, tagQuery } of candidates) {
      const match = tagQuery.match(/^"([^"]+)"\s*(=|~)\s*"([^"]+)"\s*(,i)?$/);
      if (!match) continue;
      const [, key, operator, expected, insensitive] = match;
      const actual = tags[key];
      if (actual == null) continue;
      const value = String(actual);
      const matches = operator === '='
        ? (insensitive ? value.toLowerCase() === expected.toLowerCase() : value === expected)
        : (() => { try { return new RegExp(expected, insensitive ? 'i' : '').test(value); } catch { return false; } })();
      if (matches) return { label, category };
  }
  const key = ['amenity', 'shop', 'office', 'tourism', 'leisure', 'healthcare', 'craft', 'place', 'building', 'industrial'].find((tagKey) => tags[tagKey]);
  return { label: humanizeOsmValue(key ? tags[key] : 'Place'), category: key === 'shop' ? 'RETAIL' : key ? 'OTHER SERVICES' : 'OTHER' };
};

const getPoiAddress = (tags: Record<string, unknown>) => {
  const full = tags['addr:full'];
  if (full) return String(full);
  return [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']]
    .filter(Boolean).map(String).join(', ');
};

const getPoiPlaceGroup = (feature: GISFeature, address: string, by: 'street' | 'city') => {
  const tags = (feature.props.osmTags || {}) as Record<string, unknown>;
  const directValue = by === 'street'
    ? tags['addr:street'] || tags.street
    : tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || tags['addr:municipality'] || tags['addr:suburb'];
  if (directValue) return humanizeOsmValue(directValue);
  const parts = String(tags['addr:full'] || address || '').split(',').map((part) => part.trim()).filter(Boolean);
  if (by === 'street') {
    if (!parts.length) return 'Street not listed';
    const streetPart = /^\d+[\w/-]*$/.test(parts[0]) && parts.length > 1 ? parts[1] : parts[0];
    return streetPart || 'Street not listed';
  }
  if (!parts.length) return 'City not listed';
  const lastPart = parts[parts.length - 1];
  const cityPart = /^\d{3,}$/.test(lastPart) && parts.length > 1 ? parts[parts.length - 2] : lastPart;
  return cityPart || 'City not listed';
};

const getReadablePoiName = (feature: GISFeature) => {
  const tags = (feature.props.osmTags || {}) as Record<string, unknown>;
  const type = getPoiClassification(tags).label;
  const name = String(feature.name || '').trim();
  const generic = ['amenity', 'shop', 'office', 'tourism', 'leisure', 'healthcare', 'place', 'building'].some((key) => String(tags[key] || '').toLowerCase() === name.toLowerCase());
  if (generic || !name) return String(tags.name || tags.brand || `Unnamed ${type}`);
  return name;
};

const getScannedPoiDuplicateKey = (feature: GISFeature) => {
  if (feature.geometry.type !== 'Point') return null;
  const name = getReadablePoiName(feature).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const [longitude, latitude] = feature.geometry.coordinates;
  if (!name || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return `${name}|${latitude.toFixed(6)}|${longitude.toFixed(6)}`;
};

const getPoiCoordinates = (feature: GISFeature) => feature.geometry.type === 'Point'
  ? `${feature.geometry.coordinates[1]},${feature.geometry.coordinates[0]}`
  : '';

const getGoogleMapsUrl = (feature: GISFeature, name: string, address: string) => {
  const location = getPoiCoordinates(feature) || `${name} ${address}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
};

const getStreetViewUrl = (feature: GISFeature, name: string, address: string) => {
  const coordinates = getPoiCoordinates(feature);
  return coordinates
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(coordinates)}`
    : getGoogleMapsUrl(feature, name, address);
};

interface ResultsTableRow {
  feature: GISFeature;
  name: string;
  type: string;
  address: string;
  searchAreaLabels: string[];
  researchData: Record<string, unknown>;
}

type ResultsGroupBy = 'place' | 'name' | 'type' | 'address' | 'searchArea' | `research:${string}`;
type PoiGroupStyle = { color?: string; shape?: MarkerShape; iconSize?: number };

interface ResultsTableProps {
  rows: ResultsTableRow[];
  researchColumns: string[];
  total: number;
  maximized: boolean;
  search: string;
  setSearch: (value: string) => void;
  sortBy: 'name' | 'type';
  setSortBy: (value: 'name' | 'type') => void;
  ascending: boolean;
  setAscending: React.Dispatch<React.SetStateAction<boolean>>;
  groupBy: ResultsGroupBy;
  setGroupBy: (value: ResultsGroupBy) => void;
  placeGroupBy: 'street' | 'city';
  setPlaceGroupBy: (value: 'street' | 'city') => void;
  onToggleMaximize: () => void;
  onLocate: (feature: GISFeature) => void;
  onExportResearchPack: () => void;
  onImportResearchFile: (file: File) => void;
  onStyleGroup: (features: GISFeature[], updates: PoiGroupStyle) => void;
  collapsedGroups: Record<string, boolean>;
  setCollapsedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

const formatResearchValue = (value: unknown) => {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

const getResultsGroupLabel = (row: ResultsTableRow, groupBy: ResultsGroupBy, placeGroupBy: 'street' | 'city') => {
  if (groupBy === 'type') return row.type || 'Uncategorized';
  if (groupBy === 'name') return row.name || 'Unnamed place';
  if (groupBy === 'address') return row.address || 'Address not listed';
  if (groupBy === 'searchArea') return row.searchAreaLabels[0] || 'Search area not recorded';
  if (groupBy.startsWith('research:')) {
    const value = formatResearchValue(row.researchData[groupBy.slice('research:'.length)]);
    return value === '—' ? 'Not listed' : value;
  }
  return getPoiPlaceGroup(row.feature, row.address, placeGroupBy);
};

const isSafeResearchValue = (value: unknown, depth = 0): boolean => {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 20000;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth >= 6) return false;
  if (Array.isArray(value)) return value.length <= 200 && value.every((item) => isSafeResearchValue(item, depth + 1));
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length <= 100 && entries.every(([key, item]) => key.length > 0 && key.length <= 100 && !['__proto__', 'prototype', 'constructor'].includes(key) && isSafeResearchValue(item, depth + 1));
  }
  return false;
};

const TradeAreaResultsTable: React.FC<ResultsTableProps> = ({ rows, researchColumns, total, maximized, search, setSearch, sortBy, setSortBy, ascending, setAscending, groupBy, setGroupBy, placeGroupBy, setPlaceGroupBy, onToggleMaximize, onLocate, onExportResearchPack, onImportResearchFile, onStyleGroup, collapsedGroups, setCollapsedGroups }) => {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [openGroupStyles, setOpenGroupStyles] = useState<Record<string, boolean>>({});
  const groups = rows.reduce<Array<{ label: string; rows: ResultsTableRow[] }>>((result, row) => {
    const label = getResultsGroupLabel(row, groupBy, placeGroupBy);
    const existing = result[result.length - 1];
    if (existing?.label === label) existing.rows.push(row);
    else result.push({ label, rows: [row] });
    return result;
  }, []);

  return (
  <div className={`${maximized ? 'flex h-full min-h-0 flex-col rounded-2xl border border-white/15 bg-zinc-950 p-3 shadow-2xl sm:p-5' : 'rounded-xl border border-white/10 bg-black/20 p-2.5'}`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div><h4 className="flex items-center gap-1.5 text-[11px] font-bold text-white"><Table2 className="h-3.5 w-3.5 text-cyan-300" />Places table</h4><p className="mt-0.5 text-[9px] text-zinc-500">{rows.length} of {total} places · Select a row to locate it on the map.</p></div>
      <div className="min-w-0 flex flex-1 flex-wrap items-center justify-end gap-1.5">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a place…" aria-label="Search places table" className="w-32 min-w-28 max-w-full flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[10px] text-white placeholder-zinc-500 outline-none focus:border-cyan-300/40" />
        <select aria-label="Group places by" value={groupBy} onChange={(event) => setGroupBy(event.target.value as ResultsGroupBy)} className="max-w-full shrink-0 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-[9px] text-zinc-200"><option value="place">Group: Place</option><option value="name">Group: Name</option><option value="type">Group: Type</option><option value="address">Group: Address</option><option value="searchArea">Group: Search Area</option>{researchColumns.map((column) => <option key={column} value={`research:${column}`}>Group: {column}</option>)}</select>
        {groupBy === 'place' && <select aria-label="Group place locations by" value={placeGroupBy} onChange={(event) => setPlaceGroupBy(event.target.value as 'street' | 'city')} className="shrink-0 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-[9px] text-zinc-200"><option value="street">Street</option><option value="city">City</option></select>}
        <select aria-label="Sort places by" value={sortBy} onChange={(event) => setSortBy(event.target.value as 'name' | 'type')} className="shrink-0 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-[9px] text-zinc-200"><option value="name">Name</option><option value="type">Place type</option></select>
        <button type="button" onClick={() => setAscending((value) => !value)} aria-label={ascending ? 'Sort descending' : 'Sort ascending'} title={ascending ? 'Sort descending' : 'Sort ascending'} className="shrink-0 rounded-lg border border-white/10 p-1.5 text-zinc-300 hover:bg-white/10"><ArrowUpDown className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onExportResearchPack} aria-label="Export AI research pack" className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-cyan-300/20 px-2 py-1.5 text-[9px] leading-none text-cyan-100 hover:bg-cyan-300/10" title="Export cafés with a research prompt as structured JSON"><FileJson className="h-3 w-3 shrink-0" /><span>AI pack</span></button>
        <button type="button" onClick={() => importInputRef.current?.click()} aria-label="Import AI research JSON" className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-white/10 px-2 py-1.5 text-[9px] leading-none text-zinc-200 hover:bg-white/10" title="Import AI research JSON"><Upload className="h-3 w-3 shrink-0" /><span>Import</span></button>
        <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportResearchFile(file); event.currentTarget.value = ''; }} />
        <button type="button" onClick={onToggleMaximize} aria-label={maximized ? 'Restore table size' : 'Enlarge table'} className="shrink-0 rounded-lg border border-white/10 p-1.5 text-zinc-300 hover:bg-white/10">{maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
      </div>
    </div>
    <div className={`overflow-auto rounded-lg border border-white/10 ${maximized ? 'min-h-0 flex-1' : 'max-h-72'}`}>
      <table className="w-full min-w-[620px] border-collapse text-left text-[10px]">
        <thead className="sticky top-0 z-10 bg-zinc-900 text-[9px] uppercase tracking-wide text-zinc-400"><tr><th className="px-3 py-2">Place</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Address</th>{researchColumns.map((column) => <th key={column} className="min-w-28 px-3 py-2 normal-case">{column}</th>)}<th className="px-3 py-2 text-center">Actions</th></tr></thead>
        <tbody className="divide-y divide-white/5">
          {groups.map((group) => {
            const groupKey = `${groupBy}:${placeGroupBy}:${group.label}`;
            const firstFeature = group.rows[0]?.feature;
            const groupStylesOpen = openGroupStyles[groupKey] ?? false;
            const isCollapsed = collapsedGroups[groupKey] ?? false;
            return <React.Fragment key={groupKey}>
            <tr className="bg-white/[0.035]"><td colSpan={4 + researchColumns.length} className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400"><div className="flex w-max max-w-full items-center gap-2"><button type="button" onClick={() => setCollapsedGroups((current) => ({ ...current, [groupKey]: !(current[groupKey] ?? false) }))} aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? 'Show' : 'Hide'} ${group.label} places`} className="flex min-w-0 max-w-56 items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-white/10 hover:text-white">{isCollapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}<span className="truncate" title={group.label}>{group.label}</span><span className="shrink-0 font-mono normal-case text-zinc-600">{group.rows.length}</span></button><button type="button" onClick={() => setOpenGroupStyles((current) => ({ ...current, [groupKey]: !groupStylesOpen }))} aria-expanded={groupStylesOpen} aria-label={`Style ${group.label} group`} title={`Style ${group.rows.length} places in this group`} className={`shrink-0 rounded-md p-1.5 normal-case ${groupStylesOpen ? 'bg-cyan-300/10 text-cyan-200' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}><Palette className="h-3.5 w-3.5" /></button></div></td></tr>
            {groupStylesOpen && <tr className="bg-zinc-900/80"><td colSpan={4 + researchColumns.length} className="px-3 py-2"><div className="flex flex-wrap items-center gap-3 text-[10px] normal-case text-zinc-300"><span className="font-semibold text-cyan-200">Style {group.rows.length} places</span><label className="flex items-center gap-1.5">Color<input type="color" aria-label={`Color for ${group.label} group`} value={firstFeature?.props.color || '#ffffff'} onChange={(event) => onStyleGroup(group.rows.map((row) => row.feature), { color: event.target.value })} className="h-6 w-7 cursor-pointer rounded bg-transparent" /></label><label className="flex items-center gap-1.5">Icon<select aria-label={`Icon for ${group.label} group`} value={firstFeature?.props.shape || 'modern-pin'} onChange={(event) => onStyleGroup(group.rows.map((row) => row.feature), { shape: event.target.value as MarkerShape })} className="rounded-md border border-white/10 bg-zinc-950 px-2 py-1 text-[10px] text-white"><option value="modern-pin">Pin</option><option value="dots">Dot</option><option value="circle">Circle</option><option value="star">Star</option><option value="square">Square</option><option value="diamond">Diamond</option><option value="heart">Heart</option><option value="shield">Shield</option></select></label><label className="flex min-w-40 flex-1 items-center gap-2">Size<input type="range" min="0.4" max="5" step="0.05" value={firstFeature?.props.iconSize ?? 1} aria-label={`Size for ${group.label} group`} onChange={(event) => onStyleGroup(group.rows.map((row) => row.feature), { iconSize: Number(event.target.value) })} className="min-w-20 flex-1 accent-cyan-300" /><span className="w-9 text-right">{Math.round((firstFeature?.props.iconSize ?? 1) * 100)}%</span></label></div></td></tr>}
            {!isCollapsed && group.rows.map((row) => <tr key={row.feature.id} onClick={() => onLocate(row.feature)} className="cursor-pointer text-zinc-200 hover:bg-white/[0.06]" title="Locate this place on the map">
              <td className="max-w-72 px-3 py-2 font-medium text-white"><span className="block truncate">{row.name}</span></td>
              <td className="px-3 py-2">{row.type}</td>
              <td className="max-w-56 px-3 py-2 text-zinc-400">{row.address ? <a href={getGoogleMapsUrl(row.feature, row.name, row.address)} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="block truncate text-cyan-200 hover:underline" title="Open this address in Google Maps">{row.address}</a> : <span className="text-zinc-500">Not listed</span>}</td>
              {researchColumns.map((column) => <td key={column} className="max-w-48 px-3 py-2 text-zinc-300"><span className="block truncate" title={formatResearchValue(row.researchData[column])}>{formatResearchValue(row.researchData[column])}</span></td>)}
              <td className="px-3 py-2"><div className="flex items-center justify-center gap-1">
                <button type="button" onClick={(event) => { event.stopPropagation(); onLocate(row.feature); }} aria-label={`View ${row.name} on map`} title="View in map" className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10 hover:text-cyan-200"><Crosshair className="h-3.5 w-3.5" /></button>
                <a href={getGoogleMapsUrl(row.feature, row.name, row.address)} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} aria-label={`Open ${row.name} in Google Maps`} title="Google Maps" className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10 hover:text-cyan-200"><MapPinIcon className="h-3.5 w-3.5" /></a>
                <a href={getStreetViewUrl(row.feature, row.name, row.address)} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} aria-label={`Open Street View for ${row.name}`} title="Street View" className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10 hover:text-cyan-200"><Eye className="h-3.5 w-3.5" /></a>
                <a href={`https://www.google.com/search?q=${encodeURIComponent(row.name)}`} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} aria-label={`Search Google for ${row.name}`} title="Google search" className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10 hover:text-cyan-200"><Search className="h-3.5 w-3.5" /></a>
              </div></td>
            </tr>)}
          </React.Fragment>; })}
          {rows.length === 0 && <tr><td colSpan={4 + researchColumns.length} className="px-3 py-8 text-center text-[10px] text-zinc-500">No places match this search.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
  );
};

const MAX_SEARCH_AREAS = 5;

interface TradeAreaSidebarProps {
  mapInstance: any;
}

interface QAMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface SearchBuilderPlace {
  label: string;
  filters: Array<{ key: string; value: string }>;
}

interface SearchBuilderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const TradeAreaSidebar: React.FC<TradeAreaSidebarProps> = ({ mapInstance }) => {
  const {
    activePanels,
    togglePanel,
    features,
    setFeatures,
    addFeature,
    updateFeature,
    removeFeature,
    customGroups,
    setCustomGroups,
    setToast,
    setActiveCinematicCluster,
    activeTool,
    setActiveTool,
    openNodeDisplayMode,
    setOpenNodeDisplayMode,
  } = useMapStore();

  const activeTab = 'target_layers';
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<1 | 2 | 3>(1);

  // Start with a map boundary; coordinates remain available for precise targeting.
  const [areaMode, setAreaMode] = useState<'coords' | 'circle' | 'shape' | 'polygon' | 'isochrone' | 'street'>('shape');
  const [areaDetailsOpen, setAreaDetailsOpen] = useState(true);
  const [coordsInput, setCoordsInput] = useState<string>('14.5995, 120.9842');
  const [radiusMeters, setRadiusMeters] = useState<number>(1000);
  const [showRadiusGraphics, setShowRadiusGraphics] = useState<boolean>(true);

  // Mapbox Isochrone Travel-Time Catchment State
  const [isochroneProfile, setIsochroneProfile] = useState<'driving' | 'walking' | 'cycling'>('driving');
  const [isochroneMinutes, setIsochroneMinutes] = useState<number>(10);
  const [isGeneratingIsochrone, setIsGeneratingIsochrone] = useState<boolean>(false);
  const [activeIsochroneFeatureId, setActiveIsochroneFeatureId] = useState<number | null>(null);

  // Center Marker & Radius Feature IDs
  const [centerMarkerId, setCenterMarkerId] = useState<number | null>(null);
  const [activeBufferFeatureId, setActiveBufferFeatureId] = useState<number | null>(null);

  // Selected Drawn shapes
  const [selectedCircleIds, setSelectedCircleIds] = useState<number[]>([]);
  const [selectedBoundaryIds, setSelectedBoundaryIds] = useState<number[]>([]);
  const [selectedPolygonIds, setSelectedPolygonIds] = useState<number[]>([]);
  const [selectedStreetRouteIds, setSelectedStreetRouteIds] = useState<number[]>([]);
  const [streetCorridorWidthMeters, setStreetCorridorWidthMeters] = useState(1000);
  const streetRouteDrawPendingRef = useRef(false);
  const streetRouteDrawStartedRef = useRef(false);
  const streetRouteIdsBeforeDrawRef = useRef<Set<number>>(new Set());

  // Taxonomy & Search State - CLEARED BY DEFAULT
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [presetDraftTags, setPresetDraftTags] = useState<string[]>([]);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [customFilterGroups, setCustomFilterGroups] = useState<Array<{ filters: Array<{ key: string; value: string }> }>>([]);
  const [builderMessages, setBuilderMessages] = useState<SearchBuilderMessage[]>([]);
  const [builderInput, setBuilderInput] = useState('');
  const [builderQuestion, setBuilderQuestion] = useState('');
  const [builderOptions, setBuilderOptions] = useState<string[]>([]);
  const [builderPlaces, setBuilderPlaces] = useState<SearchBuilderPlace[]>([]);
  const [builderWarnings, setBuilderWarnings] = useState<string[]>([]);
  const [builderReady, setBuilderReady] = useState(false);
  const [isBuilderLoading, setIsBuilderLoading] = useState(false);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const builderRequestIdRef = useRef(0);
  const pendingAutoRunRef = useRef(false);
  const autoRunAreaNoticeRef = useRef(false);

  // Scanning, Multi-Stage Progress, & Cancel State
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStage, setScanStage] = useState<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [scannedPois, setScannedPois] = useState<ScannedPOI[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<Record<string, number>>({});

  // Global Marker Styling State (Monochrome Defaults)
  const [globalMarkerStyle, setGlobalMarkerStyle] = useState<MarkerShape>('modern-pin');
  const [globalMarkerSize, setGlobalMarkerSize] = useState<number>(20);
  const [globalMarkerColor, setGlobalMarkerColor] = useState<string>('#ffffff');
  const [showStyleMenu, setShowStyleMenu] = useState<boolean>(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [openAmenityGroups, setOpenAmenityGroups] = useState<Record<string, boolean>>({});
  const [openPoiStyles, setOpenPoiStyles] = useState<Record<number, boolean>>({});
  const [editingAmenityGroup, setEditingAmenityGroup] = useState<string | null>(null);
  const [amenityGroupDraft, setAmenityGroupDraft] = useState('');
  const [resultsExpanded, setResultsExpanded] = useState(true);
  const [resultsView, setResultsView] = useState<'groups' | 'table'>('groups');
  const [resultsTableMaximized, setResultsTableMaximized] = useState(false);
  const [resultsTableSearch, setResultsTableSearch] = useState('');
  const [resultsSortBy, setResultsSortBy] = useState<'name' | 'type'>('name');
  const [resultsSortAscending, setResultsSortAscending] = useState(true);
  const [resultsGroupBy, setResultsGroupBy] = useState<ResultsGroupBy>('type');
  const [placeGroupBy, setPlaceGroupBy] = useState<'street' | 'city'>('street');
  const [collapsedTableGroups, setCollapsedTableGroups] = useState<Record<string, boolean>>({});
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [boundaryQuery, setBoundaryQuery] = useState('');
  const [boundaryResults, setBoundaryResults] = useState<any[]>([]);
  const [isSearchingBoundaries, setIsSearchingBoundaries] = useState(false);

  // Visual AI Intelligence Dashboard State
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiData, setAiData] = useState<AIInsightsPayload | null>(null);
  const [hasCopied, setHasCopied] = useState<boolean>(false);
  const [showRawBrief, setShowRawBrief] = useState<boolean>(false);
  const [showCapabilitiesModal, setShowCapabilitiesModal] = useState<boolean>(false);

  // Interactive Spatial AI Q&A State
  const [qaMessages, setQaMessages] = useState<QAMessage[]>([]);
  const [qaInput, setQaInput] = useState<string>('');
  const [isQaLoading, setIsQaLoading] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Drawn circles and shapes on MapLibre
  const drawnCircles = useMemo(() => features.filter((f) => f.kind === 'circle'), [features]);
  const drawnShapes = useMemo(() => features.filter((f) => ['polygon', 'rectangle'].includes(f.kind)), [features]);
  const drawnBoundaries = useMemo(() => drawnShapes.filter((feature) => feature.props.attributes?.source === 'OpenStreetMap Nominatim'), [drawnShapes]);
  const drawnPolygons = useMemo(() => drawnShapes.filter((feature) => feature.props.attributes?.source !== 'OpenStreetMap Nominatim'), [drawnShapes]);
  const drawnStreetRoutes = useMemo(() => features.filter((f) => f.kind === 'route' && f.geometry.type === 'LineString'), [features]);
  const selectedStreetRoutes = useMemo(() => drawnStreetRoutes.filter((route) => selectedStreetRouteIds.includes(route.id)), [drawnStreetRoutes, selectedStreetRouteIds]);
  const drawnShapeCountRef = useRef<number | null>(null);
  const drawnCircleCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (drawnShapeCountRef.current !== null && drawnShapes.length > drawnShapeCountRef.current) {
      const addedShape = drawnShapes[drawnShapes.length - 1];
      if (addedShape.props.attributes?.source === 'OpenStreetMap Nominatim') {
        setSelectedBoundaryIds((current) => current.includes(addedShape.id) || current.length >= MAX_SEARCH_AREAS ? current : [...current, addedShape.id]);
      } else {
        setSelectedPolygonIds((current) => current.includes(addedShape.id) || current.length >= MAX_SEARCH_AREAS ? current : [...current, addedShape.id]);
      }
    }
    setSelectedBoundaryIds((current) => {
      const valid = current.filter((id) => drawnBoundaries.some((feature) => feature.id === id));
      return valid.length === current.length ? current : valid;
    });
    setSelectedPolygonIds((current) => {
      const valid = current.filter((id) => drawnPolygons.some((feature) => feature.id === id));
      return valid.length === current.length ? current : valid;
    });
    drawnShapeCountRef.current = drawnShapes.length;
  }, [drawnShapes, drawnBoundaries, drawnPolygons]);

  useEffect(() => {
    if (drawnCircleCountRef.current !== null && drawnCircles.length > drawnCircleCountRef.current) {
      setSelectedCircleIds((current) => Array.from(new Set([...current, drawnCircles[drawnCircles.length - 1].id])));
    }
    setSelectedCircleIds((current) => {
      const valid = current.filter((id) => drawnCircles.some((feature) => feature.id === id));
      return valid.length === current.length ? current : valid;
    });
    drawnCircleCountRef.current = drawnCircles.length;
  }, [drawnCircles]);

  useEffect(() => {
    if (!streetRouteDrawPendingRef.current) return;
    const createdRoute = drawnStreetRoutes.find((route) => !streetRouteIdsBeforeDrawRef.current.has(route.id));
    if (createdRoute) {
      streetRouteDrawPendingRef.current = false;
      streetRouteDrawStartedRef.current = false;
      setSelectedStreetRouteIds((current) => Array.from(new Set([...current, createdRoute.id])).slice(-MAX_SEARCH_AREAS));
      setToast(`Route added as a street search area. Set the corridor width, then scan.`);
      return;
    }
    if (activeTool === 'route') streetRouteDrawStartedRef.current = true;
    else if (streetRouteDrawStartedRef.current) {
      streetRouteDrawPendingRef.current = false;
      streetRouteDrawStartedRef.current = false;
    }
  }, [activeTool, drawnStreetRoutes, setToast]);

  // Scanned POI features currently in the store
  const scannedFeatureIds = useMemo(() => {
    return customGroups['Trade Area Scan']?.ids || [];
  }, [customGroups]);

  const scannedFeatures = useMemo(() => {
    return features.filter((f) => scannedFeatureIds.includes(f.id));
  }, [features, scannedFeatureIds]);

  const { activeScannedFeatures, duplicateScannedFeatureIds } = useMemo(() => {
    const unique: GISFeature[] = [];
    const duplicates: number[] = [];
    const seen = new Set<string>();
    scannedFeatures.forEach((feature) => {
      const key = getScannedPoiDuplicateKey(feature);
      if (key && seen.has(key)) duplicates.push(feature.id);
      else {
        if (key) seen.add(key);
        unique.push(feature);
      }
    });
    return { activeScannedFeatures: unique, duplicateScannedFeatureIds: duplicates };
  }, [scannedFeatures]);

  useEffect(() => {
    duplicateScannedFeatureIds.forEach((id) => {
      const duplicate = scannedFeatures.find((feature) => feature.id === id);
      if (duplicate && duplicate.props.visible !== 0) {
        updateFeature(id, (previous) => ({ ...previous, props: { ...previous.props, visible: 0 } }));
      }
    });
  }, [duplicateScannedFeatureIds, scannedFeatures, updateFeature]);

  // Group active scanned features by category
  const featuresByCategory = useMemo(() => {
    const map: Record<string, GISFeature[]> = {};
    activeScannedFeatures.forEach((f) => {
      const cat = f.props?.amenityGroupLabel || f.props?.poiType || f.props?.category || 'OTHER';
      if (!map[cat]) map[cat] = [];
      map[cat].push(f);
    });
    return map;
  }, [activeScannedFeatures]);

  const resultsResearchColumns = useMemo(() => Array.from(new Set(activeScannedFeatures.flatMap((feature) => Object.keys(feature.props.researchData || {})))).sort((a, b) => a.localeCompare(b)), [activeScannedFeatures]);

  useEffect(() => {
    if (resultsGroupBy.startsWith('research:') && !resultsResearchColumns.includes(resultsGroupBy.slice('research:'.length))) setResultsGroupBy('type');
  }, [resultsGroupBy, resultsResearchColumns]);

  const resultTableRows = useMemo(() => {
    const query = resultsTableSearch.trim().toLowerCase();
    const rows = activeScannedFeatures.map((feature) => {
      const tags = (feature.props.osmTags || {}) as Record<string, unknown>;
      const classification = getPoiClassification(tags);
      const name = getReadablePoiName(feature);
      return {
        feature,
        name,
        type: classification.label || humanizeOsmValue(feature.props.poiType || 'Place'),
        address: getPoiAddress(tags),
        searchAreaLabels: feature.props.searchAreaLabels || [],
        researchData: feature.props.researchData || {},
      };
    });
    return rows.filter((row) => !query || [row.name, row.type, row.address, ...row.searchAreaLabels, ...Object.values(row.researchData).map(formatResearchValue)].some((value) => value.toLowerCase().includes(query)))
      .sort((a, b) => {
        const groupComparison = getResultsGroupLabel(a, resultsGroupBy, placeGroupBy).localeCompare(getResultsGroupLabel(b, resultsGroupBy, placeGroupBy));
        if (groupComparison !== 0) return groupComparison;
        const comparison = a[resultsSortBy].localeCompare(b[resultsSortBy]);
        return resultsSortAscending ? comparison : -comparison;
      });
  }, [activeScannedFeatures, resultsTableSearch, resultsSortBy, resultsSortAscending, resultsGroupBy, placeGroupBy]);

  // Progressive scan stages
  useEffect(() => {
    let timer: any;
    if (isScanning) {
      setScanStage(0);
      timer = setInterval(() => {
        setScanStage((prev) => (prev < 3 ? prev + 1 : prev));
      }, 750);
    } else {
      setScanStage(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isScanning]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (analysisExpanded) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [qaMessages, isQaLoading, analysisExpanded]);

  useEffect(() => {
    if (!resultsTableMaximized) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResultsTableMaximized(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [resultsTableMaximized]);

  // Coordinate parser
  const parseCoordsList = (): Array<{ lat: number; lon: number }> | null => {
    const lines = coordsInput.split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return null;
    const parsed = lines.map((line) => {
      const match = line.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      if (!match) return null;
      const lat = Number(match[1]);
      const lon = Number(match[2]);
      return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
        ? { lat, lon }
        : null;
    });
    return parsed.every((point) => point !== null) ? parsed as Array<{ lat: number; lon: number }> : null;
  };

  const parseCoords = (): { lat: number; lon: number } | null => parseCoordsList()?.[0] || null;

  const searchBoundaries = async () => {
    const query = boundaryQuery.trim();
    if (query.length < 3) {
      setToast('Enter at least 3 characters to search for a boundary.');
      return;
    }
    setIsSearchingBoundaries(true);
    try {
      const response = await fetch(`/api/geocode?polygon_geojson=1&limit=6&q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`Boundary search failed (${response.status})`);
      const data = await response.json();
      setBoundaryResults(Array.isArray(data) ? data.filter((item: any) => item.geojson && ['Polygon', 'MultiPolygon'].includes(item.geojson.type)) : []);
      if (!data?.length) setToast('No matching boundary found. Try a city, district, or barangay name.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not search boundaries. Please try again.');
      setBoundaryResults([]);
    } finally {
      setIsSearchingBoundaries(false);
    }
  };

  const addSearchedBoundary = (item: any) => {
    if (selectedBoundaryIds.length >= MAX_SEARCH_AREAS) {
      setToast(`You can search up to ${MAX_SEARCH_AREAS} boundaries at once.`);
      return;
    }
    const name = `${String(item.display_name || 'Selected area').split(',')[0]} Boundary`;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const feature: GISFeature = {
      id, name, kind: 'polygon', geometry: item.geojson,
      props: {
        borderColor: '#22d3ee', borderOpacity: 0.9, width: 2, fillColor: '#22d3ee', fillOpacity: 0.08, visible: 1,
        attributes: { name: item.display_name, source: 'OpenStreetMap Nominatim' },
      },
    };
    addFeature(feature);
    setSelectedBoundaryIds((current) => current.includes(id) ? current : [...current, id]);
    setBoundaryQuery(String(item.display_name || name));
    setBoundaryResults([]);
    if (item.boundingbox && mapInstance) {
      mapInstance.fitBounds([[Number(item.boundingbox[2]), Number(item.boundingbox[0])], [Number(item.boundingbox[3]), Number(item.boundingbox[1])]], { padding: 70, duration: 800 });
    }
    setToast(`${name} added and selected as a search area.`);
  };

  // Sync center target and buffer circle on map (Monochrome glass styling)
  const syncTargetRadiusGraphics = (targetLat: number, targetLon: number, targetRadius: number) => {
    if (!showRadiusGraphics) return;

    // 1. Center Target Marker (Monochrome Silver/White)
    const cId = centerMarkerId || Date.now() + 9999;
    const centerIconKey = mapInstance
      ? getIconKey('center-pinball', '#ffffff', mapInstance)
      : 'ico_center-pinball_ffffff';

    addFeature({
      id: cId,
      name: `Target Center (${targetLat.toFixed(4)}, ${targetLon.toFixed(4)})`,
      kind: 'marker',
      geometry: { type: 'Point', coordinates: [targetLon, targetLat] },
      props: {
        shape: 'center-pinball',
        color: '#ffffff',
        iconSize: 1.1,
        iconKey: centerIconKey,
        visible: 1,
        attributes: {
          Type: 'Scan Center Target',
          Latitude: targetLat.toFixed(5),
          Longitude: targetLon.toFixed(5),
        },
      },
    });
    setCenterMarkerId(cId);

    // 2. Radius Buffer Circle (Monochrome Glass Stroke & Fill)
    const bufId = activeBufferFeatureId || Date.now() + 8888;
    const ringCoords = circleCoordsFromRadius([targetLon, targetLat], targetRadius);
    addFeature({
      id: bufId,
      name: `Scan Radius (${(targetRadius / 1000).toFixed(1)} km)`,
      kind: 'circle',
      geometry: { type: 'Polygon', coordinates: ringCoords },
      props: {
        color: '#ffffff',
        fillColor: '#ffffff',
        fillOpacity: 0.03,
        borderColor: '#ffffff',
        borderOpacity: 0.75,
        width: 1.5,
        visible: 1,
        centerCoord: [targetLon, targetLat],
        radiusMeters: targetRadius,
        attributes: {
          Radius: `${targetRadius} m`,
          Center: `${targetLat.toFixed(5)}, ${targetLon.toFixed(5)}`,
        },
      },
    });
    setActiveBufferFeatureId(bufId);
  };

  // Set coordinates from map center
  const handleSetFromMapCenter = () => {
    if (mapInstance) {
      const center = mapInstance.getCenter();
      const newStr = `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
      setCoordsInput(newStr);
      syncTargetRadiusGraphics(center.lat, center.lng, radiusMeters);
      setToast(`Target set to map center: ${newStr}`);
    }
  };

  // Set coordinates from GPS
  const handleSetFromCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newStr = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          setCoordsInput(newStr);
          syncTargetRadiusGraphics(pos.coords.latitude, pos.coords.longitude, radiusMeters);
          if (mapInstance) {
            mapInstance.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14 });
          }
          setToast(`Target set to your GPS location: ${newStr}`);
        },
        () => {
          setToast('Unable to retrieve your current location.');
        }
      );
    }
  };

  // Toggle single tag
  const handleTagToggle = (tag: string) => {
    if (isBuilderLoading) return;
    setPresetDraftTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Select/Deselect all tags in a category
  const handleCategorySelectAll = (category: string) => {
    if (isBuilderLoading) return;
    const items = POI_CONFIG[category] || [];
    const catTags = items.map(([_, tag]) => tag);
    const allSelected = catTags.every((t) => presetDraftTags.includes(t));

    if (allSelected) {
      setPresetDraftTags((prev) => prev.filter((t) => !catTags.includes(t)));
    } else {
      setPresetDraftTags((prev) => Array.from(new Set([...prev, ...catTags])));
    }
  };

  // Quick preset selections
  const handleSelectPreset = (preset: 'commercial' | 'all' | 'clear') => {
    if (isBuilderLoading) return;
    if (preset === 'clear') {
      setPresetDraftTags([]);
      return;
    }
    if (preset === 'all') {
      const allTags = Object.values(POI_CONFIG).flatMap((items) => items.map(([_, tag]) => tag));
      setPresetDraftTags(Array.from(new Set(allTags)));
      return;
    }
    if (preset === 'commercial') {
      const commTags = (POI_CONFIG['COMMERCIAL & OFFICES'] || []).map(([_, t]) => t);
      const retTags = (POI_CONFIG['RETAIL'] || []).map(([_, t]) => t);
      const fbTags = (POI_CONFIG['FOOD, BEVERAGE & HOSPITALITY'] || []).map(([_, t]) => t);
      setPresetDraftTags(Array.from(new Set([...commTags, ...retTags, ...fbTags])));
    }
  };

  const getSearchAreaSummary = () => {
    if (areaMode === 'coords') {
      const targets = parseCoordsList();
      return `within ${(radiusMeters / 1000).toFixed(1)} km of ${targets?.length || 0} selected location${targets?.length === 1 ? '' : 's'}`;
    }
    if (areaMode === 'isochrone') return `within the selected ${isochroneMinutes}-minute ${isochroneProfile} area`;
    if (areaMode === 'street') return `within a ${(streetCorridorWidthMeters / 1000).toFixed(streetCorridorWidthMeters % 1000 ? 1 : 0)} km-wide corridor along ${selectedStreetRoutes.length} selected street route${selectedStreetRoutes.length === 1 ? '' : 's'}`;
    if (areaMode === 'shape') return `within ${selectedBoundaryIds.length} selected map ${selectedBoundaryIds.length === 1 ? 'boundary' : 'boundaries'}`;
    if (areaMode === 'polygon') return `within ${selectedPolygonIds.length} selected polygon${selectedPolygonIds.length === 1 ? '' : 's'}`;
    return `within ${selectedCircleIds.length} selected map circle${selectedCircleIds.length === 1 ? '' : 's'}`;
  };

  const getAreaLabel = () => {
    if (areaMode === 'coords') return `${parseCoordsList()?.length || 0} location${parseCoordsList()?.length === 1 ? '' : 's'} · ${(radiusMeters / 1000).toFixed(1)} km radius`;
    if (areaMode === 'isochrone') return `${isochroneMinutes}-minute ${isochroneProfile} reach`;
    if (areaMode === 'street') return `${selectedStreetRoutes.length} street route${selectedStreetRoutes.length === 1 ? '' : 's'} · ${(streetCorridorWidthMeters / 1000).toFixed(streetCorridorWidthMeters % 1000 ? 1 : 0)} km wide`;
    if (areaMode === 'shape') return `${selectedBoundaryIds.length} ${selectedBoundaryIds.length === 1 ? 'boundary' : 'boundaries'} selected`;
    if (areaMode === 'polygon') return `${selectedPolygonIds.length} ${selectedPolygonIds.length === 1 ? 'polygon' : 'polygons'} selected`;
    return `${selectedCircleIds.length} circle${selectedCircleIds.length === 1 ? '' : 's'} selected`;
  };

  const isSearchAreaReady = areaMode === 'coords'
    ? Boolean(parseCoordsList()?.length && (parseCoordsList()?.length || 0) <= MAX_SEARCH_AREAS)
    : areaMode === 'shape'
      ? selectedBoundaryIds.length > 0 && selectedBoundaryIds.length <= MAX_SEARCH_AREAS && selectedBoundaryIds.every((id) => drawnBoundaries.some((feature) => feature.id === id))
      : areaMode === 'polygon'
        ? selectedPolygonIds.length > 0 && selectedPolygonIds.length <= MAX_SEARCH_AREAS && selectedPolygonIds.every((id) => drawnPolygons.some((feature) => feature.id === id))
      : areaMode === 'isochrone'
        ? Boolean(features.some((feature) => feature.id === activeIsochroneFeatureId))
        : areaMode === 'street'
          ? selectedStreetRoutes.length > 0 && selectedStreetRoutes.length <= MAX_SEARCH_AREAS
          : selectedCircleIds.length > 0 && selectedCircleIds.length <= MAX_SEARCH_AREAS && selectedCircleIds.every((id) => drawnCircles.some((feature) => feature.id === id));

  const handleStartStreetRoute = () => {
    streetRouteIdsBeforeDrawRef.current = new Set(drawnStreetRoutes.map((route) => route.id));
    streetRouteDrawStartedRef.current = false;
    streetRouteDrawPendingRef.current = true;
    setAreaMode('street');
    setActiveTool('route');
    setToast('Click the map to place point A, then point B. Double-click to finish the route.');
  };

  // The AI needs the selected area mode, not the user's precise coordinates.
  const getSearchAreaContextForAI = () => {
    if (areaMode === 'coords') return `within ${(radiusMeters / 1000).toFixed(1)} km of ${parseCoordsList()?.length || 0} selected map location(s)`;
    if (areaMode === 'isochrone') return `within the selected ${isochroneMinutes}-minute ${isochroneProfile} travel area`;
    if (areaMode === 'street') return `within a ${(streetCorridorWidthMeters / 1000).toFixed(streetCorridorWidthMeters % 1000 ? 1 : 0)} km-wide corridor along ${selectedStreetRoutes.length} street route(s)`;
    if (areaMode === 'shape') return `within ${selectedBoundaryIds.length} selected map boundary/boundaries`;
    if (areaMode === 'polygon') return `within ${selectedPolygonIds.length} selected drawn polygon(s)`;
    return `within ${selectedCircleIds.length} selected map circle(s)`;
  };

  const getPresetCatalog = () => Object.entries(POI_CONFIG).flatMap(([category, items]) =>
    items.map(([label, tag]) => ({ label, category, tag }))
  );

  const submitSearchBuilder = async (answer: string) => {
    const text = answer.trim();
    if (!text || isBuilderLoading) return;

    const nextMessages: SearchBuilderMessage[] = [...builderMessages, { role: 'user', content: text }];
    const requestId = ++builderRequestIdRef.current;
    pendingAutoRunRef.current = false;
    autoRunAreaNoticeRef.current = false;
    setBuilderMessages(nextMessages);
    setBuilderInput('');
    setBuilderQuestion('');
    setBuilderOptions([]);
    setBuilderReady(false);
    setBuilderPlaces([]);
    setBuilderWarnings([]);
    setIsBuilderLoading(true);

    try {
      const response = await fetch('/api/ai/search-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.slice(-12),
          areaSummary: getSearchAreaContextForAI(),
        }),
      });
      const data = await response.json();
      if (requestId !== builderRequestIdRef.current) return;
      if (!response.ok) throw new Error(data?.error || 'Search helper is temporarily unavailable.');
      if (typeof data?.message !== 'string' || !data.message.trim()) throw new Error('The search helper returned an unreadable response.');

      if (data.status === 'clarification' && typeof data.question === 'string' && data.question.trim() && Array.isArray(data.options)) {
        const options = data.options.filter((option: unknown): option is string => typeof option === 'string' && option.trim().length > 0).slice(0, 5);
        setBuilderMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
        setBuilderQuestion(data.question);
        setBuilderOptions(options);
        return;
      }
      if (data.status !== 'ready' || !Array.isArray(data.places)) {
        throw new Error('The search helper could not prepare a safe search. Please try again.');
      }
      const placesAreValid = data.places.length > 0 && data.places.every((place: any) =>
        typeof place?.label === 'string' && place.label.trim().length > 0 &&
        Array.isArray(place.filters) && place.filters.length > 0 &&
        place.filters.every((filter: any) => typeof filter?.key === 'string' && filter.key.trim() && typeof filter?.value === 'string' && filter.value.trim())
      );
      if (!placesAreValid) throw new Error('The search helper returned incomplete place details. Please try again.');

      const knownTags = new Map<string, string>();
      getPresetCatalog().forEach(({ tag }) => {
        const exactMatch = tag.match(/^"([^"]+)"="([^"]+)"$/);
        if (exactMatch) knownTags.set(`${exactMatch[1]}=${exactMatch[2]}`, tag);
      });
      const knownSelected: string[] = [];
      const customGroups: Array<{ filters: Array<{ key: string; value: string }> }> = [];
      const places: SearchBuilderPlace[] = data.places.flatMap((place: any) => {
        const placeFilters = place.filters.filter((filter: any) =>
          typeof filter?.key === 'string' && typeof filter?.value === 'string'
        );
        // A multi-filter place is conjunctive; preserve it intact even if one filter matches a preset.
        const presetTag = placeFilters.length === 1
          ? knownTags.get(`${placeFilters[0].key}=${placeFilters[0].value}`)
          : undefined;
        if (presetTag) knownSelected.push(presetTag);
        else if (placeFilters.length) customGroups.push({ filters: placeFilters });
        return [{ label: place.label, filters: place.filters }];
      });
      if (places.length === 0 || (knownSelected.length === 0 && customGroups.length === 0)) {
        throw new Error('No searchable place types were returned. Please adjust your request.');
      }

      setBuilderMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
      setSelectedTags(Array.from(new Set(knownSelected)));
      setCustomFilterGroups(customGroups.filter((group, index, all) => all.findIndex((item) => JSON.stringify(item.filters) === JSON.stringify(group.filters)) === index));
      setBuilderPlaces(places);
      setBuilderWarnings(Array.isArray(data.warnings) ? data.warnings.filter((warning: unknown): warning is string => typeof warning === 'string') : []);
      pendingAutoRunRef.current = true;
      setBuilderReady(true);
    } catch (error: any) {
      if (requestId !== builderRequestIdRef.current) return;
      setToast(error?.message || 'Could not prepare that search. Please try again.');
    } finally {
      if (requestId === builderRequestIdRef.current) setIsBuilderLoading(false);
    }
  };

  const applyPresetSelection = () => {
    if (isBuilderLoading) return;
    const catalog = getPresetCatalog();
    const selected = catalog.filter((item) => presetDraftTags.includes(item.tag));
    if (!selected.length) {
      setToast('Choose at least one place type from the presets.');
      return;
    }
    setSelectedTags(presetDraftTags);
    setCustomFilterGroups([]);
    setBuilderPlaces(selected.map(({ label }) => ({ label, filters: [] })));
    setBuilderWarnings([]);
    setBuilderReady(true);
    setBuilderQuestion('');
    setBuilderOptions([]);
    setBuilderInput('');
    setBuilderMessages([{ role: 'assistant', content: `Selected ${selected.length} place type${selected.length === 1 ? '' : 's'} from presets. Review your search below.` }]);
    setShowPresetPicker(false);
  };

  // Direct Circle Polygon Tool activator
  const handleStartDrawingCircle = () => {
    setActiveTool('circle');
    setToast('Click center on map, then move cursor and click edge to define radius.');
  };

  // Cancel in-flight scan
  const handleCancelScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsScanning(false);
    setToast('Trade area scan cancelled.');
  };

  // Clear / Reset all scan results
  const handleClearScan = () => {
    if (isScanning && abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsScanning(false);
    setScannedPois([]);
    setCategoryBreakdown({});
    setAiData(null);
    setQaMessages([]);
    setActiveCinematicCluster(null);

    if (activeIsochroneFeatureId) {
      removeFeature(activeIsochroneFeatureId);
      setActiveIsochroneFeatureId(null);
    }
    if (activeBufferFeatureId) {
      removeFeature(activeBufferFeatureId);
      setActiveBufferFeatureId(null);
    }
    if (centerMarkerId) {
      removeFeature(centerMarkerId);
      setCenterMarkerId(null);
    }

    if (customGroups['Trade Area Scan']?.ids?.length) {
      customGroups['Trade Area Scan'].ids.forEach((id) => removeFeature(id));
      const nextGroups = { ...customGroups };
      delete nextGroups['Trade Area Scan'];
      setCustomGroups(nextGroups);
    }

    setToast('Trade area scan results and markers cleared.');
  };

  // Generate Mapbox Isochrone Catchment Polygon
  const handleGenerateIsochrone = async () => {
    const parsed = parseCoords();
    if (!parsed) {
      setToast('Invalid coordinates. Set target center coordinates first.');
      return;
    }

    setIsGeneratingIsochrone(true);
    setToast(`Generating ${isochroneMinutes}-min ${isochroneProfile} catchment via Mapbox...`);

    try {
      const res = await fetch('/api/gis/isochrone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lon: parsed.lon,
          lat: parsed.lat,
          minutes: isochroneMinutes,
          profile: isochroneProfile,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.feature) {
        throw new Error(data.error || 'Failed to compute travel catchment');
      }

      // Sync Center Target Marker
      const cId = centerMarkerId || Date.now() + 9999;
      const centerIconKey = mapInstance
        ? getIconKey('center-pinball', '#ffffff', mapInstance)
        : 'ico_center-pinball_ffffff';

      addFeature({
        id: cId,
        name: `Catchment Origin (${parsed.lat.toFixed(4)}, ${parsed.lon.toFixed(4)})`,
        kind: 'marker',
        geometry: { type: 'Point', coordinates: [parsed.lon, parsed.lat] },
        props: {
          shape: 'center-pinball',
          color: '#ffffff',
          iconSize: 1.1,
          iconKey: centerIconKey,
          visible: 1,
          attributes: {
            Type: 'Travel Catchment Origin',
            Latitude: parsed.lat.toFixed(5),
            Longitude: parsed.lon.toFixed(5),
            Mode: isochroneProfile,
          },
        },
      });
      setCenterMarkerId(cId);

      // Add Catchment Polygon Feature
      const isoId = activeIsochroneFeatureId || Date.now() + 7777;
      const catchmentFeature: GISFeature = {
        id: isoId,
        name: `${isochroneMinutes}-Min ${isochroneProfile.toUpperCase()} Catchment`,
        kind: 'polygon',
        geometry: data.feature.geometry,
        props: {
          color: '#ffffff',
          fillColor: '#ffffff',
          fillOpacity: 0.04,
          borderColor: '#ffffff',
          borderOpacity: 0.85,
          width: 1.75,
          visible: 1,
          attributes: {
            Type: 'Mapbox Travel Catchment',
            Mode: isochroneProfile,
            Duration: `${isochroneMinutes} minutes`,
            Center: `${parsed.lat.toFixed(5)}, ${parsed.lon.toFixed(5)}`,
            Engine: data.source === 'mapbox' ? 'Mapbox API (Dual Token)' : 'Road-Adaptive Geometry',
          },
        },
      };

      addFeature(catchmentFeature);
      setActiveIsochroneFeatureId(isoId);

      // Fit camera to catchment polygon bounds
      if (mapInstance && data.feature.geometry.coordinates?.[0]) {
        const ring = data.feature.geometry.coordinates[0];
        let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
        ring.forEach(([pLon, pLat]: [number, number]) => {
          if (pLon < minLon) minLon = pLon;
          if (pLon > maxLon) maxLon = pLon;
          if (pLat < minLat) minLat = pLat;
          if (pLat > maxLat) maxLat = pLat;
        });
        mapInstance.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 80, duration: 1200 });
      }

      setToast(`Generated ${isochroneMinutes}-min ${isochroneProfile} catchment! Click "SCAN AREA" to discover POIs inside.`);
    } catch (err: any) {
      console.error(err);
      setToast(`Catchment error: ${err.message}`);
    } finally {
      setIsGeneratingIsochrone(false);
    }
  };

  // Execute Trade Area Scan
  const handleRunScan = async () => {
    if (!builderReady || (selectedTags.length === 0 && customFilterGroups.length === 0)) {
      setToast('Describe the places you want or choose them from presets, then review the search.');
      return;
    }

    type SearchArea = { kind: 'coordinates'; lat: number; lon: number; radius: number; label: string } | { kind: 'polygon'; feature: GISFeature; label: string; focus?: { lat: number; lon: number; radius: number } };
    const searchAreas: SearchArea[] = [];

    if (areaMode === 'coords') {
      const points = parseCoordsList();
      if (!points) {
        setToast('Enter valid coordinates, one “latitude, longitude” pair per line.');
        return;
      }
      points.forEach(({ lat, lon }, index) => searchAreas.push({ kind: 'coordinates', lat, lon, radius: radiusMeters, label: `Location ${index + 1} · ${lat.toFixed(4)}, ${lon.toFixed(4)}` }));
      if (points.length === 1) syncTargetRadiusGraphics(points[0].lat, points[0].lon, radiusMeters);
    } else if (areaMode === 'isochrone') {
      const activeIso = features.find((f) => f.id === activeIsochroneFeatureId);
      if (!activeIso) {
        setToast('Generate a travel catchment first before scanning.');
        return;
      }
      searchAreas.push({ kind: 'polygon', feature: activeIso, label: activeIso.name });
    } else if (areaMode === 'shape') {
      const targets = selectedBoundaryIds.map((id) => drawnBoundaries.find((feature) => feature.id === id)).filter((feature): feature is GISFeature => Boolean(feature));
      if (!targets.length || targets.length !== selectedBoundaryIds.length) {
        setToast('Select one or more searched boundaries before searching.');
        return;
      }
      targets.forEach((feature) => searchAreas.push({ kind: 'polygon', feature, label: feature.name }));
    } else if (areaMode === 'polygon') {
      const targets = selectedPolygonIds.map((id) => drawnPolygons.find((feature) => feature.id === id)).filter((feature): feature is GISFeature => Boolean(feature));
      if (!targets.length || targets.length !== selectedPolygonIds.length) {
        setToast('Draw and select one or more polygons before searching.');
        return;
      }
      targets.forEach((feature) => searchAreas.push({ kind: 'polygon', feature, label: feature.name }));
    } else if (areaMode === 'street') {
      const targets = selectedStreetRouteIds.map((id) => drawnStreetRoutes.find((route) => route.id === id)).filter((route): route is GISFeature => Boolean(route));
      if (!targets.length || targets.length !== selectedStreetRouteIds.length) {
        setToast('Draw and select at least one street route before searching.');
        return;
      }
      for (const route of targets) {
        const corridor = turfBuffer({ type: 'Feature', properties: {}, geometry: route.geometry as any } as any, streetCorridorWidthMeters / 2, { units: 'meters' });
        if (!corridor || !('geometry' in corridor) || corridor.geometry.type !== 'Polygon') {
          setToast(`Atlas could not create a search corridor around ${route.name}. Try drawing the route again.`);
          return;
        }
        searchAreas.push({
          kind: 'polygon',
          label: `${route.name} · ${streetCorridorWidthMeters} m corridor`,
          feature: {
            ...route,
            kind: 'polygon',
            name: `${route.name} · ${streetCorridorWidthMeters} m corridor`,
            geometry: corridor.geometry as any,
          },
        });
      }
    } else {
      const targets = selectedCircleIds.map((id) => drawnCircles.find((feature) => feature.id === id)).filter((feature): feature is GISFeature => Boolean(feature));
      if (!targets.length || targets.length !== selectedCircleIds.length) {
        setToast('Select one or more drawn circles before searching.');
        return;
      }
      targets.forEach((circle) => {
        const center = circle.props?.centerCoord || (circle.geometry.type === 'Polygon' && circle.geometry.coordinates?.[0]?.[0]
          ? [circle.geometry.coordinates[0][0][0], circle.geometry.coordinates[0][0][1]] as [number, number]
          : null);
        if (circle.geometry.type === 'Polygon' && circle.geometry.coordinates?.[0]?.length >= 4) {
          searchAreas.push({ kind: 'polygon', feature: circle, label: circle.name, focus: center ? { lon: center[0], lat: center[1], radius: circle.props?.radiusMeters || 1000 } : undefined });
        }
      });
    }

    if (!searchAreas.length) {
      setToast('Choose at least one search area.');
      return;
    }
    if (searchAreas.length > MAX_SEARCH_AREAS) {
      setToast(`Choose up to ${MAX_SEARCH_AREAS} areas per scan to keep searches responsive.`);
      return;
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsScanning(true);
    setActiveWorkflowStep(3);
    setAreaDetailsOpen(false);
    setResultsExpanded(true);
    setToast(`Searching ${searchAreas.length} area${searchAreas.length === 1 ? '' : 's'} for ${selectedTags.length + customFilterGroups.length} place types...`);

    let areaResults: Array<{ label: string; result: ScanResult }> = [];
    try {
      for (const area of searchAreas) {
        if (signal.aborted) break;
        const areaResult = area.kind === 'polygon'
          ? await scanTradeAreaPolygon(area.feature, selectedTags, signal, customFilterGroups)
          : await scanTradeAreaCoordinates(area.lat, area.lon, area.radius, selectedTags, signal, customFilterGroups);
        if (areaResult) areaResults.push({ label: area.label, result: areaResult });
      }
    } catch (e: any) {
      if (e.name === 'AbortError' || signal.aborted) {
        setToast('Scan cancelled.');
        setIsScanning(false);
        return;
      }
      console.error(e);
      setToast(e instanceof Error ? e.message : 'Atlas could not load place data just now. Please try the search again in a moment.');
      return;
    } finally {
      setIsScanning(false);
      abortControllerRef.current = null;
    }

    if (signal.aborted) {
      setToast('Scan cancelled.');
      return;
    }

    const uniquePois = new Map<string, ScannedPOI>();
    areaResults.forEach(({ label, result: areaResult }) => areaResult.features.forEach((poi) => {
      const normalizedName = poi.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      const key = `${normalizedName}|${poi.lat.toFixed(6)}|${poi.lon.toFixed(6)}`;
      const existing = uniquePois.get(key);
      if (existing) {
        existing.searchAreaLabels = Array.from(new Set([...(existing.searchAreaLabels || []), label]));
      } else {
        uniquePois.set(key, { ...poi, searchAreaLabels: [label] });
      }
    }));
    const result: ScanResult = {
      features: Array.from(uniquePois.values()),
      counts: {},
      categoryCounts: {},
    };
    result.features.forEach((poi) => {
      result.counts[poi.type] = (result.counts[poi.type] || 0) + 1;
      result.categoryCounts[poi.category] = (result.categoryCounts[poi.category] || 0) + 1;
    });

    if (!result.features.length) {
      setToast('No matching POIs found within this area. Try expanding your radius or selecting tags.');
      setScannedPois([]);
      setCategoryBreakdown({});
      return;
    }

    setScannedPois(result.features);
    setCategoryBreakdown(result.categoryCounts);

    const pointArea = searchAreas.find((area): area is Extract<SearchArea, { kind: 'coordinates' }> => area.kind === 'coordinates');
    const circleArea = searchAreas.find((area): area is Extract<SearchArea, { kind: 'polygon' }> => area.kind === 'polygon' && Boolean(area.focus))?.focus;
    const mapFocus = pointArea ? { lon: pointArea.lon, lat: pointArea.lat, radius: pointArea.radius } : circleArea;
    if (mapInstance && mapFocus) {
      mapInstance.easeTo({ center: [mapFocus.lon, mapFocus.lat], zoom: mapFocus.radius > 5000 ? 12 : 14, duration: 1200 });
    }

    let updatedGroups = { ...customGroups };
    if (!updatedGroups['Trade Area Scan']) {
      updatedGroups['Trade Area Scan'] = { collapsed: false, ids: [] };
    }

    const groupIds = [...updatedGroups['Trade Area Scan'].ids];

    result.features.forEach((poi, idx) => {
      const poiId = Date.now() + idx + 1;
      const color = CATEGORY_COLORS[poi.category] || globalMarkerColor;
      const iconKey = mapInstance
        ? getIconKey(globalMarkerStyle, color, mapInstance)
        : `ico_${globalMarkerStyle}_${color.replace('#', '')}`;

      addFeature({
        id: poiId,
        name: poi.name,
        kind: 'marker',
        geometry: { type: 'Point', coordinates: [poi.lon, poi.lat] },
        props: {
          shape: globalMarkerStyle,
          color,
          iconSize: globalMarkerSize / 20,
          iconKey,
          visible: 1,
          category: poi.category,
          poiType: poi.type,
          managedBy: 'open-node',
          osmTags: poi.tags,
          osmType: poi.osmType,
          osmId: poi.osmId,
          searchAreaLabels: poi.searchAreaLabels,
          attributes: {
            Name: poi.name,
            Category: poi.category,
            Type: poi.type,
            Latitude: poi.lat.toFixed(6),
            Longitude: poi.lon.toFixed(6),
            ...(poi.osmType && poi.osmId != null ? { 'OSM element': `${poi.osmType}/${poi.osmId}` } : {}),
            'Search area': (poi.searchAreaLabels || []).join('; '),
          },
        },
      });
      groupIds.push(poiId);
    });

    updatedGroups['Trade Area Scan'].ids = groupIds;
    setCustomGroups(updatedGroups);

    setToast(`Found and mapped ${result.features.length} POIs!`);
  };

  useEffect(() => {
    if (!pendingAutoRunRef.current || !builderReady) return;
    if (!isSearchAreaReady) {
      setActiveWorkflowStep(1);
      if (!autoRunAreaNoticeRef.current) {
        setToast('Your place search is ready. Select or finish a search area and Atlas will start the scan automatically.');
        autoRunAreaNoticeRef.current = true;
      }
      return;
    }
    pendingAutoRunRef.current = false;
    autoRunAreaNoticeRef.current = false;
    void handleRunScan();
  }, [builderReady, isSearchAreaReady, activeWorkflowStep, handleRunScan]);

  // Apply global styling to all scanned features
  const handleApplyGlobalStyle = (style: MarkerShape) => {
    setGlobalMarkerStyle(style);
    activeScannedFeatures.forEach((f) => {
      const color = f.props.color || '#ffffff';
      const iconKey = mapInstance ? getIconKey(style, color, mapInstance) : undefined;
      updateFeature(f.id, (prev) => ({
        ...prev,
        props: {
          ...prev.props,
          shape: style,
          iconKey: iconKey || prev.props.iconKey,
        },
      }));
    });
    setToast(`Applied ${style} style to all scanned POIs.`);
  };

  const handleApplyAmenityStyle = (feats: GISFeature[], updates: PoiGroupStyle) => {
    const ids = new Set(feats.map((feature) => feature.id));
    setFeatures(features.map((feature) => {
      if (!ids.has(feature.id)) return feature;
      return { ...feature, props: { ...feature.props, ...updates, iconKey: updates.color !== undefined || updates.shape !== undefined ? undefined : feature.props.iconKey, managedBy: 'open-node' } };
    }), false);
  };

  const handleRenameAmenityGroup = (feats: GISFeature[], nextName: string) => {
    const label = nextName.trim();
    if (!label) return;
    const ids = new Set(feats.map((feature) => feature.id));
    setFeatures(features.map((feature) => ids.has(feature.id)
      ? { ...feature, props: { ...feature.props, amenityGroupLabel: label, managedBy: 'open-node' } }
      : feature), false);
    setEditingAmenityGroup(null);
    setToast(`Renamed amenity group to “${label}”.`);
  };

  const handleUpdatePoi = (featureId: number, updates: { name?: string; color?: string; shape?: MarkerShape; iconSize?: number; visible?: number }) => {
    const { name, ...styleUpdates } = updates;
    const existingFeature = features.find((feature) => feature.id === featureId);
    updateFeature(featureId, (feature) => ({
      ...feature,
      name: name ?? feature.name,
      props: {
        ...feature.props,
        ...styleUpdates,
        attributes: name === undefined ? feature.props.attributes : { ...feature.props.attributes, Name: name },
        managedBy: 'open-node',
      },
    }));
    if (name !== undefined && existingFeature?.props.poiType && existingFeature.geometry.type === 'Point') {
      const [lon, lat] = existingFeature.geometry.coordinates as [number, number];
      setScannedPois((previous) => previous.map((poi) => poi.type === existingFeature.props.poiType && poi.lon === lon && poi.lat === lat ? { ...poi, name } : poi));
    }
  };

  // Batch toggle visibility of a category
  const handleToggleCategoryVisibility = (category: string) => {
    const feats = featuresByCategory[category] || [];
    const isAnyVisible = feats.some((f) => f.props.visible !== 0);
    const nextVis = isAnyVisible ? 0 : 1;

    feats.forEach((f) => {
      updateFeature(f.id, (prev) => ({
        ...prev,
        props: { ...prev.props, visible: nextVis },
      }));
    });
  };

  // Delete all features in a category
  const handleDeleteCategory = (category: string) => {
    const feats = featuresByCategory[category] || [];
    if (confirm(`Remove all ${feats.length} POIs in "${category}"?`)) {
      const removedTypes = new Set(feats.map((feature) => feature.props.poiType).filter(Boolean));
      feats.forEach((f) => removeFeature(f.id));
      setScannedPois((prev) => {
        const nextPois = prev.filter((poi) => !removedTypes.has(poi.type));
        setCategoryBreakdown(nextPois.reduce<Record<string, number>>((counts, poi) => {
          counts[poi.category] = (counts[poi.category] || 0) + 1;
          return counts;
        }, {}));
        return nextPois;
      });
      setToast(`Removed ${feats.length} pins from ${category}.`);
    }
  };

  // Fly to single POI
  const handleFlyToPoi = (f: GISFeature) => {
    if (f.geometry.type !== 'Point') {
      setToast(`Can't locate ${getReadablePoiName(f)} because it has no point location.`);
      return;
    }
    const [longitude, latitude] = f.geometry.coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      setToast(`Can't locate ${getReadablePoiName(f)} because its coordinates are invalid.`);
      return;
    }
    if (!mapInstance) {
      setToast('The map is still loading. Try locating this place again in a moment.');
      return;
    }
    if (f.props.visible === 0) updateFeature(f.id, (previous) => ({ ...previous, props: { ...previous.props, visible: 1 } }));
    try {
      if (openNodeDisplayMode !== 'pins') setOpenNodeDisplayMode('pins');
      mapInstance.flyTo({ center: [longitude, latitude], zoom: 17, duration: 1000 });
      setToast(`Showing ${getReadablePoiName(f)} on the map.`);
    } catch (error) {
      console.error('Unable to focus map on scanned place:', error);
      setToast(`Atlas couldn't move the map to ${getReadablePoiName(f)}.`);
    }
  };

  const handleExportResultsCsv = () => {
    const quote = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const researchColumns = Array.from(new Set(resultTableRows.flatMap(({ researchData }) => Object.keys(researchData)))).sort((a, b) => a.localeCompare(b));
    const header = ['Place', 'Type', 'Address', 'Latitude', 'Longitude', 'Search areas', 'OSM element', ...researchColumns];
    const rows = resultTableRows.map(({ feature, name, type, address, researchData }) => [
      name,
      type,
      address || 'Not listed',
      feature.geometry.type === 'Point' ? feature.geometry.coordinates[1] : '',
      feature.geometry.type === 'Point' ? feature.geometry.coordinates[0] : '',
      (feature.props.searchAreaLabels || []).join('; '),
      feature.props.osmType && feature.props.osmId ? `${feature.props.osmType}/${feature.props.osmId}` : '',
      ...researchColumns.map((column) => formatResearchValue(researchData[column])),
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(quote).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `trade_area_places_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShowExportMenu(false);
    setToast(`Exported ${rows.length} places to an Excel-compatible CSV file.`);
  };

  const handleExportResearchPack = () => {
    const records = resultTableRows
      .filter(({ feature }) => typeof feature.props.osmType === 'string' && Number.isInteger(feature.props.osmId))
      .map(({ feature, name, address, researchData }) => ({
        osmType: feature.props.osmType,
        osmId: feature.props.osmId,
        name,
        address: address || null,
        coordinates: feature.geometry.type === 'Point'
          ? { lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0] }
          : null,
        researchData,
      }));
    const pack = {
      format: 'project-atlas.poi-research',
      version: 1,
      prompt: [
        'Research each listed cafe independently using public sources that permit this use, prioritizing the business website and published menu.',
        'Do not scrape Google Maps, bypass access controls, or invent details. If evidence is unavailable, use unknown/not_found and leave prices empty.',
        'Preserve osmType and osmId exactly. Never merge different OSM IDs, even when names match. Return one record per input record.',
        'Put all new flexible fields under researchData. For each record, include vietnameseCoffeeStatus (confirmed, not_found, or unclear), vietnameseCoffeeItems (array), menuPrices (array of objects with item, amount, currency, size, and sourceUrl), researchSources (array of objects with url and title), researchCheckedAt (YYYY-MM-DD), and researchConfidence (high, medium, or low).',
        'Return only valid JSON using the same format and version, with records containing osmType, osmId, and researchData. Do not change the OSM identity fields.',
      ].join('\n'),
      records,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `atlas_poi_research_${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(`Exported ${records.length} POIs with an AI research prompt.`);
  };

  const handleImportResearchFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setToast('Research JSON is too large. Import a file under 10 MB.');
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The file must contain a JSON object.');
      const pack = parsed as { format?: unknown; version?: unknown; records?: unknown };
      if (pack.format !== 'project-atlas.poi-research' || pack.version !== 1 || !Array.isArray(pack.records)) {
        throw new Error('This is not a supported Atlas POI research file. Export a fresh AI pack and use its format.');
      }
      if (pack.records.length > 10000) throw new Error('The file contains too many records.');

      const incoming = new Map<string, Record<string, unknown>>();
      for (const recordValue of pack.records) {
        if (!recordValue || typeof recordValue !== 'object' || Array.isArray(recordValue)) continue;
        const record = recordValue as { osmType?: unknown; osmId?: unknown; researchData?: unknown };
        if (typeof record.osmType !== 'string' || !record.osmType.trim() || !Number.isInteger(record.osmId) || !record.researchData || typeof record.researchData !== 'object' || Array.isArray(record.researchData) || !isSafeResearchValue(record.researchData)) continue;
        incoming.set(`${record.osmType.toLowerCase()}/${record.osmId}`, record.researchData as Record<string, unknown>);
      }
      if (!incoming.size) throw new Error('No records with OSM IDs and researchData were found.');

      let matchedFeatures = 0;
      const nextFeatures = features.map((feature) => {
        const key = `${feature.props.osmType?.toLowerCase()}/${feature.props.osmId}`;
        const researchData = incoming.get(key);
        if (!researchData || feature.props.managedBy !== 'open-node') return feature;
        matchedFeatures += 1;
        return { ...feature, props: { ...feature.props, researchData: { ...(feature.props.researchData || {}), ...researchData } } };
      });
      if (!matchedFeatures) throw new Error('None of the OSM IDs in this file match the current Open Node results.');
      setFeatures(nextFeatures);
      setToast(`Imported research for ${matchedFeatures} POIs. New research fields now appear as table columns.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not import this research JSON.');
    }
  };

  // Fly to Commercial Cluster
  const handleFlyToCluster = (cluster: CommercialCluster) => {
    if (mapInstance && cluster.center) {
      mapInstance.flyTo({
        center: [cluster.center[1], cluster.center[0]],
        zoom: 16.5,
        duration: 1200,
      });
      setActiveCinematicCluster(cluster.name);
      setToast(`Focused on cluster: ${cluster.name}`);
    }
  };

  // Export to GeoJSON
  const handleExportGeoJSON = () => {
    const visibleFeats = activeScannedFeatures.filter((f) => f.props.visible !== 0);
    const geojson = {
      type: 'FeatureCollection',
      features: visibleFeats.map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: f.id,
          name: f.name,
          category: f.props.category,
          type: f.props.poiType,
          ...f.props.attributes,
        },
      })),
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade_area_pois_${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    setToast(`Exported ${visibleFeats.length} POIs to GeoJSON!`);
  };

  // Export to KML (Google Earth)
  const handleExportKML = () => {
    const visibleFeats = activeScannedFeatures.filter((f) => f.props.visible !== 0);
    const kmlData = visibleFeats.map((f) => ({
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      name: f.name,
      type: f.props.poiType || f.props.category || 'Node',
      visible: true,
    }));

    const kmlString = compileFeaturesKml(kmlData);
    const blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade_area_pois_${Date.now()}.kml`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    setToast(`Exported ${visibleFeats.length} POIs to KML!`);
  };

  // DeepSeek AI Insights trigger
  const handleTriggerAiAnalysis = async () => {
    if (scannedPois.length === 0) {
      setToast('Run a POI scan first to provide data for the AI analysis.');
      return;
    }

    setIsAiLoading(true);
    try {
      const parsed = parseCoords();
      const centerCoords = parsed ? [parsed.lat, parsed.lon] : [14.5995, 120.9842];

      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pois: scannedPois.slice(0, 150).map((p) => ({
            name: p.name,
            type: p.type,
            category: p.category,
            street: p.tags?.['addr:street'] || p.tags?.street,
            city: p.tags?.['addr:city'],
            suburb: p.tags?.['addr:suburb'] || p.tags?.neighbourhood || p.tags?.place,
            lat: p.lat,
            lon: p.lon,
            tags: p.tags,
          })),
          center: centerCoords,
          summary: categoryBreakdown,
          radiusMeters,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate AI insights');
      }

      setAiData(data);
      setToast('Spatial AI commercial analysis complete!');
    } catch (e: any) {
      console.error(e);
      setToast(e.message || 'Error running AI analysis');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Copy report
  const handleCopyReport = () => {
    if (!aiData) return;
    const text = aiData.rawMarkdown || JSON.stringify(aiData, null, 2);
    navigator.clipboard.writeText(text);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
    setToast('Commercial dossier copied to clipboard!');
  };

  // Send interactive Spatial Q&A message
  const handleSendQaMessage = async (queryText?: string) => {
    const text = (queryText || qaInput).trim();
    if (!text || isQaLoading) return;

    if (scannedPois.length === 0) {
      setToast('Please scan an area first so the AI has real spatial data to answer from.');
      return;
    }

    const userMsg: QAMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setQaMessages((prev) => [...prev, userMsg]);
    setQaInput('');
    setIsQaLoading(true);

    try {
      const parsed = parseCoords();
      const centerCoords = parsed ? [parsed.lat, parsed.lon] : [14.5995, 120.9842];

      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          history: qaMessages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
          pois: scannedPois.slice(0, 150).map((p) => ({
            name: p.name,
            type: p.type,
            category: p.category,
            street: p.tags?.['addr:street'] || p.tags?.street,
            city: p.tags?.['addr:city'],
            suburb: p.tags?.['addr:suburb'] || p.tags?.neighbourhood || p.tags?.place,
            lat: p.lat,
            lon: p.lon,
            tags: p.tags,
          })),
          center: centerCoords,
          summary: categoryBreakdown,
          radiusMeters,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to formulate response');
      }

      const assistantMsg: QAMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'No analysis generated.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setQaMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error(err);
      const errorMsg: QAMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err.message || 'Unable to analyze spatial query. Please try again.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setQaMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsQaLoading(false);
    }
  };

  if (!activePanels.tradeArea) return null;

  return (
    <div className="fixed top-16 left-4 bottom-4 w-[480px] max-w-[calc(100vw-2rem)] z-[1000] bg-zinc-950/85 border border-white/10 rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-2xl flex flex-col overflow-hidden text-xs text-zinc-300 animate-in fade-in slide-in-from-left-4 select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-white shadow-inner">
            <Radar className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-sm tracking-tight leading-none">
                Open Node
              </h3>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/20 uppercase font-mono font-bold tracking-wider">
                Spatial Engine
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
              OpenStreetMap place search & area analysis
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1.5 relative">
          {/* Export Dropdown Trigger */}
          {activeScannedFeatures.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-300 hover:text-white transition flex items-center gap-1 text-[11px] font-medium"
                title="Export Data"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-zinc-950 border border-white/15 rounded-2xl shadow-2xl p-1.5 z-50 backdrop-blur-xl animate-in fade-in">
                  <button
                    type="button"
                    onClick={handleExportResultsCsv}
                    className="w-full text-left px-3 py-2 text-[11px] text-zinc-200 hover:bg-white/10 rounded-xl transition flex items-center gap-2 font-medium"
                  >
                    <Table2 className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Excel-compatible table (CSV)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportGeoJSON}
                    className="w-full text-left px-3 py-2 text-[11px] text-zinc-200 hover:bg-white/10 rounded-xl transition flex items-center gap-2 font-medium"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400" />
                    <span>GeoJSON FeatureCollection</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportKML}
                    className="w-full text-left px-3 py-2 text-[11px] text-zinc-200 hover:bg-white/10 rounded-xl transition flex items-center gap-2 font-medium"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Google Earth (KML)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Reset Scan */}
          {(activeScannedFeatures.length > 0 || scannedPois.length > 0) && (
            <button
              type="button"
              onClick={handleClearScan}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-400 hover:text-white transition"
              title="Clear all scan results and pins"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Close Sidebar */}
          <button
            onClick={() => togglePanel('tradeArea', false)}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition"
            title="Close Sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Guided workflow */}
      <div className="px-5 pt-3.5 pb-2 shrink-0">
        <div role="tablist" aria-label="Open Node workflow" className="flex gap-1 rounded-2xl border border-white/10 bg-black/60 p-1">
          {([
            { id: 1 as const, label: '1 · Area' },
            { id: 2 as const, label: '2 · Places' },
            { id: 3 as const, label: `3 · Results${activeScannedFeatures.length ? ` (${activeScannedFeatures.length})` : ''}` },
          ]).map((step) => <button key={step.id} type="button" role="tab" aria-selected={activeWorkflowStep === step.id} onClick={() => { setActiveWorkflowStep(step.id); setShowPresetPicker(false); }} className={`min-w-0 flex-1 truncate rounded-xl px-2 py-2 text-[10px] font-bold transition ${activeWorkflowStep === step.id ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>{step.label}</button>)}
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4">
        {/* =========================================================================
            TAB 1: TARGET DEFINITION, COMPACT POI TAXONOMY, & MAPPED ASSETS
           ========================================================================= */}
        {activeTab === 'target_layers' && (
          <div className="space-y-4">
            {activeWorkflowStep === 1 && <>
            {/* Target Area Definition Card */}
            <div className={`bg-white/[0.02] border border-white/10 rounded-2xl p-3.5 space-y-3 shrink-0 backdrop-blur-xl ${activeWorkflowStep === 1 ? '' : 'hidden'}`}>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setAreaDetailsOpen((open) => !open)} aria-expanded={areaDetailsOpen} className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5 text-left">
                  {areaDetailsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <Crosshair className="w-3.5 h-3.5 text-cyan-300" />
                  <span>01 · Search area</span>
                </button>
                {!areaDetailsOpen && <span className="text-[10px] text-zinc-400 truncate max-w-[210px]">{getAreaLabel()}</span>}
              </div>

              {areaDetailsOpen && <div className="space-y-3">
                <div className="flex flex-wrap gap-1 p-0.5 bg-black/60 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setAreaMode('coords')}
                    className={`order-4 px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                      areaMode === 'coords'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Coordinates
                  </button>
                  <button
                    type="button"
                    onClick={() => setAreaMode('circle')}
                    className={`order-3 px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                      areaMode === 'circle'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Circle
                  </button>
                  <button
                    type="button"
                    onClick={() => setAreaMode('shape')}
                    className={`order-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                      areaMode === 'shape'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Boundary
                  </button>
                  <button
                    type="button"
                    onClick={() => setAreaMode('polygon')}
                    className={`order-2 px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                      areaMode === 'polygon'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Polygon
                  </button>
                  <button
                    type="button"
                    onClick={() => setAreaMode('street')}
                    className={`order-5 px-2 py-0.5 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                      areaMode === 'street' ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Route className="w-3 h-3" />
                    <span>Street</span>
                  </button>
                </div>

              {/* Coordinates Mode */}
              {areaMode === 'coords' && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                        Search center (latitude, longitude)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSetFromMapCenter}
                          className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-[9px] text-zinc-300 hover:text-white font-semibold transition"
                        >
                          Map Center
                        </button>
                        <button
                          type="button"
                          onClick={handleSetFromCurrentLocation}
                          className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-[9px] text-zinc-300 hover:text-white font-semibold transition"
                        >
                          GPS
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={coordsInput}
                      onChange={(e) => setCoordsInput(e.target.value)}
                      placeholder={'14.5995, 120.9842\n14.6100, 120.9900'}
                      aria-label="Search coordinates, one latitude and longitude pair per line"
                      className="w-full resize-y bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white font-mono text-xs outline-none focus:border-white/40 transition backdrop-blur-sm"
                    />
                    <p className={`text-[9px] ${((parseCoordsList()?.length || 0) > MAX_SEARCH_AREAS) ? 'text-amber-300' : 'text-zinc-500'}`}>{((parseCoordsList()?.length || 0) > MAX_SEARCH_AREAS) ? `Limit each search to ${MAX_SEARCH_AREAS} locations.` : `Add one location per line, up to ${MAX_SEARCH_AREAS}. Every location uses the radius below.`}</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                        Search Radius
                      </label>
                      <span className="text-[11px] font-mono font-bold text-white">
                        {radiusMeters >= 1000 ? `${(radiusMeters / 1000).toFixed(1)} km` : `${radiusMeters} m`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="100"
                        max="50000"
                        step="100"
                        value={radiusMeters}
                        onChange={(e) => setRadiusMeters(Number(e.target.value))}
                        className="flex-1 accent-white h-1.5 bg-white/10 rounded-lg cursor-pointer"
                      />
                      <input
                        type="number"
                        min="100"
                        max="50000"
                        step="100"
                        value={radiusMeters}
                        onChange={(e) => setRadiusMeters(Math.min(50_000, Math.max(100, Number(e.target.value))))}
                        className="w-20 bg-black/50 border border-white/15 rounded-xl px-2 py-1 text-white font-mono text-xs text-right outline-none focus:border-white/40"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-[10px]">
                    <label className="flex items-center gap-2 text-zinc-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showRadiusGraphics}
                        onChange={(e) => setShowRadiusGraphics(e.target.checked)}
                        className="accent-white rounded"
                      />
                      <span>Display Target Pin & Buffer Circle on Map</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Map Circle Mode */}
              {areaMode === 'circle' && (
                <div className="space-y-2 pt-1">
                  <p className={`text-[9px] ${selectedCircleIds.length > MAX_SEARCH_AREAS ? 'text-amber-300' : 'text-zinc-500'}`}>{selectedCircleIds.length > MAX_SEARCH_AREAS ? `Limit each search to ${MAX_SEARCH_AREAS} circles.` : `Select up to ${MAX_SEARCH_AREAS} circles to search together.`}</p>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {drawnCircles.length ? drawnCircles.map((circle) => <label key={circle.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 px-2.5 py-2 text-[10px] text-zinc-200"><input type="checkbox" checked={selectedCircleIds.includes(circle.id)} onChange={(event) => setSelectedCircleIds((current) => event.target.checked ? [...current, circle.id] : current.filter((id) => id !== circle.id))} className="accent-cyan-300" /><span className="min-w-0 flex-1 truncate">{circle.name}</span><span className="text-zinc-500">{((circle.props?.radiusMeters || 0) / 1000).toFixed(1)} km</span></label>) : <p className="px-1 py-2 text-[10px] text-zinc-500">Draw circles on the map, then select one or more here.</p>}
                  </div>
                  <button type="button" onClick={handleStartDrawingCircle} className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] border border-white/15 transition flex items-center justify-center gap-1.5"><CircleIcon className="w-3.5 h-3.5 text-white" /><span>Draw another circle on map</span></button>
                </div>
              )}

              {/* Search registered OpenStreetMap boundaries */}
              {areaMode === 'shape' && (
                <div className="space-y-2 pt-1">
                  <p className={`text-[9px] ${selectedBoundaryIds.length > MAX_SEARCH_AREAS ? 'text-amber-300' : 'text-zinc-500'}`}>{selectedBoundaryIds.length > MAX_SEARCH_AREAS ? `Limit each search to ${MAX_SEARCH_AREAS} boundaries.` : `Select one boundary or combine up to ${MAX_SEARCH_AREAS} boundaries.`}</p>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Search OpenStreetMap boundaries</label>
                    <form onSubmit={(event) => { event.preventDefault(); void searchBoundaries(); }} className="flex gap-1.5">
                      <input value={boundaryQuery} onChange={(event) => setBoundaryQuery(event.target.value)} placeholder="City, district, or barangay" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-[10px] text-white placeholder-zinc-500 outline-none focus:border-cyan-300/50" />
                      <button type="submit" disabled={isSearchingBoundaries || boundaryQuery.trim().length < 3} className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 text-[10px] font-semibold text-zinc-100 hover:bg-white/15 disabled:opacity-40">{isSearchingBoundaries ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}Search</button>
                    </form>
                    {boundaryResults.length > 0 && <div className="max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-zinc-950">
                      {boundaryResults.map((item, index) => <button key={`${item.place_id || item.osm_id || index}`} type="button" onClick={() => addSearchedBoundary(item)} className="block w-full border-b border-white/5 px-2.5 py-2 text-left last:border-0 hover:bg-white/10">
                        <span className="block truncate text-[10px] font-medium text-zinc-100">{item.display_name}</span><span className="text-[9px] capitalize text-zinc-500">{item.type || item.class || 'boundary'}</span>
                      </button>)}
                    </div>}
                    <p className="text-[9px] text-zinc-500">Choose a result to add it to the map, then check one or more boundaries below.</p>
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {drawnBoundaries.length ? drawnBoundaries.map((shape) => <label key={shape.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 px-2.5 py-2 text-[10px] text-zinc-200"><input type="checkbox" checked={selectedBoundaryIds.includes(shape.id)} disabled={!selectedBoundaryIds.includes(shape.id) && selectedBoundaryIds.length >= MAX_SEARCH_AREAS} onChange={(event) => setSelectedBoundaryIds((current) => event.target.checked ? [...current, shape.id] : current.filter((id) => id !== shape.id))} className="accent-cyan-300" /><span className="min-w-0 flex-1 truncate">{shape.name}</span></label>) : <p className="px-1 py-2 text-[10px] text-zinc-500">Search for a boundary above to add it here.</p>}
                  </div>
                </div>
              )}

              {areaMode === 'polygon' && (
                <div className="space-y-2 pt-1">
                  <p className={`text-[9px] ${selectedPolygonIds.length > MAX_SEARCH_AREAS ? 'text-amber-300' : 'text-zinc-500'}`}>{selectedPolygonIds.length > MAX_SEARCH_AREAS ? `Limit each search to ${MAX_SEARCH_AREAS} polygons.` : `Select one polygon or combine up to ${MAX_SEARCH_AREAS} polygons.`}</p>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {drawnPolygons.length ? drawnPolygons.map((shape) => <label key={shape.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 px-2.5 py-2 text-[10px] text-zinc-200"><input type="checkbox" checked={selectedPolygonIds.includes(shape.id)} disabled={!selectedPolygonIds.includes(shape.id) && selectedPolygonIds.length >= MAX_SEARCH_AREAS} onChange={(event) => setSelectedPolygonIds((current) => event.target.checked ? [...current, shape.id] : current.filter((id) => id !== shape.id))} className="accent-cyan-300" /><span className="min-w-0 flex-1 truncate">{shape.name}</span></label>) : <p className="px-1 py-2 text-[10px] text-zinc-500">Draw custom polygons on the map, then select one or more here.</p>}
                  </div>
                  <button type="button" onClick={() => { setActiveTool('polygon'); setToast('Draw a polygon on the map. Atlas will use it as the search area.'); }} className="w-full rounded-xl border border-white/15 bg-white/10 py-2 text-xs font-semibold text-white transition hover:bg-white/20">
                    {drawnPolygons.length ? 'Draw another polygon' : 'Draw polygon on map'}
                  </button>
                </div>
              )}

              {areaMode === 'street' && (
                <div className="space-y-3 pt-1 animate-in fade-in">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Street corridor width</label>
                      <span className="text-[10px] font-mono font-bold text-white">{streetCorridorWidthMeters >= 1000 ? `${(streetCorridorWidthMeters / 1000).toFixed(streetCorridorWidthMeters % 1000 ? 1 : 0)} km` : `${streetCorridorWidthMeters} m`}</span>
                    </div>
                    <input type="range" min={100} max={5000} step={100} value={streetCorridorWidthMeters} onChange={(event) => setStreetCorridorWidthMeters(Number(event.target.value))} aria-label="Street corridor total width" className="w-full accent-cyan-300" />
                    <p className="text-[9px] text-zinc-500">Total search width across the route. Atlas searches half on each side.</p>
                  </div>
                  <button type="button" onClick={handleStartStreetRoute} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 py-2 text-[11px] font-semibold text-white transition hover:bg-white/20">
                    <Route className="h-3.5 w-3.5 text-cyan-300" />Draw street route (points A → B)
                  </button>
                  <p className="text-[9px] text-zinc-500">Uses the Route drawing tool. Click point A, then point B; add turns if needed and double-click to finish.</p>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {drawnStreetRoutes.length ? drawnStreetRoutes.map((route) => {
                      const checked = selectedStreetRouteIds.includes(route.id);
                      const disabled = !checked && selectedStreetRouteIds.length >= MAX_SEARCH_AREAS;
                      return <label key={route.id} className={`flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 px-2.5 py-2 text-[10px] text-zinc-200 ${disabled ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => setSelectedStreetRouteIds((current) => event.target.checked ? [...current, route.id].slice(-MAX_SEARCH_AREAS) : current.filter((id) => id !== route.id))} className="accent-cyan-300" />
                        <span className="min-w-0 flex-1 truncate">{route.name}</span>
                      </label>;
                    }) : <p className="px-1 py-2 text-[10px] text-zinc-500">Draw a route to select it as the street search area.</p>}
                  </div>
                  {selectedStreetRouteIds.length > MAX_SEARCH_AREAS && <p className="text-[9px] text-amber-300">Select up to {MAX_SEARCH_AREAS} routes per scan.</p>}
                </div>
              )}

              {/* Mapbox Isochrone Travel-Time Catchment Mode */}
              {areaMode === 'isochrone' && (
                <div className="space-y-3 pt-1 animate-in fade-in">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                        <span>Catchment Origin (Lat, Lon)</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSetFromMapCenter}
                          className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-[9px] text-zinc-300 hover:text-white font-semibold transition"
                        >
                          Map Center
                        </button>
                        <button
                          type="button"
                          onClick={handleSetFromCurrentLocation}
                          className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-[9px] text-zinc-300 hover:text-white font-semibold transition"
                        >
                          GPS
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={coordsInput}
                      onChange={(e) => setCoordsInput(e.target.value)}
                      placeholder="14.5995, 120.9842"
                      className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white font-mono text-xs outline-none focus:border-white/40 transition backdrop-blur-sm"
                    />
                  </div>

                  {/* Commute Mode */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                      Travel Profile
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/60 rounded-xl border border-white/10">
                      <button
                        type="button"
                        onClick={() => setIsochroneProfile('driving')}
                        className={`py-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1.5 ${
                          isochroneProfile === 'driving'
                            ? 'bg-white text-black shadow-sm'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Car className="w-3.5 h-3.5" />
                        <span>Driving</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsochroneProfile('walking')}
                        className={`py-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1.5 ${
                          isochroneProfile === 'walking'
                            ? 'bg-white text-black shadow-sm'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Footprints className="w-3.5 h-3.5" />
                        <span>Walking</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsochroneProfile('cycling')}
                        className={`py-1.5 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1.5 ${
                          isochroneProfile === 'cycling'
                            ? 'bg-white text-black shadow-sm'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Bike className="w-3.5 h-3.5" />
                        <span>Cycling</span>
                      </button>
                    </div>
                  </div>

                  {/* Travel Duration */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                        Catchment Reach
                      </label>
                      <span className="text-[11px] font-mono font-bold text-white">
                        {isochroneMinutes} minutes
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[5, 10, 15, 20, 30].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setIsochroneMinutes(mins)}
                          className={`py-1.5 rounded-lg text-[10px] font-mono font-bold transition border ${
                            isochroneMinutes === mins
                              ? 'bg-white text-black border-white shadow-sm'
                              : 'bg-black/40 text-zinc-400 border-white/10 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {mins}m
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generate Catchment Action Button */}
                  <button
                    type="button"
                    onClick={handleGenerateIsochrone}
                    disabled={isGeneratingIsochrone}
                    className="w-full py-2.5 bg-white text-black hover:bg-zinc-200 active:scale-[0.99] font-black rounded-xl text-xs transition shadow-lg flex items-center justify-center gap-2"
                  >
                    {isGeneratingIsochrone ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                        <span>Generating Mapbox Catchment...</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5 text-black" />
                        <span>
                          {activeIsochroneFeatureId ? 'Recalculate Catchment' : 'Compute Travel Catchment'}
                        </span>
                      </>
                    )}
                  </button>

                  {activeIsochroneFeatureId && (
                    <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/15 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] text-zinc-200 font-medium">
                          {isochroneMinutes}-min {isochroneProfile} polygon active on map
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-zinc-400">Ready to Scan</span>
                    </div>
                  )}
                </div>
              )}
              </div>}
            </div>
            </>}

            {/* In-Flight Scanning Progress */}
            {isScanning && (
              <div className="p-4 bg-zinc-950/90 border border-white/20 rounded-2xl backdrop-blur-2xl flex flex-col items-center text-center space-y-3.5 shadow-2xl animate-in fade-in shrink-0">
                <div className="relative w-10 h-10 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-white/30 animate-ping opacity-30" />
                  <div className="w-9 h-9 rounded-full bg-white/10 border border-white/30 flex items-center justify-center text-white">
                    <Radar className="w-4 h-4 animate-spin text-white" style={{ animationDuration: '2.5s' }} />
                  </div>
                </div>

                <div className="space-y-0.5">
                    <h4 className="font-bold text-white text-xs tracking-tight">
                    Finding places in your area
                  </h4>
                  <p className="text-[10px] text-zinc-400">
                    Searching OpenStreetMap place data
                  </p>
                </div>

                <div className="w-full space-y-1.5 text-left bg-black/60 p-2.5 rounded-xl border border-white/10">
                  {[
                    { label: 'Connecting to OpenStreetMap Gateway', done: scanStage > 0, active: scanStage === 0 },
                    { label: `Searching ${selectedTags.length + customFilterGroups.length} place types`, done: scanStage > 1, active: scanStage === 1 },
                    { label: 'Checking and organizing place details', done: scanStage > 2, active: scanStage === 2 },
                    { label: 'Adding places to your map', done: scanStage > 3, active: scanStage === 3 },
                  ].map((st, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10.5px]">
                      {st.done ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                      ) : st.active ? (
                        <Loader2 className="w-3.5 h-3.5 text-white animate-spin shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
                      )}
                      <span className={st.active ? 'text-white font-semibold' : st.done ? 'text-zinc-400' : 'text-zinc-600'}>
                        {st.label}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleCancelScan}
                  className="w-full py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel Scan</span>
                </button>
              </div>
            )}

            {/* Conversational OpenStreetMap place search */}
            <section className={`space-y-3 shrink-0 ${activeWorkflowStep === 2 ? '' : 'hidden'}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-cyan-300" />02 · Find places</h3>
                  <p className="text-[10px] text-zinc-400 mt-1">Tell Atlas what you are looking for in everyday words.</p>
                </div>
                <button type="button" disabled={isBuilderLoading} onClick={() => { setPresetDraftTags(selectedTags); setShowPresetPicker(true); }} className="shrink-0 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-[10px] font-semibold text-zinc-200 transition disabled:opacity-40 disabled:cursor-not-allowed">
                  Choose from presets
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-3 space-y-3">
                {builderMessages.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-[11px] text-zinc-300">
                    <p className="font-semibold text-white">What places would you like to find?</p>
                    <p className="text-zinc-500 mt-1">For example: “clinics and pharmacies” or “coffee shops near the selected area”.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {builderMessages.map((message, index) => (
                      <div key={`${index}-${message.role}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap ${message.role === 'user' ? 'bg-white text-zinc-950 rounded-tr-sm' : 'bg-white/[0.06] border border-white/10 text-zinc-200 rounded-tl-sm'}`}>
                          {message.content}
                        </div>
                      </div>
                    ))}
                    {isBuilderLoading && <div className="flex items-center gap-2 text-[10px] text-zinc-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />Working out the place types…</div>}
                  </div>
                )}

                {builderQuestion && (
                  <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3 space-y-2.5">
                    <p className="text-[11px] font-semibold text-white">{builderQuestion}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {builderOptions.map((option) => <button key={option} type="button" disabled={isBuilderLoading} onClick={() => submitSearchBuilder(option)} className="px-2.5 py-1.5 rounded-lg bg-black/30 hover:bg-white/10 border border-white/10 text-[10px] text-zinc-200 transition disabled:opacity-50">{option}</button>)}
                    </div>
                    <form onSubmit={(event) => { event.preventDefault(); submitSearchBuilder(builderInput); }} className="flex gap-2">
                      <input value={builderInput} onChange={(event) => setBuilderInput(event.target.value)} placeholder="Or type your own answer" disabled={isBuilderLoading} className="min-w-0 flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-[10px] text-white placeholder-zinc-500 outline-none focus:border-cyan-300/40 disabled:opacity-50" />
                      <button type="submit" disabled={!builderInput.trim() || isBuilderLoading} className="px-3 rounded-lg bg-white text-black text-[10px] font-bold disabled:opacity-40">Reply</button>
                    </form>
                  </div>
                )}

                {!builderQuestion && (
                  <form onSubmit={(event) => { event.preventDefault(); submitSearchBuilder(builderInput); }} className="flex gap-2">
                    <input value={builderInput} onChange={(event) => { setBuilderInput(event.target.value); if (builderReady) setBuilderReady(false); }} placeholder="Describe the places you want to find…" disabled={isBuilderLoading} className="min-w-0 flex-1 bg-black/50 border border-white/15 rounded-xl px-3 py-2.5 text-[11px] text-white placeholder-zinc-500 outline-none focus:border-white/40 disabled:opacity-50" />
                    <button type="submit" disabled={!builderInput.trim() || isBuilderLoading} aria-label="Send search request" className="px-3 rounded-xl bg-white text-black disabled:opacity-40"><Send className="w-4 h-4" /></button>
                  </form>
                )}
              </div>

              {builderReady && !pendingAutoRunRef.current && (
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.05] p-3 space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-100"><CheckCircle2 className="w-4 h-4" />Ready to search</div>
                  <p className="text-[10px] text-zinc-300">Looking for {builderPlaces.map((place) => place.label).join(', ')} {getSearchAreaSummary()}.</p>
                  {builderWarnings.length > 0 && <ul className="text-[10px] text-amber-200 space-y-1 list-disc pl-4">{builderWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
                </div>
              )}
            </section>

            {showPresetPicker && activeWorkflowStep === 2 && (
              <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Choose place presets" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPresetPicker(false); }}>
                <div className="w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl bg-zinc-950 border border-white/15 shadow-2xl overflow-hidden">
                  <div className="p-4 border-b border-white/10 flex items-start justify-between gap-3">
                    <div><h3 className="text-sm font-bold text-white">Choose from presets</h3><p className="text-[10px] text-zinc-400 mt-1">Pick familiar place types, then review before searching.</p></div>
                    <button type="button" onClick={() => setShowPresetPicker(false)} aria-label="Close presets" className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="p-4 space-y-3 overflow-y-auto">
                    <div className="relative"><Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" /><input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} disabled={isBuilderLoading} placeholder="Find a place type, like clinic or bakery" className="w-full bg-black/50 border border-white/15 rounded-xl pl-9 pr-3 py-2 text-white placeholder-zinc-500 outline-none focus:border-white/40 text-xs disabled:opacity-50" /></div>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" disabled={isBuilderLoading} onClick={() => handleSelectPreset('commercial')} className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[9px] font-semibold text-zinc-300 disabled:opacity-40">Commercial &amp; Retail</button>
                      <button type="button" disabled={isBuilderLoading} onClick={() => handleSelectPreset('all')} className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[9px] font-semibold text-zinc-300 disabled:opacity-40">Select All</button>
                      <button type="button" disabled={isBuilderLoading} onClick={() => handleSelectPreset('clear')} className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[9px] font-semibold text-zinc-400 disabled:opacity-40">Clear</button>
                      <span className="ml-auto self-center text-[9px] text-zinc-500">{presetDraftTags.length} selected</span>
                    </div>
                    <div className="space-y-1.5">
                      {Object.entries(POI_CONFIG).map(([category, items]) => {
                        const filteredItems = searchQuery.trim() ? items.filter(([label]) => label.toLowerCase().includes(searchQuery.toLowerCase())) : items;
                        if (!filteredItems.length) return null;
                        const isOpen = openCategories[category] || searchQuery.trim().length > 0;
                        const categoryTags = items.map(([, tag]) => tag);
                        const selectedCount = categoryTags.filter((tag) => presetDraftTags.includes(tag)).length;
                        const color = CATEGORY_COLORS[category] || '#fff';
                        return <div key={category} className="border border-white/10 rounded-xl bg-white/[0.02] overflow-hidden">
                          <div className="flex items-center justify-between p-2.5">
                            <button type="button" disabled={isBuilderLoading} onClick={() => handleCategorySelectAll(category)} className="flex items-center gap-2.5 min-w-0 text-left disabled:opacity-40">
                              {selectedCount === categoryTags.length ? <CheckSquare className="w-4 h-4 text-white" /> : selectedCount > 0 ? <MinusSquare className="w-4 h-4 text-zinc-300" /> : <Square className="w-4 h-4 text-zinc-600" />}
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />{getCategoryIcon(category)}<span className="font-semibold text-white text-[11px] truncate">{category}</span>
                            </button>
                            <button type="button" disabled={isBuilderLoading} onClick={() => setOpenCategories((prev) => ({ ...prev, [category]: !isOpen }))} className="flex items-center gap-2 pl-2 text-[9px] text-zinc-400 disabled:opacity-40"><span>{selectedCount}/{items.length}</span>{isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</button>
                          </div>
                          {isOpen && <div className="px-3 py-2 border-t border-white/5 bg-black/40 max-h-48 overflow-y-auto"><div className="grid grid-cols-2 gap-1.5">{filteredItems.map(([label, tag]) => {
                            const isChecked = presetDraftTags.includes(tag);
                            return <button type="button" disabled={isBuilderLoading} key={label} onClick={() => handleTagToggle(tag)} className={`flex items-center gap-2 p-1.5 rounded-lg text-left disabled:opacity-40 ${isChecked ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`}>
                              {isChecked ? <CheckSquare className="w-3.5 h-3.5 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0 text-zinc-600" />}<span className="shrink-0">{getPoiItemIcon(label, category)}</span><span className="text-[10.5px] truncate">{label}</span>
                            </button>;
                          })}</div></div>}
                        </div>;
                      })}
                    </div>
                  </div>
                  <div className="p-3 border-t border-white/10 flex justify-end gap-2"><button type="button" onClick={() => setShowPresetPicker(false)} className="px-3 py-2 rounded-lg border border-white/10 text-[10px] text-zinc-300">Cancel</button><button type="button" disabled={isBuilderLoading} onClick={applyPresetSelection} className="px-4 py-2 rounded-lg bg-white text-black text-[10px] font-bold disabled:opacity-40">Use selected places</button></div>
                </div>
              </div>
            )}

            {/* Mapped Assets Section */}
            {activeWorkflowStep === 3 && activeScannedFeatures.length > 0 && (
              <div className="pt-2 border-t border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setResultsExpanded((expanded) => !expanded)} aria-expanded={resultsExpanded} className="flex items-center gap-2 text-left">
                    {resultsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <span className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-cyan-300" /><span>03 · Results ({activeScannedFeatures.length})</span><span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[8px] normal-case tracking-normal text-zinc-400">{scannedPois.length ? 'Current scan' : 'Saved results'}</span></span>
                  </button>
                  {resultsExpanded && <div className="flex flex-col items-end gap-1.5">
                    <div className="flex flex-wrap items-center justify-end gap-1"><span className="text-[9px] text-zinc-500 mr-1">Map</span>{([['pins', 'Pins'], ['heatmap', 'Heatmap'], ['clusters', 'Clusters']] as const).map(([mode, label]) => <button key={mode} type="button" onClick={() => setOpenNodeDisplayMode(mode)} aria-pressed={openNodeDisplayMode === mode} className={`px-2 py-1 rounded-lg text-[9px] font-bold ${openNodeDisplayMode === mode ? 'bg-white text-black' : 'bg-white/5 text-zinc-400 hover:text-white'}`}>{label}</button>)}</div>
                    <div className="flex flex-wrap items-center justify-end gap-1"><span className="text-[8px] text-zinc-600 mr-1">Results</span>{([['groups', 'Groups'], ['table', 'Table']] as const).map(([view, label]) => <button key={view} type="button" onClick={() => setResultsView(view)} aria-pressed={resultsView === view} className={`px-2 py-1 rounded-lg text-[9px] font-bold ${resultsView === view ? 'bg-white text-black' : 'bg-white/5 text-zinc-400 hover:text-white'}`}>{view === 'table' && <Table2 className="mr-1 inline h-3 w-3" />}{label}</button>)}</div>
                    {resultsView === 'groups' && <div className="flex items-center gap-1"><span className="text-[8px] text-zinc-600 mr-1">Pin shape</span><button type="button" onClick={() => handleApplyGlobalStyle('modern-pin')} className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold ${globalMarkerStyle === 'modern-pin' ? 'bg-white/15 text-white' : 'text-zinc-500 hover:text-white'}`}>Pins</button><button type="button" onClick={() => handleApplyGlobalStyle('dots')} className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold ${globalMarkerStyle === 'dots' ? 'bg-white/15 text-white' : 'text-zinc-500 hover:text-white'}`}>Dots</button></div>}
                  </div>}
                </div>
                {resultsExpanded && <>
                  {resultsView === 'groups' && <><p className="text-[10px] text-zinc-500 -mt-1">Grouped by familiar place type. Expand a group to manage its results.</p>
                  <div className="space-y-1.5">
                    {Object.entries(featuresByCategory).map(([category, feats]) => {
                      const isVisible = feats.some((f) => f.props.visible !== 0);
                      const firstFeature = feats[0];
                      const color = firstFeature?.props.color || CATEGORY_COLORS[firstFeature?.props.category || ''] || '#ffffff';
                      const groupOpen = openAmenityGroups[category] ?? false;
                      const groupLabel = category.split(/[_-]+/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ');
                      const groupSize = firstFeature?.props.iconSize ?? 1;

                      return <div key={category} className="rounded-xl bg-white/[0.02] border border-white/10 overflow-hidden">
                        <div className="flex items-center justify-between gap-2 p-2">
                          <button type="button" onClick={() => setOpenAmenityGroups((prev) => ({ ...prev, [category]: !groupOpen }))} aria-expanded={groupOpen} className="flex min-w-0 items-center gap-2 text-left">
                            {groupOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-zinc-400" />}
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} /><span className="font-semibold text-white text-[11px] truncate">{groupLabel}</span><span className="text-[9px] text-zinc-500 font-mono">{feats.length}</span>
                          </button>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button type="button" onClick={() => handleToggleCategoryVisibility(category)} className="p-1 rounded text-zinc-400 hover:text-white" title={isVisible ? 'Hide group' : 'Show group'}>{isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                            <button type="button" onClick={() => { setEditingAmenityGroup(category); setAmenityGroupDraft(groupLabel); setOpenAmenityGroups((prev) => ({ ...prev, [category]: true })); }} className="p-1 rounded text-zinc-400 hover:text-white" title="Rename amenity group"><Edit3 className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => handleDeleteCategory(category)} className="p-1 rounded text-zinc-400 hover:text-red-400" title="Remove group"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>

                        {groupOpen && <div className="px-2.5 pb-2.5 border-t border-white/5 space-y-2">
                          {editingAmenityGroup === category ? <form className="flex gap-1.5 pt-2" onSubmit={(event) => { event.preventDefault(); handleRenameAmenityGroup(feats, amenityGroupDraft); }}>
                            <input autoFocus value={amenityGroupDraft} onChange={(event) => setAmenityGroupDraft(event.target.value)} aria-label="Amenity group name" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[10px] text-white outline-none focus:border-cyan-300/50" />
                            <button type="submit" className="rounded-lg bg-white px-2.5 py-1 text-[10px] font-bold text-black">Save</button><button type="button" onClick={() => setEditingAmenityGroup(null)} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-300">Cancel</button>
                          </form> : <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 pt-2">
                            <label className="flex items-center gap-1.5 text-[9px] text-zinc-400"><span>Color</span><input type="color" aria-label={`Color for ${groupLabel}`} value={color} onChange={(event) => handleApplyAmenityStyle(feats, { color: event.target.value })} className="h-6 w-7 cursor-pointer rounded bg-transparent" /></label>
                            <label className="flex min-w-0 items-center gap-1.5 text-[9px] text-zinc-400"><span>Icon</span><select aria-label={`Icon for ${groupLabel}`} value={firstFeature?.props.shape || 'modern-pin'} onChange={(event) => handleApplyAmenityStyle(feats, { shape: event.target.value as MarkerShape })} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-[10px] text-zinc-200"><option value="modern-pin">Pin</option><option value="dots">Dot</option><option value="circle">Circle</option><option value="star">Star</option><option value="square">Square</option><option value="diamond">Diamond</option><option value="heart">Heart</option><option value="shield">Shield</option></select></label>
                            <span className="text-[9px] text-zinc-500">{Math.round(groupSize * 100)}%</span>
                            <label className="col-span-3 flex items-center gap-2 text-[9px] text-zinc-400"><span className="w-7">Size</span><input type="range" min="0.4" max="5" step="0.05" value={groupSize} aria-label={`Size for ${groupLabel}`} onChange={(event) => handleApplyAmenityStyle(feats, { iconSize: Number(event.target.value) })} className="min-w-0 flex-1 accent-cyan-300" /><span className="w-9 text-right">{Math.round(groupSize * 100)}%</span></label>
                          </div>}

                          <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
                            {feats.map((feature) => {
                              const styleOpen = openPoiStyles[feature.id] ?? false;
                              return <div key={feature.id} className="rounded-lg border border-white/5 bg-black/25 px-2 py-1.5">
                                <div className="flex min-w-0 items-center gap-1.5"><input value={getReadablePoiName(feature)} onChange={(event) => handleUpdatePoi(feature.id, { name: event.target.value })} aria-label="Place name" className="min-w-0 flex-1 bg-transparent text-[10px] text-zinc-200 outline-none focus:text-white" /><button type="button" onClick={() => handleUpdatePoi(feature.id, { visible: feature.props.visible === 0 ? 1 : 0 })} className="p-1 text-zinc-500 hover:text-white" title={feature.props.visible === 0 ? 'Show pin' : 'Hide pin'}>{feature.props.visible === 0 ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}</button><button type="button" onClick={() => handleFlyToPoi(feature)} className="p-1 text-zinc-500 hover:text-white" title="Locate pin"><Crosshair className="w-3 h-3" /></button><button type="button" onClick={() => setOpenPoiStyles((prev) => ({ ...prev, [feature.id]: !styleOpen }))} aria-expanded={styleOpen} className={`p-1 ${styleOpen ? 'text-cyan-300' : 'text-zinc-500 hover:text-white'}`} title="Edit pin style"><Sliders className="w-3 h-3" /></button></div>
                                {styleOpen && <div className="grid grid-cols-[auto_1fr] items-center gap-2 border-t border-white/5 pt-2 mt-1.5">
                                  <label className="flex items-center gap-1 text-[9px] text-zinc-400">Color<input type="color" aria-label={`Color for ${feature.name}`} value={feature.props.color || '#ffffff'} onChange={(event) => handleUpdatePoi(feature.id, { color: event.target.value })} className="h-5 w-6 cursor-pointer rounded bg-transparent" /></label>
                                  <label className="flex items-center gap-1.5 text-[9px] text-zinc-400">Icon<select aria-label={`Icon for ${feature.name}`} value={feature.props.shape || 'modern-pin'} onChange={(event) => handleUpdatePoi(feature.id, { shape: event.target.value as MarkerShape })} className="min-w-0 flex-1 rounded border border-white/10 bg-zinc-950 px-1.5 py-1 text-[9px] text-zinc-200"><option value="modern-pin">Pin</option><option value="dots">Dot</option><option value="circle">Circle</option><option value="star">Star</option><option value="square">Square</option><option value="diamond">Diamond</option><option value="heart">Heart</option><option value="shield">Shield</option></select></label>
                                  <label className="col-span-2 flex items-center gap-2 text-[9px] text-zinc-400"><span>Size</span><input type="range" min="0.4" max="5" step="0.05" value={feature.props.iconSize ?? 1} aria-label={`Size for ${feature.name}`} onChange={(event) => handleUpdatePoi(feature.id, { iconSize: Number(event.target.value) })} className="min-w-0 flex-1 accent-cyan-300" /><span className="w-9 text-right">{Math.round((feature.props.iconSize ?? 1) * 100)}%</span></label>
                                </div>}
                              </div>;
                            })}
                          </div>
                        </div>}
                      </div>;
                    })}
                  </div></>}
                  {resultsView === 'table' && (resultsTableMaximized && typeof document !== 'undefined'
                    ? createPortal(<div role="dialog" aria-modal="true" aria-label="Places results table" className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/75 p-3 sm:p-6"><div className="h-full w-full max-w-7xl"><TradeAreaResultsTable rows={resultTableRows} researchColumns={resultsResearchColumns} total={activeScannedFeatures.length} maximized search={resultsTableSearch} setSearch={setResultsTableSearch} sortBy={resultsSortBy} setSortBy={setResultsSortBy} ascending={resultsSortAscending} setAscending={setResultsSortAscending} groupBy={resultsGroupBy} setGroupBy={setResultsGroupBy} placeGroupBy={placeGroupBy} setPlaceGroupBy={setPlaceGroupBy} collapsedGroups={collapsedTableGroups} setCollapsedGroups={setCollapsedTableGroups} onToggleMaximize={() => setResultsTableMaximized(false)} onLocate={handleFlyToPoi} onExportResearchPack={handleExportResearchPack} onImportResearchFile={handleImportResearchFile} onStyleGroup={handleApplyAmenityStyle} /></div></div>, document.body)
                    : <TradeAreaResultsTable rows={resultTableRows} researchColumns={resultsResearchColumns} total={activeScannedFeatures.length} maximized={false} search={resultsTableSearch} setSearch={setResultsTableSearch} sortBy={resultsSortBy} setSortBy={setResultsSortBy} ascending={resultsSortAscending} setAscending={setResultsSortAscending} groupBy={resultsGroupBy} setGroupBy={setResultsGroupBy} placeGroupBy={placeGroupBy} setPlaceGroupBy={setPlaceGroupBy} collapsedGroups={collapsedTableGroups} setCollapsedGroups={setCollapsedTableGroups} onToggleMaximize={() => setResultsTableMaximized(true)} onLocate={handleFlyToPoi} onExportResearchPack={handleExportResearchPack} onImportResearchFile={handleImportResearchFile} onStyleGroup={handleApplyAmenityStyle} />)}
                </>}
                <button type="button" onClick={() => setAnalysisExpanded((expanded) => !expanded)} aria-expanded={analysisExpanded} className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[10px] font-semibold text-zinc-200 hover:bg-white/[0.06]">
                  <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-cyan-300" />Spatial analysis &amp; Q&amp;A</span>{analysisExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
            {activeWorkflowStep === 3 && activeScannedFeatures.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
                <Layers className="mx-auto mb-2 h-5 w-5 text-zinc-500" />
                <p className="text-[11px] font-semibold text-zinc-200">No results yet</p>
                <p className="mt-1 text-[10px] text-zinc-500">Choose an area and describe the places you want to find.</p>
                <button type="button" onClick={() => setActiveWorkflowStep(2)} className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-white/10">Go to places</button>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 2: SPATIAL AI INTELLIGENCE & INTERACTIVE Q&A
           ========================================================================= */}
        {activeWorkflowStep === 3 && analysisExpanded && activeScannedFeatures.length > 0 && (
          <div className="space-y-4">
            {/* Header / Trigger Card */}
            <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-3 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs block flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                    <span>Spatial AI Commercial Intelligence</span>
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Empirical trade area assessment & interactive Q&A analyst
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowCapabilitiesModal(true)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-300 hover:text-white transition flex items-center justify-center"
                    title="Geospatial Intelligence Architecture & Engine Guide"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-300" />
                  </button>
                  <button
                    onClick={handleTriggerAiAnalysis}
                    disabled={isAiLoading || scannedPois.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-200 disabled:opacity-40 text-black font-black rounded-xl text-xs transition shadow-lg shadow-white/5"
                  >
                    {isAiLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-black" />
                    )}
                    <span>{aiData ? 'Regenerate' : 'Generate Dossier'}</span>
                  </button>
                </div>
              </div>

              {/* Notice if no scan */}
              {scannedPois.length === 0 && (
                <div className="p-3 bg-black/40 border border-white/10 rounded-xl text-center space-y-1">
                  <p className="text-zinc-300 text-[11px] font-medium">
                    No active POI scan detected
                  </p>
                  <p className="text-zinc-500 text-[10px]">
                    Switch to <strong>Target & POIs</strong>, select categories, and run a scan to unlock AI analysis and question answering.
                  </p>
                </div>
              )}
            </div>

            {/* AI Dossier Analysis (When Generated) */}
            {aiData && (
              <div className="space-y-3 animate-in fade-in">
                {/* Executive Radial Vitality Scorecard */}
                <div className="p-4 bg-black/60 border border-white/10 rounded-2xl space-y-3 backdrop-blur-xl shadow-inner">
                  <div className="flex items-center gap-3.5">
                    {/* Radial Progress Ring */}
                    <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                      <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
                        <circle
                          cx="32"
                          cy="32"
                          r="26"
                          stroke="rgba(255, 255, 255, 0.1)"
                          strokeWidth="4"
                          fill="transparent"
                        />
                        <circle
                          cx="32"
                          cy="32"
                          r="26"
                          stroke="#ffffff"
                          strokeWidth="4.5"
                          strokeDasharray={163.36}
                          strokeDashoffset={163.36 - (163.36 * Math.min(100, Math.max(0, aiData.summary.commercialScore))) / 100}
                          strokeLinecap="round"
                          fill="transparent"
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                        <span className="text-base font-black text-white font-mono">
                          {aiData.summary.commercialScore}
                        </span>
                        <span className="text-[7.5px] font-mono text-zinc-400 uppercase tracking-tighter mt-0.5">
                          INDEX
                        </span>
                      </div>
                    </div>

                    {/* Score Context & Benchmark */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[9.5px] text-zinc-400 uppercase font-mono font-bold tracking-wider">
                          COMMERCIAL VITALITY
                        </span>
                      </div>
                      <h4 className="text-sm font-extrabold text-white tracking-tight truncate">
                        {aiData.summary.saturationRating}
                      </h4>
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate">
                        {aiData.summary.totalPois} Assets • {aiData.summary.dominantCategory} Anchor
                      </p>
                    </div>
                  </div>

                  {/* 3-Metric Institutional Benchmark Bar */}
                  <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-white/10">
                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                      <span className="text-[8.5px] uppercase font-mono text-zinc-500 font-bold block">
                        Footfall Rating
                      </span>
                      <span className="text-[11px] font-bold text-white flex items-center justify-center gap-1 mt-0.5">
                        <TrendingUp className="w-3 h-3 text-white" />
                        <span>{aiData.summary.commercialScore > 70 ? 'High' : 'Moderate'}</span>
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                      <span className="text-[8.5px] uppercase font-mono text-zinc-500 font-bold block">
                        Competition
                      </span>
                      <span className="text-[11px] font-bold text-white flex items-center justify-center gap-1 mt-0.5">
                        <Flame className="w-3 h-3 text-white" />
                        <span>{aiData.summary.totalPois > 40 ? 'Intense' : 'Balanced'}</span>
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                      <span className="text-[8.5px] uppercase font-mono text-zinc-500 font-bold block">
                        Primary Anchor
                      </span>
                      <span className="text-[11px] font-bold text-white truncate block mt-0.5" title={aiData.summary.dominantCategory}>
                        {aiData.summary.dominantCategory.split(' ')[0]}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                <div className="p-3.5 bg-white/[0.02] border border-white/10 rounded-2xl space-y-1.5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Executive Brief
                  </span>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    {aiData.summary.brief}
                  </p>
                </div>

                {/* Commercial Corridors & Clusters */}
                {aiData.clusters && aiData.clusters.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                        Commercial Corridors & Clusters ({aiData.clusters.length})
                      </span>
                      <span className="text-[9.5px] text-zinc-500 font-mono">
                        Click Focus to center
                      </span>
                    </div>

                    <div className="space-y-2">
                      {aiData.clusters.map((cl, i) => (
                        <div
                          key={i}
                          className="p-3.5 bg-white/[0.02] border border-white/10 hover:border-white/25 rounded-2xl space-y-2.5 transition backdrop-blur-sm group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white/10 text-white border border-white/15 shrink-0 mt-0.5">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <div className="truncate">
                                <h5 className="font-bold text-white text-xs tracking-tight truncate group-hover:text-zinc-100 transition">
                                  {cl.name}
                                </h5>
                                <span className="text-[10px] text-zinc-400 font-mono block">
                                  {cl.corridor} • {cl.poiCount} Establishments
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleFlyToCluster(cl)}
                              className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-[10px] transition flex items-center gap-1 shadow-sm active:scale-95 shrink-0"
                              title="Fly camera to this corridor"
                            >
                              <span>Focus</span>
                              <ArrowUpRight className="w-3 h-3 text-white" />
                            </button>
                          </div>

                          <p className="text-[10.5px] text-zinc-300 leading-normal">
                            {cl.insight}
                          </p>

                          {cl.keyTenants && cl.keyTenants.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              <span className="text-[9px] uppercase font-mono text-zinc-500 font-bold mr-1">
                                Anchors:
                              </span>
                              {cl.keyTenants.map((tenant, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[9.5px] text-zinc-300 font-medium"
                                >
                                  {tenant}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Quick ask AI about this corridor */}
                          <div className="pt-1 flex items-center justify-between border-t border-white/5 text-[9.5px]">
                            <button
                              type="button"
                              onClick={() => handleSendQaMessage(`Analyze commercial dynamics and competitor saturation specifically for ${cl.name} along ${cl.corridor}`)}
                              className="text-zinc-400 hover:text-white flex items-center gap-1 font-medium transition"
                            >
                              <Sparkles className="w-3 h-3 text-zinc-400" />
                              <span>Ask AI about {cl.corridor}</span>
                            </button>
                            <span className="font-mono text-zinc-500">
                              {cl.saturation} Saturation
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Copy Dossier Button */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleCopyReport}
                    className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-white px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition font-medium"
                  >
                    {hasCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span className="text-white font-bold">Dossier Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Dossier Text</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRawBrief(!showRawBrief)}
                    className="text-[10px] text-zinc-400 hover:text-white font-semibold transition"
                  >
                    {showRawBrief ? 'Hide Raw JSON' : 'View Raw JSON'}
                  </button>
                </div>

                {showRawBrief && (
                  <pre className="p-3 bg-black/80 border border-white/10 rounded-2xl text-[9.5px] text-zinc-300 font-mono overflow-x-auto max-h-40">
                    {JSON.stringify(aiData, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Interactive Spatial AI Q&A Chat */}
            <div className="pt-2 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-white" />
                  <span>Interactive Spatial Q&A</span>
                </span>
                <span className="text-[9.5px] text-zinc-400 font-mono">
                  Grounded on {scannedPois.length} POIs
                </span>
              </div>

              {/* Quick Inquiry Prompt Chips */}
              <div className="space-y-1">
                <span className="text-[9.5px] text-zinc-500 uppercase tracking-wide block">
                  Suggested inquiries
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'What retail or dining gaps exist in this radius?',
                    'Evaluate competitor saturation along main roads',
                    'Is this trade area viable for a cafe / quick-serve?',
                    'Summarize anchor tenants and foot-traffic drivers',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleSendQaMessage(chip)}
                      disabled={isQaLoading || scannedPois.length === 0}
                      className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/15 disabled:opacity-30 border border-white/10 text-[10px] text-zinc-300 hover:text-white transition text-left"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversation Feed */}
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {qaMessages.length === 0 ? (
                  <div className="p-4 border border-white/10 rounded-2xl bg-black/40 text-center space-y-1.5">
                    <Bot className="w-5 h-5 text-zinc-400 mx-auto" />
                    <p className="text-zinc-300 text-[11px] font-medium">
                      Ask the Spatial Analyst
                    </p>
                    <p className="text-zinc-500 text-[10px]">
                      Query competitor density, whitespace gaps, tenant viability, or arterial traffic.
                    </p>
                  </div>
                ) : (
                  qaMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl p-3 text-[11px] leading-relaxed shadow-sm ${
                          msg.role === 'user'
                            ? 'bg-white text-black font-medium rounded-tr-sm'
                            : 'bg-black/60 border border-white/10 text-zinc-200 rounded-tl-sm backdrop-blur-md'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 opacity-60 text-[9px] font-mono uppercase">
                          {msg.role === 'user' ? (
                            <>
                              <User className="w-2.5 h-2.5" />
                              <span>You</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>Spatial Analyst</span>
                            </>
                          )}
                          <span>• {msg.timestamp}</span>
                        </div>
                        <div className="whitespace-pre-wrap font-sans">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Loading Indicator */}
                {isQaLoading && (
                  <div className="flex items-center gap-2 p-3 bg-black/40 border border-white/10 rounded-2xl text-zinc-300 text-[11px] animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Analyzing empirical POI coordinates and density...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Action Bar for AI Tab (Pinned Persistent Inquiry Input) */}
      {activeWorkflowStep === 3 && analysisExpanded && activeScannedFeatures.length > 0 && (
        <div className="p-3.5 border-t border-white/10 shrink-0 bg-black/80 backdrop-blur-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQaMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={qaInput}
              onChange={(e) => setQaInput(e.target.value)}
              placeholder={
                scannedPois.length > 0
                  ? 'Ask spatial analyst (e.g. retail gaps, foot traffic)...'
                  : 'Scan area first to query...'
              }
              disabled={scannedPois.length === 0 || isQaLoading}
              className="flex-1 bg-black/60 border border-white/15 rounded-2xl px-3.5 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-white/40 text-xs transition disabled:opacity-40 backdrop-blur-sm"
            />
            <button
              type="submit"
              disabled={!qaInput.trim() || isQaLoading || scannedPois.length === 0}
              className="p-2.5 bg-white text-black disabled:opacity-30 rounded-2xl font-bold transition hover:bg-zinc-200 shadow-md shrink-0 active:scale-95"
              title="Send inquiry"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Sticky Bottom Action Bar (Setup Tab) */}
      {activeTab === 'target_layers' && (isScanning || (builderReady && activeWorkflowStep === 2 && !pendingAutoRunRef.current)) && (
        <div className="p-4 pt-3 border-t border-white/10 shrink-0 bg-black/60 backdrop-blur-2xl flex gap-2">
          {isScanning ? (
            <>
              <button
                type="button"
                disabled
                className="flex-1 py-3.5 bg-white/20 text-zinc-300 font-black rounded-2xl flex items-center justify-center gap-2 text-xs border border-white/15"
              >
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Scanning OpenStreetMap...</span>
              </button>
              <button
                type="button"
                onClick={handleCancelScan}
                className="px-4 py-3.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-2xl text-xs transition flex items-center gap-1.5"
              >
                <X className="w-4 h-4 text-zinc-300" />
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleRunScan}
              disabled={!builderReady || !isSearchAreaReady}
              className="flex-1 py-3.5 bg-white hover:bg-zinc-200 disabled:bg-white/10 disabled:text-zinc-500 disabled:border-white/10 text-black font-black rounded-2xl shadow-xl shadow-white/10 flex items-center justify-center gap-2 text-xs transition active:scale-[0.99] border border-white/40"
            >
              <Radar className="w-4 h-4" />
              <span className="tracking-wider uppercase font-black">{!isSearchAreaReady ? 'CHOOSE A SEARCH AREA' : activeScannedFeatures.length ? 'SEARCH AGAIN' : 'SEARCH THIS AREA'}</span>
            </button>
          )}
        </div>
      )}

      {/* Geospatial Intelligence Engine & Architecture Capabilities Modal */}
      {showCapabilitiesModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-zinc-950 border border-white/20 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-white max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-xl bg-white/10 border border-white/20 text-white">
                    <Cpu className="w-4 h-4 text-white" />
                  </span>
                  <h3 className="font-extrabold text-sm tracking-tight text-white">
                    Geospatial Intelligence Engine
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-400">
                  How Project Atlas maximizes Mapbox Isochrones, Overpass Turbo / OSMnx, and DeepSeek V3
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCapabilitiesModal(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Core Pillars */}
            <div className="space-y-3">
              {/* 1. Mapbox Isochrone & Catchments */}
              <div className="p-3.5 bg-white/[0.03] border border-white/10 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-white">
                    <Clock className="w-3.5 h-3.5 text-white" />
                    <span>Mapbox Isochrones &amp; Catchments</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-white/10 border border-white/20 text-zinc-200">
                    Dual-Token Pool (200k/mo)
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Computes real-world reachable travel boundaries across road networks rather than naive Euclidean circles. Supports driving, walking, and cycling catchment contours with automatic round-robin rotation across <code className="text-zinc-200">MAPBOX_ACCESS_TOKEN_1</code> and <code className="text-zinc-200">MAPBOX_ACCESS_TOKEN_2</code> with instant failover.
                </p>
              </div>

              {/* 2. OSMnx & Overpass Multi-Mirror */}
              <div className="p-3.5 bg-white/[0.03] border border-white/10 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-white">
                    <Radar className="w-3.5 h-3.5 text-white" />
                    <span>Overpass Turbo &amp; OSMnx Multi-Mirror</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-white/10 border border-white/20 text-zinc-200">
                    3 Gateway Rotation
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Queries 40+ granular retail, commercial, amenity, and logistics taxonomies directly inside your computed catchment polygon (<code className="text-zinc-200">poly:&quot;...&quot;</code>). Automatically load-balances across Kumi Systems, Overpass Turbo API, and Private OSM Mirrors with intelligent retry logic.
                </p>
              </div>

              {/* 3. DeepSeek V3 Spatial Commercial Intelligence */}
              <div className="p-3.5 bg-white/[0.03] border border-white/10 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-white">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                    <span>DeepSeek V3 Spatial Commercial Analyst</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-white/10 border border-white/20 text-zinc-200">
                    Empirical Vitality Index
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Synthesizes mapped assets into empirical site selection intelligence. Evaluates commercial vitality (0-100), competitive anchor density, and retail voids, with full multi-turn conversational Q&amp;A referencing active map pins and polygons.
                </p>
              </div>
            </div>

            {/* Quick-Prompt Suggestions */}
            <div className="space-y-2 pt-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Suggested Analyst Queries (Click to Ask)
              </label>
              <div className="space-y-1.5">
                {[
                  'Evaluate 10-minute drive-time convenience store and pharmacy saturation.',
                  'Identify prime tenant gaps and underserved commercial categories in this trade area.',
                  'Which anchor POIs drive the highest footfall in this catchment and what is the competitive threat?',
                ].map((promptText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setQaInput(promptText);
                      setShowCapabilitiesModal(false);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-black/50 hover:bg-white/10 border border-white/10 hover:border-white/25 transition text-[11px] text-zinc-300 hover:text-white flex items-center justify-between group"
                  >
                    <span className="line-clamp-1">{promptText}</span>
                    <Send className="w-3 h-3 text-zinc-500 group-hover:text-white shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>

            {/* Close Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowCapabilitiesModal(false)}
                className="w-full py-2.5 bg-white text-black font-extrabold rounded-xl text-xs hover:bg-zinc-200 transition"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
