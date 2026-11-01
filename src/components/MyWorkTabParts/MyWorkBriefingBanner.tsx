import React, { useState } from 'react';
import {
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  GitPullRequest,
  Sparkles,
} from 'lucide-react';
import { MyWorkBriefingStats } from './myWorkTypes';
import { cn } from '../../lib/utils';

interface MyWorkBriefingBannerProps {
  stats: MyWorkBriefingStats;
  statusFilter: string;
  onSelectFilter: (filter: string) => void;
}

export const MyWorkBriefingBanner: React.FC<MyWorkBriefingBannerProps> = React.memo(
  function MyWorkBriefingBanner({ stats, statusFilter, onSelectFilter }) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggleFilter = (target: string) => {
      onSelectFilter(statusFilter === target ? 'all' : target);
    };

    return (
      <div className="px-4 pt-3.5 sm:px-6">
        <div className="max-w-[1440px] mx-auto rounded-2xl p-3.5 sm:p-4 bg-gradient-to-r from-sky-50/90 via-indigo-50/70 to-rose-50/80 dark:from-[#1b2230] dark:via-[#1e1d2b] dark:to-[#291d28] border border-indigo-200/70 dark:border-indigo-900/50 shadow-2xs transition-all">
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400 shrink-0" />
              <span className="text-xs sm:text-sm font-extrabold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-300 dark:via-purple-300 dark:to-pink-300 bg-clip-text text-transparent">
                Today’s Work Briefing
              </span>
              {statusFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => onSelectFilter('all')}
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/90 dark:bg-[#2a2a32] text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 cursor-pointer"
                >
                  Filter: {statusFilter.toUpperCase()} ×
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer px-2 py-0.5 rounded-md hover:bg-white/60 dark:hover:bg-white/5 transition-colors"
            >
              <span>{isCollapsed ? 'Show Summary' : 'Hide'}</span>
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* 4 Interactive Briefing Cards */}
          {!isCollapsed && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Card 1: Active Tasks Breakdown */}
              <div
                onClick={() => toggleFilter('overdue')}
                className={cn(
                  'rounded-xl bg-white dark:bg-[#1e1e24] p-3.5 border transition-all cursor-pointer shadow-2xs hover:shadow-md',
                  statusFilter === 'overdue'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                    : 'border-white/80 dark:border-[#33333d] hover:border-emerald-300'
                )}
                title="Click to filter Overdue & Urgent items"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200/70 dark:border-emerald-800/60">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                    Tasks & Work
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-1.5">
                  You have <strong className="text-slate-900 dark:text-white">{stats.totalActiveTasks}</strong> active items:
                </p>
                <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    <span>
                      <strong className="text-rose-600 dark:text-rose-400">{stats.criticalUrgentCount}</strong> Critical & Overdue
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>
                      <strong className="text-amber-600 dark:text-amber-400">{stats.highPriorityCount}</strong> High Priority
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span>
                      <strong className="text-slate-800 dark:text-white">{stats.normalActiveCount}</strong> Standard In-Progress
                    </span>
                  </li>
                </ul>
              </div>

              {/* Card 2: Schedule & Project Milestones */}
              <div
                onClick={() => toggleFilter('milestone')}
                className={cn(
                  'rounded-xl bg-white dark:bg-[#1e1e24] p-3.5 border transition-all cursor-pointer shadow-2xs hover:shadow-md',
                  statusFilter === 'milestone'
                    ? 'border-purple-500 ring-2 ring-purple-500/30'
                    : 'border-white/80 dark:border-[#33333d] hover:border-purple-300'
                )}
                title="Click to filter Project Milestones (Handover / Opening)"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-200/70 dark:border-purple-800/60">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                    Schedule & Milestones
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  <strong className="text-purple-600 dark:text-purple-400 text-sm">{stats.upcomingMilestonesCount}</strong> project milestones (Handover / Opening)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  • <strong className="text-slate-800 dark:text-slate-200">{stats.dueThisWeekCount}</strong> deadlines due within 7 days
                </p>
              </div>

              {/* Card 3: Delegation Workflows */}
              <div
                onClick={() => toggleFilter('delegation')}
                className={cn(
                  'rounded-xl bg-white dark:bg-[#1e1e24] p-3.5 border transition-all cursor-pointer shadow-2xs hover:shadow-md',
                  statusFilter === 'delegation'
                    ? 'border-blue-500 ring-2 ring-blue-500/30'
                    : 'border-white/80 dark:border-[#33333d] hover:border-blue-300'
                )}
                title="Click to filter Delegated Sub-tasks"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/70 dark:border-blue-800/60">
                    <GitPullRequest className="w-4 h-4" />
                  </div>
                  <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                    Delegation Workflow
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  <strong className="text-blue-600 dark:text-blue-400 text-sm">{stats.delegationsActiveCount}</strong> delegated workflows active
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  • <strong className="text-slate-800 dark:text-slate-200">{stats.delegationsMyPICCount}</strong> assigned to your PIC / Party
                </p>
              </div>

              {/* Card 4: Approvals & Rework Requests */}
              <div
                onClick={() => toggleFilter('approval')}
                className={cn(
                  'rounded-xl bg-white dark:bg-[#1e1e24] p-3.5 border transition-all cursor-pointer shadow-2xs hover:shadow-md',
                  statusFilter === 'approval'
                    ? 'border-amber-500 ring-2 ring-amber-500/30'
                    : 'border-white/80 dark:border-[#33333d] hover:border-amber-300'
                )}
                title="Click to filter Pending Approvals & Rework requests"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200/70 dark:border-amber-800/60">
                    <FileCheck2 className="w-4 h-4" />
                  </div>
                  <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                    Approvals & Rework
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  <strong className="text-amber-600 dark:text-amber-400 text-sm">{stats.pendingMyApprovalCount}</strong> items awaiting approval
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  • <strong className="text-rose-600 dark:text-rose-400">{stats.needsReworkCount}</strong> returned for rework
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
