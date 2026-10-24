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
 * Builds a standardized index of tasks within a project to resolve parent-child
 * relationships across Detail Tab (Desktop & Mobile) and Gantt Tab.
 * Supports parent reference by ID, lowercase ID, taskCodePhu (#code), orderIndex (#num), or name.
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

  // 1. Identify which tasks are referenced as parents within this project
  groupTasks.forEach((t) => {
    const rawParentId = t.parentTaskId || (t as any).parentId;
    if (!rawParentId) return;

    const matchedParent = findParent(rawParentId);
    if (matchedParent && String(matchedParent.id) !== String(t.id)) {
      parentTaskIdsInProject.add(String(matchedParent.id));
    }
  });

  // 2. Map children to their canonical parent
  groupTasks.forEach((t) => {
    const rawParentId = t.parentTaskId || (t as any).parentId;
    if (!rawParentId) return;

    const matchedParent = findParent(rawParentId);
    if (matchedParent && String(matchedParent.id) !== String(t.id)) {
      parentTaskMap.set(String(t.id), matchedParent);
      parentTaskMap.set(String(t.id).toLowerCase(), matchedParent);
      if (t.taskCodePhu) {
        parentTaskMap.set(String(t.taskCodePhu).trim().toLowerCase(), matchedParent);
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
