import React from 'react';
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Database,
  Flame,
  Inbox,
  Kanban,
  List,
  Sparkles,
  Sun,
} from 'lucide-react';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { FixedProjectInput } from '../FixedProjectInput';
import { Project } from '../../types';
import {
  MyWorkCounts,
  MyWorkDisplayMode,
  MyWorkTabView,
  MyWorkTimeFilter,
} from './myWorkTypes';
import { cn } from '../../lib/utils';

interface MyWorkHeaderProps {
  username: string;
  projects?: Project[];
  yearFilter?: string;
  displayMode: MyWorkDisplayMode;
  onDisplayModeChange: (mode: MyWorkDisplayMode) => void;
  activeView: MyWorkTabView;
  onViewChange: (view: MyWorkTabView) => void;
  timeFilter: MyWorkTimeFilter;
  onTimeFilterChange: (tf: MyWorkTimeFilter) => void;
  counts: MyWorkCounts;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  sortBy: 'urgency' | 'due_asc' | 'project' | 'priority';
  onSortByChange: (sort: 'urgency' | 'due_asc' | 'project' | 'priority') => void;
  storeFilter: string;
  onStoreFilterChange: (store: string) => void;
  hasSummaryFallbacks: boolean;
  onRequestFullHydration: () => void;
  onOpenCalendarSync: () => void;
}

function getGreetingByHour(): { emoji: string; greeting: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { emoji: '☀️', greeting: 'Good morning' };
  if (hour < 18) return { emoji: '🌤️', greeting: 'Good afternoon' };
  return { emoji: '🌙', greeting: 'Good evening' };
}

export const MyWorkHeader: React.FC<MyWorkHeaderProps> = React.memo(function MyWorkHeader({
  username,
  projects = [],
  yearFilter = 'all',
  displayMode,
  onDisplayModeChange,
  activeView,
  onViewChange,
  timeFilter,
  onTimeFilterChange,
  counts,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  storeFilter,
  onStoreFilterChange,
  hasSummaryFallbacks,
  onRequestFullHydration,
  onOpenCalendarSync,
}) {
  const { emoji, greeting } = getGreetingByHour();

  const timeChips: Array<{
    id: MyWorkTimeFilter;
    label: string;
    icon: React.ElementType;
    count: number;
    urgent?: boolean;
    accentClass?: string;
  }> = [
    {
      id: 'all',
      label: 'All Dates',
      icon: Sparkles,
      count: counts.allActive,
    },
    {
      id: 'today_focus',
      label: 'Today & Overdue',
      icon: Flame,
      count: counts.todayFocus,
      urgent: counts.overdue > 0,
      accentClass: 'text-orange-600 dark:text-orange-400',
    },
    {
      id: 'today',
      label: 'Today',
      icon: Sun,
      count: counts.todayOnly,
      accentClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      id: 'this_week',
      label: 'This Week (7d)',
      icon: CalendarDays,
      count: counts.thisWeek,
      accentClass: 'text-blue-600 dark:text-blue-400',
    },
    {
      id: 'this_month',
      label: 'This Month (30d)',
      icon: Calendar,
      count: counts.thisMonth,
      accentClass: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      id: 'overdue',
      label: 'Overdue',
      icon: AlertTriangle,
      count: counts.overdue,
      urgent: counts.overdue > 0,
      accentClass: 'text-rose-600 dark:text-rose-400',
    },
    {
      id: 'upcoming',
      label: 'Later (>30d)',
      icon: Clock,
      count: counts.future,
      accentClass: 'text-slate-600 dark:text-slate-400',
    },
  ];

  const listPills: Array<{
    id: MyWorkTabView;
    label: string;
    emojiIcon: string;
    icon: React.ElementType;
    count?: number;
    urgentBadge?: boolean;
  }> = [
    {
      id: 'today',
      label: 'Today Stream',
      emojiIcon: '☀️',
      icon: Sun,
      count: counts.today,
      urgentBadge: counts.overdue > 0,
    },
    {
      id: 'inbox',
      label: 'Inbox / Approval',
      emojiIcon: '📥',
      icon: Inbox,
      count: counts.inbox,
      urgentBadge: counts.inbox > 0,
    },
    {
      id: 'upcoming',
      label: 'Upcoming Stream',
      emojiIcon: '📅',
      icon: CalendarDays,
      count: counts.upcoming,
    },
    {
      id: 'done',
      label: 'Done',
      emojiIcon: '✅',
      icon: CheckCircle2,
      count: counts.done,
    },
  ];

  const storeOptions = [
    { id: 'all', label: 'All' },
    { id: 'HCM', label: 'HCM' },
    { id: 'HN', label: 'HN' },
  ];

  return (
    <div className="sticky top-0 z-[40] bg-white/95 dark:bg-[#18181b]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-[#333336] px-4 py-3 sm:px-6 transition-colors">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-2.5">
        {/* Top Row: Greeting + View Switcher (Kanban | List) + Right Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 shrink-0 shadow-2xs" />
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-[#f3f3f3] tracking-tight">
                {emoji} {greeting},{' '}
                <span className="text-blue-600 dark:text-blue-400">{username || 'Team'}</span>
              </h1>
            </div>

            {/* Kanban / List Mode Switcher */}
            <div className="inline-flex items-center bg-slate-100 dark:bg-[#242429] p-1 rounded-xl border border-slate-200/80 dark:border-[#36363e]">
              <button
                type="button"
                onClick={() => onDisplayModeChange('kanban')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer active:scale-95',
                  displayMode === 'kanban'
                    ? 'bg-white dark:bg-[#32323a] text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>Kanban</span>
              </button>
              <button
                type="button"
                onClick={() => onDisplayModeChange('list')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer active:scale-95',
                  displayMode === 'list'
                    ? 'bg-white dark:bg-[#32323a] text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
            </div>

            {/* Summary-First 0-Read Status / On-Demand Full Load */}
            {hasSummaryFallbacks && (
              <button
                type="button"
                onClick={onRequestFullHydration}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 hover:bg-emerald-100 transition-colors cursor-pointer active:scale-95"
                title="Currently displaying fast 0-Read Project Summaries. Click to hydrate full task details & delegations if needed."
              >
                <Database className="w-3 h-3" />
                <span>⚡ Summary Mode (0 Read) • Load Full Details</span>
              </button>
            )}
          </div>

          {/* Filter & Action Toolbar */}
          <div className="flex items-center flex-wrap gap-2">
            <div className="w-full sm:w-44">
              <DebouncedSearchInput
                value={searchQuery}
                onChange={onSearchChange}
                placeholder="Search tasks, code, PIC..."
                debounceMs={200}
                showAssistant={false}
                className="w-full"
              />
            </div>

            <FixedProjectInput
              projects={projects}
              yearFilter={yearFilter}
              storeFilter={storeFilter}
            />

            {/* Status / Type Filter Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="h-8 px-2.5 rounded-lg text-xs font-bold bg-white dark:bg-[#242429] text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-[#38383f] outline-none cursor-pointer"
              title="Filter by Status or Work Type"
            >
              <option value="all">Status: All</option>
              <option value="overdue">🚨 Overdue & Rework</option>
              <option value="approval">📥 Pending Approval</option>
              <option value="delegation">🤝 Delegations Only</option>
              <option value="milestone">🚩 Milestones Only</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as any)}
              className="h-8 px-2.5 rounded-lg text-xs font-bold bg-white dark:bg-[#242429] text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-[#38383f] outline-none cursor-pointer"
              title="Sort work items"
            >
              <option value="urgency">Sort: Due Date</option>
              <option value="priority">Sort: Priority</option>
              <option value="project">Sort: Project Code</option>
            </select>

            {/* Quick Store Pill Switcher */}
            <div className="inline-flex items-center bg-slate-100 dark:bg-[#242428] p-0.5 rounded-lg border border-slate-200/80 dark:border-[#38383c] shrink-0">
              {storeOptions.map((st) => {
                const isSelected =
                  (st.id === 'all' && (!storeFilter || storeFilter === 'all')) ||
                  String(storeFilter).toUpperCase() === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onStoreFilterChange(st.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer active:scale-95 touch-manipulation',
                      isSelected
                        ? 'bg-white dark:bg-[#333338] text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-slate-600 dark:text-[#a3a3a3] hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>

            {/* Calendar Sync Button */}
            <button
              type="button"
              onClick={onOpenCalendarSync}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all cursor-pointer active:scale-95 touch-manipulation shrink-0"
              title="Sync personal tasks and milestones to your mobile/desktop calendar"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
          </div>
        </div>

        {/* Time Horizon Filter Bar (Works in both Kanban & List modes for focused execution) */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-slate-100 dark:border-[#29292f]">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1 shrink-0">
              Timeframe:
            </span>
            {timeChips.map((chip) => {
              const Icon = chip.icon;
              const isSelected = timeFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onTimeFilterChange(chip.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer select-none shrink-0 active:scale-95 touch-manipulation border',
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-slate-100/80 dark:bg-[#222227] text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-[#34343c] hover:bg-slate-200/70 dark:hover:bg-[#2c2c34]'
                  )}
                >
                  <Icon
                    className={cn(
                      'w-3.5 h-3.5 shrink-0',
                      isSelected ? 'text-white' : chip.accentClass || 'text-slate-500'
                    )}
                  />
                  <span>{chip.label}</span>
                  <span
                    className={cn(
                      'px-1.5 py-0.2 rounded-full text-[10px] font-extrabold leading-tight',
                      isSelected
                        ? 'bg-white/25 text-white'
                        : chip.urgent && chip.count > 0
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-200/90 dark:bg-[#32323a] text-slate-700 dark:text-slate-300'
                    )}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Segmented Stream Tabs when in List View */}
          {displayMode === 'list' && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {listPills.map((pill) => {
                const isActive = activeView === pill.id;
                const countVal = pill.count ?? 0;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => onViewChange(pill.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer select-none shrink-0 active:scale-95 touch-manipulation border',
                      isActive
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-2xs'
                        : 'bg-slate-100/90 dark:bg-[#242428] text-slate-600 dark:text-[#c3c3c3] border-slate-200/70 dark:border-[#38383c] hover:bg-slate-200/80 dark:hover:bg-[#303036]'
                    )}
                  >
                    <span>{pill.emojiIcon}</span>
                    <span>{pill.label}</span>
                    <span
                      className={cn(
                        'px-1.5 py-0.2 rounded-full text-[10px] font-extrabold leading-tight',
                        pill.urgentBadge && countVal > 0
                          ? 'bg-rose-500 text-white'
                          : isActive
                          ? 'bg-white/20 dark:bg-slate-900/15 text-white dark:text-slate-900'
                          : 'bg-slate-200 dark:bg-[#333338] text-slate-700 dark:text-[#d3d3d3]'
                      )}
                    >
                      {countVal}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
