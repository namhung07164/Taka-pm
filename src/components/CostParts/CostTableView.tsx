import React, { memo } from 'react';
import { Project, Cost } from '../../types';
import { CostColWidths, PaidDateMatches } from './costTypes';
import { CostTableRow } from './CostTableRow';
import { CostTableHeader } from './CostTableHeader';
import { CostTableTotalRow } from './CostTableTotalRow';

interface CostTableViewProps {
  filteredProjectsForDisplay: Project[];
  visibleColumns: string[];
  colWidths: CostColWidths;
  handleResize: (col: keyof CostColWidths, newWidth: number) => void;
  handleToggleColumn: (colId: string) => void;
  expandedCodes: string[];
  setExpandedCodes: (codes: string[]) => void;
  sortedProjects: Project[];
  formatCurrency: (val: number | undefined) => string;
  hasActForcFilter: string;
  setHasActForcFilter: (val: string | ((prev: string) => string)) => void;
  totalActAll: number;
  totalFirstPaidAll: number;
  totalSecondPaidAll: number;
  totalThirdPaidAll: number;
  totalBalanceAll: number;
  totalSupAll: number;
  visibleCount: number;
  setVisibleCount: (fn: (prev: number) => number) => void;
  handleCostScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  toggleGroup: (key: string) => void;
  handleProjectLinkClick: (p: Project) => void;
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
  ) => PaidDateMatches;
}

export const CostTableView = React.memo(function CostTableView({
  filteredProjectsForDisplay,
  visibleColumns,
  colWidths,
  handleResize,
  handleToggleColumn,
  expandedCodes,
  setExpandedCodes,
  sortedProjects,
  formatCurrency,
  hasActForcFilter,
  setHasActForcFilter,
  totalActAll,
  totalFirstPaidAll,
  totalSecondPaidAll,
  totalThirdPaidAll,
  totalBalanceAll,
  totalSupAll,
  visibleCount,
  setVisibleCount,
  handleCostScroll,
  toggleGroup,
  handleProjectLinkClick,
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
}: CostTableViewProps) {
  const tableWidth = visibleColumns.reduce(
    (acc, col) => acc + (colWidths[col as keyof CostColWidths] || 100),
    0
  );

  return (
    <div
      className="hidden xl:block overflow-x-auto flex-grow pb-16 max-h-[78vh]"
      onScroll={handleCostScroll}
    >
      <table
        className="text-sm text-left text-slate-600 dark:text-[#a3a3a3] table-fixed min-w-full"
        style={{ width: `${tableWidth}px` }}
      >
        <CostTableHeader
          visibleColumns={visibleColumns}
          colWidths={colWidths}
          handleResize={handleResize}
          handleToggleColumn={handleToggleColumn}
          expandedCodes={expandedCodes}
          setExpandedCodes={setExpandedCodes}
          sortedProjects={sortedProjects}
        />
        <tbody>
          <CostTableTotalRow
            visibleColumns={visibleColumns}
            hasActForcFilter={hasActForcFilter}
            setHasActForcFilter={setHasActForcFilter}
            totalActAll={totalActAll}
            totalFirstPaidAll={totalFirstPaidAll}
            totalSecondPaidAll={totalSecondPaidAll}
            totalThirdPaidAll={totalThirdPaidAll}
            totalBalanceAll={totalBalanceAll}
            totalSupAll={totalSupAll}
            formatCurrency={formatCurrency}
          />

          {/* Progressive Rendered Project Groups & Detail Rows */}
          {filteredProjectsForDisplay.slice(0, visibleCount).map((p, pIdx) => {
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
            const isExpanded =
              expandedCodes.includes(groupKey) ||
              expandedCodes.includes(String(p.no)) ||
              (p.id ? expandedCodes.includes(String(p.id)) : false) ||
              (p.code ? expandedCodes.includes(String(p.code)) : false);

            return (
              <CostTableRow
                key={`${p.code}-${p.year}-${p.no}`}
                project={p}
                pIdx={pIdx}
                groupCosts={groupCosts}
                allGroupCosts={allGroupCosts}
                groupKey={groupKey}
                isExpanded={isExpanded}
                toggleGroup={toggleGroup}
                visibleColumns={visibleColumns}
                handleProjectLinkClick={handleProjectLinkClick}
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
            <tr>
              <td colSpan={visibleColumns.length} className="py-4 text-center">
                <button
                  onClick={() => setVisibleCount((prev) => prev + 30)}
                  className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm cursor-pointer"
                >
                  Load More Projects (
                  {filteredProjectsForDisplay.length - visibleCount} remaining)
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
