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
      
      <div className="px-3 sm:px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center shrink-0 print:hidden rounded-t-xl">
        <div className="flex flex-col gap-2.5 sm:gap-3 w-full xl:w-auto flex-grow max-w-4xl">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full">
            <select 
              value={globalYearFilter}
              onChange={(e) => setGlobalYearFilter(e.target.value)}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
            >
              <option value="all">{t('All Years')}</option>
              {years.map(y => <option key={y} value={y}>{t('Year')} {y}</option>)}
            </select>

            <select 
              value={effectiveStore}
              onChange={(e) => setGlobalStoreFilter(e.target.value)}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
            >
              {stores.length > 1 && <option value="all">{t('All Stores')}</option>}
              {stores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <MultiCheckboxSelect 
              value={globalLocationFilter}
              onChange={setGlobalLocationFilter}
              options={locationOptions}
              placeholder={t('All Locations')}
              className="min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
            />

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
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
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

          <div className="relative w-full">
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
