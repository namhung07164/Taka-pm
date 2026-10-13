import React, { FC, memo } from 'react';
import { DollarSign, Clock, Layers, CalendarRange, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { EVMMetrics, CashflowData } from './executiveDashboardTypes';

interface ExecutiveDashboardMetricsCardsProps {
  evmMetrics: EVMMetrics;
  cashflowData: CashflowData;
  globalYearFilter: string;
}

export const ExecutiveDashboardMetricsCards: React.FC<ExecutiveDashboardMetricsCardsProps> = React.memo(({
  evmMetrics,
  cashflowData,
  globalYearFilter,
}) => {
  const formatMillions = (val: number) => {
    return `${(val / 1000000).toFixed(1)}M`;
  };

  const getCPILabel = (cpi: number) => {
    if (cpi >= 1.05) return { label: 'Under Budget', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' };
    if (cpi >= 0.95) return { label: 'On Budget', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800' };
    return { label: 'Over Budget', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800' };
  };

  const getSPILabel = (spi: number) => {
    if (spi >= 1.05) return { label: 'Ahead of Schedule', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' };
    if (spi >= 0.95) return { label: 'On Schedule', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800' };
    return { label: 'Behind Schedule', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' };
  };

  const cpiMeta = getCPILabel(evmMetrics.portfolioCPI);
  const spiMeta = getSPILabel(evmMetrics.portfolioSPI);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* CPI Card */}
      <div className="bg-white dark:bg-[#1e1e20] p-5 rounded-2xl border border-slate-200/80 dark:border-[#333336] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            CPI (Cost Performance)
          </span>
          <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border', cpiMeta.bg, cpiMeta.color)}>
            {cpiMeta.label}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            {evmMetrics.portfolioCPI}
          </span>
          <span className={cn('text-xs font-semibold flex items-center gap-0.5', evmMetrics.portfolioCPI >= 1 ? 'text-emerald-600' : 'text-rose-600')}>
            {evmMetrics.portfolioCPI >= 1 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {evmMetrics.portfolioCPI >= 1 ? `+${Math.round((evmMetrics.portfolioCPI - 1) * 100)}% eff.` : `${Math.round((evmMetrics.portfolioCPI - 1) * 100)}%`}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          EV: <strong className="text-slate-700 dark:text-slate-200">{formatMillions(evmMetrics.totalEV)}</strong> / AC: <strong className="text-slate-700 dark:text-slate-200">{formatMillions(evmMetrics.totalAC)}</strong>
        </p>
      </div>

      {/* SPI Card */}
      <div className="bg-white dark:bg-[#1e1e20] p-5 rounded-2xl border border-slate-200/80 dark:border-[#333336] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-blue-500" />
            SPI (Schedule Performance)
          </span>
          <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border', spiMeta.bg, spiMeta.color)}>
            {spiMeta.label}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            {evmMetrics.portfolioSPI}
          </span>
          <span className={cn('text-xs font-semibold flex items-center gap-0.5', evmMetrics.portfolioSPI >= 1 ? 'text-emerald-600' : 'text-amber-600')}>
            {evmMetrics.portfolioSPI >= 1 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {evmMetrics.portfolioSPI >= 1 ? `+${Math.round((evmMetrics.portfolioSPI - 1) * 100)}% pace` : `${Math.round((evmMetrics.portfolioSPI - 1) * 100)}%`}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          EV: <strong className="text-slate-700 dark:text-slate-200">{formatMillions(evmMetrics.totalEV)}</strong> / PV: <strong className="text-slate-700 dark:text-slate-200">{formatMillions(evmMetrics.totalPV)}</strong>
        </p>
      </div>

      {/* EAC & Forecast at Completion */}
      <div className="bg-white dark:bg-[#1e1e20] p-5 rounded-2xl border border-slate-200/80 dark:border-[#333336] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-purple-500" />
            EAC (Forecast At Completion)
          </span>
          <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border', evmMetrics.vac >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200')}>
            VAC: {formatMillions(evmMetrics.vac)}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {formatMillions(evmMetrics.eac)}
          </span>
          <span className="text-xs text-slate-500">vs BAC {formatMillions(evmMetrics.totalBAC)}</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          {evmMetrics.vac >= 0 ? 'Dự kiến tiết kiệm ngân sách' : 'Cảnh báo nguy cơ bội chi ngân sách'}
        </p>
      </div>

      {/* Total Annual Disbursed vs Forecast */}
      <div className="bg-white dark:bg-[#1e1e20] p-5 rounded-2xl border border-slate-200/80 dark:border-[#333336] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <CalendarRange className="w-4 h-4 text-amber-500" />
            Dòng Tiền Giải Ngân Cả Năm
          </span>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#333336] text-slate-700 dark:text-slate-300">
            {globalYearFilter === 'all' ? 'All Years' : globalYearFilter}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {formatMillions(cashflowData.totalYearDisbursement)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs mt-2">
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            Đã chi: {formatMillions(cashflowData.totalYearActual)}
          </span>
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            Dự chi: {formatMillions(cashflowData.totalYearForecast)}
          </span>
        </div>
      </div>
    </div>
  );
});
ExecutiveDashboardMetricsCards.displayName = 'ExecutiveDashboardMetricsCards';
