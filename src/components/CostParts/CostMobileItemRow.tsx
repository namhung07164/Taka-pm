import React, { memo } from 'react';
import { Trash2 } from 'lucide-react';
import { Project, Cost } from '../../types';
import { cn, formatDisplayDateMain } from '../../lib/utils';
import { CostEditableCell } from './CostEditableCell';
import { PaidDateMatches } from './costTypes';

interface CostMobileItemRowProps {
  cost: Cost;
  project: Project;
  pDerivedYear?: number | string;
  canWrite: boolean;
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
  handleUpdateCost: (c: Cost, field: keyof Cost, value: any) => void;
  handleDeleteCost: (c: Cost) => void;
  formatCurrency: (val: number | undefined) => string;
}

export const CostMobileItemRow = React.memo(function CostMobileItemRow({
  cost: c,
  project: p,
  pDerivedYear,
  canWrite,
  currency,
  jpyRate,
  usdRate,
  paidDateStart,
  paidDateEnd,
  paidStageFilter,
  getCostPaidMatches,
  handleUpdateCost,
  handleDeleteCost,
  formatCurrency,
}: CostMobileItemRowProps) {
  const cBalance =
    (c.actual || 0) -
    (c.firstPaid || 0) -
    (c.secondPaid || 0) -
    (c.thirdPaid || 0);

  const {
    matches: isCostMatched,
    firstMatch: isFirstPaidMatch,
    secondMatch: isSecondPaidMatch,
    thirdMatch: isThirdPaidMatch,
  } = getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter);

  return (
    <div
      key={c.id}
      className={cn(
        'p-2.5 rounded-lg border flex flex-col gap-2 transition-all',
        isCostMatched && (paidDateStart || paidDateEnd)
          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/80 shadow-2xs'
          : 'bg-slate-50/70 dark:bg-[#18181a]/50 border-slate-200/60 dark:border-[#38383a]'
      )}
    >
      {/* Top: Badges, Vendor, Description & Act/Forc */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
              {pDerivedYear || p.year || '-'}
            </span>
            <div className="text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-[#8ab4f8] px-1.5 py-0.5 rounded border border-blue-200/80 dark:border-blue-800/60 inline-flex items-center gap-1 max-w-full">
              <span className="text-blue-400 shrink-0 font-normal">by</span>
              <div className="min-w-0 truncate font-semibold">
                <CostEditableCell
                  value={c.vendor}
                  onSave={(val) => handleUpdateCost(c, 'vendor', val)}
                  canWrite={canWrite}
                  wrap
                />
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-600 dark:text-[#a3a3a3] mt-0.5 break-words font-medium">
            <CostEditableCell
              value={c.description}
              onSave={(val) => handleUpdateCost(c, 'description', val)}
              canWrite={canWrite}
              wrap
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5">
            {canWrite ? (
              <div className="flex bg-slate-200/80 dark:bg-[#28282a] rounded-md p-0.5 shadow-inner border border-slate-200 dark:border-[#444446]">
                <button
                  onClick={() => handleUpdateCost(c, 'costType', 'act')}
                  className={cn(
                    'px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors cursor-pointer',
                    c.costType !== 'forc'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:bg-slate-300 dark:hover:bg-[#333336]'
                  )}
                >
                  ACT
                </button>
                <button
                  onClick={() => handleUpdateCost(c, 'costType', 'forc')}
                  className={cn(
                    'px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors cursor-pointer',
                    c.costType === 'forc'
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'text-slate-500 hover:bg-slate-300 dark:hover:bg-[#333336]'
                  )}
                >
                  FORC
                </button>
              </div>
            ) : (
              <span
                className={cn(
                  'text-[9px] font-bold px-2 py-0.5 rounded-md border uppercase',
                  c.costType === 'forc'
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                    : 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800'
                )}
              >
                {c.costType === 'forc' ? 'FORC' : 'ACT'}
              </span>
            )}
          </div>
          <div className="font-mono font-bold text-sm text-blue-700 dark:text-[#8ab4f8]">
            <CostEditableCell
              value={c.actual}
              type="number"
              isCurrency
              currency={currency}
              jpyRate={jpyRate}
              usdRate={usdRate}
              onSave={(val) => handleUpdateCost(c, 'actual', val)}
              canWrite={canWrite}
            />
          </div>
        </div>
      </div>

      {/* Middle: 3-column Payments */}
      <div className="grid grid-cols-3 gap-1.5 py-2 px-1 bg-white/80 dark:bg-[#18181a]/60 rounded-lg border border-slate-200/70 dark:border-[#38383a] mt-1">
        <div
          className={cn(
            'flex flex-col items-center text-center min-w-0 p-1 rounded transition-all',
            isFirstPaidMatch &&
              'bg-emerald-100/70 dark:bg-emerald-950/60 ring-2 ring-emerald-500'
          )}
        >
          <span className="text-[9px] font-medium text-slate-400 dark:text-[#838383] uppercase mb-0.5">
            1st Paid
          </span>
          <span className="font-mono font-bold text-blue-700 dark:text-[#8ab4f8] text-xs min-w-0 truncate max-w-full">
            <CostEditableCell
              value={c.firstPaid || 0}
              type="number"
              isCurrency
              currency={currency}
              jpyRate={jpyRate}
              usdRate={usdRate}
              onSave={(val) => handleUpdateCost(c, 'firstPaid', val)}
              canWrite={canWrite}
            />
          </span>
          {c.firstPaidAt && (
            <span
              className={cn(
                'text-[8px] font-mono truncate mt-0.5',
                isFirstPaidMatch
                  ? 'text-emerald-700 dark:text-emerald-300 font-bold'
                  : 'text-emerald-600 dark:text-emerald-400 font-bold'
              )}
            >
              {formatDisplayDateMain(c.firstPaidAt)}
            </span>
          )}
        </div>
        <div
          className={cn(
            'flex flex-col items-center text-center border-l border-slate-200 dark:border-[#38383a] min-w-0 p-1 rounded transition-all',
            isSecondPaidMatch &&
              'bg-emerald-100/70 dark:bg-emerald-950/60 ring-2 ring-emerald-500'
          )}
        >
          <span className="text-[9px] font-medium text-slate-400 dark:text-[#838383] uppercase mb-0.5">
            2nd Paid
          </span>
          <span className="font-mono font-bold text-blue-700 dark:text-[#8ab4f8] text-xs min-w-0 truncate max-w-full">
            <CostEditableCell
              value={c.secondPaid || 0}
              type="number"
              isCurrency
              currency={currency}
              jpyRate={jpyRate}
              usdRate={usdRate}
              onSave={(val) => handleUpdateCost(c, 'secondPaid', val)}
              canWrite={canWrite}
            />
          </span>
          {c.secondPaidAt && (
            <span
              className={cn(
                'text-[8px] font-mono truncate mt-0.5',
                isSecondPaidMatch
                  ? 'text-emerald-700 dark:text-emerald-300 font-bold'
                  : 'text-emerald-600 dark:text-emerald-400 font-bold'
              )}
            >
              {formatDisplayDateMain(c.secondPaidAt)}
            </span>
          )}
        </div>
        <div
          className={cn(
            'flex flex-col items-center text-center border-l border-slate-200 dark:border-[#38383a] min-w-0 p-1 rounded transition-all',
            isThirdPaidMatch &&
              'bg-emerald-100/70 dark:bg-emerald-950/60 ring-2 ring-emerald-500'
          )}
        >
          <span className="text-[9px] font-medium text-slate-400 dark:text-[#838383] uppercase mb-0.5">
            3rd Paid
          </span>
          <span className="font-mono font-bold text-blue-700 dark:text-[#8ab4f8] text-xs min-w-0 truncate max-w-full">
            <CostEditableCell
              value={c.thirdPaid || 0}
              type="number"
              isCurrency
              currency={currency}
              jpyRate={jpyRate}
              usdRate={usdRate}
              onSave={(val) => handleUpdateCost(c, 'thirdPaid', val)}
              canWrite={canWrite}
            />
          </span>
          {c.thirdPaidAt && (
            <span
              className={cn(
                'text-[8px] font-mono truncate mt-0.5',
                isThirdPaidMatch
                  ? 'text-emerald-700 dark:text-emerald-300 font-bold'
                  : 'text-emerald-600 dark:text-emerald-400 font-bold'
              )}
            >
              {formatDisplayDateMain(c.thirdPaidAt)}
            </span>
          )}
        </div>
      </div>

      {/* Bottom: Actions & Balances */}
      <div className="flex justify-between items-center pt-1 mt-0.5">
        {canWrite ? (
          <button
            onClick={() => handleDeleteCost(c)}
            className="text-red-400 hover:text-red-600 dark:text-red-400 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
            title="Delete Cost"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400 dark:text-[#838383] uppercase font-medium">
              supp fee:
            </span>
            <span className="font-mono font-bold text-xs text-indigo-700 dark:text-indigo-400">
              <CostEditableCell
                value={c.supportingFee}
                type="number"
                isCurrency
                currency={currency}
                jpyRate={jpyRate}
                usdRate={usdRate}
                onSave={(val) => handleUpdateCost(c, 'supportingFee', val)}
                canWrite={canWrite}
              />
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400 dark:text-[#838383] uppercase font-medium">
              Balance:
            </span>
            <span
              className={`font-mono font-bold text-xs ${
                cBalance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-500 dark:text-red-400'
              }`}
            >
              {formatCurrency(cBalance)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
