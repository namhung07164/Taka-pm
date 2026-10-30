import React, { useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
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

  useEffect(() => {
    const handleTriggerExport = () => {
      handleExportBudget();
    };
    const handleTriggerImport = () => {
      fileInputRef.current?.click();
    };
    window.addEventListener('taka_trigger_budget_export', handleTriggerExport);
    window.addEventListener('taka_trigger_budget_import', handleTriggerImport);
    return () => {
      window.removeEventListener('taka_trigger_budget_export', handleTriggerExport);
      window.removeEventListener('taka_trigger_budget_import', handleTriggerImport);
    };
  }, [handleExportBudget]);

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

          {/* Hidden Action Elements for Hamburger Menu & Shortcuts */}
          <button 
            id="budget-export-btn"
            type="button"
            onClick={handleExportBudget} 
            className="hidden"
            aria-hidden="true"
          />
          
          {canWrite && (
            <>
              <input 
                id="budget-import-input"
                type="file" 
                ref={fileInputRef} 
                onChange={handleImportBudget} 
                accept=".csv" 
                className="hidden" 
              />
              <button
                id="budget-full-import-btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="hidden"
                aria-hidden="true"
              />
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
