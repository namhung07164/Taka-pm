import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { getUserAllowedStores } from '../../lib/utils';
import { ActiveNotification } from '../../types';
import {
  NotificationStatusFilter,
  NotificationTypeFilter,
  NotificationStoreFilter,
  NotificationPriorityFilter,
  NotificationAssigneeFilter,
} from './notificationTypes';
import { safeGetItemLocal } from '../../lib/storage';

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
  const [priorityFilter, setPriorityFilter] = useState<NotificationPriorityFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<NotificationAssigneeFilter>('all');
  const [snoozedMap, setSnoozedMap] = useState<Record<string, number>>(() => {
    try {
      const raw = safeGetItemLocal('taka_snoozed_notifs');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Listen to external snooze changes
  useEffect(() => {
    const handleSnoozeChange = () => {
      try {
        const raw = safeGetItemLocal('taka_snoozed_notifs');
        setSnoozedMap(raw ? JSON.parse(raw) : {});
      } catch {
        setSnoozedMap({});
      }
    };
    window.addEventListener('taka_snoozed_notifs_changed', handleSnoozeChange);
    return () => {
      window.removeEventListener('taka_snoozed_notifs_changed', handleSnoozeChange);
    };
  }, []);

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

  const unreadCriticalCount = useMemo(
    () =>
      activeNotifications.filter(
        (n) => n.priority === 'critical' && !readNotifs.includes(n.id)
      ).length,
    [activeNotifications, readNotifs]
  );

  const unreadUrgentCount = useMemo(
    () =>
      activeNotifications.filter(
        (n) => n.priority === 'urgent' && !readNotifs.includes(n.id)
      ).length,
    [activeNotifications, readNotifs]
  );

  const unreadActionCount = useMemo(
    () =>
      activeNotifications.filter(
        (n) => n.priority === 'action_required' && !readNotifs.includes(n.id)
      ).length,
    [activeNotifications, readNotifs]
  );

  const unreadAssignedToMeCount = useMemo(
    () =>
      activeNotifications.filter(
        (n) => n.isAssignedToMe && !readNotifs.includes(n.id)
      ).length,
    [activeNotifications, readNotifs]
  );

  const snoozedCount = useMemo(() => {
    const now = Date.now();
    return Object.values(snoozedMap).filter((ts) => ts > now).length;
  }, [snoozedMap]);

  const filteredNotifications = useMemo(() => {
    let result = activeNotifications;
    if (filterId) {
      result = activeNotifications.filter((notif) => notif.id === filterId);
    } else {
      const now = Date.now();
      result = activeNotifications.filter((notif) => {
        // Skip snoozed notifications
        const snoozedUntil = snoozedMap[notif.id];
        if (snoozedUntil && snoozedUntil > now) {
          return false;
        }

        const isRead = readNotifs.includes(notif.id);

        if (statusFilter === 'read' && !isRead) return false;
        if (statusFilter === 'unread' && isRead) return false;

        if (typeFilter !== 'all' && notif.targetType !== typeFilter) return false;

        if (priorityFilter !== 'all' && notif.priority !== priorityFilter) return false;

        if (assigneeFilter === 'assigned_to_me' && !notif.isAssignedToMe) return false;

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
    priorityFilter,
    assigneeFilter,
    storeFilter,
    filterId,
    snoozedMap,
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
    priorityFilter,
    setPriorityFilter,
    assigneeFilter,
    setAssigneeFilter,
    storeFilter,
    setStoreFilter,
    unreadProjectCount,
    unreadTaskCount,
    unreadDelegationCount,
    unreadHcmCount,
    unreadHnCount,
    unreadCriticalCount,
    unreadUrgentCount,
    unreadActionCount,
    unreadAssignedToMeCount,
    snoozedCount,
    filteredNotifications,
    tasks,
    projects,
    delegationGroups,
  };
}
