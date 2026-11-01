import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Tag, Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PRESET_SYMBOLS } from '../../../LayoutTabParts/layoutPatternUtils';

interface GroupSymbolPickerProps {
  symbol?: string;
  onChange: (symbol: string) => void;
  className?: string;
}

export const GroupSymbolPicker: React.FC<GroupSymbolPickerProps> = ({
  symbol = '',
  onChange,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customInput, setCustomInput] = useState(symbol || '');
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomInput(symbol || '');
  }, [symbol]);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popoverWidth = 224;
    const popoverHeight = 250;
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

  const hasSymbol = Boolean(symbol && symbol.trim());

  return (
    <div className={cn("relative inline-block", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          if (!isOpen) updatePosition();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-bold transition-all cursor-pointer active:scale-95 touch-manipulation",
          hasSymbol
            ? "bg-amber-950/60 border-amber-500/80 text-amber-200 shadow-xs"
            : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
        )}
        title={hasSymbol ? `Symbol: ${symbol}` : "Set symbol/marker"}
      >
        <Tag size={11} className={hasSymbol ? "text-amber-400" : "text-slate-400"} />
        <span className="font-mono text-[11px]">{hasSymbol ? symbol : "Sym"}</span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 99999 }}
            className="w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2.5 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pb-1.5 border-b border-slate-800 flex items-center justify-between">
              <span>Symbol / Marker</span>
              {hasSymbol && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                  }}
                  className="text-[9px] text-rose-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <X size={10} /> Clear
                </button>
              )}
            </div>

            {/* Quick Preset Symbols Grid */}
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {PRESET_SYMBOLS.map((item) => {
                const isSelected = symbol === item.symbol;
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => {
                      onChange(item.symbol);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center p-1.5 rounded-lg border text-sm font-bold transition-all cursor-pointer",
                      isSelected
                        ? "bg-amber-500/20 text-amber-300 border-amber-500 shadow-xs ring-1 ring-amber-400/50"
                        : "bg-slate-800/80 text-slate-200 border-slate-700 hover:bg-slate-700 hover:border-slate-600"
                    )}
                    title={item.label}
                  >
                    <span className="text-base leading-none">{item.symbol}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom text input */}
            <div className="mt-2.5 pt-2 border-t border-slate-800">
              <div className="text-[9px] font-semibold text-slate-400 mb-1">Custom Marker (1-3 chars):</div>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  maxLength={4}
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onChange(customInput.trim());
                      setIsOpen(false);
                    }
                  }}
                  placeholder="e.g. VIP, A"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    onChange(customInput.trim());
                    setIsOpen(false);
                  }}
                  className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold transition-colors cursor-pointer"
                >
                  <Check size={12} />
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

