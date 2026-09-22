/**
 * IndexedDB & Memory Cache Manager for CAD Floorplan Images.
 * Provides instant 0ms switching between floors/versions during and across sessions.
 */

const DB_NAME = 'taka_cad_images_db';
const DB_VERSION = 1;
const STORE_NAME = 'cad_blobs';
const MAX_MEMORY_CACHE = 25; // Keep up to 25 decoded floorplan images in RAM

// In-Memory LRU Cache
const memoryCache = new Map<string, ImageBitmap | HTMLImageElement>();

function updateMemoryCache(url: string, img: ImageBitmap | HTMLImageElement) {
  if (memoryCache.has(url)) {
    memoryCache.delete(url);
  } else if (memoryCache.size >= MAX_MEMORY_CACHE) {
    // Evict oldest item
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) {
      const oldImg = memoryCache.get(firstKey);
      if (oldImg && 'close' in oldImg && typeof (oldImg as ImageBitmap).close === 'function') {
        try { (oldImg as ImageBitmap).close(); } catch (_) {}
      }
      memoryCache.delete(firstKey);
    }
  }
  memoryCache.set(url, img);
}

export function getMemoryCachedImage(url: string): ImageBitmap | HTMLImageElement | null {
  const img = memoryCache.get(url);
  if (img) {
    // Move to end (most recently used)
    memoryCache.delete(url);
    memoryCache.set(url, img);
    return img;
  }
  return null;
}

export function setMemoryCachedImage(url: string, img: ImageBitmap | HTMLImageElement) {
  updateMemoryCache(url, img);
}

// IndexedDB Helper
let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function getCachedBlobFromIDB(url: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (_e) {
    return null;
  }
}

export async function setCachedBlobToIDB(url: string, blob: Blob): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(blob, url);
  } catch (_e) {
    // Ignore IndexedDB write failures (e.g. quota exceeded)
  }
}
