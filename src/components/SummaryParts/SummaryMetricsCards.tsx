import React, { FC, memo } from 'react';
import { TrendingUp, Wallet } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';

interface SummaryMetricsCardsProps {
  totalProjectsCount: number;
  periodProjectsCount: number;
  periodBudget: number;
  periodActual: number;
  totalBudget: number;
  totalActual: number;
}

export const SummaryMetricsCards: React.FC<SummaryMetricsCardsProps> = React.memo(({
  totalProjectsCount,
  periodProjectsCount,
  periodBudget,
  periodActual,
  totalBudget,
  totalActual,
}) => {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-blue-200">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Total Projects')}</p>
        <div className="flex items-center gap-2">
          <p className="text-xl font-black text-slate-700 dark:text-[#c3c3c3]">{totalProjectsCount}</p>
          <TrendingUp className="w-3.5 h-3.5 text-slate-400 dark:text-[#838383]" />
        </div>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-orange-200">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Projects in Period')}</p>
        <p className="text-xl font-black text-orange-600">{periodProjectsCount}</p>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-blue-300">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Period Summary')} - {t('Budget')}</p>
        <div className="flex items-center gap-2">
          <p className="text-xl font-black text-blue-600 dark:text-[#8ab4f8]">
            {(periodBudget / 1000000).toFixed(1)}M
          </p>
          <Wallet className="w-3.5 h-3.5 text-blue-400" />
        </div>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-emerald-300">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Period Summary')} - {t('Cost')}</p>
        <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
          {(periodActual / 1000000).toFixed(1)}M
        </p>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-slate-300">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Total Budget')}</p>
        <p className="text-xl font-black text-slate-600 dark:text-[#a3a3a3]">
          {(totalBudget / 1000000).toFixed(1)}M
        </p>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-slate-300">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Total Actual')}</p>
        <p className="text-xl font-black text-slate-600 dark:text-[#a3a3a3]">
          {(totalActual / 1000000).toFixed(1)}M
        </p>
      </div>
    </div>
  );
});
SummaryMetricsCards.displayName = 'SummaryMetricsCards';
