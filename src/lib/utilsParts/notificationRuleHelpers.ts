import {
  Project,
  Task,
  NotificationRule,
  ActiveNotification,
  NotificationPriority,
  DelegationGroup,
} from "../../types";
import { parseDateTime, formatDisplayDateTime } from "./commonAndDateUtils";

const fieldLabels: Record<string, string> = {
  start: "Start",
  handover: "Pj Compl",
  opening: "Opening",
  finish: "Finish",
  flow_status: "Flow Status Update",
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
    if (!group.updatedAt) return;
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
        const isLinked = !!group.parentTaskId || !!group.projectCode;

        let parentTask: Task | null = null;
        let parentProject: Project | undefined = undefined;
        let ps = group.projectStore;
        let py = group.projectYear;

        if (isLinked) {
          parentTask = group.parentTaskId
            ? tasks.find((t) => t.id === group.parentTaskId) || null
            : null;

          if (!ps && parentTask?.projectStore) ps = parentTask.projectStore;
          if (!py && parentTask?.projectYear) py = parentTask.projectYear;

          parentProject = projects.find(
            (p) =>
              ((group.parentTaskId && p.code === group.parentTaskId) ||
                (group.projectCode && p.code === group.projectCode) ||
                (parentTask && p.code === parentTask.projectCode)) &&
              (ps ? String(p.store) === String(ps) : true) &&
              (py ? String(p.year) === String(py) : true),
          );

          if (parentTask) {
            projectName = `${parentTask.name}${parentProject?.name ? ` - ${parentProject.name}` : ""}`;
          } else if (parentProject) {
            projectName = parentProject.name || group.name;
          }
        }

        const displayTaskName = subTaskName || group.name || "task";
        const isMyDelegation = isMatchUserParty(party) || (rule.field === 'mention') || (rule.field === 'delegation_party');
        const isRejected = String(flowStatus).toLowerCase() === 'rejected';
        const delPriority: NotificationPriority = isRejected ? 'critical' : 'action_required';

        notifications.push({
          id: `${rule.id}_${ps || 'store'}_${group.id}_${targetDate.getTime()}`,
          title: projectName,
          subtitle: `Party: ${party} | Status: ${flowStatus}`,
          message: `Delegation task: ${displayTaskName}, status: ${flowStatus.toLowerCase()}.`,
          dateStr: formatDisplayDateTime(group.updatedAt),
          diffMs: diffMs,
          generatedAt: targetDate.getTime() - thresholdMs,
          targetType: "task_delegation",
          targetId: group.id,
          projectCode: group.projectCode || parentTask?.projectCode || parentProject?.code || "",
          projectStore: ps || parentProject?.store || "",
          projectYear: py || parentProject?.year || "",
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
  findParentProject: (code?: string, year?: string | number, store?: string) => Project | undefined,
  isMatchUserParty: (partyStr?: string) => boolean,
  notifications: ActiveNotification[]
) {
  const targetList = rule.target === "project" ? projects : effectiveTasks;

  targetList.forEach((item) => {
    let dateVal = (item as any)[rule.field];
    if (rule.target === "project") {
      const p = item as Project;
      if (rule.field === "start") dateVal = p.computedTakStart || p.start;
      if (rule.field === "handover") dateVal = p.computedTakCompl;
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
              ? `overdue by ${d > 0 ? d + " days " : ""}${h > 0 ? h + " hours" : ""}`
              : `in ${d > 0 ? d + " days " : ""}${h > 0 ? h + " hours" : ""}`;

          const fName = fieldLabels[rule.field] || rule.field;

          let notifId = `${rule.id}_${(item as any).id || (item as any).no}`;
          let itemProjectCode = (item as any).code || (item as any).projectCode || "";
          let itemProjectStore = (item as any).store || (item as any).projectStore || "";
          let itemProjectYear = (item as any).year || (item as any).projectYear || "";

          if (rule.target === "project") {
            const p = item as Project;
            title = `${p.code} - ${p.name || "N/A"}`;
            subtitle = p.name || "N/A";
            notificationBody = `${fName} deadline ${timeMsg}`;
            itemProjectCode = p.code || "";
            itemProjectStore = String(p.store || "HCM").toUpperCase().trim();
            itemProjectYear = String(p.year || "").trim();
            notifId = `${rule.id}_${p.id || p.no}`;
          } else {
            const t = item as Task;
            let projName = "N/A";
            const p = findParentProject(t.projectCode, t.projectYear, t.projectStore);

            if (p && p.name) projName = p.name;

            title = `${t.projectCode} - ${projName} - ${t.name || "N/A"}`;
            subtitle = `Project ${t.projectCode} | Party: ${t.party || "N/A"}`;
            const pParty = t.party ? ` by ${t.party}` : "";
            notificationBody = `${fName} deadline ${timeMsg}${pParty}`;

            itemProjectCode = t.projectCode || "";
            itemProjectStore = String(t.projectStore || p?.store || "HCM").toUpperCase().trim();
            itemProjectYear = String(t.projectYear || p?.year || "").trim();
            notifId = `${rule.id}_${t.id}`;
          }

          const isDueSoon = !isOverdue && diffMs <= 48 * 60 * 60 * 1000;
          const itemPriority: NotificationPriority = isOverdue ? 'critical' : isDueSoon ? 'urgent' : 'info';
          const isMyItem = rule.target === 'task' ? isMatchUserParty((item as Task).party) : false;
          const taskParty = rule.target === 'task' ? ((item as Task).party || '') : '';

          notifications.push({
            id: notifId,
            title: title,
            subtitle: subtitle,
            message: notificationBody,
            dateStr: formatDisplayDateTime(dateVal),
            diffMs: diffMs,
            generatedAt: targetDate.getTime() - thresholdMs,
            targetType: rule.target as any,
            targetId:
              rule.target === "project"
                ? ((item as Project).id || (item as Project).no)
                : (item as Task).id,
            projectCode: itemProjectCode,
            projectStore: itemProjectStore,
            projectYear: itemProjectYear,
            priority: itemPriority,
            isAssignedToMe: isMyItem,
            party: taskParty,
          });
        }
      }
    }
  });
}
