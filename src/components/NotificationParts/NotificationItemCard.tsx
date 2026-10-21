import React from 'react';
import {
  Bell,
  Check,
  RotateCcw,
  AlertCircle,
  Clock,
  Zap,
  UserCheck,
  ArrowUpRight,
  MapPin,
  MessageSquare,
  ListChecks,
} from 'lucide-react';
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
  onQuickCompleteTask?: (notif: ActiveNotification) => Promise<void> | void;
  onSnoozeNotif?: (notifId: string, hours: number) => void;
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
    onQuickCompleteTask,
    onSnoozeNotif,
  }) => {
    const matchedProject = React.useMemo(() => {
      if (notif.projectId) {
        const byId = projects.find((p) => String(p.id) === String(notif.projectId));
        if (byId) return byId;
      }
      if (notif.targetType === 'project') {
        const byTarget = projects.find(
          (p) =>
            String(p.id) === String(notif.targetId) || String(p.no) === String(notif.targetId)
        );
        if (byTarget) return byTarget;
      }
      if (notif.projectCode) {
        return projects.find((p) => {
          if (String(p.code || '').trim().toLowerCase() !== String(notif.projectCode).trim().toLowerCase()) {
            return false;
          }
          if (
            notif.projectStore &&
            String(p.store || '').trim().toLowerCase() !== String(notif.projectStore).trim().toLowerCase()
          ) {
            return false;
          }
          if (
            notif.projectYear &&
            String(p.year || '').trim() !== String(notif.projectYear).trim()
          ) {
            return false;
          }
          return true;
        });
      }
      return undefined;
    }, [notif, projects]);

    const notifStore = (
      notif.projectStore ||
      matchedProject?.store ||
      (notif.targetType === 'task'
        ? tasks.find((t) => String(t.id) === String(notif.targetId))?.projectStore
        : '') ||
      (notif.targetType === 'task_delegation'
        ? delegationGroups.find((g) => g.id === notif.targetId)?.projectStore
        : '') ||
      ''
    )
      .trim()
      .toUpperCase();

    const notifLocation = (notif.location || matchedProject?.location || '').trim();
    const notifYear = notif.projectYear || matchedProject?.year || '';
    const isHn = notifStore === 'HN';
    const isHcm = notifStore === 'HCM';

    const isCritical = notif.priority === 'critical';
    const isUrgent = notif.priority === 'urgent';
    const isActionReq = notif.priority === 'action_required';
    const isMention = notif.category === 'mention' || notif.ruleId === 'mention-notification';

    const priorityBorderClass = isCritical
      ? 'border-l-4 border-l-rose-500'
      : isUrgent
      ? 'border-l-4 border-l-amber-500'
      : isActionReq
      ? 'border-l-4 border-l-indigo-500'
      : 'border-l-4 border-l-blue-400';

    return (
      <div
        onClick={() => onNotificationClick({ ...notif, _openTarget: 'detail' } as any)}
        className={`bg-white dark:bg-[#1e1e20] p-4 rounded-xl border flex items-start gap-3.5 transition-all cursor-pointer hover:shadow-lg ${priorityBorderClass} ${
          isRead
            ? 'border-slate-100 opacity-60 dark:border-slate-800'
            : 'border-slate-200 dark:border-slate-800 shadow-md'
        }`}
      >
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center border ${
              isCritical
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400'
                : isUrgent
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50 text-amber-600 dark:text-amber-400'
                : isActionReq
                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400'
                : isRead
                ? 'bg-slate-50 dark:bg-[#28282a] border-slate-200 dark:border-[#444446] text-slate-400 dark:text-[#838383]'
                : 'bg-blue-50 dark:bg-[#28282a] border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-[#8ab4f8]'
            }`}
          >
            {isMention ? (
              <MessageSquare className="w-5 h-5" />
            ) : isCritical ? (
              <AlertCircle className="w-5 h-5" />
            ) : isUrgent ? (
              <Clock className="w-5 h-5" />
            ) : isActionReq ? (
              <Zap className="w-5 h-5" />
            ) : (
              <Bell className="w-5 h-5" />
            )}
          </div>
          {notifStore && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase text-center min-w-[34px] ${
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
          {notifLocation && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#28282a] text-slate-600 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446]">
              {notifLocation}
            </span>
          )}
        </div>

        <div className="flex-grow min-w-0">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-1.5 gap-1 md:gap-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isCritical && (
                <span className="text-[10px] bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-extrabold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                  <AlertCircle className="w-3 h-3" /> Overdue
                </span>
              )}
              {isUrgent && (
                <span className="text-[10px] bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-extrabold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                  <Clock className="w-3 h-3" /> Due Soon
                </span>
              )}
              {isActionReq && (
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-extrabold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                  <Zap className="w-3 h-3" /> {isMention ? '@Mention' : 'Action Req'}
                </span>
              )}

              {notif.isAssignedToMe && (
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-extrabold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <UserCheck className="w-3 h-3" /> Assigned to You
                </span>
              )}

              {notif.projectCode && (
                <span className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-[#8ab4f8] font-mono font-bold px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900/50">
                  {notifStore ? `${notifStore}•` : ''}
                  {notif.projectCode}
                  {notifYear ? ` (${notifYear})` : ''}
                </span>
              )}

              {notif.party && (
                <span className="text-[10px] bg-slate-100 dark:bg-[#28282a] text-slate-600 dark:text-[#a3a3a3] font-mono font-medium px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#444446]">
                  PIC: {notif.party}
                </span>
              )}

              <h4
                className={`font-bold text-sm sm:text-base truncate ${
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

          {notif.subtitle && (
            <p
              className={`text-xs mb-2 truncate font-semibold ${
                isRead ? 'text-blue-400 dark:text-blue-500/70' : 'text-blue-600 dark:text-[#8ab4f8]'
              }`}
            >
              {notif.subtitle}
            </p>
          )}

          {/* Structured Sub-Items list for batched project task notifications */}
          {notif.subItems && notif.subItems.length > 1 ? (
            <div className="space-y-1.5 bg-slate-50 dark:bg-[#18181a] p-2.5 rounded-lg border border-slate-100 dark:border-[#333336]">
              {notif.subItems.slice(0, 5).map((sub) => (
                <div
                  key={sub.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNotificationClick({
                      ...notif,
                      targetId: sub.targetId,
                      taskName: sub.taskName,
                      _openTarget: 'detail',
                    } as any);
                  }}
                  className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-white dark:hover:bg-[#28282a] transition-colors text-xs border border-transparent hover:border-slate-200 dark:hover:border-[#444446]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ListChecks className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="font-bold text-slate-700 dark:text-[#e3e3e3] truncate">
                      {sub.taskName}
                    </span>
                    {sub.party && (
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        [{sub.party}]
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[11px] text-slate-500 dark:text-[#a3a3a3] shrink-0"
                    dangerouslySetInnerHTML={{ __html: sub.message }}
                  />
                </div>
              ))}
              {notif.subItems.length > 5 && (
                <div className="text-[11px] text-slate-400 pl-2 pt-0.5 font-medium">
                  + {notif.subItems.length - 5} more tasks in this project...
                </div>
              )}
            </div>
          ) : (
            <p
              className={`text-sm bg-slate-50 dark:bg-[#1e1e20] p-2 rounded border border-slate-100 dark:border-[#333336] break-words ${
                isRead ? 'text-slate-500 dark:text-[#838383]' : 'text-slate-700 dark:text-[#c3c3c3]'
              }`}
            >
              <span dangerouslySetInnerHTML={{ __html: notif.message }} />
            </p>
          )}

          {/* Inline Project Management Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {notif.action === 'cross_year_rollover' ? (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onActionAgree?.(notif);
                  }}
                  className="px-3.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md shadow-sm transition-colors active:scale-95 touch-manipulation"
                >
                  Agree Rollover
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onActionReject?.(notif);
                  }}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-[#333336] dark:hover:bg-[#444446] dark:text-[#e3e3e3] text-xs font-bold rounded-md transition-colors active:scale-95 touch-manipulation"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <>
                {notif.targetType === 'task' && !isRead && (!notif.count || notif.count === 1) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickCompleteTask?.(notif);
                    }}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-md shadow-sm transition-colors flex items-center gap-1 active:scale-95 touch-manipulation"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Complete Task</span>
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNotificationClick({ ...notif, _openTarget: 'detail' } as any);
                  }}
                  className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-[#8ab4f8] hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/50 text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 active:scale-95 touch-manipulation"
                >
                  <span>{isMention ? 'Open Chat & Detail' : 'Task Detail'}</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>

                {notif.projectCode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNotificationClick({ ...notif, _openTarget: 'layout' } as any);
                    }}
                    title={`Locate ${notifStore ? notifStore + ' - ' : ''}${notif.projectCode} on 2D Floor Plan`}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-[#28282a] hover:bg-slate-200 dark:hover:bg-[#333336] text-slate-700 dark:text-[#e3e3e3] border border-slate-200 dark:border-[#444446] text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 active:scale-95 touch-manipulation"
                  >
                    <MapPin className="w-3 h-3 text-rose-500" />
                    <span>2D Floor Plan</span>
                  </button>
                )}

                {!isRead && onSnoozeNotif && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSnoozeNotif(notif.id, 24);
                      }}
                      title="Snooze reminder for 1 day"
                      className="px-2 py-1 bg-slate-100 dark:bg-[#28282a] hover:bg-slate-200 dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] text-[11px] font-bold rounded-md border border-slate-200 dark:border-[#444446] flex items-center gap-1 active:scale-95 touch-manipulation"
                    >
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Snooze 1d</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSnoozeNotif(notif.id, 72);
                      }}
                      title="Snooze reminder for 3 days"
                      className="px-2 py-1 bg-slate-100 dark:bg-[#28282a] hover:bg-slate-200 dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] text-[11px] font-bold rounded-md border border-slate-200 dark:border-[#444446] hidden sm:flex items-center gap-1 active:scale-95 touch-manipulation"
                    >
                      <span>3d</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>

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
          title={isRead ? 'Mark as unread' : 'Mark as read'}
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
