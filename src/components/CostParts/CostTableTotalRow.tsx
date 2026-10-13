import React, { memo } from 'react';

interface CostTableTotalRowProps {
  visibleColumns: string[];
  hasActForcFilter: string;
  setHasActForcFilter: (val: string | ((prev: string) => string)) => void;
  totalActAll: number;
  totalFirstPaidAll: number;
  totalSecondPaidAll: number;
  totalThirdPaidAll: number;
  totalBalanceAll: number;
  totalSupAll: number;
  formatCurrency: (val: number | undefined) => string;
}

export const CostTableTotalRow = React.memo(function CostTableTotalRow({
  visibleColumns,
  hasActForcFilter,
  setHasActForcFilter,
  totalActAll,
  totalFirstPaidAll,
  totalSecondPaidAll,
  totalThirdPaidAll,
  totalBalanceAll,
  totalSupAll,
  formatCurrency,
}: CostTableTotalRowProps) {
  return (
    <tr className="bg-blue-50 dark:bg-[#28282a] border-b-2 border-blue-200 text-sm">
      {visibleColumns.includes('no') && (
        <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>
      )}
      {visibleColumns.includes('year') && (
        <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>
      )}
      {visibleColumns.includes('store') && (
        <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>
      )}
      {visibleColumns.includes('code') && (
        <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase"></td>
      )}
      {visibleColumns.includes('projectName') && (
        <td className="px-4 py-3 font-bold text-right text-blue-900 dark:text-[#8ab4f8] uppercase">
          Total
        </td>
      )}
      {visibleColumns.includes('actual') && (
        <td
          className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer hover:bg-blue-100 dark:hover:bg-[#333336] transition-colors"
          onClick={() => {
            setHasActForcFilter((prev) => (prev === 'all' ? 'has_value' : 'all'));
          }}
          title="Toggle zero Act/Forc"
        >
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase opacity-70 hover:underline">
              Act/Forc {hasActForcFilter === 'all' ? '(All)' : '(!=0)'}
            </span>
            <span>{formatCurrency(totalActAll)}</span>
          </div>
        </td>
      )}
      {visibleColumns.includes('firstPaid') && (
        <td className="px-4 py-3 text-right font-mono font-bold text-blue-900 dark:text-[#8ab4f8]">
          {formatCurrency(totalFirstPaidAll)}
        </td>
      )}
      {visibleColumns.includes('secondPaid') && (
        <td className="px-4 py-3 text-right font-mono font-bold text-blue-900 dark:text-[#8ab4f8]">
          {formatCurrency(totalSecondPaidAll)}
        </td>
      )}
      {visibleColumns.includes('thirdPaid') && (
        <td className="px-4 py-3 text-right font-mono font-bold text-blue-900 dark:text-[#8ab4f8]">
          {formatCurrency(totalThirdPaidAll)}
        </td>
      )}
      {visibleColumns.includes('balance') && (
        <td className="px-4 py-3 text-right font-mono font-bold text-blue-900 dark:text-[#8ab4f8]">
          {formatCurrency(totalBalanceAll)}
        </td>
      )}
      {visibleColumns.includes('supportingFee') && (
        <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700 dark:text-indigo-400">
          {formatCurrency(totalSupAll)}
        </td>
      )}
      {visibleColumns.includes('description') && (
        <td className="px-4 py-3 text-right font-bold text-xs"></td>
      )}
      {visibleColumns.includes('vendor') && <td className="px-4 py-3"></td>}
      {visibleColumns.includes('action') && <td className="px-4 py-3 text-center"></td>}
    </tr>
  );
});
