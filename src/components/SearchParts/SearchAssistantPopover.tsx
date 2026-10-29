import React, { memo } from 'react';
import { Clock, X, CornerDownLeft, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SearchAssistantPopoverProps {
  isOpen: boolean;
  recentSearches: string[];
  activeIndex: number;
  hasText: boolean;
  showSyntaxTips: boolean;
  onSelectRecent: (query: string) => void;
  onRemoveRecent: (query: string, e: React.MouseEvent) => void;
  onClearAllRecent: (e: React.MouseEvent) => void;
  onInsertOperator: (operatorType: 'and' | 'or' | 'exact' | 'exclude') => void;
  onSetActiveIndex: (index: number) => void;
}

const SYNTAX_OPERATORS: Array<{
  id: 'and' | 'or' | 'exact' | 'exclude';
  badge: string;
  label: string;
  example: string;
}> = [
  { id: 'and', badge: '+', label: 'AND match', example: 'HCM + L1' },
  { id: 'or', badge: ',', label: 'OR match', example: 'L1, L2' },
  { id: 'exact', badge: '""', label: 'Exact word', example: '"L1"' },
  { id: 'exclude', badge: '-term', label: 'Exclude', example: '-Canceled' },
];

export const SearchAssistantPopover: React.FC<SearchAssistantPopoverProps> = memo(
  ({
    isOpen,
    recentSearches,
    activeIndex,
    hasText,
    showSyntaxTips,
    onSelectRecent,
    onRemoveRecent,
    onClearAllRecent,
    onInsertOperator,
    onSetActiveIndex,
  }) => {
    if (!isOpen) return null;

    const showRecents = recentSearches.length > 0;
    const showTips = !hasText || showSyntaxTips;

    if (!showRecents && !showTips) return null;

    return (
      <div
        onMouseDown={(e) => {
          // Prevent input blur when interacting with the assistant popover
          e.preventDefault();
        }}
        className="absolute top-full left-0 right-0 mt-1.5 z-[120] min-w-[260px] bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-md border border-slate-200/90 dark:border-[#3a3a3c] rounded-xl shadow-xl overflow-hidden text-slate-800 dark:text-[#e3e3e3] animate-in fade-in slide-in-from-top-1 duration-120 print:hidden"
      >
        {/* Recent Searches Section */}
        {showRecents && (
          <div className="p-1.5">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#8e8e93] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Recent Searches</span>
              </span>
              <button
                type="button"
                onClick={onClearAllRecent}
                className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 dark:text-[#8e8e93] dark:hover:text-rose-400 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer active:scale-95 touch-manipulation"
                title="Clear recent search history"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>Clear</span>
              </button>
            </div>

            <div className="space-y-0.5 mt-0.5 max-h-44 overflow-y-auto no-scrollbar">
              {recentSearches.map((item, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <div
                    key={item}
                    onMouseEnter={() => onSetActiveIndex(idx)}
                    onClick={() => onSelectRecent(item)}
                    className={cn(
                      'group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors touch-manipulation',
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-[#8ab4f8]'
                        : 'text-slate-700 dark:text-[#d1d1d6] hover:bg-slate-100/80 dark:hover:bg-[#2c2c2e]'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Clock
                        className={cn(
                          'w-3.5 h-3.5 shrink-0 transition-colors',
                          isSelected
                            ? 'text-blue-600 dark:text-[#8ab4f8]'
                            : 'text-slate-400 dark:text-[#636366]'
                        )}
                      />
                      <span className="truncate font-medium">{item}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <CornerDownLeft
                        className={cn(
                          'w-3 h-3 transition-opacity',
                          isSelected
                            ? 'opacity-80 text-blue-600 dark:text-[#8ab4f8]'
                            : 'opacity-0 group-hover:opacity-50 text-slate-400'
                        )}
                      />
                      <button
                        type="button"
                        onClick={(e) => onRemoveRecent(item, e)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:text-[#8e8e93] dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-[#3a3a3c] transition-colors active:scale-90"
                        title="Remove from history"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Smart Search Operators & Tips Section */}
        {showTips && (
          <div
            className={cn(
              'px-2.5 py-2 bg-slate-50/90 dark:bg-[#151517]/90',
              showRecents && 'border-t border-slate-200/70 dark:border-[#2c2c2e]'
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#8e8e93] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-blue-500 dark:text-[#8ab4f8]" />
                <span>Smart Search Syntax (Tap to insert)</span>
              </span>
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/70 dark:border-emerald-800/60 px-1.5 py-0.2 rounded">
                VN/EN Accent-Free
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
              {SYNTAX_OPERATORS.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => onInsertOperator(op.id)}
                  className="flex flex-col items-start p-1.5 rounded-lg bg-white dark:bg-[#242426] border border-slate-200/80 dark:border-[#38383a] hover:border-blue-400 dark:hover:border-blue-500/70 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-all text-left cursor-pointer active:scale-95 touch-manipulation group"
                  title={`Insert ${op.label} (${op.example})`}
                >
                  <div className="flex items-center gap-1 w-full justify-between">
                    <kbd className="px-1 py-0.5 text-[10px] font-mono font-extrabold rounded bg-slate-100 dark:bg-[#323236] text-blue-700 dark:text-[#8ab4f8] border border-slate-200 dark:border-[#444446]">
                      {op.badge}
                    </kbd>
                    <span className="text-[10px] font-semibold text-slate-600 dark:text-[#c7c7cc] truncate">
                      {op.label}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 dark:text-[#8e8e93] mt-0.5 truncate w-full">
                    e.g. {op.example}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);
