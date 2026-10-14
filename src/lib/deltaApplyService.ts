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
        if (isDelete) {
          if (idx !== -1) {
            projectsChanged = true;
            updatedProjects = updatedProjects.filter((p) => p.id !== docId);
          }
          break;
        }
        if (idx !== -1 && isStaleVsLocal(updatedProjects[idx])) return;
        
        projectsChanged = true;
        if (idx !== -1) {
          updatedProjects[idx] = applyFieldPatch(updatedProjects[idx], data) as Project;
        } else if (action === 'create') {
          // Ghost record guard: only add if action is 'create', never resurrect from an 'update' patch
          updatedProjects.push({ id: docId, ...data } as Project);
        }
        break;
      }

      case 'taka_tasks': {
        const idx = updatedTasks.findIndex((t) => t.id === docId);
        if (isDelete) {
          if (idx !== -1) {
            tasksChanged = true;
            updatedTasks = updatedTasks.filter((t) => t.id !== docId);
          }
          break;
        }
        if (idx !== -1 && isStaleVsLocal(updatedTasks[idx])) return;

        tasksChanged = true;
        if (idx !== -1) {
          updatedTasks[idx] = applyFieldPatch(updatedTasks[idx], data) as Task;
        } else if (action === 'create') {
          // Ghost record guard: only add if action is 'create', never resurrect from an 'update' patch
          updatedTasks.push({ id: docId, ...data } as Task);
        }
        break;
      }

      case 'taka_costs': {
        const idx = updatedCosts.findIndex((c) => c.id === docId);
        if (isDelete) {
          if (idx !== -1) {
            costsChanged = true;
            updatedCosts = updatedCosts.filter((c) => c.id !== docId);
          }
          break;
        }
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
        if (isDelete) {
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
  if (tasksChanged && !projectsChanged) {
    const delegationGroups = store.delegationGroups || [];
    const isTasksRequested = store.isTasksRequested;
    updatedProjects = updatedProjects.map(p => {
      const pTasks = getTasksForProject(p, updatedTasks);
      if (isTasksRequested || pTasks.length > 0) {
        const computedDates = calculateProjectComputedDates(p, pTasks, delegationGroups);
        return {
          ...p,
          ...computedDates,
          taskCount: pTasks.length,
          taskSummaries: computedDates.taskSummaries || [],
        };
      }
      return p;
    });
    projectsChanged = true;
  }

  if (projectsChanged) store.setProjects(updatedProjects);
  if (tasksChanged) store.setTasks(updatedTasks);
  if (costsChanged) store.setCosts(updatedCosts);
  if (delegationsChanged) store.setDelegationGroups(updatedDelegations);

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
