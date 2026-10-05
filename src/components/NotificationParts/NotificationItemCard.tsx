import React from 'react';
import { Bell, Check, RotateCcw } from 'lucide-react';
import { ActiveNotification, Project, Task, DelegationGroup } from '../../types';
import { formatDisplayDateTime } from '../../lib/utils';

interface NotificationItemCardProps {
  notif: ActiveNotification;
  isRead: boolean;
  tasks: Task[];
  projects: Project[];
  delegationGroups: DelegationGroup[];
  onNotificationClick: (notif: ActiveNotification) => void;
  onToggleRead: (id: string) => void;
  onActionAgree?: (notif: ActiveNotification) => void;
  onActionReject?: (notif: ActiveNotification) => void;
}

export const NotificationItemCard: React.FC<NotificationItemCardProps> = React.memo(
  ({
    notif,
    isRead,
    tasks,
    projects,
    delegationGroups,
    onNotificationClick,
    onToggleRead,
    onActionAgree,
    onActionReject,
  }) => {
    const notifStore = (
      notif.projectStore ||
      (notif.targetType === 'task'
        ? tasks.find((t) => String(t.id) === String(notif.targetId))?.projectStore
        : '') ||
      (notif.targetType === 'project'
        ? projects.find(
            (p) =>
              (notif.targetId &&
                (String(p.id) === String(notif.targetId) ||
                  String(p.no) === String(notif.targetId))) ||
              (notif.projectCode && p.code === notif.projectCode)
          )?.store
        : '') ||
      (notif.targetType === 'task_delegation'
        ? delegationGroups.find((g) => g.id === notif.targetId)?.projectStore
        : '') ||
      ''
    ).trim();

    const isHn = notifStore.toUpperCase() === 'HN';
    const isHcm = notifStore.toUpperCase() === 'HCM';

    return (
      <div
        onClick={() => onNotificationClick(notif)}
        className={`bg-white dark:bg-[#1e1e20] p-4 rounded-xl border flex items-start gap-4 transition-all cursor-pointer hover:shadow-lg ${
          isRead
            ? 'border-slate-100 opacity-60 dark:border-slate-800'
            : 'border-blue-200 dark:border-blue-900/50 shadow-md'
        }`}
      >
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center border ${
              isRead
                ? 'bg-slate-50 dark:bg-[#28282a] border-slate-200 dark:border-[#444446]'
                : 'bg-blue-50 dark:bg-[#28282a] border-blue-100 dark:border-blue-900/50'
            }`}
          >
            <Bell
              className={`w-5 h-5 ${
                isRead ? 'text-slate-400 dark:text-[#838383]' : 'text-blue-600 dark:text-[#8ab4f8]'
              }`}
            />
          </div>
          {notifStore && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase text-center min-w-[32px] ${
                isHn
                  ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50'
                  : isHcm
                  ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-[#8ab4f8] dark:border-blue-900/50'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              {notifStore}
            </span>
          )}
        </div>
        <div className="flex-grow min-w-0">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-1.5 gap-1 md:gap-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4
                className={`font-bold text-base truncate ${
                  isRead ? 'text-slate-500 dark:text-[#838383]' : 'text-slate-800 dark:text-[#e3e3e3]'
                }`}
              >
                {notif.title}
              </h4>
              {notif.count && notif.count > 1 ? (
                <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold px-2 py-0.5 rounded-full shrink-0">
                  {notif.count} tasks
                </span>
              ) : null}
            </div>
          </div>
          {notif.subtitle &&
            (() => {
              const parts = notif.subtitle.split(' - ');
              const textColor = isRead
                ? 'text-blue-400 dark:text-blue-500/70'
                : 'text-blue-600 dark:text-[#8ab4f8]';
              if (parts.length > 1) {
                const code = parts[0];
                const rest = parts.slice(1).join(' - ');
                return (
                  <p className={`text-xs mb-2 truncate ${textColor}`}>
                    <span className="font-normal opacity-90">{code}</span>
                    <span className="font-normal"> - </span>
                    <span className="font-bold">{rest}</span>
                  </p>
                );
              }
              return (
                <p className={`text-xs mb-2 truncate ${textColor}`}>
                  <span className="font-bold">{notif.subtitle}</span>
                </p>
              );
            })()}
          <p
            className={`text-sm bg-slate-50 dark:bg-[#1e1e20] p-2 rounded border border-slate-100 dark:border-[#333336] break-words ${
              isRead ? 'text-slate-500 dark:text-[#838383]' : 'text-slate-700 dark:text-[#c3c3c3]'
            }`}
          >
            <span dangerouslySetInnerHTML={{ __html: notif.message }} />
          </p>
          {notif.action && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onActionAgree?.(notif);
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md shadow-sm transition-colors active:scale-95 touch-manipulation"
              >
                Agree
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onActionReject?.(notif);
                }}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-[#333336] dark:hover:bg-[#444446] dark:text-[#e3e3e3] text-xs font-bold rounded-md transition-colors active:scale-95 touch-manipulation"
              >
                Reject
              </button>
            </div>
          )}
          <div className="mt-2 text-[10px] text-slate-400 dark:text-[#838383] font-medium flex items-center gap-1">
            <span className="uppercase tracking-wider">Update:</span>
            <span>{formatDisplayDateTime(new Date(notif.generatedAt).toISOString())}</span>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleRead(notif.id);
          }}
          className="shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors active:scale-95 touch-manipulation"
        >
          {isRead ? (
            <RotateCcw className="w-5 h-5 text-slate-400 dark:text-[#838383]" />
          ) : (
            <Check className="w-5 h-5 text-blue-500" />
          )}
        </button>
      </div>
    );
  }
);
