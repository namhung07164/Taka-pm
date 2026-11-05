import { useAppStore } from '../store/useAppStore';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { TakaDelta, TakaDeltaItem, Project, Task, Cost, DelegationGroup } from '../types';
import { localDb } from './localDb';
import { applyDeltasToLocalDatabase } from './backgroundSyncWorker';
import { triggerBatchChangeFlash } from './changeFlashService';
import { broadcastAppliedDeltas } from './broadcastSyncService';
import { applyFieldPatch } from './deltaPatchService';
import { resolveInvalidations } from './deltaInvalidateService';
import { deltaTime, serverDeltaTime, getLastDeltaSyncTime, getRestoreCutoffTimestamp, markRestoreVersionCompleted } from './deltaSyncService';
import { CLIENT_SESSION_ID, DELTA_COLLECTION, LAST_SYNC_KEY } from './deltaConstants';
import { safeSetItemLocal } from './storage';
import { markTasksDeleted } from './taskDeletedTracker';
import { markLoaded } from './loadedMarkers';
import { isProjectTasksHydrated, markProjectTasksHydrated } from './utils';
import { tsOf, buildIdIndexMap, buildDeltaProjectsIndex, extractDeltaBatchPreIndex, purgeProjectAndTasksOnDeleteDelta, unlinkChildTasksOnTaskDeleteDelta, removeDeletedTaskSummaryFromProjects, reconcileTasksAgainstIncomingProjectSummaries, upsertTaskSummaryIntoMatchingProjects, recalculateTouchedProjectsAfterDeltas, runBackgroundDexieProjectTaskReconciliation } from './deltaApplyParts/deltaProjectReconciler';
import { rollupParentTaskDatesAndStatus } from './taskRollupService';

export function applyIncomingDeltas(deltas: TakaDelta[]): number {
  if (!deltas || deltas.length === 0) return 0;
  usePerformanceStore.getState().trackGetDoc(DELTA_COLLECTION, false, deltas.length, `Pulled ${deltas.length} deltas`);

  const lastSyncTime = getLastDeltaSyncTime();
  let maxTime = lastSyncTime;
  const store = useAppStore.getState();

  let updatedProjects = [...(store.projects || [])];
  let updatedTasks = [...(store.tasks || [])];
  let updatedCosts = [...(store.costs || [])];
  let updatedDelegations = [...(store.delegationGroups || [])];
  let projectsIndex = buildDeltaProjectsIndex(updatedProjects);
  let tasksByIdIndex = buildIdIndexMap(updatedTasks);
  let costsByIdIndex = buildIdIndexMap(updatedCosts);
  let delegationsByIdIndex = buildIdIndexMap(updatedDelegations);

  const {
    authoritativeSummaryProjectIds,
    batchTaskCountsByProj,
    inMemoryProjectIds,
    inMemoryProjectCompositeKeys,
  } = extractDeltaBatchPreIndex(deltas, updatedTasks, CLIENT_SESSION_ID);

  const expandedSet = new Set([...(store.expandedProjectIds || []), ...(store.searchActiveProjectIds || [])].map(String));
  let projectsChanged = false, tasksChanged = false, costsChanged = false, delegationsChanged = false;

  const invalidations: TakaDeltaItem[] = [];
  const touchedProjectIds = new Set<string>();
  const touchedProjectCodes = new Set<string>();
  const noteTouchedProject = (t: any) => {
    if (!t) return;
    if (t.projectId) {
      const pid = String(t.projectId).trim();
      if (!authoritativeSummaryProjectIds.has(pid)) touchedProjectIds.add(pid);
    } else if (t.projectCode) {
      const codeKey = String(t.projectCode).trim().toLowerCase();
      const storeKey = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '*';
      const yearKey = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '*';
      touchedProjectCodes.add(`${codeKey}|${storeKey}|${yearKey}`);
    }
  };

  const directlyAppliedDocIds = new Set<string>();
  const reconciledProjectsForDexie: Project[] = [];

  const applyItem = (
    docId: string,
    collectionNameRaw: string,
    action: 'create' | 'update' | 'delete',
    data: any,
    meta?: {
      year?: string;
      projectId?: string;
      projectCode?: string;
      projectStore?: string;
      isPatch?: boolean;
      skipSummaryRollup?: boolean;
      serverMs?: number;
    }
  ) => {
    if (docId) directlyAppliedDocIds.add(docId);
    const collectionName =
      collectionNameRaw === 'taka_delegation_groups' ? 'taka_delegations' : collectionNameRaw;
    const isDelete = action === 'delete' || data?.isDeleted === true;

    const isStaleVsLocal = (existing: any): boolean => {
      if (isDelete || !data || Array.isArray(data.taskSummaries)) return false;
      const incoming = Math.max(tsOf(data.updatedAt), meta?.serverMs || 0);
      return Boolean(incoming && tsOf(existing?.updatedAt) > incoming + 60000);
    };

    switch (collectionName) {
      case 'taka_projects': {
        const idx = projectsIndex.byId.get(String(docId)) ?? -1;
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
            tasksByIdIndex = buildIdIndexMap(updatedTasks);
          }
          break;
        }
        if (idx !== -1 && isStaleVsLocal(updatedProjects[idx])) return;

        projectsChanged = true;
        let nextProj: Project | null = null;
        if (idx !== -1) {
          nextProj = applyFieldPatch(updatedProjects[idx], data) as Project;
          if (Array.isArray(data?.taskSummaries)) nextProj.taskCount = data.taskSummaries.length;
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
          reconciledProjectsForDexie.push(nextProj);
          const reconciled = reconcileTasksAgainstIncomingProjectSummaries(nextProj, data.taskSummaries, updatedTasks);
          if (reconciled.tasksChanged) {
            updatedTasks = reconciled.nextTasks;
            tasksByIdIndex = buildIdIndexMap(updatedTasks);
            tasksChanged = true;
          }
        }
        break;
      }

      case 'taka_tasks': {
        const idx = tasksByIdIndex.get(String(docId)) ?? -1;
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
          const delProjCodeLower = String(enrichedData?.projectCode || existingTask?.projectCode || '').trim().toLowerCase();
          const delProjStoreLower = String(enrichedData?.projectStore || existingTask?.projectStore || '').trim().toLowerCase();
          const delProjYearStr = String(enrichedData?.projectYear ?? existingTask?.projectYear ?? '').trim();

          markTasksDeleted([docId], pIdHint ? String(pIdHint) : undefined);
          localDb.tasks.delete(docId).catch(() => {});
          if (idx !== -1) {
            tasksChanged = true;
            updatedTasks = updatedTasks.filter((t) => t.id !== docId);
            tasksByIdIndex = buildIdIndexMap(updatedTasks);
          }
          const docIdLower = String(docId).trim().toLowerCase();
          const delNameLower = String(data?.name || existingTask?.name || '').trim().toLowerCase();
          const delCodeLower = String(data?.taskCodePhu || existingTask?.taskCodePhu || '').trim().toLowerCase();

          const unlinkedRes = unlinkChildTasksOnTaskDeleteDelta(docIdLower, delCodeLower, pIdHint, updatedTasks);
          if (unlinkedRes.tasksChanged) {
            tasksChanged = true;
            updatedTasks = unlinkedRes.nextTasks;
            tasksByIdIndex = buildIdIndexMap(updatedTasks);
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
        const hasAuthoritativeProjectDelta = Boolean(tProjId && authoritativeSummaryProjectIds.has(tProjId));

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
            const tStoreLower = mergedTask.projectStore ? String(mergedTask.projectStore).trim().toLowerCase() : '';
            const tYearStr =
              mergedTask.projectYear !== undefined && mergedTask.projectYear !== null
                ? String(mergedTask.projectYear).trim()
                : '';
            const activeYearFilter = store.globalYearFilter ? String(store.globalYearFilter).trim() : '';
            const matchesActiveYear =
              !activeYearFilter || activeYearFilter.toLowerCase() === 'all' || !tYearStr || tYearStr === activeYearFilter;
            const projInMemory = tProjId
              ? inMemoryProjectIds.has(tProjId)
              : Boolean(tCode && inMemoryProjectCompositeKeys.has(`${tCode.toLowerCase()}|${tStoreLower}|${tYearStr}`));

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
            const matchingProj = matchingIdx !== undefined ? updatedProjects[matchingIdx] : undefined;
            const isExplicitlyExpanded =
              projInMemory ||
              Boolean(tProjId && (expandedSet.has(tProjId) || isProjectTasksHydrated(tProjId))) ||
              Boolean(matchingProj?.id && (expandedSet.has(String(matchingProj.id)) || isProjectTasksHydrated(String(matchingProj.id)))) ||
              (!tProjId && tCode && expandedSet.has(tCode));
            const isProjExpandedOrEmpty =
              isExplicitlyExpanded ||
              (store.isTasksRequested &&
                (matchesActiveYear || !matchingProj || (matchingProj.taskSummaries?.length || 0) <= 1));

            if (isProjExpandedOrEmpty) {
              tasksChanged = true;
              tasksByIdIndex.set(String(docId), updatedTasks.length);
              updatedTasks.push(mergedTask);
              if (tProjId) inMemoryProjectIds.add(tProjId);
            }
          }
        } else if (action === 'update' && store.isTasksRequested && (!tProjId || inMemoryProjectIds.has(tProjId) || expandedSet.has(tProjId))) {
          directlyAppliedDocIds.delete(docId);
          invalidations.push({ docId, collectionName: 'taka_tasks', action: 'update', data: {}, isPatch: true, invalidate: true, year: meta?.year });
        }
        break;
      }

      case 'taka_costs': {
        const idx = costsByIdIndex.get(String(docId)) ?? -1;
        if (isDelete || data?.isDeleted) {
          localDb.costs.delete(docId).catch(() => {});
          if (idx !== -1) {
            costsChanged = true;
            updatedCosts = updatedCosts.filter((c) => c.id !== docId);
            costsByIdIndex = buildIdIndexMap(updatedCosts);
          }
          break;
        }
        if (!store.isCostsRequested && updatedCosts.length === 0) return;
        const enrichedCost = {
          ...(meta?.projectId ? { projectId: meta.projectId } : {}),
          ...(meta?.projectCode ? { projectCode: meta.projectCode } : {}),
          ...(meta?.projectStore ? { projectStore: meta.projectStore } : {}),
          ...(meta?.year ? { projectYear: Number.isFinite(Number(meta.year)) ? Number(meta.year) : meta.year } : {}),
          ...(data || {}),
        };
        if (idx !== -1 && isStaleVsLocal(updatedCosts[idx])) return;
        const isFullCost = !meta?.isPatch && Boolean((enrichedCost.projectCode || enrichedCost.projectId) && (enrichedCost.actual !== undefined || enrichedCost.description !== undefined || enrichedCost.costType !== undefined));
        if (idx !== -1) {
          costsChanged = true;
          updatedCosts[idx] = applyFieldPatch(updatedCosts[idx], enrichedCost) as Cost;
        } else if ((action === 'create' && !meta?.isPatch) || (action === 'update' && isFullCost)) {
          costsChanged = true;
          costsByIdIndex.set(String(docId), updatedCosts.length);
          updatedCosts.push({ id: docId, ...enrichedCost } as Cost);
        } else if (action === 'update') {
          directlyAppliedDocIds.delete(docId);
          invalidations.push({ docId, collectionName: 'taka_costs', action: 'update', data: {}, isPatch: true, invalidate: true, year: meta?.year });
        }
        break;
      }

      case 'taka_delegations': {
        const idx = delegationsByIdIndex.get(String(docId)) ?? -1;
        if (isDelete || data?.isDeleted) {
          localDb.delegations.delete(docId).catch(() => {});
          if (idx !== -1) {
            delegationsChanged = true;
            updatedDelegations = updatedDelegations.filter((g) => g.id !== docId);
            delegationsByIdIndex = buildIdIndexMap(updatedDelegations);
          }
          break;
        }
        if (!store.isDelegationsRequested && updatedDelegations.length === 0) return;
        const enrichedDel = {
          ...(meta?.projectId ? { projectId: meta.projectId } : {}),
          ...(meta?.projectCode ? { projectCode: meta.projectCode } : {}),
          ...(meta?.projectStore ? { projectStore: meta.projectStore } : {}),
          ...(meta?.year ? { projectYear: meta.year } : {}),
          ...(data || {}),
        };
        if (idx !== -1 && isStaleVsLocal(updatedDelegations[idx])) return;
        const isFullDel = !meta?.isPatch && Boolean(enrichedDel.name && Array.isArray(enrichedDel.subTasks));
        if (idx !== -1) {
          delegationsChanged = true;
          updatedDelegations[idx] = applyFieldPatch(updatedDelegations[idx], enrichedDel) as DelegationGroup;
        } else if ((action === 'create' && !meta?.isPatch) || (action === 'update' && isFullDel)) {
          delegationsChanged = true;
          delegationsByIdIndex.set(String(docId), updatedDelegations.length);
          updatedDelegations.push({ id: docId, ...enrichedDel } as DelegationGroup);
        } else if (action === 'update') {
          directlyAppliedDocIds.delete(docId);
          invalidations.push({ docId, collectionName: 'taka_delegations', action: 'update', data: {}, isPatch: true, invalidate: true, year: meta?.year });
        }
        break;
      }
    }
  };

  deltas.forEach((delta) => {
    const srvMs = serverDeltaTime(delta);
    if (srvMs > maxTime) maxTime = srvMs;

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

    if (delta.sessionId && delta.sessionId === CLIENT_SESSION_ID) return;

    if (delta.data?.type === 'USER_MYWORK_SYNC' || String(delta.docId || '').startsWith('sys_mywork_')) {
      import('../components/MyWorkTabParts/myWorkAccountSync').then((m) => m.applyIncomingMyWorkSyncDelta(delta.data)).catch(() => {});
      return;
    }

    if (delta.action === 'batch_update' && Array.isArray(delta.batchItems)) {
      const orderedItems = [...delta.batchItems].sort(
        (a, b) => (a.collectionName === 'taka_projects' ? 1 : 0) - (b.collectionName === 'taka_projects' ? 1 : 0)
      );
      orderedItems.forEach((item) => {
        if (item.data?.type === 'USER_MYWORK_SYNC' || String(item.docId || '').startsWith('sys_mywork_')) {
          import('../components/MyWorkTabParts/myWorkAccountSync').then((m) => m.applyIncomingMyWorkSyncDelta(item.data)).catch(() => {});
          return;
        }
        if (item.invalidate) {
          if (item.docId) directlyAppliedDocIds.delete(item.docId);
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
            skipSummaryRollup: Boolean((item as any).skipSummaryRollup),
            serverMs: srvMs,
          });
        } catch (err) {
          console.warn('[deltaSync] applyItem failed (batch item skipped):', item.docId, err);
        }
      });
    } else if (delta.docId && delta.collectionName) {
      if ((delta as any).invalidate) {
        directlyAppliedDocIds.delete(delta.docId);
        invalidations.push({
          docId: delta.docId, collectionName: delta.collectionName, action: delta.action as any,
          data: delta.data || {}, isPatch: delta.isPatch, invalidate: true, year: delta.year,
        });
        return;
      }
      try {
        applyItem(delta.docId, delta.collectionName, delta.action as any, delta.data, {
          year: delta.year, projectId: delta.projectId, projectCode: delta.projectCode, projectStore: delta.projectStore, isPatch: delta.isPatch, serverMs: srvMs,
        });
      } catch (err) {
        console.warn('[deltaSync] applyItem failed (delta skipped):', delta.docId, err);
      }
    }
  });

  authoritativeSummaryProjectIds.forEach((pid) => {
    const receivedCount = batchTaskCountsByProj.get(pid) || 0;
    const pIdx = projectsIndex.byId.get(pid);
    const expectedCount = pIdx !== undefined ? updatedProjects[pIdx]?.taskSummaries?.length || 0 : 0;
    if (receivedCount > 0 && receivedCount >= expectedCount) {
      markLoaded('tasks_proj', pid).catch(() => {});
      if (inMemoryProjectIds.has(pid)) markProjectTasksHydrated(pid);
    }
  });

  if (tasksChanged && updatedTasks.length > 0) {
    updatedTasks = rollupParentTaskDatesAndStatus(updatedTasks, updatedDelegations);
  }

  let touchedProjectsToPersist: Project[] = [];
  if ((tasksChanged || projectsChanged) && (touchedProjectIds.size > 0 || touchedProjectCodes.size > 0)) {
    const isResolvedInvalidationBatch = deltas.some((d) => d.sessionId === '__resolved__');
    const recalculated = recalculateTouchedProjectsAfterDeltas({
      updatedProjects,
      updatedTasks,
      delegationGroups: updatedDelegations,
      touchedProjectIds,
      touchedProjectCodes,
      syncRecoveredSummariesToServer: isResolvedInvalidationBatch,
    });
    updatedProjects = recalculated.nextProjects;
    touchedProjectsToPersist = recalculated.touchedProjectsToPersist;
    projectsChanged = true;
  }

  if (projectsChanged) store.setProjects(updatedProjects);
  if (tasksChanged) store.setTasks(updatedTasks);
  if (costsChanged) store.setCosts(updatedCosts);
  if (delegationsChanged) store.setDelegationGroups(updatedDelegations);
  if (touchedProjectsToPersist.length > 0) localDb.projects.bulkPut(touchedProjectsToPersist).catch(() => {});

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

  applyDeltasToLocalDatabase(deltas)
    .then(() => {
      if (reconciledProjectsForDexie.length > 0) runBackgroundDexieProjectTaskReconciliation(reconciledProjectsForDexie);
    })
    .catch(() => {});
  broadcastAppliedDeltas(deltas);
  if (maxTime > lastSyncTime) safeSetItemLocal(LAST_SYNC_KEY, String(maxTime));

  const pendingInvalidations = invalidations.filter((item) => !directlyAppliedDocIds.has(item.docId));
  if (pendingInvalidations.length > 0) {
    resolveInvalidations(pendingInvalidations)
      .then((synthetic) => {
        if (synthetic.length > 0) applyIncomingDeltas(synthetic);
      })
      .catch((err) => console.warn('[deltaSync] invalidate resolve failed:', err));
  }

  return deltas.length;
}
