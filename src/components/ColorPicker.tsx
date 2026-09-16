import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', 
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b',
  '#14b8a6', '#84cc16', '#eab308', '#a855f7', '#d946ef',
  '#0284c7', '#059669', '#dc2626', '#d97706', '#475569'
];

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className={cn("relative inline-block", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-6 h-6 rounded-full border-2 border-slate-700 shadow-sm transition-transform hover:scale-110 active:scale-95 focus:outline-none"
        style={{ backgroundColor: color || '#3b82f6' }}
        title="Choose color"
      />

      {isOpen && (
        <div className="absolute left-0 top-8 z-50 p-2.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col gap-2 min-w-[160px] animate-in fade-in zoom-in-95 duration-100">
          <div className="grid grid-cols-5 gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={cn(
                  "w-5 h-5 rounded-full border border-slate-700 transition-transform hover:scale-125 focus:outline-none",
                  color === c && "ring-2 ring-white scale-110"
                )}
                style={{ backgroundColor: c }}
                onClick={() => {
                  onChange(c);
                  setIsOpen(false);
                }}
              />
            ))}
          </div>
          <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
            <input
              type="color"
              value={color || '#3b82f6'}
              onChange={(e) => onChange(e.target.value)}
              className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={color || ''}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 px-2 py-0.5 text-[11px] bg-slate-800 text-white rounded border border-slate-700 outline-none font-mono uppercase"
              placeholder="#HEX"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorPicker;
