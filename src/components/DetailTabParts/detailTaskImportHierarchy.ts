import { Task } from '../../types';
import { isTaskBelongToSameParentScope } from '../../lib/parentHierarchyUtils';

/**
 * Resolves parent-child hierarchy across imported tasks and existing tasks in O(1) via pre-built lookup maps.
 * Strictly scopes parent-child attachment within year, store, projectId/projectCode, and canonical task.id.
 * Supports parentTaskCode (e.g. "B1-B101#34" or "#34"), parentTaskName, and parentTaskId.
 */
export function resolveParentChildHierarchy(tasksToImport: Task[], contextTasks: Task[]): void {
  const lookupTaskMap = new Map<string, Task>();
  const parentByCode = new Map<string, Task>();
  const parentBySuffix = new Map<string, Task>();
  const parentByOrder = new Map<string, Task>();
  const parentByName = new Map<string, Task>();

  const buildScopeKey = (tk: Partial<Task>) => {
    const projId = tk.projectId ? String(tk.projectId).trim().toLowerCase() : '';
    const code = String(tk.projectCode || '').trim().toLowerCase();
    const year = tk.projectYear !== undefined && tk.projectYear !== null ? String(tk.projectYear).trim() : '';
    const store = String(tk.projectStore || '').trim().toLowerCase();
    return `${projId}|${code}|${year}|${store}`;
  };

  const indexTaskForParentLookup = (pt: Task) => {
    if (!pt || !pt.id) return;
    lookupTaskMap.set(pt.id, pt);
    lookupTaskMap.set(String(pt.id).toLowerCase(), pt);
    const scope = buildScopeKey(pt);
    if (pt.taskCodePhu) {
      const cLower = String(pt.taskCodePhu).trim().toLowerCase();
      parentByCode.set(`${scope}:::${cLower}`, pt);
      const suffixMatch = cLower.match(/[#-](\d+)$/);
      if (suffixMatch) {
        parentBySuffix.set(`${scope}:::${suffixMatch[1]}`, pt);
      }
    }
    if (pt.orderIndex !== undefined && pt.orderIndex !== null) {
      parentByOrder.set(`${scope}:::${pt.orderIndex}`, pt);
      parentByOrder.set(`${scope}:::${Number(pt.orderIndex) + 1}`, pt);
    }
    if (pt.name) {
      parentByName.set(`${scope}:::${String(pt.name).trim().toLowerCase()}`, pt);
    }
  };

  contextTasks.forEach(indexTaskForParentLookup);
  tasksToImport.forEach(indexTaskForParentLookup);

  tasksToImport.forEach(t => {
    let resolvedParent: Task | undefined = undefined;
    const scope = buildScopeKey(t);

    if (t.parentTaskId) {
      const candidate = lookupTaskMap.get(String(t.parentTaskId).trim()) || lookupTaskMap.get(String(t.parentTaskId).trim().toLowerCase());
      if (candidate && isTaskBelongToSameParentScope(t, candidate)) {
        resolvedParent = candidate;
      }
    }

    if (!resolvedParent && (t as any).parentTaskCode) {
      const pCode = String((t as any).parentTaskCode).trim().toLowerCase();
      const cleanNumMatch = pCode.match(/^#?(\d+)$/);
      const targetIndex = cleanNumMatch ? parseInt(cleanNumMatch[1], 10) - 1 : -1;

      const matchedCandidate =
        parentByCode.get(`${scope}:::${pCode}`) ||
        lookupTaskMap.get(String((t as any).parentTaskCode).trim()) ||
        lookupTaskMap.get(pCode) ||
        (cleanNumMatch ? parentBySuffix.get(`${scope}:::${cleanNumMatch[1]}`) : undefined) ||
        (targetIndex >= 0 ? parentByOrder.get(`${scope}:::${targetIndex}`) : undefined);

      if (matchedCandidate && matchedCandidate.id !== t.id && isTaskBelongToSameParentScope(t, matchedCandidate)) {
        resolvedParent = matchedCandidate;
      }
    }

    if (!resolvedParent && (t as any).parentTaskName) {
      const pName = String((t as any).parentTaskName).trim().toLowerCase();
      const matchedCandidate = parentByName.get(`${scope}:::${pName}`);
      if (matchedCandidate && matchedCandidate.id !== t.id && isTaskBelongToSameParentScope(t, matchedCandidate)) {
        resolvedParent = matchedCandidate;
      }
    }

    if (resolvedParent && resolvedParent.id !== t.id) {
      t.parentTaskId = String(resolvedParent.id);
      (t as any).parentId = String(resolvedParent.id);

      // Inherit / align 4 composite keys from parent task
      if (!t.projectId && resolvedParent.projectId) t.projectId = resolvedParent.projectId;
      if (!t.projectCode && resolvedParent.projectCode) t.projectCode = resolvedParent.projectCode;
      if (!t.projectStore && resolvedParent.projectStore) t.projectStore = resolvedParent.projectStore;
      if ((t.projectYear === undefined || t.projectYear === null) && resolvedParent.projectYear !== undefined) {
        t.projectYear = resolvedParent.projectYear;
      }
    } else {
      delete t.parentTaskId;
      delete (t as any).parentId;
    }

    delete (t as any).parentTaskCode;
    delete (t as any).parentTaskName;
    delete (t as any).isParent;
    delete (t as any).level;
  });
}
