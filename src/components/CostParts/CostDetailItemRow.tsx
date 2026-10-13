import React, { memo } from 'react';
import { Trash2 } from 'lucide-react';
import { Cost } from '../../types';
import { cn, formatDisplayDateMain } from '../../lib/utils';
import { CostEditableCell } from './CostEditableCell';
import { QRCodeButton } from '../QRCodeButton';
import { useIsRowFlashed } from '../../lib/changeFlashService';

interface CostDetailItemRowProps {
  cost: Cost;
  pIdx: number;
  itemIdx: number;
  visibleColumns: string[];
  projectYear: any;
  projectStore: any;
  projectCode: string;
  canWrite: boolean;
  handleDeleteCost: (c: Cost) => void;
  handleUpdateCost: (c: Cost, field: keyof Cost, value: any) => void;
  currency: 'VND' | 'JPY' | 'USD';
  jpyRate: number;
  usdRate: number;
  isFirstPaidMatch: boolean;
  isSecondPaidMatch: boolean;
  isThirdPaidMatch: boolean;
  formatCurrency: (val: number | undefined) => string;
}

export const CostDetailItemRow = React.memo(function CostDetailItemRow({
  cost: c,
  pIdx,
  itemIdx: i,
  visibleColumns,
  projectYear,
  projectStore,
  projectCode,
  canWrite,
  handleDeleteCost,
  handleUpdateCost,
  currency,
  jpyRate,
  usdRate,
  isFirstPaidMatch,
  isSecondPaidMatch,
  isThirdPaidMatch,
  formatCurrency,
}: CostDetailItemRowProps) {
  const { isFlashed } = useIsRowFlashed(c.id);

  return (
    <tr
      key={c.id}
      className={cn(
        "table-row-optimized bg-white dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] hover:bg-blue-50/50 dark:hover:bg-[#333336] transition-all duration-700 text-xs",
        isFlashed && "ring-2 ring-emerald-500/80 bg-emerald-50/80 dark:bg-emerald-950/60 shadow-sm"
      )}
    >
      {visibleColumns.includes('no') && (
        <td className="px-4 py-3 text-center text-slate-300 dark:text-slate-600 font-mono italic">
          {pIdx + 1}.{i + 1}
        </td>
      )}
      {visibleColumns.includes('year') && (
        <td className="px-4 py-3 text-slate-400 dark:text-[#838383] font-medium">
          {projectYear || '-'}
        </td>
      )}
      {visibleColumns.includes('store') && (
        <td className="px-4 py-3 text-slate-400 dark:text-[#838383] font-medium">
          {projectStore || '-'}
        </td>
      )}
      {visibleColumns.includes('code') && (
        <td className="px-4 py-3 text-slate-400 dark:text-[#838383] font-medium">
          {projectCode}-{i + 1}
        </td>
      )}
      {visibleColumns.includes('projectName') && (
        <td className="px-4 py-3 font-bold text-slate-800 dark:text-[#e3e3e3] pl-6 whitespace-normal break-words min-w-[180px]">
          <div className="flex items-start gap-1">
            <span className="text-slate-400 dark:text-[#838383] shrink-0 mt-0.5">↳</span>
            <span className="whitespace-normal break-words">
              {c.description || 'Cost Entry'}
            </span>
          </div>
        </td>
      )}
      {visibleColumns.includes('actual') && (
        <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3] bg-slate-50 dark:bg-[#1e1e20]/30">
          <div className="flex flex-col items-end gap-1">
            {canWrite ? (
              <div className="flex bg-slate-100 dark:bg-[#28282a] rounded overflow-hidden shadow-inner mb-1 border border-slate-200 dark:border-[#444446]">
                <button
                  onClick={() => handleUpdateCost(c, 'costType', 'act')}
                  className={cn(
                    'px-2 py-0.5 text-[9px] font-bold uppercase transition-colors cursor-pointer',
                    c.costType !== 'forc'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-[#333336]'
                  )}
                >
                  ACT
                </button>
                <button
                  onClick={() => handleUpdateCost(c, 'costType', 'forc')}
                  className={cn(
                    'px-2 py-0.5 text-[9px] font-bold uppercase transition-colors cursor-pointer',
                    c.costType === 'forc'
                      ? 'bg-amber-500 text-white'
                      : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-[#333336]'
                  )}
                >
                  FORC
                </button>
              </div>
            ) : (
              <span
                className={cn(
                  'text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase',
                  c.costType === 'forc'
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                    : 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800'
                )}
              >
                {c.costType === 'forc' ? 'FORC' : 'ACT'}
              </span>
            )}
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
        </td>
      )}
      {visibleColumns.includes('firstPaid') && (
        <td
          className={cn(
            'px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3] bg-slate-50 dark:bg-[#1e1e20]/30 transition-all',
            isFirstPaidMatch &&
              'bg-emerald-100/70 dark:bg-emerald-950/50 ring-2 ring-emerald-500/80 rounded-sm'
          )}
        >
          <div className="flex flex-col items-end">
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
            {c.firstPaidAt && (
              <span
                className={cn(
                  'text-[10px] font-normal mt-1',
                  isFirstPaidMatch
                    ? 'text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'text-slate-400 dark:text-[#838383]'
                )}
              >
                update {formatDisplayDateMain(c.firstPaidAt)}
              </span>
            )}
          </div>
        </td>
      )}
      {visibleColumns.includes('secondPaid') && (
        <td
          className={cn(
            'px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3] bg-slate-50 dark:bg-[#1e1e20]/30 transition-all',
            isSecondPaidMatch &&
              'bg-emerald-100/70 dark:bg-emerald-950/50 ring-2 ring-emerald-500/80 rounded-sm'
          )}
        >
          <div className="flex flex-col items-end">
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
            {c.secondPaidAt && (
              <span
                className={cn(
                  'text-[10px] font-normal mt-1',
                  isSecondPaidMatch
                    ? 'text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'text-slate-400 dark:text-[#838383]'
                )}
              >
                update {formatDisplayDateMain(c.secondPaidAt)}
              </span>
            )}
          </div>
        </td>
      )}
      {visibleColumns.includes('thirdPaid') && (
        <td
          className={cn(
            'px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3] bg-slate-50 dark:bg-[#1e1e20]/30 transition-all',
            isThirdPaidMatch &&
              'bg-emerald-100/70 dark:bg-emerald-950/50 ring-2 ring-emerald-500/80 rounded-sm'
          )}
        >
          <div className="flex flex-col items-end">
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
            {c.thirdPaidAt && (
              <span
                className={cn(
                  'text-[10px] font-normal mt-1',
                  isThirdPaidMatch
                    ? 'text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'text-slate-400 dark:text-[#838383]'
                )}
              >
                update {formatDisplayDateMain(c.thirdPaidAt)}
              </span>
            )}
          </div>
        </td>
      )}
      {visibleColumns.includes('balance') && (
        <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-[#c3c3c3] bg-slate-50 dark:bg-[#1e1e20]/30">
          {formatCurrency(
            (c.actual || 0) -
              (c.firstPaid || 0) -
              (c.secondPaid || 0) -
              (c.thirdPaid || 0)
          )}
        </td>
      )}
      {visibleColumns.includes('supportingFee') && (
        <td className="px-4 py-3 text-right font-mono font-bold text-teal-600 dark:text-teal-400 bg-slate-50 dark:bg-[#1e1e20]/30">
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
        </td>
      )}
      {visibleColumns.includes('description') && (
        <td className="px-4 py-3 text-slate-600 dark:text-[#a3a3a3] whitespace-normal break-words min-w-[200px]">
          <CostEditableCell
            value={c.description}
            onSave={(val) => handleUpdateCost(c, 'description', val)}
            canWrite={canWrite}
            wrap
          />
        </td>
      )}
      {visibleColumns.includes('vendor') && (
        <td className="px-4 py-3 text-slate-600 dark:text-[#a3a3a3] font-medium whitespace-normal break-words min-w-[140px]">
          <CostEditableCell
            value={c.vendor}
            onSave={(val) => handleUpdateCost(c, 'vendor', val)}
            canWrite={canWrite}
            wrap
          />
        </td>
      )}
      {visibleColumns.includes('action') && (
        <td className="px-4 py-3 text-center">
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="flex items-center justify-center gap-2">
              <QRCodeButton
                title={c.description || c.vendor || 'Cost Entry'}
                url={`${window.location.origin}${window.location.pathname}?tab=cost&q=${encodeURIComponent(
                  c.description || c.vendor || ''
                )}`}
              />
              {canWrite && (
                <button
                  onClick={() => handleDeleteCost(c)}
                  className="text-red-400 hover:text-red-600 transition-colors p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 mx-auto" />
                </button>
              )}
            </div>
            {c.updatedAt && (
              <div className="text-[9px] text-slate-400 dark:text-[#838383] font-mono text-center leading-tight">
                Update
                <br />
                {formatDisplayDateMain(c.updatedAt)}
              </div>
            )}
          </div>
        </td>
      )}
    </tr>
  );
});
