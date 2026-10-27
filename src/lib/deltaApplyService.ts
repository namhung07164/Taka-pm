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
  serverDeltaTime,
  getLastDeltaSyncTime,
  getRestoreCutoffTimestamp,
  markRestoreVersionCompleted,
} from './deltaSyncService';
import { CLIENT_SESSION_ID, DELTA_COLLECTION, LAST_SYNC_KEY } from './deltaConstants';
import { safeSetItemLocal } from './storage';
import { markTasksDeleted } from './taskDeletedTracker';
import { markLoaded } from './loadedMarkers';
import { markProjectTasksHydrated } from './utils';
import {
  tsOf,
  buildDeltaProjectsIndex,
  purgeProjectAndTasksOnDeleteDelta,
  unlinkChildTasksOnTaskDeleteDelta,
  removeDeletedTaskSummaryFromProjects,
  reconcileTasksAgainstIncomingProjectSummaries,
  upsertTaskSummaryIntoMatchingProjects,
  recalculateTouchedProjectsAfterDeltas,
} from './deltaApplyParts/deltaProjectReconciler';
import { rollupParentTaskDatesAndStatus } from './taskRollupService';

/**
 * Applies a list of (already de-duplicated) deltas to Zustand + Dexie. Shared by the real-time listener and the
 * safety poll. Returns the number of deltas processed.
 * Pre-indexes projects in O(P) and detects authoritative project summaries to avoid redundant per-task rollups.
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

  let projectsIndex = buildDeltaProjectsIndex(updatedProjects);

  // Pre-collect projects that have an authoritative taskSummaries payload in this delta batch
  const authoritativeSummaryProjectIds = new Set<string>();
  const batchTaskProjectIds = new Set<string>();
  deltas.forEach((d) => {
    if (d.sessionId && d.sessionId === CLIENT_SESSION_ID) return;
    if (d.action === 'batch_update' && Array.isArray(d.batchItems)) {
      d.batchItems.forEach((item) => {
        if (
          item.collectionName === 'taka_projects' &&
          item.action !== 'delete' &&
          !item.data?.isDeleted &&
          Array.isArray(item.data?.taskSummaries) &&
          item.docId
        ) {
          authoritativeSummaryProjectIds.add(String(item.docId).trim());
        } else if (item.collectionName === 'taka_tasks' && item.action !== 'delete') {
          const pid = (item as any).projectId || item.data?.projectId || d.projectId;
          if (pid) batchTaskProjectIds.add(String(pid).trim());
        }
      });
    } else if (
      d.collectionName === 'taka_projects' &&
      d.action !== 'delete' &&
      !d.data?.isDeleted &&
      Array.isArray(d.data?.taskSummaries) &&
      d.docId
    ) {
      authoritativeSummaryProjectIds.add(String(d.docId).trim());
    }
  });

  // O(T) pre-index of projects that currently have real tasks loaded in memory
  const inMemoryProjectIds = new Set<string>();
  const inMemoryProjectCompositeKeys = new Set<string>();
  for (let i = 0; i < updatedTasks.length; i++) {
    const t = updatedTasks[i];
    if (!t || t.isDeleted) continue;
    if (t.projectId) {
      inMemoryProjectIds.add(String(t.projectId).trim());
    } else if (t.projectCode) {
      const c = String(t.projectCode).trim().toLowerCase();
      const s = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
      const y = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
      inMemoryProjectCompositeKeys.add(`${c}|${s}|${y}`);
    }
  }

  const expandedSet = new Set(
    [...(store.expandedProjectIds || []), ...(store.searchActiveProjectIds || [])].map(String)
  );

  let projectsChanged = false;
  let tasksChanged = false;
  let costsChanged = false;
  let delegationsChanged = false;

  const invalidations: TakaDeltaItem[] = [];

  const touchedProjectIds = new Set<string>();
  const touchedProjectCodes = new Set<string>();
  const noteTouchedProject = (t: any) => {
    if (!t) return;
    if (t.projectId) {
      const pid = String(t.projectId).trim();
      if (!authoritativeSummaryProjectIds.has(pid)) {
        touchedProjectIds.add(pid);
      }
    } else if (t.projectCode) {
      const codeKey = String(t.projectCode).trim().toLowerCase();
      const storeKey = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '*';
      const yearKey =
        t.projectYear !== undefined && t.projectYear !== null
          ? String(t.projectYear).trim()
          : '*';
      touchedProjectCodes.add(`${codeKey}|${storeKey}|${yearKey}`);
    }
  };

  const directlyAppliedDocIds = new Set<string>();

  const applyItem = (
    docId: string,
    collectionNameRaw: string,
    action: 'create' | 'update' | 'delete',
    data: any,
    meta?: { year?: string; projectId?: string; projectCode?: string; projectStore?: string; isPatch?: boolean }
  ) => {
    if (docId) directlyAppliedDocIds.add(docId);
    const collectionName =
      collectionNameRaw === 'taka_delegation_groups' ? 'taka_delegations' : collectionNameRaw;

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
          const purged = purgeProjectAndTasksOnDeleteDelta(docId, data, updatedProjects, updatedTasks);
          if (purged.projectsChanged) {
            projectsChanged = true;
            updatedProjects = purged.nextProjects;
            projectsIndex = buildDeltaProjectsIndex(updatedProjects);
          }
          if (purged.tasksChanged) {
            tasksChanged = true;
            updatedTasks = purged.nextTasks;
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
        } else if (action === 'create' || (action === 'update' && data?.code && data?.name)) {
          nextProj = { id: docId, ...data } as Project;
          updatedProjects.push(nextProj);
          projectsIndex = buildDeltaProjectsIndex(updatedProjects);
        } else if (action === 'update') {
          directlyAppliedDocIds.delete(docId);
          invalidations.push({
            docId,
            collectionName: 'taka_projects',
            action: 'update',
            data: {},
            isPatch: true,
            invalidate: true,
            year: meta?.year,
          });
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
        const enrichedData = {
          ...(meta?.projectId ? { projectId: meta.projectId } : {}),
          ...(meta?.projectCode ? { projectCode: meta.projectCode } : {}),
          ...(meta?.projectStore ? { projectStore: meta.projectStore } : {}),
          ...(meta?.year ? { projectYear: meta.year } : {}),
          ...(data || {}),
        };
        if (isDelete || data?.isDeleted) {
          noteTouchedProject(existingTask);
          noteTouchedProject(enrichedData);
          const pIdHint = enrichedData?.projectId || existingTask?.projectId;
          const delProjCodeLower = String(enrichedData?.projectCode || existingTask?.projectCode || '')
            .trim()
            .toLowerCase();
          const delProjStoreLower = String(enrichedData?.projectStore || existingTask?.projectStore || '')
            .trim()
            .toLowerCase();
          const delProjYearStr = String(enrichedData?.projectYear ?? existingTask?.projectYear ?? '').trim();

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

          const unlinkedRes = unlinkChildTasksOnTaskDeleteDelta(docIdLower, delCodeLower, pIdHint, updatedTasks);
          if (unlinkedRes.tasksChanged) {
            tasksChanged = true;
            updatedTasks = unlinkedRes.nextTasks;
          }

          const summaryRes = removeDeletedTaskSummaryFromProjects({
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
          });
          if (summaryRes.projectsChanged) {
            projectsChanged = true;
            updatedProjects = summaryRes.nextProjects;
          }
          break;
        }
        if (idx !== -1 && isStaleVsLocal(updatedTasks[idx])) return;

        const mergedTask = (
          idx !== -1 ? applyFieldPatch(updatedTasks[idx], enrichedData) : { id: docId, ...enrichedData }
        ) as Task;

        const tProjId = mergedTask.projectId ? String(mergedTask.projectId).trim() : '';
        const hasAuthoritativeProjectDelta = Boolean(
          tProjId && authoritativeSummaryProjectIds.has(tProjId)
        );

        // Only run per-task summary upsert & recalculation if the batch did NOT already carry the authoritative project summary
        if (!hasAuthoritativeProjectDelta) {
          noteTouchedProject(existingTask);
          noteTouchedProject(enrichedData);
          if (
            upsertTaskSummaryIntoMatchingProjects({
              docId,
              action,
              mergedTask,
              updatedProjects,
              projectsIndex,
              touchedProjectIds,
            })
          ) {
            projectsChanged = true;
          }
        }

        if (idx !== -1) {
          tasksChanged = true;
          updatedTasks[idx] = mergedTask;
        } else if (
          action === 'create' ||
          (action === 'update' &&
            !meta?.isPatch &&
            Boolean(enrichedData?.name && (enrichedData?.projectCode || enrichedData?.projectId)))
        ) {
          if (store.isTasksRequested || updatedTasks.length > 0) {
            const tCode = mergedTask.projectCode ? String(mergedTask.projectCode).trim() : '';
            const tStoreLower = mergedTask.projectStore
              ? String(mergedTask.projectStore).trim().toLowerCase()
              : '';
            const tYearStr =
              mergedTask.projectYear !== undefined && mergedTask.projectYear !== null
                ? String(mergedTask.projectYear).trim()
                : '';

            const activeYearFilter = store.globalYearFilter
              ? String(store.globalYearFilter).trim()
              : '';
            const matchesActiveYear =
              !activeYearFilter ||
              activeYearFilter.toLowerCase() === 'all' ||
              !tYearStr ||
              tYearStr === activeYearFilter;

            const projInMemory = tProjId
              ? inMemoryProjectIds.has(tProjId)
              : Boolean(
                  tCode &&
                    inMemoryProjectCompositeKeys.has(
                      `${tCode.toLowerCase()}|${tStoreLower}|${tYearStr}`
                    )
                );

            let matchingIdx = tProjId ? projectsIndex.byId.get(tProjId) : undefined;
            if (matchingIdx === undefined && !tProjId && tCode) {
              const candidates = projectsIndex.byCodePart.get(tCode.toLowerCase()) || [];
              matchingIdx = candidates.find((cIdx) => {
                const cp = updatedProjects[cIdx];
                if (!cp) return false;
                if (tStoreLower && cp.store && String(cp.store).trim().toLowerCase() !== tStoreLower) return false;
                if (tYearStr && cp.year !== undefined && String(cp.year).trim() !== tYearStr) return false;
                return true;
              });
            }

            const matchingProj =
              matchingIdx !== undefined ? updatedProjects[matchingIdx] : undefined;
            const isExplicitlyExpanded =
              projInMemory ||
              (tProjId && expandedSet.has(tProjId)) ||
              (matchingProj?.id && expandedSet.has(String(matchingProj.id))) ||
              (!tProjId && tCode && expandedSet.has(tCode));

            // When an authoritative project summary already covers collapsed views, only hydrate into active
            // React memory if the project is expanded/in-memory; otherwise Dexie stores it silently in background
            const isProjExpandedOrEmpty =
              isExplicitlyExpanded ||
              (!hasAuthoritativeProjectDelta &&
                store.isTasksRequested &&
                (matchesActiveYear || !matchingProj || (matchingProj.taskSummaries?.length || 0) <= 1));

            if (isProjExpandedOrEmpty) {
              tasksChanged = true;
              updatedTasks.push(mergedTask);
              if (tProjId) inMemoryProjectIds.add(tProjId);
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
        if (!store.isDelegationsRequested && updatedDelegations.length === 0) return;
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
    const srvMs = serverDeltaTime(delta);
    if (srvMs > maxTime) {
      maxTime = srvMs;
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
          applyItem(item.docId, item.collectionName, item.action, item.data, {
            year: item.year || delta.year,
            projectId: (item as any).projectId || delta.projectId,
            projectCode: (item as any).projectCode || delta.projectCode,
            projectStore: (item as any).projectStore || delta.projectStore,
            isPatch: item.isPatch,
          });
        } catch (err) {
          console.warn('[deltaSync] applyItem failed (batch item skipped):', item.docId, err);
        }
      });
    } else if (delta.docId && delta.collectionName) {
      try {
        applyItem(delta.docId, delta.collectionName, delta.action as any, delta.data, {
          year: delta.year,
          projectId: delta.projectId,
          projectCode: delta.projectCode,
          projectStore: delta.projectStore,
          isPatch: delta.isPatch,
        });
      } catch (err) {
        console.warn('[deltaSync] applyItem failed (delta skipped):', delta.docId, err);
      }
    }
  });

  // Mark projects that received both tasks and authoritative summaries as locally hydrated
  authoritativeSummaryProjectIds.forEach((pid) => {
    if (batchTaskProjectIds.has(pid)) {
      markLoaded('tasks_proj', pid).catch(() => {});
      markProjectTasksHydrated(pid);
    }
  });

  if (tasksChanged && updatedTasks.length > 0) {
    updatedTasks = rollupParentTaskDatesAndStatus(updatedTasks, updatedDelegations);
  }

  let touchedProjectsToPersist: Project[] = [];
  if (
    (tasksChanged || projectsChanged) &&
    (touchedProjectIds.size > 0 || touchedProjectCodes.size > 0)
  ) {
    const recalculated = recalculateTouchedProjectsAfterDeltas({
      updatedProjects,
      updatedTasks,
      delegationGroups: updatedDelegations,
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
          flashEntries.push({ docId: item.docId, collectionName: item.collectionName, updatedBy: d.updatedBy });
        }
      });
    } else if ((d.action === 'create' || d.action === 'update') && d.docId && d.collectionName) {
      flashEntries.push({ docId: d.docId, collectionName: d.collectionName, updatedBy: d.updatedBy });
    }
  });
  if (flashEntries.length > 0) triggerBatchChangeFlash(flashEntries);

  applyDeltasToLocalDatabase(deltas).catch(() => {});
  broadcastAppliedDeltas(deltas);
  if (maxTime > lastSyncTime) {
    safeSetItemLocal(LAST_SYNC_KEY, String(maxTime));
  }

  const pendingInvalidations = invalidations.filter(
    (item) => !directlyAppliedDocIds.has(item.docId)
  );

  if (pendingInvalidations.length > 0) {
    resolveInvalidations(pendingInvalidations)
      .then((synthetic) => {
        if (synthetic.length > 0) applyIncomingDeltas(synthetic);
      })
      .catch((err) => console.warn('[deltaSync] invalidate resolve failed:', err));
  }

  return deltas.length;
}
