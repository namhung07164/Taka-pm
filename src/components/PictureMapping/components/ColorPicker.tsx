import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Ban } from 'lucide-react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
  showTransparentOption?: boolean;
}

const PRESET_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#14b8a6', // Teal
  '#84cc16', // Lime
  '#eab308', // Yellow
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#d946ef', // Fuchsia
  '#64748b', // Slate
  '#0284c7', // Sky
  '#059669', // Dark Emerald
  '#b91c1c', // Dark Red
  '#1e293b', // Dark Slate
];

export function ColorPicker({ color, onChange, className, showTransparentOption = true }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isTransparent = !color || color === 'transparent' || color === 'none' || color === 'rgba(0,0,0,0)' || color === 'rgba(0, 0, 0, 0)';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectColor = (newColor: string) => {
    onChange(newColor);
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block ${className || ''}`} ref={containerRef}>
      {/* Trigger Swatch Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-6 h-6 rounded-lg border border-slate-600/80 hover:border-brand-400 overflow-hidden cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 flex items-center justify-center transition-all active:scale-95"
        style={{
          backgroundColor: isTransparent ? 'transparent' : color,
          backgroundImage: isTransparent
            ? 'repeating-conic-gradient(#475569 0% 25%, #1e293b 0% 50%)'
            : undefined,
          backgroundSize: '8px 8px',
        }}
        title={isTransparent ? 'Color: Transparent / No Fill' : `Color: ${color}`}
      >
        {isTransparent && (
          <Ban size={12} className="text-red-400 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" />
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-8 z-[9999] w-64 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl glass backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Color Palette / Bảng màu
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Transparent / No Fill Option */}
          {showTransparentOption && (
            <button
              type="button"
              onClick={() => handleSelectColor('transparent')}
              className={`w-full mb-3 px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center justify-between transition-all active:scale-95 ${
                isTransparent
                  ? 'bg-red-500/20 border-red-500/60 text-red-300 ring-1 ring-red-500/40'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded border border-slate-600 flex items-center justify-center overflow-hidden"
                  style={{
                    backgroundImage: 'repeating-conic-gradient(#475569 0% 25%, #1e293b 0% 50%)',
                    backgroundSize: '6px 6px',
                  }}
                >
                  <Ban size={10} className="text-red-400" />
                </div>
                <span>Transparent (Trong suốt / Không tô)</span>
              </div>
              {isTransparent && <Check size={14} className="text-red-400" />}
            </button>
          )}

          {/* Swatches Grid */}
          <div className="mb-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1.5">
              Preset Colors
            </span>
            <div className="grid grid-cols-6 gap-1.5">
              {PRESET_COLORS.map((hex) => {
                const isSelected = !isTransparent && color.toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => handleSelectColor(hex)}
                    className="w-8 h-8 rounded-lg border border-slate-700 hover:border-white transition-all flex items-center justify-center active:scale-90 relative shadow-sm"
                    style={{ backgroundColor: hex }}
                    title={hex}
                  >
                    {isSelected && (
                      <Check size={14} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Hex / Color Input */}
          <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">Custom:</span>
            <div className="relative flex-1 flex items-center">
              <input
                type="color"
                value={isTransparent ? '#3b82f6' : color}
                onChange={(e) => onChange(e.target.value)}
                className="w-6 h-6 border-0 p-0 rounded cursor-pointer bg-transparent overflow-hidden shrink-0"
                title="Pick custom color"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => onChange(e.target.value)}
                placeholder="#3b82f6 or transparent"
                className="w-full ml-2 bg-slate-950 border border-slate-800 text-slate-200 text-xs px-2 py-1 rounded font-mono uppercase focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ColorPicker;


