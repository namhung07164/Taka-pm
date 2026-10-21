import { Task, Project, TaskPredecessor, PredecessorType } from '../types';
import { computeTaskCode } from './ganttUtils';
import { parseDateTime, formatToDatetimeLocal } from './utils';

/**
 * Resolves the cleanest task code for predecessor references (e.g. A01#1 or taskCodePhu).
 */
export function getTaskPredecessorRefCode(
  task: Task,
  projects: Project[] = [],
  allTasks: Task[] = []
): string {
  if (task.taskCodePhu && task.taskCodePhu.trim()) {
    return task.taskCodePhu.trim();
  }
  const computed = computeTaskCode(projects, allTasks, task);
  if (computed && computed.trim()) {
    return computed.trim();
  }
  if (task.projectCode) {
    const idx = task.orderIndex !== undefined ? Number(task.orderIndex) + 1 : 1;
    return `${task.projectCode}#${idx}`;
  }
  return task.id;
}

export interface ParentPredecessorPatch {
  predecessor: string;
  predecessors: TaskPredecessor[];
  predecessorTaskIds: string[];
  start: string;
  finish: string;
  duration: string;
  durationManual: boolean;
  isModularParent: boolean;
  runningStatus?: any;
  updatedAt: string;
}

/**
 * Computes start date, end date, duration and sets multi-predecessors:
 * - SS with the earliest start child task
 * - FF with the latest finish child task
 */
export function calculateParentTaskPredecessorsAndDates(
  parentTask: Task,
  childTasks: Task[],
  projects: Project[] = [],
  allTasks: Task[] = []
): ParentPredecessorPatch | null {
  if (!parentTask || !Array.isArray(childTasks) || childTasks.length === 0) {
    return null;
  }

  // Filter valid, non-deleted children with at least a start or finish date
  const validChildren = childTasks.filter(
    (c) => c && !c.isDeleted && String(c.id) !== String(parentTask.id) && (c.start || c.finish)
  );

  if (validChildren.length === 0) {
    return null;
  }

  let earliestChild: Task | null = null;
  let minStartMs = Infinity;

  let latestChild: Task | null = null;
  let maxFinishMs = -Infinity;

  let allCompleted = true;
  let hasInProcess = false;

  for (const child of validChildren) {
    const sDate = child.start ? parseDateTime(child.start) : null;
    const fDate = child.finish ? parseDateTime(child.finish) : null;

    const childStartMs = sDate ? sDate.getTime() : (fDate ? fDate.getTime() : null);
    const childFinishMs = fDate ? fDate.getTime() : (sDate ? sDate.getTime() : null);

    if (childStartMs !== null && childStartMs < minStartMs) {
      minStartMs = childStartMs;
      earliestChild = child;
    }

    if (childFinishMs !== null && childFinishMs > maxFinishMs) {
      maxFinishMs = childFinishMs;
      latestChild = child;
    }

    const status = String(child.runningStatus || '').toLowerCase();
    if (status !== 'completed' && status !== 'pj compl' && status !== 'done' && status !== '100%') {
      allCompleted = false;
    }
    if (status === 'on process' || status === 'in progress' || status === 'running') {
      hasInProcess = true;
    }
  }

  if (!earliestChild || !latestChild) {
    return null;
  }

  const tasksContext = allTasks.length > 0 ? allTasks : validChildren;
  const earliestCode = getTaskPredecessorRefCode(earliestChild, projects, tasksContext);
  const latestCode = getTaskPredecessorRefCode(latestChild, projects, tasksContext);

  // Multi-predecessor format: <earliestCode>SS, <latestCode>FF
  const predecessorStr = `${earliestCode}SS, ${latestCode}FF`;

  const predecessors: TaskPredecessor[] = [
    { taskId: earliestChild.id, type: 'SS' as PredecessorType },
    { taskId: latestChild.id, type: 'FF' as PredecessorType },
  ];

  const predecessorTaskIds = [earliestChild.id, latestChild.id];

  const newStart = earliestChild.start || earliestChild.finish || '';
  const newFinish = latestChild.finish || latestChild.start || '';

  let newDuration = parentTask.duration || '0';
  if (minStartMs !== Infinity && maxFinishMs !== -Infinity && maxFinishMs >= minStartMs) {
    const diffDays = (maxFinishMs - minStartMs) / (1000 * 60 * 60 * 24);
    newDuration = String(Number(diffDays.toFixed(2)));
  }

  let runningStatus = parentTask.runningStatus;
  if (allCompleted) {
    runningStatus = 'Completed';
  } else if (hasInProcess) {
    runningStatus = 'On process';
  }

  return {
    predecessor: predecessorStr,
    predecessors,
    predecessorTaskIds,
    start: newStart,
    finish: newFinish,
    duration: newDuration,
    durationManual: true,
    isModularParent: true,
    runningStatus: runningStatus as any,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Applies parent multi-predecessors (SS earliest child, FF latest child) and dates
 * across an entire task list.
 */
export function applyParentPredecessorsToTaskTree(
  tasks: Task[],
  projects: Project[] = []
): { updatedTasks: Task[]; updatedParents: Task[] } {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { updatedTasks: tasks || [], updatedParents: [] };
  }

  const childrenMap = new Map<string, Task[]>();
  const taskById = new Map<string, Task>();

  for (const t of tasks) {
    if (!t || !t.id || t.isDeleted) continue;
    taskById.set(t.id, t);
    const pId = t.parentTaskId || (t as any).parentId;
    if (pId) {
      const pIdStr = String(pId).trim();
      let list = childrenMap.get(pIdStr);
      if (!list) {
        list = [];
        childrenMap.set(pIdStr, list);
      }
      list.push(t);
    }
  }

  if (childrenMap.size === 0) {
    return { updatedTasks: tasks, updatedParents: [] };
  }

  const updatedTasks: Task[] = [];
  const updatedParents: Task[] = [];

  for (const t of tasks) {
    if (!t || !t.id) {
      updatedTasks.push(t);
      continue;
    }

    const children = childrenMap.get(t.id);
    if (!children || children.length === 0) {
      updatedTasks.push(t);
      continue;
    }

    const patch = calculateParentTaskPredecessorsAndDates(t, children, projects, tasks);
    if (patch) {
      const updatedParent: Task = {
        ...t,
        ...patch,
      };
      updatedTasks.push(updatedParent);
      updatedParents.push(updatedParent);
    } else {
      updatedTasks.push(t);
    }
  }

  return { updatedTasks, updatedParents };
}
