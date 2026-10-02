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
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Date Range Popover */}
      <div className="relative" ref={dateFilterRef}>
        <button
          type="button"
          onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
          className={cn(
            "p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all active:scale-95",
            tempStartDate || tempEndDate
              ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-600 dark:text-[#8ab4f8]"
              : "bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] hover:bg-slate-50"
          )}
          title={t('Filter Date Range')}
        >
          <Calendar className="w-3.5 h-3.5 text-blue-500" />
          <span className="hidden xl:inline">{t('Dates')}</span>
        </button>

        {isDateFilterOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-xl p-3 z-50 flex flex-col gap-2.5 w-64 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between font-bold text-xs text-slate-800 dark:text-slate-200">
              <span>{t('Filter Timeline Range')}</span>
              <button
                type="button"
                onClick={() => setIsDateFilterOpen(false)}
                className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-1 text-xs">
              <label className="text-[11px] font-semibold text-slate-500">{t('From Date')}:</label>
              <input
                type="date"
                value={tempStartDate}
                onChange={(e) => setTempStartDate(e.target.value)}
                className="bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-[#e3e3e3] outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1 text-xs">
              <label className="text-[11px] font-semibold text-slate-500">{t('To Date')}:</label>
              <input
                type="date"
                value={tempEndDate}
                onChange={(e) => setTempEndDate(e.target.value)}
                className="bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-[#e3e3e3] outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleResetDateRange}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
              >
                {t('Reset')}
              </button>
              <button
                type="button"
                onClick={handleApplyDateRange}
                className="px-3 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
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
        className="p-1.5 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] text-xs font-semibold rounded-lg hover:bg-slate-50 shadow-xs flex items-center gap-1 active:scale-95 transition-all"
        title="Jump timeline to Today"
      >
        <Target className="w-3.5 h-3.5 text-blue-500" />
        <span className="hidden xl:inline">{t('Today')}</span>
      </button>

      {/* View Mode Selector (Weekly, Monthly, Quarterly) */}
      <div className="flex items-center bg-slate-100 dark:bg-[#18181a] p-0.5 rounded-lg border border-slate-200 dark:border-[#444446] text-xs">
        {(['weekly', 'monthly', 'quarterly'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={cn(
              "px-2 py-1 rounded-md capitalize font-semibold transition-all text-xs",
              viewMode === mode
                ? "bg-white dark:bg-[#28282b] text-blue-600 dark:text-[#8ab4f8] shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            )}
          >
            {mode === 'weekly' ? 'W' : mode === 'monthly' ? 'M' : 'Q'}
          </button>
        ))}
      </div>

      {/* Day Width Scale Input */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="5"
          max="120"
          value={scaleInput}
          onChange={(e) => {
            const val = e.target.value;
            setScaleInput(val);
            const num = Number(val);
            if (!isNaN(num) && num >= 5 && num <= 120) {
              setDayWidth(num);
              setIsWidthChanged(true);
            }
          }}
          className="w-12 px-1.5 py-1 text-xs text-center font-mono bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          title="Custom day width px"
        />
        {isWidthChanged && (
          <button
            type="button"
            onClick={saveDayWidth}
            className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded transition-colors"
            title="Save zoom width as default"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
