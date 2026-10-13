import React, { FC, memo } from 'react';
import { TrendingUp, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { EVMMetrics } from './executiveDashboardTypes';

interface ExecutiveDashboardProjectsTableProps {
  evmMetrics: EVMMetrics;
  selectedEVMStore: string;
  setSelectedEVMStore: (val: string) => void;
}

export const ExecutiveDashboardProjectsTable: React.FC<ExecutiveDashboardProjectsTableProps> = React.memo(({
  evmMetrics,
  selectedEVMStore,
  setSelectedEVMStore,
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

  return (
    <div className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-sm border border-slate-200/80 dark:border-[#333336] p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            Chỉ Số EVM Chi Tiết Từng Dự Án (Earned Value Breakdown)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            So sánh Chỉ số Hiệu quả Chi phí (CPI) & Tiến độ (SPI) theo dõi sát sao nguy cơ trễ hạn / vượt ngân sách
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Chi nhánh:</span>
          <select
            value={selectedEVMStore}
            onChange={(e) => setSelectedEVMStore(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-lg px-2.5 py-1.5 font-semibold outline-none"
          >
            <option value="all">Tất cả chi nhánh</option>
            <option value="HCM">HCM</option>
            <option value="HN">HN</option>
          </select>
        </div>
      </div>

      {/* Project EVM Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[#333336] bg-slate-50 dark:bg-[#28282a] text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px] tracking-wider">
              <th className="py-3 px-3">Mã DA</th>
              <th className="py-3 px-3">Tên Dự Án</th>
              <th className="py-3 px-2">Store</th>
              <th className="py-3 px-3 text-right">Ngân Sách (BAC)</th>
              <th className="py-3 px-3 text-right">Thực Chi (AC)</th>
              <th className="py-3 px-3 text-right">Giá Trị Đạt Được (EV)</th>
              <th className="py-3 px-2 text-center">Tiến Độ</th>
              <th className="py-3 px-2 text-center">CPI (Chi Phí)</th>
              <th className="py-3 px-2 text-center">SPI (Tiến Độ)</th>
              <th className="py-3 px-3 text-center">Đánh Giá Ban Điều Hành</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2d2d30]">
            {evmMetrics.projectEVMList.slice(0, 15).map((item) => {
              const cpiStatus = getCPILabel(item.cpi);
              const spiStatus = getSPILabel(item.spi);

              return (
                <tr key={item.code} className="hover:bg-slate-50/80 dark:hover:bg-[#28282a]/50 transition-colors">
                  <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                    {item.code}
                  </td>
                  <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200 max-w-[220px] truncate" title={item.name}>
                    {item.name}
                  </td>
                  <td className="py-3 px-2">
                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold', item.store === 'HCM' ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300')}>
                      {item.store}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                    {formatMillions(item.bac)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {formatMillions(item.ac)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                    {formatMillions(item.ev)}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-12 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            item.percentComplete >= 100 ? 'bg-emerald-500' : item.percentComplete >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                          )}
                          style={{ width: `${item.percentComplete}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] font-bold text-slate-600 dark:text-slate-400">
                        {item.percentComplete}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={cn('px-2 py-0.5 rounded-full font-mono font-bold text-[11px] border', cpiStatus.bg, cpiStatus.color)}>
                      {item.cpi}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={cn('px-2 py-0.5 rounded-full font-mono font-bold text-[11px] border', spiStatus.bg, spiStatus.color)}>
                      {item.spi}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    {item.cpi >= 1 && item.spi >= 1 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Xuất sắc
                      </span>
                    ) : item.cpi < 0.95 && item.spi < 0.95 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                        <AlertCircle className="w-3.5 h-3.5" /> Nguy cơ cao
                      </span>
                    ) : item.cpi < 0.95 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        <AlertCircle className="w-3.5 h-3.5" /> Bội chi phí
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        <Clock className="w-3.5 h-3.5" /> Cần đẩy tiến độ
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
ExecutiveDashboardProjectsTable.displayName = 'ExecutiveDashboardProjectsTable';
