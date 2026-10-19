import { useEffect, useMemo } from "react";
import { useAppStore } from "../../store/useAppStore";
import { safeGetItemLocal, safeSetItemLocal } from "../../lib/storage";
import {
  enrichProjects,
  calculateActiveNotifications,
  getUserAllowedStores,
} from "../../lib/utils";
import { Project, Task, AppRole, PermissionModule, TabId } from "../../types";

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

  const globalEnrichedProjectsForNotifs = useMemo(() => {
    // Fast-path: When notification-specific arrays are empty, reuse already-computed enrichedProjects (0ms)
    if (allProjectsForNotifs.length === 0 && allTasksForNotifs.length === 0) {
      return enrichedProjects;
    }

    const baseProjects = allProjectsForNotifs.length > 0 ? allProjectsForNotifs : projects;
    const baseTasks = allTasksForNotifs.length > 0 ? allTasksForNotifs : tasks;
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
  }, [allProjectsForNotifs, allTasksForNotifs, projects, tasks, currentUser, enrichedProjects]);

  const globalFilteredTasksForNotifs = useMemo(() => {
    // Fast-path: Reuse filteredTasks when no separate notification arrays are active (0ms)
    if (allProjectsForNotifs.length === 0 && allTasksForNotifs.length === 0) {
      return filteredTasks;
    }

    const baseTasks = allTasksForNotifs.length > 0 ? allTasksForNotifs : tasks;
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
    allProjectsForNotifs,
    allTasksForNotifs,
    tasks,
    globalEnrichedProjectsForNotifs,
    currentUser,
    filteredTasks,
  ]);

  useEffect(() => {
    const notifs = calculateActiveNotifications(
      globalEnrichedProjectsForNotifs,
      globalFilteredTasksForNotifs,
      notificationRules,
      visibleDelegationGroups,
      currentUser.id,
      currentUser.username,
      currentUser
    );
    setActiveNotifications(notifs);

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
      let hasNew = false;

      notifs.forEach((notif) => {
        if (!notifiedIds.includes(notif.id)) {
          hasNew = true;
          notifiedIds.push(notif.id);

          if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready
              .then((registration) => {
                registration.showNotification(notif.title, {
                  body: notif.message,
                  icon: "/manifest-icon-192.maskable.png",
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
              body: notif.message,
              icon: "/manifest-icon-192.maskable.png",
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
  const unreadCount =
    currentUser.notification === false
      ? 0
      : activeNotifications.filter((n) => !readNotifs.includes(n.id)).length;

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
