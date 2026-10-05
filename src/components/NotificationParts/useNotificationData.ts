import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { getUserAllowedStores } from '../../lib/utils';
import { ActiveNotification } from '../../types';
import {
  NotificationStatusFilter,
  NotificationTypeFilter,
  NotificationStoreFilter,
} from './notificationTypes';

interface UseNotificationDataProps {
  activeNotifications: ActiveNotification[];
  readNotifs: string[];
  filterId?: string | null;
  initialStatusFilter?: NotificationStatusFilter;
}

export function useNotificationData({
  activeNotifications,
  readNotifs,
  filterId,
  initialStatusFilter = 'unread',
}: UseNotificationDataProps) {
  const {
    enrichedProjects: projects,
    filteredTasks: tasks,
    visibleDelegationGroups: delegationGroups,
  } = useEnrichedData();

  const currentUser = useAppStore((state) => state.currentUser)!;
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);

  const [statusFilter, setStatusFilter] = useState<NotificationStatusFilter>(initialStatusFilter);
  const [typeFilter, setTypeFilter] = useState<NotificationTypeFilter>('all');
  const [storeFilter, setStoreFilter] = useState<NotificationStoreFilter>(() => {
    const allowed = getUserAllowedStores(currentUser);
    if (globalStoreFilter === 'HCM' || globalStoreFilter === 'HN') {
      if (allowed.includes(globalStoreFilter)) return globalStoreFilter;
    }
    if (allowed.length === 1) return allowed[0] as 'HCM' | 'HN';
    return 'all';
  });

  // Keep store filter in sync if user changes global store selector
  useEffect(() => {
    if (globalStoreFilter === 'HCM' || globalStoreFilter === 'HN') {
      if (allowedStores.includes(globalStoreFilter)) {
        setStoreFilter(globalStoreFilter);
      }
    }
  }, [globalStoreFilter, allowedStores]);

  const unreadProjectCount = useMemo(
    () =>
      activeNotifications.filter(
        (n) => n.targetType === 'project' && !readNotifs.includes(n.id)
      ).length,
    [activeNotifications, readNotifs]
  );

  const unreadTaskCount = useMemo(
    () =>
      activeNotifications.filter(
        (n) => n.targetType === 'task' && !readNotifs.includes(n.id)
      ).length,
    [activeNotifications, readNotifs]
  );

  const unreadDelegationCount = useMemo(
    () =>
      activeNotifications.filter(
        (n) => n.targetType === 'task_delegation' && !readNotifs.includes(n.id)
      ).length,
    [activeNotifications, readNotifs]
  );

  const unreadHcmCount = useMemo(
    () =>
      activeNotifications.filter((n) => {
        if (readNotifs.includes(n.id)) return false;
        const s = (
          n.projectStore ||
          (n.targetType === 'task'
            ? tasks.find((t) => String(t.id) === String(n.targetId))?.projectStore
            : '') ||
          (n.targetType === 'project'
            ? projects.find(
                (p) =>
                  (n.targetId &&
                    (String(p.id) === String(n.targetId) ||
                      String(p.no) === String(n.targetId))) ||
                  (n.projectCode && p.code === n.projectCode)
              )?.store
            : '') ||
          (n.targetType === 'task_delegation'
            ? delegationGroups.find((g) => g.id === n.targetId)?.projectStore
            : '') ||
          ''
        )
          .trim()
          .toUpperCase();
        return s === 'HCM';
      }).length,
    [activeNotifications, readNotifs, tasks, projects, delegationGroups]
  );

  const unreadHnCount = useMemo(
    () =>
      activeNotifications.filter((n) => {
        if (readNotifs.includes(n.id)) return false;
        const s = (
          n.projectStore ||
          (n.targetType === 'task'
            ? tasks.find((t) => String(t.id) === String(n.targetId))?.projectStore
            : '') ||
          (n.targetType === 'project'
            ? projects.find(
                (p) =>
                  (n.targetId &&
                    (String(p.id) === String(n.targetId) ||
                      String(p.no) === String(n.targetId))) ||
                  (n.projectCode && p.code === n.projectCode)
              )?.store
            : '') ||
          (n.targetType === 'task_delegation'
            ? delegationGroups.find((g) => g.id === n.targetId)?.projectStore
            : '') ||
          ''
        )
          .trim()
          .toUpperCase();
        return s === 'HN';
      }).length,
    [activeNotifications, readNotifs, tasks, projects, delegationGroups]
  );

  const filteredNotifications = useMemo(() => {
    let result = activeNotifications;
    if (filterId) {
      result = activeNotifications.filter((notif) => notif.id === filterId);
    } else {
      result = activeNotifications.filter((notif) => {
        const isRead = readNotifs.includes(notif.id);

        if (statusFilter === 'read' && !isRead) return false;
        if (statusFilter === 'unread' && isRead) return false;

        if (typeFilter !== 'all' && notif.targetType !== typeFilter) return false;

        if (storeFilter !== 'all') {
          const nStore = (
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
          )
            .trim()
            .toUpperCase();
          if (nStore && nStore !== storeFilter.toUpperCase()) return false;
        }

        return true;
      });
    }

    return result.sort((a, b) => b.generatedAt - a.generatedAt);
  }, [
    activeNotifications,
    readNotifs,
    statusFilter,
    typeFilter,
    storeFilter,
    filterId,
    tasks,
    projects,
    delegationGroups,
  ]);

  return {
    allowedStores,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    storeFilter,
    setStoreFilter,
    unreadProjectCount,
    unreadTaskCount,
    unreadDelegationCount,
    unreadHcmCount,
    unreadHnCount,
    filteredNotifications,
    tasks,
    projects,
    delegationGroups,
  };
}
