import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Columns, Check, Sparkles, RotateCcw, Lock, ChevronDown } from 'lucide-react';
import { safeSetDeviceItemLocal } from '../../lib/storage';
import { useAppStore } from '../../store/useAppStore';
import { GanttColumnWidths } from './useGanttColumnResize';

export interface GanttFrozenColumnsPopoverProps {
  visibleColumns: string[];
  handleToggleColumn?: (colId: string) => void;
  setVisibleColumns?: React.Dispatch<React.SetStateAction<string[]>>;
  sideWidth: number;
  setSideWidth: React.Dispatch<React.SetStateAction<number>>;
  colWidths?: GanttColumnWidths;
  variant?: 'toolbar' | 'header';
}

const AVAILABLE_FROZEN_COLS = [
  { id: 'start', label: 'Start Date', defaultWidth: 85 },
  { id: 'finish', label: 'Finish Date', defaultWidth: 85 },
  { id: 'party', label: 'Party / Tenant / Contractor', defaultWidth: 80 },
  { id: 'duration', label: 'Duration (Days)', defaultWidth: 60 },
  { id: 'predecessor', label: 'Predecessor (Link)', defaultWidth: 90 },
];

export const GanttFrozenColumnsPopover: React.FC<GanttFrozenColumnsPopoverProps> = React.memo(({
  visibleColumns,
  handleToggleColumn,
  setVisibleColumns,
  sideWidth,
  setSideWidth,
  colWidths,
  variant = 'toolbar'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentUser = useAppStore(state => state.currentUser);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const calculateAutoFitWidth = useCallback((cols: string[]) => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const baseNameWidth = isMobile ? 150 : 220;
    const indexColWidth = 40;

    let totalColsWidth = 0;
    if (cols.includes('start')) totalColsWidth += colWidths?.start ?? 85;
    if (cols.includes('finish')) totalColsWidth += colWidths?.finish ?? 85;
    if (cols.includes('party')) totalColsWidth += colWidths?.party ?? 80;
    if (cols.includes('duration')) totalColsWidth += colWidths?.duration ?? 60;
    if (cols.includes('predecessor')) totalColsWidth += colWidths?.predecessor ?? 90;

    const ideal = indexColWidth + baseNameWidth + totalColsWidth;
    const minW = isMobile ? 160 : 200;
    const maxW = typeof window !== 'undefined' ? Math.min(850, Math.floor(window.innerWidth * 0.75)) : 650;
    return Math.max(minW, Math.min(maxW, ideal));
  }, [colWidths]);

  const handleApplyPreset = (presetCols: string[]) => {
    if (setVisibleColumns) {
      setVisibleColumns(presetCols);
      safeSetDeviceItemLocal('taka_gantt_visible_columns', JSON.stringify(presetCols), currentUser?.id);
    } else if (handleToggleColumn) {
      // Toggle difference
      AVAILABLE_FROZEN_COLS.forEach(c => {
        const currentlyVisible = visibleColumns.includes(c.id);
        const shouldBeVisible = presetCols.includes(c.id);
        if (currentlyVisible !== shouldBeVisible) {
          handleToggleColumn(c.id);
        }
      });
    }

    const autoW = calculateAutoFitWidth(presetCols);
    setSideWidth(autoW);
    safeSetDeviceItemLocal('taka_gantt_side_width', String(autoW), currentUser?.id);

    useAppStore.getState().setToast({
      title: "Frozen Preset Applied",
      message: `Updated to ${presetCols.length} columns (${autoW}px)`
    });
  };

  const handleAutoFitClick = () => {
    const autoW = calculateAutoFitWidth(visibleColumns);
    setSideWidth(autoW);
    safeSetDeviceItemLocal('taka_gantt_side_width', String(autoW), currentUser?.id);
    useAppStore.getState().setToast({
      title: "Auto-Fit Width",
      message: `Adjusted frozen pane width to ${autoW}px`
    });
  };

  const handleResetWidth = () => {
    setSideWidth(360);
    safeSetDeviceItemLocal('taka_gantt_side_width', '360', currentUser?.id);
    useAppStore.getState().setToast({
      title: "Reset Frozen Width",
      message: "Reset frozen columns width to 360px"
    });
  };

  return (
    <div className="relative inline-block text-left" ref={ref}>
      {variant === 'header' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors cursor-pointer flex items-center justify-center active:scale-95 touch-manipulation"
          title="Customizable Frozen Columns (Pin / Unpin columns)"
          aria-label="Customizable Frozen Columns"
        >
          <Columns className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-[#252528] transition-all text-xs font-semibold shadow-xs cursor-pointer active:scale-95 touch-manipulation shrink-0"
          title="Configure Customizable Frozen Columns"
        >
          <Columns className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Frozen Columns ({visibleColumns.length + 1})</span>
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 sm:w-88 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#38383a] rounded-2xl shadow-2xl z-50 p-3.5 flex flex-col gap-3 animate-in fade-in zoom-in-95 text-slate-800 dark:text-[#e3e3e3] select-none">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#333336]">
            <div className="flex items-center gap-1.5">
              <Columns className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-bold text-xs text-slate-900 dark:text-white">Customizable Frozen Columns</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#28282a] px-2 py-0.5 rounded-full font-bold">
              {sideWidth}px
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
            Frozen columns remain pinned on the left side while scrolling horizontally across the Gantt timeline.
          </p>

          {/* Quick Presets */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick Presets</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleApplyPreset([])}
                className="px-2 py-1.5 rounded-lg text-left text-[11px] font-semibold bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#444446] transition-colors cursor-pointer"
              >
                📌 Minimal (Name Only)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(['start', 'finish'])}
                className="px-2 py-1.5 rounded-lg text-left text-[11px] font-semibold bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#444446] transition-colors cursor-pointer"
              >
                📌 Standard (Dates)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(['start', 'finish', 'party'])}
                className="px-2 py-1.5 rounded-lg text-left text-[11px] font-semibold bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#444446] transition-colors cursor-pointer"
              >
                📌 Extended (Party)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(['start', 'finish', 'party', 'duration', 'predecessor'])}
                className="px-2 py-1.5 rounded-lg text-left text-[11px] font-semibold bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#444446] transition-colors cursor-pointer"
              >
                📌 Full Detail (All)
              </button>
            </div>
          </div>

          {/* Individual Columns Checklist */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Columns Pinning</span>
            
            {/* Always pinned Task Name */}
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-[#28282a] text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-blue-500" />
                <span>Task / Project Name</span>
              </div>
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">Locked</span>
            </div>

            {AVAILABLE_FROZEN_COLS.map((col) => {
              const isChecked = visibleColumns.includes(col.id);
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => handleToggleColumn && handleToggleColumn(col.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left ${
                    isChecked
                      ? 'bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-slate-100 dark:hover:bg-[#28282a] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400 dark:border-slate-600'
                    }`}>
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span>{col.label}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {colWidths ? (colWidths as any)[col.id] || col.defaultWidth : col.defaultWidth}px
                  </span>
                </button>
              );
            })}
          </div>

          {/* Width Management Footer */}
          <div className="pt-2 border-t border-slate-100 dark:border-[#333336] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleAutoFitClick}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Fit Width</span>
            </button>
            <button
              type="button"
              onClick={handleResetWidth}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#444446] hover:bg-slate-100 dark:hover:bg-[#28282a] text-slate-600 dark:text-slate-400 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
              title="Reset width to 360px"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

GanttFrozenColumnsPopover.displayName = 'GanttFrozenColumnsPopover';
