import { doc } from 'firebase/firestore';
import { setDoc } from './firestoreWrites';
import { db, APP_ID } from './firebase';
import { addPendingUpdate, isPermanentWriteError } from './syncQueue';
import { recordDelta } from './deltaSyncService';
import { markExplicitDelta, unmarkExplicitDelta } from './autoDeltaQueue';
import { enrichPayloadWithStoreCompositeKeys } from './localMutationMirror';

export interface CoalescedMutation {
  collectionPath: string; // Tên collection, vd: taka_tasks
  docId: string;
  data: Record<string, any>;
  isUpdate?: boolean;
  debounceMs?: number;
  maxWaitMs?: number;
  year?: string;
}

interface QueuedItem {
  collectionPath: string;
  docId: string;
  data: Record<string, any>;
  isUpdate: boolean;
  timer: any;
  firstQueuedAt: number;
  year?: string;
}

// Bảng lưu trữ in-memory các mutations đang chờ debounce
const mutationQueue = new Map<string, QueuedItem>();

/**
 * Thực hiện ghi document lên Firestore với cơ chế Coalescing (gom nhiều lần ghi liên tiếp trong 400-800ms thành 1)
 */
export function queueCoalescedMutation({
  collectionPath,
  docId,
  data,
  isUpdate = true,
  debounceMs = 500,
  maxWaitMs = 2000,
  year,
}: CoalescedMutation): void {
  const queueKey = `${collectionPath}/${docId}`;
  const now = Date.now();

  const existing = mutationQueue.get(queueKey);

  if (existing) {
    // 1. Gom (merge) dữ liệu mới vào dữ liệu đã có trong queue
    existing.data = {
      ...existing.data,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (year) existing.year = year;

    // 2. Kiểm tra maxWaitMs để không làm nghẽn quá lâu
    if (now - existing.firstQueuedAt < maxWaitMs) {
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        flushQueueItem(queueKey);
      }, debounceMs);
    }
  } else {
    // Tạo item mới trong queue
    const timer = setTimeout(() => {
      flushQueueItem(queueKey);
    }, debounceMs);

    mutationQueue.set(queueKey, {
      collectionPath,
      docId,
      data: {
        ...data,
        updatedAt: new Date().toISOString(),
      },
      isUpdate,
      timer,
      firstQueuedAt: now,
      year,
    });
  }
}

/**
 * Ghi 1 item từ queue xuống Firestore
 */
async function flushQueueItem(queueKey: string): Promise<void> {
  const item = mutationQueue.get(queueKey);
  if (!item) return;

  mutationQueue.delete(queueKey);
  clearTimeout(item.timer);

  const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', item.collectionPath, item.docId);

  const isCoreCollection = ['taka_projects', 'taka_tasks', 'taka_costs', 'taka_delegations'].includes(item.collectionPath);

  // Đánh dấu TRƯỚC khi ghi: await setDoc chờ server ack (có thể >1.5s trên iOS), nếu đánh dấu SAU
  // thì auto-delta xả trước và phát thêm 1 delta "invalidate" thừa.
  if (isCoreCollection) {
    markExplicitDelta([{ docId: item.docId, collectionName: item.collectionPath }]);
  }

  try {
    if (item.isUpdate) {
      await setDoc(docRef, item.data, { merge: true });
    } else {
      await setDoc(docRef, item.data);
    }

    // Record delta change log with complete composite keys (Rule 16.1 AGENTS.md)
    if (isCoreCollection) {
      const enriched = enrichPayloadWithStoreCompositeKeys(item.collectionPath, item.docId, item.data);
      const resolvedYear =
        item.year ||
        (enriched.year !== undefined && enriched.year !== null ? String(enriched.year) : undefined) ||
        (enriched.projectYear !== undefined && enriched.projectYear !== null ? String(enriched.projectYear) : undefined);

      recordDelta({
        docId: item.docId,
        collectionName: item.collectionPath as any,
        action: item.isUpdate ? 'update' : 'create',
        data: enriched,
        isPatch: item.isUpdate,
        year: resolvedYear,
        projectId: enriched.projectId ? String(enriched.projectId) : undefined,
        projectCode: enriched.projectCode || enriched.code,
        store: enriched.projectStore || enriched.store,
      }).catch(() => {});
    }
  } catch (err) {
    if (isCoreCollection) {
      unmarkExplicitDelta([{ docId: item.docId, collectionName: item.collectionPath }]);
    }
    console.error(`[mutationCoalescer] Error flushing ${queueKey}, buffering to syncQueue:`, err);
    // Server từ chối vĩnh viễn thì không xếp hàng (phát lại sau này chỉ gây ghi đè ngoài ý muốn)
    if (isPermanentWriteError(err)) return;
    // Lưu vào Offline Sync Queue chống mất dữ liệu (Rule 2 AGENTS.md)
    addPendingUpdate({
      collectionPath: `artifacts/${APP_ID}/public/data/${item.collectionPath}`,
      docId: item.docId,
      action: item.isUpdate ? 'update' : 'set',
      data: item.data,
    }).catch(() => {});
  }
}

/**
 * Đẩy toàn bộ các mutations còn đang chờ trước khi unmount hoặc navigate
 */
export async function flushAllCoalescedMutations(): Promise<void> {
  const keys = Array.from(mutationQueue.keys());
  await Promise.all(keys.map((key) => flushQueueItem(key)));
}

// Lắng nghe sự kiện trước khi đóng tab để flush toàn bộ
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushAllCoalescedMutations();
  });
}
