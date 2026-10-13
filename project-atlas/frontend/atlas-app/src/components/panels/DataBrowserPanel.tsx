'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Layers,
  X,
  ChevronRight,
  ChevronDown,
  Upload,
  Loader2,
} from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

interface DataBrowserPanelProps {
  onImportClick: () => void;
  mapInstance: any;
}

export const DataBrowserPanel: React.FC<DataBrowserPanelProps> = ({
  onImportClick,
  mapInstance,
}) => {
  const {
    activePanels,
    togglePanel,
    visibilities,
    setVisibility,
    is3DMode,
    set3DMode,
    addFeature,
    setSelectedId,
    setToast,
  } = useMapStore();

  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    labels: false,
    roads: false,
    buildings: false,
    water: false,
    boundaries: false,
  });

  const [boundarySearch, setBoundarySearch] = useState('');
  const [boundaryResults, setBoundaryResults] = useState<any[]>([]);
  const [isSearchingBoundary, setIsSearchingBoundary] = useState(false);
  const [hasSearchedBoundary, setHasSearchedBoundary] = useState(false);
  const searchReqIdRef = useRef(0);
  const selectedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = boundarySearch.trim();
    if (selectedQueryRef.current === trimmed) {
      return;
    }
    selectedQueryRef.current = null;

    if (trimmed.length < 2) {
      setBoundaryResults([]);
      setIsSearchingBoundary(false);
      setHasSearchedBoundary(false);
      return;
    }

    const reqId = ++searchReqIdRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearchingBoundary(true);
      try {
        const res = await fetch(
          `/api/geocode?polygon_geojson=1&limit=12&q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        if (reqId !== searchReqIdRef.current) return;
        if (Array.isArray(data)) {
          const polyMatches = data.filter(
            (item) =>
              item?.geojson &&
              (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon')
          );
          setBoundaryResults(polyMatches.length > 0 ? polyMatches : data);
        } else {
          setBoundaryResults([]);
        }
        setHasSearchedBoundary(true);
      } catch {
        if (!controller.signal.aborted && reqId === searchReqIdRef.current) {
          setBoundaryResults([]);
          setHasSearchedBoundary(true);
        }
      } finally {
        if (!controller.signal.aborted && reqId === searchReqIdRef.current) {
          setIsSearchingBoundary(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [boundarySearch]);

  if (!activePanels.browser) return null;

  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleBoundarySearch = (val: string) => {
    selectedQueryRef.current = null;
    setBoundarySearch(val);
  };

  const handleSelectBoundary = (item: any) => {
    let geom = item.geojson;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
      if (item.boundingbox && item.boundingbox.length === 4) {
        const south = parseFloat(item.boundingbox[0]);
        const north = parseFloat(item.boundingbox[1]);
        const west = parseFloat(item.boundingbox[2]);
        const east = parseFloat(item.boundingbox[3]);
        geom = {
          type: 'Polygon',
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        };
      } else {
        return;
      }
    }

    const newId = Date.now();
    const shortName = item.display_name.split(',')[0];
    addFeature({
      id: newId,
      name: `${shortName} Boundary`,
      kind: 'polygon',
      geometry: geom,
      props: {
        borderColor: '#ff1e1e',
        borderOpacity: 1.0,
        width: 3,
        fillColor: '#ff1e1e',
        fillOpacity: 0.15,
        showLabel: true,
        visible: 1,
        attributes: { name: item.display_name },
      },
    });
    setSelectedId(newId);

    if (item.boundingbox && mapInstance) {
      mapInstance.fitBounds(
        [
          [parseFloat(item.boundingbox[2]), parseFloat(item.boundingbox[0])],
          [parseFloat(item.boundingbox[3]), parseFloat(item.boundingbox[1])],
        ],
        { padding: 60 }
      );
    }

    selectedQueryRef.current = item.display_name.trim();
    setBoundarySearch(item.display_name);
    setBoundaryResults([]);
    setHasSearchedBoundary(false);
    setToast(`Boundary added for ${shortName}`);
  };

  return (
    <div className="fixed top-16 left-4 bottom-4 w-96 z-[999] bg-[rgba(9,16,24,0.97)] border border-white/15 rounded-3xl p-4 shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden text-xs text-gray-300">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2 font-bold text-white text-sm">
          <Layers className="w-4 h-4 text-sky-400" />
          <span>Data Browser</span>
        </div>
        <button
          onClick={() => togglePanel('browser', false)}
          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pr-1 py-3 flex flex-col gap-3">
        {/* Import Action */}
        <button
          onClick={onImportClick}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-blue-600 hover:bg-blue-500 font-semibold text-white rounded-xl shadow-lg shadow-blue-500/20 transition"
        >
          <Upload className="w-4 h-4" />
          <span>Import Spatial Data (KML, GeoJSON, SHP)</span>
        </button>

        {/* 2D / 3D Dimension Switcher */}
        <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => {
              set3DMode(false);
              if (mapInstance) mapInstance.easeTo({ pitch: 0 });
            }}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition ${
              !is3DMode ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            2D MAP
          </button>
          <button
            onClick={() => {
              set3DMode(true);
              if (mapInstance) mapInstance.easeTo({ pitch: 60, bearing: -15 });
            }}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition ${
              is3DMode ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            3D BUILDINGS
          </button>
        </div>

        {/* Accordions */}
        {/* Labels */}
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <div
            onClick={() => toggleAccordion('labels')}
            className="flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 cursor-pointer font-semibold text-gray-200"
          >
            <span>Labels</span>
            {openAccordions.labels ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
          {openAccordions.labels && (
            <div className="p-3 bg-black/20 flex flex-col gap-2">
              {[
                ['City', 'label_city'],
                ['Barangay', 'label_brgy'],
                ['Street', 'label_street'],
                ['POI Icons', 'poi_icons'],
                ['POI Labels', 'poi_labels'],
              ].map(([label, key]) => (
                <label key={key} className="flex items-center justify-between cursor-pointer">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={visibilities[key]}
                    onChange={(e) => setVisibility(key, e.target.checked)}
                    className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Roads & Transit */}
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <div
            onClick={() => toggleAccordion('roads')}
            className="flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 cursor-pointer font-semibold text-gray-200"
          >
            <span>Roads & Transit</span>
            {openAccordions.roads ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
          {openAccordions.roads && (
            <div className="p-3 bg-black/20 flex flex-col gap-2">
              {[
                ['Expressway', 'road_exp'],
                ['Main Road', 'road_main'],
                ['Secondary Road', 'road_sec'],
                ['Tertiary Road', 'road_ter'],
                ['Railways', 'rd_rail'],
              ].map(([label, key]) => (
                <label key={key} className="flex items-center justify-between cursor-pointer">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={visibilities[key]}
                    onChange={(e) => setVisibility(key, e.target.checked)}
                    className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Buildings */}
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <div
            onClick={() => toggleAccordion('buildings')}
            className="flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 cursor-pointer font-semibold text-gray-200"
          >
            <span>Buildings</span>
            {openAccordions.buildings ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
          {openAccordions.buildings && (
            <div className="p-3 bg-black/20 flex flex-col gap-2">
              {[
                ['2D Buildings', 'building2d'],
                ['3D Buildings', 'building3d'],
              ].map(([label, key]) => (
                <label key={key} className="flex items-center justify-between cursor-pointer">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={visibilities[key]}
                    onChange={(e) => setVisibility(key, e.target.checked)}
                    className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Water */}
        <div className="border border-white/5 rounded-xl overflow-hidden">
          <div
            onClick={() => toggleAccordion('water')}
            className="flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 cursor-pointer font-semibold text-gray-200"
          >
            <span>Water</span>
            {openAccordions.water ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
          {openAccordions.water && (
            <div className="p-3 bg-black/20 flex flex-col gap-2">
              {[
                ['Water Bodies', 'water'],
                ['Waterways', 'waterway'],
              ].map(([label, key]) => (
                <label key={key} className="flex items-center justify-between cursor-pointer">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={visibilities[key]}
                    onChange={(e) => setVisibility(key, e.target.checked)}
                    className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Administrative Boundaries */}
        <div className="border border-white/5 rounded-xl">
          <div
            onClick={() => toggleAccordion('boundaries')}
            className={`flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 cursor-pointer font-semibold text-gray-200 ${
              openAccordions.boundaries ? 'rounded-t-xl' : 'rounded-xl'
            }`}
          >
            <span>Boundaries (Red Dashed)</span>
            {openAccordions.boundaries ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
          {openAccordions.boundaries && (
            <div className="p-3 bg-black/20 flex flex-col gap-2.5 rounded-b-xl">
              {[
                ['All Provinces', 'bound_prov'],
                ['All Cities', 'bound_city'],
                ['All Barangays', 'bound_brgy'],
              ].map(([label, key]) => (
                <label key={key} className="flex items-center justify-between cursor-pointer">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={visibilities[key]}
                    onChange={(e) => setVisibility(key, e.target.checked)}
                    className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
              ))}

              <div className="pt-2 border-t border-white/10">
                <span className="font-semibold text-white text-[11px] block mb-1">
                  Highlight Boundary Polygon
                </span>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={boundarySearch}
                    onChange={(e) => handleBoundarySearch(e.target.value)}
                    placeholder="Search province, city..."
                    className="w-full bg-black/40 border border-white/15 rounded-lg pl-2.5 pr-7 py-1.5 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-sky-400"
                  />
                  {isSearchingBoundary ? (
                    <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin absolute right-2 pointer-events-none" />
                  ) : boundarySearch ? (
                    <button
                      type="button"
                      onClick={() => {
                        selectedQueryRef.current = null;
                        setBoundarySearch('');
                        setBoundaryResults([]);
                        setHasSearchedBoundary(false);
                      }}
                      className="absolute right-1.5 p-0.5 rounded text-gray-400 hover:text-white"
                      aria-label="Clear boundary search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>

                {boundaryResults.length > 0 && (
                  <div className="mt-2 bg-slate-900 border border-white/15 rounded-lg max-h-56 overflow-y-auto shadow-2xl divide-y divide-white/5">
                    {boundaryResults.map((r, i) => (
                      <button
                        type="button"
                        key={r.place_id || i}
                        onClick={() => handleSelectBoundary(r)}
                        className="w-full text-left px-3 py-2 hover:bg-white/10 cursor-pointer transition block"
                      >
                        <div className="font-semibold text-white leading-snug">{r.display_name}</div>
                        <div className="text-[10px] text-gray-400 capitalize mt-0.5">
                          {r.addresstype || r.type || r.class || 'Boundary'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!isSearchingBoundary && hasSearchedBoundary && boundaryResults.length === 0 && (
                  <div className="mt-2 px-3 py-2 bg-slate-900/80 border border-white/10 rounded-lg text-[11px] text-gray-400">
                    No matching boundaries found.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
