import React from 'react';
import { Calendar, X } from 'lucide-react';

interface CostPaidDateFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tempDateStart: string;
  tempDateEnd: string;
  handleTempStartChange: (val: string) => void;
  handleTempEndChange: (val: string) => void;
  commitDateFilter: (newStart?: string, newEnd?: string) => void;
  handleClearPaidDateFilter: () => void;
  paidDateStart: string;
  paidDateEnd: string;
  paidStageFilter: 'all' | '1st' | '2nd' | '3rd';
  setPaidStageFilter: (val: 'all' | '1st' | '2nd' | '3rd') => void;
  matchingCount: number;
}

export function CostPaidDateFilterModal({
  isOpen,
  onClose,
  tempDateStart,
  tempDateEnd,
  handleTempStartChange,
  handleTempEndChange,
  commitDateFilter,
  handleClearPaidDateFilter,
  paidDateStart,
  paidDateEnd,
  paidStageFilter,
  setPaidStageFilter,
  matchingCount,
}: CostPaidDateFilterModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute left-0 top-full mt-2 z-50 w-84 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-2xl p-3 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-[#333336]">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Filter Paid Date Range</span>
          </div>
          {(paidDateStart || paidDateEnd || tempDateStart || tempDateEnd) && (
            <button
              type="button"
              onClick={handleClearPaidDateFilter}
              className="text-[11px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
              Start (Từ ngày)
            </span>
            <input
              type="date"
              value={tempDateStart}
              onChange={(e) => handleTempStartChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDateFilter();
              }}
              onBlur={() => commitDateFilter()}
              title="Start Date (Nhấn Enter hoặc đợi 0.5s để áp dụng)"
              className="bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
              End (Đến ngày)
            </span>
            <input
              type="date"
              value={tempDateEnd}
              onChange={(e) => handleTempEndChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDateFilter();
              }}
              onBlur={() => commitDateFilter()}
              title="End Date (Nhấn Enter hoặc đợi 0.5s để áp dụng)"
              className="bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
            Stage (Đợt thanh toán)
          </span>
          <select
            value={paidStageFilter}
            onChange={(e) => {
              setPaidStageFilter(e.target.value as any);
              commitDateFilter();
            }}
            className="bg-slate-50 dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
          >
            <option value="all">All Paid Stages (1st, 2nd, 3rd)</option>
            <option value="1st">1st Paid only</option>
            <option value="2nd">2nd Paid only</option>
            <option value="3rd">3rd Paid only</option>
          </select>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#333336]">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">
            Enter hoặc đợi 0.5s để lọc
          </span>
          <div className="flex items-center gap-1.5">
            {(paidDateStart || paidDateEnd) && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                {matchingCount} matching
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                commitDateFilter();
                onClose();
              }}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
