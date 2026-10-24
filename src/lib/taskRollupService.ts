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

interface RollupNodeResult {
  start: string;
  finish: string;
  allCompleted: boolean;
  hasInProcess: boolean;
  earliestChild: Task | null;
  latestChild: Task | null;
}

function getTaskRefCodeForRollup(t: Task): string {
  if (t.taskCodePhu && String(t.taskCodePhu).trim()) {
    return String(t.taskCodePhu).trim();
  }
  if (t.projectCode && t.orderIndex !== undefined && t.orderIndex !== null) {
    return `${String(t.projectCode).trim()}#${Number(t.orderIndex) + 1}`;
  }
  return t.id;
}

let _lastRollupInputRef: Task[] | null = null;
let _lastRollupOutputRef: Task[] | null = null;

/**
 * Computes rolled up start date, finish date, duration, status, and SS/FF predecessors
 * for parent tasks based on their child tasks in O(N) time with subtree memoization and circular loop guard.
 */
export function rollupParentTaskDatesAndStatus(
  tasks: Task[],
  _delegationGroups?: DelegationGroup[]
): Task[] {
  if (!Array.isArray(tasks) || tasks.length === 0) return tasks || [];
  if (_lastRollupInputRef === tasks && _lastRollupOutputRef) {
    return _lastRollupOutputRef;
  }

  const childrenMap = new Map<string, Task[]>();

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!t || !t.id || t.isDeleted || !t.parentTaskId) continue;
    let list = childrenMap.get(t.parentTaskId);
    if (!list) {
      list = [];
      childrenMap.set(t.parentTaskId, list);
    }
    list.push(t);
  }

  if (childrenMap.size === 0) {
    _lastRollupInputRef = tasks;
    _lastRollupOutputRef = tasks;
    return tasks;
  }

  const result = [...tasks];
  const memoRollup = new Map<string, RollupNodeResult | null>();
  const visiting = new Set<string>();

  function getRolledUpDatesAndStatus(parentId: string): RollupNodeResult | null {
    if (memoRollup.has(parentId)) return memoRollup.get(parentId)!;
    if (visiting.has(parentId)) return null;

    const children = childrenMap.get(parentId);
    if (!children || children.length === 0) {
      memoRollup.set(parentId, null);
      return null;
    }

    visiting.add(parentId);
    let minStart = '';
    let maxFinish = '';
    let minStartTime = Infinity;
    let maxFinishTime = -Infinity;
    let earliestChild: Task | null = null;
    let latestChild: Task | null = null;
    let allCompleted = true;
    let hasInProcess = false;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const subRollup = child.id ? getRolledUpDatesAndStatus(child.id) : null;
      const childStart = subRollup ? subRollup.start : (child.start || '');
      const childFinish = subRollup ? subRollup.finish : (child.finish || childStart || '');

      if (childStart) {
        const sTime = new Date(childStart).getTime();
        if (!isNaN(sTime)) {
          if (sTime < minStartTime) {
            minStartTime = sTime;
            minStart = childStart;
            earliestChild = child;
          }
        } else if (!minStart || childStart < minStart) {
          minStart = childStart;
          earliestChild = child;
        }
      }

      if (childFinish) {
        const fTime = new Date(childFinish).getTime();
        if (!isNaN(fTime)) {
          if (fTime >= maxFinishTime) {
            maxFinishTime = fTime;
            maxFinish = childFinish;
            latestChild = child;
          }
        } else if (!maxFinish || childFinish >= maxFinish) {
          maxFinish = childFinish;
          latestChild = child;
        }
      }

      const status = String(child.runningStatus || '').toLowerCase();
      if (status !== 'completed' && status !== 'pj compl' && status !== 'done' && status !== '100%') {
        allCompleted = false;
      }
      if (status === 'on process' || status === 'in progress' || status === 'running') {
        hasInProcess = true;
      }
    }

    visiting.delete(parentId);
    const computed: RollupNodeResult = {
      start: minStart,
      finish: maxFinish,
      allCompleted,
      hasInProcess,
      earliestChild,
      latestChild,
    };
    memoRollup.set(parentId, computed);
    return computed;
  }

  for (let i = 0; i < result.length; i++) {
    const task = result[i];
    if (!task || !task.id || !childrenMap.has(task.id)) continue;

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

      let newPredecessor = task.predecessor || '';
      let newPredecessorTaskIds = task.predecessorTaskIds;
      let newPredecessors = task.predecessors;
      let newDuration = task.duration;

      if (rolled.earliestChild && rolled.latestChild) {
        const earliestCode = getTaskRefCodeForRollup(rolled.earliestChild);
        const latestCode = getTaskRefCodeForRollup(rolled.latestChild);
        newPredecessor = `${earliestCode}SS, ${latestCode}FF`;
        newPredecessorTaskIds = [rolled.earliestChild.id, rolled.latestChild.id];
        newPredecessors = [
          { taskId: rolled.earliestChild.id, type: 'SS', lagDays: 0 },
          { taskId: rolled.latestChild.id, type: 'FF', lagDays: 0 },
        ];
      }

      if (newStart && newFinish) {
        const sMs = new Date(newStart).getTime();
        const fMs = new Date(newFinish).getTime();
        if (!isNaN(sMs) && !isNaN(fMs)) {
          const diffDays = Math.max(0, Math.round((fMs - sMs) / (1000 * 60 * 60 * 24)));
          newDuration = String(diffDays);
        }
      }

      const predIdsChanged =
        !task.predecessorTaskIds ||
        !newPredecessorTaskIds ||
        task.predecessorTaskIds[0] !== newPredecessorTaskIds[0] ||
        task.predecessorTaskIds[1] !== newPredecessorTaskIds[1];

      if (
        newStart !== (task.start || '') ||
        newFinish !== (task.finish || '') ||
        newStatus !== task.runningStatus ||
        newPredecessor !== (task.predecessor || '') ||
        newDuration !== task.duration ||
        predIdsChanged
      ) {
        result[i] = {
          ...task,
          start: newStart,
          finish: newFinish,
          duration: newDuration,
          runningStatus: newStatus as any,
          predecessor: newPredecessor,
          predecessorTaskIds: newPredecessorTaskIds,
          predecessors: newPredecessors,
          isModularParent: true,
        };
      }
    }
  }

  _lastRollupInputRef = tasks;
  _lastRollupOutputRef = result;
  return result;
}

/**
 * Rolls up task summaries for project computed summaries in O(N).
 */
export function rollupTaskSummaries(summaries: any[]): any[] {
  if (!Array.isArray(summaries) || summaries.length === 0) return summaries || [];

  const childrenMap = new Map<string, any[]>();
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    if (s && s.id && s.parentTaskId) {
      let list = childrenMap.get(s.parentTaskId);
      if (!list) {
        list = [];
        childrenMap.set(s.parentTaskId, list);
      }
      list.push(s);
    }
  }

  if (childrenMap.size === 0) return summaries;

  const result = [...summaries];
  const memoSummary = new Map<string, { start: string; finish: string } | null>();
  const visiting = new Set<string>();

  function getSummaryRollup(parentId: string): { start: string; finish: string } | null {
    if (memoSummary.has(parentId)) return memoSummary.get(parentId)!;
    if (visiting.has(parentId)) return null;

    const children = childrenMap.get(parentId);
    if (!children || children.length === 0) {
      memoSummary.set(parentId, null);
      return null;
    }

    visiting.add(parentId);
    let minStart = '';
    let maxFinish = '';

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const sub = child.id ? getSummaryRollup(child.id) : null;
      const cStart = sub ? sub.start : (child.start || '');
      const cFinish = sub ? sub.finish : (child.finish || '');

      if (cStart && (!minStart || cStart < minStart)) minStart = cStart;
      if (cFinish && (!maxFinish || cFinish > maxFinish)) maxFinish = cFinish;
    }

    visiting.delete(parentId);
    const out = { start: minStart, finish: maxFinish };
    memoSummary.set(parentId, out);
    return out;
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
