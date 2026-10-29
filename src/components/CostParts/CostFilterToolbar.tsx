import React, { memo } from 'react';
import { Search } from 'lucide-react';
import { MultiCheckboxSelect } from '../MultiCheckboxSelect';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { FixedProjectInput } from '../FixedProjectInput';
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
  const projects = useAppStore((state) => state.projects);

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
          <option value="all">All Years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </select>

        {/* Col 2: Store */}
        <select
          value={effectiveStore}
          onChange={(e) => setGlobalStoreFilter(e.target.value)}
          className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
        >
          {stores.length > 1 && <option value="all">All Stores</option>}
          {stores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Col 3: Location */}
        <MultiCheckboxSelect
          value={globalLocationFilter}
          onChange={setGlobalLocationFilter}
          options={locationOptions}
          placeholder="All Locations"
          className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 rounded-lg text-xs"
        />

        {/* Col 4: Act/Forc Filter */}
        <select
          value={hasActForcFilter}
          onChange={(e) => setHasActForcFilter(e.target.value)}
          className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
        >
          <option value="all">All Act/Forc</option>
          <option value="has_value">Has Act/Forc</option>
        </select>
      </div>

      {/* Row 2: Fixed Project, Search & Column Adder */}
      <div className="flex flex-wrap items-center justify-between gap-2 w-full">
        <div className="flex flex-wrap items-center gap-2 flex-grow">
          <FixedProjectInput projects={projects} />

          <div className="relative flex-1 min-w-[150px] sm:min-w-[180px] md:min-w-[240px] max-w-full sm:max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl">
            <DebouncedSearchInput
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              placeholder="Search in cost details..."
            />
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end shrink-0">
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
    </div>
  );
});
