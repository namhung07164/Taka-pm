import React, { memo } from 'react';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { CostPaidDateFilterModal } from './CostPaidDateFilterModal';

interface CostSummaryCardProps {
  totalActAll: number;
  totalBalanceAll: number;
  totalSupAll: number;
  totalRemainingAll: number;
  formatCurrency: (val: number | undefined) => string;
  isPaidDateFilterOpen: boolean;
  setIsPaidDateFilterOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  paidDateStart: string;
  paidDateEnd: string;
  matchingCount: number;
  tempDateStart: string;
  tempDateEnd: string;
  handleTempStartChange: (val: string) => void;
  handleTempEndChange: (val: string) => void;
  commitDateFilter: (newStart?: string, newEnd?: string) => void;
  handleClearPaidDateFilter: () => void;
  paidStageFilter: 'all' | '1st' | '2nd' | '3rd';
  setPaidStageFilter: (val: 'all' | '1st' | '2nd' | '3rd') => void;
  onGoToBudget?: () => void;
}

export const CostSummaryCard = React.memo(function CostSummaryCard({
  totalActAll,
  totalBalanceAll,
  totalSupAll,
  totalRemainingAll,
  formatCurrency,
  isPaidDateFilterOpen,
  setIsPaidDateFilterOpen,
  paidDateStart,
  paidDateEnd,
  matchingCount,
  tempDateStart,
  tempDateEnd,
  handleTempStartChange,
  handleTempEndChange,
  commitDateFilter,
  handleClearPaidDateFilter,
  paidStageFilter,
  setPaidStageFilter,
  onGoToBudget,
}: CostSummaryCardProps) {
  return (
    <>
      {/* Desktop Summary Bar */}
      <div className="hidden xl:flex items-center justify-between px-5 py-2.5 bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-slate-200 dark:border-[#333336] shrink-0 print:hidden gap-4 flex-wrap">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Total Act/Forc
            </span>
            <span className="text-base font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(totalActAll)}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-300 dark:bg-slate-700"></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Total Balance
            </span>
            <span
              className={`text-base font-bold ${
                totalBalanceAll >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-500'
              }`}
            >
              {formatCurrency(totalBalanceAll)}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-300 dark:bg-slate-700"></div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Supporting Fee
            </span>
            <span className="text-base font-bold text-purple-600 dark:text-purple-400">
              {formatCurrency(totalSupAll)}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-300 dark:bg-slate-700"></div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Total Remaining
              </span>
              <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-1.5 rounded-full">
                Linked from Budget
              </span>
            </div>
            <span
              className={`text-base font-black ${
                totalRemainingAll >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-500'
              }`}
            >
              {formatCurrency(totalRemainingAll)}
            </span>
          </div>

          <div className="h-8 w-px bg-slate-300 dark:bg-slate-700"></div>

          {/* Filter Paid Date Button & Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPaidDateFilterOpen((prev) => !prev)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all shadow-xs cursor-pointer',
                paidDateStart || paidDateEnd
                  ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                  : 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#28282a]'
              )}
              title="Filter by Paid Date range and stage"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Filter Paid Date</span>
              {(paidDateStart || paidDateEnd) && (
                <span className="bg-white/30 text-white rounded-full px-1.5 py-0.2 text-[10px] font-mono">
                  {matchingCount}
                </span>
              )}
              {isPaidDateFilterOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            <CostPaidDateFilterModal
              isOpen={isPaidDateFilterOpen}
              onClose={() => setIsPaidDateFilterOpen(false)}
              tempDateStart={tempDateStart}
              tempDateEnd={tempDateEnd}
              handleTempStartChange={handleTempStartChange}
              handleTempEndChange={handleTempEndChange}
              commitDateFilter={commitDateFilter}
              handleClearPaidDateFilter={handleClearPaidDateFilter}
              paidDateStart={paidDateStart}
              paidDateEnd={paidDateEnd}
              paidStageFilter={paidStageFilter}
              setPaidStageFilter={setPaidStageFilter}
              matchingCount={matchingCount}
            />
          </div>
        </div>

        <button
          onClick={onGoToBudget}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 rounded-md transition-colors shrink-0 cursor-pointer"
        >
          View Budget Tab
        </button>
      </div>

      {/* Mobile Summary Card */}
      <div
        className="xl:hidden mx-2 mt-2 mb-3 bg-indigo-50/50 dark:bg-indigo-900/10 border border-slate-200 dark:border-[#333336] rounded-xl p-3 shrink-0 print:hidden cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        onClick={onGoToBudget}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Total Summary
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Tap card to view Budget Tab
            </span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-1.5 py-0.5 rounded-full">
              Linked from Budget
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPaidDateFilterOpen((prev) => !prev);
              }}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all shadow-xs cursor-pointer',
                paidDateStart || paidDateEnd
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-white dark:bg-[#28282a] border border-indigo-200 dark:border-[#444446] text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50'
              )}
              title="Filter Paid Date"
            >
              <Calendar className="w-3 h-3" />
              <span>Filter Paid Date</span>
              {(paidDateStart || paidDateEnd) && (
                <span className="bg-white/30 text-white rounded-full px-1 text-[9px] font-mono">
                  {matchingCount}
                </span>
              )}
              {isPaidDateFilterOpen ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Total Act/Forc
            </span>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(totalActAll)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Total Balance
            </span>
            <span
              className={`text-sm font-bold ${
                totalBalanceAll >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-500'
              }`}
            >
              {formatCurrency(totalBalanceAll)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Supporting Fee
            </span>
            <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
              {formatCurrency(totalSupAll)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Remaining
            </span>
            <span
              className={`text-sm font-black ${
                totalRemainingAll >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-500'
              }`}
            >
              {formatCurrency(totalRemainingAll)}
            </span>
          </div>
        </div>

        {/* Mobile Paid Date Popover Drawer */}
        {isPaidDateFilterOpen && (
          <div
            className="mt-3 pt-3 border-t border-indigo-200/60 dark:border-indigo-900/40 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Filter Paid Date (Update Date)</span>
              </div>
              {(paidDateStart ||
                paidDateEnd ||
                tempDateStart ||
                tempDateEnd) && (
                <button
                  type="button"
                  onClick={handleClearPaidDateFilter}
                  className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">
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
                  title="Nhấn Enter hoặc đợi 0.5s để lọc"
                  className="bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">
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
                  title="Nhấn Enter hoặc đợi 0.5s để lọc"
                  className="bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <select
                value={paidStageFilter}
                onChange={(e) => {
                  setPaidStageFilter(e.target.value as any);
                  commitDateFilter();
                }}
                className="flex-1 bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#555] text-slate-800 dark:text-slate-200 text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                <option value="all">All Paid Stages (1st, 2nd, 3rd)</option>
                <option value="1st">1st Paid only</option>
                <option value="2nd">2nd Paid only</option>
                <option value="3rd">3rd Paid only</option>
              </select>

              {(paidDateStart || paidDateEnd) && (
                <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 whitespace-nowrap">
                  {matchingCount} matching
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-indigo-100 dark:border-indigo-900/40">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                Enter hoặc trễ 0.5s để lọc
              </span>
              <button
                type="button"
                onClick={() => {
                  commitDateFilter();
                  setIsPaidDateFilterOpen(false);
                }}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
});
