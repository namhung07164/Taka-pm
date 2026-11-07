import { doc } from 'firebase/firestore';
import { Task, DelegationGroup, AppUser, TakaDeltaItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { writeBatch } from '../firestoreWrites';
import { db, APP_ID } from '../firebase';
import { undoManager } from '../undoManager';
import { saveTaskStateUnified } from '../taskStateService';
import { recordBatchDeltas } from '../deltaSyncService';
import { createPatchDeltaItem } from '../deltaPatchService';

interface CommitTaskInlineBatchParams {
  t: Task;
  newT: Task;
  batch: ReturnType<typeof writeBatch>;
  allUpdatesToSave: Array<Partial<Task> & { id: string }>;
  depUpdates: Task[];
  updatesToDependents: Task[];
  newDelegations: DelegationGroup[];
  latestTasks: Task[];
  effectiveUser?: AppUser | null;
  skipProjectRollup?: boolean;
}

export function offloadTaskInlineBatchCommit({
  t,
  newT,
  batch,
  allUpdatesToSave,
  depUpdates,
  updatesToDependents,
  newDelegations,
  latestTasks,
  effectiveUser,
  skipProjectRollup,
}: CommitTaskInlineBatchParams): void {
  setTimeout(async () => {
    try {
      if (newDelegations.length > 0) {
        import('../localDb')
          .then(({ bulkPersistDelegations }) => bulkPersistDelegations(newDelegations))
          .catch(() => {});
      }
      const prevTaskById = new Map<string, Task>();
      for (let i = 0; i < latestTasks.length; i++) {
        const item = latestTasks[i];
        if (item?.id) prevTaskById.set(item.id, item);
      }

      const deltaItems: TakaDeltaItem[] = allUpdatesToSave.map((item) => {
        const prev = prevTaskById.get(item.id);
        return createPatchDeltaItem({
          docId: item.id,
          collectionName: 'taka_tasks',
          previous: prev,
          updated: item,
          action: 'update',
          year: (item as any).projectYear
            ? String((item as any).projectYear)
            : t.projectYear
            ? String(t.projectYear)
            : undefined,
        });
      });

      deltaItems.forEach((di) => {
        if (di.action === 'update' && di.data) {
          if (!di.data.projectId && newT.projectId) di.data.projectId = newT.projectId;
          if (!di.data.projectCode && newT.projectCode) di.data.projectCode = newT.projectCode;
          if (!di.data.projectStore && newT.projectStore) di.data.projectStore = newT.projectStore;
          if (!di.data.projectYear && newT.projectYear) di.data.projectYear = newT.projectYear;
        }
      });

      newDelegations.forEach((delGroup) => {
        deltaItems.push({
          docId: delGroup.id,
          collectionName: 'taka_delegations',
          action: 'create',
          isPatch: false,
          data: delGroup,
          year: delGroup.projectYear ? String(delGroup.projectYear) : undefined,
          projectId: delGroup.projectId ? String(delGroup.projectId) : undefined,
          projectCode: delGroup.projectCode ? String(delGroup.projectCode) : undefined,
          projectStore: delGroup.projectStore ? String(delGroup.projectStore) : undefined,
        });
      });

      const { markExplicitDelta } = await import('../autoDeltaQueue');
      markExplicitDelta(deltaItems);
      await Promise.all([
        batch.commit(),
        saveTaskStateUnified(allUpdatesToSave, { syncProjects: !skipProjectRollup }),
      ]);
      const actor = effectiveUser ? effectiveUser.username || effectiveUser.id : 'system';
      recordBatchDeltas(deltaItems, actor).catch(() => {});
    } catch (error: any) {
      console.error('Batch commit failed', error);
      useAppStore.getState().setToast({
        title: 'Save Failed',
        message: 'Network error or permission denied. Data was not saved.',
        type: 'error',
      });
      saveTaskStateUnified([
        t,
        ...depUpdates.map((d) => latestTasks.find((tsk) => tsk.id === d.id) || d),
      ]);
    }
  }, 0);

  const previousTasksSnapshot: Task[] = [
    t,
    ...updatesToDependents
      .map((depTask) => latestTasks.find((tsk) => tsk.id === depTask.id))
      .filter((item): item is Task => Boolean(item)),
  ];
  const newTasksSnapshot: Task[] = allUpdatesToSave.map((u) => {
    const base = u.id === newT.id ? newT : latestTasks.find((tsk) => tsk.id === u.id) || t;
    return { ...base, ...u } as Task;
  });

  undoManager.push({
    description: `Update Task: ${newT.name || t.name}`,
    revert: async () => {
      const { restoreTasksSnapshot } = await import('../undoStateHelpers');
      await restoreTasksSnapshot({
        tasksToRestore: previousTasksSnapshot,
        delegationIdsToDelete: newDelegations.map((d) => d.id),
      });
    },
    redo: async () => {
      const { restoreTasksSnapshot } = await import('../undoStateHelpers');
      await restoreTasksSnapshot({
        tasksToRestore: newTasksSnapshot,
        delegationsToRestore: newDelegations,
      });
    },
  });
}
