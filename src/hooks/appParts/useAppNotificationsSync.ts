import { useEffect, useMemo } from "react";
import { useAppStore } from "../../store/useAppStore";
import { safeGetItemLocal, safeSetItemLocal } from "../../lib/storage";
import {
  enrichProjects,
  calculateActiveNotifications,
  getUserAllowedStores,
} from "../../lib/utils";
import { Project, Task, AppRole, PermissionModule, TabId } from "../../types";

function stripHtml(htmlStr: string): string {
  if (!htmlStr) return '';
  return htmlStr
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}


interface UseAppNotificationsSyncParams {
  enrichedProjects: Project[];
  filteredTasks: Task[];
  visibleDelegationGroups: any[];
}

export function useAppNotificationsSync({
  enrichedProjects,
  filteredTasks,
  visibleDelegationGroups,
}: UseAppNotificationsSyncParams) {
  const currentUser = useAppStore((state) => state.currentUser)!;
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const allProjectsForNotifs = useAppStore((state) => state.allProjectsForNotifs);
  const allTasksForNotifs = useAppStore((state) => state.allTasksForNotifs);
  const notificationRules = useAppStore((state) => state.notificationRules);
  const activeNotifications = useAppStore((state) => state.activeNotifications);
  const setActiveNotifications = useAppStore((state) => state.setActiveNotifications);
  const setNotificationFilterId = useAppStore((state) => state.setNotificationFilterId);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const permissionMatrix = useAppStore((state) => state.permissionMatrix);

  const mergedTasksForNotifs = useMemo(() => {
    if (allTasksForNotifs.length === 0 || allTasksForNotifs === tasks) return tasks;
    if (tasks.length === 0) return allTasksForNotifs;
    const map = new Map<string, Task>();
    for (let i = 0; i < allTasksForNotifs.length; i++) {
      const t = allTasksForNotifs[i];
      if (t?.id && !t.isDeleted) map.set(t.id, t);
    }
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t?.id) {
        if (t.isDeleted) map.delete(t.id);
        else map.set(t.id, t);
      }
    }
    return Array.from(map.values());
  }, [allTasksForNotifs, tasks]);

  const isSameAsActiveYearScope =
    (allProjectsForNotifs.length === 0 ||
      allProjectsForNotifs === projects ||
      allProjectsForNotifs.length === projects.length) &&
    (allTasksForNotifs.length === 0 ||
      allTasksForNotifs === tasks ||
      allTasksForNotifs.length === tasks.length);

  const globalEnrichedProjectsForNotifs = useMemo(() => {
    // Fast-path: When notification arrays match the active scope, reuse already-computed enrichedProjects (0ms)
    if (isSameAsActiveYearScope) {
      return enrichedProjects;
    }

    const baseProjects = allProjectsForNotifs.length > 0 ? allProjectsForNotifs : projects;
    const baseTasks = mergedTasksForNotifs;
    const enriched = enrichProjects(baseProjects, baseTasks);
    if (currentUser.role === "admin") return enriched;

    const userParties = currentUser.partyPermissions
      ? Object.keys(currentUser.partyPermissions)
          .filter((k) => currentUser.partyPermissions![k] && k.toLowerCase() !== "all")
          .map((k) => k.toLowerCase().trim())
      : [];
    const userPartySet = new Set(userParties);
    const username = String(currentUser.username || "").toLowerCase().trim();
    const userId = String(currentUser.id || "").toLowerCase().trim();

    const tasksByProject = new Map<string, Task[]>();
    baseTasks.forEach((t) => {
      const key = `${t.projectCode || ""}-${t.projectYear || ""}-${t.projectStore || ""}`;
      let list = tasksByProject.get(key);
      if (!list) {
        list = [];
        tasksByProject.set(key, list);
      }
      list.push(t);
    });

    const allowedStores = getUserAllowedStores(currentUser);

    return enriched.filter((p) => {
      const store = String(p.store || "").toUpperCase().trim();
      let hasStorePerm = allowedStores.includes(store);
      if (!hasStorePerm && (store === "HCM" || store === "HN")) {
        hasStorePerm = allowedStores.includes(store);
      } else if (!hasStorePerm && store !== "HCM" && store !== "HN") {
        hasStorePerm = currentUser.role === "admin" || allowedStores.length >= 2;
      }

      const loc = String(p.location || "").toLowerCase().trim();
      let permLoc = loc;
      if (["md-b1", "md-l1", "md-l2", "md-l3", "md-l4"].includes(permLoc)) {
        permLoc = permLoc.replace("md-", "");
      }
      const hasLocPerm =
        currentUser.locationPermissions?.all ||
        (currentUser.locationPermissions?.[permLoc] ?? false);

      if (!hasStorePerm || !hasLocPerm) {
        return false;
      }

      if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.["all"] !== true) {
        const pPartyList = String(p.party || "")
          .toLowerCase()
          .split(/[,;/+]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const pMatch = pPartyList.some(
          (party) => userPartySet.has(party) || party === username || party === userId
        );
        if (pMatch) return true;

        const pKey = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
        const groupTasks = tasksByProject.get(pKey) || [];
        return groupTasks.some((t) => {
          const tPartyList = String(t.party || "")
            .toLowerCase()
            .split(/[,;/+]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          return tPartyList.some(
            (party) => userPartySet.has(party) || party === username || party === userId
          );
        });
      }

      return true;
    });
  }, [
    isSameAsActiveYearScope,
    allProjectsForNotifs,
    mergedTasksForNotifs,
    projects,
    currentUser,
    enrichedProjects,
  ]);

  const globalFilteredTasksForNotifs = useMemo(() => {
    // Fast-path: Reuse filteredTasks when notification arrays match active scope (0ms)
    if (isSameAsActiveYearScope) {
      return filteredTasks;
    }

    const baseTasks = mergedTasksForNotifs;
    if (currentUser.role === "admin") return baseTasks;

    // O(1) Pre-indexed map of project key -> project party list (Rule 7)
    const projectPartyByKeyMap = new Map<string, string[]>();
    const visibleProjectKeys = new Set<string>();

    globalEnrichedProjectsForNotifs.forEach((p) => {
      const fullKey = `${String(p.code).trim()}_${String(p.year || "").trim()}_${String(p.store || "").trim()}`.toLowerCase();
      const codeOnlyKey = `${String(p.code).trim()}__`.toLowerCase();
      visibleProjectKeys.add(fullKey);
      const partyList = String(p.party || "")
        .toLowerCase()
        .split(/[,;/+]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      projectPartyByKeyMap.set(fullKey, partyList);
      if (!projectPartyByKeyMap.has(codeOnlyKey)) {
        projectPartyByKeyMap.set(codeOnlyKey, partyList);
      }
    });

    let visibleTasks = baseTasks.filter((t) => {
      const taskKey = `${String(t.projectCode).trim()}_${String(t.projectYear || "").trim()}_${String(t.projectStore || "").trim()}`.toLowerCase();
      return (
        visibleProjectKeys.has(taskKey) ||
        visibleProjectKeys.has(`${String(t.projectCode).trim()}__`.toLowerCase())
      );
    });

    if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.["all"] !== true) {
      const userParties = currentUser.partyPermissions
        ? Object.keys(currentUser.partyPermissions)
            .filter((k) => currentUser.partyPermissions![k] && k.toLowerCase() !== "all")
            .map((k) => k.toLowerCase().trim())
        : [];
      const userPartySet = new Set(userParties);
      const username = String(currentUser.username || "").toLowerCase().trim();
      const userId = String(currentUser.id || "").toLowerCase().trim();

      visibleTasks = visibleTasks.filter((t) => {
        const fullKey = `${String(t.projectCode).trim()}_${String(t.projectYear || "").trim()}_${String(t.projectStore || "").trim()}`.toLowerCase();
        const codeOnlyKey = `${String(t.projectCode).trim()}__`.toLowerCase();
        const projectPartyList =
          projectPartyByKeyMap.get(fullKey) || projectPartyByKeyMap.get(codeOnlyKey) || [];

        const pMatch = projectPartyList.some(
          (p) => userPartySet.has(p) || p === username || p === userId
        );
        if (pMatch) return true;

        const tPartyList = String(t.party || "")
          .toLowerCase()
          .split(/[,;/+]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        return tPartyList.some((p) => userPartySet.has(p) || p === username || p === userId);
      });
    }

    return visibleTasks;
  }, [
    isSameAsActiveYearScope,
    mergedTasksForNotifs,
    globalEnrichedProjectsForNotifs,
    currentUser,
    filteredTasks,
  ]);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | null = null;

    const timer = setTimeout(() => {
      const runNotificationCalc = () => {
        if (cancelled) return;
        const notifs = calculateActiveNotifications(
          globalEnrichedProjectsForNotifs,
          globalFilteredTasksForNotifs,
          notificationRules,
          visibleDelegationGroups,
          currentUser.id,
          currentUser.username,
          currentUser
        );
        if (cancelled) return;

        const prevNotifs = useAppStore.getState().activeNotifications;
        const isSameNotifs =
          prevNotifs.length === notifs.length &&
          prevNotifs.every(
            (p, idx) =>
              p.id === notifs[idx].id &&
              p.type === notifs[idx].type &&
              p.title === notifs[idx].title &&
              p.message === notifs[idx].message &&
              p.isRead === notifs[idx].isRead &&
              p.actionStatus === notifs[idx].actionStatus
          );

        if (!isSameNotifs) {
          setActiveNotifications(notifs);
        }

        if (currentUser.readNotifs && currentUser.readNotifs.length > 300) {
          const trimmed = currentUser.readNotifs.slice(-200);
          safeSetItemLocal(`taka_read_notifs_${currentUser.id}`, JSON.stringify(trimmed));
        }

        if (
          currentUser.id !== "guest" &&
          currentUser.notification !== false &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          const notifiedStr = safeGetItemLocal(`taka_notified_${currentUser.id}`);
          const notifiedIds: string[] = notifiedStr ? JSON.parse(notifiedStr) : [];
          const notifiedSet = new Set(notifiedIds);
          let hasNew = false;

          notifs.forEach((notif) => {
            if (!notifiedSet.has(notif.id)) {
              hasNew = true;
              notifiedSet.add(notif.id);
              notifiedIds.push(notif.id);

              const cleanBody = stripHtml(notif.message);
              const iconUrl = typeof window !== "undefined" ? `${window.location.origin}/icon-192.png` : "/icon-192.png";

              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.ready
                  .then((registration) => {
                    registration.showNotification(notif.title, {
                      body: cleanBody,
                      icon: iconUrl,
                      badge: iconUrl,
                      data: {
                        targetType: notif.targetType,
                        targetId: notif.targetId,
                        notificationId: notif.id,
                      },
                    });
                  })
                  .catch(console.error);
              } else {
                const n = new Notification(notif.title, {
                  body: cleanBody,
                  icon: iconUrl,
                  badge: iconUrl,
                  data: {
                    targetType: notif.targetType,
                    targetId: notif.targetId,
                    notificationId: notif.id,
                  },
                });
                n.onclick = (e) => {
                  e.preventDefault();
                  window.focus();
                  setNotificationFilterId(notif.id);
                  setActiveTab("notification");
                };
              }
            }
          });

          if (hasNew) {
            safeSetItemLocal(`taka_notified_${currentUser.id}`, JSON.stringify(notifiedIds));
          }
        }
      };

      if (typeof (window as any).requestIdleCallback === "function") {
        idleHandle = (window as any).requestIdleCallback(runNotificationCalc, { timeout: 2000 });
      } else {
        runNotificationCalc();
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (idleHandle !== null && typeof (window as any).cancelIdleCallback === "function") {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [
    globalEnrichedProjectsForNotifs,
    globalFilteredTasksForNotifs,
    notificationRules,
    visibleDelegationGroups,
    currentUser,
    setActiveNotifications,
    setNotificationFilterId,
    setActiveTab,
  ]);

  const readNotifs = currentUser.readNotifs || [];
  const readNotifsSet = useMemo(() => new Set(readNotifs), [readNotifs]);
  const unreadCount = useMemo(() => {
    if (currentUser.notification === false) return 0;
    let count = 0;
    for (let i = 0; i < activeNotifications.length; i++) {
      if (!readNotifsSet.has(activeNotifications[i].id)) count++;
    }
    return count;
  }, [currentUser.notification, activeNotifications, readNotifsSet]);

  useEffect(() => {
    if ("setAppBadge" in navigator) {
      if (unreadCount > 0) {
        (navigator as any).setAppBadge(unreadCount).catch(console.error);
      } else {
        (navigator as any).clearAppBadge().catch(console.error);
      }
    }
  }, [unreadCount]);

  const visibleTabs = useMemo(() => {
    const isAdmin = currentUser.role === "admin";
    const uRole = (
      currentUser.role === "admin"
        ? "admin"
        : (currentUser.role as string)?.toUpperCase() === "CP"
        ? "CP"
        : (currentUser.role as string)?.toLowerCase() === "manager"
        ? "Manager"
        : (currentUser.role as string)?.toLowerCase() === "staff"
        ? "Staff"
        : (currentUser.role as string)?.toLowerCase() === "external"
        ? "External"
        : currentUser.role
    ) as AppRole;
    const perms = permissionMatrix[uRole]?.See;
    const writePerms = permissionMatrix[uRole]?.Write;
    if (!isAdmin && !currentUser.canSee) return [];

    const canSeeModule = (module: PermissionModule) => {
      if (module === "taskDelegation") return isAdmin || !!perms?.[module];
      return isAdmin || !!perms?.[module] || !!writePerms?.[module];
    };

    const order: { id: TabId; hidden: boolean }[] = [
      { id: "calendar", hidden: !(canSeeModule("calendar") || canSeeModule("report")) },
      { id: "taskDelegationCalendar", hidden: !canSeeModule("taskDelegation") },
      { id: "general", hidden: !canSeeModule("general") },
      { id: "taskDelegation", hidden: !canSeeModule("taskDelegation") },
      { id: "detail", hidden: !canSeeModule("detail") },
      { id: "gantt", hidden: !canSeeModule("report") },
      { id: "summary", hidden: !(canSeeModule("summary") || canSeeModule("report")) },
      { id: "layout", hidden: !canSeeModule("layout") },
      { id: "budget", hidden: !canSeeModule("budget") },
      { id: "cost", hidden: !canSeeModule("costDetail") },
      { id: "picture_mapping", hidden: !canSeeModule("pictureMapping") },
      { id: "csv_export", hidden: !canSeeModule("importCsv") },
      { id: "accControl", hidden: false },
      { id: "notification", hidden: !isAdmin && currentUser.notification === false },
      { id: "setting", hidden: currentUser.role === "guest" },
    ];
    return order.filter((t) => !t.hidden).map((t) => t.id);
  }, [currentUser, permissionMatrix]);

  return {
    readNotifs,
    unreadCount,
    visibleTabs,
  };
}
