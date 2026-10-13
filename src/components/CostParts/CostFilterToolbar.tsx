import React, { memo } from 'react';
import { Search } from 'lucide-react';
import { MultiCheckboxSelect } from '../MultiCheckboxSelect';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { ColumnAdder } from '../ColumnAdder';
import { FullReplaceImport } from '../FullReplaceImport';
import { AVAILABLE_COLUMNS } from './costTypes';
import { useAppStore } from '../../store/useAppStore';

interface CostFilterToolbarProps {
  globalYearFilter: string;
  setGlobalYearFilter: (val: string) => void;
  years: string[];
  effectiveStore: string;
  setGlobalStoreFilter: (val: string) => void;
  stores: string[];
  globalLocationFilter: string[];
  setGlobalLocationFilter: (val: string[]) => void;
  locationOptions: string[];
  hasActForcFilter: string;
  setHasActForcFilter: (val: string) => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  visibleColumns: string[];
  handleToggleColumn: (colId: string) => void;
  canWrite: boolean;
  isAdmin: boolean;
  handleExportCosts: () => void;
  handleImportCosts: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const CostFilterToolbar = React.memo(function CostFilterToolbar({
  globalYearFilter,
  setGlobalYearFilter,
  years,
  effectiveStore,
  setGlobalStoreFilter,
  stores,
  globalLocationFilter,
  setGlobalLocationFilter,
  locationOptions,
  hasActForcFilter,
  setHasActForcFilter,
  searchTerm,
  setSearchTerm,
  visibleColumns,
  handleToggleColumn,
  canWrite,
  isAdmin,
  handleExportCosts,
  handleImportCosts,
}: CostFilterToolbarProps) {
  return (
    <div className="px-3 sm:px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center shrink-0 print:hidden">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full xl:w-auto flex-grow min-w-0">
        <select
          value={globalYearFilter}
          onChange={(e) => setGlobalYearFilter(e.target.value)}
          className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none cursor-pointer"
        >
          <option value="all">All Years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </select>

        <select
          value={effectiveStore}
          onChange={(e) => setGlobalStoreFilter(e.target.value)}
          className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none cursor-pointer"
        >
          {stores.length > 1 && <option value="all">All Stores</option>}
          {stores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <MultiCheckboxSelect
          value={globalLocationFilter}
          onChange={setGlobalLocationFilter}
          options={locationOptions}
          placeholder="All Locations"
          className="min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
        />

        <select
          value={hasActForcFilter}
          onChange={(e) => setHasActForcFilter(e.target.value)}
          className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none cursor-pointer"
        >
          <option value="all">All Act/Forc</option>
          <option value="has_value">Has Act/Forc</option>
        </select>

        <div className="relative flex-grow min-w-[140px] sm:min-w-[180px] max-w-full">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-[#838383] z-10">
            <Search className="w-4 h-4" />
          </div>
          <DebouncedSearchInput
            value={searchTerm}
            onChange={(val) => setSearchTerm(val)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 pr-3 p-2 outline-none shadow-sm"
            placeholder="Search in cost details..."
          />
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 self-end xl:self-center">
        <ColumnAdder
          availableColumns={AVAILABLE_COLUMNS}
          visibleColumns={visibleColumns}
          onAddColumn={handleToggleColumn}
        />

        {canWrite && (
          <div className="flex gap-1 items-center">
            {isAdmin && (
              <FullReplaceImport
                collectionName="taka_costs"
                onImportSuccess={(count) =>
                  useAppStore.getState().setToast({
                    title: 'Notice',
                    message: `Full replace successful! Imported ${count} cost entries.`,
                  })
                }
                onParseRow={(row, headers) => {
                  const c: any = {};
                  const parseCSVNumber = (val: any) => {
                    if (typeof val === 'string') {
                      const cleaned = val.replace(/,/g, '').trim();
                      if (cleaned === '-' || cleaned === '') return 0;
                      const num = Number(cleaned);
                      return isNaN(num) ? 0 : num;
                    }
                    return Number(val) || 0;
                  };

                  headers.forEach((h, i) => {
                    const keyMap: Record<string, string> = {
                      projectcode: 'projectCode',
                      projectyear: 'projectYear',
                      year: 'projectYear',
                      projectstore: 'projectStore',
                      store: 'projectStore',
                      firstpaid: 'firstPaid',
                      firstpaidat: 'firstPaidAt',
                      secondpaid: 'secondPaid',
                      secondpaidat: 'secondPaidAt',
                      thirdpaid: 'thirdPaid',
                      thirdpaidat: 'thirdPaidAt',
                      supportingfee: 'supportingFee',
                    };
                    const field = keyMap[h] || h;
                    let val: any = row[i];
                    if (
                      [
                        'actual',
                        'firstPaid',
                        'secondPaid',
                        'thirdPaid',
                        'supportingFee',
                      ].includes(field)
                    ) {
                      val = parseCSVNumber(val);
                    }
                    if (['projectYear'].includes(field)) {
                      val = isNaN(Number(val)) ? val : Number(val);
                    }
                    c[field] = val;
                  });
                  if (!c.projectCode || !c.description) return null;
                  return c;
                }}
                id="cost-full-import-btn"
                hiddenBtn={true}
              />
            )}
            <button
              id="cost-export-btn"
              onClick={handleExportCosts}
              className="hidden"
            />
            <input
              id="cost-import-input"
              type="file"
              accept=".csv"
              onChange={handleImportCosts}
              className="hidden"
            />
          </div>
        )}
      </div>
    </div>
  );
});
