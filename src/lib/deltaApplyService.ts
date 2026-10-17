import { useAppStore } from '../store/useAppStore';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { TakaDelta, TakaDeltaItem, Project, Task, Cost, DelegationGroup } from '../types';
import { localDb } from './localDb';
import { applyDeltasToLocalDatabase } from './backgroundSyncWorker';
import { triggerBatchChangeFlash } from './changeFlashService';
import { broadcastAppliedDeltas } from './broadcastSyncService';
import { applyFieldPatch } from './deltaPatchService';
import { getTasksForProject, calculateProjectComputedDates } from './projectDatesService';
import { resolveInvalidations } from './deltaInvalidateService';
import { 
  deltaTime, 
  getLastDeltaSyncTime, 
  getRestoreCutoffTimestamp, 
  markRestoreVersionCompleted
} from './deltaSyncService';
import { CLIENT_SESSION_ID, DELTA_COLLECTION, LAST_SYNC_KEY } from './deltaConstants';
import { safeSetItemLocal } from './storage';
import { markTasksDeleted } from './taskDeletedTracker';

/**
 * Applies a list of (already de-duplicated) deltas to Zustand + Dexie. Shared by the real-time listener and the
 * safety poll. Returns the number of deltas processed.
 */
export function applyIncomingDeltas(deltas: TakaDelta[]): number {
  if (!deltas || deltas.length === 0) return 0;

  // Ghi nhận vào Performance Store để giám sát
  usePerformanceStore
    .getState()
    .trackGetDoc(DELTA_COLLECTION, false, deltas.length, `Pulled ${deltas.length} deltas`);

  const lastSyncTime = getLastDeltaSyncTime();
  let maxTime = lastSyncTime;
  const store = useAppStore.getState();

  // Map chứa các thay đổi gộp để cập nhật nguyên tử vào Zustand
  let updatedProjects = [...(store.projects || [])];
  let updatedTasks = [...(store.tasks || [])];
  let updatedCosts = [...(store.costs || [])];
  let updatedDelegations = [...(store.delegationGroups || [])];

  let projectsChanged = false;
  let tasksChanged = false;
  let costsChanged = false;
  let delegationsChanged = false;

  const invalidations: TakaDeltaItem[] = [];

  // Các dự án có task thay đổi trong lô delta này (để chỉ tính lại đúng các dự án đó)
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
    year?: string
  ) => {
    // Một số nơi ghi delta với tên đường dẫn thật `taka_delegation_groups`
    const collectionName =
      collectionNameRaw === 'taka_delegation_groups' ? 'taka_delegations' : collectionNameRaw;
    if (
      collectionName === 'taka_delegations' &&
      !store.isDelegationsRequested &&
      store.delegationGroups.length === 0
    ) {
      return;
    }

    // [Safety Guard] Prevent old deltas (e.g. synthetic or out-of-order) from clobbering newer state
    const tsOf = (v: any): number => {
      if (!v) return 0;
      const n = typeof v === 'string' ? Date.parse(v) : typeof v?.toMillis === 'function' ? v.toMillis() : Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const isDelete = action === 'delete' || data?.isDeleted === true;

    // Chỉ bỏ qua khi delta CÓ updatedAt hợp lệ và CŨ HƠN bản đang giữ.
    // Delta xóa, delta không có data, và delta vá không mang updatedAt luôn được áp dụng
    // (thứ tự đã do serverTime quyết định). Tuyệt đối không đọc data.updatedAt khi data có thể null.
    const isStaleVsLocal = (existing: any): boolean => {
      if (isDelete || !data) return false;
      const incoming = tsOf(data.updatedAt);
      if (!incoming) return false;
      return tsOf(existing?.updatedAt) > incoming;
    };

    switch (collectionName) {
      case 'taka_projects': {
        const idx = updatedProjects.findIndex((p) => p.id === docId);
        if (isDelete || data?.isDeleted) {
          if (idx !== -1) {
            projectsChanged = true;
            updatedProjects = updatedProjects.filter((p) => p.id !== docId);
          }
          break;
        }
        if (idx !== -1 && isStaleVsLocal(updatedProjects[idx])) return;
        
        projectsChanged = true;
        if (idx !== -1) {
          const prevProj = updatedProjects[idx];
          // If incoming project update has pruned taskSummaries, also remove those deleted task IDs from updatedTasks
          if (Array.isArray(data?.taskSummaries) && Array.isArray(prevProj.taskSummaries)) {
            const incomingSummaryIds = new Set(
              data.taskSummaries
                .map((s: any) => (s?.id ? String(s.id).trim().toLowerCase() : ''))
                .filter(Boolean)
            );
            const removedIdsLower = new Set<string>();
            prevProj.taskSummaries.forEach((oldS: any) => {
              const oldId = oldS?.id ? String(oldS.id).trim() : '';
              if (oldId && !incomingSummaryIds.has(oldId.toLowerCase())) {
                markTasksDeleted([oldId], docId);
                removedIdsLower.add(oldId.toLowerCase());
                localDb.tasks.delete(oldId).catch(() => {});
              }
            });
            if (removedIdsLower.size > 0) {
              const beforeLen = updatedTasks.length;
              updatedTasks = updatedTasks.filter((t) => !t?.id || !removedIdsLower.has(String(t.id).trim().toLowerCase()));
              if (updatedTasks.length !== beforeLen) {
                tasksChanged = true;
              }
            }
          }
          updatedProjects[idx] = applyFieldPatch(prevProj, data) as Project;
        } else if (action === 'create') {
          // Ghost record guard: only add if action is 'create', never resurrect from an 'update' patch
          updatedProjects.push({ id: docId, ...data } as Project);
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
          const delNameLower = String(data?.name || existingTask?.name || '').trim().toLowerCase();
          const delCodeLower = String(data?.taskCodePhu || existingTask?.taskCodePhu || '').trim().toLowerCase();

          // Cắt đứt ngay lập tức task đã xóa khỏi project.taskSummaries trên máy nhận (chống hiện tượng bóng ma hồi sinh task trên iPad)
          updatedProjects = updatedProjects.map((p) => {
            if (Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
              const filteredSummaries = p.taskSummaries.filter((s: any) => {
                const sId = s?.id ? String(s.id).trim().toLowerCase() : '';
                if (sId && sId === docIdLower) return false;
                if (!sId && delNameLower && String(s?.name || '').trim().toLowerCase() === delNameLower) {
                  const sCode = s?.taskCodePhu ? String(s.taskCodePhu).trim().toLowerCase() : '';
                  if (!delCodeLower || !sCode || sCode === delCodeLower) return false;
                }
                return true;
              });
              if (filteredSummaries.length !== p.taskSummaries.length) {
                projectsChanged = true;
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

        const mergedTask = (idx !== -1 ? applyFieldPatch(updatedTasks[idx], data) : { id: docId, ...data }) as Task;

        // Upsert task summary in matching project if project already has taskSummaries (keeps collapsed/General view 100% synced)
        if (mergedTask.start && mergedTask.finish && mergedTask.name) {
          const docIdLower = String(docId).trim().toLowerCase();
          const tProjId = mergedTask.projectId ? String(mergedTask.projectId) : '';
          const tCodeLower = mergedTask.projectCode ? String(mergedTask.projectCode).trim().toLowerCase() : '';
          const tStoreLower = mergedTask.projectStore ? String(mergedTask.projectStore).trim().toLowerCase() : '';
          const tYearStr = mergedTask.projectYear !== undefined && mergedTask.projectYear !== null ? String(mergedTask.projectYear).trim() : '';

          updatedProjects = updatedProjects.map((p) => {
            const matchesProj =
              (tProjId && String(p.id) === tProjId) ||
              (!tProjId &&
                tCodeLower &&
                String(p.code || '').trim().toLowerCase() === tCodeLower &&
                (!tStoreLower || !p.store || String(p.store).trim().toLowerCase() === tStoreLower) &&
                (!tYearStr || !p.year || String(p.year).trim() === tYearStr));
            if (!matchesProj) return p;

            const currentSummaries = Array.isArray(p.taskSummaries) ? [...p.taskSummaries] : [];
            const sIdx = currentSummaries.findIndex((s: any) => String(s?.id || '').trim().toLowerCase() === docIdLower);
            const summaryItem = {
              ...(sIdx !== -1 ? currentSummaries[sIdx] : {}),
              id: docId,
              name: mergedTask.name,
              start: mergedTask.start,
              finish: mergedTask.finish,
              orderIndex: mergedTask.orderIndex ?? (sIdx !== -1 ? currentSummaries[sIdx].orderIndex : currentSummaries.length),
              ...(mergedTask.baselineStart ? { baselineStart: mergedTask.baselineStart } : {}),
              ...(mergedTask.baselineFinish ? { baselineFinish: mergedTask.baselineFinish } : {}),
              ...(mergedTask.approval ? { approval: mergedTask.approval } : {}),
              ...(mergedTask.party ? { party: mergedTask.party } : {}),
              ...(mergedTask.taskCodePhu ? { taskCodePhu: mergedTask.taskCodePhu } : {}),
              ...(mergedTask.parentTaskId ? { parentTaskId: mergedTask.parentTaskId } : {}),
              ...(mergedTask.duration !== undefined ? { duration: mergedTask.duration } : {}),
              ...(mergedTask.runningStatus ? { runningStatus: mergedTask.runningStatus } : {}),
              ...(mergedTask.delegation !== undefined ? { delegation: mergedTask.delegation } : {}),
            };
            if (sIdx !== -1) {
              currentSummaries[sIdx] = summaryItem;
              projectsChanged = true;
              return { ...p, taskSummaries: currentSummaries, taskCount: currentSummaries.length };
            } else if (action === 'create') {
              currentSummaries.push(summaryItem);
              projectsChanged = true;
              return { ...p, taskSummaries: currentSummaries, taskCount: currentSummaries.length };
            }
            return p;
          });
        }

        if (idx !== -1) {
          tasksChanged = true;
          updatedTasks[idx] = mergedTask;
        } else if (action === 'create') {
          // Tri-Gate & Partial-Hydration Guard (Rule 14):
          // Only push new task into in-memory Zustand if Tasks slice is requested AND the project is hydrated/expanded
          // (Dexie still receives 100% of deltas via applyDeltasToLocalDatabase below)
          if (store.isTasksRequested || updatedTasks.length > 0) {
            const expandedSet = new Set([...(store.expandedProjectIds || []), ...(store.searchActiveProjectIds || [])].map(String));
            const tProjId = mergedTask.projectId ? String(mergedTask.projectId) : '';
            const tCode = mergedTask.projectCode ? String(mergedTask.projectCode) : '';
            const projInMemory = updatedTasks.some(
              (t) =>
                (tProjId && String(t.projectId) === tProjId) ||
                (tCode && String(t.projectCode || '').toLowerCase() === tCode.toLowerCase())
            );
            const matchingProj = updatedProjects.find(
              (p) => (tProjId && String(p.id) === tProjId) || (tCode && String(p.code || '').toLowerCase() === tCode.toLowerCase())
            );
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
        // Tri-Gate Guard (Rule 14): Do not populate in-memory costs if Cost slice has not been requested yet
        if (!store.isCostsRequested && updatedCosts.length === 0) return;
        if (idx !== -1 && isStaleVsLocal(updatedCosts[idx])) return;

        costsChanged = true;
        if (idx !== -1) {
          updatedCosts[idx] = applyFieldPatch(updatedCosts[idx], data) as Cost;
        } else if (action === 'create') {
          // Ghost record guard: only add if action is 'create', never resurrect from an 'update' patch
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
          updatedDelegations[idx] = applyFieldPatch(updatedDelegations[idx], data) as DelegationGroup;
        } else if (action === 'create') {
          // Ghost record guard: only add if action is 'create', never resurrect from an 'update' patch
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

    // 1. Skip self-mutations on this same tab/session to prevent typing jitter (Rule 2)
    if (
      delta.sessionId &&
      delta.sessionId === CLIENT_SESSION_ID
    ) {
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

  // Cập nhật nguyên tử 1 lần duy nhất vào Zustand (0ms UI re-render)
  const touchedProjectsToPersist: Project[] = [];
  if ((tasksChanged || projectsChanged) && (touchedProjectIds.size > 0 || touchedProjectCodes.size > 0)) {
    const delegationGroups = store.delegationGroups || [];
    updatedProjects = updatedProjects.map(p => {
      // Dự án khớp theo id, hoặc theo mã chính / mã liên kết (linkCodes)
      const codeParts = `${p.code || ''},${(p as any).linkCodes || ''}`
        .toLowerCase()
        .split(/[,;/]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const isTouched =
        touchedProjectIds.has(String(p.id)) || codeParts.some((c) => touchedProjectCodes.has(c));
      
      if (!isTouched) return p;

      const pTasks = getTasksForProject(p, updatedTasks);
      const existingSummaries = Array.isArray(p.taskSummaries) ? p.taskSummaries : [];

      // If tasks for this project are not hydrated in RAM (e.g. General tab or collapsed project),
      // compute project dates from p.taskSummaries instead of wiping taskSummaries with an empty pTasks array!
      const useInMemoryTasks = pTasks.length > 0 && pTasks.length >= existingSummaries.length;
      const sourceTasksForCalc: Task[] = useInMemoryTasks
        ? pTasks
        : existingSummaries.map((s: any, idx: number) => ({
            id: s.id || `ts_${p.id}_${idx}`,
            projectId: p.id,
            projectCode: p.code,
            projectStore: p.store,
            projectYear: p.year,
            name: s.name,
            start: s.start,
            finish: s.finish,
            orderIndex: s.orderIndex ?? idx,
            baselineStart: s.baselineStart || s.start,
            baselineFinish: s.baselineFinish || s.finish,
            approval: s.approval,
            party: s.party,
            taskCodePhu: s.taskCodePhu,
            parentTaskId: s.parentTaskId,
            duration: s.duration ?? 0,
            runningStatus: s.runningStatus,
            delegation: s.delegation,
          } as Task));

      const computedDates = calculateProjectComputedDates(p, sourceTasksForCalc, delegationGroups);
      const nextProj: Project = {
        ...p,
        ...computedDates,
        taskCount: useInMemoryTasks
          ? (computedDates.taskCount !== undefined ? computedDates.taskCount : pTasks.length)
          : existingSummaries.length,
        taskSummaries: useInMemoryTasks
          ? (computedDates.taskSummaries || [])
          : existingSummaries,
      };
      touchedProjectsToPersist.push(nextProj);
      return nextProj;
    });
    projectsChanged = true;
  }

  if (projectsChanged) store.setProjects(updatedProjects);
  if (tasksChanged) store.setTasks(updatedTasks);
  if (costsChanged) store.setCosts(updatedCosts);
  if (delegationsChanged) store.setDelegationGroups(updatedDelegations);

  if (touchedProjectsToPersist.length > 0) {
    localDb.projects.bulkPut(touchedProjectsToPersist).catch(() => {});
  }

  // Trụ cột 3: Kích hoạt Smart Change Flash cho các dòng vừa nhận thay đổi từ đồng nghiệp (Google Sheets standard)
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
  if (flashEntries.length > 0) {
    triggerBatchChangeFlash(flashEntries);
  }

  // Lưu các delta vào Dexie Local-First Database ngầm
  applyDeltasToLocalDatabase(deltas).catch(() => {});

  // Phát tín hiệu delta đã nạp sang các tab khác (giúp các tab phụ không cần gửi request lên Firestore)
  broadcastAppliedDeltas(deltas);

  // Cập nhật mốc đồng bộ mới nhất
  safeSetItemLocal(LAST_SYNC_KEY, String(maxTime));

  // Resolve signal-only (invalidate) items: re-read just those docs, then apply them like normal deltas
  if (invalidations.length > 0) {
    resolveInvalidations(invalidations)
      .then((synthetic) => {
        if (synthetic.length > 0) applyIncomingDeltas(synthetic);
      })
      .catch((err) => console.warn('[deltaSync] invalidate resolve failed:', err));
  }

  return deltas.length;
}
