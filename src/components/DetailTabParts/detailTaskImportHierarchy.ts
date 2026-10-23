import { Task } from '../../types';

/**
 * Resolves parent-child hierarchy across imported tasks and existing tasks in O(1) via pre-built lookup maps.
 * Supports parentTaskCode (e.g. "B1-B101#34" or "#34"), parentTaskName, and parentTaskId.
 */
export function resolveParentChildHierarchy(tasksToImport: Task[], contextTasks: Task[]): void {
  const lookupTaskMap = new Map<string, Task>();
  const parentByCode = new Map<string, Task>();
  const parentBySuffix = new Map<string, Task>();
  const parentByOrder = new Map<string, Task>();
  const parentByName = new Map<string, Task>();

  const buildScopeKey = (tk: Partial<Task>) =>
    `${String(tk.projectCode || '').trim().toLowerCase()}|${String(tk.projectYear ?? '').trim()}|${String(tk.projectStore || '').trim().toLowerCase()}`;

  const indexTaskForParentLookup = (pt: Task) => {
    if (!pt || !pt.id) return;
    lookupTaskMap.set(pt.id, pt);
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
    }
    if (pt.name) {
      parentByName.set(`${scope}:::${String(pt.name).trim().toLowerCase()}`, pt);
    }
  };

  contextTasks.forEach(indexTaskForParentLookup);
  tasksToImport.forEach(indexTaskForParentLookup);

  tasksToImport.forEach(t => {
    let resolvedParentId: string | undefined = undefined;
    const scope = buildScopeKey(t);

    if (t.parentTaskId && lookupTaskMap.has(t.parentTaskId)) {
      resolvedParentId = t.parentTaskId;
    } else if ((t as any).parentTaskCode) {
      const pCode = String((t as any).parentTaskCode).trim().toLowerCase();
      const cleanNumMatch = pCode.match(/^#?(\d+)$/);
      const targetIndex = cleanNumMatch ? parseInt(cleanNumMatch[1], 10) - 1 : -1;

      const matchedParent =
        parentByCode.get(`${scope}:::${pCode}`) ||
        lookupTaskMap.get(String((t as any).parentTaskCode).trim()) ||
        (cleanNumMatch ? parentBySuffix.get(`${scope}:::${cleanNumMatch[1]}`) : undefined) ||
        (targetIndex >= 0 ? parentByOrder.get(`${scope}:::${targetIndex}`) : undefined);

      if (matchedParent && matchedParent.id !== t.id) {
        resolvedParentId = matchedParent.id;
      }
    } else if ((t as any).parentTaskName) {
      const pName = String((t as any).parentTaskName).trim().toLowerCase();
      const matchedParent = parentByName.get(`${scope}:::${pName}`);
      if (matchedParent && matchedParent.id !== t.id) {
        resolvedParentId = matchedParent.id;
      }
    }

    if (resolvedParentId && resolvedParentId !== t.id) {
      t.parentTaskId = resolvedParentId;
      (t as any).parentId = resolvedParentId;
    } else if (resolvedParentId === t.id) {
      delete t.parentTaskId;
      delete (t as any).parentId;
    }

    delete (t as any).parentTaskCode;
    delete (t as any).parentTaskName;
    delete (t as any).isParent;
    delete (t as any).level;
  });
}
