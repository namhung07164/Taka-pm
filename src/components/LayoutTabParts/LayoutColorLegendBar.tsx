import React, { Dispatch, FC, SetStateAction, memo, useEffect, useMemo, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import {
  Palette,
  ChevronUp,
  ChevronDown,
  Download,
  RefreshCw,
  GripHorizontal,
  Compass,
  Search,
  X,
  Layers
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getHatchCssStyle } from './layoutPatternUtils';
import { LayoutLegendExportMenu } from './LayoutLegendExportMenu';

export type LegendDockPosition = 'top-right' | 'bottom-right' | 'bottom-left';

export interface LayoutColorLegendBarProps {
  layoutTooltipVisibility: any;
  activeGroups: any[];
  selectedLegendGroupId: string | null;
  setSelectedLegendGroupId: (id: string | null) => void;
  setShowLegendModal?: (show: boolean) => void;
  isLegendStripCollapsed?: boolean;
  setIsLegendStripCollapsed?: React.Dispatch<React.SetStateAction<boolean>>;
  canWrite?: boolean;
  handleTriggerExport?: () => void | Promise<void>;
  isExporting?: boolean;
  exportStatus?: string;
  handleExport?: (type: 'jpeg' | 'pdf') => void;
  setIsPrintPreview?: (show: boolean) => void;
}

const DEFAULT_DOCK_STORAGE_KEY = 'taka_layout_legend_dock_pos';

export const LayoutColorLegendBar: React.FC<LayoutColorLegendBarProps> = React.memo(({
  layoutTooltipVisibility,
  activeGroups,
  selectedLegendGroupId,
  setSelectedLegendGroupId,
  setShowLegendModal,
  isLegendStripCollapsed: propIsCollapsed,
  setIsLegendStripCollapsed: propSetIsCollapsed,
  canWrite = false,
  handleTriggerExport,
  isExporting = false,
  exportStatus = '',
  handleExport,
  setIsPrintPreview,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [dockPosition, setDockPosition] = useState<LegendDockPosition>(() => {
    try {
      const saved = localStorage.getItem(DEFAULT_DOCK_STORAGE_KEY);
      if (saved === 'top-right' || saved === 'bottom-right' || saved === 'bottom-left') {
        return saved;
      }
    } catch {
      // Ignore storage errors
    }
    return 'top-right';
  });

  const nodeRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const isCollapsed = propIsCollapsed !== undefined ? propIsCollapsed : internalCollapsed;
  const toggleCollapsed = () => {
    if (propSetIsCollapsed) {
      propSetIsCollapsed(!isCollapsed);
    } else {
      setInternalCollapsed(prev => !prev);
    }
  };

  const cycleDockPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDockPosition(prev => {
      let next: LegendDockPosition = 'top-right';
      if (prev === 'top-right') next = 'bottom-right';
      else if (prev === 'bottom-right') next = 'bottom-left';
      else next = 'top-right';
      try {
        localStorage.setItem(DEFAULT_DOCK_STORAGE_KEY, next);
      } catch {
        // Ignore
      }
      return next;
    });
  };

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);

  // Filter active groups based on groupSearch
  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return activeGroups;
    const q = groupSearch.toLowerCase().trim();
    return activeGroups.filter(g => g.name?.toLowerCase().includes(q));
  }, [activeGroups, groupSearch]);

  const { totalUnitsAllGroups, totalAreaAllGroups } = useMemo(() => {
    let unitsCount = 0;
    let areaSum = 0;
    activeGroups.forEach((g: any) => {
      unitsCount += Number(g.matchCount || 0);
      areaSum += Number(g.totalArea || 0);
    });
    return {
      totalUnitsAllGroups: unitsCount,
      totalAreaAllGroups: areaSum,
    };
  }, [activeGroups]);

  if (layoutTooltipVisibility?.legendColor === false) return null;

  // Dock positioning classes
  const dockClasses = {
    'top-right': 'top-14 sm:top-16 right-2.5 sm:right-4',
    'bottom-right': 'bottom-3 sm:bottom-4 right-2.5 sm:right-4',
    'bottom-left': 'bottom-3 sm:bottom-4 left-2.5 sm:left-4',
  }[dockPosition];

  return (
    <Draggable
      handle=".legend-drag-handle"
      cancel="button, input, select, textarea, .no-drag"
      nodeRef={nodeRef}
      bounds="parent"
    >
      <div
        ref={nodeRef}
        className={cn(
          "absolute z-30 pointer-events-auto hide-on-actual-print print:hidden transition-shadow select-none",
          dockClasses,
          isCollapsed ? "max-w-xs" : "w-[330px] sm:w-[390px] max-w-[calc(100vw-1.5rem)]"
        )}
      >
        <div className="bg-white/95 dark:bg-[#1a1a1c]/95 backdrop-blur-xl rounded-2xl border border-slate-200/90 dark:border-[#333336] shadow-2xl p-2 sm:p-2.5 transition-all text-slate-800 dark:text-slate-100">
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-1.5">
            {/* Grip Handle + Palette Icon + Title */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="legend-drag-handle p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                title="Drag to reposition anywhere on canvas"
              >
                <GripHorizontal className="w-4 h-4" />
              </span>

              <button
                type="button"
                onClick={toggleCollapsed}
                className="flex items-center gap-1.5 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors text-left cursor-pointer active:scale-95 touch-manipulation min-w-0"
                title={isCollapsed ? "Expand Color Legend" : "Collapse Color Legend"}
              >
                <span className="p-1 rounded-lg bg-purple-100 dark:bg-purple-950/70 text-purple-600 dark:text-purple-300 shrink-0 shadow-2xs">
                  <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap">
                  Color Legend
                </span>
                {activeGroups.length > 0 && (
                  <span className="text-[10px] font-extrabold font-mono px-1.5 py-0.5 rounded-full bg-purple-100/90 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                    {activeGroups.length}
                  </span>
                )}
              </button>
            </div>

            {/* Header Action Tools */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Clear Filter Button */}
              {selectedLegendGroupId && (
                <button
                  type="button"
                  onClick={() => setSelectedLegendGroupId(null)}
                  className="text-[10px] font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950 px-1.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 cursor-pointer active:scale-95 transition-all whitespace-nowrap"
                  title="Clear active group filter"
                >
                  Clear Filter
                </button>
              )}

              {/* Dock Position Switcher */}
              <button
                type="button"
                onClick={cycleDockPosition}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 active:scale-95"
                title={`Dock Position: ${dockPosition} (Click to switch Top-Right / Bottom-Right / Bottom-Left)`}
              >
                <Compass className="w-3.5 h-3.5" />
              </button>

              {/* View All Groups Details Modal */}
              {setShowLegendModal && activeGroups.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLegendModal(true)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 active:scale-95"
                  title="Open full groups modal"
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Export Menu Dropdown */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowExportMenu(prev => !prev)}
                  disabled={isExporting}
                  className={cn(
                    "p-1 rounded-lg transition-all border active:scale-95 cursor-pointer touch-manipulation shrink-0",
                    isExporting
                      ? "bg-amber-500 text-white border-amber-600 animate-pulse"
                      : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
                  )}
                  title="Export floor plan or sync"
                >
                  {isExporting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Export Dropdown Popover */}
                {showExportMenu && (
                  <LayoutLegendExportMenu
                    canWrite={canWrite}
                    handleTriggerExport={handleTriggerExport}
                    handleExport={handleExport}
                    setIsPrintPreview={setIsPrintPreview}
                    onClose={() => setShowExportMenu(false)}
                  />
                )}
              </div>

              {/* Collapse / Expand Toggle Button */}
              <button
                type="button"
                onClick={toggleCollapsed}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 active:scale-95"
                title={isCollapsed ? "Expand legend list" : "Collapse legend list"}
              >
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Body List (Visible when Expanded) */}
          {!isCollapsed && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 mt-1.5 space-y-2 animate-in fade-in duration-150">
              {/* Optional Search if more than 5 groups */}
              {activeGroups.length > 5 && (
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-7 pr-6 py-1 text-[16px] sm:text-[11px] placeholder-slate-400 outline-none focus:ring-1 focus:ring-purple-500 transition-colors duration-150 [overflow-anchor:none]"
                  />
                  {groupSearch && (
                    <button
                      type="button"
                      onClick={() => setGroupSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Group Swatches */}
              {activeGroups.length === 0 ? (
                /* Default Project Status Legend */
                <div className="grid grid-cols-2 gap-1.5 py-0.5 text-xs">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 shadow-xs ring-1 ring-white/50 dark:ring-black/30" />
                    <span className="text-[11px] font-semibold whitespace-nowrap">Completed</span>
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs">
                    <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0 shadow-xs ring-1 ring-white/50 dark:ring-black/30" />
                    <span className="text-[11px] font-semibold whitespace-nowrap">On Process</span>
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs">
                    <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0 shadow-xs ring-1 ring-white/50 dark:ring-black/30" />
                    <span className="text-[11px] font-semibold whitespace-nowrap">Upcoming</span>
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs">
                    <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0 shadow-xs ring-1 ring-white/50 dark:ring-black/30" />
                    <span className="text-[11px] font-semibold whitespace-nowrap">Delay</span>
                  </div>
                </div>
              ) : (
                /* Custom Classification Groups */
                <div className="flex flex-col gap-1 max-h-[220px] sm:max-h-[260px] overflow-y-auto pr-0.5 touch-pan-y overscroll-contain">
                  {filteredGroups.length === 0 ? (
                    <div className="text-[11px] text-slate-400 text-center py-3 italic">
                      No matching groups found
                    </div>
                  ) : (
                    filteredGroups.map((g: any) => {
                      const isSelected = selectedLegendGroupId === g.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setSelectedLegendGroupId(isSelected ? null : g.id)}
                          className={cn(
                            "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer active:scale-95 touch-manipulation shadow-2xs text-left",
                            isSelected
                              ? "bg-purple-100 dark:bg-purple-950/80 border-purple-500 text-purple-950 dark:text-purple-100 ring-2 ring-purple-400/50 font-bold"
                              : "bg-slate-50/90 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                          )}
                          title={`Click to ${isSelected ? 'clear highlight' : 'highlight on canvas'} group ${g.name} (${g.matchCount} ${g.matchCount === 1 ? 'unit' : 'units'}${g.totalArea > 0 ? ` • ${Number(g.totalArea).toLocaleString('en-US', { maximumFractionDigits: 1 })} m²` : ''}${g.areaPercent ? ` • ${Number(g.areaPercent).toFixed(1)}%` : ''})`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-4 h-4 rounded shrink-0 shadow-2xs border border-black/25 ring-1 ring-white/50 relative overflow-hidden flex items-center justify-center"
                              style={{
                                backgroundColor: g.color,
                                ...getHatchCssStyle(g.color, g.hatchPattern),
                              }}
                            >
                              {g.symbol && (
                                <span className="text-[10px] font-black text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] leading-none select-none">
                                  {g.symbol}
                                </span>
                              )}
                            </span>
                            <span className="truncate text-[11px] font-semibold flex items-center gap-1" title={g.name}>
                              {g.symbol && <span className="text-amber-500 dark:text-amber-400 font-mono text-[10px] font-bold">[{g.symbol}]</span>}
                              <span className="truncate">{g.name}</span>
                            </span>
                          </div>
                          <span
                            className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 shrink-0 whitespace-nowrap flex items-center gap-1 shadow-2xs"
                            title={`Units: ${g.matchCount}${g.totalArea > 0 ? ` • Area: ${Number(g.totalArea).toLocaleString('en-US', { maximumFractionDigits: 1 })} m²` : ''}${g.areaPercent ? ` • ${Number(g.areaPercent).toFixed(1)}% of categorized area` : ''}`}
                          >
                            <span>{g.matchCount} {g.matchCount === 1 ? 'unit' : 'units'}</span>
                            {g.totalArea > 0 && (
                              <>
                                <span className="text-slate-300 dark:text-slate-600 font-normal">•</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                  {Number(g.totalArea).toLocaleString('en-US', { maximumFractionDigits: 1 })} m²
                                </span>
                              </>
                            )}
                            {g.areaPercent !== undefined && g.areaPercent > 0 && (
                              <>
                                <span className="text-slate-300 dark:text-slate-600 font-normal">•</span>
                                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                                  {Number(g.areaPercent).toFixed(1)}%
                                </span>
                              </>
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {/* Total Summary Footer */}
              {filteredGroups.length >= 2 && totalUnitsAllGroups > 0 && (
                <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-mono font-bold border-t border-slate-200/80 dark:border-slate-800 pt-1 mt-0.5 bg-slate-50/50 dark:bg-slate-900/30 rounded-lg">
                  <span className="uppercase text-[9px] tracking-wider text-slate-500 dark:text-slate-400">Total</span>
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                    <span>{totalUnitsAllGroups} {totalUnitsAllGroups === 1 ? 'unit' : 'units'}</span>
                    {totalAreaAllGroups > 0 && (
                      <>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span className="text-emerald-600 dark:text-emerald-400">{Number(totalAreaAllGroups).toLocaleString('en-US', { maximumFractionDigits: 1 })} m²</span>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span className="text-indigo-600 dark:text-indigo-400">100%</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Draggable>
  );
});
