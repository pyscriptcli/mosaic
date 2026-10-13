'use client';

import React, { useState } from 'react';
import { Table, X, Plus, Trash2, Search, Upload } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import {
  initializeFeatureAttributes,
  updateAttributeCell,
  addAttributeColumn,
  addAttributeRow,
  removeAttributeRow,
} from '../../gis/attributes';

export const AttributeTableModal: React.FC = () => {
  const { activePanels, togglePanel, selectedId, features, updateFeature } = useMapStore();
  const [searchTerm, setSearchTerm] = useState('');

  if (!activePanels.attributeTable || !selectedId) return null;
  const f = features.find((x) => x.id === selectedId);
  if (!f) return null;

  const initialized = initializeFeatureAttributes(f);
  const types = initialized.props.attrTypes || { name: 'text', description: 'text' };
  const cols = Object.keys(types);
  const rows = initialized.props.attrRows || [{ ...initialized.props.attributes }];

  const filteredRows = rows.map((r, originalIdx) => ({ r, originalIdx })).filter(({ r }) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(r).some((v) => String(v).toLowerCase().includes(term));
  });

  const handleCellChange = (rIdx: number, col: string, val: string) => {
    updateFeature(f.id, (feat) => updateAttributeCell(feat, rIdx, col, val));
  };

  const handleAddColumn = () => {
    const colName = prompt('Enter new column name:');
    if (!colName || !colName.trim()) return;
    const isImage = confirm('Is this column for Images? (Click Cancel for standard Text)');
    updateFeature(f.id, (feat) =>
      addAttributeColumn(feat, colName.trim(), isImage ? 'image' : 'text')
    );
  };

  const handleAddRow = () => {
    updateFeature(f.id, (feat) => addAttributeRow(feat));
  };

  const handleRemoveRow = (rIdx: number) => {
    updateFeature(f.id, (feat) => removeAttributeRow(feat, rIdx));
  };

  const handleImageUpload = (rIdx: number, col: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        handleCellChange(rIdx, col, String(e.target.result));
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl max-h-[85vh] overflow-hidden bg-[rgba(9,16,24,0.98)] border border-white/15 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-xs text-gray-300 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 font-bold text-white text-base">
            <Table className="w-5 h-5 text-amber-400" />
            <span>Attributes: {f.name}</span>
          </div>
          <button
            onClick={() => togglePanel('attributeTable', false)}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter attributes..."
              className="w-full bg-black/40 border border-white/15 rounded-xl pl-9 pr-3 py-2 text-white placeholder-gray-500 text-xs outline-none focus:border-sky-400"
            />
          </div>

          <button
            onClick={handleAddColumn}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 font-semibold text-white rounded-xl transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Column</span>
          </button>

          <button
            onClick={handleAddRow}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 font-semibold text-white rounded-xl transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </button>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-x-auto overflow-y-auto border border-white/10 rounded-2xl">
          <table className="w-full border-collapse text-left">
            <thead className="bg-black/60 sticky top-0 z-10 border-b border-white/15">
              <tr>
                {cols.map((col) => (
                  <th key={col} className="p-3 font-semibold text-gray-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{col}</span>
                      <select
                        value={types[col] || 'text'}
                        onChange={(e) => {
                          const nextTypes = { ...types, [col]: e.target.value as 'text' | 'image' };
                          updateFeature(f.id, (feat) => ({
                            ...feat,
                            props: { ...feat.props, attrTypes: nextTypes },
                          }));
                        }}
                        className="bg-black/80 border border-white/15 rounded text-[10px] text-gray-300 px-1 py-0.5"
                      >
                        <option value="text">Text</option>
                        <option value="image">Image</option>
                      </select>
                    </div>
                  </th>
                ))}
                <th className="p-3 w-12 text-center text-gray-400">Del</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredRows.map(({ r, originalIdx }) => (
                <tr key={originalIdx} className="hover:bg-white/[0.02]">
                  {cols.map((col) => {
                    const val = r[col] || '';
                    const colType = types[col] || 'text';

                    return (
                      <td key={col} className="p-2.5">
                        {colType === 'image' ? (
                          val && val.startsWith('data:image') ? (
                            <div className="relative group w-20 h-20">
                              <img
                                src={val}
                                alt={col}
                                className="w-20 h-20 object-cover rounded-lg border border-white/20"
                              />
                              <label className="absolute inset-0 bg-black/60 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition">
                                Replace
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    if (e.target.files?.[0]) {
                                      handleImageUpload(originalIdx, col, e.target.files[0]);
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          ) : (
                            <label className="w-20 h-20 border border-dashed border-white/20 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-white/40 cursor-pointer transition">
                              <Upload className="w-4 h-4 mb-1" />
                              <span className="text-[9px]">Upload</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files?.[0]) {
                                    handleImageUpload(originalIdx, col, e.target.files[0]);
                                  }
                                }}
                              />
                            </label>
                          )
                        ) : (
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => handleCellChange(originalIdx, col, e.target.value)}
                            className="w-full bg-transparent border border-white/10 rounded-lg px-2 py-1 text-white text-xs outline-none focus:border-sky-400"
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2.5 text-center">
                    <button
                      onClick={() => handleRemoveRow(originalIdx)}
                      className="p-1 rounded text-gray-500 hover:text-rose-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
