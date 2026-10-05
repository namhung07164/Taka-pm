import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  setDoc,
  doc,
} from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { safeGetItemLocal, safeSetItemLocal } from './storage';
import { TakaDelta, Project, Task, Cost, DelegationGroup } from '../types';
import { touchYearMeta } from './yearsFingerprintService';
import { applyDeltasToLocalDatabase } from './backgroundSyncWorker';

const LAST_SYNC_KEY = 'taka_last_delta_sync_time_v1';
const DELTA_COLLECTION = 'taka_deltas';

/**
 * Ghi lại 1 delta change log khi có mutation phát sinh
 * Cho phép các máy trạm khác chỉ cần pull delta này thay vì tải lại toàn bộ collection
 */
export async function recordDelta(delta: {
  docId: string;
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations';
  action: 'create' | 'update' | 'delete';
  data: Record<string, any>;
  year?: string;
  updatedBy?: string;
}): Promise<void> {
  const now = Date.now();
  const deltaId = `delta_${now}_${Math.random().toString(36).substring(2, 8)}`;
  const nowIso = new Date(now).toISOString();

  const deltaPayload: TakaDelta = {
    id: deltaId,
    docId: delta.docId,
    collectionName: delta.collectionName,
    action: delta.action,
    year: delta.year ? String(delta.year) : undefined,
    data: delta.data,
    updatedBy: delta.updatedBy || useAppStore.getState().currentUser?.email || 'system',
    timestamp: nowIso,
    numericTime: now,
  };

  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION, deltaId);
    await setDoc(docRef, deltaPayload);

    // Kích hoạt cập nhật fingerprint năm tương ứng
    if (delta.year) {
      touchYearMeta(delta.year).catch(() => {});
    }
  } catch (err) {
    console.warn('[deltaSync] Failed to record delta to Firestore:', err);
  }
}

/**
 * Đọc mốc thời gian đã đồng bộ delta lần cuối từ LocalStorage
 */
export function getLastDeltaSyncTime(): number {
  const raw = safeGetItemLocal(LAST_SYNC_KEY);
  if (raw) {
    const num = Number(raw);
    if (!isNaN(num) && num > 0) return num;
  }
  // Mặc định lùi lại 30 phút nếu lần đầu mở app để không bị sót thay đổi vừa xảy ra
  const initial = Date.now() - 30 * 60 * 1000;
  safeSetItemLocal(LAST_SYNC_KEY, String(initial));
  return initial;
}

/**
 * Kéo các delta thay đổi từ server về client kể từ lastSyncTime và áp dụng vào Zustand
 * Tiết kiệm hơn 80% Read so với việc onSnapshot cả collection
 */
export async function pullAndApplyDeltas(yearFilter?: string): Promise<number> {
  const lastSyncTime = getLastDeltaSyncTime();
  const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION);

  try {
    let q = query(
      colRef,
      where('numericTime', '>', lastSyncTime),
      orderBy('numericTime', 'asc'),
      limit(200)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return 0;
    }

    const deltas: TakaDelta[] = [];
    snapshot.forEach((d) => {
      deltas.push(d.data() as TakaDelta);
    });

    // Ghi nhận vào Performance Store để giám sát
    usePerformanceStore
      .getState()
      .trackGetDoc(DELTA_COLLECTION, false, deltas.length, `Pulled ${deltas.length} deltas`);

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

    deltas.forEach((delta) => {
      if (delta.numericTime > maxTime) {
        maxTime = delta.numericTime;
      }

      // 1. Skip self-mutations to prevent typing flutter / jitter (Rule 2: Optimistic UI already applied them)
      if (
        delta.updatedBy &&
        store.currentUser?.email &&
        delta.updatedBy === store.currentUser.email
      ) {
        return;
      }

      // 2. Lọc theo năm nếu đang chọn năm cụ thể
      if (yearFilter && yearFilter !== 'all' && delta.year && delta.year !== yearFilter) {
        return;
      }

      // 3. Tri-Gate Lazy Loading Guards (Rule 3 AGENTS.md):
      // Do not populate un-hydrated slices before user opens those tabs
      if (
        delta.collectionName === 'taka_tasks' &&
        !store.isTasksRequested &&
        store.tasks.length === 0
      ) {
        return;
      }
      if (
        delta.collectionName === 'taka_costs' &&
        !store.isCostsRequested &&
        store.costs.length === 0
      ) {
        return;
      }
      if (
        delta.collectionName === 'taka_delegations' &&
        !store.isDelegationsRequested &&
        store.delegationGroups.length === 0
      ) {
        return;
      }

      switch (delta.collectionName) {
        case 'taka_projects': {
          projectsChanged = true;
          const idx = updatedProjects.findIndex((p) => p.id === delta.docId);
          if (delta.action === 'delete') {
            updatedProjects = updatedProjects.filter((p) => p.id !== delta.docId);
          } else if (idx !== -1) {
            updatedProjects[idx] = { ...updatedProjects[idx], ...delta.data } as Project;
          } else if (delta.action === 'create') {
            updatedProjects.push({ id: delta.docId, ...delta.data } as Project);
          }
          break;
        }

        case 'taka_tasks': {
          tasksChanged = true;
          const idx = updatedTasks.findIndex((t) => t.id === delta.docId);
          if (delta.action === 'delete') {
            updatedTasks = updatedTasks.filter((t) => t.id !== delta.docId);
          } else if (idx !== -1) {
            updatedTasks[idx] = { ...updatedTasks[idx], ...delta.data } as Task;
          } else if (delta.action === 'create') {
            updatedTasks.push({ id: delta.docId, ...delta.data } as Task);
          }
          break;
        }

        case 'taka_costs': {
          costsChanged = true;
          const idx = updatedCosts.findIndex((c) => c.id === delta.docId);
          if (delta.action === 'delete') {
            updatedCosts = updatedCosts.filter((c) => c.id !== delta.docId);
          } else if (idx !== -1) {
            updatedCosts[idx] = { ...updatedCosts[idx], ...delta.data } as Cost;
          } else if (delta.action === 'create') {
            updatedCosts.push({ id: delta.docId, ...delta.data } as Cost);
          }
          break;
        }

        case 'taka_delegations': {
          delegationsChanged = true;
          const idx = updatedDelegations.findIndex((g) => g.id === delta.docId);
          if (delta.action === 'delete') {
            updatedDelegations = updatedDelegations.filter((g) => g.id !== delta.docId);
          } else if (idx !== -1) {
            updatedDelegations[idx] = { ...updatedDelegations[idx], ...delta.data } as DelegationGroup;
          } else if (delta.action === 'create') {
            updatedDelegations.push({ id: delta.docId, ...delta.data } as DelegationGroup);
          }
          break;
        }
      }
    });

    // Cập nhật nguyên tử 1 lần duy nhất vào Zustand (0ms UI re-render)
    if (projectsChanged) store.setProjects(updatedProjects);
    if (tasksChanged) store.setTasks(updatedTasks);
    if (costsChanged) store.setCosts(updatedCosts);
    if (delegationsChanged) store.setDelegationGroups(updatedDelegations);

    // Lưu các delta vào Dexie Local-First Database ngầm
    applyDeltasToLocalDatabase(deltas).catch(() => {});

    // Cập nhật mốc đồng bộ mới nhất
    safeSetItemLocal(LAST_SYNC_KEY, String(maxTime));

    return deltas.length;
  } catch (err) {
    console.warn('[deltaSync] Error pulling deltas:', err);
    return 0;
  }
}

let syncIntervalTimer: any = null;

/**
 * Khởi động Background Delta Sync Poller
 * Tự động kiểm tra delta định kỳ 25s hoặc khi người dùng quay lại tab trình duyệt
 */
export function startDeltaSyncService(intervalMs: number = 25000): () => void {
  if (typeof window === 'undefined') return () => {};

  if (syncIntervalTimer) {
    clearInterval(syncIntervalTimer);
  }

  const triggerSync = () => {
    const year = useAppStore.getState().globalYearFilter;
    pullAndApplyDeltas(year).catch(() => {});
  };

  // Sync ngay khi khởi động
  triggerSync();

  // Poller định kỳ
  syncIntervalTimer = setInterval(triggerSync, intervalMs);

  // Lắng nghe khi người dùng chuyển tab quay lại (visibilitychange)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      triggerSync();
    }
  };

  const handleOnline = () => {
    triggerSync();
  };

  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleOnline);

  return () => {
    if (syncIntervalTimer) {
      clearInterval(syncIntervalTimer);
      syncIntervalTimer = null;
    }
    window.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
  };
}
