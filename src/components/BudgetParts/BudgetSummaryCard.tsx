import React from 'react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';

interface BudgetSummaryCardProps {
  totalGlobalBudget: number;
  totalGlobalActual: number;
  totalGlobalSupportingFee: number;
  totalGlobalRemaining: number;
  totalVarianceColor: string;
  formatCurrency: (val: number | undefined) => string;
}

export function BudgetSummaryCard({
  totalGlobalBudget,
  totalGlobalActual,
  totalGlobalSupportingFee,
  totalGlobalRemaining,
  totalVarianceColor,
  formatCurrency
}: BudgetSummaryCardProps) {
  const { t } = useLanguage();

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-[#1b2030] dark:to-[#1e1e24] border border-blue-200 dark:border-[#38383a] rounded-xl p-3.5 sm:p-4 shrink-0 shadow-2xs">
      <div className="text-xs text-blue-900 dark:text-[#8ab4f8] font-bold uppercase text-sm tracking-wide mb-2">
        {t('Total Budget Summary')}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="flex flex-col">
          <span className="text-xs text-blue-700 dark:text-[#8ab4f8] font-medium mb-0.5">{t('Total Budget')}</span>
          <span className="font-mono font-bold text-base sm:text-lg text-blue-900 dark:text-[#8ab4f8] truncate">
            {formatCurrency(totalGlobalBudget)}
          </span>
        </div>
        <div className="flex flex-col border-l border-blue-200 dark:border-[#38383a] pl-3">
          <span className="text-xs text-blue-700 dark:text-[#8ab4f8] font-medium mb-0.5">{t('ACT / FORC')}</span>
          <span className="font-mono font-bold text-base sm:text-lg text-emerald-600 dark:text-emerald-400 truncate">
            {formatCurrency(totalGlobalActual)}
          </span>
        </div>
        <div className="flex flex-col border-l border-blue-200 dark:border-[#38383a] pl-3">
          <span className="text-xs text-blue-700 dark:text-[#8ab4f8] font-medium mb-0.5">{t('Support Fee')}</span>
          <span className="font-mono font-bold text-base sm:text-lg text-indigo-700 dark:text-indigo-400 truncate">
            {formatCurrency(totalGlobalSupportingFee)}
          </span>
        </div>
        <div className="flex flex-col border-l border-blue-200 dark:border-[#38383a] pl-3">
          <span className="text-xs text-blue-700 dark:text-[#8ab4f8] font-medium mb-0.5">{t('Remaining')}</span>
          <span className={cn("font-mono font-bold text-base sm:text-lg truncate", totalVarianceColor)}>
            {formatCurrency(totalGlobalRemaining)}
          </span>
        </div>
      </div>
    </div>
  );
}
