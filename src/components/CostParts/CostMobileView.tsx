import React, { memo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Project, Cost } from '../../types';
import { CostMobileCard } from './CostMobileCard';

interface CostMobileViewProps {
  filteredProjectsForDisplay: Project[];
  visibleCount: number;
  setVisibleCount: (fn: (prev: number) => number) => void;
  expandedCodes: string[];
  toggleAll: () => void;
  toggleGroup: (key: string) => void;
  formatCurrency: (val: number | undefined) => string;
  canWrite: boolean;
  handleAddCost: (p: Project) => void;
  handleDeleteCost: (c: Cost) => void;
  handleUpdateCost: (c: Cost, field: keyof Cost, value: any) => void;
  currency: 'VND' | 'JPY' | 'USD';
  jpyRate: number;
  usdRate: number;
  paidDateStart: string;
  paidDateEnd: string;
  paidStageFilter: 'all' | '1st' | '2nd' | '3rd';
  getGroupCostsForProject: (p: Project) => Cost[];
  getCostPaidMatches: (
    c: Cost,
    start: string,
    end: string,
    stage: 'all' | '1st' | '2nd' | '3rd'
  ) => { matches: boolean; firstMatch: boolean; secondMatch: boolean; thirdMatch: boolean };
  handleCostScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const CostMobileView = React.memo(function CostMobileView({
  filteredProjectsForDisplay,
  visibleCount,
  setVisibleCount,
  expandedCodes,
  toggleAll,
  toggleGroup,
  formatCurrency,
  canWrite,
  handleAddCost,
  handleDeleteCost,
  handleUpdateCost,
  currency,
  jpyRate,
  usdRate,
  paidDateStart,
  paidDateEnd,
  paidStageFilter,
  getGroupCostsForProject,
  getCostPaidMatches,
  handleCostScroll,
}: CostMobileViewProps) {
  return (
    <>
      <div className="xl:hidden flex justify-between items-center px-2 pb-2 mt-2">
        <span className="text-sm font-bold text-slate-600 dark:text-[#a3a3a3]">
          Cost Projects ({filteredProjectsForDisplay.length})
        </span>
        <button
          onClick={toggleAll}
          className="flex items-center gap-1 text-sm text-blue-600 dark:text-[#8ab4f8] font-medium hover:text-blue-800 transition-colors cursor-pointer"
        >
          {expandedCodes.length === 0 ? (
            <>
              <ChevronRight className="w-4 h-4" /> Expand All
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" /> Collapse All
            </>
          )}
        </button>
      </div>

      <div
        className="xl:hidden flex-grow overflow-y-auto flex flex-col gap-4 pb-4 px-2"
        onScroll={handleCostScroll}
      >
        {filteredProjectsForDisplay.slice(0, visibleCount).map((p) => {
          const pDerivedYear = p.year
            ? p.year
            : p.start
            ? Number(String(p.start).substring(0, 4))
            : undefined;
          const allGroupCosts = getGroupCostsForProject(p);
          const groupCosts =
            paidDateStart || paidDateEnd
              ? allGroupCosts.filter(
                  (c) =>
                    getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter).matches
                )
              : allGroupCosts;
          const groupKey = `${p.code}-${pDerivedYear}-${p.store}-${p.no}`;
          const isExpanded = expandedCodes.includes(groupKey);

          return (
            <CostMobileCard
              key={`${p.code}-${p.year}-${p.no}`}
              project={p}
              groupCosts={groupCosts}
              groupKey={groupKey}
              isExpanded={isExpanded}
              toggleGroup={toggleGroup}
              formatCurrency={formatCurrency}
              canWrite={canWrite}
              handleAddCost={handleAddCost}
              handleDeleteCost={handleDeleteCost}
              handleUpdateCost={handleUpdateCost}
              currency={currency}
              jpyRate={jpyRate}
              usdRate={usdRate}
              paidDateStart={paidDateStart}
              paidDateEnd={paidDateEnd}
              paidStageFilter={paidStageFilter}
              getCostPaidMatches={getCostPaidMatches}
            />
          );
        })}

        {visibleCount < filteredProjectsForDisplay.length && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setVisibleCount((prev) => prev + 30)}
              className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm cursor-pointer"
            >
              Load More Projects (
              {filteredProjectsForDisplay.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </>
  );
});
