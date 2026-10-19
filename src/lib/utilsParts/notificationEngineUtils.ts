import {
  Project,
  Task,
  NotificationRule,
  ActiveNotification,
  NotificationPriority,
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
    const p = String(partyStr).trim().toLowerCase();
    if (currentUserUsername && p === currentUserUsername.trim().toLowerCase()) return true;
    if (currentUserObj?.name && p === currentUserObj.name.trim().toLowerCase()) return true;
    if (currentUserObj?.partyPermissions && currentUserObj.partyPermissions[partyStr.trim()]) return true;
    return false;
  };

  const notifications: ActiveNotification[] = [];
  const currentActualYear = now.getFullYear();

  // O(1) Pre-indexing for projects by code_year_store, code_store, and code (AGENTS.md Rule 7)
  const projectByKeyMap = new Map<string, Project>();
  const projectByCodeStoreMap = new Map<string, Project>();
  const projectByCodeMap = new Map<string, Project>();

  projects.forEach((p) => {
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

  const findParentProject = (code?: string, year?: string | number, store?: string): Project | undefined => {
    const c = String(code || "").trim().toLowerCase();
    if (!c) return undefined;
    const s = String(store || "HCM").trim().toUpperCase();
    const y = String(year || "").trim();

    if (y && projectByKeyMap.has(`${c}_${y}_${s}`)) {
      return projectByKeyMap.get(`${c}_${y}_${s}`);
    }
    if (y && !store) {
      if (projectByKeyMap.has(`${c}_${y}_HCM`)) return projectByKeyMap.get(`${c}_${y}_HCM`);
      if (projectByKeyMap.has(`${c}_${y}_HN`)) return projectByKeyMap.get(`${c}_${y}_HN`);
    }
    if (!y && store) {
      if (projectByCodeStoreMap.has(`${c}_${s}`)) {
        return projectByCodeStoreMap.get(`${c}_${s}`);
      }
    }
    if (!y && !store) {
      return projectByCodeMap.get(c);
    }
    return undefined;
  };

  // Consolidate tasks: combining explicit `tasks` array with embedded `project.taskSummaries`
  const taskMap = new Map<string, Task>();

  projects.forEach((p) => {
    if (p.taskSummaries && Array.isArray(p.taskSummaries)) {
      p.taskSummaries.forEach((ts, idx) => {
        const pCode = p.code || "";
        const pStore = String(p.store || "HCM").toUpperCase().trim();
        const pYear = String(p.year || "").trim();
        const tsId = ts.id || `ts_${p.id || pCode}_${pStore}_${pYear}_${idx}`;

        taskMap.set(tsId, {
          id: tsId,
          name: ts.name || `Task ${idx + 1}`,
          start: ts.start || "",
          finish: ts.finish || "",
          projectCode: pCode,
          projectStore: pStore,
          projectYear: pYear,
          party: ts.party || p.party || "",
          runningStatus: ts.runningStatus || "On process",
          duration: ts.duration || "",
          parentTaskId: ts.parentTaskId,
          taskCodePhu: ts.taskCodePhu,
          comments: ts.comments || [],
          ...ts
        } as Task);
      });
    }
  });

  tasks.forEach((t) => {
    if (t.id) {
      taskMap.set(t.id, t);
    }
  });

  const effectiveTasks = Array.from(taskMap.values());

  // Generate notifications for Cross-Year Rollover (only active/pending tasks, skip completed & canceled)
  effectiveTasks.forEach((task) => {
    const isCompleted = task.runningStatus === 'Completed';
    if (!isCompleted && task.projectYear && Number(task.projectYear) < currentActualYear) {
      const project = findParentProject(task.projectCode, task.projectYear, task.projectStore);
      if (project?.computedStatus === 'Canceled' || project?.mdStatus === 'Canceled') return;

      const subtitleStr = project
        ? `${task.projectCode} - ${project.name} - ${task.name}`
        : `${task.projectCode || ""} ${task.name}`.trim();

      const pStore = String(task.projectStore || project?.store || "HCM").toUpperCase().trim();
      const pYear = String(task.projectYear || project?.year || "").trim();

      const isMyTask = isMatchUserParty(task.party);
      notifications.push({
        id: `rollover_task_${task.id}`,
        title: "Cross-Year Task Rollover",
        subtitle: subtitleStr,
        message: `Task from ${task.projectYear} is still pending. Would you like to roll it over to ${currentActualYear}?`,
        dateStr: now.toISOString(),
        diffMs: 0,
        generatedAt: now.getTime(),
        targetType: "task",
        targetId: task.id,
        projectCode: task.projectCode,
        projectStore: pStore,
        projectYear: pYear,
        action: 'cross_year_rollover',
        actionData: { taskId: task.id, newYear: currentActualYear },
        priority: 'action_required',
        isAssignedToMe: isMyTask,
        party: task.party || "",
      });
    }
  });

  // Generate notifications for @mentions
  if (currentUserId) {
    effectiveTasks.forEach((task) => {
      const project = findParentProject(task.projectCode, task.projectYear, task.projectStore);
      if (task.comments && task.comments.length > 0) {
        task.comments.forEach((comment) => {
          if (
            comment.mentions &&
            comment.mentions.includes(currentUserId)
          ) {
            const commentTime = new Date(comment.createdAt).getTime();
            const diffMs = commentTime - now.getTime();
            if (diffMs >= -30 * 24 * 60 * 60 * 1000) {
              const subtitleStr = project
                ? `${task.projectCode} - ${project.name} - ${task.name}`
                : `${task.projectCode || ""} ${task.name}`.trim();
              const pStore = String(task.projectStore || project?.store || "HCM").toUpperCase().trim();
              const pYear = String(task.projectYear || project?.year || "").trim();
              notifications.push({
                id: `mention_${comment.id}`,
                title: "You were mentioned in a task",
                subtitle: subtitleStr,
                message: `"${comment.text}"`,
                dateStr: comment.createdAt,
                diffMs,
                generatedAt: commentTime,
                targetType: "task",
                targetId: task.id,
                projectCode: task.projectCode,
                projectStore: pStore,
                projectYear: pYear,
                priority: 'action_required',
                isAssignedToMe: true,
                party: task.party || "",
              });
            }
          }
        });
      }
    });

    projects.forEach((project) => {
      if (project.comments && project.comments.length > 0) {
        project.comments.forEach((comment) => {
          if (
            comment.mentions &&
            comment.mentions.includes(currentUserId)
          ) {
            const commentTime = new Date(comment.createdAt).getTime();
            const diffMs = commentTime - now.getTime();
            if (diffMs >= -30 * 24 * 60 * 60 * 1000) {
              const subtitleStr = `${project.code} - ${project.name}`;
              notifications.push({
                id: `mention_proj_${comment.id}`,
                title: "You were mentioned in a project",
                subtitle: subtitleStr,
                message: `"${comment.text}"`,
                dateStr: comment.createdAt,
                diffMs,
                generatedAt: commentTime,
                targetType: "project",
                targetId: project.id || project.no,
                projectCode: project.code,
                projectStore: String(project.store || "HCM").toUpperCase().trim(),
                projectYear: String(project.year || "").trim(),
                priority: 'action_required',
                isAssignedToMe: true,
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

  // Smart Grouping / Batching: Group task deadline notifications by project to avoid notification fatigue
  const batchedNotifications: ActiveNotification[] = [];
  const taskNotifsByProject = new Map<string, ActiveNotification[]>();
  const nonBatchedNotifs: ActiveNotification[] = [];

  notifications.forEach((notif) => {
    if (notif.targetType === "task" && !notif.id.startsWith("mention_")) {
      const pCode = notif.projectCode || (notif.title.split(" - ")[0] || "").trim();
      const pStore = notif.projectStore || "";
      const pYear = notif.projectYear || "";
      const groupKey = `${pCode}_${pStore}_${pYear}`;
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
      const first = items[0];
      const pCode = first.projectCode || groupKey.split("_")[0];
      const pStore = first.projectStore || groupKey.split("_")[1] || "";
      const pYear = first.projectYear || groupKey.split("_")[2] || "";
      const project = findParentProject(pCode, pYear, pStore);
      const projName = project?.name || (first.title.split(" - ")[1] || "").trim() || "Project";

      const urgentDiff = Math.min(...items.map((i) => i.diffMs));
      const latestGen = Math.max(...items.map((i) => i.generatedAt));
      const earliestDateStr = items[0].dateStr;

      const summaryList = items.map((i) => {
        const parts = i.title.split(" - ");
        const taskPart = parts.length >= 3 ? parts.slice(2).join(" - ") : i.title;
        return `• <strong>${taskPart}</strong>: ${i.message}`;
      });

      const messagePreview =
        `Batched <strong>${items.length} tasks</strong> requiring attention:<br/>` +
        summaryList.slice(0, 3).join("<br/>") +
        (items.length > 3 ? `<br/><em>...and ${items.length - 3} more tasks</em>` : "");

      const hasCritical = items.some((i) => i.priority === 'critical');
      const hasUrgent = items.some((i) => i.priority === 'urgent');
      const batchPriority: NotificationPriority = hasCritical ? 'critical' : hasUrgent ? 'urgent' : 'info';
      const hasAssignedToMe = items.some((i) => i.isAssignedToMe);

      batchedNotifications.push({
        id: `batch_task_${groupKey}_${items.length}`,
        title: `${pCode} - ${projName}`,
        subtitle: `Store: ${pStore || "ALL"} • Year: ${pYear || "ALL"} | ${items.length} tasks`,
        message: messagePreview,
        dateStr: earliestDateStr,
        diffMs: urgentDiff,
        generatedAt: latestGen,
        targetType: "project",
        targetId: project ? (project.id || project.no) : pCode,
        count: items.length,
        projectCode: pCode,
        projectStore: pStore,
        projectYear: pYear,
        priority: batchPriority,
        isAssignedToMe: hasAssignedToMe,
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
