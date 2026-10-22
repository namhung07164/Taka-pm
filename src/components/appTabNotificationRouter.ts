import { useAppStore } from "../store/useAppStore";
import { ActiveNotification, AppUser, Project, TabId, Task } from "../types";
import { findProjectLayoutUnit } from "../lib/layoutUnitFinder";

export interface RouteNotificationClickParams {
  notif: ActiveNotification;
  notifActions: any;
  projects: Project[];
  tasks: Task[];
  currentUser: AppUser;
  userRole: any;
  permissionMatrix: any;
  globalYearFilter: string;
  setGlobalYearFilter: (val: string) => void;
  setGlobalStoreFilter: (val: string) => void;
  setLayoutTabFilters: (val: any) => void;
  setNotificationFilterId: (val: string | null) => void;
  handleTabChange: (tab: TabId) => void;
  executeDeepLinkRef: React.MutableRefObject<((type: string, id: string | number, extra?: any) => void) | null>;
}

export function routeNotificationItemClick({
  notif,
  notifActions,
  projects,
  tasks,
  currentUser,
  userRole,
  permissionMatrix,
  globalYearFilter,
  setGlobalYearFilter,
  setGlobalStoreFilter,
  setLayoutTabFilters,
  setNotificationFilterId,
  handleTabChange,
  executeDeepLinkRef,
}: RouteNotificationClickParams): void {
  notifActions.onNotificationClick(notif);

  if (!notif.targetId || !notif.targetType) return;

  if ((notif.targetType as string) === "notification") {
    setNotificationFilterId(String(notif.targetId));
    handleTabChange("notification");
    return;
  }

  const storeState = useAppStore.getState();
  const projMap = new Map<string, any>();
  (storeState.allProjectsForNotifs || []).forEach((p: any) => {
    if (p && p.id) projMap.set(String(p.id), p);
  });
  (projects || []).forEach((p: any) => {
    if (p && p.id) projMap.set(String(p.id), p);
  });
  const combinedProjects = Array.from(projMap.values());

  const taskMap = new Map<string, any>();
  (storeState.allTasksForNotifs || []).forEach((t: any) => {
    if (t && t.id) taskMap.set(String(t.id), t);
  });
  (tasks || []).forEach((t: any) => {
    if (t && t.id) taskMap.set(String(t.id), t);
  });
  const combinedTasks = Array.from(taskMap.values());

  const canSeeLayout =
    currentUser.role === "admin" || !!permissionMatrix[userRole]?.See?.layout;
  const layoutMatch = findProjectLayoutUnit(notif, combinedProjects, combinedTasks);
  const openTarget = (notif as any)._openTarget as "layout" | "detail" | undefined;

  if (canSeeLayout && layoutMatch && openTarget === "layout") {
    const targetYear =
      layoutMatch.year ||
      (layoutMatch.project?.year
        ? String(layoutMatch.project.year)
        : notif.projectYear
        ? String(notif.projectYear)
        : "");
    if (targetYear && targetYear !== globalYearFilter && targetYear !== "all") {
      setGlobalYearFilter(targetYear);
    }
    const targetStore = String(
      notif.projectStore || layoutMatch.project?.store || layoutMatch.store || "HCM"
    )
      .trim()
      .toUpperCase();
    if (targetStore && targetStore !== "ALL") {
      setGlobalStoreFilter(targetStore);
    }
    const targetLocation = String(
      notif.location || layoutMatch.project?.location || layoutMatch.location || "L1"
    )
      .trim()
      .toUpperCase();
    if (targetLocation && targetLocation !== "ALL") {
      useAppStore.getState().setGlobalLocationFilter([targetLocation]);
    }

    const targetUnitCode =
      layoutMatch.unitCode ||
      layoutMatch.project?.code ||
      notif.projectCode ||
      (notif.title && notif.title.includes(" - ")
        ? notif.title.split(" - ")[0].trim()
        : "");

    setLayoutTabFilters({
      store: targetStore,
      location: targetLocation,
      projectCode: targetUnitCode,
      sourceTaskId: layoutMatch.task?.id,
      _ts: Date.now(),
    } as any);

    handleTabChange("layout");
    return;
  }

  const matchedProject = layoutMatch?.project || null;
  const matchedTask = layoutMatch?.task || null;
  const isCommentOrDelegation =
    !!layoutMatch?.isComment ||
    notif.category === "mention" ||
    notif.ruleId === "mention-notification" ||
    notif.targetType === "task_delegation";

  const resolvedStore = String(
    notif.projectStore ||
      matchedProject?.store ||
      matchedTask?.projectStore ||
      layoutMatch?.store ||
      ""
  )
    .trim()
    .toUpperCase();
  const resolvedYear = String(
    notif.projectYear ||
      matchedProject?.year ||
      matchedTask?.projectYear ||
      layoutMatch?.year ||
      ""
  ).trim();
  const resolvedCode =
    notif.projectCode ||
    matchedProject?.code ||
    matchedTask?.projectCode ||
    layoutMatch?.unitCode ||
    "";
  const resolvedProjectId =
    notif.projectId || matchedProject?.id || matchedTask?.projectId || "";

  const effectiveTargetType =
    notif.targetType === "task_delegation"
      ? matchedTask
        ? "task"
        : "project"
      : notif.targetType;
  const effectiveTargetId =
    notif.targetType === "task_delegation"
      ? matchedTask?.id || matchedProject?.id || notif.targetId
      : notif.targetId;

  executeDeepLinkRef.current?.(effectiveTargetType, effectiveTargetId, {
    store: resolvedStore || undefined,
    year: resolvedYear || undefined,
    code: resolvedCode || undefined,
    projectId: resolvedProjectId || undefined,
    openChat: isCommentOrDelegation,
  });
}
