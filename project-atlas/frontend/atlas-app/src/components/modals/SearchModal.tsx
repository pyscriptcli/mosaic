'use client';

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  Building2,
  Check,
  ChevronRight,
  Compass,
  History,
  Info,
  Loader2,
  MapPin,
  Navigation2,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import { getIconKey } from '../../gis/markers';
import { GISFeature } from '../../types/gis';

interface SearchModalProps {
  mapInstance: any;
}

export type PlaceResult = {
  place_id: number;
  osm_id?: number | string;
  osm_type?: string;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  type?: string;
  class?: string;
  category?: string;
  addresstype?: string;
  address?: Record<string, string>;
  boundingbox?: [string, string, string, string];
};

type RecentSearch = {
  id: string;
  query: string;
  title: string;
  subtitle: string;
  lat: string;
  lon: string;
  timestamp: number;
};

const RECENT_SEARCHES_KEY = 'atlas_recent_searches_v2';
const MAX_RECENTS = 5;

const humanize = (text?: string): string => {
  if (!text) return '';
  return text
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getPlaceTitle = (place: PlaceResult): string => {
  if (place.name && place.name.trim().length > 0) return place.name.trim();
  const first = place.display_name?.split(',')[0]?.trim();
  return first || 'Unnamed Location';
};

const getPlaceSubtitle = (place: PlaceResult): string => {
  if (place.address) {
    const parts = [
      place.address.quarter || place.address.suburb || place.address.neighbourhood,
      place.address.city || place.address.town || place.address.municipality || place.address.village,
      place.address.state_district || place.address.state || place.address.region,
      place.address.country,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }

  const parts = (place.display_name || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return humanize(place.type || place.class || place.addresstype || 'Location');
  }
  return parts.slice(1, 4).join(', ');
};

const getPlaceCategoryBadge = (place: PlaceResult): { label: string; color: string } => {
  const cls = (place.class || '').toLowerCase();
  const type = (place.type || '').toLowerCase();
  const addrType = (place.addresstype || '').toLowerCase();

  if (['restaurant', 'cafe', 'bar', 'fast_food', 'pub', 'bakery'].includes(type)) {
    return { label: humanize(type), color: 'text-amber-300 bg-amber-400/10 border-amber-400/20' };
  }
  if (['mall', 'supermarket', 'convenience', 'shop', 'department_store'].includes(type) || cls === 'shop') {
    return { label: humanize(type || 'Shop'), color: 'text-sky-300 bg-sky-400/10 border-sky-400/20' };
  }
  if (['hospital', 'clinic', 'pharmacy', 'doctors'].includes(type) || cls === 'healthcare') {
    return { label: humanize(type || 'Medical'), color: 'text-rose-300 bg-rose-400/10 border-rose-400/20' };
  }
  if (['city', 'town', 'village', 'suburb', 'quarter', 'district'].includes(addrType) || ['city', 'town', 'village'].includes(type)) {
    return { label: humanize(addrType || type || 'City'), color: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20' };
  }
  if (cls === 'building') {
    return { label: 'Building', color: 'text-indigo-300 bg-indigo-400/10 border-indigo-400/20' };
  }
  if (cls === 'boundary') {
    return { label: 'Boundary', color: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20' };
  }
  if (cls === 'highway' || type === 'street') {
    return { label: 'Road', color: 'text-zinc-300 bg-zinc-400/10 border-zinc-400/20' };
  }
  return { label: humanize(type || cls || 'Place'), color: 'text-zinc-300 bg-white/10 border-white/15' };
};

const getZoomForPlace = (place: PlaceResult): number => {
  if (place.class === 'building' || ['house', 'restaurant', 'cafe', 'shop', 'amenity'].includes(place.type || '')) return 17;
  if (['quarter', 'suburb', 'neighbourhood'].includes(place.addresstype || place.type || '')) return 15;
  if (['city', 'town', 'municipality'].includes(place.addresstype || place.type || '')) return 13;
  if (['state', 'region', 'province', 'boundary'].includes(place.class || place.type || '')) return 10;
  return 15;
};

export const SearchModal: React.FC<SearchModalProps> = ({ mapInstance }) => {
  const {
    activePanels,
    togglePanel,
    setToast,
    addFeature,
    setSelectedId,
    features,
    markerShape,
    markerColor,
    markerSize,
    markerSizeMode,
    customMarkerKey,
  } = useMapStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [isPending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecents(parsed.slice(0, MAX_RECENTS));
        }
      }
    } catch {
      // Local storage unreadable or unavailable
    }
  }, []);

  const saveRecentSearch = (place: PlaceResult) => {
    try {
      const title = getPlaceTitle(place);
      const subtitle = getPlaceSubtitle(place);
      const newEntry: RecentSearch = {
        id: `${place.place_id || Date.now()}`,
        query: title,
        title,
        subtitle,
        lat: place.lat,
        lon: place.lon,
        timestamp: Date.now(),
      };

      setRecents((prev) => {
        const filtered = prev.filter((r) => r.title !== title && r.id !== newEntry.id);
        const updated = [newEntry, ...filtered].slice(0, MAX_RECENTS);
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch {
      // Ignore localStorage error
    }
  };

  const clearRecentSearches = () => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
      setRecents([]);
    } catch {
      // Ignore
    }
  };

  const closeSearch = () => {
    togglePanel('search', false);
    setQuery('');
    setResults([]);
    setErrorMsg(null);
    setActiveIndex(-1);
  };

  // Focus input when opened
  useEffect(() => {
    if (!activePanels.search) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(focusTimer);
  }, [activePanels.search]);

  // Debounced search via /api/geocode with viewport bias
  useEffect(() => {
    const trimmedQuery = query.trim();
    const requestId = ++requestIdRef.current;

    if (trimmedQuery.length < 2) {
      setResults([]);
      setErrorMsg(null);
      setIsLoading(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        let viewboxParam = '';
        if (mapInstance && typeof mapInstance.getBounds === 'function') {
          try {
            const bounds = mapInstance.getBounds();
            if (bounds) {
              const west = bounds.getWest().toFixed(4);
              const north = bounds.getNorth().toFixed(4);
              const east = bounds.getEast().toFixed(4);
              const south = bounds.getSouth().toFixed(4);
              viewboxParam = `&viewbox=${west},${north},${east},${south}`;
            }
          } catch {
            // Viewbox fallback
          }
        }

        const url = `/api/geocode?q=${encodeURIComponent(trimmedQuery)}&limit=8&addressdetails=1&extratags=1${viewboxParam}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Search unavailable (HTTP ${response.status})`);
        const data = await response.json();
        if (data?.error) throw new Error(data.error);

        if (requestId !== requestIdRef.current) return;

        startTransition(() => {
          setResults(Array.isArray(data) ? data : []);
          setActiveIndex(-1);
        });
      } catch (error) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setResults([]);
        setErrorMsg(error instanceof Error ? error.message : 'Could not search places. Try again.');
      } finally {
        if (!controller.signal.aborted && requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, mapInstance]);

  /**
   * Industry-standard place selection:
   * 1. Smooth cinematic camera fly/fit to location
   * 2. Automatically drop or select a stylish pin on the map
   * 3. Highlight the place with a pin pulse
   * 4. Auto-select the feature so FeaturePopup appears instantly
   * 5. Save into recent searches
   */
  const handleSelectLocation = useCallback(
    (place: PlaceResult) => {
      const lat = Number.parseFloat(place.lat);
      const lon = Number.parseFloat(place.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const title = getPlaceTitle(place);
      const subtitle = getPlaceSubtitle(place);
      const targetZoom = getZoomForPlace(place);

      // 1. Camera animation
      if (mapInstance) {
        const bounds = place.boundingbox?.map(Number.parseFloat);
        if (bounds?.length === 4 && bounds.every(Number.isFinite)) {
          const [south, north, west, east] = bounds;
          const latDiff = Math.abs(north - south);
          const lonDiff = Math.abs(east - west);
          if (latDiff > 0.005 || lonDiff > 0.005) {
            mapInstance.fitBounds([[west, south], [east, north]], {
              padding: { top: 96, right: 64, bottom: 80, left: 64 },
              maxZoom: targetZoom,
              duration: 1200,
            });
          } else {
            mapInstance.flyTo({
              center: [lon, lat],
              zoom: targetZoom,
              duration: 1200,
              essential: true,
            });
          }
        } else {
          mapInstance.flyTo({
            center: [lon, lat],
            zoom: targetZoom,
            duration: 1200,
            essential: true,
          });
        }
      }

      // 2. Check if a marker at this exact or near coordinate already exists
      const existingPin = features.find(
        (f) =>
          f.kind === 'marker' &&
          f.geometry.type === 'Point' &&
          Math.abs(f.geometry.coordinates[0] - lon) < 0.0001 &&
          Math.abs(f.geometry.coordinates[1] - lat) < 0.0001
      );

      let pinId: number;
      if (existingPin) {
        pinId = existingPin.id;
      } else {
        pinId = Date.now() + Math.floor(Math.random() * 1000);
        const iconKey = customMarkerKey || getIconKey(markerShape, markerColor, mapInstance);
        const newMarker: GISFeature = {
          id: pinId,
          name: title,
          kind: 'marker',
          geometry: {
            type: 'Point',
            coordinates: [lon, lat],
          },
          props: {
            shape: markerShape,
            color: markerColor,
            iconSize: markerSize,
            iconSizeMode: markerSizeMode,
            iconKey,
            visible: 1,
            category: place.class?.toUpperCase() || 'SEARCH_RESULT',
            poiType: place.type || place.addresstype || 'Location',
            osmType: place.osm_type,
            osmId: typeof place.osm_id === 'number' ? place.osm_id : Number(place.osm_id) || undefined,
            osmTags: {
              name: title,
              'addr:full': subtitle,
              ...(place.class ? { class: String(place.class) } : {}),
              ...(place.type ? { type: String(place.type) } : {}),
              ...(place.osm_id ? { osm_id: String(place.osm_id) } : {}),
            },
            attributes: {
              name: title,
              address: subtitle,
              source: 'OpenStreetMap Nominatim',
            },
          },
        };

        addFeature(newMarker);
      }

      // 3. Immediately select the pin on map to activate its card/popup
      setSelectedId(pinId);
      saveRecentSearch(place);

      // 4. Close search dropdown & toast user
      togglePanel('search', false);
      setToast(`Located and pinned ${title}`);
      setQuery('');
      setResults([]);
    },
    [
      mapInstance,
      features,
      markerShape,
      markerColor,
      markerSize,
      markerSizeMode,
      customMarkerKey,
      addFeature,
      setSelectedId,
      togglePanel,
      setToast,
    ]
  );

  const handleSelectRecent = (recent: RecentSearch) => {
    handleSelectLocation({
      place_id: Number(recent.id) || 0,
      lat: recent.lat,
      lon: recent.lon,
      name: recent.title,
      display_name: `${recent.title}, ${recent.subtitle}`,
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (results.length > 0) {
        setActiveIndex((prev) => (prev + 1) % results.length);
      } else if (recents.length > 0) {
        setActiveIndex((prev) => (prev + 1) % recents.length);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length > 0) {
        setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
      } else if (recents.length > 0) {
        setActiveIndex((prev) => (prev <= 0 ? recents.length - 1 : prev - 1));
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (results.length > 0) {
        const selected = results[activeIndex] || results[0];
        if (selected) handleSelectLocation(selected);
      } else if (!query && recents.length > 0) {
        const selectedRecent = recents[activeIndex] || recents[0];
        if (selectedRecent) handleSelectRecent(selectedRecent);
      }
    } else if (event.key === 'Escape') {
      closeSearch();
    }
  };

  return (
    <section aria-label="Search places" className="relative flex shrink-0 items-center">
      {activePanels.search ? (
        <div className="flex h-9 w-[min(20rem,42vw)] min-w-0 items-center gap-2 rounded-full border border-white/20 bg-zinc-900/90 px-3 text-zinc-200 shadow-lg backdrop-blur-md transition-all focus-within:border-sky-400/80 focus-within:ring-2 focus-within:ring-sky-400/20">
          <Search size={15} className="shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Search places, addresses, or landmarks"
            aria-autocomplete="list"
            aria-expanded={activePanels.search && (results.length > 0 || recents.length > 0)}
            aria-controls="place-search-dropdown"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search places, roads, landmarks…"
            autoComplete="off"
            className="!m-0 h-full min-w-0 flex-1 !border-0 !bg-transparent !p-0 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          {isLoading ? (
            <Loader2 size={15} className="shrink-0 animate-spin text-sky-400" />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                inputRef.current?.focus();
              }}
              aria-label="Clear search query"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X size={14} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Close place search"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => togglePanel('search', true)}
          aria-label="Search places and addresses"
          title="Search places (Nominatim / OSM)"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          <Search size={17} strokeWidth={2.1} />
        </button>
      )}

      {/* Floating Results & Recents Dropdown */}
      {activePanels.search && (
        <div
          id="place-search-dropdown"
          className="absolute left-1/2 top-full z-[1200] mt-2.5 w-[min(30rem,94vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/15 bg-zinc-950/95 text-zinc-200 shadow-2xl backdrop-blur-2xl"
        >
          {errorMsg && (
            <div role="status" className="flex items-center gap-2 px-4 py-3 text-xs text-rose-300 border-b border-white/10 bg-rose-500/10">
              <Info size={14} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Real-Time Results List */}
          {results.length > 0 && (
            <ul role="listbox" aria-label="Place search results" className="max-h-[min(60vh,420px)] overflow-y-auto py-1 divide-y divide-white/[0.04]">
              {results.map((place, index) => {
                const title = getPlaceTitle(place);
                const subtitle = getPlaceSubtitle(place);
                const badge = getPlaceCategoryBadge(place);
                const isSelected = activeIndex === index;

                return (
                  <li key={place.place_id || index} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => handleSelectLocation(place)}
                      className={`flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition ${
                        isSelected ? 'bg-white/10' : 'hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-sky-400">
                        <MapPin size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="block truncate text-[13.5px] font-semibold text-zinc-100">
                            {title}
                          </span>
                          <span
                            className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wider ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="mt-0.5 block truncate text-[12px] text-zinc-400">
                          {subtitle}
                        </p>
                      </div>
                      <ChevronRight size={14} className="shrink-0 self-center text-zinc-500 opacity-60" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Empty State when Query is typed but no results */}
          {!errorMsg && !isLoading && query.trim().length >= 2 && results.length === 0 && (
            <div className="px-5 py-6 text-center text-xs text-zinc-400">
              <p className="font-medium text-zinc-300">No matching places found</p>
              <p className="mt-1 text-zinc-500">Try a different spelling, street address, or nearby landmark.</p>
            </div>
          )}

          {/* Recents list if input is empty */}
          {!query.trim() && recents.length > 0 && (
            <div className="p-2">
              <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <History size={13} className="text-zinc-500" />
                  Recent Searches
                </span>
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition"
                  title="Clear recent searches"
                >
                  <Trash2 size={11} />
                  Clear
                </button>
              </div>
              <ul className="mt-1 space-y-0.5">
                {recents.map((recent, index) => {
                  const isSelected = activeIndex === index;
                  return (
                    <li key={recent.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => handleSelectRecent(recent)}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                          isSelected ? 'bg-white/10' : 'hover:bg-white/[0.06]'
                        }`}
                      >
                        <MapPin size={14} className="shrink-0 text-zinc-500" />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-zinc-200">
                            {recent.title}
                          </span>
                          <span className="block truncate text-[11px] text-zinc-500">
                            {recent.subtitle}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Empty Recents prompt */}
          {!query.trim() && recents.length === 0 && (
            <div className="px-4 py-5 text-center text-xs text-zinc-500">
              <p className="text-zinc-400 font-medium">Search the globe</p>
              <p className="mt-1 text-[11px] text-zinc-500">Type any city, street, business, or coordinates to fly to and drop a pin on the map.</p>
            </div>
          )}

          {/* Footer attribution & tips */}
          <div className="flex items-center justify-between border-t border-white/[0.08] px-3.5 py-2 text-[10.5px] text-zinc-500">
            <span>Powered by OpenStreetMap &amp; Nominatim</span>
            <span className="hidden sm:inline">Press Enter to select · Esc to close</span>
          </div>
        </div>
      )}
    </section>
  );
};
