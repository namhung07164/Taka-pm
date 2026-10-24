import { Task, DelegationGroup } from '../types';
import { normalizeDashes } from './utils';
import { isTaskBelongToSameParentScope } from './parentHierarchyUtils';

function extractNumericSuffix(codeOrPhu?: string | null): number | null {
  if (!codeOrPhu) return null;
  const str = normalizeDashes(String(codeOrPhu)).trim();
  const m = str.match(/#\s*(\d+)/) || str.match(/[-_.:/\s]+(\d+)\s*$/) || str.match(/^(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function getTaskProjectScopeKeys(t: Partial<Task>): string[] {
  const keys: string[] = [];
  if (t.projectId && String(t.projectId).trim()) {
    keys.push(`pid:${String(t.projectId).trim().toLowerCase()}`);
  }
  const code = String(t.projectCode || '').trim().toLowerCase();
  const year = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
  const store = String(t.projectStore || '').trim().toLowerCase();
  if (code || year || store) {
    keys.push(`key:${code}|${year}|${store}`);
    if (code && store) keys.push(`key:${code}|*|${store}`);
    if (code && year) keys.push(`key:${code}|${year}|*`);
  }
  if (keys.length === 0) keys.push('key:||');
  return keys;
}

function getPrimaryTaskScopeKey(t: Partial<Task>): string {
  const code = String(t.projectCode || '').trim().toLowerCase();
  const year = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
  const store = String(t.projectStore || '').trim().toLowerCase();
  if (code) return `key:${code}|${year}|${store}`;
  if (t.projectId && String(t.projectId).trim()) return `pid:${String(t.projectId).trim().toLowerCase()}`;
  return 'key:||';
}

function compareTasksForCanonicalCode(a: Task, b: Task): number {
  const ordA = a.orderIndex !== undefined && a.orderIndex !== null ? Number(a.orderIndex) : null;
  const ordB = b.orderIndex !== undefined && b.orderIndex !== null ? Number(b.orderIndex) : null;
  if (ordA !== null && ordB !== null && ordA !== ordB) return ordA - ordB;
  if (ordA !== null && ordB === null) return -1;
  if (ordA === null && ordB !== null) return 1;
  const codeA = a.taskCodePhu || (a.projectCode && ordA !== null ? `${a.projectCode}#${ordA + 1}` : a.name || '');
  const codeB = b.taskCodePhu || (b.projectCode && ordB !== null ? `${b.projectCode}#${ordB + 1}` : b.name || '');
  const numA = extractNumericSuffix(codeA);
  const numB = extractNumericSuffix(codeB);
  if (numA !== null && numB !== null && numA !== numB) return numA - numB;
  if (numA !== null && numB === null) return -1;
  if (numA === null && numB !== null) return 1;
  if (a.start && b.start && a.start !== b.start) return a.start.localeCompare(b.start);
  if (a.finish && b.finish && a.finish !== b.finish) return a.finish.localeCompare(b.finish);
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function buildCanonicalTaskContext(tasks: Task[]): {
  taskByIdLower: Map<string, Task>;
  scopedTaskByCode: Map<string, Task>;
  scopedTaskByName: Map<string, Task>;
  canonicalCodeByTaskId: Map<string, string>;
} {
  const taskByIdLower = new Map<string, Task>();
  const scopedTaskByCode = new Map<string, Task>();
  const scopedTaskByName = new Map<string, Task>();
  const canonicalCodeByTaskId = new Map<string, string>();
  const groupsByPrimaryScope = new Map<string, Task[]>();

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!t || t.isDeleted) continue;
    const scopes = getTaskProjectScopeKeys(t);
    const primaryScope = getPrimaryTaskScopeKey(t);
    if (t.id) taskByIdLower.set(String(t.id).trim().toLowerCase(), t);

    for (let sIdx = 0; sIdx < scopes.length; sIdx++) {
      const scope = scopes[sIdx];
      if (t.taskCodePhu) {
        const cLower = String(t.taskCodePhu).trim().toLowerCase();
        scopedTaskByCode.set(`${scope}:::${cLower}`, t);
        if (cLower.includes('-')) scopedTaskByCode.set(`${scope}:::${cLower.replace(/-(\d+)$/, '#$1')}`, t);
        const num = extractNumericSuffix(cLower);
        if (num !== null) {
          scopedTaskByCode.set(`${scope}:::#${num}`, t);
          scopedTaskByCode.set(`${scope}:::${num}`, t);
        }
      }
      if (t.orderIndex !== undefined && t.orderIndex !== null && !isNaN(Number(t.orderIndex))) {
        const ordNum = Number(t.orderIndex) + 1;
        if (!scopedTaskByCode.has(`${scope}:::#${ordNum}`)) scopedTaskByCode.set(`${scope}:::#${ordNum}`, t);
        if (!scopedTaskByCode.has(`${scope}:::${ordNum}`)) scopedTaskByCode.set(`${scope}:::${ordNum}`, t);
      }
      if (t.name && String(t.name).trim()) {
        const nLower = String(t.name).trim().toLowerCase();
        if (!scopedTaskByName.has(`${scope}:::${nLower}`) || t.isModularParent) {
          scopedTaskByName.set(`${scope}:::${nLower}`, t);
        }
      }
    }

    const list = groupsByPrimaryScope.get(primaryScope) || [];
    if (list.length === 0) groupsByPrimaryScope.set(primaryScope, list);
    list.push(t);
  }

  groupsByPrimaryScope.forEach((groupTasks) => {
    const sorted = [...groupTasks].sort(compareTasksForCanonicalCode);
    for (let idx = 0; idx < sorted.length; idx++) {
      const t = sorted[idx];
      const pCode = String(t.projectCode || '').trim();
      const canonicalCode = pCode ? `${pCode}#${idx + 1}` : (t.taskCodePhu ? String(t.taskCodePhu).trim() : t.id);
      if (t.id && canonicalCode) canonicalCodeByTaskId.set(t.id, canonicalCode);
      const cLower = canonicalCode.toLowerCase();
      const scopes = getTaskProjectScopeKeys(t);
      for (let sIdx = 0; sIdx < scopes.length; sIdx++) {
        const scope = scopes[sIdx];
        if (!scopedTaskByCode.has(`${scope}:::${cLower}`)) scopedTaskByCode.set(`${scope}:::${cLower}`, t);
        if (!scopedTaskByCode.has(`${scope}:::#${idx + 1}`)) scopedTaskByCode.set(`${scope}:::#${idx + 1}`, t);
        if (!scopedTaskByCode.has(`${scope}:::${idx + 1}`)) scopedTaskByCode.set(`${scope}:::${idx + 1}`, t);
      }
    }
  });

  return { taskByIdLower, scopedTaskByCode, scopedTaskByName, canonicalCodeByTaskId };
}

function resolveParentTaskInScope(
  child: Task,
  taskByIdLower: Map<string, Task>,
  scopedTaskByCode: Map<string, Task>,
  scopedTaskByName?: Map<string, Task>
): Task | undefined {
  const rawParent = child.parentTaskId || (child as any).parentId;
  if (!rawParent) return undefined;
  const parentStr = String(rawParent).trim().toLowerCase();
  if (!parentStr) return undefined;

  const byId = taskByIdLower.get(parentStr);
  if (byId && String(byId.id) !== String(child.id) && isTaskBelongToSameParentScope(child, byId)) return byId;

  const scopes = getTaskProjectScopeKeys(child);
  for (let sIdx = 0; sIdx < scopes.length; sIdx++) {
    const scope = scopes[sIdx];
    const byScopedCode = scopedTaskByCode.get(`${scope}:::${parentStr}`);
    if (byScopedCode && String(byScopedCode.id) !== String(child.id)) return byScopedCode;

    if (parentStr.includes('-')) {
      const normalizedHash = parentStr.replace(/-(\d+)$/, '#$1');
      const byHash = scopedTaskByCode.get(`${scope}:::${normalizedHash}`);
      if (byHash && String(byHash.id) !== String(child.id)) return byHash;
    }

    const num = extractNumericSuffix(parentStr);
    if (num !== null) {
      const byScopedNum = scopedTaskByCode.get(`${scope}:::#${num}`) || scopedTaskByCode.get(`${scope}:::${num}`);
      if (byScopedNum && String(byScopedNum.id) !== String(child.id)) return byScopedNum;
    }

    if (scopedTaskByName) {
      const byName = scopedTaskByName.get(`${scope}:::${parentStr}`);
      if (byName && String(byName.id) !== String(child.id)) return byName;
    }
  }
  return undefined;
}

/**
 * Promotes orphan subtasks (whose parentTaskId is missing, deleted, or self-referential) to root tasks in memory,
 * enforces the Single-Level WBS hierarchy rule (a parent task with children cannot itself be hidden as a child),
 * and normalizes parentTaskId to the canonical parent task ID.
 */
export function filterNonOrphanTasks(tasks: Task[]): { cleaned: Task[]; fixedCount: number } {
  if (!tasks || tasks.length === 0) return { cleaned: tasks || [], fixedCount: 0 };

  const { taskByIdLower, scopedTaskByCode, scopedTaskByName } = buildCanonicalTaskContext(tasks);

  let fixedCount = 0;
  const resolvedParentByTaskId = new Map<string, string>();
  const activeParentIds = new Set<string>();

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!t || !t.id || t.isDeleted) continue;
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (!rawParent) continue;

    const parentTask = resolveParentTaskInScope(t, taskByIdLower, scopedTaskByCode, scopedTaskByName);
    if (parentTask && !parentTask.isDeleted && String(parentTask.id) !== String(t.id)) {
      resolvedParentByTaskId.set(String(t.id), String(parentTask.id));
      activeParentIds.add(String(parentTask.id));
    }
  }

  const cleaned = tasks.map(t => {
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (!rawParent) return t;

    const tIdStr = String(t.id || '');
    // Single-Level WBS Rule: If this task is itself a parent of other tasks, it must be a root parent task
    const canonicalParentId = activeParentIds.has(tIdStr) ? undefined : resolvedParentByTaskId.get(tIdStr);

    if (!canonicalParentId) {
      fixedCount++;
      const updated = { ...t, parentTaskId: undefined };
      delete (updated as any).parentId;
      return updated;
    }

    if (t.parentTaskId !== canonicalParentId) {
      fixedCount++;
      return { ...t, parentTaskId: canonicalParentId };
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

function getTaskRefCodeForRollup(t: Task, canonicalCodeByTaskId: Map<string, string>): string {
  const canonical = t.id ? canonicalCodeByTaskId.get(t.id) : undefined;
  if (canonical) return canonical;
  if (t.taskCodePhu && String(t.taskCodePhu).trim()) {
    return String(t.taskCodePhu).trim();
  }
  if (t.projectCode && t.orderIndex !== undefined && t.orderIndex !== null) {
    return `${String(t.projectCode).trim()}#${Number(t.orderIndex) + 1}`;
  }
  return t.id;
}

function isAutoRollupPredecessorPattern(pred?: string): boolean {
  if (!pred || typeof pred !== 'string') return false;
  return /^\s*[^,\s]+?\s*SS\s*,\s*[^,\s]+?\s*FF\s*$/i.test(pred.trim());
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

  const { taskByIdLower, scopedTaskByCode, scopedTaskByName, canonicalCodeByTaskId } = buildCanonicalTaskContext(tasks);
  const childrenMap = new Map<string, Task[]>();
  const result = [...tasks];
  let anyNormalizedChild = false;

  // Pass 1: Identify all valid parent IDs so parent tasks are never treated as child tasks (Single-Level WBS Rule)
  const resolvedParentByIndex = new Map<number, string>();
  const activeParentIds = new Set<string>();

  for (let i = 0; i < result.length; i++) {
    const t = result[i];
    if (!t || !t.id || t.isDeleted) continue;
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (!rawParent) continue;

    const parentTask = resolveParentTaskInScope(t, taskByIdLower, scopedTaskByCode, scopedTaskByName);
    if (parentTask && !parentTask.isDeleted && String(parentTask.id) !== String(t.id)) {
      resolvedParentByIndex.set(i, String(parentTask.id));
      activeParentIds.add(String(parentTask.id));
    }
  }

  // Pass 2: Normalize valid children and strip orphan/self/nested parentTaskId references
  for (let i = 0; i < result.length; i++) {
    const t = result[i];
    if (!t || !t.id || t.isDeleted) continue;
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (!rawParent) continue;

    const tIdStr = String(t.id);
    const canonicalParentId = activeParentIds.has(tIdStr) ? undefined : resolvedParentByIndex.get(i);

    if (!canonicalParentId) {
      const cleanedOrphan = { ...t, parentTaskId: undefined };
      delete (cleanedOrphan as any).parentId;
      result[i] = cleanedOrphan;
      anyNormalizedChild = true;
      continue;
    }

    let normalizedChild = t;
    if (t.parentTaskId !== canonicalParentId) {
      normalizedChild = { ...t, parentTaskId: canonicalParentId };
      result[i] = normalizedChild;
      anyNormalizedChild = true;
    }

    let list = childrenMap.get(canonicalParentId);
    if (!list) {
      list = [];
      childrenMap.set(canonicalParentId, list);
    }
    list.push(normalizedChild);
  }

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

    const sortedChildren = [...children].sort(compareTasksForCanonicalCode);

    for (let i = 0; i < sortedChildren.length; i++) {
      const child = sortedChildren[i];
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

  let anyParentChanged = false;

  for (let i = 0; i < result.length; i++) {
    const task = result[i];
    if (!task || !task.id) continue;

    if (!childrenMap.has(task.id)) {
      if (task.isModularParent || isAutoRollupPredecessorPattern(task.predecessor)) {
        const cleanedTask: Task = {
          ...task,
          isModularParent: false,
          predecessor: isAutoRollupPredecessorPattern(task.predecessor) ? '' : task.predecessor,
          predecessorTaskIds: undefined,
          predecessors: undefined,
        };
        result[i] = cleanedTask;
        anyParentChanged = true;
      }
      continue;
    }

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
        const earliestCode = getTaskRefCodeForRollup(rolled.earliestChild, canonicalCodeByTaskId);
        const latestCode = getTaskRefCodeForRollup(rolled.latestChild, canonicalCodeByTaskId);
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
        !task.isModularParent ||
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
        anyParentChanged = true;
      }
    }
  }

  const finalOut = anyNormalizedChild || anyParentChanged ? result : tasks;
  _lastRollupInputRef = tasks;
  _lastRollupOutputRef = finalOut;
  return finalOut;
}

/**
 * Rolls up task summaries for project computed summaries in O(N).
 */
export function rollupTaskSummaries(summaries: any[]): any[] {
  if (!Array.isArray(summaries) || summaries.length === 0) return summaries || [];

  const summaryByIdLower = new Map<string, any>();
  const summaryByCodeLower = new Map<string, any>();
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    if (!s) continue;
    if (s.id) summaryByIdLower.set(String(s.id).trim().toLowerCase(), s);
    if (s.taskCodePhu) summaryByCodeLower.set(String(s.taskCodePhu).trim().toLowerCase(), s);
  }

  const childrenMap = new Map<string, any[]>();
  const result = [...summaries];

  for (let i = 0; i < result.length; i++) {
    const s = result[i];
    const rawP = s?.parentTaskId || s?.parentId;
    if (s && s.id && rawP) {
      const pLower = String(rawP).trim().toLowerCase();
      const matchedParent = summaryByIdLower.get(pLower) || summaryByCodeLower.get(pLower);
      const canonicalParentId = matchedParent?.id ? String(matchedParent.id) : String(rawP);
      if (canonicalParentId === String(s.id)) continue;
      if (s.parentTaskId !== canonicalParentId) {
        result[i] = { ...s, parentTaskId: canonicalParentId };
      }
      let list = childrenMap.get(canonicalParentId);
      if (!list) {
        list = [];
        childrenMap.set(canonicalParentId, list);
      }
      list.push(result[i]);
    }
  }

  if (childrenMap.size === 0) return summaries;

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

