import React, { useRef } from 'react';
import { Search, Download, Upload } from 'lucide-react';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { MultiCheckboxSelect } from '../MultiCheckboxSelect';
import { ColumnAdder } from '../ColumnAdder';
import { useLanguage } from '../../lib/LanguageContext';
import { safeSetItemSession } from '../../lib/storage';
import { AVAILABLE_COLUMNS } from './budgetTypes';

interface BudgetFilterToolbarProps {
  canWrite: boolean;
  globalYearFilter: string;
  setGlobalYearFilter: (val: string) => void;
  years: string[];
  effectiveStore: string;
  setGlobalStoreFilter: (val: string) => void;
  stores: string[];
  globalLocationFilter: string[];
  setGlobalLocationFilter: (locs: string[]) => void;
  locationOptions: string[];
  moneyFilter: string;
  setMoneyFilter: (val: string) => void;
  lastSelectedMoneyFilterRef: React.MutableRefObject<string>;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  visibleColumns: string[];
  handleToggleColumn: (colId: string) => void;
  handleExportBudget: () => void;
  handleImportBudget: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function BudgetFilterToolbar({
  canWrite,
  globalYearFilter,
  setGlobalYearFilter,
  years,
  effectiveStore,
  setGlobalStoreFilter,
  stores,
  globalLocationFilter,
  setGlobalLocationFilter,
  locationOptions,
  moneyFilter,
  setMoneyFilter,
  lastSelectedMoneyFilterRef,
  searchTerm,
  setSearchTerm,
  visibleColumns,
  handleToggleColumn,
  handleExportBudget,
  handleImportBudget
}: BudgetFilterToolbarProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
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
            value={moneyFilter}
            onChange={(e) => {
              const val = e.target.value;
              setMoneyFilter(val);
              if (!searchTerm.trim()) {
                lastSelectedMoneyFilterRef.current = val;
                safeSetItemSession("taka_budget_money_filter", val);
              }
            }}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
          >
            <option value="all">{t('All Projects')}</option>
            <option value="has_money">{t('Has Budget or Actual')}</option>
            <option value="has_budget">{t('Has Budget Only')}</option>
            <option value="has_act_forc">{t('Has Actual/Forc Only')}</option>
          </select>
        </div>

        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-[#838383] z-10">
            <Search className="w-4 h-4" />
          </div>
          <DebouncedSearchInput 
            value={searchTerm} 
            onChange={(val) => setSearchTerm(val)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 pr-3 p-2 outline-none shadow-sm" 
            placeholder={t('Search anything...')}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-end">
        <button 
          onClick={handleExportBudget} 
          className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-[#28282a] shadow-sm transition-all active:scale-95 touch-manipulation"
          title="Export Filtered CSV"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">{t('Export CSV')}</span>
        </button>
        
        {canWrite && (
          <>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImportBudget} 
              accept=".csv" 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-[#28282a] shadow-sm transition-all active:scale-95 touch-manipulation"
              title="Import Budget CSV (Updates matching projects)"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">{t('Import CSV')}</span>
            </button>
          </>
        )}

        <ColumnAdder 
          availableColumns={AVAILABLE_COLUMNS} 
          visibleColumns={visibleColumns} 
          onAddColumn={handleToggleColumn} 
        />
      </div>
    </div>
  );
}
