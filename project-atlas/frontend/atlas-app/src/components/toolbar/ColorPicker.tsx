'use client';

import React, { useEffect, useState } from 'react';
import { Pipette } from 'lucide-react';
import { COLOR_PALETTES } from '../../gis/map';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, label }) => {
  const [hexInput, setHexInput] = useState(color);
  const [activePalette, setActivePalette] = useState(COLOR_PALETTES[0].name);

  useEffect(() => {
    setHexInput(color);
    const matchingPalette = COLOR_PALETTES.find((palette) =>
      palette.colors.some((preset) => preset.toLowerCase() === color.toLowerCase())
    );
    if (matchingPalette) setActivePalette(matchingPalette.name);
  }, [color]);

  const handleUpdate = (newColor: string) => {
    setHexInput(newColor);
    onChange(newColor);
  };

  const handleEyeDropper = async () => {
    if (typeof window !== 'undefined' && (window as any).EyeDropper) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const res = await eyeDropper.open();
        if (res && res.sRGBHex) {
          handleUpdate(res.sRGBHex);
        }
      } catch (e) {}
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {label && <span className="text-[11px] text-gray-400 font-medium">{label}</span>}

      {/* Pick a concise preset family, then choose one of its colors. */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5" role="group" aria-label="Color preset family">
          {COLOR_PALETTES.map((palette) => (
            <button
              key={palette.name}
              type="button"
              aria-pressed={activePalette === palette.name}
              onClick={() => setActivePalette(palette.name)}
              className={`px-2 py-1 rounded-md border text-[9px] font-bold uppercase tracking-wide transition ${
                activePalette === palette.name
                  ? 'border-sky-400 bg-sky-400/15 text-sky-200'
                  : 'border-white/10 text-gray-500 hover:text-gray-300'
              }`}
            >
              {palette.name}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap items-center" role="group" aria-label={`${activePalette} colors`}>
          {COLOR_PALETTES.find((palette) => palette.name === activePalette)?.colors.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Use color ${c}`}
              aria-pressed={color.toLowerCase() === c.toLowerCase()}
              onClick={() => handleUpdate(c)}
              className={`w-5 h-5 rounded border transition-transform hover:scale-110 ${
                color.toLowerCase() === c.toLowerCase()
                  ? 'border-sky-400 scale-110 ring-1 ring-sky-400/50'
                  : 'border-white/20'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* Manual Hex & Native Picker */}
      <div className="flex items-center gap-2 mt-1">
        <input
          type="color"
          value={color}
          onChange={(e) => handleUpdate(e.target.value)}
          aria-label="Choose a custom color"
          className="w-6 h-6 rounded border border-white/20 bg-transparent cursor-pointer p-0"
        />
        <input
          type="text"
          aria-label="Custom hex color"
          value={hexInput}
          onChange={(e) => {
            setHexInput(e.target.value);
            let val = e.target.value.trim();
            if (!val.startsWith('#')) val = '#' + val;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
              onChange(val);
            }
          }}
          placeholder="#hex"
          className="w-20 font-mono text-[11px] bg-black/40 border border-white/15 rounded px-2 py-1 text-white focus:outline-none focus:border-sky-400"
        />
        <button
          type="button"
          onClick={handleEyeDropper}
          title="Pick color from screen"
          className="p-1.5 rounded bg-white/5 border border-white/15 hover:bg-white/15 text-gray-300 hover:text-white"
        >
          <Pipette className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
