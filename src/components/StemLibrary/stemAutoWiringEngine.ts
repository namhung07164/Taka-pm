import { doc } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';
import { writeBatch } from '../../lib/firestoreWrites';
import { useAppStore } from '../../store/useAppStore';
import { Project, Task, TaskPredecessor, DelegationGroup } from '../../types';
import { formatToDatetimeLocal } from '../../lib/utils';
import { scheduleDependentTasks } from '../../lib/ganttUtilsParts/scheduleAndReorderEngine';
import { getTasksForProject } from '../../lib/projectDatesService';
import { saveTaskStateUnified } from '../../lib/taskStateService';
import { triggerBatchChangeFlash } from '../../lib/changeFlashService';
import { syncQueueManager } from '../../lib/syncQueue';
import { StemWorkbenchBlock } from './stemLibraryTypes';
import {
  getNextSubtaskStartIndex,
  computeWorkbenchSchedule,
  hasDirectedDependencyCycle,
  type OpeningRiskAnalysis,
  type ComputedWorkbenchSchedule,
} from './stemScheduleCalculator';

export {
  getNextSubtaskStartIndex,
  computeWorkbenchSchedule,
  hasDirectedDependencyCycle,
  type OpeningRiskAnalysis,
  type ComputedWorkbenchSchedule,
};

/**
 * Step 4 Auto-Wiring Execution:
 * Materializes the STEM Workbench blocks into full Taka-PM Tasks with:
 * - Sequential [ProjectCode]#[Index] codes & 4 composite keys (projectId, projectCode, projectYear, projectStore)
 * - 3-field Predecessor compatibility (predecessor string, predecessorTaskIds, predecessors array)
 * - 0ms Zustand optimistic update + Smart Change Flash + Dexie bulkPersistTasks + Firestore writeBatch
 */
export async function applyStemWorkbenchToProject(params: {
  project: Project;
  computedBlocks: StemWorkbenchBlock[];
  userEmail?: string;
}): Promise<{ createdTasks: Task[]; createdDelegationCount: number }> {
  const { project, computedBlocks, userEmail } = params;
  if (!project || !computedBlocks.length) {
    return { createdTasks: [], createdDelegationCount: 0 };
  }

  const state = useAppStore.getState();
  const allTasks = state.tasks || [];
  const allProjects = state.projects || [];
  const existingProjTasks = getTasksForProject(project, allTasks).filter((t) => !t.isDeleted);
  const startSubtaskNum = getNextSubtaskStartIndex(project, allTasks);
  const baseOrderIndex = existingProjTasks.length;

  const nowIso = new Date().toISOString();
  const cleanCode = String(project.code || '').trim();
  const safeYear =
    project.year !== undefined && project.year !== null && !isNaN(Number(project.year))
      ? Number(project.year)
      : new Date().getFullYear();
  const safeStore = String(project.store || 'HCM').trim();

  const blockIds = computedBlocks.map(
    (_, idx) => `task_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`
  );

  const newTasks: Task[] = computedBlocks.map((blk, idx) => {
    const subtaskNumber = startSubtaskNum + idx;
    const taskCodePhu = `${cleanCode}#${subtaskNumber}`;

    let predecessorStr = '';
    let predecessorTaskIds: string[] = [];
    let predecessorsObj: TaskPredecessor[] = [];

    if (idx > 0 && blk.connectorToPrev !== 'NONE') {
      const prevTaskId = blockIds[idx - 1];
      const prevTaskCode = `${cleanCode}#${startSubtaskNum + idx - 1}`;
      const relSuffix = blk.connectorToPrev === 'FS' ? '' : blk.connectorToPrev;
      const lagSuffix =
        blk.lagDays && blk.lagDays !== 0
          ? blk.lagDays > 0
            ? `+${blk.lagDays}`
            : `${blk.lagDays}`
          : '';

      predecessorStr = `${prevTaskCode}${relSuffix}${lagSuffix}`;
      predecessorTaskIds = [prevTaskId];
      predecessorsObj = [
        {
          taskId: prevTaskId,
          type: blk.connectorToPrev,
          lagDays: blk.lagDays || 0,
        },
      ];
    }

    return {
      id: blockIds[idx],
      projectId: project.id,
      projectCode: cleanCode,
      projectYear: safeYear,
      projectStore: safeStore,
      location: project.location || 'L1',
      taskCodePhu,
      orderIndex: baseOrderIndex + idx,
      name: blk.name.trim(),
      start: blk.computedStart || formatToDatetimeLocal(new Date()),
      finish: blk.computedFinish || formatToDatetimeLocal(new Date()),
      duration: String(blk.duration),
      durationManual: true,
      finishManual: false,
      predecessor: predecessorStr,
      predecessorTaskIds,
      predecessors: predecessorsObj,
      party: blk.party || 'PMO',
      delegation: Boolean(blk.delegation),
      runningStatus: 'Upcoming',
      progress: 0,
      approval: 'Pending',
      realtimeUpdate: Boolean(predecessorStr),
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: userEmail || 'PM',
      isDeleted: false,
    };
  });

  if (hasDirectedDependencyCycle([...existingProjTasks, ...newTasks])) {
    throw new Error('Detected circular dependency in workbench blocks. Please review connectors.');
  }

  const combinedTasks = [...allTasks, ...newTasks];
  const cascadedUpdates =
    newTasks.length > 0 ? scheduleDependentTasks(newTasks[0], combinedTasks, allProjects) : [];
  if (cascadedUpdates.length > 0) {
    const cascadeMap = new Map(cascadedUpdates.map((u) => [u.id, u]));
    for (let i = 0; i < newTasks.length; i++) {
      const updated = cascadeMap.get(newTasks[i].id);
      if (updated) {
        newTasks[i] = { ...newTasks[i], start: updated.start, finish: updated.finish };
      }
    }
  }

  const newDelegationGroups: DelegationGroup[] = newTasks
    .filter((t) => t.delegation)
    .map((t, idx) => ({
      id: `del_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      projectId: project.id,
      parentTaskId: t.id,
      name: t.name,
      projectCode: cleanCode,
      projectStore: safeStore,
      projectYear: safeYear,
      subTasks: [],
      updatedAt: nowIso,
      createdBy: userEmail || 'PM',
      actStatus: 'Not Started',
      plStatus: 'On Track',
      isDeleted: false,
    }));

  // 1. 0ms Optimistic UI Update via saveTaskStateUnified + DelegationGroups
  await saveTaskStateUnified(newTasks);
  if (newDelegationGroups.length > 0) {
    const currDel = useAppStore.getState().delegationGroups || [];
    useAppStore.getState().setDelegationGroups([...currDel, ...newDelegationGroups]);
  }

  // 2. Trigger Smart Change Flash (emerald green highlight on newly wired rows & project)
  triggerBatchChangeFlash([
    ...newTasks.map((t) => ({
      docId: t.id,
      collectionName: 'taka_tasks',
      updatedBy: userEmail || 'STEM Builder',
    })),
    ...(project.id
      ? [{ docId: project.id, collectionName: 'taka_projects', updatedBy: userEmail || 'STEM Builder' }]
      : []),
  ]);

  // 3. Persist to Local-First Dexie cache non-blocking
  setTimeout(() => {
    import('../../lib/localDb')
      .then(({ bulkPersistTasks }) => bulkPersistTasks(newTasks))
      .catch(() => {});
  }, 0);

  // 4. Commit to Firestore via writeBatch wrapper (auto-emits taka_deltas) with Offline Queue fallback
  try {
    const batch = writeBatch(db);
    for (const task of newTasks) {
      const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', task.id);
      batch.set(taskRef, task, { merge: true });
    }
    for (const delGroup of newDelegationGroups) {
      const delRef = doc(
        db,
        'artifacts',
        APP_ID,
        'public',
        'data',
        'taka_delegation_groups',
        delGroup.id
      );
      batch.set(delRef, delGroup, { merge: true });
    }
    await batch.commit();
  } catch (err) {
    console.warn('[StemAutoWiring] Firestore batch failed, queueing offline writes:', err);
    for (const task of newTasks) {
      syncQueueManager.addToQueue('taka_tasks', task.id, 'set', task).catch(() => {});
    }
  }

  // 5. Register 0ms Local-First + Firestore Undo & Redo
  const { undoManager } = await import('../../lib/undoManager');
  const { restoreTasksSnapshot } = await import('../../lib/undoStateHelpers');
  undoManager.push({
    description: `STEM Auto-Wire (${newTasks.length} tasks) → ${cleanCode}`,
    revert: async () => {
      await restoreTasksSnapshot({
        taskIdsToDelete: newTasks.map((t) => t.id),
        delegationIdsToDelete: newDelegationGroups.map((d) => d.id),
      });
    },
    redo: async () => {
      await restoreTasksSnapshot({
        tasksToRestore: newTasks,
        delegationsToRestore: newDelegationGroups,
      });
    },
  });

  return {
    createdTasks: newTasks,
    createdDelegationCount: newDelegationGroups.length,
  };
}
