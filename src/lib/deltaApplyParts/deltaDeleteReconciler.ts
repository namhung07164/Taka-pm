import { Project, Task } from '../../types';
import { localDb } from '../localDb';
import { markTasksDeleted, markProjectsDeleted } from '../taskDeletedTracker';
import { isTaskBelongsToProject } from '../utils';

/**
 * Purges a deleted project and all of its tasks from memory and Dexie when a project delete delta arrives.
 */
export function purgeProjectAndTasksOnDeleteDelta(
  docId: string,
  data: any,
  updatedProjects: Project[],
  updatedTasks: Task[]
): {
  nextProjects: Project[];
  nextTasks: Task[];
  projectsChanged: boolean;
  tasksChanged: boolean;
} {
  const docIdStr = String(docId);
  markProjectsDeleted([docIdStr]);
  localDb.projects.delete(docIdStr).catch(() => {});

  const targetProj =
    updatedProjects.find((p) => String(p.id) === docIdStr) ||
    (data?.code
      ? ({
          id: docIdStr,
          code: data.code,
          store: data.store,
          year: data.year,
        } as Project)
      : undefined);

  const nextProjects = updatedProjects.filter((p) => String(p.id) !== docIdStr);
  const projectsChanged = nextProjects.length !== updatedProjects.length;

  const removedTaskIds: string[] = [];
  if (Array.isArray(targetProj?.taskSummaries)) {
    targetProj.taskSummaries.forEach((s: any) => {
      if (s?.id && !String(s.id).startsWith('ts_')) {
        removedTaskIds.push(String(s.id));
      }
    });
  }

  const nextTasks = updatedTasks.filter((t) => {
    if (!t) return false;
    if (t.projectId && String(t.projectId) === docIdStr) {
      if (t.id) removedTaskIds.push(String(t.id));
      return false;
    }
    if (targetProj && isTaskBelongsToProject(t, targetProj)) {
      if (t.id) removedTaskIds.push(String(t.id));
      return false;
    }
    return true;
  });
  const tasksChanged = nextTasks.length !== updatedTasks.length;

  if (removedTaskIds.length > 0) {
    markTasksDeleted(removedTaskIds, docIdStr);
    localDb.tasks.bulkDelete(removedTaskIds).catch(() => {});
  }
  localDb.tasks.where('projectId').equals(docIdStr).delete().catch(() => {});

  return { nextProjects, nextTasks, projectsChanged, tasksChanged };
}

/**
 * Unlinks any child tasks in memory and Dexie when a parent task delete delta arrives.
 */
export function unlinkChildTasksOnTaskDeleteDelta(
  docIdLower: string,
  delCodeLower: string,
  pIdHint: any,
  updatedTasks: Task[]
): { nextTasks: Task[]; tasksChanged: boolean } {
  let tasksChanged = false;
  const unlinkedIds: string[] = [];
  const nextTasks = updatedTasks.map((t) => {
    const rawP = t?.parentTaskId || (t as any)?.parentId;
    if (!rawP) return t;
    const rawPLower = String(rawP).trim().toLowerCase();
    const matchesId = rawPLower === docIdLower;
    const matchesCode =
      Boolean(delCodeLower) &&
      rawPLower === delCodeLower &&
      (!pIdHint || !t.projectId || String(t.projectId) === String(pIdHint));
    if (matchesId || matchesCode) {
      tasksChanged = true;
      unlinkedIds.push(String(t.id));
      const copy: any = { ...t, parentTaskId: undefined };
      delete copy.parentId;
      return copy as Task;
    }
    return t;
  });

  if (unlinkedIds.length > 0) {
    unlinkedIds.forEach((cid) => {
      (localDb.tasks.update as any)(cid, { parentTaskId: null, parentId: null }).catch(() => {});
    });
  }
  return { nextTasks, tasksChanged };
}

/**
 * Removes a deleted task's summary and unlinks child summaries in matching projects.
 */
export function removeDeletedTaskSummaryFromProjects(params: {
  docId: string;
  docIdLower: string;
  delNameLower: string;
  delCodeLower: string;
  pIdHint: any;
  delProjCodeLower: string;
  delProjStoreLower: string;
  delProjYearStr: string;
  updatedProjects: Project[];
  noteTouchedProject: (t: any) => void;
}): { nextProjects: Project[]; projectsChanged: boolean } {
  const {
    docId,
    docIdLower,
    delNameLower,
    delCodeLower,
    pIdHint,
    delProjCodeLower,
    delProjStoreLower,
    delProjYearStr,
    updatedProjects,
    noteTouchedProject,
  } = params;

  let projectsChanged = false;
  const nextProjects = updatedProjects.map((p) => {
    if (Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
      const isSameProjectForFallback = pIdHint
        ? String(p.id) === String(pIdHint)
        : (!delProjCodeLower ||
            String(p.code || '').trim().toLowerCase() === delProjCodeLower) &&
          (!delProjStoreLower ||
            !p.store ||
            String(p.store).trim().toLowerCase() === delProjStoreLower) &&
          (!delProjYearStr ||
            p.year === undefined ||
            String(p.year).trim() === delProjYearStr);

      let childSummaryUnlinked = false;
      const filteredSummaries = p.taskSummaries
        .filter((s: any) => {
          const sId = s?.id ? String(s.id).trim().toLowerCase() : '';
          if (sId && sId === docIdLower) return false;
          if (
            !sId &&
            isSameProjectForFallback &&
            delNameLower &&
            String(s?.name || '').trim().toLowerCase() === delNameLower
          ) {
            const sCode = s?.taskCodePhu ? String(s.taskCodePhu).trim().toLowerCase() : '';
            if (!delCodeLower || !sCode || sCode === delCodeLower) return false;
          }
          return true;
        })
        .map((s: any) => {
          const rawP = s?.parentTaskId || s?.parentId;
          if (rawP) {
            const rawPLower = String(rawP).trim().toLowerCase();
            if (
              rawPLower === docIdLower ||
              (delCodeLower && isSameProjectForFallback && rawPLower === delCodeLower)
            ) {
              childSummaryUnlinked = true;
              const copy = { ...s };
              delete copy.parentTaskId;
              delete copy.parentId;
              return copy;
            }
          }
          return s;
        });

      if (filteredSummaries.length !== p.taskSummaries.length || childSummaryUnlinked) {
        projectsChanged = true;
        markTasksDeleted([docId], p.id ? String(p.id) : undefined);
        noteTouchedProject({
          projectId: p.id,
          projectCode: p.code,
          projectStore: p.store,
          projectYear: p.year,
        });
        return {
          ...p,
          taskSummaries: filteredSummaries,
          taskCount: filteredSummaries.length,
        };
      }
    }
    return p;
  });

  return { nextProjects, projectsChanged };
}
