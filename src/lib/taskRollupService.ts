import { Task, DelegationGroup } from '../types';
import { parseDateTime, computeActProgressPercent, getTaskStatus } from './utils';

/**
 * Pure in-memory rollup engine for parent tasks (Rule 9 mandate):
 * Automatically computes start date, finish date, duration, progress %, and running status
 * for parent tasks based on their child tasks.
 * Includes circular dependency protection using a visited Set.
 */
export function rollupParentTaskDatesAndStatus(
  tasks: Task[],
  delegationGroups: DelegationGroup[] = [],
  expandedTaskIdsSet?: Set<string>
): Task[] {
  if (!Array.isArray(tasks) || tasks.length === 0) return tasks;

  // 1. Build fast lookup maps
  const taskById = new Map<string, Task>();
  const taskByCode = new Map<string, Task>();
  const childMap = new Map<string, Task[]>();

  tasks.forEach((t) => {
    if (!t || !t.id || t.isDeleted) return;
    taskById.set(String(t.id), t);
    if (t.taskCodePhu) {
      taskByCode.set(String(t.taskCodePhu).trim().toLowerCase(), t);
    }
  });

  // 2. Map parent tasks to direct children
  tasks.forEach((t) => {
    if (!t || !t.id || t.isDeleted) return;
    const rawParentId = t.parentTaskId || (t as any).parentId;
    if (rawParentId) {
      const parentKey = String(rawParentId).trim().toLowerCase();
      const parentTask = taskById.get(String(rawParentId)) || taskByCode.get(parentKey);
      if (parentTask && String(parentTask.id) !== String(t.id)) {
        const pIdStr = String(parentTask.id);
        let list = childMap.get(pIdStr);
        if (!list) {
          list = [];
          childMap.set(pIdStr, list);
        }
        list.push(t);
      }
    }
  });

  if (childMap.size === 0) {
    return tasks;
  }

  // 3. Process parents bottom-up
  const resultTaskMap = new Map<string, Task>();
  tasks.forEach((t) => {
    if (t && t.id) {
      resultTaskMap.set(String(t.id), { ...t });
    }
  });

  const parentIdsToProcess = new Set<string>(childMap.keys());
  const visited = new Set<string>();

  for (const parentId of parentIdsToProcess) {
    if (visited.has(parentId)) continue;

    const processParent = (pId: string): Task | null => {
      if (visited.has(pId)) return resultTaskMap.get(pId) || null;
      visited.add(pId);

      const parentTask = resultTaskMap.get(pId);
      if (!parentTask) return null;

      const directChildren = childMap.get(pId) || [];
      if (directChildren.length === 0) return parentTask;

      // Ensure any child that is ALSO a parent gets processed first (bottom-up)
      const rolledUpChildren = directChildren.map((child) => {
        const childIdStr = String(child.id);
        if (childMap.has(childIdStr) && !visited.has(childIdStr)) {
          return processParent(childIdStr) || child;
        }
        return resultTaskMap.get(childIdStr) || child;
      });

      // User Rule: If expandedTaskIdsSet is provided and this parent task is NOT expanded,
      // keep its initial summarized data! Only recalculate/rollup when expanded.
      if (expandedTaskIdsSet) {
        const isExpanded =
          expandedTaskIdsSet.has(pId) ||
          (parentTask.id && expandedTaskIdsSet.has(String(parentTask.id))) ||
          (parentTask.taskCodePhu && expandedTaskIdsSet.has(String(parentTask.taskCodePhu).trim().toLowerCase()));

        if (!isExpanded) {
          return parentTask;
        }
      }

      // Compute rolled up dates
      const validStarts = rolledUpChildren
        .map((c) => c.start)
        .filter(Boolean)
        .sort();

      const validFinishes = rolledUpChildren
        .map((c) => c.finish)
        .filter(Boolean)
        .sort((a, b) => (b || '').localeCompare(a || ''));

      if (validStarts.length > 0 && validFinishes.length > 0) {
        const earliestStart = validStarts[0];
        const latestFinish = validFinishes[0];

        const sDate = parseDateTime(earliestStart);
        const fDate = parseDateTime(latestFinish);
        let durationDays = '0';
        if (sDate && fDate && !isNaN(sDate.getTime()) && !isNaN(fDate.getTime())) {
          const diffMs = fDate.getTime() - sDate.getTime();
          durationDays = diffMs >= 0 ? String(Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)))) : '0';
        }

        // Compute aggregate progress & status from children
        let totalProgress = 0;
        let completedCount = 0;
        let delayedCount = 0;
        let onProcessCount = 0;

        rolledUpChildren.forEach((c) => {
          const prg = computeActProgressPercent([c], delegationGroups);
          totalProgress += prg;

          const st = (c.runningStatus || '').toLowerCase();
          const planSt = getTaskStatus(c.start, c.finish);

          if (st.includes('complete') || prg >= 100 || c.approval === 'Approved') {
            completedCount++;
          } else if (st.includes('delay') || planSt === 'Delayed') {
            delayedCount++;
          } else if (st.includes('process') || st.includes('progress') || prg > 0 || planSt === 'On process') {
            onProcessCount++;
          }
        });

        const avgProgress = rolledUpChildren.length > 0 ? Math.round(totalProgress / rolledUpChildren.length) : 0;

        let rolledUpRunningStatus = parentTask.runningStatus || 'On process';
        if (completedCount === rolledUpChildren.length) {
          rolledUpRunningStatus = 'Completed';
        } else if (delayedCount > 0) {
          rolledUpRunningStatus = 'Delayed';
        } else if (onProcessCount > 0 || avgProgress > 0) {
          rolledUpRunningStatus = 'On process';
        }

        parentTask.start = earliestStart;
        parentTask.finish = latestFinish;
        parentTask.duration = durationDays;
        parentTask.runningStatus = rolledUpRunningStatus;
        if (completedCount === rolledUpChildren.length) {
          parentTask.approval = 'Approved';
        }

        resultTaskMap.set(pId, parentTask);
      }

      return parentTask;
    };

    processParent(parentId);
  }

  return tasks.map((t) => resultTaskMap.get(String(t.id)) || t);
}

/**
 * Pure in-memory rollup engine for project taskSummaries:
 * Ensures parent task summaries retain rolled-up start/finish/duration/runningStatus.
 */
export function rollupTaskSummaries(summaries: any[]): any[] {
  if (!Array.isArray(summaries) || summaries.length === 0) return summaries;

  const summaryById = new Map<string, any>();
  const childMap = new Map<string, any[]>();

  summaries.forEach((ts, idx) => {
    if (!ts) return;
    const key = ts.id || ts.taskCodePhu || `ts_${idx}`;
    summaryById.set(String(key), { ...ts });
  });

  summaries.forEach((ts, idx) => {
    if (!ts || !ts.parentTaskId) return;
    const parentKey = String(ts.parentTaskId).trim();
    let parentItem = summaryById.get(parentKey);
    if (!parentItem) {
      for (const item of summaryById.values()) {
        if (item.taskCodePhu && String(item.taskCodePhu).trim().toLowerCase() === parentKey.toLowerCase()) {
          parentItem = item;
          break;
        }
      }
    }
    if (parentItem) {
      const pKeyStr = String(parentItem.id || parentItem.taskCodePhu);
      let list = childMap.get(pKeyStr);
      if (!list) {
        list = [];
        childMap.set(pKeyStr, list);
      }
      list.push(ts);
    }
  });

  if (childMap.size === 0) return summaries;

  const resultSummaries = summaries.map((ts, idx) => {
    const key = ts.id || ts.taskCodePhu || `ts_${idx}`;
    const pKeyStr = String(key);
    const children = childMap.get(pKeyStr);

    if (children && children.length > 0) {
      const validStarts = children.map((c) => c.start).filter(Boolean).sort();
      const validFinishes = children.map((c) => c.finish).filter(Boolean).sort((a: string, b: string) => (b || '').localeCompare(a || ''));

      if (validStarts.length > 0 && validFinishes.length > 0) {
        const earliestStart = validStarts[0];
        const latestFinish = validFinishes[0];
        const sDate = parseDateTime(earliestStart);
        const fDate = parseDateTime(latestFinish);
        let durationDays = ts.duration;
        if (sDate && fDate && !isNaN(sDate.getTime()) && !isNaN(fDate.getTime())) {
          const diffMs = fDate.getTime() - sDate.getTime();
          durationDays = diffMs >= 0 ? String(Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)))) : '0';
        }

        let completedCount = 0;
        children.forEach((c) => {
          if ((c.runningStatus || '').toLowerCase().includes('complete')) {
            completedCount++;
          }
        });
        const runningStatus = completedCount === children.length ? 'Completed' : (ts.runningStatus || 'On process');

        return {
          ...ts,
          start: earliestStart,
          finish: latestFinish,
          duration: durationDays,
          runningStatus,
        };
      }
    }
    return ts;
  });

  return resultSummaries;
}
