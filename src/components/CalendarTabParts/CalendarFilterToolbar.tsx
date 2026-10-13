import React, { Dispatch, FC, SetStateAction } from 'react';
import { Search, Download, Smartphone } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import { useAppStore } from '../../store/useAppStore';

interface CalendarFilterToolbarProps {
  currentView: string;
  showSubTasksInMonth: boolean;
  setShowSubTasksInMonth: React.Dispatch<React.SetStateAction<boolean>>;
  searchDate: string;
  onSearchDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  filterStore: string;
  setFilterStore: (store: string) => void;
  uniqueStores: string[];
  filterLocation: string;
  setFilterLocation: (loc: string) => void;
  locations: string[];
  onExportICS: () => void;
}

export const CalendarFilterToolbar: React.FC<CalendarFilterToolbarProps> = ({
  currentView,
  showSubTasksInMonth,
  setShowSubTasksInMonth,
  searchDate,
  onSearchDateChange,
  filterStore,
  setFilterStore,
  uniqueStores,
  filterLocation,
  setFilterLocation,
  locations,
  onExportICS,
}) => {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col gap-4 mb-4">
      {/* Top Row: Title and Legend */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 dark:text-[#f3f3f3] shrink-0">
            Task Calendar
          </h2>
        </div>
        <div className="flex gap-4 text-sm shrink-0">
          {currentView === 'month' ? (
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></div>
                <span className="text-slate-600 dark:text-[#c3c3c3] font-medium whitespace-nowrap">
                  {t('Project Start')}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-orange-400 shrink-0"></div>
                <span className="text-slate-600 dark:text-[#c3c3c3] font-medium whitespace-nowrap">
                  {t('Project Finish')}
                </span>
              </div>
              {showSubTasksInMonth && (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-blue-600 shrink-0"></div>
                    <span className="text-slate-600 dark:text-[#c3c3c3] font-medium whitespace-nowrap">
                      {t('Task Start')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#a21caf] shrink-0"></div>
                    <span className="text-slate-600 dark:text-[#c3c3c3] font-medium whitespace-nowrap">
                      {t('Task Finish')}
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <div className="w-3 h-3 rounded-full bg-orange-400"></div>
              <span className="text-slate-600 dark:text-[#c3c3c3] font-medium">
                {t('Task con (Tasks)')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-grow sm:flex-grow-0 min-w-[140px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400 pointer-events-none" />
          </div>
          <input
            type="date"
            value={searchDate}
            onChange={onSearchDateChange}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 dark:border-[#555558] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 dark:bg-[#1e1e20]/50"
            title="Search Date"
          />
        </div>
        <select
          value={filterStore}
          onChange={(e) => setFilterStore(e.target.value)}
          className="flex-grow sm:flex-grow-0 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
        >
          <option value="">{t('All Stores')}</option>
          {uniqueStores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value)}
          className="flex-grow sm:flex-grow-0 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
        >
          <option value="">{t('All Locations')}</option>
          {Array.from(new Set(locations)).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {/* Toggle Task Con */}
        <button
          type="button"
          onClick={() => setShowSubTasksInMonth((prev) => !prev)}
          className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-all shadow-xs shrink-0 select-none ${
            showSubTasksInMonth
              ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold'
              : 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#28282a]'
          }`}
          title="Bật/tắt hiển thị task con trong calendar"
        >
          <span className="text-xs sm:text-sm whitespace-nowrap">
            {t('Task con')}
          </span>
          <div
            className={`w-8 h-4.5 rounded-full p-0.5 transition-colors relative flex items-center ${
              showSubTasksInMonth ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                showSubTasksInMonth ? 'translate-x-3.5' : 'translate-x-0'
              }`}
            />
          </div>
        </button>
        <button
          onClick={onExportICS}
          className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] hover:bg-slate-50 dark:hover:bg-[#28282a] transition-colors outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
          title="Export to Calendar (.ics)"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Export ICS</span>
        </button>
        <button
          onClick={() => useAppStore.getState().setIsCalendarSyncModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800/60 rounded-lg text-sm font-semibold text-red-700 dark:text-red-300 transition-all outline-none focus:ring-2 focus:ring-red-500 shrink-0 shadow-xs cursor-pointer active:scale-95"
          title="Đồng bộ Apple Calendar (iOS)"
        >
          <Smartphone className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span className="hidden sm:inline">Apple Calendar (iOS)</span>
        </button>
      </div>
    </div>
  );
};
