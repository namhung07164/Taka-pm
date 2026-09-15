import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Bell, Check, RotateCcw } from 'lucide-react';
import { Project, Task, NotificationRule, ActiveNotification, AppUser } from '../types';
import { parseDateTime, formatDisplayDateTime } from '../lib/utils';
import { testLocalNotification } from '../lib/notifications';

interface NotificationTabProps {
  activeNotifications: ActiveNotification[];
  readNotifs: string[];
  filterId?: string | null;
  initialStatusFilter?: 'read' | 'unread' | 'all';
  onClearFilter?: () => void;
  onToggleRead: (id: string) => void;
  onMarkAllRead?: () => void;
  onNotificationClick: (notif: ActiveNotification) => void;
  onRequestPermission: () => void;
  onTogglePushEnabled: (enabled: boolean) => void;
  onActionAgree?: (notif: ActiveNotification) => void;
  onActionReject?: (notif: ActiveNotification) => void;
}

export function NotificationTab({ 
  activeNotifications, readNotifs, filterId, initialStatusFilter = 'unread', onClearFilter, onToggleRead, onMarkAllRead, onNotificationClick, onRequestPermission, onTogglePushEnabled, onActionAgree, onActionReject}: NotificationTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const [statusFilter, setStatusFilter] = useState<'read' | 'unread' | 'all'>(initialStatusFilter);
  const [typeFilter, setTypeFilter] = useState<'project' | 'task' | 'task_delegation' | 'all'>('all');
  const [storeFilter, setStoreFilter] = useState<'all' | 'HCM' | 'HN'>(() => {
    if (globalStoreFilter === 'HCM' || globalStoreFilter === 'HN') return globalStoreFilter;
    return 'all';
  });

  // Keep store filter in sync if user changes global store selector
  useEffect(() => {
    if (globalStoreFilter === 'HCM' || globalStoreFilter === 'HN') {
      setStoreFilter(globalStoreFilter);
    }
  }, [globalStoreFilter]);

  const unreadProjectCount = useMemo(() => activeNotifications.filter(n => n.targetType === 'project' && !readNotifs.includes(n.id)).length, [activeNotifications, readNotifs]);
  const unreadTaskCount = useMemo(() => activeNotifications.filter(n => n.targetType === 'task' && !readNotifs.includes(n.id)).length, [activeNotifications, readNotifs]);
  const unreadDelegationCount = useMemo(() => activeNotifications.filter(n => n.targetType === 'task_delegation' && !readNotifs.includes(n.id)).length, [activeNotifications, readNotifs]);

  const unreadHcmCount = useMemo(() => activeNotifications.filter(n => {
    if (readNotifs.includes(n.id)) return false;
    const s = (
      n.projectStore ||
      (n.targetType === 'task' ? tasks.find(t => String(t.id) === String(n.targetId))?.projectStore : '') ||
      (n.targetType === 'project' ? projects.find(p => (n.targetId && (String(p.id) === String(n.targetId) || String(p.no) === String(n.targetId))) || (n.projectCode && p.code === n.projectCode))?.store : '') ||
      (n.targetType === 'task_delegation' ? delegationGroups.find(g => g.id === n.targetId)?.projectStore : '') ||
      ''
    ).trim().toUpperCase();
    return s === 'HCM';
  }).length, [activeNotifications, readNotifs, tasks, projects, delegationGroups]);

  const unreadHnCount = useMemo(() => activeNotifications.filter(n => {
    if (readNotifs.includes(n.id)) return false;
    const s = (
      n.projectStore ||
      (n.targetType === 'task' ? tasks.find(t => String(t.id) === String(n.targetId))?.projectStore : '') ||
      (n.targetType === 'project' ? projects.find(p => (n.targetId && (String(p.id) === String(n.targetId) || String(p.no) === String(n.targetId))) || (n.projectCode && p.code === n.projectCode))?.store : '') ||
      (n.targetType === 'task_delegation' ? delegationGroups.find(g => g.id === n.targetId)?.projectStore : '') ||
      ''
    ).trim().toUpperCase();
    return s === 'HN';
  }).length, [activeNotifications, readNotifs, tasks, projects, delegationGroups]);

  const filteredNotifications = useMemo(() => {
    let result = activeNotifications;
    if (filterId) {
      result = activeNotifications.filter(notif => notif.id === filterId);
    } else {
      result = activeNotifications.filter(notif => {
        const isRead = readNotifs.includes(notif.id);
        
        if (statusFilter === 'read' && !isRead) return false;
        if (statusFilter === 'unread' && isRead) return false;
        
        if (typeFilter !== 'all' && notif.targetType !== typeFilter) return false;

        if (storeFilter !== 'all') {
          const nStore = (
            notif.projectStore ||
            (notif.targetType === 'task' ? tasks.find(t => String(t.id) === String(notif.targetId))?.projectStore : '') ||
            (notif.targetType === 'project' ? projects.find(p => (notif.targetId && (String(p.id) === String(notif.targetId) || String(p.no) === String(notif.targetId))) || (notif.projectCode && p.code === notif.projectCode))?.store : '') ||
            (notif.targetType === 'task_delegation' ? delegationGroups.find(g => g.id === notif.targetId)?.projectStore : '') ||
            ''
          ).trim().toUpperCase();
          if (nStore && nStore !== storeFilter.toUpperCase()) return false;
        }
        
        return true;
      });
    }
    
    return result.sort((a, b) => b.generatedAt - a.generatedAt);
  }, [activeNotifications, readNotifs, statusFilter, typeFilter, storeFilter, filterId, tasks, projects, delegationGroups]);

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-[#444446] bg-slate-50 dark:bg-[#28282a] flex flex-col sm:flex-row justify-between items-start sm:items-center shrink-0 gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3] dark:text-[#e3e3e3]">Active Notifications</h2>
            {filterId && onClearFilter && (
              <button title="Clear Filter" 
                onClick={onClearFilter}
                className="text-xs bg-slate-200 text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-300 px-2 py-1 rounded flex items-center gap-1"
              >
                Clear Filter <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#444446] p-1 shadow-sm">
            <button onClick={() => {
              if (filterId && onClearFilter) onClearFilter();
              setStatusFilter(prev => (!filterId && prev === 'read') ? 'all' : 'read');
            }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${statusFilter === 'read' ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]' : 'text-slate-600 dark:text-[#a3a3a3] dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'}`}
            >
              Read
            </button>
            <button onClick={() => {
              if (filterId && onClearFilter) onClearFilter();
              setStatusFilter(prev => (!filterId && prev === 'unread') ? 'all' : 'unread');
            }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${statusFilter === 'unread' ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]' : 'text-slate-600 dark:text-[#a3a3a3] dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'}`}
            >
              Unread
            </button>
            <button onClick={() => {
              if (filterId && onClearFilter) onClearFilter();
              if (onMarkAllRead) onMarkAllRead();
            }}
              className="px-3 py-1.5 text-xs font-bold rounded-md transition-colors text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]"
            >
              Read All
            </button>
          </div>
          <div className="flex bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#444446] p-1 shadow-sm">
            <button onClick={() => {
              if (filterId && onClearFilter) onClearFilter();
              setTypeFilter(prev => {
                const next = (!filterId && prev === 'project') ? 'all' : 'project';
                if (next === 'project' && unreadProjectCount > 0) {
                  setStatusFilter('unread');
                }
                return next;
              });
            }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors relative ${typeFilter === 'project' ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]' : 'text-slate-600 dark:text-[#a3a3a3] dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'}`}
            >
              Project
              {unreadProjectCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
                  {unreadProjectCount > 99 ? '99+' : unreadProjectCount}
                </span>
              )}
            </button>
            <button onClick={() => {
              if (filterId && onClearFilter) onClearFilter();
              setTypeFilter(prev => {
                const next = (!filterId && prev === 'task') ? 'all' : 'task';
                if (next === 'task' && unreadTaskCount > 0) {
                  setStatusFilter('unread');
                }
                return next;
              });
            }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors relative ${typeFilter === 'task' ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]' : 'text-slate-600 dark:text-[#a3a3a3] dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'}`}
            >
              Task
              {unreadTaskCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
                  {unreadTaskCount > 99 ? '99+' : unreadTaskCount}
                </span>
              )}
            </button>
            <button onClick={() => {
              if (filterId && onClearFilter) onClearFilter();
              setTypeFilter(prev => {
                const next = (!filterId && prev === 'task_delegation') ? 'all' : 'task_delegation';
                if (next === 'task_delegation' && unreadDelegationCount > 0) {
                  setStatusFilter('unread');
                }
                return next;
              });
            }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors relative ${typeFilter === 'task_delegation' ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]' : 'text-slate-600 dark:text-[#a3a3a3] dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'}`}
            >
              Delegation
              {unreadDelegationCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
                  {unreadDelegationCount > 99 ? '99+' : unreadDelegationCount}
                </span>
              )}
            </button>
          </div>
          <div className="flex bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#444446] p-1 shadow-sm">
            <button
              onClick={() => {
                if (filterId && onClearFilter) onClearFilter();
                setStoreFilter('all');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                storeFilter === 'all'
                  ? 'bg-blue-100 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8]'
                  : 'text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#333336]'
              }`}
            >
              All Store
            </button>
            <button
              onClick={() => {
                if (filterId && onClearFilter) onClearFilter();
                setStoreFilter('HCM');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors relative ${
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
            <button
              onClick={() => {
                if (filterId && onClearFilter) onClearFilter();
                setStoreFilter('HN');
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors relative ${
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
          </div>
        </div>
      </div>
      <div className="overflow-y-auto flex-grow p-4 bg-slate-50/50">
        <div className="space-y-3 max-w-3xl mx-auto">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 dark:text-[#838383] font-medium">Great! No upcoming events.</p>
            </div>
          ) : (
            filteredNotifications.map(notif => {
              const isRead = readNotifs.includes(notif.id);
              const notifStore = (
                notif.projectStore ||
                (notif.targetType === 'task' ? tasks.find(t => String(t.id) === String(notif.targetId))?.projectStore : '') ||
                (notif.targetType === 'project' ? projects.find(p => (notif.targetId && (String(p.id) === String(notif.targetId) || String(p.no) === String(notif.targetId))) || (notif.projectCode && p.code === notif.projectCode))?.store : '') ||
                (notif.targetType === 'task_delegation' ? delegationGroups.find(g => g.id === notif.targetId)?.projectStore : '') ||
                ''
              ).trim();
              const isHn = notifStore.toUpperCase() === 'HN';
              const isHcm = notifStore.toUpperCase() === 'HCM';

              return (
                <div 
                  key={notif.id} 
                  onClick={() => onNotificationClick(notif)}
                  className={`bg-white dark:bg-[#1e1e20] p-4 rounded-xl border flex items-start gap-4 transition-all cursor-pointer hover:shadow-lg ${isRead ? 'border-slate-100 opacity-60 dark:border-slate-800' : 'border-blue-200 dark:border-blue-900/50 shadow-md'}`}
                >
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${isRead ? 'bg-slate-50 dark:bg-[#28282a] border-slate-200 dark:border-[#444446]' : 'bg-blue-50 dark:bg-[#28282a] border-blue-100 dark:border-blue-900/50'}`}>
                      <Bell className={`w-5 h-5 ${isRead ? 'text-slate-400 dark:text-[#838383]' : 'text-blue-600 dark:text-[#8ab4f8]'}`} />
                    </div>
                    {notifStore && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase text-center min-w-[32px] ${
                        isHn
                          ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50'
                          : isHcm
                          ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-[#8ab4f8] dark:border-blue-900/50'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      }`}>
                        {notifStore}
                      </span>
                    )}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-1.5 gap-1 md:gap-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`font-bold text-base truncate ${isRead ? 'text-slate-500 dark:text-[#838383]' : 'text-slate-800 dark:text-[#e3e3e3]'}`}>{notif.title}</h4>
                        {notif.count && notif.count > 1 ? (
                          <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold px-2 py-0.5 rounded-full shrink-0">
                            {notif.count} tasks
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {notif.subtitle && (() => {
                      const parts = notif.subtitle.split(' - ');
                      const textColor = isRead ? 'text-blue-400 dark:text-blue-500/70' : 'text-blue-600 dark:text-[#8ab4f8]';
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
                    <p className={`text-sm bg-slate-50 dark:bg-[#1e1e20] p-2 rounded border border-slate-100 dark:border-[#333336] break-words ${isRead ? 'text-slate-500 dark:text-[#838383]' : 'text-slate-700 dark:text-[#c3c3c3]'}`}>
                      <span dangerouslySetInnerHTML={{ __html: notif.message }} />
                    </p>
                    {notif.action && (
                      <div className="flex gap-2 mt-3">
                        <button 
                          onClick={(e) => { e.stopPropagation(); onActionAgree?.(notif); }}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md shadow-sm transition-colors"
                        >
                          Agree
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onActionReject?.(notif); }}
                          className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-[#333336] dark:hover:bg-[#444446] dark:text-[#e3e3e3] text-xs font-bold rounded-md transition-colors"
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
                  <button onClick={(e) => {
                      e.stopPropagation();
                      onToggleRead(notif.id);
                    }} 
                    className="shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors"
                  >
                    {isRead ? <RotateCcw className="w-5 h-5 text-slate-400 dark:text-[#838383]" /> : <Check className="w-5 h-5 text-blue-500" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
