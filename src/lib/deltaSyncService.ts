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
  serverTimestamp,
  Timestamp,
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
import { getTasksForProject, calculateProjectComputedDates } from './projectDatesService';
import { initNetworkRecovery, resyncIfStale } from './syncResilience';
import { markExplicitDelta } from './autoDeltaQueue';
import { resolveInvalidations } from './deltaInvalidateService';
import { startDeltaRealtimeListener } from './deltaRealtimeListener';

const LAST_SYNC_KEY = 'taka_last_delta_sync_time_v1';
const DELTA_COLLECTION = 'taka_deltas';

// The sync cursor is serverTime (server arrival time), NOT numericTime: a delta created offline carries an old
// client time but arrives later. Only the device clock used for lastSyncTime is skewed; the overlap covers that.
// (Legacy comment:) Deltas carry the writer's client clock (numericTime). Re-read a small overlap window so a writer whose
// clock is slightly behind is not skipped; already-applied delta ids are filtered out below.
const CLOCK_SKEW_OVERLAP_MS = 3 * 60 * 1000;
const appliedDeltaIds = new Set<string>();
const MAX_APPLIED_IDS = 3000;

/** Sync cursor time of a delta in ms: server arrival time when known, else the client time. */
export function deltaTime(d: TakaDelta): number {
  const ms = (d as any)?.serverTime?.toMillis?.();
  return typeof ms === 'number' ? ms : d.numericTime || 0;
}

export const CLIENT_SESSION_ID = typeof window !== 'undefined'
  ? `sess_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`
  : 'server_sess';

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
  markExplicitDelta([{ docId: delta.docId, collectionName: delta.collectionName }]);
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
    sessionId: CLIENT_SESSION_ID,
    timestamp: nowIso,
    numericTime: now,
    serverTime: serverTimestamp() as any,
    expireAt: Timestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000),
  };

  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION, deltaId);
    await setDoc(docRef, deltaPayload);

    // Kích hoạt cập nhật fingerprint năm tương ứng
    if (delta.year) {
      touchYearMeta(delta.year).catch(() => {});
    }

    // Phát tín hiệu tức thì sang các máy trạm khác trong cùng trình duyệt (0 Read)
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
  markExplicitDelta(items.filter((i) => !i.invalidate));
  if (items.length === 1 && !items[0].invalidate) {
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
    sessionId: CLIENT_SESSION_ID,
    timestamp: nowIso,
    numericTime: now,
    serverTime: serverTimestamp() as any,
    expireAt: Timestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000),
  };

  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION, deltaId);
    await setDoc(docRef, deltaPayload);

    // Kích hoạt cập nhật fingerprint các năm bị ảnh hưởng
    const affectedYears = new Set(items.map((i) => i.year).filter(Boolean));
    affectedYears.forEach((yr) => touchYearMeta(yr!).catch(() => {}));

    // Phát tín hiệu tức thì sang các máy trạm khác (0 Read)
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
  // Mặc định lùi lại 48 giờ nếu lần đầu mở app để không bị sót thay đổi giữa các thiết bị
  const initial = Date.now() - 48 * 60 * 60 * 1000;
  safeSetItemLocal(LAST_SYNC_KEY, String(initial));
  return initial;
}

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
    collectionName: string,
    action: 'create' | 'update' | 'delete',
    data: any,
    year?: string
  ) => {
    if (!docId) return;

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
        } else if (action === 'create') {
          // 'update' for a doc we do not hold is only a partial patch: skip it (listeners / Dexie load the full doc)
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
        } else if (action === 'create') {
          // 'update' for a doc we do not hold is only a partial patch: skip it (listeners / Dexie load the full doc)
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
        } else if (action === 'create') {
          // 'update' for a doc we do not hold is only a partial patch: skip it (listeners / Dexie load the full doc)
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
        } else if (action === 'create') {
          // 'update' for a doc we do not hold is only a partial patch: skip it (listeners / Dexie load the full doc)
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
        applyItem(item.docId, item.collectionName, item.action, item.data, item.year);
      });
    } else if (delta.docId && delta.collectionName) {
      applyItem(delta.docId, delta.collectionName, delta.action as any, delta.data, delta.year);
    }
  });

  // Cập nhật nguyên tử 1 lần duy nhất vào Zustand (0ms UI re-render)
  if (tasksChanged && !projectsChanged) {
    const delegationGroups = store.delegationGroups || [];
    updatedProjects = updatedProjects.map(p => {
      const pTasks = getTasksForProject(p, updatedTasks);
      if (pTasks.length > 0 || (p.taskSummaries && p.taskSummaries.length > 0)) {
        const computedDates = calculateProjectComputedDates(p, pTasks, delegationGroups);
        return {
          ...p,
          ...computedDates,
          taskCount: pTasks.length > 0 ? pTasks.length : (computedDates.taskCount !== undefined ? computedDates.taskCount : (p.taskCount || 0)),
          taskSummaries: (computedDates.taskSummaries && computedDates.taskSummaries.length >= (p.taskSummaries?.length || 0))
            ? computedDates.taskSummaries
            : (p.taskSummaries || computedDates.taskSummaries || []),
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

/**
 * Drops deltas that were already applied on this device (shared across poll + listener).
 */
export function filterUnappliedDeltas(items: TakaDelta[]): TakaDelta[] {
  const fresh: TakaDelta[] = [];
  for (const item of items) {
    const id = item.id;
    if (!id) { fresh.push(item); continue; }
    if (appliedDeltaIds.has(id)) continue;
    appliedDeltaIds.add(id);
    if (appliedDeltaIds.size > MAX_APPLIED_IDS) {
      const oldest = appliedDeltaIds.values().next().value;
      if (oldest !== undefined) appliedDeltaIds.delete(oldest);
    }
    fresh.push(item);
  }
  return fresh;
}

let inFlightPullPromise: Promise<number> | null = null;
let lastPullCompletedAt = 0;

/**
 * Kéo các delta thay đổi từ server về client kể từ lastSyncTime và áp dụng vào Zustand
 * Tiết kiệm hơn 80% Read so với việc onSnapshot cả collection
 * B4: In-flight deduplication prevents concurrent identical queries across tabs/effects
 */
export async function pullAndApplyDeltas(yearFilter?: string): Promise<number> {
  if (inFlightPullPromise) {
    return inFlightPullPromise;
  }
  const now = Date.now();
  if (now - lastPullCompletedAt < 3000) {
    return 0;
  }

  inFlightPullPromise = (async () => {
    const lastSyncTime = getLastDeltaSyncTime();

    // Device offline longer than delta retention -> deltas are gone, do a full resync.
    if (await resyncIfStale(lastSyncTime, LAST_SYNC_KEY)) return 0;

    const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION);

    try {
      const deltas: TakaDelta[] = [];
      let currentSince = lastSyncTime - CLOCK_SKEW_OVERLAP_MS;
      let iteration = 0;
      const MAX_PAGES = 5;

      while (iteration < MAX_PAGES) {
        iteration++;
        const q = query(
          colRef,
          where('serverTime', '>', Timestamp.fromMillis(currentSince)),
          orderBy('serverTime', 'asc'),
          limit(500)
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          break;
        }

        let pageMaxTime = currentSince;
        snapshot.forEach((d) => {
          const item = d.data() as TakaDelta;
          const itemId = item.id || d.id;
          if (appliedDeltaIds.has(itemId)) {
            if (deltaTime(item) > pageMaxTime) pageMaxTime = deltaTime(item);
            return;
          }
          appliedDeltaIds.add(itemId);
          if (appliedDeltaIds.size > MAX_APPLIED_IDS) {
            const oldest = appliedDeltaIds.values().next().value;
            if (oldest !== undefined) appliedDeltaIds.delete(oldest);
          }
          deltas.push(item);
          if (deltaTime(item) > pageMaxTime) {
            pageMaxTime = deltaTime(item);
          }
        });

        currentSince = pageMaxTime;
        if (snapshot.size < 500) {
          break;
        }
      }

      if (deltas.length === 0) {
        // Advance lastSyncTime with 60s clock skew buffer so Heartbeat Fingerprint bypass stays active (0-Read)
        const safeRecentTime = Math.max(lastSyncTime, Date.now() - 60000);
        safeSetItemLocal(LAST_SYNC_KEY, String(safeRecentTime));
        return 0;
      }

      return applyIncomingDeltas(deltas);
    } catch (err) {
      console.warn('[deltaSync] Error pulling deltas:', err);
      return 0;
    } finally {
      lastPullCompletedAt = Date.now();
      inFlightPullPromise = null;
    }
  })();

  return inFlightPullPromise;
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
export function startDeltaSyncService(intervalMs: number = 30 * 60 * 1000): () => void {
  if (typeof window === 'undefined') return () => {};

  // Real-time channel (onSnapshot). The interval below is only a slow safety-net poll (B5).
  const stopRealtime = startDeltaRealtimeListener();

  let lastTriggerAt = 0;
  const triggerSync = () => {
    const now = Date.now();
    if (now - lastTriggerAt < 15000) return;
    lastTriggerAt = now;
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
  const stopNetworkRecovery = initNetworkRecovery(() => triggerSync());

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

  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleOnline);

  return () => {
    stopPolling();
    stopNetworkRecovery();
    stopRealtime();
    window.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
  };
}

/**
 * Kích hoạt đồng bộ Delta ngay lập tức khi ứng dụng thức giấc từ trạng thái ngủ sâu (iOS Sleep/Wake Guard)
 */
export async function triggerImmediateDeltaSync(year?: string): Promise<number> {
  lastActivityTime = Date.now();
  isHibernating = false;
  return pullAndApplyDeltas(year || useAppStore.getState().globalYearFilter);
}
