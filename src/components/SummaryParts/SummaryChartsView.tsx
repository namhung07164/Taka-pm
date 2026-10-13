import React, { FC, memo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import { StatusCountItem, STATUS_COLORS } from './summaryTypes';
import { Project } from '../../types';

interface SummaryChartsViewProps {
  yearChartData: StatusCountItem[];
  monthChartData: StatusCountItem[];
  globalYearFilter: string;
  startMonth: number;
  endMonth: number;
  projectsInPeriod: Project[];
}

export const SummaryChartsView: React.FC<SummaryChartsViewProps> = React.memo(({
  yearChartData,
  monthChartData,
  globalYearFilter,
  startMonth,
  endMonth,
  projectsInPeriod,
}) => {
  const { t } = useLanguage();

  const renderPieChart = (data: StatusCountItem[], title: string) => (
    <div className="flex flex-col items-center bg-white dark:bg-[#1e1e20] p-6 rounded-xl border border-slate-100 dark:border-[#333336] shadow-sm w-full h-[400px]">
      <h3 className="text-lg font-semibold text-slate-700 dark:text-[#c3c3c3] mb-4">{title}</h3>
      <div className="w-full h-full flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#cbd5e1'} />
              ))}
            </Pie>
            <Tooltip />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <>
      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderPieChart(
          yearChartData,
          globalYearFilter === 'all' ? t('Total Projects') : `${globalYearFilter} ${t('Total Projects')}`
        )}
        {renderPieChart(
          monthChartData,
          `${t('Start Month')} ${startMonth} - ${t('End Month')} ${endMonth}`
        )}
      </div>

      {/* Table 2: Financial Comparison Section */}
      <div className="bg-white dark:bg-[#1e1e20] rounded-xl shadow-lg border border-slate-200 dark:border-[#444446] overflow-hidden transform transition-all hover:shadow-xl">
        <div className="bg-slate-900 p-4 flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-widest">Table 2: Budget vs Actual Comparison</h2>
        </div>

        <div className="p-6">
          <div className="w-full h-[450px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={projectsInPeriod.slice(0, 15).map((p) => ({
                  name: p.code,
                  budget: p.budget || 0,
                  actual: p.actual || 0,
                }))}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                  height={80}
                  fontSize={12}
                  tick={{ fill: '#64748b' }}
                />
                <YAxis
                  fontSize={12}
                  tick={{ fill: '#64748b' }}
                  tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                />
                <Tooltip
                  formatter={(value: number) => new Intl.NumberFormat('en-US').format(value)}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="top" align="right" height={36} />
                <Bar dataKey="budget" name="Budget" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual Cost" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 text-center">
            <p className="text-xs text-slate-400 dark:text-[#838383] italic">
              * Showing top 15 by current filters. Values in Millions (M).
            </p>
          </div>
        </div>
      </div>
    </>
  );
});
SummaryChartsView.displayName = 'SummaryChartsView';
