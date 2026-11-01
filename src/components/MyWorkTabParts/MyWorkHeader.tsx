import React from 'react';
import { Calendar, CheckCircle2, Inbox, Sun, CalendarDays } from 'lucide-react';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { MyWorkCounts, MyWorkTabView } from './myWorkTypes';
import { cn } from '../../lib/utils';

interface MyWorkHeaderProps {
  username: string;
  activeView: MyWorkTabView;
  onViewChange: (view: MyWorkTabView) => void;
  counts: MyWorkCounts;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  storeFilter: string;
  onStoreFilterChange: (store: string) => void;
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
  activeView,
  onViewChange,
  counts,
  searchQuery,
  onSearchChange,
  storeFilter,
  onStoreFilterChange,
  onOpenCalendarSync,
}) {
  const { emoji, greeting } = getGreetingByHour();

  const pills: Array<{
    id: MyWorkTabView;
    label: string;
    emojiIcon: string;
    icon: React.ElementType;
    count?: number;
    urgentBadge?: boolean;
  }> = [
    {
      id: 'today',
      label: 'Today',
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
      label: 'Upcoming',
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
    <div className="sticky top-0 z-[40] bg-white/95 dark:bg-[#18181b]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-[#333336] px-4 py-3.5 sm:px-6 transition-colors">
      <div className="max-w-5xl mx-auto flex flex-col gap-3.5">
        {/* Top Row: Friendly Greeting & Right Quick Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-[#f3f3f3] tracking-tight flex items-center gap-2">
              <span>{emoji}</span>
              <span>
                {greeting}, <span className="text-blue-600 dark:text-blue-400">{username || 'Team'}</span>
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-[#a3a3a3] mt-0.5">
              You have{' '}
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {counts.todayTodo}
              </span>{' '}
              {counts.todayTodo === 1 ? 'task' : 'tasks'} for today and{' '}
              <span
                className={cn(
                  'font-bold',
                  counts.inbox > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-800 dark:text-slate-200'
                )}
              >
                {counts.inbox}
              </span>{' '}
              {counts.inbox === 1 ? 'item' : 'items'} awaiting approval.
            </p>
          </div>

          {/* Right Controls: Search + Store Selector + Calendar Sync */}
          <div className="flex items-center flex-wrap sm:flex-nowrap gap-2">
            <div className="w-full sm:w-52">
              <DebouncedSearchInput
                value={searchQuery}
                onChange={onSearchChange}
                placeholder="Search my work..."
                debounceMs={200}
                showAssistant={false}
                className="w-full"
              />
            </div>

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
              <span>📱 Calendar Sync</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: 4 Segmented Pill Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {pills.map((pill) => {
            const isActive = activeView === pill.id;
            const countVal = pill.count ?? 0;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => onViewChange(pill.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer select-none shrink-0 active:scale-95 touch-manipulation border',
                  isActive
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                    : 'bg-slate-100/90 dark:bg-[#242428] text-slate-600 dark:text-[#c3c3c3] border-slate-200/70 dark:border-[#38383c] hover:bg-slate-200/80 dark:hover:bg-[#303036]'
                )}
              >
                <span>{pill.emojiIcon}</span>
                <span>{pill.label}</span>
                {pill.id !== 'done' && (
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded-full text-[11px] font-extrabold leading-none transition-colors',
                      pill.urgentBadge && countVal > 0
                        ? 'bg-rose-500 text-white shadow-2xs'
                        : isActive
                        ? 'bg-white/20 dark:bg-slate-900/15 text-white dark:text-slate-900'
                        : 'bg-slate-200 dark:bg-[#333338] text-slate-700 dark:text-[#d3d3d3]'
                    )}
                  >
                    {countVal}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
