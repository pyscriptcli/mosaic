'use client';

import React, { useState } from 'react';
import { X, Table, MapPin, Copy, Check, ExternalLink, Sparkles } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import { CATEGORY_COLORS } from '../../gis/tradeArea';

export const FeaturePopup: React.FC = () => {
  const { selectedId, setSelectedId, features, togglePanel, setToast, activePanels } = useMapStore();
  const [copied, setCopied] = useState(false);

  if (!selectedId) return null;
  if (activePanels.shapeEditor || activePanels.customMap) return null;
  const f = features.find((x) => x.id === selectedId);
  if (!f) return null;

  const category = f.props?.category || 'ASSET';
  const isOpenNodePlace = f.props?.managedBy === 'open-node';
  const categoryColor = CATEGORY_COLORS[category] || '#ffffff';
  const osmTags = (f.props?.osmTags || {}) as Record<string, unknown>;
  const humanize = (value: unknown) => String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const placeType = humanize(f.props?.poiType || osmTags.amenity || osmTags.shop || osmTags.office || osmTags.tourism || 'Place');
  const featureName = String(f.name || '').trim();
  const genericPlaceName = ['amenity', 'shop', 'office', 'tourism', 'leisure', 'healthcare', 'place', 'building'].some((key) => String(osmTags[key] || '').toLowerCase() === featureName.toLowerCase());
  const displayName = isOpenNodePlace && (!featureName || genericPlaceName) ? String(osmTags.name || osmTags.brand || `Unnamed ${placeType}`) : f.name;
  const placeCategory = String(f.props?.amenityGroupLabel || f.props?.category || 'Place').toLowerCase().replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const placeAddress = String(osmTags['addr:full'] || [osmTags['addr:housenumber'], osmTags['addr:street'], osmTags['addr:suburb'], osmTags['addr:city'], osmTags['addr:postcode']].filter(Boolean).join(', ') || '');
  const placeDetailCandidates: Array<[string, unknown]> = [
    ['Type', placeType],
    ['Brand', String(osmTags.brand || '')],
    ['Address', placeAddress],
    ['Phone', String(osmTags.phone || osmTags['contact:phone'] || '')],
    ['Website', String(osmTags.website || osmTags['contact:website'] || '')],
    ['Opening hours', String(osmTags.opening_hours || '')],
    ['Cuisine', osmTags.cuisine ? humanize(osmTags.cuisine) : ''],
  ];
  const readablePlaceDetails: Array<[string, string]> = placeDetailCandidates.flatMap(([label, value]) => value ? [[label, String(value)]] : []);
  const researchData = (f.props?.researchData || {}) as Record<string, unknown>;
  const normalizePriceRange = (value: unknown, currency: 'PHP' | 'MYR') => {
    if (value == null || value === '') return '—';
    const formatted = String(value).trim()
      .replace(/(?:\bPHP\b|₱)\s*/gi, 'PHP ')
      .replace(/(?:\bMYR\b|\bRM\b)\s*/gi, 'MYR ')
      .trim();
    const hasCurrency = currency === 'PHP' ? /\bPHP\b/.test(formatted) : /\bMYR\b/.test(formatted);
    return hasCurrency ? formatted : `${currency} ${formatted}`;
  };
  const hasPriceRange = researchData.priceRangePhp != null || researchData.priceRangePHP != null || researchData.priceRangeMyr != null || researchData.priceRangeMYR != null;
  const priceRange = `${normalizePriceRange(researchData.priceRangePhp ?? researchData.priceRangePHP, 'PHP')} / ${normalizePriceRange(researchData.priceRangeMyr ?? researchData.priceRangeMYR, 'MYR')}`;
  const googleMapsUrl = f.geometry.type === 'Point'
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}`)}`
    : null;

  let primaryImage: string | null = null;
  if (f.props.attrRows && f.props.attrRows.length > 0 && f.props.attrTypes) {
    for (const row of f.props.attrRows) {
      for (const col in f.props.attrTypes) {
        if (f.props.attrTypes[col] === 'image' && row[col]?.startsWith('data:image')) {
          primaryImage = row[col];
          break;
        }
      }
      if (primaryImage) break;
    }
  }

  const handleOpenTable = () => {
    togglePanel('attributeTable', true);
  };

  const handleCopyCoords = () => {
    if (f.geometry.type === 'Point') {
      const text = `${f.geometry.coordinates[1].toFixed(6)}, ${f.geometry.coordinates[0].toFixed(6)}`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      setToast(`Coordinates copied: ${text}`);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[990] w-84 max-w-[calc(100vw-2rem)] bg-zinc-950/85 border border-white/15 rounded-3xl p-4 shadow-[0_24px_70px_rgba(0,0,0,0.9)] backdrop-blur-2xl text-xs text-zinc-300 animate-in fade-in slide-in-from-bottom-3 select-none">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="w-2 h-2 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: categoryColor }}
            />
            <span className="text-[9.5px] uppercase font-mono font-bold tracking-wider text-zinc-400 truncate">
              {isOpenNodePlace ? placeCategory : category}
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-white/10 text-zinc-300 font-mono">
              {isOpenNodePlace ? 'Place' : f.kind}
            </span>
          </div>
          <h3 className="font-bold text-white text-sm tracking-tight leading-snug truncate" title={displayName}>
            {displayName}
          </h3>
        </div>

        <button
          onClick={() => setSelectedId(null)}
          className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition shrink-0"
          title="Close inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {primaryImage && (
        <img
          src={primaryImage}
          alt={f.name}
          className="w-full h-36 object-cover rounded-2xl border border-white/15 mb-3"
        />
      )}

      {/* Coordinates & Google Maps Link for Point features */}
      {f.geometry.type === 'Point' && (
        <div className="flex flex-col gap-1.5 mb-2.5">
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/10 text-[10.5px]">
            <span className="font-mono text-zinc-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>{f.geometry.coordinates[1].toFixed(5)}, {f.geometry.coordinates[0].toFixed(5)}</span>
            </span>
            <button
              type="button"
              onClick={handleCopyCoords}
              className="text-[10px] text-zinc-300 hover:text-white font-semibold flex items-center gap-1 transition px-1.5 py-0.5 rounded hover:bg-white/10"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-[10.5px] text-zinc-200 hover:bg-white/[0.07] hover:text-white transition"
              aria-label={`View ${displayName} in Google Maps`}
            >
              <span className="flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                <span>Open in Google Maps</span>
              </span>
              <span className="text-[10px] text-zinc-400">Directions ↗</span>
            </a>
          )}
        </div>
      )}

      {/* Attribute Properties List */}
      <div className="max-h-48 overflow-y-auto pr-1 flex flex-col gap-1 mb-3">
        {isOpenNodePlace ? (
          <>
          {readablePlaceDetails.map(([label, value]) => (
            <div key={label} className="flex justify-between items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-white/5 border-b border-white/5 transition">
              <span className="text-zinc-400 text-[10px] truncate max-w-[100px]">{label}</span>
              <span className="text-zinc-200 text-right font-medium text-[10.5px] truncate max-w-[170px]">{value}</span>
            </div>
          ))}
          {hasPriceRange && <div className="flex justify-between items-center gap-2 py-1 px-1.5 rounded-lg border-b border-white/5"><span className="text-zinc-400 text-[10px]">Price range (PHP / MYR)</span><span className="text-zinc-200 text-right font-medium text-[10.5px]">{priceRange}</span></div>}
          </>
        ) : f.props.attributes && Object.keys(f.props.attributes).length > 0 ? (
          Object.entries(f.props.attributes)
            .filter(([_, v]) => typeof v === 'string' && !v.startsWith('data:image'))
            .map(([k, v]) => (
              <div key={k} className="flex justify-between items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-white/5 border-b border-white/5 transition">
                <span className="text-zinc-400 font-mono text-[10px] truncate max-w-[100px]">{k}</span>
                <span className="text-zinc-200 text-right font-medium text-[10.5px] truncate max-w-[170px]">{String(v)}</span>
              </div>
            ))
        ) : (
          <div className="text-zinc-500 py-3 text-center text-[10.5px]">No metadata attributes available</div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-2.5 border-t border-white/10">
        <span className="text-[9.5px] text-zinc-500 font-mono">
          ID: {f.id}
        </span>
        <button
          onClick={handleOpenTable}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-bold transition shadow-sm"
        >
          <Table className="w-3.5 h-3.5 text-white" />
          <span>Attribute Table</span>
        </button>
      </div>
    </div>
  );
};
