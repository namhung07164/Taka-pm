import React, { FC } from 'react';
import { Search, Download } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';

interface DelegationCalendarFilterToolbarProps {
  totalEvents: number;
  searchDate: string;
  onSearchDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  filterStore: string;
  setFilterStore: (store: string) => void;
  uniqueStores: string[];
  filterLocation: string;
  setFilterLocation: (loc: string) => void;
  locations: string[];
  filterParty: string;
  setFilterParty: (party: string) => void;
  uniqueParties: string[];
  onExportICS: () => void;
}

export const DelegationCalendarFilterToolbar: React.FC<DelegationCalendarFilterToolbarProps> = ({
  totalEvents,
  searchDate,
  onSearchDateChange,
  filterStore,
  setFilterStore,
  uniqueStores,
  filterLocation,
  setFilterLocation,
  locations,
  filterParty,
  setFilterParty,
  uniqueParties,
  onExportICS,
}) => {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col gap-4 mb-4">
      {/* Top Row: Title */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800 dark:text-[#f3f3f3] shrink-0">
            Delegation Calendar
          </h2>
          <span className="text-sm font-medium text-slate-500 dark:text-[#a3a3a3] bg-slate-100 dark:bg-[#28282a] px-2 py-1 rounded-md">
            Total Events: {totalEvents}
          </span>
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
        <select
          value={filterParty}
          onChange={(e) => setFilterParty(e.target.value)}
          className="flex-grow sm:flex-grow-0 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
        >
          <option value="">All Parties</option>
          <option value="unassigned">Unassigned</option>
          {uniqueParties.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          onClick={onExportICS}
          className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] hover:bg-slate-50 dark:hover:bg-[#28282a] transition-colors outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
          title="Export to Calendar (.ics)"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Export ICS</span>
        </button>
      </div>
    </div>
  );
};
