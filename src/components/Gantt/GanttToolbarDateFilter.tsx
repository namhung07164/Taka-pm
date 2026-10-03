import React, { useState, useRef, useEffect } from 'react';
import { Calendar, Target, Save, X } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import { cn } from '../../lib/utils';
import { ViewMode } from './ganttTypes';

interface GanttToolbarDateFilterProps {
  handleTodayClick: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  scaleInput: string;
  setScaleInput: (val: string) => void;
  dayWidth: number;
  setDayWidth: (val: number) => void;
  isWidthChanged: boolean;
  setIsWidthChanged: (val: boolean) => void;
  saveDayWidth: () => void;
  tempStartDate: string;
  setTempStartDate: (val: string) => void;
  tempEndDate: string;
  setTempEndDate: (val: string) => void;
  setFilterStartDate: (val: string) => void;
  setFilterEndDate: (val: string) => void;
}

export function GanttToolbarDateFilter({
  handleTodayClick,
  viewMode,
  setViewMode,
  scaleInput,
  setScaleInput,
  dayWidth,
  setDayWidth,
  isWidthChanged,
  setIsWidthChanged,
  saveDayWidth,
  tempStartDate,
  setTempStartDate,
  tempEndDate,
  setTempEndDate,
  setFilterStartDate,
  setFilterEndDate
}: GanttToolbarDateFilterProps) {
  const { t } = useLanguage();
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const dateFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target as Node)) {
        setIsDateFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApplyDateRange = () => {
    setFilterStartDate(tempStartDate);
    setFilterEndDate(tempEndDate);
    setIsDateFilterOpen(false);
  };

  const handleResetDateRange = () => {
    setTempStartDate('');
    setTempEndDate('');
    setFilterStartDate('');
    setFilterEndDate('');
    setIsDateFilterOpen(false);
  };

  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      {/* Date Range Popover */}
      <div className="relative" ref={dateFilterRef}>
        <button
          type="button"
          onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
          className={cn(
            "px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer",
            tempStartDate || tempEndDate
              ? "bg-blue-50 dark:bg-[#182338] border-blue-600 text-blue-600 dark:text-blue-400 font-bold"
              : "bg-white dark:bg-[#1a1a1c] border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#252528]"
          )}
          title={t('Filter Date Range')}
        >
          <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>{t('Date Filter')}</span>
        </button>

        {isDateFilterOpen && (
          <div className="absolute top-full left-0 mt-1.5 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-3 z-50 flex flex-col gap-2.5 w-64 animate-in fade-in zoom-in-95 text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between font-bold text-xs text-slate-900 dark:text-slate-200">
              <span>{t('Filter Timeline Range')}</span>
              <button
                type="button"
                onClick={() => setIsDateFilterOpen(false)}
                className="p-0.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-1 text-xs">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{t('From Date')}:</label>
              <input
                type="date"
                value={tempStartDate}
                onChange={(e) => setTempStartDate(e.target.value)}
                className="bg-slate-50 dark:bg-[#141416] border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1 text-xs">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{t('To Date')}:</label>
              <input
                type="date"
                value={tempEndDate}
                onChange={(e) => setTempEndDate(e.target.value)}
                className="bg-slate-50 dark:bg-[#141416] border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleResetDateRange}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium cursor-pointer"
              >
                {t('Reset')}
              </button>
              <button
                type="button"
                onClick={handleApplyDateRange}
                className="px-3 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                {t('Apply')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Jump to Today button */}
      <button
        type="button"
        onClick={handleTodayClick}
        className="px-3 py-1.5 bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-[#252528] shadow-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        title="Jump timeline to Today"
      >
        <Calendar className="w-3.5 h-3.5 text-rose-500" />
        <span>{t('Today')}</span>
      </button>

      {/* View Switch */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
        <span className="uppercase tracking-wider text-[11px] text-slate-500 dark:text-slate-400 font-bold">{t('VIEW')}</span>
        <button
          type="button"
          onClick={() => {
            const nextMode = viewMode === 'monthly' ? 'weekly' : viewMode === 'weekly' ? 'quarterly' : 'monthly';
            setViewMode(nextMode);
          }}
          className="relative inline-flex h-5 w-10 items-center rounded-full bg-blue-600 transition-colors focus:outline-none"
        >
          <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform translate-x-5.5" />
        </button>
        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 capitalize">
          {viewMode === 'monthly' ? 'Monthly' : viewMode === 'weekly' ? 'Weekly' : 'Quarterly'}
        </span>
      </div>

      {/* Scale Input & Slider */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
        <span className="uppercase tracking-wider text-[11px] text-slate-500 dark:text-slate-400 font-bold">{t('SCALE')}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="0"
            max="150"
            value={scaleInput}
            onChange={(e) => {
              const val = e.target.value;
              setScaleInput(val);
              const num = Number(val);
              if (!isNaN(num) && num >= 0 && num <= 150) {
                // Scale 0% maps to super compact dayWidth = 0.6px (~18px per month)
                const calculatedDayWidth = num === 0 ? 0.6 : Math.max(0.6, Math.round((num / 75) * 8 * 10) / 10);
                setDayWidth(calculatedDayWidth);
                setIsWidthChanged(true);
              }
            }}
            className="w-12 px-2 py-1 text-xs text-center font-mono font-bold bg-white dark:bg-[#1c1c1e] border border-slate-300 dark:border-slate-700/80 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-slate-500 dark:text-slate-400 font-bold">%</span>

          {/* Integrated Scale Range Slider */}
          <input
            type="range"
            min="0.6"
            max="20"
            step="0.2"
            value={dayWidth}
            onChange={(e) => {
              const num = Number(e.target.value);
              setDayWidth(num);
              setScaleInput(String(Math.round((num / 8) * 75)));
              setIsWidthChanged(true);
            }}
            className="w-20 sm:w-28 h-1.5 bg-slate-300 dark:bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-blue-500"
            title="Slide to scale timeline zoom"
          />
        </div>

        {isWidthChanged && (
          <button
            type="button"
            onClick={saveDayWidth}
            className="p-1 text-emerald-400 hover:bg-emerald-950/40 rounded transition-colors cursor-pointer"
            title="Save zoom width as default"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
