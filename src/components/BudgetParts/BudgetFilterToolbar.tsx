import React, { useRef } from 'react';
import { Search, Download, Upload, Plus } from 'lucide-react';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { FixedProjectInput } from '../FixedProjectInput';
import { MultiCheckboxSelect } from '../MultiCheckboxSelect';
import { ColumnAdder } from '../ColumnAdder';
import { useLanguage } from '../../lib/LanguageContext';
import { safeSetItemSession } from '../../lib/storage';
import { useAppStore } from '../../store/useAppStore';
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
  onAddBudget?: () => void;
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
  handleImportBudget,
  onAddBudget
}: BudgetFilterToolbarProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projects = useAppStore(state => state.projects);

  return (
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

        {/* Col 4: Money Filter */}
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
          className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
        >
          <option value="all">{t('All Projects')}</option>
          <option value="has_money">{t('Has Budget or Actual')}</option>
          <option value="has_budget">{t('Has Budget Only')}</option>
          <option value="has_act_forc">{t('Has Actual/Forc Only')}</option>
        </select>
      </div>

      {/* Row 2: Fixed Project, Search & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 w-full">
        <div className="flex flex-wrap items-center gap-2 flex-grow">
          <FixedProjectInput 
            projects={projects} 
            yearFilter={globalYearFilter}
            storeFilter={effectiveStore}
            locationFilter={globalLocationFilter}
            statusFilter={moneyFilter}
          />

          <div className="relative flex-1 min-w-[150px] sm:min-w-[180px] md:min-w-[240px] max-w-full sm:max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl">
            <DebouncedSearchInput 
              value={searchTerm} 
              onChange={(val) => setSearchTerm(val)}
              placeholder={t('Search anything...')}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          {canWrite && (
            <button 
              type="button"
              onClick={onAddBudget}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all active:scale-95 touch-manipulation cursor-pointer"
              title={t('Add Budget')}
            >
              <Plus className="w-4 h-4" />
              <span>{t('Add Budget')}</span>
            </button>
          )}

          <button 
            type="button"
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
                type="button"
                onClick={() => fileInputRef.current?.click()} 
                className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-[#28282a] shadow-sm transition-all active:scale-95 touch-manipulation"
                title="Import Budget CSV (Updates matching projects)"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">{t('Import CSV')}</span>
              </button>
            </>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <ColumnAdder 
              availableColumns={AVAILABLE_COLUMNS} 
              visibleColumns={visibleColumns} 
              onAddColumn={handleToggleColumn} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}
