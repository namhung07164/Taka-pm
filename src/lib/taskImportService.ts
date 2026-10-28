import { Task, Project, DelegationGroup, TakaDeltaItem } from '../types';
import { 
  parsePredecessors, 
  buildTaskNoMap, 
  calculateTaskDatesFromPredecessors, 
  addDays 
} from './ganttUtils';
import { generateId } from './utils';
import { calculateProjectComputedDates, syncProjectDatesToFirestore } from './projectDatesService';
import { useAppStore } from '../store/useAppStore';
import { recordBatchDeltas } from './deltaSyncService';
import { rollupParentTaskDatesAndStatus } from './taskRollupService';
import { applyParentPredecessorsToTaskTree } from './parentTaskPredecessorService';
import type { MassWriteOp } from './massBatchWriteEngine';

/**
 * Normalizes a duration value (strips trailing 'd' or 'days', ensures valid number string).
 */
export function cleanDurationString(val: any): string {
  if (val === undefined || val === null) return '0';
  const str = String(val).trim().replace(/d(ays?)?$/i, '').trim();
  const num = parseFloat(str);
  return isNaN(num) || num < 0 ? '0' : String(Number(num.toFixed(2)));
}

/**
 * Prioritizes assigned predecessors and duration to recalculate start date and end date
 * across a set of tasks (with full cascade to dependent tasks).
 */
export function calculateDatesFromPredecessorsAndDuration(
  tasksToProcess: Task[],
  allContextTasks: Task[],
  projects: Project[]
): Task[] {
  if (!tasksToProcess.length) return [];

  // Create mutable working map of all tasks
  const workingMap = new Map<string, Task>();
  allContextTasks.forEach(t => workingMap.set(t.id, { ...t }));
  tasksToProcess.forEach(t => workingMap.set(t.id, { ...t }));

  // Identify parent tasks so their dates are rolled up from children during convergence
  const parentIds = new Set<string>();
  workingMap.forEach(t => {
    if (t && !t.isDeleted && t.parentTaskId) {
      parentIds.add(t.parentTaskId);
    }
  });

  // Index taskNoMap for resolving predecessors
  const currentAllTasks = Array.from(workingMap.values());
  const taskNoMap = buildTaskNoMap(projects, currentAllTasks);

  // Relax dependencies iteratively (topological convergence with cycle limit capped at 50 for mass imports)
  const maxIterations = Math.min(50, Math.max(10, tasksToProcess.length + 2));
  let hasChanges = true;
  let iteration = 0;

  while (hasChanges && iteration < maxIterations) {
    hasChanges = false;
    iteration++;

    if (parentIds.size > 0) {
      const rolledList = rollupParentTaskDatesAndStatus(Array.from(workingMap.values()));
      for (const rt of rolledList) {
        if (parentIds.has(rt.id)) {
          const prev = workingMap.get(rt.id);
          if (prev && (prev.start !== rt.start || prev.finish !== rt.finish || prev.predecessor !== rt.predecessor)) {
            workingMap.set(rt.id, rt);
            hasChanges = true;
          }
        }
      }
    }

    for (const t of tasksToProcess) {
      if (parentIds.has(t.id)) continue;
      const current = workingMap.get(t.id);
      if (!current) continue;

      const predString = current.predecessor
        ? String(current.predecessor).trim().replace(/^[,;\s]+|[,;\s]+$/g, '').trim()
        : '';
      if (predString !== (current.predecessor || '')) {
        current.predecessor = predString;
        workingMap.set(current.id, current);
      }
      if (!predString) {
        // If no predecessor, ensure finish is consistent with start and duration if finish is missing or invalid
        if (current.start && (!current.finish || current.finish === current.start)) {
          const durNum = parseFloat(cleanDurationString(current.duration));
          if (durNum > 0) {
            const calculatedFinish = addDays(current.start, durNum);
            if (calculatedFinish !== current.finish) {
              current.finish = calculatedFinish;
              workingMap.set(current.id, current);
              hasChanges = true;
            }
          }
        }
        continue;
      }

      // Task has predecessor: parse from CSV string without stale predecessorTaskIds
      const parsedPreds = parsePredecessors(
        predString,
        taskNoMap,
        { ...current, predecessorTaskIds: undefined, predecessors: undefined }
      );
      if (!parsedPreds.length) continue;

      const resolvedIds = parsedPreds.map(p => p.task?.id).filter((id): id is string => Boolean(id));
      const prevIdsStr = (current.predecessorTaskIds || []).join(',');
      if (resolvedIds.length > 0 && resolvedIds.join(',') !== prevIdsStr) {
        current.predecessorTaskIds = resolvedIds;
        current.predecessors = parsedPreds
          .filter(p => Boolean(p.task?.id))
          .map(p => ({
            taskId: p.task.id,
            type: (p.type || 'FS') as any,
            lagDays: p.lagSign === '-' ? -(p.lagValue || 0) : (p.lagValue || 0),
          }));
        workingMap.set(current.id, current);
      }

      const calcResult = calculateTaskDatesFromPredecessors(
        current,
        parsedPreds,
        (id) => workingMap.get(id)
      );

      if (calcResult) {
        const { start: newStart, finish: newFinish, duration: newDuration, durationManual: newDurationManual } = calcResult;
        if (newStart !== current.start || newFinish !== current.finish || newDuration !== current.duration) {
          current.start = newStart;
          current.finish = newFinish;
          current.duration = newDuration;
          current.durationManual = newDurationManual;
          current.realtimeUpdate = true;
          current.updatedAt = new Date().toISOString();
          workingMap.set(current.id, current);
          hasChanges = true;
        }
      }
    }
  }

  return tasksToProcess.map(t => workingMap.get(t.id) || t);
}

/**
 * Recalculates start/finish/duration/runningStatus for parent tasks in O(N).
 */
export function rollupParentTaskDates(
  allTasks: Task[],
  _targetParentIds?: string[],
  projects: Project[] = []
): { updatedParents: Task[]; allTasksMap: Map<string, Task> } {
  const safeProjects = projects.length > 0 ? projects : (useAppStore.getState?.()?.projects || []);
  const { updatedTasks: tasksWithParentPreds, updatedParents: parentPredUpdates } =
    applyParentPredecessorsToTaskTree(allTasks, safeProjects);

  const delegationGroups = useAppStore.getState?.()?.delegationGroups || [];
  const rolledUpList = rollupParentTaskDatesAndStatus(tasksWithParentPreds, delegationGroups);
  const taskMap = new Map<string, Task>();
  const updatedParents: Task[] = [];
  const parentPredMap = new Map<string, Task>();
  parentPredUpdates.forEach((p) => parentPredMap.set(p.id, p));

  const originalMap = new Map<string, Task>();
  allTasks.forEach((orig) => {
    if (orig?.id) originalMap.set(orig.id, orig);
  });

  rolledUpList.forEach((t) => {
    taskMap.set(t.id, t);
    const original = originalMap.get(t.id);
    const hasPredUpdate = parentPredMap.has(t.id);
    if (
      hasPredUpdate ||
      (original &&
        (original.start !== t.start ||
          original.finish !== t.finish ||
          original.duration !== t.duration ||
          original.runningStatus !== t.runningStatus ||
          original.predecessor !== t.predecessor))
    ) {
      updatedParents.push(t);
    }
  });

  return {
    updatedParents,
    allTasksMap: taskMap,
  };
}

/**
 * Prepares missing DelegationGroup records for imported tasks that have `delegation = true`
 * without overwriting already-existing delegation groups in store/Firestore.
 */
export function prepareMissingDelegationsForTasks(
  tasksToSave: Task[],
  currentUser?: { id?: string; username?: string },
  nowIso: string = new Date().toISOString()
): { newDelegations: DelegationGroup[]; taskDelegationMap: Map<string, DelegationGroup> } {
  const dateStr = nowIso.substring(0, 10);
  const activeUserId =
    currentUser?.id && currentUser.id !== 'guest'
      ? currentUser.id
      : currentUser?.username || 'system';

  const existingDel = useAppStore.getState().delegationGroups || [];
  const existingDelMap = new Map<string, DelegationGroup>(existingDel.map((d) => [d.id, d]));

  const newDelegations: DelegationGroup[] = [];
  const taskDelegationMap = new Map<string, DelegationGroup>();

  tasksToSave.forEach((t) => {
    if (!t.delegation) return;
    const deterministicGroupId = `del_${t.id}`;
    // Preserve existing delegation group if it already exists so subtask statuses are never reset
    if (existingDelMap.has(deterministicGroupId)) {
      return;
    }
    const rawParty = t.party && t.party.trim() ? t.party.trim() : '';
    const parsedParty =
      rawParty
        .split(/[,;/+]+/)
        .map((s) => s.trim())
        .filter(Boolean)[0] || rawParty;
    if (parsedParty) {
      const delGroup: DelegationGroup = {
        id: deterministicGroupId,
        parentTaskId: t.id,
        name: t.name || 'Delegated Task',
        ...(t.projectId ? { projectId: t.projectId } : {}),
        projectCode: t.projectCode,
        projectStore: t.projectStore,
        projectYear:
          t.projectYear !== undefined && t.projectYear !== null && !isNaN(Number(t.projectYear))
            ? Number(t.projectYear)
            : new Date().getFullYear(),
        subTasks: [
          {
            id: generateId(),
            name: '',
            comments: '',
            status: 'Assigned',
            delegationStatus: 'Assigned',
            priority: 'Mid',
            party: parsedParty,
            startAct: dateStr,
            finishAct: dateStr,
            updatedAt: nowIso,
          },
        ],
        updatedAt: nowIso,
        createdBy: activeUserId,
      };
      newDelegations.push(delGroup);
      taskDelegationMap.set(t.id, delGroup);
      existingDelMap.set(deterministicGroupId, delGroup);
    }
  });

  if (newDelegations.length > 0) {
    useAppStore.getState().setDelegationGroups(Array.from(existingDelMap.values()));
  }

  return { newDelegations, taskDelegationMap };
}

/**
 * Saves tasks (and optional project summary ops) to LocalDB (Dexie) in background and commits
 * to Firestore + Delta bus in a single unified parallel operation.
 */
export async function batchSaveTasksToFirestore(
  tasksToSave: Task[],
  currentUser?: { id?: string; username?: string },
  options?: {
    precomputedDelegations?: {
      newDelegations: DelegationGroup[];
      taskDelegationMap: Map<string, DelegationGroup>;
    };
    projectWriteOps?: MassWriteOp[];
    projectDeltaItems?: TakaDeltaItem[];
    skipTaskDeltaBroadcast?: boolean;
  }
): Promise<void> {
  if (!tasksToSave || tasksToSave.length === 0) return;

  const now = new Date().toISOString();
  const { newDelegations, taskDelegationMap } =
    options?.precomputedDelegations ||
    prepareMissingDelegationsForTasks(tasksToSave, currentUser, now);

  // 1. Offload persistence to local Dexie database in background (non-blocking)
  import('./localDb')
    .then(({ bulkPersistTasks, bulkPersistDelegations }) => {
      bulkPersistTasks(tasksToSave).catch(() => {});
      if (newDelegations.length > 0) {
        bulkPersistDelegations(newDelegations).catch(() => {});
      }
    })
    .catch(() => {});

  // 2. Build unified MassWriteOp list and Delta list for project summaries + tasks + new delegations
  const [{ executeMassBatchOperations }, { removeUndefinedDeep }] = await Promise.all([
    import('./massBatchWriteEngine'),
    import('./firestoreSanitizer'),
  ]);
  const writeOps: MassWriteOp[] = [];
  const deltaItems: TakaDeltaItem[] = [];

  // Put authoritative project summary delta items FIRST so receiving devices seal project summaries immediately
  const syncedSummaryProjectIds = new Set<string>();
  if (options?.projectDeltaItems && options.projectDeltaItems.length > 0) {
    for (const pItem of options.projectDeltaItems) {
      deltaItems.push({
        ...pItem,
        data: pItem.data ? removeUndefinedDeep(pItem.data) : pItem.data,
      });
      if (pItem.docId) syncedSummaryProjectIds.add(String(pItem.docId).trim());
      if (pItem.projectId) syncedSummaryProjectIds.add(String(pItem.projectId).trim());
    }
  }

  for (const t of tasksToSave) {
    if (!t || !t.id || String(t.id).startsWith('ts_')) continue;
    const freshTask: Task = removeUndefinedDeep({ ...t, updatedAt: t.updatedAt || now });
    writeOps.push({
      collectionName: 'taka_tasks',
      docId: freshTask.id,
      action: 'set',
      data: freshTask,
      merge: true,
    });

    if (!options?.skipTaskDeltaBroadcast) {
      const tProjId = freshTask.projectId ? String(freshTask.projectId).trim() : '';
      const hasAuthProjSummary = Boolean(tProjId && syncedSummaryProjectIds.has(tProjId));
      deltaItems.push({
        docId: freshTask.id,
        collectionName: 'taka_tasks' as const,
        action: 'create' as const,
        isPatch: false,
        data: freshTask,
        year: freshTask.projectYear ? String(freshTask.projectYear) : undefined,
        projectId: tProjId || undefined,
        projectCode: freshTask.projectCode ? String(freshTask.projectCode) : undefined,
        projectStore: freshTask.projectStore ? String(freshTask.projectStore) : undefined,
        ...(hasAuthProjSummary ? { skipSummaryRollup: true } : {}),
      } as TakaDeltaItem);
    }

    const delGroup = taskDelegationMap.get(freshTask.id);
    if (delGroup) {
      const cleanDelGroup = removeUndefinedDeep(delGroup);
      writeOps.push({
        collectionName: 'taka_delegation_groups',
        docId: cleanDelGroup.id,
        action: 'set',
        data: cleanDelGroup,
        merge: true,
      });

      if (!options?.skipTaskDeltaBroadcast) {
        deltaItems.push({
          docId: cleanDelGroup.id,
          collectionName: 'taka_delegations' as const,
          action: 'create' as const,
          isPatch: false,
          data: cleanDelGroup,
          year: cleanDelGroup.projectYear ? String(cleanDelGroup.projectYear) : undefined,
          projectId: cleanDelGroup.projectId ? String(cleanDelGroup.projectId) : undefined,
          projectCode: cleanDelGroup.projectCode ? String(cleanDelGroup.projectCode) : undefined,
          projectStore: cleanDelGroup.projectStore ? String(cleanDelGroup.projectStore) : undefined,
        });
      }
    }
  }

  if (options?.projectWriteOps && options.projectWriteOps.length > 0) {
    options.projectWriteOps.forEach((op) => {
      writeOps.push({
        ...op,
        data: op.data ? removeUndefinedDeep(op.data) : op.data,
      });
    });
  }

  // 3. Commit Firestore batch FIRST, then broadcast coalesced delta so other devices always read committed docs
  await executeMassBatchOperations(writeOps, {
    suppressAutoDelta: true,
    skipLocalMirror: true,
  });
  if (deltaItems.length > 0) {
    await recordBatchDeltas(deltaItems, currentUser?.username || currentUser?.id);
  }
}

/**
 * Recalculates and synchronizes project summarize (`taskSummaries`, `computedTakStart`,
 * `computedTakCompl`, `taskCount`, `computedPlanProgress`, `computedActProgress`)
 * to Zustand store (0ms) and Firestore for all affected projects.
 */
export async function syncAffectedProjectSummaries(
  affectedProjects: Project[],
  allTasks: Task[],
  delegationGroups: DelegationGroup[] = []
): Promise<void> {
  if (!affectedProjects.length) return;

  await Promise.all(
    affectedProjects.map(async (project) => {
      if (!project.id) return;
      const projectTasks = allTasks.filter((t) => {
        if (t.projectId && project.id) {
          return String(t.projectId) === String(project.id);
        }
        if (!t.projectCode) return false;
        const tCode = String(t.projectCode).trim().toLowerCase();
        const pCode = String(project.code || '').trim().toLowerCase();
        if (tCode !== pCode) return false;

        const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
        const pStore = project.store ? String(project.store).trim().toLowerCase() : '';
        if (pStore && tStore && pStore !== tStore) return false;

        const tYear = t.projectYear ? String(t.projectYear).trim() : '';
        const pYear = project.year ? String(project.year).trim() : '';
        if (pYear && tYear && pYear !== tYear) return false;

        return true;
      });

      const computed = calculateProjectComputedDates(project, projectTasks, delegationGroups);
      await syncProjectDatesToFirestore(project.id, computed);
    })
  );
}
