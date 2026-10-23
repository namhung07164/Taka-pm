import React from 'react';
import {
  RotateCcw,
  Archive,
  AlertCircle,
  Clock,
  Zap,
  UserCheck,
  Search,
  X,
  MessageSquare,
  CalendarClock,
} from 'lucide-react';
import {
  NotificationStatusFilter,
  NotificationTypeFilter,
  NotificationStoreFilter,
  NotificationPriorityFilter,
  NotificationAssigneeFilter,
  NotificationCategoryFilter,
} from './notificationTypes';

interface NotificationFilterToolbarProps {
  filterId?: string | null;
  onClearFilter?: () => void;
  statusFilter: NotificationStatusFilter;
  setStatusFilter: React.Dispatch<React.SetStateAction<NotificationStatusFilter>>;
  typeFilter: NotificationTypeFilter;
  setTypeFilter: React.Dispatch<React.SetStateAction<NotificationTypeFilter>>;
  priorityFilter: NotificationPriorityFilter;
  setPriorityFilter: React.Dispatch<React.SetStateAction<NotificationPriorityFilter>>;
  assigneeFilter: NotificationAssigneeFilter;
  setAssigneeFilter: React.Dispatch<React.SetStateAction<NotificationAssigneeFilter>>;
  categoryFilter: NotificationCategoryFilter;
  setCategoryFilter: React.Dispatch<React.SetStateAction<NotificationCategoryFilter>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  storeFilter: NotificationStoreFilter;
  setStoreFilter: React.Dispatch<React.SetStateAction<NotificationStoreFilter>>;
  allowedStores: string[];
  unreadProjectCount: number;
  unreadTaskCount: number;
  unreadDelegationCount: number;
  unreadHcmCount: number;
  unreadHnCount: number;
  unreadCriticalCount: number;
  unreadUrgentCount: number;
  unreadActionCount: number;
  unreadAssignedToMeCount: number;
  categoryCounts: {
    all: number;
    overdue: number;
    due_soon: number;
    mention: number;
    delegation: number;
    rollover: number;
    milestone: number;
  };
  snoozedCount?: number;
  onMarkAllRead?: () => void;
  onClearStaleNotifs?: () => void;
}

export const NotificationFilterToolbar: React.FC<NotificationFilterToolbarProps> = ({
  filterId,
  onClearFilter,
  statusFilter,
  setStatusFilter,
  typeFilter,
  setTypeFilter,
  priorityFilter,
  setPriorityFilter,
  assigneeFilter,
  setAssigneeFilter,
  categoryFilter,
  setCategoryFilter,
  searchQuery,
  setSearchQuery,
  storeFilter,
  setStoreFilter,
  allowedStores,
  unreadProjectCount,
  unreadTaskCount,
  unreadDelegationCount,
  unreadHcmCount,
  unreadHnCount,
  unreadCriticalCount,
  unreadUrgentCount,
  unreadActionCount,
  unreadAssignedToMeCount,
  categoryCounts,
  snoozedCount,
  onMarkAllRead,
  onClearStaleNotifs,
}) => {
  return (
    <div className="px-5 py-3.5 border-b border-slate-100 dark:border-[#444446] bg-slate-50 dark:bg-[#28282a] flex flex-col gap-3 shrink-0">
      {/* Top Row: Title, Search Input, Assignee Switch, Status & Archive */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 w-full">
        <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto">
          <h2 className="text-base font-bold text-slate-800 dark:text-[#e3e3e3]">
            Project Notification Center
          </h2>
          {snoozedCount !== undefined && snoozedCount > 0 && (
            <span className="text-[11px] bg-slate-200 dark:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] font-semibold px-2 py-0.5 rounded-full">
              {snoozedCount} snoozed
            </span>
          )}
          {filterId && onClearFilter && (
            <button
              title="Clear Filter"
              onClick={onClearFilter}
              className="text-xs bg-slate-200 text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-300 px-2 py-1 rounded flex items-center gap-1 active:scale-95 touch-manipulation"
            >
              Clear Filter <RotateCcw className="w-3 h-3" />
            </button>
          )}
          <div className="relative flex-grow sm:flex-grow-0 sm:w-64 print:hidden hide-on-actual-print">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, project, task, PIC..."
              className="w-full pl-8 pr-7 py-1 text-xs rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] text-slate-700 dark:text-[#e3e3e3] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden hide-on-actual-print">
          {/* Proposal 2: Assignee Role Relevance (Assigned to Me vs All) */}
          <div className="flex bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#444446] p-1 shadow-sm">
            <button
              onClick={() => {
                if (filterId && onClearFilter) onClearFilter();
                setAssigneeFilter('all');
              }}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors active:scale-95 touch-manipulation ${
                assigneeFilter === 'all'
                  ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                  : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => {
                if (filterId && onClearFilter) onClearFilter();
                setAssigneeFilter((prev) => (prev === 'assigned_to_me' ? 'all' : 'assigned_to_me'));
              }}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors relative flex items-center gap-1 active:scale-95 touch-manipulation ${
                assigneeFilter === 'assigned_to_me'
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                  : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>My Tasks</span>
              {unreadAssignedToMeCount > 0 && (
                <span className="bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full min-w-[15px] text-center ml-0.5">
                  {unreadAssignedToMeCount > 99 ? '99+' : unreadAssignedToMeCount}
                </span>
              )}
            </button>
          </div>

          {/* Status filters */}
          <div className="flex bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#444446] p-1 shadow-sm">
            <button
              onClick={() => {
                if (filterId && onClearFilter) onClearFilter();
                setStatusFilter((prev) => (!filterId && prev === 'unread' ? 'all' : 'unread'));
              }}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors active:scale-95 touch-manipulation ${
                statusFilter === 'unread'
                  ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                  : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
              }`}
            >
              Unread
            </button>
            <button
              onClick={() => {
                if (filterId && onClearFilter) onClearFilter();
                setStatusFilter((prev) => (!filterId && prev === 'read' ? 'all' : 'read'));
              }}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors active:scale-95 touch-manipulation ${
                statusFilter === 'read'
                  ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                  : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
              }`}
            >
              Read
            </button>
            <button
              onClick={() => {
                if (filterId && onClearFilter) onClearFilter();
                if (onMarkAllRead) onMarkAllRead();
              }}
              className="px-2.5 py-1 text-xs font-bold rounded-md transition-colors text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336] active:scale-95 touch-manipulation"
            >
              Read All
            </button>
          </div>

          {/* Proposal 4: Clean stale notifications older than 14 days */}
          {onClearStaleNotifs && (
            <button
              onClick={onClearStaleNotifs}
              title="Archive notifications older than 14 days"
              className="px-2.5 py-1.5 bg-white dark:bg-[#1e1e20] hover:bg-slate-100 dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] text-xs font-bold rounded-lg border border-slate-200 dark:border-[#444446] shadow-sm flex items-center gap-1 active:scale-95 touch-manipulation"
            >
              <Archive className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Archive &gt;14d</span>
            </button>
          )}
        </div>
      </div>

      {/* Secondary Row: PM Category Pills + Priority Chips + Target Types + Stores */}
      <div className="flex flex-wrap items-center gap-2 w-full pt-1 border-t border-slate-200/60 dark:border-[#333336] print:hidden hide-on-actual-print">
        {/* Project Management Category Quick Filters */}
        <div className="flex bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#444446] p-1 shadow-sm items-center flex-wrap gap-0.5">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors active:scale-95 touch-manipulation ${
              categoryFilter === 'all'
                ? 'bg-slate-200 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3]'
                : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
            }`}
          >
            All Categories
          </button>
          <button
            onClick={() => setCategoryFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))}
            className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 active:scale-95 touch-manipulation ${
              categoryFilter === 'overdue'
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
            }`}
          >
            <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            <span>Overdue</span>
            {categoryCounts.overdue > 0 && (
              <span className="bg-rose-600 text-white text-[9px] font-extrabold px-1 py-0.2 rounded-full min-w-[14px] text-center">
                {categoryCounts.overdue}
              </span>
            )}
          </button>
          <button
            onClick={() => setCategoryFilter((prev) => (prev === 'due_soon' ? 'all' : 'due_soon'))}
            className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 active:scale-95 touch-manipulation ${
              categoryFilter === 'due_soon'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
            }`}
          >
            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Upcoming / Due</span>
            {categoryCounts.due_soon > 0 && (
              <span className="bg-amber-600 text-white text-[9px] font-extrabold px-1 py-0.2 rounded-full min-w-[14px] text-center">
                {categoryCounts.due_soon}
              </span>
            )}
          </button>
          <button
            onClick={() => setCategoryFilter((prev) => (prev === 'mention' ? 'all' : 'mention'))}
            className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 active:scale-95 touch-manipulation ${
              categoryFilter === 'mention'
                ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300'
                : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
            }`}
          >
            <MessageSquare className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            <span>@Mentions</span>
            {categoryCounts.mention > 0 && (
              <span className="bg-indigo-600 text-white text-[9px] font-extrabold px-1 py-0.2 rounded-full min-w-[14px] text-center">
                {categoryCounts.mention}
              </span>
            )}
          </button>
          {categoryCounts.rollover > 0 && (
            <button
              onClick={() => setCategoryFilter((prev) => (prev === 'rollover' ? 'all' : 'rollover'))}
              className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 active:scale-95 touch-manipulation ${
                categoryFilter === 'rollover'
                  ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                  : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
              }`}
            >
              <CalendarClock className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              <span>Rollover</span>
              <span className="bg-purple-600 text-white text-[9px] font-extrabold px-1 py-0.2 rounded-full min-w-[14px] text-center">
                {categoryCounts.rollover}
              </span>
            </button>
          )}
        </div>

        {/* Target type filters */}
        <div className="flex bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#444446] p-1 shadow-sm">
          <button
            onClick={() => {
              if (filterId && onClearFilter) onClearFilter();
              setTypeFilter((prev) => {
                const next = !filterId && prev === 'project' ? 'all' : 'project';
                if (next === 'project' && unreadProjectCount > 0) {
                  setStatusFilter('unread');
                }
                return next;
              });
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors relative active:scale-95 touch-manipulation ${
              typeFilter === 'project'
                ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
            }`}
          >
            Project
            {unreadProjectCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[15px] text-center">
                {unreadProjectCount > 99 ? '99+' : unreadProjectCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              if (filterId && onClearFilter) onClearFilter();
              setTypeFilter((prev) => {
                const next = !filterId && prev === 'task' ? 'all' : 'task';
                if (next === 'task' && unreadTaskCount > 0) {
                  setStatusFilter('unread');
                }
                return next;
              });
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors relative active:scale-95 touch-manipulation ${
              typeFilter === 'task'
                ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
            }`}
          >
            Task
            {unreadTaskCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[15px] text-center">
                {unreadTaskCount > 99 ? '99+' : unreadTaskCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              if (filterId && onClearFilter) onClearFilter();
              setTypeFilter((prev) => {
                const next = !filterId && prev === 'task_delegation' ? 'all' : 'task_delegation';
                if (next === 'task_delegation' && unreadDelegationCount > 0) {
                  setStatusFilter('unread');
                }
                return next;
              });
            }}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors relative active:scale-95 touch-manipulation ${
              typeFilter === 'task_delegation'
                ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
            }`}
          >
            Delegation
            {unreadDelegationCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[15px] text-center">
                {unreadDelegationCount > 99 ? '99+' : unreadDelegationCount}
              </span>
            )}
          </button>
        </div>

        {/* Store filters */}
        {allowedStores.length > 0 && (
          <div className="flex bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#444446] p-1 shadow-sm">
            {allowedStores.length > 1 && (
              <button
                onClick={() => {
                  if (filterId && onClearFilter) onClearFilter();
                  setStoreFilter('all');
                }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors active:scale-95 touch-manipulation ${
                  storeFilter === 'all'
                    ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                    : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
                }`}
              >
                All Stores
              </button>
            )}
            {allowedStores.includes('HCM') && (
              <button
                onClick={() => {
                  if (filterId && onClearFilter) onClearFilter();
                  setStoreFilter('HCM');
                }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors relative active:scale-95 touch-manipulation ${
                  storeFilter === 'HCM'
                    ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                    : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
                }`}
              >
                HCM
                {unreadHcmCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[15px] text-center">
                    {unreadHcmCount > 99 ? '99+' : unreadHcmCount}
                  </span>
                )}
              </button>
            )}
            {allowedStores.includes('HN') && (
              <button
                onClick={() => {
                  if (filterId && onClearFilter) onClearFilter();
                  setStoreFilter('HN');
                }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors relative active:scale-95 touch-manipulation ${
                  storeFilter === 'HN'
                    ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                    : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
                }`}
              >
                HN
                {unreadHnCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[15px] text-center">
                    {unreadHnCount > 99 ? '99+' : unreadHnCount}
                  </span>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
