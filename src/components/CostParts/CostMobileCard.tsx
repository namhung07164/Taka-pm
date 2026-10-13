import React, { memo } from 'react';
import { ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { Project, Cost } from '../../types';
import { cn } from '../../lib/utils';
import { QuickNavButton } from '../QuickNavButton';
import { CostMobileItemRow } from './CostMobileItemRow';
import { PaidDateMatches } from './costTypes';

interface CostMobileCardProps {
  project: Project;
  groupCosts: Cost[];
  groupKey: string;
  isExpanded: boolean;
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
  getCostPaidMatches: (
    c: Cost,
    start: string,
    end: string,
    stage: 'all' | '1st' | '2nd' | '3rd'
  ) => PaidDateMatches;
}

export const CostMobileCard = React.memo(function CostMobileCard({
  project: p,
  groupCosts,
  groupKey,
  isExpanded,
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
  getCostPaidMatches,
}: CostMobileCardProps) {
  const pDerivedYear = p.year
    ? p.year
    : p.start
    ? Number(String(p.start).substring(0, 4))
    : undefined;

  const totalAct = groupCosts.reduce((sum, c) => sum + (c.actual || 0), 0);
  const totalBalance = groupCosts.reduce(
    (sum, c) =>
      sum +
      ((c.actual || 0) -
        (c.firstPaid || 0) -
        (c.secondPaid || 0) -
        (c.thirdPaid || 0)),
    0
  );

  const pCleanName = p.name
    ? p.name.replace(new RegExp(`^${p.store}\\s*-\\s*${p.code}\\s*-\\s*`, 'i'), '')
    : '-';

  return (
    <div
      className={cn(
        'mobile-card-optimized rounded-xl border border-slate-200/90 dark:border-[#38383b] shadow-xs hover:shadow-md p-3.5 flex flex-col gap-2.5 transition-all bg-white dark:bg-[#1e1e20]',
        totalBalance >= 0
          ? 'border-l-[5px] border-l-emerald-500'
          : 'border-l-[5px] border-l-rose-500'
      )}
    >
      {/* Header: Left column (Badges & Title) & Right column (ACT/FORC, Balance, QuickNav) */}
      <div className="flex items-start justify-between gap-2 w-full">
        {/* Left Column */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
              {pDerivedYear || p.year || '-'}
            </span>
            <span
              className={cn(
                'px-1.5 py-0.5 text-[10px] font-bold rounded border uppercase shrink-0',
                p.store?.toLowerCase() === 'hcm'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200/80 dark:border-blue-800'
                  : p.store?.toLowerCase() === 'hn'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200/80 dark:border-rose-800'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              )}
            >
              {p.store || '-'}
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold font-mono rounded bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 shrink-0">
              {p.code}
            </span>
            {p.location && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                • {p.location}
              </span>
            )}
          </div>

          {/* Title row with expand toggle */}
          <div className="flex items-start gap-2 pt-0.5">
            <button
              onClick={() => toggleGroup(groupKey)}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 mt-0.5 shrink-0 rounded text-white font-extrabold text-[10px] shadow-2xs transition-all active:scale-95 touch-manipulation cursor-pointer',
                groupCosts.length >= 2
                  ? 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                  : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500'
              )}
              title={isExpanded ? 'Collapse' : `Expand (${groupCosts.length})`}
            >
              {!isExpanded ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              <span>({groupCosts.length})</span>
            </button>
            <div className="font-bold text-slate-900 dark:text-[#ffffff] text-sm sm:text-base leading-snug flex-1 min-w-0 break-words">
              {pCleanName}
            </div>
          </div>
        </div>

        {/* Right Column: ACT/FORC, Balance, QuickNav */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div
            className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-md border font-mono flex items-center gap-0.5 shrink-0',
              groupCosts.some((c) => c.costType === 'forc')
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                : 'text-blue-600 dark:text-[#8ab4f8] bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
            )}
          >
            {groupCosts.length > 0
              ? groupCosts.some((c) => c.costType === 'forc')
                ? 'FORC:'
                : 'ACT:'
              : 'ACT:'}{' '}
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalAct)}
            </span>
          </div>

          <div
            className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-md border font-mono shrink-0',
              totalBalance >= 0
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-[#1a3821] border-emerald-200 dark:border-[#265330]'
                : 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-[#3b1a1a] border-red-200 dark:border-[#5c2424]'
            )}
          >
            Bal: {formatCurrency(totalBalance)}
          </div>

          <QuickNavButton
            project={p}
            title={`Quick Navigator (${p.code})`}
            className="p-1! rounded!"
          />
        </div>
      </div>

      {/* Expanded Cost Item Cards */}
      {isExpanded && (
        <div className="flex flex-col gap-2.5 mt-1">
          {groupCosts.map((c) => (
            <CostMobileItemRow
              key={c.id}
              cost={c}
              project={p}
              pDerivedYear={pDerivedYear}
              canWrite={canWrite}
              currency={currency}
              jpyRate={jpyRate}
              usdRate={usdRate}
              paidDateStart={paidDateStart}
              paidDateEnd={paidDateEnd}
              paidStageFilter={paidStageFilter}
              getCostPaidMatches={getCostPaidMatches}
              handleUpdateCost={handleUpdateCost}
              handleDeleteCost={handleDeleteCost}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      )}

      {canWrite && isExpanded && (
        <button
          onClick={() => handleAddCost(p)}
          className="mt-2 w-full py-2 bg-slate-100 dark:bg-[#1e1e20] hover:bg-slate-200 dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] text-sm font-bold rounded-lg border border-slate-200 dark:border-[#444446] border-dashed flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Cost Entry
        </button>
      )}
    </div>
  );
});
