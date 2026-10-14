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
import { rollupParentTaskDatesAndStatus } from './taskRollupService';

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

  // Index taskNoMap for resolving predecessors
  const currentAllTasks = Array.from(workingMap.values());
  const taskNoMap = buildTaskNoMap(projects, currentAllTasks);

  // Relax dependencies iteratively (topological convergence with cycle limit)
  const maxIterations = Math.max(10, tasksToProcess.length + 5);
  let hasChanges = true;
  let iteration = 0;

  while (hasChanges && iteration < maxIterations) {
    hasChanges = false;
    iteration++;

    for (const t of tasksToProcess) {
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

      // Task has predecessor: parse and compute dates
      const parsedPreds = parsePredecessors(predString, taskNoMap, current);
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
 * Recalculates start/finish/duration/runningStatus for parent tasks.
 */
export function rollupParentTaskDates(
  allTasks: Task[],
  _targetParentIds?: string[]
): { updatedParents: Task[]; allTasksMap: Map<string, Task> } {
  const rolledUpList = rollupParentTaskDatesAndStatus(allTasks);
  const taskMap = new Map<string, Task>();
  const updatedParents: Task[] = [];

  rolledUpList.forEach((t) => {
    taskMap.set(t.id, t);
    const original = allTasks.find((orig) => orig.id === t.id);
    if (
      original &&
      (original.start !== t.start ||
        original.finish !== t.finish ||
        original.duration !== t.duration ||
        original.runningStatus !== t.runningStatus)
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
 * Saves tasks to Firestore in safe chunks (max 400 operations per batch).
 */
export async function batchSaveTasksToFirestore(
  tasksToSave: Task[],
  currentUser?: { id?: string; username?: string }
): Promise<void> {
  if (!tasksToSave || tasksToSave.length === 0) return;

  const BATCH_LIMIT = 400;
  for (let i = 0; i < tasksToSave.length; i += BATCH_LIMIT) {
    const chunk = tasksToSave.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);

    chunk.forEach(t => {
      const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
      batch.set(tRef, t, { merge: true });

      if (t.delegation) {
        const now = new Date().toISOString();
        const dateStr = now.substring(0, 10);
        const activeUserId = currentUser?.id && currentUser.id !== 'guest' 
          ? currentUser.id 
          : (currentUser?.username || 'system');
        const rawParty = (t.party && t.party.trim()) ? t.party.trim() : '';
        const parsedParty = rawParty.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean)[0] || rawParty;
        const deterministicGroupId = `del_${t.id}`;

        // Only create delegation group if party is explicitly assigned, preventing thousands of empty ghost delegations
        if (parsedParty) {
          const delGroup: DelegationGroup = {
            id: deterministicGroupId,
            parentTaskId: t.id,
            name: t.name || 'Delegated Task',
            projectCode: t.projectCode,
            projectStore: t.projectStore,
            projectYear: t.projectYear !== undefined && t.projectYear !== null && !isNaN(Number(t.projectYear)) 
              ? Number(t.projectYear) 
              : new Date().getFullYear(),
            subTasks: [{
              id: generateId(),
              name: '',
              comments: '',
              status: 'Assigned',
              delegationStatus: 'Assigned',
              priority: 'Mid',
              party: parsedParty,
              startAct: dateStr,
              finishAct: dateStr,
              updatedAt: now
            }],
            updatedAt: now,
            createdBy: activeUserId
          };

          const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId);
          batch.set(delRef, delGroup, { merge: true });
        }
      }
    });

    await batch.commit();

    // Ghi gom các delta theo lô vào 1 document duy nhất (Giai đoạn 2)
    const deltaItems = chunk.map((t) => ({
      docId: t.id,
      collectionName: 'taka_tasks' as const,
      action: 'update' as const,
      data: t,
      year: t.projectYear ? String(t.projectYear) : undefined,
    }));
    recordBatchDeltas(deltaItems, currentUser?.username || currentUser?.id).catch(() => {});
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

  for (const project of affectedProjects) {
    if (!project.id) continue;
    const projectTasks = allTasks.filter(t => {
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
  }
}
