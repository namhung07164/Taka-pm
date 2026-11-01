import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Layers, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { HatchPatternType, HATCH_PATTERNS, getHatchCssStyle } from '../../../LayoutTabParts/layoutPatternUtils';

interface GroupHatchPatternPickerProps {
  color: string;
  pattern?: HatchPatternType;
  onChange: (pattern: HatchPatternType) => void;
  className?: string;
}

export const GroupHatchPatternPicker: React.FC<GroupHatchPatternPickerProps> = ({
  color,
  pattern = 'none',
  onChange,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popoverWidth = 208;
    const popoverHeight = 268;
    let left = rect.left;
    let top = rect.bottom + 6;

    if (left + popoverWidth > window.innerWidth - 12) {
      left = Math.max(8, window.innerWidth - popoverWidth - 12);
    }
    if (top + popoverHeight > window.innerHeight - 12) {
      if (rect.top - popoverHeight - 6 > 8) {
        top = rect.top - popoverHeight - 6;
      } else {
        top = Math.max(8, window.innerHeight - popoverHeight - 12);
      }
    }
    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  const currentPattern = HATCH_PATTERNS.find(p => p.id === pattern) || HATCH_PATTERNS[0];

  return (
    <div className={cn("relative inline-block", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          if (!isOpen) updatePosition();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold transition-all cursor-pointer active:scale-95 touch-manipulation",
          pattern && pattern !== 'none'
            ? "bg-purple-950/60 border-purple-500/80 text-purple-200 shadow-xs"
            : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
        )}
        title={`Hatching Pattern: ${currentPattern.label}`}
      >
        <span
          className="w-3.5 h-3.5 rounded shrink-0 border border-black/20 shadow-2xs"
          style={getHatchCssStyle(color, pattern)}
        />
        <span className="font-mono text-[10px]">{currentPattern.iconLabel}</span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 99999 }}
            className="w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1.5 pb-1.5 border-b border-slate-800 flex items-center justify-between">
              <span>Hatching Pattern</span>
              <Layers size={11} className="text-purple-400" />
            </div>

            <div className="space-y-1 mt-1.5 max-h-56 overflow-y-auto custom-scrollbar">
              {HATCH_PATTERNS.map((item) => {
                const isSelected = (pattern || 'none') === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChange(item.id);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-1.5 rounded-lg text-left transition-all cursor-pointer",
                      isSelected
                        ? "bg-purple-900/40 text-purple-200 border border-purple-500/50"
                        : "hover:bg-slate-800 text-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-4 h-4 rounded shrink-0 border border-black/30 shadow-2xs"
                        style={getHatchCssStyle(color, item.id)}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate leading-tight">{item.label}</div>
                        <div className="text-[9px] text-slate-500 truncate">{item.desc}</div>
                      </div>
                    </div>
                    {isSelected && <Check size={13} className="text-purple-400 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

