import React from 'react';
import { RotateCcw } from 'lucide-react';
import {
  NotificationStatusFilter,
  NotificationTypeFilter,
  NotificationStoreFilter,
} from './notificationTypes';

interface NotificationFilterToolbarProps {
  filterId?: string | null;
  onClearFilter?: () => void;
  statusFilter: NotificationStatusFilter;
  setStatusFilter: React.Dispatch<React.SetStateAction<NotificationStatusFilter>>;
  typeFilter: NotificationTypeFilter;
  setTypeFilter: React.Dispatch<React.SetStateAction<NotificationTypeFilter>>;
  storeFilter: NotificationStoreFilter;
  setStoreFilter: React.Dispatch<React.SetStateAction<NotificationStoreFilter>>;
  allowedStores: string[];
  unreadProjectCount: number;
  unreadTaskCount: number;
  unreadDelegationCount: number;
  unreadHcmCount: number;
  unreadHnCount: number;
  onMarkAllRead?: () => void;
}

export const NotificationFilterToolbar: React.FC<NotificationFilterToolbarProps> = ({
  filterId,
  onClearFilter,
  statusFilter,
  setStatusFilter,
  typeFilter,
  setTypeFilter,
  storeFilter,
  setStoreFilter,
  allowedStores,
  unreadProjectCount,
  unreadTaskCount,
  unreadDelegationCount,
  unreadHcmCount,
  unreadHnCount,
  onMarkAllRead,
}) => {
  return (
    <div className="px-5 py-4 border-b border-slate-100 dark:border-[#444446] bg-slate-50 dark:bg-[#28282a] flex flex-col sm:flex-row justify-between items-start sm:items-center shrink-0 gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3]">
            Active Notifications
          </h2>
          {filterId && onClearFilter && (
            <button
              title="Clear Filter"
              onClick={onClearFilter}
              className="text-xs bg-slate-200 text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-300 px-2 py-1 rounded flex items-center gap-1"
            >
              Clear Filter <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Status filters */}
        <div className="flex bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#444446] p-1 shadow-sm">
          <button
            onClick={() => {
              if (filterId && onClearFilter) onClearFilter();
              setStatusFilter((prev) => (!filterId && prev === 'read' ? 'all' : 'read'));
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
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
              setStatusFilter((prev) => (!filterId && prev === 'unread' ? 'all' : 'unread'));
            }}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
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
              if (onMarkAllRead) onMarkAllRead();
            }}
            className="px-3 py-1.5 text-xs font-bold rounded-md transition-colors text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]"
          >
            Read All
          </button>
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
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors relative ${
              typeFilter === 'project'
                ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
            }`}
          >
            Project
            {unreadProjectCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
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
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors relative ${
              typeFilter === 'task'
                ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
            }`}
          >
            Task
            {unreadTaskCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
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
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors relative ${
              typeFilter === 'task_delegation'
                ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
            }`}
          >
            Delegation
            {unreadDelegationCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
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
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors active:scale-95 touch-manipulation ${
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
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors relative active:scale-95 touch-manipulation ${
                  storeFilter === 'HCM'
                    ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                    : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
                }`}
              >
                HCM
                {unreadHcmCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
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
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors relative active:scale-95 touch-manipulation ${
                  storeFilter === 'HN'
                    ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                    : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
                }`}
              >
                HN
                {unreadHnCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
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
