import { Task } from '../types';

export interface ProjectParentHierarchyIndex {
  taskById: Map<string, Task>;
  taskByCode: Map<string, Task>;
  taskByOrder: Map<string, Task>;
  taskByName: Map<string, Task>;
  parentTaskMap: Map<string, Task>;
  groupTaskIndexMap: Map<string, number>;
  parentTaskIdsInProject: Set<string>;
  localChildCountByParentId: Map<string, number>;
  projectModularParentIds: string[];
  projectChildTasksCount: number;
  childTasksByParentId: Map<string, Task[]>;
}

/**
 * Strictly verifies that a child task and a potential parent task belong to the SAME project scope
 * based on the 4 composite keys: projectId, projectCode, projectYear, and projectStore,
 * in strict accordance with RULE[AGENTS_md] §16.1.
 */
export function isTaskBelongToSameParentScope(child: Partial<Task>, parent: Partial<Task>): boolean {
  if (!child || !parent) return false;
  if (child.isDeleted || parent.isDeleted) return false;

  // 1. Same Task Guard: A task cannot be its own parent
  if (child.id && parent.id && String(child.id).trim() === String(parent.id).trim()) {
    return false;
  }

  const childProjId = child.projectId ? String(child.projectId).trim() : '';
  const parentProjId = parent.projectId ? String(parent.projectId).trim() : '';

  // 2. Project ID Match (Highest Priority #1):
  // If BOTH have projectId, they MUST match. If they differ, reject immediately.
  if (childProjId && parentProjId) {
    if (childProjId !== parentProjId) return false;
  }

  // 3. Store Branch Match (Priority #2):
  // If both have projectStore, they MUST match (case-insensitive).
  const childStore = child.projectStore ? String(child.projectStore).trim().toLowerCase() : '';
  const parentStore = parent.projectStore ? String(parent.projectStore).trim().toLowerCase() : '';
  if (childStore && parentStore && childStore !== parentStore) {
    return false;
  }

  // 4. Financial Year Match (Priority #3):
  // If both have projectYear, they MUST match.
  const childYear = child.projectYear !== undefined && child.projectYear !== null ? String(child.projectYear).trim() : '';
  const parentYear = parent.projectYear !== undefined && parent.projectYear !== null ? String(parent.projectYear).trim() : '';
  if (childYear && parentYear && childYear !== parentYear) {
    return false;
  }

  // 5. Project Code Match:
  // If both have projectCode, they MUST match.
  const childCode = child.projectCode ? String(child.projectCode).trim().toLowerCase() : '';
  const parentCode = parent.projectCode ? String(parent.projectCode).trim().toLowerCase() : '';
  if (childCode && parentCode) {
    const cCodes = childCode.split(/[,;/]+/).map((s) => s.trim());
    const pCodes = parentCode.split(/[,;/]+/).map((s) => s.trim());
    const hasOverlap = cCodes.some((c) => pCodes.includes(c));
    if (!hasOverlap) return false;
  }

  // If neither has projectId, require at least store, year, or code compatibility
  if (!childProjId && !parentProjId) {
    if (childCode && parentCode && childCode !== parentCode) return false;
    if (childStore && parentStore && childStore !== parentStore) return false;
    if (childYear && parentYear && childYear !== parentYear) return false;
  }

  return true;
}

/**
 * Builds a standardized index of tasks within a project to resolve parent-child
 * relationships across Detail Tab (Desktop & Mobile) and Gantt Tab.
 * Enforces strict composite-key scoping (projectId, projectCode, projectYear, projectStore).
 */
export function buildProjectParentHierarchyIndex(groupTasks: Task[]): ProjectParentHierarchyIndex {
  const taskById = new Map<string, Task>();
  const taskByCode = new Map<string, Task>();
  const taskByOrder = new Map<string, Task>();
  const taskByName = new Map<string, Task>();
  const groupTaskIndexMap = new Map<string, number>();

  groupTasks.forEach((t, idx) => {
    if (t.id) {
      const idStr = String(t.id).trim();
      groupTaskIndexMap.set(idStr, idx);
      taskById.set(idStr, t);
      taskById.set(idStr.toLowerCase(), t);
    }
    if (t.taskCodePhu) {
      const codeKey = String(t.taskCodePhu).trim().toLowerCase();
      taskByCode.set(codeKey, t);
      const numMatch = codeKey.match(/[-#]?(\d+)$/);
      if (numMatch) {
        taskByCode.set(numMatch[1], t);
        taskByCode.set(`#${numMatch[1]}`, t);
      }
    }
    if (t.orderIndex !== undefined && t.orderIndex !== null) {
      const ordNum = Number(t.orderIndex);
      if (!isNaN(ordNum)) {
        taskByOrder.set(String(ordNum + 1), t);
        taskByOrder.set(`#${ordNum + 1}`, t);
        taskByOrder.set(String(ordNum), t);
      }
    }
    if (t.name) {
      const nameKey = String(t.name).trim().toLowerCase();
      if (nameKey) {
        taskByName.set(nameKey, t);
      }
    }
  });

  const parentTaskMap = new Map<string, Task>();
  const localChildCountByParentId = new Map<string, number>();
  const childTasksByParentId = new Map<string, Task[]>();
  const parentTaskIdsInProject = new Set<string>();

  // Helper to find parent
  const findParent = (rawParentId: any): Task | undefined => {
    if (!rawParentId) return undefined;
    const trimmed = String(rawParentId).trim();
    const lower = trimmed.toLowerCase();

    let matched =
      taskById.get(trimmed) ||
      taskById.get(lower) ||
      taskByCode.get(lower) ||
      taskByOrder.get(trimmed) ||
      taskByOrder.get(lower);

    if (!matched && lower.startsWith('#')) {
      const stripped = lower.substring(1).trim();
      matched = taskByCode.get(stripped) || taskByOrder.get(stripped);
    }

    if (!matched) {
      matched = taskByName.get(lower);
    }

    return matched;
  };

  // 1. Identify which tasks are referenced as parents within this project scope
  groupTasks.forEach((t) => {
    const rawParentId = t.parentTaskId || (t as any).parentId;
    if (!rawParentId) return;

    const matchedParent = findParent(rawParentId);
    if (matchedParent && isTaskBelongToSameParentScope(t, matchedParent)) {
      parentTaskIdsInProject.add(String(matchedParent.id));
    }
  });

  // 2. Map children to their canonical parent
  groupTasks.forEach((t) => {
    const rawParentId = t.parentTaskId || (t as any).parentId;
    if (!rawParentId) return;

    const matchedParent = findParent(rawParentId);
    if (matchedParent && isTaskBelongToSameParentScope(t, matchedParent)) {
      parentTaskMap.set(String(t.id), matchedParent);
      parentTaskMap.set(String(t.id).toLowerCase(), matchedParent);
      if (t.taskCodePhu) {
        parentTaskMap.set(String(t.taskCodePhu).trim().toLowerCase(), matchedParent);
      }
      const rawTrim = String(rawParentId).trim();
      if (rawTrim) {
        parentTaskMap.set(rawTrim, matchedParent);
        parentTaskMap.set(rawTrim.toLowerCase(), matchedParent);
      }

      const pCanonicalId = String(matchedParent.id);
      // If t is NOT a parent itself, count it as a child of matchedParent
      if (!parentTaskIdsInProject.has(String(t.id))) {
        localChildCountByParentId.set(
          pCanonicalId,
          (localChildCountByParentId.get(pCanonicalId) || 0) + 1
        );

        if (!childTasksByParentId.has(pCanonicalId)) {
          childTasksByParentId.set(pCanonicalId, []);
        }
        childTasksByParentId.get(pCanonicalId)!.push(t);
      }
    }
  });

  const projectModularParentIds = Array.from(parentTaskIdsInProject);
  let projectChildTasksCount = 0;
  localChildCountByParentId.forEach((count) => {
    projectChildTasksCount += count;
  });

  return {
    taskById,
    taskByCode,
    taskByOrder,
    taskByName,
    parentTaskMap,
    groupTaskIndexMap,
    parentTaskIdsInProject,
    localChildCountByParentId,
    projectModularParentIds,
    projectChildTasksCount,
    childTasksByParentId,
  };
}
