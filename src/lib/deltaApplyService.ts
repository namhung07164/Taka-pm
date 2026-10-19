import { useAppStore } from '../store/useAppStore';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { TakaDelta, TakaDeltaItem, Project, Task, Cost, DelegationGroup } from '../types';
import { localDb } from './localDb';
import { applyDeltasToLocalDatabase } from './backgroundSyncWorker';
import { triggerBatchChangeFlash } from './changeFlashService';
import { broadcastAppliedDeltas } from './broadcastSyncService';
import { applyFieldPatch } from './deltaPatchService';
import { resolveInvalidations } from './deltaInvalidateService';
import {
  deltaTime,
  getLastDeltaSyncTime,
  getRestoreCutoffTimestamp,
  markRestoreVersionCompleted,
} from './deltaSyncService';
import { CLIENT_SESSION_ID, DELTA_COLLECTION, LAST_SYNC_KEY } from './deltaConstants';
import { safeSetItemLocal } from './storage';
import { markTasksDeleted } from './taskDeletedTracker';
import {
  tsOf,
  buildDeltaProjectsIndex,
  reconcileTasksAgainstIncomingProjectSummaries,
  upsertTaskSummaryIntoMatchingProjects,
  recalculateTouchedProjectsAfterDeltas,
} from './deltaApplyParts/deltaProjectReconciler';

/**
 * Applies a list of (already de-duplicated) deltas to Zustand + Dexie. Shared by the real-time listener and the
 * safety poll. Returns the number of deltas processed.
 * Pre-indexes projects in O(P) to eliminate linear scans per task delta.
 */
export function applyIncomingDeltas(deltas: TakaDelta[]): number {
  if (!deltas || deltas.length === 0) return 0;

  usePerformanceStore
    .getState()
    .trackGetDoc(DELTA_COLLECTION, false, deltas.length, `Pulled ${deltas.length} deltas`);

  const lastSyncTime = getLastDeltaSyncTime();
  let maxTime = lastSyncTime;
  const store = useAppStore.getState();

  let updatedProjects = [...(store.projects || [])];
  let updatedTasks = [...(store.tasks || [])];
  let updatedCosts = [...(store.costs || [])];
  let updatedDelegations = [...(store.delegationGroups || [])];

  // Pre-index projects by ID and Code in O(P) (rebuilt only when projects array length changes)
  let projectsIndex = buildDeltaProjectsIndex(updatedProjects);

  let projectsChanged = false;
  let tasksChanged = false;
  let costsChanged = false;
  let delegationsChanged = false;

  const invalidations: TakaDeltaItem[] = [];

  const touchedProjectIds = new Set<string>();
  const touchedProjectCodes = new Set<string>();
  const noteTouchedProject = (t: any) => {
    if (!t) return;
    if (t.projectId) touchedProjectIds.add(String(t.projectId));
    if (t.projectCode) touchedProjectCodes.add(String(t.projectCode).trim().toLowerCase());
  };

  const applyItem = (
    docId: string,
    collectionNameRaw: string,
    action: 'create' | 'update' | 'delete',
    data: any,
    _year?: string
  ) => {
    const collectionName =
      collectionNameRaw === 'taka_delegation_groups' ? 'taka_delegations' : collectionNameRaw;
    if (
      collectionName === 'taka_delegations' &&
      !store.isDelegationsRequested &&
      store.delegationGroups.length === 0
    ) {
      return;
    }

    const isDelete = action === 'delete' || data?.isDeleted === true;

    const isStaleVsLocal = (existing: any): boolean => {
      if (isDelete || !data) return false;
      const incoming = tsOf(data.updatedAt);
      if (!incoming) return false;
      return tsOf(existing?.updatedAt) > incoming;
    };

    switch (collectionName) {
      case 'taka_projects': {
        const idx = projectsIndex.byId.get(String(docId)) ?? updatedProjects.findIndex((p) => p.id === docId);
        if (isDelete || data?.isDeleted) {
          if (idx !== -1) {
            projectsChanged = true;
            updatedProjects = updatedProjects.filter((p) => p.id !== docId);
            projectsIndex = buildDeltaProjectsIndex(updatedProjects);
          }
          break;
        }
        if (idx !== -1 && isStaleVsLocal(updatedProjects[idx])) return;

        projectsChanged = true;
        let nextProj: Project | null = null;
        if (idx !== -1) {
          const prevProj = updatedProjects[idx];
          nextProj = applyFieldPatch(prevProj, data) as Project;
          if (Array.isArray(data?.taskSummaries)) {
            nextProj.taskCount = data.taskSummaries.length;
          }
          updatedProjects[idx] = nextProj;
        } else if (action === 'create') {
          nextProj = { id: docId, ...data } as Project;
          updatedProjects.push(nextProj);
          projectsIndex = buildDeltaProjectsIndex(updatedProjects);
        }

        if (nextProj && Array.isArray(data?.taskSummaries)) {
          const reconciled = reconcileTasksAgainstIncomingProjectSummaries(
            nextProj,
            data.taskSummaries,
            updatedTasks
          );
          if (reconciled.tasksChanged) {
            updatedTasks = reconciled.nextTasks;
            tasksChanged = true;
          }
        }
        break;
      }

      case 'taka_tasks': {
        const idx = updatedTasks.findIndex((t) => t.id === docId);
        const existingTask = idx !== -1 ? updatedTasks[idx] : null;
        noteTouchedProject(existingTask);
        noteTouchedProject(data);
        if (isDelete || data?.isDeleted) {
          const pIdHint = data?.projectId || existingTask?.projectId;
          markTasksDeleted([docId], pIdHint ? String(pIdHint) : undefined);
          localDb.tasks.delete(docId).catch(() => {});
          if (idx !== -1) {
            tasksChanged = true;
            updatedTasks = updatedTasks.filter((t) => t.id !== docId);
          }
          const docIdLower = String(docId).trim().toLowerCase();
          const delNameLower = String(data?.name || existingTask?.name || '')
            .trim()
            .toLowerCase();
          const delCodeLower = String(data?.taskCodePhu || existingTask?.taskCodePhu || '')
            .trim()
            .toLowerCase();

          updatedProjects = updatedProjects.map((p) => {
            if (Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
              const filteredSummaries = p.taskSummaries.filter((s: any) => {
                const sId = s?.id ? String(s.id).trim().toLowerCase() : '';
                if (sId && sId === docIdLower) return false;
                if (
                  !sId &&
                  delNameLower &&
                  String(s?.name || '').trim().toLowerCase() === delNameLower
                ) {
                  const sCode = s?.taskCodePhu ? String(s.taskCodePhu).trim().toLowerCase() : '';
                  if (!delCodeLower || !sCode || sCode === delCodeLower) return false;
                }
                return true;
              });
              if (filteredSummaries.length !== p.taskSummaries.length) {
                projectsChanged = true;
                markTasksDeleted([docId], p.id ? String(p.id) : undefined);
                noteTouchedProject({ projectId: p.id, projectCode: p.code });
                return {
                  ...p,
                  taskSummaries: filteredSummaries,
                  taskCount: filteredSummaries.length,
                };
              }
            }
            return p;
          });
          break;
        }
        if (idx !== -1 && isStaleVsLocal(updatedTasks[idx])) return;

        const mergedTask = (
          idx !== -1 ? applyFieldPatch(updatedTasks[idx], data) : { id: docId, ...data }
        ) as Task;

        // O(1) upsert into matching project's taskSummaries via pre-built projectsIndex
        if (
          upsertTaskSummaryIntoMatchingProjects({
            docId,
            action,
            mergedTask,
            updatedProjects,
            projectsIndex,
          })
        ) {
          projectsChanged = true;
        }

        if (idx !== -1) {
          tasksChanged = true;
          updatedTasks[idx] = mergedTask;
        } else if (action === 'create') {
          if (store.isTasksRequested || updatedTasks.length > 0) {
            const expandedSet = new Set(
              [...(store.expandedProjectIds || []), ...(store.searchActiveProjectIds || [])].map(
                String
              )
            );
            const tProjId = mergedTask.projectId ? String(mergedTask.projectId) : '';
            const tCode = mergedTask.projectCode ? String(mergedTask.projectCode) : '';
            const projInMemory = updatedTasks.some(
              (t) =>
                (tProjId && String(t.projectId) === tProjId) ||
                (tCode && String(t.projectCode || '').toLowerCase() === tCode.toLowerCase())
            );
            const matchingIdx =
              (tProjId ? projectsIndex.byId.get(tProjId) : undefined) ??
              (tCode ? projectsIndex.byCodePart.get(tCode.toLowerCase())?.[0] : undefined);
            const matchingProj =
              matchingIdx !== undefined ? updatedProjects[matchingIdx] : undefined;
            const isProjExpandedOrEmpty =
              projInMemory ||
              (tProjId && expandedSet.has(tProjId)) ||
              (tCode && expandedSet.has(tCode)) ||
              !matchingProj ||
              (matchingProj.taskSummaries?.length || 0) <= 1;

            if (isProjExpandedOrEmpty) {
              tasksChanged = true;
              updatedTasks.push(mergedTask);
            }
          }
        }
        break;
      }

      case 'taka_costs': {
        const idx = updatedCosts.findIndex((c) => c.id === docId);
        if (isDelete || data?.isDeleted) {
          localDb.costs.delete(docId).catch(() => {});
          if (idx !== -1) {
            costsChanged = true;
            updatedCosts = updatedCosts.filter((c) => c.id !== docId);
          }
          break;
        }
        if (!store.isCostsRequested && updatedCosts.length === 0) return;
        if (idx !== -1 && isStaleVsLocal(updatedCosts[idx])) return;

        costsChanged = true;
        if (idx !== -1) {
          updatedCosts[idx] = applyFieldPatch(updatedCosts[idx], data) as Cost;
        } else if (action === 'create') {
          updatedCosts.push({ id: docId, ...data } as Cost);
        }
        break;
      }

      case 'taka_delegations': {
        const idx = updatedDelegations.findIndex((g) => g.id === docId);
        if (isDelete || data?.isDeleted) {
          localDb.delegations.delete(docId).catch(() => {});
          if (idx !== -1) {
            delegationsChanged = true;
            updatedDelegations = updatedDelegations.filter((g) => g.id !== docId);
          }
          break;
        }
        if (idx !== -1 && isStaleVsLocal(updatedDelegations[idx])) return;

        delegationsChanged = true;
        if (idx !== -1) {
          updatedDelegations[idx] = applyFieldPatch(
            updatedDelegations[idx],
            data
          ) as DelegationGroup;
        } else if (action === 'create') {
          updatedDelegations.push({ id: docId, ...data } as DelegationGroup);
        }
        break;
      }
    }
  };

  deltas.forEach((delta) => {
    if (deltaTime(delta) > maxTime) {
      maxTime = deltaTime(delta);
    }

    if (delta.docId === 'sys_restore_signal' || delta.data?.type === 'VERSION_RESTORE') {
      const cutoff = delta.data?.restoreCutoff || deltaTime(delta);
      if (cutoff > getRestoreCutoffTimestamp()) {
        markRestoreVersionCompleted(cutoff, true);
        localDb.projects.clear().catch(() => {});
        localDb.tasks.clear().catch(() => {});
        localDb.costs.clear().catch(() => {});
        localDb.delegations.clear().catch(() => {});
      }
      return;
    }

    if (delta.sessionId && delta.sessionId === CLIENT_SESSION_ID) {
      return;
    }

    if (delta.action === 'batch_update' && Array.isArray(delta.batchItems)) {
      delta.batchItems.forEach((item) => {
        if (item.invalidate) {
          invalidations.push(item);
          return;
        }
        try {
          applyItem(item.docId, item.collectionName, item.action, item.data, item.year);
        } catch (err) {
          console.warn('[deltaSync] applyItem failed (batch item skipped):', item.docId, err);
        }
      });
    } else if (delta.docId && delta.collectionName) {
      try {
        applyItem(delta.docId, delta.collectionName, delta.action as any, delta.data, delta.year);
      } catch (err) {
        console.warn('[deltaSync] applyItem failed (delta skipped):', delta.docId, err);
      }
    }
  });

  let touchedProjectsToPersist: Project[] = [];
  if (
    (tasksChanged || projectsChanged) &&
    (touchedProjectIds.size > 0 || touchedProjectCodes.size > 0)
  ) {
    const recalculated = recalculateTouchedProjectsAfterDeltas({
      updatedProjects,
      updatedTasks,
      delegationGroups: store.delegationGroups || [],
      touchedProjectIds,
      touchedProjectCodes,
    });
    updatedProjects = recalculated.nextProjects;
    touchedProjectsToPersist = recalculated.touchedProjectsToPersist;
    projectsChanged = true;
  }

  if (projectsChanged) store.setProjects(updatedProjects);
  if (tasksChanged) store.setTasks(updatedTasks);
  if (costsChanged) store.setCosts(updatedCosts);
  if (delegationsChanged) store.setDelegationGroups(updatedDelegations);

  if (touchedProjectsToPersist.length > 0) {
    localDb.projects.bulkPut(touchedProjectsToPersist).catch(() => {});
  }

  const flashEntries: Array<{ docId: string; collectionName: any; updatedBy?: string }> = [];
  deltas.forEach((d) => {
    if (d.action === 'batch_update' && Array.isArray(d.batchItems)) {
      d.batchItems.forEach((item) => {
        if (item.action === 'create' || item.action === 'update') {
          flashEntries.push({
            docId: item.docId,
            collectionName: item.collectionName,
            updatedBy: d.updatedBy,
          });
        }
      });
    } else if ((d.action === 'create' || d.action === 'update') && d.docId && d.collectionName) {
      flashEntries.push({
        docId: d.docId,
        collectionName: d.collectionName,
        updatedBy: d.updatedBy,
      });
    }
  });
  if (flashEntries.length > 0) {
    triggerBatchChangeFlash(flashEntries);
  }

  applyDeltasToLocalDatabase(deltas).catch(() => {});
  broadcastAppliedDeltas(deltas);
  safeSetItemLocal(LAST_SYNC_KEY, String(maxTime));

  if (invalidations.length > 0) {
    resolveInvalidations(invalidations)
      .then((synthetic) => {
        if (synthetic.length > 0) applyIncomingDeltas(synthetic);
      })
      .catch((err) => console.warn('[deltaSync] invalidate resolve failed:', err));
  }

  return deltas.length;
}
