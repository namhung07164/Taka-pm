import { Task, Project, DelegationGroup } from '../types';
import { 
  parsePredecessors, 
  buildTaskNoMap, 
  calculateTaskDatesFromPredecessors, 
  addDays 
} from './ganttUtils';
import { parseDateTime, formatToDatetimeLocal, generateId } from './utils';
import { calculateProjectComputedDates, syncProjectDatesToFirestore } from './projectDatesService';
import { findAffectedProjects } from './taskStateService';
import { doc } from 'firebase/firestore';
import { db, APP_ID, writeBatch } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { recordBatchDeltas } from './deltaSyncService';
import { markExplicitDelta } from './autoDeltaQueue';
import { rollupParentTaskDatesAndStatus } from './taskRollupService';
import { applyParentPredecessorsToTaskTree } from './parentTaskPredecessorService';

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

      const predString = current.predecessor ? String(current.predecessor).trim() : '';
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

  const rolledUpList = rollupParentTaskDatesAndStatus(tasksWithParentPreds);
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
 * Saves tasks to LocalDB (Dexie) immediately and commits to Firestore in safe operation-counted chunks
 * (max 200 ops per batch) with Offline Queue fallback and multi-device upsert deltas.
 */
export async function batchSaveTasksToFirestore(
  tasksToSave: Task[],
  currentUser?: { id?: string; username?: string }
): Promise<void> {
  if (!tasksToSave || tasksToSave.length === 0) return;

  const now = new Date().toISOString();
  const dateStr = now.substring(0, 10);
  const activeUserId =
    currentUser?.id && currentUser.id !== 'guest'
      ? currentUser.id
      : currentUser?.username || 'system';

  const generatedDelegations: DelegationGroup[] = [];
  const taskDelegationMap = new Map<string, DelegationGroup>();

  tasksToSave.forEach((t) => {
    if (t.delegation) {
      const rawParty = t.party && t.party.trim() ? t.party.trim() : '';
      const parsedParty =
        rawParty
          .split(/[,;/+]+/)
          .map((s) => s.trim())
          .filter(Boolean)[0] || rawParty;
      if (parsedParty) {
        const deterministicGroupId = `del_${t.id}`;
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
              updatedAt: now,
            },
          ],
          updatedAt: now,
          createdBy: activeUserId,
        };
        generatedDelegations.push(delGroup);
        taskDelegationMap.set(t.id, delGroup);
      }
    }
  });

  // 1. Persist immediately to local Dexie database & Zustand delegations so local cache is 100% synced
  try {
    const { bulkPersistTasks, bulkPersistDelegations } = await import('./localDb');
    await bulkPersistTasks(tasksToSave).catch(() => {});
    if (generatedDelegations.length > 0) {
      await bulkPersistDelegations(generatedDelegations).catch(() => {});
    }
  } catch {
    // Fallback if IndexedDB is unavailable
  }

  if (generatedDelegations.length > 0) {
    const store = useAppStore.getState();
    const existingDel = store.delegationGroups || [];
    const delMap = new Map<string, DelegationGroup>(existingDel.map((d) => [d.id, d]));
    generatedDelegations.forEach((d) => {
      if (!delMap.has(d.id)) delMap.set(d.id, d);
    });
    store.setDelegationGroups(Array.from(delMap.values()));
  }

  // 2. Build MassWriteOp list and Delta list for all tasks and generated delegations
  const { executeMassBatchOperations } = await import('./massBatchWriteEngine');
  const writeOps: import('./massBatchWriteEngine').MassWriteOp[] = [];
  const deltaItems: any[] = [];

  for (const t of tasksToSave) {
    const freshTask: Task = { ...t, updatedAt: now };
    writeOps.push({
      collectionName: 'taka_tasks',
      docId: freshTask.id,
      action: 'set',
      data: freshTask,
      merge: true,
    });

    deltaItems.push({
      docId: freshTask.id,
      collectionName: 'taka_tasks' as const,
      action: 'create' as const,
      isPatch: false,
      data: freshTask,
      year: freshTask.projectYear ? String(freshTask.projectYear) : undefined,
      projectId: freshTask.projectId ? String(freshTask.projectId) : undefined,
      projectCode: freshTask.projectCode ? String(freshTask.projectCode) : undefined,
      projectStore: freshTask.projectStore ? String(freshTask.projectStore) : undefined,
    });

    const delGroup = taskDelegationMap.get(freshTask.id);
    if (delGroup) {
      writeOps.push({
        collectionName: 'taka_delegation_groups',
        docId: delGroup.id,
        action: 'set',
        data: delGroup,
        merge: true,
      });

      deltaItems.push({
        docId: delGroup.id,
        collectionName: 'taka_delegations' as const,
        action: 'create' as const,
        isPatch: false,
        data: delGroup,
        year: delGroup.projectYear ? String(delGroup.projectYear) : undefined,
        projectId: delGroup.projectId ? String(delGroup.projectId) : undefined,
        projectCode: delGroup.projectCode ? String(delGroup.projectCode) : undefined,
        projectStore: delGroup.projectStore ? String(delGroup.projectStore) : undefined,
      });
    }
  }

  // 3. Commit all operations via Resilient Mass Batch Engine (byte-capped, retry with backoff, bisection, and Offline Queue fallback)
  await executeMassBatchOperations(writeOps, {
    suppressAutoDelta: true,
  });

  // 4. Broadcast coalesced batch deltas (chunked by count & byte size with retry)
  await recordBatchDeltas(deltaItems, currentUser?.username || currentUser?.id);
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

