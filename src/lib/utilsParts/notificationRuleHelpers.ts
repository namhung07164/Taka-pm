import {
  Project,
  Task,
  NotificationRule,
  ActiveNotification,
  NotificationPriority,
  NotificationCategory,
  DelegationGroup,
} from "../../types";
import { parseDateTime, formatDisplayDateTime } from "./commonAndDateUtils";

const fieldLabels: Record<string, string> = {
  start: "Start",
  handover: "Handover (Pj Compl)",
  opening: "Grand Opening",
  finish: "Task Finish",
  flow_status: "Delegation Status",
  mention: "@mention",
  delegation_party: "@delegation party",
};

export function evaluateDelegationNotificationRule(
  rule: NotificationRule,
  delegationGroups: DelegationGroup[],
  projects: Project[],
  tasks: Task[],
  now: Date,
  currentUserUsername: string | undefined,
  isMatchUserParty: (partyStr?: string) => boolean,
  notifications: ActiveNotification[]
) {
  delegationGroups.forEach((group) => {
    if (group.isDeleted || !group.updatedAt) return;
    const targetDate = new Date(group.updatedAt);
    if (isNaN(targetDate.getTime())) return;

    let shouldTrigger = false;
    let flowStatus = "";
    let party = "";
    let subTaskName = "";

    if (rule.field === "flow_status") {
      if (group.subTasks && group.subTasks.length > 0) {
        let recentSt = group.subTasks[0];
        group.subTasks.forEach((st) => {
          if (
            st.updatedAt &&
            recentSt.updatedAt &&
            new Date(st.updatedAt).getTime() >
              new Date(recentSt.updatedAt).getTime()
          ) {
            recentSt = st;
          } else if (st.updatedAt && !recentSt.updatedAt) {
            recentSt = st;
          }
        });
        party = recentSt.party || "N/A";
        subTaskName = recentSt.name || "";
        flowStatus =
          recentSt.delegationStatus || recentSt.status || "Assigned";
        shouldTrigger = true;
      }
    } else if (rule.field === "mention" && currentUserUsername) {
      if (group.subTasks && group.subTasks.length > 0) {
        let recentSt = group.subTasks[0];
        group.subTasks.forEach((st) => {
          if (
            st.updatedAt &&
            recentSt.updatedAt &&
            new Date(st.updatedAt).getTime() >
              new Date(recentSt.updatedAt).getTime()
          ) {
            recentSt = st;
          }
        });

        if (
          recentSt.comments &&
          recentSt.comments.includes(`@${currentUserUsername}`)
        ) {
          party = recentSt.party || "N/A";
          subTaskName = recentSt.name || "";
          flowStatus =
            recentSt.delegationStatus || recentSt.status || "Assigned";
          shouldTrigger = true;
        }
      }
    } else if (rule.field === "delegation_party") {
      if (group.subTasks && group.subTasks.length > 0) {
        let recentSt = group.subTasks[0];
        group.subTasks.forEach((st) => {
          if (
            st.updatedAt &&
            recentSt.updatedAt &&
            new Date(st.updatedAt).getTime() >
              new Date(recentSt.updatedAt).getTime()
          ) {
            recentSt = st;
          }
        });

        if (
          recentSt.comments &&
          (recentSt.comments.includes("@delegation party") ||
            recentSt.comments.includes("@Delegation party") ||
            (recentSt.party &&
              recentSt.comments.includes(`@${recentSt.party}`)))
        ) {
          party = recentSt.party || "N/A";
          subTaskName = recentSt.name || "";
          flowStatus =
            recentSt.delegationStatus || recentSt.status || "Assigned";
          shouldTrigger = true;
        }
      }
    }

    if (shouldTrigger) {
      const diffMs = targetDate.getTime() - now.getTime();
      const thresholdMs =
        ((rule.daysBefore || 0) * 24 + (rule.hoursBefore || 0)) *
        60 *
        60 *
        1000;

      if (diffMs <= thresholdMs && diffMs >= -30 * 24 * 60 * 60 * 1000) {
        let projectName = group.name || "Custom Task";
        const isLinked = !!group.projectId || !!group.parentTaskId || !!group.projectCode;

        let parentTask: Task | null = null;
        let parentProject: Project | undefined = undefined;
        let ps = group.projectStore ? String(group.projectStore).trim().toUpperCase() : "";
        let py = group.projectYear !== undefined && group.projectYear !== null ? String(group.projectYear).trim() : "";
        let pId = group.projectId ? String(group.projectId).trim() : "";

        if (isLinked) {
          parentTask = group.parentTaskId
            ? tasks.find((t) => t.id === group.parentTaskId) || null
            : null;

          if (!pId && parentTask?.projectId) pId = String(parentTask.projectId).trim();
          if (!ps && parentTask?.projectStore) ps = String(parentTask.projectStore).trim().toUpperCase();
          if (!py && parentTask?.projectYear) py = String(parentTask.projectYear).trim();

          // Rule 16.1: Priority #1 projectId -> #2 store -> #3 year -> #4 projectCode
          if (pId) {
            parentProject = projects.find((p) => String(p.id || "").trim() === pId);
          }
          if (!parentProject) {
            const targetCode = String(group.projectCode || parentTask?.projectCode || group.parentTaskId || "").trim().toLowerCase();
            if (targetCode) {
              parentProject = projects.find((p) => {
                if (pId && p.id && String(p.id).trim() !== pId) return false;
                const pStore = String(p.store || "").trim().toUpperCase();
                if (ps && pStore && ps !== pStore) return false;
                const pYear = String(p.year || "").trim();
                if (py && pYear && py !== pYear) return false;
                return String(p.code || "").trim().toLowerCase() === targetCode;
              });
            }
          }

          if (parentProject) {
            if (!pId && parentProject.id) pId = String(parentProject.id);
            if (!ps && parentProject.store) ps = String(parentProject.store).trim().toUpperCase();
            if (!py && parentProject.year) py = String(parentProject.year).trim();
          }

          if (parentTask) {
            projectName = `${parentTask.name}${parentProject?.name ? ` • ${parentProject.name}` : ""}`;
          } else if (parentProject) {
            projectName = parentProject.name || group.name;
          }
        }

        const displayTaskName = subTaskName || group.name || "Delegation Task";
        const isMyDelegation = isMatchUserParty(party) || (rule.field === 'mention') || (rule.field === 'delegation_party');
        const isRejected = String(flowStatus).toLowerCase() === 'rejected';
        const delPriority: NotificationPriority = isRejected ? 'critical' : 'action_required';
        const resolvedCode = group.projectCode || parentTask?.projectCode || parentProject?.code || "";

        notifications.push({
          id: `${rule.id}_${ps || 'store'}_${py || 'yr'}_${group.id}_${targetDate.getTime()}`,
          title: resolvedCode ? `${resolvedCode} - ${projectName}` : projectName,
          subtitle: `Delegation • Party: ${party} • Status: ${flowStatus}`,
          message: `Sub-task <strong>${displayTaskName}</strong> updated to <strong>${flowStatus}</strong>.`,
          dateStr: formatDisplayDateTime(group.updatedAt),
          diffMs: diffMs,
          generatedAt: targetDate.getTime() - thresholdMs,
          targetType: "task_delegation",
          targetId: group.id,
          projectId: pId || parentProject?.id,
          projectCode: resolvedCode,
          projectName: parentProject?.name || group.name,
          taskName: displayTaskName,
          projectStore: ps,
          projectYear: py,
          location: parentProject?.location || parentTask?.location || "",
          category: rule.field === 'mention' ? 'mention' : 'delegation',
          ruleField: rule.field,
          priority: delPriority,
          isAssignedToMe: isMyDelegation,
          party: party,
        });
      }
    }
  });
}

export function evaluateProjectOrTaskNotificationRule(
  rule: NotificationRule,
  projects: Project[],
  effectiveTasks: Task[],
  now: Date,
  findParentProject: (code?: string, year?: string | number, store?: string, projectId?: string) => Project | undefined,
  isMatchUserParty: (partyStr?: string) => boolean,
  notifications: ActiveNotification[]
) {
  const targetList = rule.target === "project" ? projects : effectiveTasks;

  targetList.forEach((item) => {
    if ((item as any).isDeleted) return;

    if (rule.target === "project") {
      const p = item as Project;
      const pStatus = String(p.computedStatus || "").toLowerCase();
      const mdStatus = String(p.mdStatus || "").toLowerCase();
      if (
        pStatus === "completed" ||
        pStatus === "canceled" ||
        mdStatus === "canceled" ||
        mdStatus === "rejected"
      ) {
        return;
      }
    } else {
      const t = item as Task;
      const tStatus = String(t.runningStatus || (t as any).status || "").toLowerCase();
      if (tStatus === "completed" || tStatus === "canceled") {
        return;
      }
      const parentP = findParentProject(t.projectCode, t.projectYear, t.projectStore, t.projectId);
      if (parentP) {
        const pStatus = String(parentP.computedStatus || "").toLowerCase();
        const mdStatus = String(parentP.mdStatus || "").toLowerCase();
        if (
          parentP.isDeleted ||
          pStatus === "canceled" ||
          mdStatus === "canceled" ||
          mdStatus === "rejected"
        ) {
          return;
        }
      }
    }

    let dateVal = (item as any)[rule.field];
    if (rule.target === "project") {
      const p = item as Project;
      if (rule.field === "start") dateVal = p.computedTakStart || p.start;
      if (rule.field === "handover") dateVal = p.computedTakCompl || p.handover;
      if (rule.field === "opening") dateVal = p.computedOpening || p.opening;
    }

    if (dateVal) {
      const targetDate = parseDateTime(dateVal);
      if (targetDate && !isNaN(targetDate.getTime())) {
        const diffMs = targetDate.getTime() - now.getTime();
        const thresholdMs =
          ((rule.daysBefore || 0) * 24 + (rule.hoursBefore || 0)) *
          60 *
          60 *
          1000;

        // If rule is for "start" and the item is already On process in the past (>24h ago), skip noisy start overdue alert
        if (rule.field === "start" && diffMs < -24 * 60 * 60 * 1000) {
          if (rule.target === "task" && (item as Task).runningStatus === "On process") return;
          if (rule.target === "project" && (item as Project).computedStatus === "On process") return;
        }

        if (diffMs <= thresholdMs && diffMs >= -30 * 24 * 60 * 60 * 1000) {
          let title = "";
          let subtitle = "";
          let notificationBody = "";

          const isOverdue = diffMs < 0;
          const diffHrsTotal = Math.abs(
            Math.floor(diffMs / (1000 * 60 * 60)),
          );
          const d = Math.floor(diffHrsTotal / 24);
          const h = diffHrsTotal % 24;

          let timeMsg = "";
          if (d === 0 && h === 0)
            timeMsg = isOverdue
              ? "Overdue (under 1 hour)"
              : "Due soon (under 1 hour)";
          else
            timeMsg = isOverdue
              ? `Overdue by ${d > 0 ? d + "d " : ""}${h > 0 ? h + "h" : ""}`.trim()
              : `Due in ${d > 0 ? d + "d " : ""}${h > 0 ? h + "h" : ""}`.trim();

          const fName = fieldLabels[rule.field] || rule.field;
          const formattedTargetDate = formatDisplayDateTime(dateVal);

          let notifId = "";
          let itemProjectId: string | undefined = undefined;
          let itemProjectCode = "";
          let itemProjectName = "";
          let itemTaskName: string | undefined = undefined;
          let itemProjectStore = "";
          let itemProjectYear = "";
          let itemLocation = "";

          if (rule.target === "project") {
            const p = item as Project;
            itemProjectId = p.id ? String(p.id) : undefined;
            itemProjectCode = String(p.code || "").trim();
            itemProjectName = String(p.name || "N/A").trim();
            itemProjectStore = String(p.store || "HCM").toUpperCase().trim();
            itemProjectYear = String(p.year || "").trim();
            itemLocation = String(p.location || "").trim();

            title = `${itemProjectCode} - ${itemProjectName}`;
            subtitle = `Project Milestone • ${fName}${itemLocation ? ` • Floor ${itemLocation}` : ""}`;
            notificationBody = `<strong>${fName}</strong>: ${timeMsg} <span class="opacity-75">(${formattedTargetDate})</span>`;
            notifId = `${rule.id}_${itemProjectStore}_${itemProjectYear}_${p.id || p.code || p.no}`;
          } else {
            const t = item as Task;
            const p = findParentProject(t.projectCode, t.projectYear, t.projectStore, t.projectId);

            itemProjectId = (t.projectId ? String(t.projectId) : undefined) || (p?.id ? String(p.id) : undefined);
            itemProjectCode = String(t.projectCode || p?.code || "").trim();
            itemProjectName = String(p?.name || "Project").trim();
            itemTaskName = String(t.name || "Task").trim();
            itemProjectStore = String(t.projectStore || p?.store || "HCM").toUpperCase().trim();
            itemProjectYear = String(t.projectYear || p?.year || "").trim();
            itemLocation = String(t.location || p?.location || "").trim();

            title = `${itemProjectCode} - ${itemProjectName} - ${itemTaskName}`;
            subtitle = `${itemProjectCode} (${itemProjectName})${itemLocation ? ` • ${itemLocation}` : ""} | Party: ${t.party || p?.party || "N/A"}`;
            const pParty = t.party ? ` • Assigned: <strong>${t.party}</strong>` : "";
            notificationBody = `<strong>${fName}</strong>: ${timeMsg} <span class="opacity-75">(${formattedTargetDate})</span>${pParty}`;
            notifId = `${rule.id}_${itemProjectStore}_${itemProjectYear}_${t.id}`;
          }

          const isDueSoon = !isOverdue && diffMs <= 48 * 60 * 60 * 1000;
          const itemPriority: NotificationPriority = isOverdue ? 'critical' : isDueSoon ? 'urgent' : 'info';
          const itemCategory: NotificationCategory = isOverdue ? 'overdue' : isDueSoon ? 'due_soon' : 'milestone';
          const isMyItem =
            rule.target === 'task'
              ? isMatchUserParty((item as Task).party)
              : isMatchUserParty((item as Project).party);
          const itemParty =
            rule.target === 'task'
              ? ((item as Task).party || '')
              : ((item as Project).party || '');

          notifications.push({
            id: notifId,
            title: title,
            subtitle: subtitle,
            message: notificationBody,
            dateStr: formattedTargetDate,
            diffMs: diffMs,
            generatedAt: targetDate.getTime() - thresholdMs,
            targetType: rule.target as any,
            targetId:
              rule.target === "project"
                ? ((item as Project).id || (item as Project).no)
                : (item as Task).id,
            projectId: itemProjectId,
            projectCode: itemProjectCode,
            projectName: itemProjectName,
            taskName: itemTaskName,
            projectStore: itemProjectStore,
            projectYear: itemProjectYear,
            location: itemLocation,
            category: itemCategory,
            ruleField: rule.field,
            priority: itemPriority,
            isAssignedToMe: isMyItem,
            party: itemParty,
          });
        }
      }
    }
  });
}
