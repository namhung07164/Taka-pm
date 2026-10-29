import React from 'react';
import { RefreshCw } from 'lucide-react';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { MultiCheckboxSelect } from '../MultiCheckboxSelect';
import { AppUser } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import { safeSetItemSession } from '../../lib/storage';
import { cn } from '../../lib/utils';

interface GeneralFilterToolbarProps {
  currentUser: AppUser;
  isSyncing: boolean;
  handleGoogleSync: () => Promise<void>;
  globalYearFilter: string;
  setGlobalYearFilter: (val: string) => void;
  years: string[];
  effectiveStore: string;
  setGlobalStoreFilter: (val: string) => void;
  stores: string[];
  globalLocationFilter: string[];
  setGlobalLocationFilter: (locs: string[]) => void;
  locationOptions: string[];
  statusFilter: string;
  setStatusFilter: (st: string) => void;
  lastSelectedStatusFilterRef: React.MutableRefObject<string>;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export function GeneralFilterToolbar({
  currentUser,
  isSyncing,
  handleGoogleSync,
  globalYearFilter,
  setGlobalYearFilter,
  years,
  effectiveStore,
  setGlobalStoreFilter,
  stores,
  globalLocationFilter,
  setGlobalLocationFilter,
  locationOptions,
  statusFilter,
  setStatusFilter,
  lastSelectedStatusFilterRef,
  searchTerm,
  setSearchTerm
}: GeneralFilterToolbarProps) {
  const { t } = useLanguage();

  return (
    <>
      {/* Sticky Action Controls (matching DetailTab design) */}
      {currentUser.role === 'admin' && (
        <div className="fixed top-[76px] xl:top-[84px] right-4 md:right-8 z-50 flex flex-row gap-2 justify-end items-start print:hidden">
          <button 
            onClick={handleGoogleSync}
            disabled={isSyncing}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-lg font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs ${
              isSyncing
                ? "bg-red-50 hover:bg-red-100 border-red-200 text-red-600 dark:text-red-400 disabled:opacity-50"
                : "bg-slate-900 dark:bg-blue-600 border border-slate-800 dark:border-blue-500 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 shadow-md"
            }`}
            title="Google Sync"
          >
            <RefreshCw className={cn("w-4 h-4 pointer-events-none", isSyncing && "animate-spin")} />
            <span className="hidden sm:inline pointer-events-none">{isSyncing ? t('Syncing...') : t('Google Sync')}</span>
          </button>
        </div>
      )}
      
      <div className="p-2 sm:p-3 bg-slate-100 dark:bg-[#121214] border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2 shrink-0 print:hidden rounded-t-xl text-slate-800 dark:text-slate-100">
        {/* Row 1: 4 Compact Filter Boxes in 2x2 grid on mobile and 4 cols on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 flex-grow w-full">
          {/* Col 1: Year */}
          <select 
            value={globalYearFilter}
            onChange={(e) => setGlobalYearFilter(e.target.value)}
            className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
          >
            <option value="all">{t('All Years')}</option>
            {years.map(y => <option key={y} value={y}>{t('Year')} {y}</option>)}
          </select>

          {/* Col 2: Store */}
          <select 
            value={effectiveStore}
            onChange={(e) => setGlobalStoreFilter(e.target.value)}
            className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
          >
            {stores.length > 1 && <option value="all">{t('All Stores')}</option>}
            {stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Col 3: Location */}
          <MultiCheckboxSelect 
            value={globalLocationFilter}
            onChange={setGlobalLocationFilter}
            options={locationOptions}
            placeholder={t('All Locations')}
            className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 rounded-lg text-xs"
          />

          {/* Col 4: Status */}
          <select 
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value;
              setStatusFilter(val);
              if (!searchTerm.trim()) {
                lastSelectedStatusFilterRef.current = val;
                safeSetItemSession("taka_general_status_filter", val);
              }
            }}
            className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
          >
            <option value="all">{t('All Statuses')}</option>
            <option value="On process">{t('On process')}</option>
            <option value="On process + Upcoming 3 days">{t('On process + Upcoming 3 days')}</option>
            <option value="Upcoming">{t('Upcoming')}</option>
            <option value="Completed">{t('Completed')}</option>
            <option value="Handover">{t('Handover')}</option>
            <option value="Canceled">{t('Canceled')}</option>
          </select>
        </div>

        {/* Row 2: Search */}
        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1 min-w-[150px] sm:min-w-[180px] md:min-w-[240px] max-w-full sm:max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl">
            <DebouncedSearchInput 
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              placeholder={t('Search anything...')}
            />
          </div>
        </div>
      </div>
    </>
  );
}
