import { Task, DelegationGroup } from '../types';

/**
 * Promotes orphan subtasks (whose parentTaskId is missing or deleted) to root tasks in memory
 * so parent rollup dates and task counts remain 100% consistent before and after project expansion.
 */
export function filterNonOrphanTasks(tasks: Task[]): { cleaned: Task[]; fixedCount: number } {
  if (!tasks || tasks.length === 0) return { cleaned: tasks || [], fixedCount: 0 };

  const taskMap = new Map<string, Task>();
  const taskCodeMap = new Map<string, Task>();

  tasks.forEach(t => {
    if (!t || t.isDeleted) return;
    if (t.id) taskMap.set(String(t.id).toLowerCase(), t);
    if (t.taskCodePhu) taskCodeMap.set(String(t.taskCodePhu).trim().toLowerCase(), t);
  });

  let fixedCount = 0;
  const cleaned = tasks.map(t => {
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (!rawParent) return t;

    const parentStr = String(rawParent).trim().toLowerCase();
    const parentTask = taskMap.get(parentStr) || taskCodeMap.get(parentStr);

    if (!parentTask || parentTask.isDeleted || String(parentTask.id) === String(t.id)) {
      fixedCount++;
      const updated = { ...t, parentTaskId: undefined };
      delete (updated as any).parentId;
      return updated;
    }

    return t;
  });

  return { cleaned, fixedCount };
}

/**
 * Computes rolled up start date, finish date, duration, and status for parent tasks
 * based on their child tasks (recursive with circular loop detection).
 */
export function rollupParentTaskDatesAndStatus(
  tasks: Task[],
  delegationGroups?: DelegationGroup[]
): Task[] {
  if (!Array.isArray(tasks) || tasks.length === 0) return tasks || [];

  // Group children by parentTaskId
  const childrenMap = new Map<string, Task[]>();
  const taskMap = new Map<string, Task>();

  tasks.forEach((t) => {
    if (!t || !t.id || t.isDeleted) return;
    taskMap.set(t.id, t);
    if (t.parentTaskId) {
      const list = childrenMap.get(t.parentTaskId) || [];
      list.push(t);
      childrenMap.set(t.parentTaskId, list);
    }
  });

  if (childrenMap.size === 0) return tasks;

  const result = [...tasks];

  // Helper to recursively collect leaf/child dates for a parent with circular guard
  function getRolledUpDatesAndStatus(
    parentId: string,
    visited = new Set<string>()
  ): { start: string; finish: string; allCompleted: boolean; hasInProcess: boolean } | null {
    if (visited.has(parentId)) return null;
    visited.add(parentId);

    const children = childrenMap.get(parentId);
    if (!children || children.length === 0) return null;

    let minStart = '';
    let maxFinish = '';
    let allCompleted = true;
    let hasInProcess = false;

    for (const child of children) {
      const subRollup = getRolledUpDatesAndStatus(child.id, new Set(visited));
      const childStart = subRollup ? subRollup.start : (child.start || '');
      const childFinish = subRollup ? subRollup.finish : (child.finish || '');

      if (childStart) {
        if (!minStart || childStart < minStart) minStart = childStart;
      }
      if (childFinish) {
        if (!maxFinish || childFinish > maxFinish) maxFinish = childFinish;
      }

      const status = String(child.runningStatus || '').toLowerCase();
      if (status !== 'completed' && status !== 'pj compl' && status !== 'done' && status !== '100%') {
        allCompleted = false;
      }
      if (status === 'on process' || status === 'in progress' || status === 'running') {
        hasInProcess = true;
      }
    }

    return { start: minStart, finish: maxFinish, allCompleted, hasInProcess };
  }

  // Update parent tasks
  for (let i = 0; i < result.length; i++) {
    const task = result[i];
    if (!task || !task.id) continue;
    
    if (childrenMap.has(task.id)) {
      const rolled = getRolledUpDatesAndStatus(task.id);
      if (rolled) {
        const newStart = rolled.start || '';
        const newFinish = rolled.finish || '';

        let newStatus = task.runningStatus;
        if (rolled.allCompleted) {
          newStatus = 'Completed';
        } else if (rolled.hasInProcess) {
          newStatus = 'On process';
        }

        if (newStart !== (task.start || '') || newFinish !== (task.finish || '') || newStatus !== task.runningStatus) {
          result[i] = {
            ...task,
            start: newStart,
            finish: newFinish,
            runningStatus: newStatus as any,
          };
        }
      }
    }
  }

  return result;
}

/**
 * Rolls up task summaries for project computed summaries.
 */
export function rollupTaskSummaries(summaries: any[]): any[] {
  if (!Array.isArray(summaries) || summaries.length === 0) return summaries || [];

  const childrenMap = new Map<string, any[]>();
  summaries.forEach((s) => {
    if (s && s.id && s.parentTaskId) {
      const list = childrenMap.get(s.parentTaskId) || [];
      list.push(s);
      childrenMap.set(s.parentTaskId, list);
    }
  });

  if (childrenMap.size === 0) return summaries;

  const result = [...summaries];

  function getSummaryRollup(parentId: string, visited = new Set<string>()): { start: string; finish: string } | null {
    if (visited.has(parentId)) return null;
    visited.add(parentId);

    const children = childrenMap.get(parentId);
    if (!children || children.length === 0) return null;

    let minStart = '';
    let maxFinish = '';

    for (const child of children) {
      const childId = child.id;
      const sub = childId ? getSummaryRollup(childId, new Set(visited)) : null;
      const cStart = sub ? sub.start : (child.start || '');
      const cFinish = sub ? sub.finish : (child.finish || '');

      if (cStart && (!minStart || cStart < minStart)) minStart = cStart;
      if (cFinish && (!maxFinish || cFinish > maxFinish)) maxFinish = cFinish;
    }

    return { start: minStart, finish: maxFinish };
  }

  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (item && item.id && childrenMap.has(item.id)) {
      const rolled = getSummaryRollup(item.id);
      if (rolled) {
        result[i] = {
          ...item,
          start: rolled.start || '',
          finish: rolled.finish || '',
        };
      }
    }
  }

  return result;
}

