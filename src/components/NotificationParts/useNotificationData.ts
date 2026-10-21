import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  NotificationCategoryFilter,
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
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
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

  // Strict composite store resolver for notifications
  const resolveNotifStore = useCallback(
    (n: ActiveNotification): string => {
      if (n.projectStore) return String(n.projectStore).trim().toUpperCase();
      if (n.projectId) {
        const byId = projects.find((p) => String(p.id) === String(n.projectId));
        if (byId?.store) return String(byId.store).trim().toUpperCase();
      }
      if (n.targetType === 'task') {
        const t = tasks.find((tk) => String(tk.id) === String(n.targetId));
        if (t?.projectStore) return String(t.projectStore).trim().toUpperCase();
      }
      if (n.targetType === 'project') {
        const p = projects.find(
          (pr) =>
            String(pr.id) === String(n.targetId) || String(pr.no) === String(n.targetId)
        );
        if (p?.store) return String(p.store).trim().toUpperCase();
      }
      if (n.targetType === 'task_delegation') {
        const g = delegationGroups.find((dg) => String(dg.id) === String(n.targetId));
        if (g?.projectStore) return String(g.projectStore).trim().toUpperCase();
      }
      return '';
    },
    [projects, tasks, delegationGroups]
  );

  const resolveNotifCategory = useCallback((n: ActiveNotification): string => {
    if (n.category) return n.category;
    if (n.ruleId === 'mention-notification') return 'mention';
    if (n.action === 'cross_year_rollover' || n.ruleId === 'cross-year-rollover') return 'rollover';
    if (n.targetType === 'task_delegation') return 'delegation';
    if (n.diffMs < 0) return 'overdue';
    return 'due_soon';
  }, []);

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
      activeNotifications.filter(
        (n) => !readNotifs.includes(n.id) && resolveNotifStore(n) === 'HCM'
      ).length,
    [activeNotifications, readNotifs, resolveNotifStore]
  );

  const unreadHnCount = useMemo(
    () =>
      activeNotifications.filter(
        (n) => !readNotifs.includes(n.id) && resolveNotifStore(n) === 'HN'
      ).length,
    [activeNotifications, readNotifs, resolveNotifStore]
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

  const categoryCounts = useMemo(() => {
    const counts = {
      all: 0,
      overdue: 0,
      due_soon: 0,
      mention: 0,
      delegation: 0,
      rollover: 0,
      milestone: 0,
    };
    activeNotifications.forEach((n) => {
      if (readNotifs.includes(n.id)) return;
      counts.all++;
      const cat = resolveNotifCategory(n) as keyof typeof counts;
      if (cat in counts) counts[cat]++;
    });
    return counts;
  }, [activeNotifications, readNotifs, resolveNotifCategory]);

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
      const q = searchQuery.trim().toLowerCase();

      result = activeNotifications.filter((notif) => {
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

        if (categoryFilter !== 'all') {
          const cat = resolveNotifCategory(notif);
          if (cat !== categoryFilter) return false;
        }

        if (storeFilter !== 'all') {
          const nStore = resolveNotifStore(notif);
          if (nStore && nStore !== storeFilter.toUpperCase()) return false;
        }

        if (q) {
          const haystack = [
            notif.title,
            notif.subtitle,
            notif.message,
            notif.projectCode,
            notif.projectName,
            notif.taskName,
            notif.projectStore,
            notif.location,
            notif.party,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }

        return true;
      });
    }

    const priorityRank: Record<string, number> = {
      critical: 0,
      action_required: 1,
      urgent: 2,
      normal: 3,
    };

    return [...result].sort((a, b) => {
      const aRead = readNotifs.includes(a.id) ? 1 : 0;
      const bRead = readNotifs.includes(b.id) ? 1 : 0;
      if (aRead !== bRead) return aRead - bRead;

      const aPrio = priorityRank[a.priority || 'normal'] ?? 3;
      const bPrio = priorityRank[b.priority || 'normal'] ?? 3;
      if (aPrio !== bPrio) return aPrio - bPrio;

      // Sort by schedule urgency (most overdue or closest deadline first)
      if (a.diffMs !== b.diffMs) return a.diffMs - b.diffMs;

      return b.generatedAt - a.generatedAt;
    });
  }, [
    activeNotifications,
    readNotifs,
    statusFilter,
    typeFilter,
    priorityFilter,
    assigneeFilter,
    categoryFilter,
    storeFilter,
    searchQuery,
    filterId,
    snoozedMap,
    resolveNotifStore,
    resolveNotifCategory,
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
    categoryFilter,
    setCategoryFilter,
    searchQuery,
    setSearchQuery,
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
    categoryCounts,
    snoozedCount,
    filteredNotifications,
    tasks,
    projects,
    delegationGroups,
  };
}
