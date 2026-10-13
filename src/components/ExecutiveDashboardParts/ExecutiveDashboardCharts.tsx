import React, { Component, FC, memo } from 'react';
import { Building2 } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { cn } from '../../lib/utils';
import { CashflowData } from './executiveDashboardTypes';

interface ExecutiveDashboardChartsProps {
  cashflowData: CashflowData;
  forecastViewMode: 'monthly' | 'quarterly';
  setForecastViewMode: (mode: 'monthly' | 'quarterly') => void;
}

export const ExecutiveDashboardCharts: React.FC<ExecutiveDashboardChartsProps> = React.memo(({
  cashflowData,
  forecastViewMode,
  setForecastViewMode,
}) => {
  const formatMillions = (val: number) => {
    return `${(val / 1000000).toFixed(1)}M`;
  };

  return (
    <div className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-sm border border-slate-200/80 dark:border-[#333336] p-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Cashflow Forecast (Dự Báo & Dòng Tiền Thực Tế Giải Ngân)
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Phân tích kế hoạch dòng tiền Thực chi (Actual Paid) và Dự kiến giải ngân (Forecast Paid) theo Cửa hàng & Phân kỳ
          </p>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <div className="bg-slate-100 dark:bg-[#28282a] p-1 rounded-xl flex items-center text-xs font-semibold">
            <button
              type="button"
              onClick={() => setForecastViewMode('monthly')}
              className={cn(
                'px-3 py-1.5 rounded-lg transition-all',
                forecastViewMode === 'monthly'
                  ? 'bg-white dark:bg-[#38383a] text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              )}
            >
              12 Tháng
            </button>
            <button
              type="button"
              onClick={() => setForecastViewMode('quarterly')}
              className={cn(
                'px-3 py-1.5 rounded-lg transition-all',
                forecastViewMode === 'quarterly'
                  ? 'bg-white dark:bg-[#38383a] text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              )}
            >
              4 Quý (Q1 - Q4)
            </button>
          </div>
        </div>
      </div>

      {/* Recharts Component */}
      <div className="w-full h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          {forecastViewMode === 'monthly' ? (
            <ComposedChart data={cashflowData.monthlyList} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" fontSize={12} tick={{ fill: '#64748b' }} />
              <YAxis fontSize={12} tick={{ fill: '#64748b' }} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${formatMillions(value)} (${new Intl.NumberFormat('en-US').format(value)})`,
                  name,
                ]}
                contentStyle={{
                  borderRadius: '12px',
                  backgroundColor: '#1e293b',
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
                }}
              />
              <Legend verticalAlign="top" align="right" height={36} />
              <Bar dataKey="actualHCM" name="HCM Thực Chi" stackId="a" fill="#0284c7" radius={[0, 0, 0, 0]} />
              <Bar dataKey="forecastHCM" name="HCM Dự Chi" stackId="a" fill="#7dd3fc" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actualHN" name="HN Thực Chi" stackId="b" fill="#059669" radius={[0, 0, 0, 0]} />
              <Bar dataKey="forecastHN" name="HN Dự Chi" stackId="b" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="totalDisbursement" name="Tổng Dòng Tiền" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
            </ComposedChart>
          ) : (
            <BarChart data={cashflowData.quarterlyList} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" fontSize={12} tick={{ fill: '#64748b' }} />
              <YAxis fontSize={12} tick={{ fill: '#64748b' }} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${formatMillions(value)} (${new Intl.NumberFormat('en-US').format(value)})`,
                  name,
                ]}
                contentStyle={{
                  borderRadius: '12px',
                  backgroundColor: '#1e293b',
                  color: '#fff',
                  border: 'none',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
                }}
              />
              <Legend verticalAlign="top" align="right" height={36} />
              <Bar dataKey="totalActual" name="Thực Chi (Actual)" fill="#2563eb" radius={[6, 6, 0, 0]} />
              <Bar dataKey="totalForecast" name="Dự Chi (Forecast)" fill="#93c5fd" radius={[6, 6, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
});
ExecutiveDashboardCharts.displayName = 'ExecutiveDashboardCharts';
