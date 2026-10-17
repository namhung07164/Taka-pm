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

/**
 * Với chế độ DELTA_FIRST: Mọi tín hiệu invalidate gửi qua taka_deltas đều là thay đổi thực tế
 * từ thiết bị khác (chỉ 1 doc/lần sửa). Luôn cho phép resolve để cập nhật ngay vào Dexie + Zustand,
 * đảm bảo khi người dùng chuyển sang bất kỳ tab nào thì dữ liệu ở tab đó cũng đã mới nhất 100%.
 */
function isRelevant(item: TakaDeltaItem): boolean {
  if (!item || !item.docId || !item.collectionName) return false;
  return true;
}

/**
 * Đọc lại đúng các document vừa nhận tín hiệu invalidate từ thiết bị khác (1 Read / 1 Doc sửa đổi)
 * và chuyển thành synthetic delta để applyIncomingDeltas cập nhật nguyên tử vào Zustand + Dexie.
 */
export async function resolveInvalidations(items: TakaDeltaItem[]): Promise<TakaDelta[]> {
  // Khử trùng lặp theo collectionName + docId
  const unique = new Map<string, TakaDeltaItem>();
  for (const it of items) {
    if (!isRelevant(it)) continue;
    unique.set(`${it.collectionName}:${it.docId}`, it);
  }
  if (unique.size === 0) return [];

  const now = Date.now();
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
