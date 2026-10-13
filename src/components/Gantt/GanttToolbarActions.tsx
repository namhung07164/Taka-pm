import React, { useEffect, useRef, useState } from 'react';
import { Palette, Play, Layers, Unlink, Trash2, Eye, EyeOff, Save, Loader2 } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import { cn } from '../../lib/utils';

interface GanttToolbarActionsProps {
  selectedProjectIds: string[];
  selectedTaskIds: string[];
  handleSetTextColor: (color: string | null) => void;
  handleSetBaselineSelected: () => void;
  handleUnlinkModularTasks?: (childTaskIds?: string[]) => void | Promise<void>;
  setIsTaskModularModalOpen: (val: boolean) => void;
  sumMode: "none" | "duration";
  setSumMode: (val: "none" | "duration") => void;
  handleDeleteSelected: () => void;
  isHideMode: boolean;
  setIsHideMode: (val: boolean) => void;
  hiddenRows: string[];
  setHiddenRows: (rows: string[]) => void;
  handleExportToPDF: () => void;
  isExporting: boolean;
}

const COLOR_OPTIONS = [
  { label: 'Default', color: null, bg: 'bg-slate-200 dark:bg-slate-700' },
  { label: 'Red', color: '#ef4444', bg: 'bg-red-500' },
  { label: 'Blue', color: '#3b82f6', bg: 'bg-blue-500' },
  { label: 'Green', color: '#10b981', bg: 'bg-emerald-500' },
  { label: 'Amber', color: '#f59e0b', bg: 'bg-amber-500' },
  { label: 'Purple', color: '#8b5cf6', bg: 'bg-purple-500' },
];

export function GanttToolbarActions({
  selectedProjectIds,
  selectedTaskIds,
  handleSetTextColor,
  handleSetBaselineSelected,
  handleUnlinkModularTasks,
  setIsTaskModularModalOpen,
  sumMode,
  setSumMode,
  handleDeleteSelected,
  isHideMode,
  setIsHideMode,
  hiddenRows,
  setHiddenRows,
  handleExportToPDF,
  isExporting
}: GanttToolbarActionsProps) {
  const { t } = useLanguage();
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const colorMenuRef = useRef<HTMLDivElement>(null);

  const totalSelected = selectedProjectIds.length + selectedTaskIds.length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorMenuRef.current && !colorMenuRef.current.contains(e.target as Node)) {
        setIsColorMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Color Palette Menu */}
      <div className="relative" ref={colorMenuRef}>
        <button
          type="button"
          disabled={totalSelected === 0}
          onClick={() => setIsColorMenuOpen(!isColorMenuOpen)}
          className={cn(
            "p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all active:scale-95",
            totalSelected > 0
              ? "bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] hover:bg-slate-50"
              : "opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400"
          )}
          title={t('Set text color for selected items')}
        >
          <Palette className="w-3.5 h-3.5 text-purple-500" />
          <span className="hidden xl:inline">{t('Color')}</span>
        </button>

        {isColorMenuOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-xl p-2 z-50 flex items-center gap-1.5 animate-in fade-in zoom-in-95">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  handleSetTextColor(opt.color);
                  setIsColorMenuOpen(false);
                }}
                className={`w-5 h-5 rounded-full ${opt.bg} border-2 border-white dark:border-slate-800 shadow-sm hover:scale-110 transition-transform`}
                title={opt.label}
              />
            ))}
          </div>
        )}
      </div>

      {/* Set Baseline */}
      <button
        type="button"
        disabled={totalSelected === 0}
        onClick={handleSetBaselineSelected}
        className={cn(
          "p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all active:scale-95",
          totalSelected > 0
            ? "bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] hover:bg-slate-50"
            : "opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400"
        )}
        title={t('Set baseline dates for selected items')}
      >
        <Save className="w-3.5 h-3.5 text-emerald-500" />
        <span className="hidden xl:inline">{t('Baseline')}</span>
      </button>

      {/* Group Modular Tasks */}
      <button
        type="button"
        disabled={selectedTaskIds.length < 1}
        onClick={() => setIsTaskModularModalOpen(true)}
        className={cn(
          "p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all active:scale-95",
          selectedTaskIds.length >= 1
            ? "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900 text-purple-700 dark:text-purple-300 hover:bg-purple-100 cursor-pointer"
            : "opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400"
        )}
        title={t('Group selected tasks into a parent modular task')}
      >
        <Layers className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">{t('Modular')}</span>
      </button>

      {/* Unlink Selected Tasks from Parent Link */}
      <button
        type="button"
        disabled={selectedTaskIds.length < 1}
        onClick={() => {
          if (handleUnlinkModularTasks) {
            handleUnlinkModularTasks(selectedTaskIds);
          }
        }}
        className={cn(
          "p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all active:scale-95",
          selectedTaskIds.length >= 1
            ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-100 cursor-pointer"
            : "opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400"
        )}
        title={t('Unlink selected tasks from parent modular link')}
      >
        <Unlink className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        <span>{t('Unlink')}{selectedTaskIds.length > 0 ? ` (${selectedTaskIds.length})` : ''}</span>
      </button>

      {/* Sum Duration */}
      <button
        type="button"
        onClick={() => setSumMode(sumMode === 'none' ? 'duration' : 'none')}
        className={cn(
          "p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all active:scale-95",
          sumMode !== 'none'
            ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
            : "bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] hover:bg-slate-50"
        )}
        title={t('Toggle sum duration calculation for selected tasks')}
      >
        <span className="font-mono font-bold text-xs">∑</span>
        <span className="hidden xl:inline">{t('Sum')}</span>
      </button>

      {/* Delete Selected */}
      <button
        type="button"
        disabled={totalSelected === 0}
        onClick={handleDeleteSelected}
        className={cn(
          "p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all active:scale-95",
          totalSelected > 0
            ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-100"
            : "opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400"
        )}
        title={t('Delete selected projects or tasks')}
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">{t('Delete')} ({totalSelected})</span>
      </button>

      {/* Hide / Unhide Mode */}
      <button
        type="button"
        onClick={() => setIsHideMode(!isHideMode)}
        className={cn(
          "p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all active:scale-95",
          isHideMode
            ? "bg-amber-500 border-amber-500 text-white shadow-xs"
            : "bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] hover:bg-slate-50"
        )}
        title={t('Toggle Hide Rows Mode')}
      >
        {isHideMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-amber-500" />}
        <span className="hidden xl:inline">{isHideMode ? t('Done') : t('Hide Rows')}</span>
      </button>

      {/* PDF Export */}
      <button
        type="button"
        onClick={handleExportToPDF}
        disabled={isExporting}
        className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-xs transition-colors active:scale-95 shrink-0"
        title="Export Gantt Timeline as PDF"
      >
        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        <span>{t('PDF')}</span>
      </button>
    </div>
  );
}
