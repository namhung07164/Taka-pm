import { doc, getDocFromServer, getDoc } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { usePerformanceStore } from '../store/usePerformanceStore';
import type { TakaDelta, TakaDeltaItem } from '../types';

const PHYSICAL_COLLECTION: Record<TakaDeltaItem['collectionName'], string> = {
  taka_projects: 'taka_projects',
  taka_tasks: 'taka_tasks',
  taka_costs: 'taka_costs',
  taka_delegations: 'taka_delegation_groups',
};

const tsOf = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v?.toMillis === 'function') {
    const n = v.toMillis();
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v?.seconds === 'number') {
    return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Checks Tri-Gate flags and skips re-reading documents that were already delivered
 * within the last 10 seconds by an active onSnapshot listener or explicit delta.
 */
function isRelevant(item: TakaDeltaItem, nowMs: number): boolean {
  if (!item || !item.docId || !item.collectionName) return false;
  const store = useAppStore.getState();
  const RECENT_SNAPSHOT_WINDOW_MS = 10000;

  if (item.collectionName === 'taka_costs') {
    if (!store.isCostsRequested && (!store.costs || store.costs.length === 0)) return false;
    const existing = store.costs?.find((c) => c.id === item.docId);
    if (existing && nowMs - tsOf(existing.updatedAt) < RECENT_SNAPSHOT_WINDOW_MS) return false;
  } else if (item.collectionName === 'taka_delegations') {
    if (!store.isDelegationsRequested && (!store.delegationGroups || store.delegationGroups.length === 0)) {
      return false;
    }
    const existing = store.delegationGroups?.find((d) => d.id === item.docId);
    if (existing && nowMs - tsOf(existing.updatedAt) < RECENT_SNAPSHOT_WINDOW_MS) return false;
  } else if (item.collectionName === 'taka_tasks') {
    if (!store.isTasksRequested && (!store.tasks || store.tasks.length === 0)) return false;
    const existing = store.tasks?.find((t) => t.id === item.docId);
    if (existing && nowMs - tsOf(existing.updatedAt) < RECENT_SNAPSHOT_WINDOW_MS) return false;
  } else if (item.collectionName === 'taka_projects') {
    const existing = store.projects?.find((p) => p.id === item.docId);
    if (existing && nowMs - tsOf(existing.updatedAt) < RECENT_SNAPSHOT_WINDOW_MS) return false;
  }

  return true;
}

/**
 * Đọc lại đúng các document vừa nhận tín hiệu invalidate từ thiết bị khác (1 Read / 1 Doc sửa đổi)
 * và chuyển thành synthetic delta để applyIncomingDeltas cập nhật nguyên tử vào Zustand + Dexie.
 */
export async function resolveInvalidations(items: TakaDeltaItem[]): Promise<TakaDelta[]> {
  const now = Date.now();
  // Khử trùng lặp theo collectionName + docId
  const unique = new Map<string, TakaDeltaItem>();
  for (const it of items) {
    if (!isRelevant(it, now)) continue;
    unique.set(`${it.collectionName}:${it.docId}`, it);
  }
  if (unique.size === 0) return [];

  const nowIso = new Date(now).toISOString();

  const results = await Promise.all(
    Array.from(unique.values()).map(async (it): Promise<TakaDeltaItem | null> => {
      const physical = PHYSICAL_COLLECTION[it.collectionName];
      if (!physical) return null;
      try {
        const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', physical, it.docId);
        let snap;
        try {
          snap = await getDocFromServer(ref);
        } catch {
          snap = await getDoc(ref);
        }
        usePerformanceStore
          .getState()
          .trackGetDoc(physical, false, 1, `Delta invalidate re-read: ${it.docId}`);

        if (!snap.exists()) {
          return {
            docId: it.docId,
            collectionName: it.collectionName,
            action: 'delete',
            isPatch: false,
            data: { id: it.docId, isDeleted: true },
          };
        }
        const data = snap.data() as Record<string, any>;
        if (data?.isDeleted) {
          return {
            docId: it.docId,
            collectionName: it.collectionName,
            action: 'delete',
            isPatch: false,
            data: { id: it.docId, isDeleted: true, ...data },
          };
        }
        return {
          docId: it.docId,
          collectionName: it.collectionName,
          action: 'create',
          isPatch: false,
          data: { id: it.docId, ...data },
          year: String(data.year || data.projectYear || it.year || ''),
        };
      } catch (err) {
        console.warn('[deltaSync] Failed to re-read invalidated doc:', it.collectionName, it.docId, err);
        return null;
      }
    })
  );

  const resolved = results.filter((x): x is TakaDeltaItem => x !== null);
  if (resolved.length === 0) return [];

  return [
    {
      id: `delta_resolved_${now}`,
      action: 'batch_update',
      batchItems: resolved,
      updatedBy: 'delta-invalidate',
      sessionId: '__resolved__',
      timestamp: nowIso,
      numericTime: now,
    },
  ];
}
