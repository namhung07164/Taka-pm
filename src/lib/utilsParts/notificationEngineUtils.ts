import {
  Project,
  Task,
  NotificationRule,
  ActiveNotification,
  NotificationPriority,
  NotificationCategory,
  DelegationGroup,
} from "../../types";
import {
  evaluateDelegationNotificationRule,
  evaluateProjectOrTaskNotificationRule,
} from "./notificationRuleHelpers";

export function calculateActiveNotifications(
  projects: Project[],
  tasks: Task[],
  rules: NotificationRule[],
  delegationGroups: DelegationGroup[] = [],
  currentUserId?: string,
  currentUserUsername?: string,
  currentUserObj?: any,
): ActiveNotification[] {
  const now = new Date();

  const isMatchUserParty = (partyStr?: string) => {
    if (!partyStr) return false;
    const rawParts = String(partyStr)
      .split(/[,;/+]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const uname = currentUserUsername ? currentUserUsername.trim().toLowerCase() : "";
    const uFullName = currentUserObj?.name ? String(currentUserObj.name).trim().toLowerCase() : "";

    return rawParts.some((part) => {
      const pLower = part.toLowerCase();
      if (uname && pLower === uname) return true;
      if (uFullName && pLower === uFullName) return true;
      if (currentUserObj?.partyPermissions) {
        if (currentUserObj.partyPermissions[part] || currentUserObj.partyPermissions[pLower] || currentUserObj.partyPermissions[part.toUpperCase()]) {
          return true;
        }
      }
      return false;
    });
  };

  const notifications: ActiveNotification[] = [];
  const currentActualYear = now.getFullYear();

  // O(1) Pre-indexing for projects by projectId (#1), code_year_store (#2), code_store (#3), and code (#4) (Rule 7 & Rule 16.1)
  const projectByIdMap = new Map<string, Project>();
  const projectByKeyMap = new Map<string, Project>();
  const projectByCodeStoreMap = new Map<string, Project>();
  const projectByCodeMap = new Map<string, Project>();

  projects.forEach((p) => {
    if (p.isDeleted) return;
    if (p.id) {
      projectByIdMap.set(String(p.id).trim(), p);
    }
    const pCode = String(p.code || "").trim().toLowerCase();
    if (!pCode) return;
    const pStore = String(p.store || "HCM").trim().toUpperCase();
    const pYear = String(p.year || "").trim();

    if (!projectByCodeMap.has(pCode)) {
      projectByCodeMap.set(pCode, p);
    }
    const csKey = `${pCode}_${pStore}`;
    if (!projectByCodeStoreMap.has(csKey)) {
      projectByCodeStoreMap.set(csKey, p);
    }
    if (pYear) {
      projectByKeyMap.set(`${pCode}_${pYear}_${pStore}`, p);
    }
  });

  const findParentProject = (
    code?: string,
    year?: string | number,
    store?: string,
    projectId?: string
  ): Project | undefined => {
    // Priority #1: Exact Project ID match (Rule 16.1)
    if (projectId) {
      const pidStr = String(projectId).trim();
      if (pidStr && projectByIdMap.has(pidStr)) {
        return projectByIdMap.get(pidStr);
      }
    }

    const c = String(code || "").trim().toLowerCase();
    if (!c) return undefined;
    const s = store ? String(store).trim().toUpperCase() : "";
    const y = year !== undefined && year !== null ? String(year).trim() : "";

    // Priority #2: Composite code + year + store
    if (y && s && projectByKeyMap.has(`${c}_${y}_${s}`)) {
      return projectByKeyMap.get(`${c}_${y}_${s}`);
    }
    // Priority #3: Composite code + store
    if (s && projectByCodeStoreMap.has(`${c}_${s}`)) {
      return projectByCodeStoreMap.get(`${c}_${s}`);
    }
    // Priority #4: Legacy fallback when store was not specified on old record
    if (y && !s) {
      if (projectByKeyMap.has(`${c}_${y}_HCM`)) return projectByKeyMap.get(`${c}_${y}_HCM`);
      if (projectByKeyMap.has(`${c}_${y}_HN`)) return projectByKeyMap.get(`${c}_${y}_HN`);
    }
    if (!y && !s) {
      return projectByCodeMap.get(c);
    }
    return undefined;
  };

  // Consolidate tasks: combining explicit `tasks` array with embedded `project.taskSummaries`
  const taskMap = new Map<string, Task>();

  projects.forEach((p) => {
    if (p.isDeleted) return;
    if (p.taskSummaries && Array.isArray(p.taskSummaries)) {
      p.taskSummaries.forEach((ts, idx) => {
        const pCode = p.code || "";
        const pStore = String(p.store || "HCM").toUpperCase().trim();
        const pYear = String(p.year || "").trim();
        const tsId = ts.id || `ts_${p.id || pCode}_${pStore}_${pYear}_${idx}`;

        taskMap.set(tsId, {
          id: tsId,
          projectId: p.id,
          name: ts.name || `Task ${idx + 1}`,
          start: ts.start || "",
          finish: ts.finish || "",
          projectCode: pCode,
          projectStore: pStore,
          projectYear: pYear,
          location: p.location || "",
          party: ts.party || p.party || "",
          runningStatus: ts.runningStatus || (ts as any).status || "On process",
          duration: ts.duration || "",
          parentTaskId: ts.parentTaskId,
          taskCodePhu: ts.taskCodePhu,
          comments: ts.comments || [],
          ...ts,
        } as Task);
      });
    }
  });

  tasks.forEach((t) => {
    if (t.isDeleted) {
      if (t.id) taskMap.delete(t.id);
      return;
    }
    if (t.id) {
      const existing = taskMap.get(t.id);
      taskMap.set(t.id, {
        ...existing,
        ...t,
        projectId: t.projectId || existing?.projectId,
        projectStore: t.projectStore || existing?.projectStore,
        projectYear: t.projectYear || existing?.projectYear,
        location: t.location || existing?.location,
      });
    }
  });

  const effectiveTasks = Array.from(taskMap.values());

  // Generate notifications for Cross-Year Rollover (only active/pending tasks, skip completed & canceled)
  effectiveTasks.forEach((task) => {
    if (task.isDeleted) return;
    const tStatus = String(task.runningStatus || (task as any).status || "").toLowerCase();
    const isCompleted = tStatus === "completed" || tStatus === "canceled";
    if (!isCompleted && task.projectYear && Number(task.projectYear) < currentActualYear) {
      const project = findParentProject(task.projectCode, task.projectYear, task.projectStore, task.projectId);
      const pStatus = String(project?.computedStatus || "").toLowerCase();
      const mdStatus = String(project?.mdStatus || "").toLowerCase();
      if (
        project?.isDeleted ||
        pStatus === "completed" ||
        pStatus === "canceled" ||
        mdStatus === "canceled" ||
        mdStatus === "rejected"
      ) {
        return;
      }

      const pCode = String(task.projectCode || project?.code || "").trim();
      const pName = String(project?.name || "Project").trim();
      const tName = String(task.name || "Task").trim();
      const subtitleStr = project
        ? `${pCode} (${pName}) • Year ${task.projectYear}`
        : `${pCode} • Year ${task.projectYear}`.trim();

      const pStore = String(task.projectStore || project?.store || "HCM").toUpperCase().trim();
      const pYear = String(task.projectYear || project?.year || "").trim();
      const pLoc = String(task.location || project?.location || "").trim();

      const isMyTask = isMatchUserParty(task.party);
      notifications.push({
        id: `rollover_task_${pStore}_${pYear}_${task.id}`,
        title: `${pCode} - ${pName} - ${tName}`,
        subtitle: subtitleStr,
        message: `Task from <strong>${task.projectYear}</strong> is still active. Roll over to <strong>${currentActualYear}</strong>?`,
        dateStr: now.toISOString(),
        diffMs: 0,
        generatedAt: now.getTime(),
        targetType: "task",
        targetId: task.id,
        projectId: task.projectId || project?.id,
        projectCode: pCode,
        projectName: pName,
        taskName: tName,
        projectStore: pStore,
        projectYear: pYear,
        location: pLoc,
        category: "rollover",
        action: "cross_year_rollover",
        actionData: { taskId: task.id, newYear: currentActualYear },
        priority: "action_required",
        isAssignedToMe: isMyTask,
        party: task.party || "",
      });
    }
  });

  // Generate notifications for @mentions
  if (currentUserId) {
    effectiveTasks.forEach((task) => {
      if (task.isDeleted) return;
      const project = findParentProject(task.projectCode, task.projectYear, task.projectStore, task.projectId);
      if (task.comments && task.comments.length > 0) {
        task.comments.forEach((comment) => {
          if (comment.mentions && comment.mentions.includes(currentUserId)) {
            const commentTime = new Date(comment.createdAt).getTime();
            const diffMs = commentTime - now.getTime();
            if (diffMs >= -30 * 24 * 60 * 60 * 1000) {
              const pCode = String(task.projectCode || project?.code || "").trim();
              const pName = String(project?.name || "Project").trim();
              const tName = String(task.name || "Task").trim();
              const subtitleStr = project
                ? `${pCode} - ${pName} • ${tName}`
                : `${pCode} ${tName}`.trim();
              const pStore = String(task.projectStore || project?.store || "HCM").toUpperCase().trim();
              const pYear = String(task.projectYear || project?.year || "").trim();
              const pLoc = String(task.location || project?.location || "").trim();
              notifications.push({
                id: `mention_${pStore}_${comment.id}`,
                title: `${pCode} - Mentioned in Task: ${tName}`,
                subtitle: subtitleStr,
                message: `${comment.userName ? `<strong>${comment.userName}:</strong> ` : ""}"${comment.text}"`,
                dateStr: comment.createdAt,
                diffMs,
                generatedAt: commentTime,
                targetType: "task",
                targetId: task.id,
                projectId: task.projectId || project?.id,
                projectCode: pCode,
                projectName: pName,
                taskName: tName,
                projectStore: pStore,
                projectYear: pYear,
                location: pLoc,
                category: "mention",
                priority: "action_required",
                isAssignedToMe: true,
                party: task.party || "",
              });
            }
          }
        });
      }
    });

    projects.forEach((project) => {
      if (project.isDeleted) return;
      if (project.comments && project.comments.length > 0) {
        project.comments.forEach((comment) => {
          if (comment.mentions && comment.mentions.includes(currentUserId)) {
            const commentTime = new Date(comment.createdAt).getTime();
            const diffMs = commentTime - now.getTime();
            if (diffMs >= -30 * 24 * 60 * 60 * 1000) {
              const pCode = String(project.code || "").trim();
              const pName = String(project.name || "Project").trim();
              const pStore = String(project.store || "HCM").toUpperCase().trim();
              const pYear = String(project.year || "").trim();
              const pLoc = String(project.location || "").trim();
              const subtitleStr = `${pCode} - ${pName}${pLoc ? ` • Floor ${pLoc}` : ""}`;
              notifications.push({
                id: `mention_proj_${pStore}_${comment.id}`,
                title: `${pCode} - Mentioned in Project: ${pName}`,
                subtitle: subtitleStr,
                message: `${comment.userName ? `<strong>${comment.userName}:</strong> ` : ""}"${comment.text}"`,
                dateStr: comment.createdAt,
                diffMs,
                generatedAt: commentTime,
                targetType: "project",
                targetId: project.id || project.no,
                projectId: project.id ? String(project.id) : undefined,
                projectCode: pCode,
                projectName: pName,
                projectStore: pStore,
                projectYear: pYear,
                location: pLoc,
                category: "mention",
                priority: "action_required",
                isAssignedToMe: true,
                party: project.party || "",
              });
            }
          }
        });
      }
    });
  }

  rules.forEach((rule) => {
    if (rule.target === "task_delegation") {
      evaluateDelegationNotificationRule(
        rule,
        delegationGroups,
        projects,
        tasks,
        now,
        currentUserUsername,
        isMatchUserParty,
        notifications
      );
      return;
    }

    evaluateProjectOrTaskNotificationRule(
      rule,
      projects,
      effectiveTasks,
      now,
      findParentProject,
      isMatchUserParty,
      notifications
    );
  });

  // Smart Grouping / Batching: Group task deadline notifications by composite Project key (projectId + code + store + year)
  const batchedNotifications: ActiveNotification[] = [];
  const taskNotifsByProject = new Map<string, ActiveNotification[]>();
  const nonBatchedNotifs: ActiveNotification[] = [];

  notifications.forEach((notif) => {
    if (
      notif.targetType === "task" &&
      notif.category !== "mention" &&
      notif.action !== "cross_year_rollover"
    ) {
      const pId = notif.projectId || "";
      const pCode = notif.projectCode || (notif.title.split(" - ")[0] || "").trim();
      const pStore = String(notif.projectStore || "HCM").toUpperCase().trim();
      const pYear = String(notif.projectYear || "").trim();
      const groupKey = `${pId || pCode}__${pCode}__${pStore}__${pYear}`;
      if (!taskNotifsByProject.has(groupKey)) {
        taskNotifsByProject.set(groupKey, []);
      }
      taskNotifsByProject.get(groupKey)!.push(notif);
    } else {
      nonBatchedNotifs.push(notif);
    }
  });

  taskNotifsByProject.forEach((items, groupKey) => {
    if (items.length > 1) {
      // Sort sub-items by urgency (most overdue / urgent first)
      const sortedItems = [...items].sort((a, b) => a.diffMs - b.diffMs);
      const first = sortedItems[0];
      const [, keyCode, keyStore, keyYear] = groupKey.split("__");
      const pCode = first.projectCode || keyCode || "";
      const pStore = first.projectStore || keyStore || "HCM";
      const pYear = String(first.projectYear || keyYear || "");
      const project = findParentProject(pCode, pYear, pStore, first.projectId);
      const projName = project?.name || first.projectName || (first.title.split(" - ")[1] || "").trim() || "Project";
      const projId = project?.id ? String(project.id) : first.projectId;
      const projLoc = project?.location || first.location || "";

      const urgentDiff = Math.min(...sortedItems.map((i) => i.diffMs));
      const latestGen = Math.max(...sortedItems.map((i) => i.generatedAt));
      const earliestDateStr = first.dateStr;

      const summaryList = sortedItems.map((i) => {
        const tLabel = i.taskName || i.title.split(" - ").slice(2).join(" - ") || i.title;
        return `• <strong>${tLabel}</strong>: ${i.message}`;
      });

      const overdueCount = sortedItems.filter((i) => i.diffMs < 0).length;
      const headerSummary =
        overdueCount > 0
          ? `<strong>${sortedItems.length} tasks</strong> require attention (<span class="text-rose-600 dark:text-rose-400 font-bold">${overdueCount} overdue</span>):`
          : `<strong>${sortedItems.length} upcoming tasks</strong> approaching deadline:`;

      const messagePreview =
        `${headerSummary}<br/>` +
        summaryList.slice(0, 3).join("<br/>") +
        (sortedItems.length > 3 ? `<br/><em>...and ${sortedItems.length - 3} more tasks</em>` : "");

      const hasCritical = sortedItems.some((i) => i.priority === "critical");
      const hasUrgent = sortedItems.some((i) => i.priority === "urgent");
      const batchPriority: NotificationPriority = hasCritical ? "critical" : hasUrgent ? "urgent" : "info";
      const batchCategory: NotificationCategory = hasCritical ? "overdue" : hasUrgent ? "due_soon" : "milestone";
      const hasAssignedToMe = sortedItems.some((i) => i.isAssignedToMe);
      const uniqueParties = Array.from(new Set(sortedItems.map((i) => i.party).filter(Boolean))).join(", ");

      batchedNotifications.push({
        id: `batch_task_${pStore}_${pYear}_${projId || pCode}_${sortedItems.length}`,
        title: `${pCode} - ${projName}`,
        subtitle: `Store: ${pStore} • Year: ${pYear}${projLoc ? ` • Floor ${projLoc}` : ""} | ${sortedItems.length} Tasks`,
        message: messagePreview,
        dateStr: earliestDateStr,
        diffMs: urgentDiff,
        generatedAt: latestGen,
        targetType: "project",
        targetId: projId || (project ? project.no : pCode),
        count: sortedItems.length,
        projectId: projId,
        projectCode: pCode,
        projectName: projName,
        projectStore: pStore,
        projectYear: pYear,
        location: projLoc,
        category: batchCategory,
        priority: batchPriority,
        isAssignedToMe: hasAssignedToMe,
        party: uniqueParties,
        subItems: sortedItems,
      });
    } else {
      batchedNotifications.push(items[0]);
    }
  });

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return [...nonBatchedNotifs, ...batchedNotifications]
    .filter((n) => now.getTime() - n.generatedAt <= thirtyDaysMs)
    .sort((a, b) => b.generatedAt - a.generatedAt);
}
