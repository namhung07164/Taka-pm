import { Project, Task, DelegationGroup } from "../../types";
import { parseDateMidnightMs, getTodayMidnightMs } from "./commonAndDateUtils";
import { isTaskBelongsToProject, isDelegationGroupBelongsToProject } from "./projectCodeAndScopeUtils";
import {
  computePlanProgressPercent,
  computePlanProgressFromSummaries,
  computeActProgressPercent,
  computeActProgressFromSummaries,
} from "./progressAndStatusUtils";

export const resolveActualStatus = (
  plStatus: string,
  subTasks: any[],
  task?: { runningStatus?: string; approval?: string; status?: string; [key: string]: any }
) => {
  if (plStatus === "Canceled") {
    return {
      label: "Cancel",
      color: "bg-slate-400 text-white border-slate-500",
    };
  }

  if (!subTasks || subTasks.length === 0) {
    if (task) {
      const running = (task.runningStatus || '').toLowerCase();
      const approval = (task.approval || '').toLowerCase();
      if (running.includes('complete') || approval === 'approved' || running.includes('finish')) {
        return {
          label: "Completed",
          color: "bg-emerald-50 dark:bg-[#28282a] text-emerald-600 dark:text-[#81c995] border-emerald-200 dark:border-emerald-800",
        };
      }
      if (running.includes('delay')) {
        return {
          label: "Delayed",
          color: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700",
        };
      }
      if (running.includes('process') || running.includes('progress') || running.includes('accept')) {
        return {
          label: "In Progress",
          color: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700",
        };
      }
      if (running.includes('cancel')) {
        return {
          label: "Cancel",
          color: "bg-slate-400 text-white border-slate-500",
        };
      }
    }

    const pLower = (plStatus || '').toLowerCase();
    if (pLower === 'completed') {
      return {
        label: "Completed",
        color: "bg-emerald-50 dark:bg-[#28282a] text-emerald-600 dark:text-[#81c995] border-emerald-200 dark:border-emerald-800",
      };
    }
    if (pLower === 'on process' || pLower === 'handover') {
      return {
        label: "In Progress",
        color: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700",
      };
    }
    return {
      label: "Upcoming",
      color: "bg-slate-50 dark:bg-[#28282a] text-slate-600 dark:text-[#9aa0a6] border-slate-200 dark:border-[#3c4043]",
    };
  }

  const statuses = subTasks.map((st) =>
    (st.delegationStatus || st.status || "").toLowerCase(),
  );

  let T_group = "Assigned";
  if (statuses.some((s) => ["rejected", "needs rework", "reqreview"].includes(s))) {
    T_group = "Rejected";
  } else if (
    statuses.every((s) => ["completed", "approved", "finish", "finished"].includes(s) || s === "")
  ) {
    if (statuses.some((s) => s !== "")) {
      T_group = "Completed";
    }
  } else if (
    statuses.some((s) =>
      [
        "pending completed",
        "waiting for approval",
        "hold",
        "requested",
        "reqapproval",
      ].includes(s),
    )
  ) {
    T_group = "Pending Completed";
  } else if (
    statuses.some((s) =>
      [
        "accepted",
        "on process",
        "in progress",
        "inprogress",
        "doing",
        "accepttask",
      ].includes(s),
    )
  ) {
    T_group = "In Progress";
  }

  const pLower = (plStatus || "").toLowerCase();
  const P_group =
    pLower === "completed"
      ? "Completed"
      : pLower === "on process" || pLower === "handover"
        ? "On Process"
        : "Upcoming";

  if (T_group === "Completed") {
    return {
      label: "Completed",
      color:
        "bg-emerald-50 dark:bg-[#28282a] text-emerald-600 dark:text-[#81c995] border-emerald-200 dark:border-emerald-800",
    };
  }

  if (T_group === "Rejected") {
    return {
      label: "Correction Needed",
      color: "bg-red-500 text-white border-red-600",
    };
  }

  if (T_group === "Pending Completed") {
    if (P_group === "Completed") {
      return {
        label: "Review Late",
        color: "bg-orange-500 text-white border-orange-600",
      };
    }
    return {
      label: "Pending Approval",
      color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700",
    };
  }

  if (T_group === "In Progress") {
    if (P_group === "Completed") {
      return {
        label: "Delayed",
        color: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700",
      };
    }
    return {
      label: "In Progress",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700",
    };
  }

  if (P_group === "Completed") {
    return {
      label: "Critical Delay",
      color: "bg-red-800 text-red-100 border-red-900",
    };
  }
  if (P_group === "On Process") {
    return {
      label: "In Progress",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700",
    };
  }

  return {
    label: "Planned",
    color: "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
  };
};

export function getStatus(
  start: string | undefined,
  handover: string | undefined,
  opening: string | undefined,
  code: string = "",
) {
  if (code && String(code).toLowerCase().includes("cancel")) return "Canceled";
  if (!start) return "Upcoming";
  const todayMs = getTodayMidnightMs();

  const dStartMs = parseDateMidnightMs(start);
  if (dStartMs === null) return "Upcoming";

  const dHandoverMs = handover ? parseDateMidnightMs(handover) : null;
  const dOpeningMs = opening ? parseDateMidnightMs(opening) : null;

  const dEndMs =
    dOpeningMs !== null && dHandoverMs !== null
      ? dOpeningMs > dHandoverMs
        ? dOpeningMs
        : dHandoverMs
      : dOpeningMs !== null
        ? dOpeningMs
        : dHandoverMs;

  if (todayMs < dStartMs) return "Upcoming";
  if (dEndMs !== null && todayMs > dEndMs) return "Completed";

  if (dHandoverMs !== null && dOpeningMs !== null && todayMs >= dHandoverMs && todayMs <= dOpeningMs)
    return "Handover";

  return "On process";
}

export function getTaskStatus(
  start: string | undefined,
  finish: string | undefined,
): string {
  if (!start && !finish) return "Upcoming";
  const todayMs = getTodayMidnightMs();

  const dStartMs = parseDateMidnightMs(start);
  const dFinishMs = parseDateMidnightMs(finish);

  if (dStartMs !== null && todayMs < dStartMs) return "Upcoming";
  if (dFinishMs !== null && todayMs > dFinishMs) return "Completed";

  return "On process";
}

export function computeProjectActStatus(
  p: Project,
  delegationGroups: DelegationGroup[] = [],
  matchedTasks: Task[] = []
): string {
  if ((p as any).actStatus) return String((p as any).actStatus);
  if ((p as any).actualStatus) return String((p as any).actualStatus);

  if (delegationGroups && delegationGroups.length > 0) {
    const matchedTaskIds = new Set(matchedTasks.map(t => t.id).filter(Boolean));
    const pGroups = delegationGroups.filter(g => isDelegationGroupBelongsToProject(g, p, matchedTaskIds));

    if (pGroups.length > 0) {
      const statuses = pGroups.map(g => {
        if (g.actStatus) return g.actStatus;
        return resolveActualStatus(p.computedStatus || 'On process', g.subTasks || []).label;
      });
      if (statuses.some(s => s === 'Rejected' || s === 'Correction Needed')) return 'Rejected';
      if (statuses.every(s => s === 'Completed')) return 'Completed';
      if (statuses.some(s => s === 'Pending Completed' || s === 'Pending Approval' || s === 'Review Late')) return 'Pending Completed';
      if (statuses.some(s => s === 'In Progress' || s === 'On Process' || s === 'Delayed' || s === 'Accepted')) return 'In Progress';
      return statuses[0] || 'Planned';
    }
  }

  if (p.computedActProgress === 100) return 'Completed';
  const plStatus = p.computedStatus || getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
  if (plStatus === 'Completed') return 'Completed';
  if (plStatus === 'Canceled') return 'Cancel';
  if (p.computedActProgress && p.computedActProgress > 0) return 'In Progress';
  if (plStatus === 'On process' || plStatus === 'Handover') return 'In Progress';
  return 'Planned';
}

export function getProjectDatesAndStatus(p: Project, tasks?: Task[]) {
  let computedTakStart = p.computedTakStart || p.start;
  let computedTakCompl: string | undefined = p.computedTakCompl || p.handover || (p as any).takCompl;
  let computedOpening = p.computedOpening || (p.openingMode === 'manual' ? p.opening : '');

  let derivedFromTasks = false;
  let projectTasks: Task[] = [];
  if (tasks && tasks.length > 0) {
    let minStart: string | undefined = undefined;
    let maxCompl: string | undefined = undefined;
    let hasOpeningTask = false;
    tasks.forEach(t => {
      if (!isTaskBelongsToProject(t, p)) return;

      derivedFromTasks = true;
      projectTasks.push(t);
      if (t.start && (!minStart || t.start < minStart)) {
        minStart = t.start;
      }
      if (t.finish && (!maxCompl || t.finish > maxCompl)) {
        maxCompl = t.finish;
      }
      const name = t.name ? String(t.name).toLowerCase() : "";
      if ((name.includes("opening") || name.includes("open")) && t.finish) {
        if (!hasOpeningTask || t.finish > computedOpening) {
          computedOpening = t.finish;
          hasOpeningTask = true;
        }
      }
    });
    if (derivedFromTasks) {
      if (minStart) computedTakStart = minStart;
      if (maxCompl) computedTakCompl = maxCompl;
      if (!hasOpeningTask && p.openingMode !== 'manual') {
        computedOpening = '';
      }
    }
  }

  if (!derivedFromTasks && p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
    let minStart: string | undefined = undefined;
    let maxCompl: string | undefined = undefined;
    let hasOpeningTask = false;
    p.taskSummaries.forEach(ts => {
      if (ts.start && (!minStart || ts.start < minStart)) {
        minStart = ts.start;
      }
      if (ts.finish && (!maxCompl || ts.finish > maxCompl)) {
        maxCompl = ts.finish;
      }
      const name = ts.name ? String(ts.name).toLowerCase() : "";
      if ((name.includes("opening") || name.includes("open")) && ts.finish) {
        if (!hasOpeningTask || ts.finish > computedOpening) {
          computedOpening = ts.finish;
          hasOpeningTask = true;
        }
      }
    });
    if (minStart) computedTakStart = minStart;
    if (maxCompl) computedTakCompl = maxCompl;
    if (!hasOpeningTask && p.openingMode !== 'manual') {
      computedOpening = '';
    }
  }

  const status = p.computedStatus || getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);

  let planProgressPercent = p.computedPlanProgress;
  let actProgressPercent = p.computedActProgress;

  if (projectTasks.length > 0) {
    planProgressPercent = computePlanProgressPercent(projectTasks);
    actProgressPercent = computeActProgressPercent(projectTasks, []);
  } else if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
    if (planProgressPercent === undefined || planProgressPercent === null || planProgressPercent === 0) {
      planProgressPercent = computePlanProgressFromSummaries(p.taskSummaries);
    }
    if (actProgressPercent === undefined || actProgressPercent === null || actProgressPercent === 0) {
      actProgressPercent = computeActProgressFromSummaries(p.taskSummaries);
    }
  }

  return {
    computedTakStart,
    computedTakCompl,
    computedOpening,
    status,
    planProgressPercent: planProgressPercent ?? 0,
    actProgressPercent: actProgressPercent ?? 0
  };
}
