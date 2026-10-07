import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  setDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { safeGetItemLocal, safeSetItemLocal } from './storage';
import { TakaDelta, TakaDeltaItem, Project, Task, Cost, DelegationGroup } from '../types';
import { touchYearMeta, getMemoryYearsMeta } from './yearsFingerprintService';
import { applyDeltasToLocalDatabase } from './backgroundSyncWorker';
import { triggerBatchChangeFlash } from './changeFlashService';
import { broadcastAppliedDeltas } from './broadcastSyncService';
import { applyFieldPatch } from './deltaPatchService';

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
  isPatch?: boolean;
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
    isPatch: delta.isPatch,
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

    // Phát tín hiệu tức thì sang các tab khác trong cùng trình duyệt (0 Read)
    broadcastAppliedDeltas([deltaPayload]);
  } catch (err) {
    console.warn('[deltaSync] Failed to record delta to Firestore:', err);
  }
}

/**
 * Giai đoạn 2: Ghi gom hàng loạt mutation vào 1 Document Delta duy nhất (Giảm 90% Firestore Write)
 */
export async function recordBatchDeltas(
  items: TakaDeltaItem[],
  updatedBy?: string
): Promise<void> {
  if (!items || items.length === 0) return;
  if (items.length === 1) {
    const item = items[0];
    return recordDelta({
      docId: item.docId,
      collectionName: item.collectionName,
      action: item.action,
      data: item.data || {},
      year: item.year,
      updatedBy,
    });
  }

  const now = Date.now();
  const deltaId = `delta_batch_${now}_${Math.random().toString(36).substring(2, 8)}`;
  const nowIso = new Date(now).toISOString();

  const deltaPayload: TakaDelta = {
    id: deltaId,
    action: 'batch_update',
    batchItems: items,
    updatedBy: updatedBy || useAppStore.getState().currentUser?.email || 'system',
    timestamp: nowIso,
    numericTime: now,
  };

  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION, deltaId);
    await setDoc(docRef, deltaPayload);

    // Kích hoạt cập nhật fingerprint các năm bị ảnh hưởng
    const affectedYears = new Set(items.map((i) => i.year).filter(Boolean));
    affectedYears.forEach((yr) => touchYearMeta(yr!).catch(() => {}));

    // Phát tín hiệu tức thì sang các tab khác (0 Read)
    broadcastAppliedDeltas([deltaPayload]);
  } catch (err) {
    console.warn('[deltaSync] Failed to record batch deltas to Firestore:', err);
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

  // 1. Heartbeat Fingerprint Optimization (Rule 15):
  // Nếu đang xem năm cụ thể và remote metadata updatedAt không mới hơn lastSyncTime,
  // bỏ qua hoàn toàn truy vấn taka_deltas -> 0 Firestore READ!
  // Kèm Lớp Bảo hiểm Fail-Safe: Nếu đã quá 2 phút chưa kiểm tra trực tiếp, vẫn chạy query phòng ngừa
  if (yearFilter && yearFilter !== 'all') {
    const memMeta = getMemoryYearsMeta();
    if (memMeta && memMeta[yearFilter]?.updatedAt) {
      const remoteTime = new Date(memMeta[yearFilter].updatedAt).getTime();
      const timeSinceLastSync = Date.now() - lastSyncTime;
      const FAIL_SAFE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes fail-safe
      if (!isNaN(remoteTime) && remoteTime <= lastSyncTime && timeSinceLastSync < FAIL_SAFE_TIMEOUT_MS) {
        return 0; // Pure 0-Read bypass
      }
    }
  }

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
      // Advance lastSyncTime with 60s clock skew buffer so Heartbeat Fingerprint bypass stays active (0-Read)
      const safeRecentTime = Math.max(lastSyncTime, Date.now() - 60000);
      safeSetItemLocal(LAST_SYNC_KEY, String(safeRecentTime));
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

    const applyItem = (
      docId: string,
      collectionName: string,
      action: 'create' | 'update' | 'delete',
      data: any,
      year?: string
    ) => {
      if (!docId) return;

      // 2. Lọc theo năm nếu đang chọn năm cụ thể
      if (yearFilter && yearFilter !== 'all' && year && year !== yearFilter) {
        return;
      }

      // 3. Tri-Gate Lazy Loading Guards (Rule 3 AGENTS.md):
      if (
        collectionName === 'taka_tasks' &&
        !store.isTasksRequested &&
        store.tasks.length === 0
      ) {
        return;
      }
      if (
        collectionName === 'taka_costs' &&
        !store.isCostsRequested &&
        store.costs.length === 0
      ) {
        return;
      }
      if (
        collectionName === 'taka_delegations' &&
        !store.isDelegationsRequested &&
        store.delegationGroups.length === 0
      ) {
        return;
      }

      switch (collectionName) {
        case 'taka_projects': {
          projectsChanged = true;
          const idx = updatedProjects.findIndex((p) => p.id === docId);
          if (action === 'delete') {
            updatedProjects = updatedProjects.filter((p) => p.id !== docId);
          } else if (idx !== -1) {
            updatedProjects[idx] = applyFieldPatch(updatedProjects[idx], data) as Project;
          } else if (action === 'create' || action === 'update') {
            updatedProjects.push({ id: docId, ...data } as Project);
          }
          break;
        }

        case 'taka_tasks': {
          tasksChanged = true;
          const idx = updatedTasks.findIndex((t) => t.id === docId);
          if (action === 'delete') {
            updatedTasks = updatedTasks.filter((t) => t.id !== docId);
          } else if (idx !== -1) {
            updatedTasks[idx] = applyFieldPatch(updatedTasks[idx], data) as Task;
          } else if (action === 'create' || action === 'update') {
            updatedTasks.push({ id: docId, ...data } as Task);
          }
          break;
        }

        case 'taka_costs': {
          costsChanged = true;
          const idx = updatedCosts.findIndex((c) => c.id === docId);
          if (action === 'delete') {
            updatedCosts = updatedCosts.filter((c) => c.id !== docId);
          } else if (idx !== -1) {
            updatedCosts[idx] = applyFieldPatch(updatedCosts[idx], data) as Cost;
          } else if (action === 'create' || action === 'update') {
            updatedCosts.push({ id: docId, ...data } as Cost);
          }
          break;
        }

        case 'taka_delegations': {
          delegationsChanged = true;
          const idx = updatedDelegations.findIndex((g) => g.id === docId);
          if (action === 'delete') {
            updatedDelegations = updatedDelegations.filter((g) => g.id !== docId);
          } else if (idx !== -1) {
            updatedDelegations[idx] = applyFieldPatch(updatedDelegations[idx], data) as DelegationGroup;
          } else if (action === 'create' || action === 'update') {
            updatedDelegations.push({ id: docId, ...data } as DelegationGroup);
          }
          break;
        }
      }
    };

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

      if (delta.action === 'batch_update' && Array.isArray(delta.batchItems)) {
        delta.batchItems.forEach((item) => {
          applyItem(item.docId, item.collectionName, item.action, item.data, item.year);
        });
      } else if (delta.docId && delta.collectionName) {
        applyItem(delta.docId, delta.collectionName, delta.action as any, delta.data, delta.year);
      }
    });

    // Cập nhật nguyên tử 1 lần duy nhất vào Zustand (0ms UI re-render)
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

    return deltas.length;
  } catch (err) {
    console.warn('[deltaSync] Error pulling deltas:', err);
    return 0;
  }
}

import { purgeOldDeltas } from './deltaPurgeService';

/**
 * Tự động Dọn dẹp Delta cũ (Delta Retention TTL & Pruning)
 */
export async function pruneExpiredDeltas(retentionDays: number = 7): Promise<number> {
  return purgeOldDeltas(retentionDays * 24);
}

let syncIntervalTimer: any = null;
let isHibernating = false;
let lastActivityTime = Date.now();
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes inactivity threshold

/**
 * Khởi động Background Delta Sync Poller với Adaptive Tab Hibernation & Inactivity Sleep
 * - Khi ẩn tab hoặc người dùng không hoạt động > 5 phút: Tạm dừng định thời hoàn toàn (0 Idle Read).
 * - Khi quay lại tab hoặc tương tác: Lập tức sync tức thì (0ms) và kích hoạt lại interval.
 */
export function startDeltaSyncService(intervalMs: number = 25000): () => void {
  if (typeof window === 'undefined') return () => {};

  const triggerSync = () => {
    const year = useAppStore.getState().globalYearFilter;
    pullAndApplyDeltas(year).catch(() => {});
  };

  const stopPolling = () => {
    if (syncIntervalTimer) {
      clearInterval(syncIntervalTimer);
      syncIntervalTimer = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    syncIntervalTimer = setInterval(() => {
      // Check for hidden tab or inactivity sleep
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        hibernate();
        return;
      }
      if (Date.now() - lastActivityTime > IDLE_TIMEOUT_MS) {
        hibernate();
        return;
      }
      triggerSync();
    }, intervalMs);
  };

  const hibernate = () => {
    if (isHibernating) return;
    isHibernating = true;
    stopPolling();
  };

  const wakeAndSync = () => {
    lastActivityTime = Date.now();
    if (isHibernating || !syncIntervalTimer) {
      isHibernating = false;
      triggerSync(); // Sync immediately on wake
      startPolling();
    }
  };

  // 1. Initial boot sync & start timer
  triggerSync();
  startPolling();

  // 2. Schedule non-blocking background TTL pruning after boot (15s delay)
  setTimeout(() => {
    pruneExpiredDeltas(7).catch(() => {});
  }, 15000);

  // 2. Tab Visibility Listener (Page Visibility API - Hibernation)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      wakeAndSync();
    } else {
      hibernate();
    }
  };

  // 3. Online network reconnection
  const handleOnline = () => {
    wakeAndSync();
  };

  // 4. User activity listeners to wake up from inactivity sleep
  const handleUserActivity = () => {
    if (isHibernating) {
      wakeAndSync();
    } else {
      lastActivityTime = Date.now();
    }
  };

  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleOnline);
  window.addEventListener('pointerdown', handleUserActivity, { passive: true });
  window.addEventListener('keydown', handleUserActivity, { passive: true });
  window.addEventListener('touchstart', handleUserActivity, { passive: true });

  return () => {
    stopPolling();
    window.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('pointerdown', handleUserActivity);
    window.removeEventListener('keydown', handleUserActivity);
    window.removeEventListener('touchstart', handleUserActivity);
  };
}
