'use client';

import React from 'react';
import {
  Edit3,
  BringToFront,
  SendToBack,
  Table,
  Copy,
  MapPin,
  Eye,
  Trash2,
} from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

export const MapContextMenu: React.FC = () => {
  const {
    contextMenu,
    closeContextMenu,
    features,
    setFeatures,
    removeFeature,
    setEditMode,
    togglePanel,
    setSelectedId,
    setToast,
  } = useMapStore();

  if (!contextMenu.visible || !contextMenu.lngLat) return null;

  const [lng, lat] = contextMenu.lngLat;
  const featId = contextMenu.featureId;

  const handleCopy = () => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setToast(`Copied: ${text}`);
    }
    closeContextMenu();
  };

  const handleEdit = () => {
    if (featId) {
      setSelectedId(featId);
      setEditMode(true, featId);
      togglePanel('shapeEditor', true);
      setToast('Edit mode active: Drag vertices, rotate with top handle, or move feature');
    }
    closeContextMenu();
  };

  const handleBringFront = () => {
    if (featId) {
      const idx = features.findIndex((x) => x.id === featId);
      if (idx !== -1 && idx < features.length - 1) {
        const next = [...features];
        const [item] = next.splice(idx, 1);
        next.push(item);
        setFeatures(next);
        setToast(`"${item.name}" brought to front`);
      }
    }
    closeContextMenu();
  };

  const handleSendBack = () => {
    if (featId) {
      const idx = features.findIndex((x) => x.id === featId);
      if (idx > 0) {
        const next = [...features];
        const [item] = next.splice(idx, 1);
        next.unshift(item);
        setFeatures(next);
        setToast(`"${item.name}" sent to back`);
      }
    }
    closeContextMenu();
  };

  const handleOpenDataTable = () => {
    if (featId) {
      setSelectedId(featId);
      togglePanel('attributeTable', true);
    }
    closeContextMenu();
  };

  const handleDelete = () => {
    if (featId) {
      removeFeature(featId);
      setToast('Feature deleted');
    }
    closeContextMenu();
  };

  const handleOpenGMaps = () => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
    closeContextMenu();
  };

  const handleOpenStreetView = () => {
    window.open(
      `https://www.google.com/maps/@${lat},${lng},3a,75y,90t/data=!3m6!1e1!3m4!1s!2e0!7i13312!8i6656`,
      '_blank'
    );
    closeContextMenu();
  };

  return (
    <div
      className="fixed z-[3000] min-w-[210px] bg-[rgba(9,16,24,0.98)] border border-white/20 rounded-xl p-1.5 shadow-2xl backdrop-blur-md text-xs text-gray-200"
      style={{
        left: `${Math.min(contextMenu.x, window.innerWidth - 230)}px`,
        top: `${Math.min(contextMenu.y, window.innerHeight - 280)}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 font-mono text-[10px] text-gray-400 border-b border-white/10 mb-1">
        {lat.toFixed(6)}, {lng.toFixed(6)}
      </div>

      {featId && (
        <>
          <button
            onClick={handleEdit}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
          >
            <Edit3 className="w-3.5 h-3.5 text-sky-400" />
            <span>Edit Feature</span>
          </button>

          <button
            onClick={handleBringFront}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
          >
            <BringToFront className="w-3.5 h-3.5 text-gray-300" />
            <span>Bring to Front</span>
          </button>

          <button
            onClick={handleSendBack}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
          >
            <SendToBack className="w-3.5 h-3.5 text-gray-300" />
            <span>Send to Back</span>
          </button>

          <button
            onClick={handleOpenDataTable}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
          >
            <Table className="w-3.5 h-3.5 text-amber-400" />
            <span>Open Data Table</span>
          </button>

          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-red-500/20 text-rose-400 text-left transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Feature</span>
          </button>

          <div className="h-[1px] bg-white/10 my-1" />
        </>
      )}

      <button
        onClick={handleCopy}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
      >
        <Copy className="w-3.5 h-3.5 text-gray-400" />
        <span>Copy Coordinates</span>
      </button>

      <button
        onClick={handleOpenGMaps}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
      >
        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
        <span>Open in Google Maps</span>
      </button>

      <button
        onClick={handleOpenStreetView}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
      >
        <Eye className="w-3.5 h-3.5 text-sky-400" />
        <span>Open in Street View</span>
      </button>
    </div>
  );
};
