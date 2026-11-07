import React, { Fragment, memo } from 'react';
import { ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { Project, Cost } from '../../types';
import { cn } from '../../lib/utils';
import { QuickNavButton } from '../QuickNavButton';
import { QRCodeButton } from '../QRCodeButton';
import { CostDetailItemRow } from './CostDetailItemRow';

interface CostTableRowProps {
  project: Project;
  pIdx: number;
  groupCosts: Cost[];
  allGroupCosts: Cost[];
  groupKey: string;
  isExpanded: boolean;
  toggleGroup: (key: string) => void;
  visibleColumns: string[];
  handleProjectLinkClick: (p: Project) => void;
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
  ) => { matches: boolean; firstMatch: boolean; secondMatch: boolean; thirdMatch: boolean };
}

export const CostTableRow = React.memo(function CostTableRow({
  project: p,
  pIdx,
  groupCosts,
  allGroupCosts,
  groupKey,
  isExpanded,
  toggleGroup,
  visibleColumns,
  handleProjectLinkClick,
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
}: CostTableRowProps) {
  const totalAct = groupCosts.reduce((sum, c) => sum + (c.actual || 0), 0);
  const totalFirstPaid = groupCosts.reduce((sum, c) => sum + (c.firstPaid || 0), 0);
  const totalSecondPaid = groupCosts.reduce((sum, c) => sum + (c.secondPaid || 0), 0);
  const totalThirdPaid = groupCosts.reduce((sum, c) => sum + (c.thirdPaid || 0), 0);
  const totalBalance = groupCosts.reduce(
    (sum, c) =>
      sum +
      ((c.actual || 0) -
        (c.firstPaid || 0) -
        (c.secondPaid || 0) -
        (c.thirdPaid || 0)),
    0
  );
  const totalSup = groupCosts.reduce((sum, c) => sum + (c.supportingFee || 0), 0);

  const hasAnyCosts = allGroupCosts.length > 0;
  const computedActual = allGroupCosts.reduce((s, c) => s + (Number(c.actual) || 0), 0);
  const computedSup = allGroupCosts.reduce((s, c) => s + (Number(c.supportingFee) || 0), 0);
  const pFin = p.financial || {
    totalApproved: p.budget || 0,
    totalActualPaid: 0,
  };
  const trueActual = computedActual;
  const trueSup = hasAnyCosts ? computedSup : p.supportingFee || 0;
  const trueBudget = pFin.totalApproved || p.budget || 0;
  const pRemaining = trueBudget - trueActual + trueSup;

  return (
    <React.Fragment key={`${p.code}-${p.year}-${p.no}`}>
      <tr
        className={cn(
          'table-row-optimized border-b-2 border-slate-200 dark:border-[#444446]',
          pIdx % 2 === 0
            ? 'bg-slate-100/80 dark:bg-[#1e1e20]/80'
            : 'bg-blue-50/50 dark:bg-[#28282a]'
        )}
      >
        {visibleColumns.includes('no') && (
          <td className="px-2 py-3 text-center">
            <button
              onClick={() => toggleGroup(groupKey)}
              className={cn(
                'flex items-center gap-1 mx-auto px-1.5 py-0.5 rounded text-white font-bold text-xs shadow-sm transition-all active:scale-95 touch-manipulation cursor-pointer',
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
              <span className="text-[10px]">({groupCosts.length})</span>
            </button>
          </td>
        )}
        {visibleColumns.includes('year') && (
          <td className="px-4 py-3 font-bold text-slate-700 dark:text-[#c3c3c3]">
            {p.year || '-'}
          </td>
        )}
        {visibleColumns.includes('store') && (
          <td
            className={cn(
              'px-4 py-3 font-bold',
              p.store?.toLowerCase() === 'hcm'
                ? 'text-blue-600 dark:text-[#8ab4f8]'
                : p.store?.toLowerCase() === 'hn'
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-700 dark:text-[#c3c3c3]'
            )}
          >
            {p.store || '-'}
          </td>
        )}
        {visibleColumns.includes('code') && (
          <td className="px-4 py-3 font-mono text-blue-700 dark:text-[#8ab4f8] font-extrabold uppercase">
            <span
              onClick={() => handleProjectLinkClick(p)}
              className="cursor-pointer hover:underline hover:text-blue-600 dark:hover:text-[#8ab4f8]"
              title="Click to view details in Tasks"
            >
              {p.code}
            </span>
          </td>
        )}
        {visibleColumns.includes('projectName') && (
          <td
            onClick={() => handleProjectLinkClick(p)}
            className="px-4 py-3 font-bold text-slate-800 dark:text-[#e3e3e3] whitespace-normal break-words min-w-[180px] cursor-pointer hover:underline hover:text-blue-600 dark:hover:text-[#8ab4f8]"
            title="Click to view details in Tasks"
          >
            {p.name || '-'}
          </td>
        )}
        {visibleColumns.includes('actual') && (
          <td className="px-4 py-3 text-right font-mono font-bold">
            <div className="flex flex-col items-end gap-1">
              {(groupCosts.length > 0 || (!hasAnyCosts && trueActual > 0)) && (
                <span
                  className={cn(
                    'text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase',
                    groupCosts.some((c) => c.costType === 'forc')
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                      : 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800'
                  )}
                >
                  {groupCosts.some((c) => c.costType === 'forc') ? 'FORC' : 'ACT'}
                </span>
              )}
              <span className="text-emerald-600 dark:text-emerald-400">
                {formatCurrency(hasAnyCosts ? totalAct : trueActual)}
              </span>
              {!hasAnyCosts && trueActual > 0 && (
                <span
                  className="text-[9px] text-amber-500/80 dark:text-amber-400/80 font-normal italic"
                  title="Actual amount linked from Project / Budget summary"
                >
                  (Summary)
                </span>
              )}
            </div>
          </td>
        )}
        {visibleColumns.includes('firstPaid') && (
          <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3]">
            {formatCurrency(totalFirstPaid)}
          </td>
        )}
        {visibleColumns.includes('secondPaid') && (
          <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3]">
            {formatCurrency(totalSecondPaid)}
          </td>
        )}
        {visibleColumns.includes('thirdPaid') && (
          <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3]">
            {formatCurrency(totalThirdPaid)}
          </td>
        )}
        {visibleColumns.includes('balance') && (
          <td
            className={cn(
              'px-4 py-3 text-right font-mono font-bold',
              totalBalance < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-700 dark:text-[#c3c3c3]'
            )}
          >
            <div className="flex flex-col items-end gap-0.5">
              <span>{formatCurrency(totalBalance)}</span>
              {totalBalance < 0 && (
                <span
                  className="text-[8.5px] px-1 py-0.2 rounded bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 uppercase font-extrabold leading-none"
                  title="Total Paid (1st + 2nd + 3rd) exceeds Actual/Forecast amount"
                >
                  OVERPAID
                </span>
              )}
            </div>
          </td>
        )}
        {visibleColumns.includes('supportingFee') && (
          <td className="px-4 py-3 text-right font-mono font-bold text-teal-600 dark:text-teal-400">
            {formatCurrency(totalSup)}
          </td>
        )}
        {visibleColumns.includes('description') && (
          <td className="px-4 py-3">
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5 justify-end">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Remaining:
                </span>
                <span
                  className={`text-sm font-black ${
                    pRemaining >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-500'
                  }`}
                >
                  {formatCurrency(pRemaining)}
                </span>
              </div>
              {trueBudget > 0 && (
                <div
                  className="w-28 flex items-center gap-1.5"
                  title={`Budget Burn Rate: ${Math.max(
                    0,
                    Math.round(((trueActual - trueSup) / trueBudget) * 100)
                  )}%`}
                >
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-[#38383a] overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        pRemaining < 0
                          ? 'bg-red-500'
                          : (trueActual - trueSup) / trueBudget >= 0.85
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      )}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, Math.round(((trueActual - trueSup) / trueBudget) * 100))
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400">
                    {Math.max(0, Math.round(((trueActual - trueSup) / trueBudget) * 100))}%
                  </span>
                </div>
              )}
            </div>
          </td>
        )}
        {visibleColumns.includes('vendor') && (
          <td className="px-4 py-3 text-slate-400 dark:text-[#838383] font-medium text-center">
            -
          </td>
        )}
        {visibleColumns.includes('action') && (
          <td className="px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <QuickNavButton project={p} title={`Quick Navigator (${p.code})`} />
              <QRCodeButton
                title={p.name || p.code}
                url={`${window.location.origin}${window.location.pathname}?tab=cost&q=${encodeURIComponent(
                  p.code || ''
                )}${p.store ? `&store=${encodeURIComponent(p.store)}` : ''}${p.year ? `&year=${encodeURIComponent(String(p.year))}` : ''}`}
              />
              {canWrite && (
                <button
                  type="button"
                  onClick={() => handleAddCost(p)}
                  className="px-3 py-1 bg-blue-100 dark:bg-[#333336] text-blue-700 dark:text-[#8ab4f8] hover:bg-blue-200 dark:hover:bg-[#444446] rounded text-[10px] font-bold shadow-sm transition-all active:scale-95 touch-manipulation flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Add Cost
                </button>
              )}
            </div>
          </td>
        )}
      </tr>

      {/* Expanded Cost Rows */}
      {isExpanded && groupCosts.length === 0 && (
        <tr className="bg-slate-50/80 dark:bg-[#1a1a1c]/80 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <td colSpan={visibleColumns.length} className="px-6 py-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <span>No itemized cost entries recorded for this project yet.</span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => handleAddCost(p)}
                  className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded font-semibold text-[11px] inline-flex items-center gap-1 active:scale-95 touch-manipulation cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Add First Cost Entry
                </button>
              )}
            </div>
          </td>
        </tr>
      )}

      {isExpanded &&
        groupCosts.map((c, i) => {
          const {
            firstMatch: isFirstPaidMatch,
            secondMatch: isSecondPaidMatch,
            thirdMatch: isThirdPaidMatch,
          } =
            paidDateStart || paidDateEnd
              ? getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter)
              : { firstMatch: false, secondMatch: false, thirdMatch: false };

          return (
            <CostDetailItemRow
              key={c.id}
              cost={c}
              pIdx={pIdx}
              itemIdx={i}
              visibleColumns={visibleColumns}
              projectYear={p.year}
              projectStore={p.store}
              projectCode={p.code}
              canWrite={canWrite}
              handleDeleteCost={handleDeleteCost}
              handleUpdateCost={handleUpdateCost}
              currency={currency}
              jpyRate={jpyRate}
              usdRate={usdRate}
              isFirstPaidMatch={isFirstPaidMatch}
              isSecondPaidMatch={isSecondPaidMatch}
              isThirdPaidMatch={isThirdPaidMatch}
              formatCurrency={formatCurrency}
            />
          );
        })}
    </React.Fragment>
  );
});
