import { doc, getDoc } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { setDoc, updateDoc, deleteDoc } from './firestoreWrites';
import { pullAndApplyDeltas, getLastDeltaSyncTime } from './deltaSyncService';

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

  try {
    const pendingList = await getPendingUpdates();
    if (!pendingList || pendingList.length === 0) {
      lastSyncTimestamp = Date.now();
      return { synced: 0, failed: 0 };
    }

    for (const item of pendingList) {
      try {
        const fullPath = item.collectionPath.includes('/')
          ? item.collectionPath
          : `artifacts/${APP_ID}/public/data/${item.collectionPath}`;
        
        const docRef = doc(db, `${fullPath}/${item.docId}`);

        // Server Timestamp Conflict Check:
        // Skip update if server version has a newer updatedAt timestamp
        if (item.action === 'update' && item.data?.updatedAt) {
          try {
            const serverSnap = await getDoc(docRef);
            if (serverSnap.exists()) {
              const serverData = serverSnap.data();
              if (
                serverData.updatedAt &&
                new Date(serverData.updatedAt).getTime() > new Date(item.data.updatedAt).getTime()
              ) {
                console.warn(
                  `[SyncQueue] Conflict detected for ${item.docId}. Server version is newer. Skipping update.`
                );
                await removePendingUpdate(item.id);
                continue;
              }
            }
          } catch {
            // Ignore read errors during offline/flaky connection
          }
        }

        if (item.action === 'set') {
          await setDoc(docRef, item.data, { merge: true });
        } else if (item.action === 'update') {
          await updateDoc(docRef, item.data);
        } else if (item.action === 'delete') {
          await deleteDoc(docRef);
        }

        await removePendingUpdate(item.id);
        synced++;
      } catch (err) {
        console.warn(`[SyncQueue] Failed to process update for ${item.docId}:`, err);
        failed++;
      }
    }

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
