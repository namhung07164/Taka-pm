export interface PendingUpdate {
  id: string;
  collectionPath: string; // The full path, e.g. artifacts/APP_ID/public/data/taka_projects
  action: 'set' | 'update' | 'delete';
  docId: string;
  data: any;
  timestamp: number;
}

const DB_NAME = 'TakaSyncDB';
const STORE_NAME = 'pendingUpdates';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2); // Bump version to 2
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
