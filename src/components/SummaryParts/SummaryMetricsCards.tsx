import React, { FC, memo } from 'react';
import { TrendingUp, Wallet, Ruler } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';

interface SummaryMetricsCardsProps {
  totalProjectsCount: number;
  periodProjectsCount: number;
  periodBudget: number;
  periodActual: number;
  totalBudget: number;
  totalActual: number;
  totalSizeM2?: number;
  periodSizeM2?: number;
}

export const SummaryMetricsCards: React.FC<SummaryMetricsCardsProps> = React.memo(({
  totalProjectsCount,
  periodProjectsCount,
  periodBudget,
  periodActual,
  totalBudget,
  totalActual,
  totalSizeM2 = 0,
  periodSizeM2 = 0,
}) => {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      <div className="bg-white dark:bg-[#1e1e20] p-3.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-blue-200">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Total Projects')}</p>
        <div className="flex items-center gap-2">
          <p className="text-lg font-black text-slate-700 dark:text-[#c3c3c3]">{totalProjectsCount}</p>
          <TrendingUp className="w-3.5 h-3.5 text-slate-400 dark:text-[#838383]" />
        </div>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-3.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-orange-200">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Projects in Period')}</p>
        <p className="text-lg font-black text-orange-600">{periodProjectsCount}</p>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-3.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-blue-300">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Period Summary')} - {t('Budget')}</p>
        <div className="flex items-center gap-2">
          <p className="text-lg font-black text-blue-600 dark:text-[#8ab4f8]">
            {(periodBudget / 1000000).toFixed(1)}M
          </p>
          <Wallet className="w-3.5 h-3.5 text-blue-400" />
        </div>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-3.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-emerald-300">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Period Summary')} - {t('Cost')}</p>
        <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
          {(periodActual / 1000000).toFixed(1)}M
        </p>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-3.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-slate-300">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Total Budget')}</p>
        <p className="text-lg font-black text-slate-600 dark:text-[#a3a3a3]">
          {(totalBudget / 1000000).toFixed(1)}M
        </p>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-3.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-slate-300">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Total Actual')}</p>
        <p className="text-lg font-black text-slate-600 dark:text-[#a3a3a3]">
          {(totalActual / 1000000).toFixed(1)}M
        </p>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-3.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-indigo-300">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Total Size (m²)')}</p>
        <div className="flex items-center gap-1.5">
          <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">
            {totalSizeM2 > 0 ? `${totalSizeM2.toLocaleString('en-US', { maximumFractionDigits: 1 })} m²` : '0 m²'}
          </p>
          <Ruler className="w-3.5 h-3.5 text-indigo-400" />
        </div>
      </div>
      <div className="bg-white dark:bg-[#1e1e20] p-3.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-violet-300">
        <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Period Size (m²)')}</p>
        <p className="text-lg font-black text-violet-600 dark:text-violet-400">
          {periodSizeM2 > 0 ? `${periodSizeM2.toLocaleString('en-US', { maximumFractionDigits: 1 })} m²` : '0 m²'}
        </p>
      </div>
    </div>
  );
});
SummaryMetricsCards.displayName = 'SummaryMetricsCards';
