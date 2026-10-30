import { Task, DelegationGroup } from "../../types";
import { parseDateTimeMs, parseDateMidnightMs, getTodayMidnightMs } from "./commonAndDateUtils";
import { getTaskStatus } from "./statusResolutionUtils";

export * from "./statusResolutionUtils";

export function computePlanProgressFromSummaries(
  summaries: Array<{ start?: string; finish?: string; [key: string]: any }>
): number {
  if (!summaries || summaries.length === 0) return 0;
  const todayTime = getTodayMidnightMs();

  let totalScore = 0;
  let validCount = 0;

  for (const s of summaries) {
    if (!s.start && !s.finish) continue;
    validCount++;

    const startMs = parseDateMidnightMs(s.start);
    const finishMs = parseDateMidnightMs(s.finish);

    if (finishMs !== null && todayTime > finishMs) {
      totalScore += 1;
    } else if (startMs !== null && finishMs !== null && todayTime >= startMs && todayTime <= finishMs) {
      const totalDuration = finishMs - startMs;
      if (totalDuration > 0) {
        const passed = todayTime - startMs;
        totalScore += passed / totalDuration;
      } else {
        totalScore += 1;
      }
    }
  }

  if (validCount === 0) return 0;
  return Math.round((totalScore / validCount) * 100);
}

export function computeActProgressFromSummaries(
  summaries: Array<{ start?: string; finish?: string; duration?: number | string; runningStatus?: string; approval?: string; isModularParent?: boolean; parentTaskId?: string; [key: string]: any }>
): number {
  if (!summaries || summaries.length === 0) return 0;
  const todayTime = getTodayMidnightMs();

  // 1. Double-counting guard: filter out modular parent tasks when subtasks exist
  const parentIds = new Set<string>();
  for (const s of summaries) {
    if (s.parentTaskId) parentIds.add(String(s.parentTaskId));
  }
  const leafSummaries = summaries.filter(s => {
    if (s.isModularParent) return false;
    if (s.id && parentIds.has(String(s.id))) return false;
    return true;
  });
  const effectiveSummaries = leafSummaries.length > 0 ? leafSummaries : summaries;

  let totalWeightedScore = 0;
  let totalDurationWeight = 0;

  for (const s of effectiveSummaries) {
    if (!s.start && !s.finish && !s.runningStatus && !s.actStatus && !s.status) continue;

    const startMs = parseDateMidnightMs(s.start);
    const finishMs = parseDateMidnightMs(s.finish);

    // Compute task duration weight in days (minimum 1 day)
    let weight = 1;
    if (s.duration !== undefined && s.duration !== null && !isNaN(Number(s.duration)) && Number(s.duration) > 0) {
      weight = Math.max(1, Number(s.duration));
    } else if (startMs !== null && finishMs !== null && finishMs >= startMs) {
      weight = Math.max(1, Math.round((finishMs - startMs) / (24 * 3600 * 1000)) + 1);
    }

    const statusStr = String(s.runningStatus || s.actStatus || s.status || s.delegationStatus || '').toLowerCase();
    const approvalStr = String(s.approval || s.approvalStatus || '').toLowerCase();

    let score = 0;

    // 2. Definitive completion / approval check
    if (statusStr.includes('complete') || statusStr.includes('finished') || approvalStr === 'approved') {
      score = 1.0;
    } else if (statusStr.includes('pending') || statusStr.includes('reqapproval') || statusStr.includes('waiting') || approvalStr === 'reqapproval' || approvalStr === 'requested') {
      score = 0.85;
    } else if (statusStr.includes('rework') || statusStr.includes('reject') || approvalStr === 'rejected' || approvalStr === 'reqreview') {
      score = 0.25;
    } else if (statusStr.includes('accept') || statusStr.includes('process') || statusStr.includes('progress') || statusStr.includes('doing') || approvalStr === 'accepttask') {
      // In progress: scale by elapsed time, capped at 0.85 (cannot be 1.0 until approved)
      if (startMs !== null && finishMs !== null && finishMs > startMs) {
        if (todayTime <= startMs) {
          score = 0.3;
        } else if (todayTime >= finishMs) {
          // Overdue in progress: capped at 0.85 since it's not marked finished
          score = 0.85;
        } else {
          const ratio = (todayTime - startMs) / (finishMs - startMs);
          score = Math.max(0.3, Math.min(0.85, ratio));
        }
      } else {
        score = 0.5;
      }
    } else if (statusStr.includes('delay') || statusStr.includes('delayed') || statusStr.includes('overdue')) {
      score = 0.5;
    } else {
      // 3. Fallback when no explicit status
      if (finishMs !== null && todayTime > finishMs) {
        // If past finish with no explicit status, treat as done only if no active blocker
        score = 1.0;
      } else if (startMs !== null && finishMs !== null && todayTime >= startMs && todayTime <= finishMs) {
        const totalDuration = finishMs - startMs;
        if (totalDuration > 0) {
          const passed = todayTime - startMs;
          score = Math.max(0.2, Math.min(0.9, passed / totalDuration));
        } else {
          score = 1.0;
        }
      } else {
        score = 0.0;
      }
    }

    totalWeightedScore += score * weight;
    totalDurationWeight += weight;
  }

  if (totalDurationWeight === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((totalWeightedScore / totalDurationWeight) * 100)));
}

export function computePlanProgressPercent(groupTasks: Task[]): number {
  if (groupTasks.length === 0) return 0;

  const todayTime = getTodayMidnightMs();
  let totalScore = 0;

  for (const t of groupTasks) {
    if (!t.start && !t.finish) continue;

    const startMs = parseDateMidnightMs(t.start);
    const finishMs = parseDateMidnightMs(t.finish);

    if (finishMs !== null && todayTime > finishMs) {
      totalScore += 1;
    } else if (startMs !== null && finishMs !== null && todayTime >= startMs && todayTime <= finishMs) {
      const totalDuration = finishMs - startMs;
      if (totalDuration > 0) {
        const passed = todayTime - startMs;
        totalScore += passed / totalDuration;
      } else {
        totalScore += 1;
      }
    }
  }

  return Math.round((totalScore / groupTasks.length) * 100);
}

export function getSubTaskProgressScore(st: {
  delegationStatus?: string;
  status?: string;
  approvalStatus?: string;
  [key: string]: any;
}): number {
  const status = (st.delegationStatus || st.status || "").toLowerCase();
  const approval = (st.approvalStatus || "").toLowerCase();

  if (
    ["completed", "approved", "finish", "finished"].includes(status) ||
    approval === "approved"
  ) {
    return 1.0;
  }
  if (
    [
      "pending completed",
      "waiting for approval",
      "reqapproval",
      "requested",
      "hold",
    ].includes(status) ||
    approval === "reqapproval" ||
    approval === "requested"
  ) {
    return 0.8;
  }
  if (
    [
      "accepted",
      "on process",
      "in progress",
      "inprogress",
      "doing",
      "accepttask",
    ].includes(status) ||
    approval === "accepttask"
  ) {
    return 0.5;
  }
  if (
    ["needs rework", "rejected", "reqreview"].includes(status) ||
    approval === "rejected" ||
    approval === "reqreview"
  ) {
    return 0.3;
  }
  return 0.0;
}

export function getActStatusPercent(status: string | undefined | null): number {
  if (!status) return 0;
  const s = String(status).trim().toLowerCase();

  if (["completed", "approved", "finish", "finished"].includes(s)) {
    return 100;
  }
  if (
    [
      "pending approval",
      "pending completed",
      "review late",
      "waiting for approval",
      "reqapproval",
      "requested",
      "hold",
    ].includes(s)
  ) {
    return 80;
  }
  if (
    [
      "accepted",
      "in progress",
      "on process",
      "inprogress",
      "doing",
      "accepttask",
      "delayed",
    ].includes(s)
  ) {
    return 50;
  }
  if (
    ["correction needed", "needs rework", "rejected", "reqreview"].includes(s)
  ) {
    return 30;
  }
  return 0;
}

export function computeDelegationGroupProgressPercent(group: DelegationGroup): number {
  if (!group || !group.subTasks || group.subTasks.length === 0) return 0;
  
  const rawScores = group.subTasks.map((st) => getSubTaskProgressScore(st));
  let maxCompletedIdx = -1;
  for (let i = 0; i < rawScores.length; i++) {
    if (rawScores[i] >= 1.0) {
      maxCompletedIdx = i;
    }
  }

  let totalScore = 0;
  for (let i = 0; i < rawScores.length; i++) {
    if (maxCompletedIdx !== -1 && i <= maxCompletedIdx) {
      totalScore += 1.0;
    } else {
      totalScore += rawScores[i];
    }
  }

  return Math.round((totalScore / group.subTasks.length) * 100);
}

export function computeActProgressPercent(
  groupTasks: Task[],
  delegationGroups: DelegationGroup[] | Map<string, DelegationGroup>,
): number {
  if (groupTasks.length === 0) return 0;

  const getGroup = (tid: string | undefined) => {
    if (!tid) return undefined;
    if (delegationGroups instanceof Map) return delegationGroups.get(tid);
    return delegationGroups.find((g) => g.parentTaskId === tid);
  };

  const todayTime = getTodayMidnightMs();

  const completedTaskStartTimestamps: number[] = [];

  for (const t of groupTasks) {
    const delegationGroup = getGroup(t.id);
    const subTasks = delegationGroup?.subTasks || [];
    let isCompleted = false;

    if (subTasks.length > 0) {
      isCompleted = subTasks.every((st) => {
        const s = (st.delegationStatus || st.status || "").toLowerCase();
        const a = (st.approvalStatus || "").toLowerCase();
        return (
          ["completed", "approved", "finish", "finished"].includes(s) || a === "approved"
        );
      });
    } else {
      const running = (t.runningStatus || "").toLowerCase();
      isCompleted = running.includes("complete") || t.approval === "Approved";
    }

    if (isCompleted) {
      const startTs = parseDateTimeMs(t.start) || 0;
      if (startTs > 0) completedTaskStartTimestamps.push(startTs);
    }
  }

  const maxCompletedStartTs =
    completedTaskStartTimestamps.length > 0
      ? Math.max(...completedTaskStartTimestamps)
      : 0;

  const rawScores: number[] = [];

  for (const t of groupTasks) {
    const delegationGroup = getGroup(t.id);
    const subTasks = delegationGroup?.subTasks || [];

    if (subTasks.length > 0 && delegationGroup) {
      const groupPct = computeDelegationGroupProgressPercent(delegationGroup);
      rawScores.push(groupPct / 100);
      continue;
    }

    const running = (t.runningStatus || "").toLowerCase();
    const approval = (t.approval || "").toLowerCase();

    if (running.includes("complete") || approval === "approved") {
      rawScores.push(1.0);
      continue;
    }

    const tFinishTs = parseDateTimeMs(t.finish) || 0;
    if (
      tFinishTs > 0 &&
      maxCompletedStartTs > 0 &&
      tFinishTs <= maxCompletedStartTs
    ) {
      rawScores.push(1.0);
      continue;
    }

    if (running.includes("process") || running.includes("progress")) {
      const startMs = parseDateTimeMs(t.start);
      const finishMs = parseDateTimeMs(t.finish);
      if (
        startMs !== null &&
        finishMs !== null &&
        todayTime >= startMs &&
        todayTime <= finishMs
      ) {
        const duration = finishMs - startMs;
        const passed = todayTime - startMs;
        rawScores.push(
          duration > 0 ? Math.max(0.3, Math.min(0.9, passed / duration)) : 0.5
        );
      } else {
        rawScores.push(0.5);
      }
      continue;
    }

    if (running.includes("delay")) {
      rawScores.push(0.5);
      continue;
    }

    if (approval === "pending" || approval === "requested") {
      rawScores.push(0.8);
      continue;
    }

    const plStatus = getTaskStatus(t.start, t.finish);
    if (plStatus === "Completed") {
      rawScores.push(1.0);
    } else if (plStatus === "On process") {
      const startMs = parseDateTimeMs(t.start);
      const finishMs = parseDateTimeMs(t.finish);
      if (
        startMs !== null &&
        finishMs !== null &&
        todayTime >= startMs &&
        todayTime <= finishMs
      ) {
        const duration = finishMs - startMs;
        const passed = todayTime - startMs;
        rawScores.push(
          duration > 0 ? Math.max(0.3, Math.min(0.9, passed / duration)) : 0.5
        );
      } else {
        rawScores.push(0.5);
      }
    } else {
      rawScores.push(0.0);
    }
  }

  let maxCompletedTaskIdx = -1;
  for (let i = 0; i < rawScores.length; i++) {
    if (rawScores[i] >= 1.0) {
      maxCompletedTaskIdx = i;
    }
  }

  let totalScore = 0;
  for (let i = 0; i < rawScores.length; i++) {
    if (maxCompletedTaskIdx !== -1 && i <= maxCompletedTaskIdx) {
      totalScore += 1.0;
    } else {
      totalScore += rawScores[i];
    }
  }

  return Math.round((totalScore / groupTasks.length) * 100);
}
