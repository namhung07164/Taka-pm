import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { setDoc, updateDoc, deleteDoc } from './firestoreWrites';
import { pullAndApplyDeltas, getLastDeltaSyncTime } from './deltaSyncService';

// Lệnh nằm trong hàng đợi quá lâu thì dữ liệu trên server gần như chắc chắn đã đổi: bỏ, không phát lại.
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;

const toMs = (v: any): number => {
  if (!v) return 0;
  const n =
    typeof v === 'string' ? Date.parse(v) : typeof v?.toMillis === 'function' ? v.toMillis() : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Lỗi mà server từ chối vĩnh viễn: thử lại bao nhiêu lần cũng vậy, và KHÔNG được đưa vào hàng đợi.
 * Mất mạng thật thì Firestore SDK (persistent cache) tự giữ lệnh ghi và gửi lại, không cần hàng đợi này.
 */
export function isPermanentWriteError(err: any): boolean {
  const code = String(err?.code || '');
  return [
    'permission-denied',
    'not-found',
    'invalid-argument',
    'failed-precondition',
    'already-exists',
    'out-of-range',
    'unauthenticated',
    'unimplemented',
  ].some((c) => code.includes(c));
}

export interface PendingUpdate {
  id: string;
  collectionPath: string; // The full path, e.g. artifacts/APP_ID/public/data/taka_projects
  action: 'set' | 'update' | 'delete';
  docId: string;
  data: any;
  timestamp: number;
  retryCount?: number;
}

const DB_NAME = 'TakaSyncDB';
const STORE_NAME = 'pendingUpdates';

let isSyncProcessing = false;
let lastSyncTimestamp = 0;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addPendingUpdate(update: Omit<PendingUpdate, 'id' | 'timestamp'>) {
  try {
    const db = await openDB();
    const newUpdate: PendingUpdate = {
      ...update,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(newUpdate);
      request.onsuccess = () => resolve(newUpdate);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Failed to add pending update to IDB', e);
  }
}

export async function getPendingUpdates(): Promise<PendingUpdate[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Failed to get pending updates', e);
    return [];
  }
}

export async function removePendingUpdate(id: string) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Failed to remove pending update', e);
  }
}

export async function clearPendingUpdates() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Failed to clear pending updates', e);
  }
}

export function getConnectionStatus(): 'online' | 'offline' | 'checking' {
  if (typeof navigator === 'undefined') return 'online';
  return navigator.onLine ? 'online' : 'offline';
}

export async function processPendingSync(): Promise<{ synced: number; failed: number }> {
  if (isSyncProcessing) return { synced: 0, failed: 0 };
  if (getConnectionStatus() === 'offline') return { synced: 0, failed: 0 };

  isSyncProcessing = true;
  let synced = 0;
  let failed = 0;
  let dropped = 0;

  try {
    const pendingList = await getPendingUpdates();
    if (!pendingList || pendingList.length === 0) {
      lastSyncTimestamp = Date.now();
      return { synced: 0, failed: 0 };
    }

    // Phát lại theo đúng thứ tự thời gian
    pendingList.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));

    for (const item of pendingList) {
      try {
        const queuedAt = Number(item.timestamp) || 0;

        // 1. Quá hạn: bỏ
        if (queuedAt && Date.now() - queuedAt > MAX_PENDING_AGE_MS) {
          console.warn(`[SyncQueue] Drop expired pending ${item.action} ${item.docId}`);
          await removePendingUpdate(item.id);
          dropped++;
          continue;
        }

        const fullPath = item.collectionPath.includes('/')
          ? item.collectionPath
          : `artifacts/${APP_ID}/public/data/${item.collectionPath}`;
        const docRef = doc(db, `${fullPath}/${item.docId}`);
        const draftAt = toMs(item.data?.updatedAt) || queuedAt;

        // 2. Luôn đối chiếu với bản TRÊN SERVER (không dùng cache cục bộ). Không đọc được thì giữ lại thử sau.
        let serverSnap: any;
        try {
          serverSnap = await getDocFromServer(docRef);
        } catch {
          failed++;
          continue;
        }
        const exists = serverSnap.exists();
        const serverAt = exists ? toMs(serverSnap.data()?.updatedAt) : 0;

        if (item.action === 'delete') {
          // Doc đã mất rồi, hoặc đã được sửa SAU khi lệnh xóa được xếp hàng: không xóa
          if (!exists || (serverAt && queuedAt && serverAt > queuedAt)) {
            console.warn(`[SyncQueue] Skip stale delete ${item.docId}`);
            await removePendingUpdate(item.id);
            dropped++;
            continue;
          }
          await deleteDoc(docRef);
        } else if (item.action === 'update') {
          // Doc đã bị xóa: update sẽ lỗi not-found mãi mãi. Server mới hơn: không ghi đè.
          if (!exists || (serverAt && draftAt && serverAt > draftAt)) {
            console.warn(`[SyncQueue] Skip stale update ${item.docId}`);
            await removePendingUpdate(item.id);
            dropped++;
            continue;
          }
          await updateDoc(docRef, item.data);
        } else if (item.action === 'set') {
          // set với dữ liệu cũ hơn server: không ghi đè. Doc chưa tồn tại: cho phép tạo (bản nháp offline).
          if (exists && serverAt && draftAt && serverAt > draftAt) {
            console.warn(`[SyncQueue] Skip stale set ${item.docId}`);
            await removePendingUpdate(item.id);
            dropped++;
            continue;
          }
          await setDoc(docRef, item.data, { merge: true });
        }

        console.info(`[SyncQueue] Replayed ${item.action} ${item.docId}`);
        await removePendingUpdate(item.id);
        synced++;
      } catch (err) {
        if (isPermanentWriteError(err)) {
          console.warn(`[SyncQueue] Permanent error, dropping ${item.docId}:`, err);
          await removePendingUpdate(item.id);
          dropped++;
        } else {
          console.warn(`[SyncQueue] Failed to process update for ${item.docId}:`, err);
          failed++;
        }
      }
    }

    if (dropped > 0) console.info(`[SyncQueue] Dropped ${dropped} stale/invalid pending updates`);
    lastSyncTimestamp = Date.now();
    await pullAndApplyDeltas().catch(() => {});
  } catch (err) {
    console.error('[SyncQueue] Error during processPendingSync:', err);
  } finally {
    isSyncProcessing = false;
  }

  return { synced, failed };
}

export const syncQueueManager = {
  addToQueue: async (
    collectionName: string,
    docId: string,
    action: 'set' | 'update' | 'delete',
    data: any
  ) => {
    const collectionPath = collectionName.includes('/')
      ? collectionName
      : `artifacts/${APP_ID}/public/data/${collectionName}`;

    await addPendingUpdate({
      collectionPath,
      action,
      docId,
      data,
    });

    if (getConnectionStatus() === 'online') {
      processPendingSync().catch(() => {});
    }
  },

  getQueueStatus: async () => {
    const pendingList = await getPendingUpdates();
    return {
      totalPending: pendingList.length,
      unsynced: pendingList.length,
      lastSyncTime: lastSyncTimestamp || getLastDeltaSyncTime(),
      isProcessing: isSyncProcessing,
      pendingUpdates: pendingList.map((p) => ({
        docId: p.docId,
        action: p.action,
        retryCount: p.retryCount || 0,
        collection: p.collectionPath,
      })),
    };
  },

  clearQueue: async () => {
    await clearPendingUpdates();
    lastSyncTimestamp = Date.now();
  },

  processPendingSync,
};

// Global event listener for firestore refresh requests
if (typeof window !== 'undefined') {
  window.addEventListener('firestore-refresh-needed', () => {
    pullAndApplyDeltas().catch(() => {});
    processPendingSync().catch(() => {});
  });
}
