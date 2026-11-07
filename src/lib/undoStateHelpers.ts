import { Task, Project, Cost, DelegationGroup } from '../types';
import { useAppStore } from '../store/useAppStore';
import { unmarkTaskDeleted, unmarkProjectDeleted, markProjectsDeleted } from './taskDeletedTracker';
import { saveTaskStateUnified, deleteTaskStateUnified } from './taskStateService';
import { executeMassBatchOperations, MassWriteOp } from './massBatchWriteEngine';
import { triggerBatchChangeFlash } from './changeFlashService';

export interface RestoreTasksSnapshotParams {
  tasksToRestore?: Task[];
  taskIdsToDelete?: string[];
  delegationsToRestore?: DelegationGroup[];
  delegationIdsToDelete?: string[];
}

/**
 * Unified 0ms Local-First + Dexie + Firestore Task & Delegation Snapshot Restorer
 * Used by both `revert` (Undo) and `redo` (Redo) handlers across the application.
 */
export async function restoreTasksSnapshot({
  tasksToRestore = [],
  taskIdsToDelete = [],
  delegationsToRestore = [],
  delegationIdsToDelete = [],
}: RestoreTasksSnapshotParams): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1. First delete any tasks that need to be removed (with skipUndo: true)
  const cleanDeleteIds = taskIdsToDelete.filter(Boolean).map(String);
  if (cleanDeleteIds.length > 0) {
    await deleteTaskStateUnified(cleanDeleteIds, { skipUndo: true });
  }

  // 2. Unmark restored tasks in taskDeletedTracker so they are never filtered out as zombies
  const sanitizedRestore: Task[] = tasksToRestore
    .filter((t) => t && t.id)
    .map((t) => {
      const cleanId = String(t.id);
      unmarkTaskDeleted(cleanId);
      const copy: any = {
        ...t,
        id: cleanId,
        isDeleted: false,
        updatedAt: nowIso,
      };
      delete copy._isVirtualSummary;
      Object.keys(copy).forEach((k) => {
        if (copy[k] === undefined) delete copy[k];
      });
      return copy as Task;
    });

  // 3. 0ms Optimistic UI update + Project Rollup Recalculation
  if (sanitizedRestore.length > 0) {
    await saveTaskStateUnified(sanitizedRestore, { syncProjects: true });

    triggerBatchChangeFlash(
      sanitizedRestore.map((t) => ({
        docId: String(t.id),
        collectionName: 'taka_tasks',
        updatedBy: 'Undo/Redo',
      }))
    );

    setTimeout(() => {
      import('./localDb')
        .then(({ bulkPersistTasks }) => bulkPersistTasks(sanitizedRestore))
        .catch(() => {});
    }, 0);
  }

  // 4. Handle Delegation Groups in Zustand + Dexie
  if (delegationsToRestore.length > 0 || delegationIdsToDelete.length > 0) {
    const delDeleteSet = new Set(delegationIdsToDelete.map(String));
    const restoreMap = new Map(
      delegationsToRestore.map((d) => [String(d.id), { ...d, isDeleted: false, updatedAt: nowIso }])
    );
    const currentDels = useAppStore.getState().delegationGroups || [];
    const nextDels: DelegationGroup[] = [];
    const seenIds = new Set<string>();

    for (const d of currentDels) {
      const dId = String(d.id);
      if (delDeleteSet.has(dId)) continue;
      if (restoreMap.has(dId)) {
        nextDels.push(restoreMap.get(dId)!);
        seenIds.add(dId);
      } else {
        nextDels.push(d);
      }
    }
    restoreMap.forEach((d, dId) => {
      if (!seenIds.has(dId)) nextDels.push(d);
    });
    useAppStore.getState().setDelegationGroups(nextDels);

    setTimeout(() => {
      import('./localDb')
        .then(async ({ localDb, bulkPersistDelegations }) => {
          if (delegationIdsToDelete.length > 0) {
            await localDb.delegations.bulkDelete(delegationIdsToDelete.map(String)).catch(() => {});
          }
          if (delegationsToRestore.length > 0) {
            await bulkPersistDelegations(Array.from(restoreMap.values())).catch(() => {});
          }
        })
        .catch(() => {});
    }, 0);
  }

  // 5. Commit restored tasks & delegation changes to Firestore via MassBatchWriteEngine
  const writeOps: MassWriteOp[] = [];
  sanitizedRestore.forEach((t) => {
    writeOps.push({
      collectionName: 'taka_tasks',
      docId: String(t.id),
      action: 'set',
      data: t,
      merge: false,
    });
  });
  delegationsToRestore.forEach((d) => {
    writeOps.push({
      collectionName: 'taka_delegation_groups',
      docId: String(d.id),
      action: 'set',
      data: { ...d, isDeleted: false, updatedAt: nowIso },
      merge: true,
    });
  });
  delegationIdsToDelete.forEach((dId) => {
    writeOps.push({
      collectionName: 'taka_delegation_groups',
      docId: String(dId),
      action: 'delete',
    });
  });

  if (writeOps.length > 0) {
    await executeMassBatchOperations(writeOps);
  }
}

export interface RestoreProjectsSnapshotParams {
  projectsToRestore?: Project[];
  projectIdsToDelete?: string[];
  tasksToRestore?: Task[];
  costsToRestore?: Cost[];
  delegationsToRestore?: DelegationGroup[];
}

/**
 * Unified 0ms Local-First + Dexie + Firestore Project Snapshot Restorer
 */
export async function restoreProjectsSnapshot({
  projectsToRestore = [],
  projectIdsToDelete = [],
  tasksToRestore = [],
  costsToRestore = [],
  delegationsToRestore = [],
}: RestoreProjectsSnapshotParams): Promise<void> {
  const nowIso = new Date().toISOString();
  const deleteIdSet = new Set(projectIdsToDelete.filter(Boolean).map(String));

  if (deleteIdSet.size > 0) {
    markProjectsDeleted(Array.from(deleteIdSet));
  }

  const sanitizedProjects: Project[] = projectsToRestore
    .filter((p) => p && (p.id || p.no !== undefined))
    .map((p) => {
      const pid = String(p.id || p.no);
      unmarkProjectDeleted(pid);
      return {
        ...p,
        id: pid,
        isDeleted: false,
        updatedAt: nowIso,
      };
    });

  const restoreById = new Map(sanitizedProjects.map((p) => [String(p.id), p]));
  const currentProjects = useAppStore.getState().projects || [];
  const nextProjects: Project[] = [];
  const seenIds = new Set<string>();

  for (const p of currentProjects) {
    const pid = String(p.id || p.no);
    if (deleteIdSet.has(pid)) continue;
    if (restoreById.has(pid)) {
      nextProjects.push(restoreById.get(pid)!);
      seenIds.add(pid);
    } else {
      nextProjects.push(p);
    }
  }
  restoreById.forEach((p, pid) => {
    if (!seenIds.has(pid)) nextProjects.push(p);
  });

  useAppStore.getState().setProjects(nextProjects);

  if (sanitizedProjects.length > 0) {
    triggerBatchChangeFlash(
      sanitizedProjects.map((p) => ({
        docId: String(p.id),
        collectionName: 'taka_projects',
        updatedBy: 'Undo/Redo',
      }))
    );
  }

  setTimeout(() => {
    import('./localDb')
      .then(async ({ localDb, bulkPersistProjects }) => {
        if (deleteIdSet.size > 0) {
          await localDb.projects.bulkDelete(Array.from(deleteIdSet)).catch(() => {});
        }
        if (sanitizedProjects.length > 0) {
          await bulkPersistProjects(sanitizedProjects).catch(() => {});
        }
      })
      .catch(() => {});
  }, 0);

  const writeOps: MassWriteOp[] = [];
  sanitizedProjects.forEach((p) => {
    const toSave: Record<string, any> = { ...p, isDeleted: false, updatedAt: nowIso };
    delete toSave.id;
    Object.keys(toSave).forEach((k) => {
      if (toSave[k] === undefined) delete toSave[k];
    });
    writeOps.push({
      collectionName: 'taka_projects',
      docId: String(p.id),
      action: 'set',
      data: toSave,
      merge: true,
    });
  });

  deleteIdSet.forEach((pid) => {
    writeOps.push({
      collectionName: 'taka_projects',
      docId: pid,
      action: 'set',
      data: { id: pid, isDeleted: true, taskSummaries: [], taskCount: 0, updatedAt: nowIso },
      merge: true,
    });
  });

  if (writeOps.length > 0) {
    await executeMassBatchOperations(writeOps);
  }

  if (tasksToRestore.length > 0 || delegationsToRestore.length > 0) {
    await restoreTasksSnapshot({
      tasksToRestore,
      delegationsToRestore,
    });
  }

  if (costsToRestore.length > 0) {
    await restoreCostsSnapshot({ costsToRestore });
  }
}

export interface RestoreCostsSnapshotParams {
  costsToRestore?: Cost[];
  costIdsToDelete?: string[];
  projectBudgetMap?: Map<string, number | undefined>;
}

/**
 * Unified 0ms Local-First + Dexie + Firestore Cost Snapshot Restorer
 */
export async function restoreCostsSnapshot({
  costsToRestore = [],
  costIdsToDelete = [],
  projectBudgetMap,
}: RestoreCostsSnapshotParams): Promise<void> {
  const nowIso = new Date().toISOString();
  const cleanDeleteIds = costIdsToDelete.filter(Boolean).map(String);

  if (cleanDeleteIds.length > 0) {
    useAppStore.getState().optimisticDeleteCosts(cleanDeleteIds);
  }

  const sanitizedCosts: Cost[] = costsToRestore
    .filter((c) => c && c.id)
    .map((c) => {
      const copy: any = { ...c, isDeleted: false, updatedAt: nowIso };
      Object.keys(copy).forEach((k) => {
        if (copy[k] === undefined) delete copy[k];
      });
      return copy as Cost;
    });

  if (sanitizedCosts.length > 0) {
    useAppStore.getState().optimisticUpdateCosts(sanitizedCosts);
  }

  if (projectBudgetMap && projectBudgetMap.size > 0) {
    const storeProjects = useAppStore.getState().projects || [];
    const touchedProjects: Project[] = [];
    const nextProjects = storeProjects.map((p) => {
      const pid = String(p.id || p.no);
      if (!projectBudgetMap.has(pid)) return p;
      const nextP = { ...p, budget: projectBudgetMap.get(pid) ?? 0, updatedAt: nowIso };
      touchedProjects.push(nextP);
      return nextP;
    });
    useAppStore.getState().setProjects(nextProjects);
    if (touchedProjects.length > 0) {
      import('./localDb')
        .then(({ bulkPersistProjects }) => bulkPersistProjects(touchedProjects))
        .catch(() => {});
    }
  }

  setTimeout(() => {
    import('./localDb')
      .then(async ({ localDb, bulkPersistCosts }) => {
        if (cleanDeleteIds.length > 0) {
          await localDb.costs.bulkDelete(cleanDeleteIds).catch(() => {});
        }
        if (sanitizedCosts.length > 0) {
          await bulkPersistCosts(sanitizedCosts).catch(() => {});
        }
      })
      .catch(() => {});
  }, 0);

  const writeOps: MassWriteOp[] = [];
  sanitizedCosts.forEach((c) => {
    writeOps.push({
      collectionName: 'taka_costs',
      docId: String(c.id),
      action: 'set',
      data: c,
      merge: false,
    });
  });
  cleanDeleteIds.forEach((cid) => {
    writeOps.push({
      collectionName: 'taka_costs',
      docId: cid,
      action: 'set',
      data: { id: cid, isDeleted: true, updatedAt: nowIso },
      merge: true,
    });
  });
  if (projectBudgetMap && projectBudgetMap.size > 0) {
    projectBudgetMap.forEach((budgetVal, pid) => {
      writeOps.push({
        collectionName: 'taka_projects',
        docId: pid,
        action: 'update',
        data: { budget: budgetVal ?? 0, updatedAt: nowIso },
      });
    });
  }

  if (writeOps.length > 0) {
    await executeMassBatchOperations(writeOps);
  }
}
