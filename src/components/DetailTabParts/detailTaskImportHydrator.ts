import { Project, Task } from '../../types';
import { ensureProjectTasksLoaded } from '../../lib/taskStateService';
import { matchProjectCode } from '../../lib/projectDatesService';
import { isTaskDeletedInTracker } from '../../lib/taskDeletedTracker';
import { normalizeDashes, isTaskBelongsToProject } from '../../lib/utils';
import { splitPredecessors, sortGroupTasks } from '../../lib/ganttUtils';
import { extractExplicitSubtaskNumber } from '../../lib/ganttUtilsParts/taskSortingAndCodes';
import { parsePredecessorToken } from '../../lib/predecessorMatchUtils';
import { deduplicateTasksInMemory, normalizeTaskNameForComparison } from '../../lib/taskDeduplicationService';

/**
 * Ensures all existing tasks for target projects in the import file AND any external
 * projects referenced via `predecessor` or `parentTaskCode` are loaded into memory
 * (from localDb / Firestore `taka_tasks`, with fallback to `project.taskSummaries`
 * virtual tasks) before running `executeImportTasks`.
 *
 * This prevents importing onto a device where the target project or cross-project
 * predecessor project was not expanded in the UI prior to import.
 */
export async function hydrateImportContextTasks(
  rawParsedRowsByProject: Map<string, Array<{ rowData?: any; [k: string]: any }>>,
  projects: Project[],
  initialTasks: Task[]
): Promise<Task[]> {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const tasksMap = new Map<string, Task>();
  for (const t of initialTasks || []) {
    if (t && t.id && !t.isDeleted) {
      tasksMap.set(String(t.id), t);
    }
  }

  const projectsToHydrate = new Map<string, Project>();

  const findMatchingProject = (
    code?: string,
    store?: string,
    year?: string | number,
    projectId?: string
  ): Project | undefined => {
    if (projectId) {
      const byId = safeProjects.find((p) => p && !p.isDeleted && String(p.id) === String(projectId));
      if (byId) return byId;
    }
    if (!code) return undefined;
    const cleanCode = normalizeDashes(code).trim();
    return safeProjects.find((p) => {
      if (!p || p.isDeleted) return false;
      const codeMatch = matchProjectCode(p.code, cleanCode);
      const storeMatch =
        !store ||
        !p.store ||
        String(p.store).trim().toLowerCase() === String(store).trim().toLowerCase();
      const yearMatch =
        !year ||
        p.year === undefined ||
        p.year === null ||
        String(p.year).trim() === String(year).trim();
      return codeMatch && storeMatch && yearMatch;
    });
  };

  for (const [, rawGroup] of rawParsedRowsByProject.entries()) {
    const firstEntry = rawGroup[0];
    const sample = firstEntry?.rowData ?? firstEntry;
    if (!sample) continue;
    const targetProj = findMatchingProject(
      sample.projectCode,
      sample.projectStore,
      sample.projectYear,
      sample.projectId
    );
    if (targetProj) {
      projectsToHydrate.set(String(targetProj.id || targetProj.code), targetProj);
    }

    for (const entry of rawGroup) {
      const row = entry?.rowData ?? entry;
      const predRaw = String(row?.predecessor || '').trim();
      if (predRaw) {
        const tokens = splitPredecessors(predRaw);
        for (const tok of tokens) {
          const parsedTok = parsePredecessorToken(tok);
          const refCode = normalizeDashes(parsedTok.query || tok).trim();
          const hashIdx = refCode.indexOf('#');
          let projPrefix = hashIdx > 0 ? refCode.slice(0, hashIdx).trim() : '';
          if (!projPrefix) {
            const dashMatch = refCode.match(/^([A-Za-z0-9_-]+?)[-#]\d+$/);
            if (dashMatch) projPrefix = dashMatch[1].trim();
          }
          if (projPrefix) {
            const extProj =
              findMatchingProject(projPrefix, sample.projectStore, sample.projectYear) ||
              findMatchingProject(projPrefix, sample.projectStore) ||
              findMatchingProject(projPrefix);
            if (extProj) {
              projectsToHydrate.set(String(extProj.id || extProj.code), extProj);
            }
          }
        }
      }
    }
  }

  // 1. Load real tasks from Dexie / Firestore for all referenced projects
  if (projectsToHydrate.size > 0) {
    const hydratePromises = Array.from(projectsToHydrate.values()).map((proj) =>
      ensureProjectTasksLoaded(proj.code || '', {
        projectId: proj.id,
        store: proj.store,
        year: proj.year,
      }).catch(() => [] as Task[])
    );
    const hydratedLists = await Promise.all(hydratePromises);
    for (const list of hydratedLists) {
      for (const t of list || []) {
        if (t && t.id && !t.isDeleted) {
          tasksMap.set(String(t.id), t);
        }
      }
    }
  }

  // 2. Fallback: For any project in `safeProjects` whose `taskSummaries` contain tasks
  // not yet present in `tasksMap` (e.g. offline or unhydrated external project),
  // synthesize complete Task records from `project.taskSummaries` so predecessor/hierarchy
  // resolution and subtask numbering never miss existing tasks.
  const currentTasksList = Array.from(tasksMap.values());
  const existingNameKeyByProj = new Set<string>();
  const existingCodeKeyByProj = new Set<string>();

  for (const t of currentTasksList) {
    const pKey = t.projectId
      ? `pid:${String(t.projectId).trim()}`
      : `c:${String(t.projectCode || '').trim().toLowerCase()}|${String(t.projectStore || '').trim().toLowerCase()}|${String(t.projectYear || '').trim()}`;
    if (t.name) {
      existingNameKeyByProj.add(`${pKey}::n::${String(t.name).trim().toLowerCase()}`);
    }
    if (t.taskCodePhu) {
      existingCodeKeyByProj.add(`${pKey}::c::${String(t.taskCodePhu).trim().toLowerCase()}`);
    }
  }

  for (const proj of safeProjects) {
    if (!proj || proj.isDeleted || !Array.isArray(proj.taskSummaries) || proj.taskSummaries.length === 0) {
      continue;
    }
    const pIdStr = proj.id ? String(proj.id).trim() : '';
    const pKey = pIdStr
      ? `pid:${pIdStr}`
      : `c:${String(proj.code || '').trim().toLowerCase()}|${String(proj.store || '').trim().toLowerCase()}|${String(proj.year || '').trim()}`;

    proj.taskSummaries.forEach((ts: any, idx: number) => {
      if (!ts) return;
      const rawId = ts.id ? String(ts.id).trim() : '';
      if (rawId && isTaskDeletedInTracker(rawId, pIdStr || undefined)) return;
      if (rawId && !rawId.startsWith('ts_') && tasksMap.has(rawId)) return;

      const tsCode = String(
        ts.taskCodePhu || (proj.code ? `${proj.code}#${idx + 1}` : '')
      ).trim();
      const tsName = String(ts.name || '').trim();
      if (!tsName && !tsCode && !ts.start && !ts.finish) return;

      if (tsCode && existingCodeKeyByProj.has(`${pKey}::c::${tsCode.toLowerCase()}`)) return;
      if (
        !rawId &&
        tsName &&
        existingNameKeyByProj.has(`${pKey}::n::${tsName.toLowerCase()}`)
      ) {
        return;
      }

      const synthId =
        rawId && !rawId.startsWith('ts_')
          ? rawId
          : `ts_${proj.id || proj.code}_${proj.store || 'HCM'}_${proj.year || ''}_${idx}`;

      if (tasksMap.has(synthId)) return;

      const synthTask: Task = {
        id: synthId,
        name: tsName || tsCode || `Task ${idx + 1}`,
        start: ts.start || proj.computedTakStart || proj.start || '',
        finish: ts.finish || proj.computedTakCompl || proj.handover || '',
        duration: ts.duration !== undefined ? String(ts.duration) : '',
        party: ts.party || proj.party || '',
        runningStatus: ts.runningStatus || 'On process',
        approval: ts.approval || '',
        delegation: Boolean(ts.delegation),
        predecessor: ts.predecessor || '',
        predecessorTaskIds: Array.isArray(ts.predecessorTaskIds) ? ts.predecessorTaskIds : undefined,
        parentTaskId: ts.parentTaskId,
        isModularParent: Boolean(ts.isModularParent),
        taskCodePhu: tsCode || undefined,
        orderIndex: ts.orderIndex !== undefined ? Number(ts.orderIndex) : idx,
        projectId: proj.id,
        projectCode: proj.code || '',
        projectStore: proj.store || 'HCM',
        projectYear: proj.year !== undefined && proj.year !== null ? Number(proj.year) : undefined,
        baselineStart: ts.baselineStart,
        baselineFinish: ts.baselineFinish,
        durationManual: false,
        finishManual: false,
      };

      if (synthId.startsWith('ts_')) {
        (synthTask as any)._isVirtualSummary = true;
      }

      if (isTaskBelongsToProject(synthTask, proj, safeProjects)) {
        tasksMap.set(synthId, synthTask);
      }
    });
  }

  return Array.from(tasksMap.values());
}

/**
 * Freezes the current canonical order (0..N-1) and subtask codes (#1..#N) of existing tasks
 * in a project prior to importing CSV rows so existing tasks never shift or scramble.
 */
export function lockExistingProjectTasksOrder(
  projectExistingTasks: Task[],
  targetProject: Project | undefined,
  exactProjectCode: string,
  canonicalPrjKey: string,
  allInitialTasks: Task[],
  existingTasksById: Map<string, Task>,
  existingTasksByName: Map<string, Task>,
  existingTasksByNorm: Map<string, Task>,
  existingTasksByCode: Map<string, Task>,
  lockedExistingTasksToSave: Map<string, Task>,
  previousStates: Map<string, any>
): { maxExistingSubtaskNum: number; maxExistingOrderIndex: number } {
  if (!projectExistingTasks || projectExistingTasks.length === 0) {
    return { maxExistingSubtaskNum: 0, maxExistingOrderIndex: -1 };
  }

  const { dedupedTasks } = deduplicateTasksInMemory(
    projectExistingTasks,
    targetProject ? [targetProject] : []
  );
  const orderedExisting = sortGroupTasks(dedupedTasks);

  const tsIdRedirect = new Map<string, string>();
  orderedExisting.forEach((pt, idx) => {
    const oldId = String(pt.id || '');
    if (oldId.startsWith('ts_') || (pt as any)._isVirtualSummary) {
      const realId = `t_${Date.now()}_lock_${idx}_${Math.random().toString(36).slice(2, 7)}`;
      tsIdRedirect.set(oldId, realId);
    }
  });

  const initialIdxById = new Map<string, number>();
  allInitialTasks.forEach((t, i) => {
    if (t?.id) initialIdxById.set(String(t.id), i);
  });

  let maxExistingSubtaskNum = orderedExisting.length;
  let maxExistingOrderIndex = orderedExisting.length - 1;

  orderedExisting.forEach((pt, idx) => {
    const oldId = String(pt.id || '');
    const newId = tsIdRedirect.get(oldId) || oldId;
    const rawParent = pt.parentTaskId ? String(pt.parentTaskId) : undefined;
    const redirectedParent = rawParent ? (tsIdRedirect.get(rawParent) || rawParent) : undefined;

    const explicitNum = extractExplicitSubtaskNumber(pt.taskCodePhu, exactProjectCode);
    if (explicitNum !== null && explicitNum > maxExistingSubtaskNum) {
      maxExistingSubtaskNum = explicitNum;
    }
    if (pt.orderIndex !== undefined && pt.orderIndex !== null && !isNaN(Number(pt.orderIndex))) {
      const ord = Number(pt.orderIndex);
      if (ord > maxExistingOrderIndex) maxExistingOrderIndex = ord;
    }

    const lockedOrderIndex = idx;
    const lockedCodePhu = exactProjectCode ? `${exactProjectCode}#${idx + 1}` : (pt.taskCodePhu || '');

    const needsLockUpdate =
      oldId !== newId ||
      Boolean((pt as any)._isVirtualSummary) ||
      pt.orderIndex !== lockedOrderIndex ||
      pt.taskCodePhu !== lockedCodePhu ||
      pt.parentTaskId !== redirectedParent ||
      (targetProject?.id && pt.projectId !== targetProject.id);

    const lockedTask: Task = needsLockUpdate
      ? {
          ...pt,
          id: newId,
          orderIndex: lockedOrderIndex,
          taskCodePhu: lockedCodePhu,
          ...(redirectedParent ? { parentTaskId: redirectedParent } : {}),
          ...(targetProject?.id ? { projectId: targetProject.id } : {}),
          ...(exactProjectCode ? { projectCode: exactProjectCode } : {}),
          ...(targetProject?.store && !pt.projectStore ? { projectStore: targetProject.store } : {}),
          ...(targetProject?.year !== undefined && pt.projectYear === undefined ? { projectYear: Number(targetProject.year) } : {}),
        }
      : pt;
    delete (lockedTask as any)._isVirtualSummary;

    if (needsLockUpdate) {
      if (!oldId.startsWith('ts_') && !previousStates.has(newId)) {
        previousStates.set(newId, pt);
      }
      lockedExistingTasksToSave.set(newId, lockedTask);
      const pos = initialIdxById.get(oldId);
      if (pos !== undefined) {
        allInitialTasks[pos] = lockedTask;
      } else {
        allInitialTasks.push(lockedTask);
      }
    }

    existingTasksById.set(newId, lockedTask);
    if (lockedCodePhu) {
      existingTasksByCode.set(`${canonicalPrjKey}:::code:::${lockedCodePhu.toLowerCase()}`, lockedTask);
    }
    if (pt.taskCodePhu) {
      existingTasksByCode.set(`${canonicalPrjKey}:::code:::${String(pt.taskCodePhu).trim().toLowerCase()}`, lockedTask);
    }
    if (lockedTask.name) {
      const nameKey = `${canonicalPrjKey}:::${String(lockedTask.name).trim().toLowerCase()}`;
      if (!existingTasksByName.has(nameKey)) existingTasksByName.set(nameKey, lockedTask);
      const norm = normalizeTaskNameForComparison(lockedTask.name);
      if (norm) {
        const normKey = `${canonicalPrjKey}:::norm:::${norm}`;
        if (!existingTasksByNorm.has(normKey)) existingTasksByNorm.set(normKey, lockedTask);
      }
    }
  });

  return { maxExistingSubtaskNum, maxExistingOrderIndex };
}
