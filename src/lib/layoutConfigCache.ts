/**
 * Persistent Disk Cache (IndexedDB + Browser CacheStorage API) for Layout Liveview Map Configurations.
 * Stores `mapping_config.json` / `storeLocationData` (unit shapes, polygons, floor versions, thematic groups)
 * on disk without the 1MB localStorage limit, enabling 0ms instant boot when opening Layout Liveview.
 */

const CONFIG_DB_NAME = 'taka_layout_config_db';
const CONFIG_DB_VERSION = 1;
const CONFIG_STORE_NAME = 'layout_configs';
const PRIMARY_CONFIG_KEY = 'mapping_config_v2';
const CACHE_STORAGE_NAME = 'taka-layout-config-cache-v2';
const SYNTHETIC_CONFIG_URL = 'https://cache.taka.local/layout/mapping_config_v2.json';
const LS_BACKUP_KEY = 'taka_mapping_config_backup';
const LS_META_KEY = 'taka_layout_config_meta_v2';

// Synchronous in-memory mirror hydrated at startup for 0ms mount access
let memoryLayoutConfig: any = null;
let lastNetworkCheckAt = 0;

/**
 * Validates that a layout config actually contains real floor versions or unit shapes,
 * preventing empty initial store partitions from corrupting the persistent disk cache.
 */
export function isValidLayoutConfig(data: any): boolean {
  if (!data || typeof data !== 'object') return false;

  if (data.storeLocationData && typeof data.storeLocationData === 'object') {
    for (const part of Object.values(data.storeLocationData) as any[]) {
      if (Array.isArray(part?.mapVersions) && part.mapVersions.length > 0) {
        const hasRealVersion = part.mapVersions.some(
          (v: any) => v && (v.backgroundUrl || v.r2Key || v.id || v.name)
        );
        if (hasRealVersion) return true;
      }
      if (Array.isArray(part?.mapUnits) && part.mapUnits.length > 0) {
        return true;
      }
    }
  }

  if (Array.isArray(data.versions) && data.versions.length > 0) return true;
  if (data.version && (data.version.backgroundUrl || data.version.r2Key || data.version.id)) return true;
  if (Array.isArray(data.mapUnits) && data.mapUnits.length > 0) return true;
  if (Array.isArray(data.units) && data.units.length > 0) return true;

  return false;
}

function hydrateFromLocalStorageSync(): any {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_BACKUP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidLayoutConfig(parsed)) {
        memoryLayoutConfig = parsed;
        return parsed;
      } else {
        // Purge corrupted/empty backup
        localStorage.removeItem(LS_BACKUP_KEY);
      }
    }
  } catch (_e) {
    try { localStorage.removeItem(LS_BACKUP_KEY); } catch (_) {}
  }
  return null;
}

// Immediately warm in-memory mirror from localStorage if available
hydrateFromLocalStorageSync();

let configDbPromise: Promise<IDBDatabase> | null = null;

function getConfigDB(): Promise<IDBDatabase> {
  if (configDbPromise) return configDbPromise;

  configDbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    try {
      const req = indexedDB.open(CONFIG_DB_NAME, CONFIG_DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(CONFIG_STORE_NAME)) {
          db.createObjectStore(CONFIG_STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => {
          configDbPromise = null;
        };
        db.onversionchange = () => {
          try { db.close(); } catch (_) {}
          configDbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        configDbPromise = null;
        reject(req.error);
      };
    } catch (err) {
      configDbPromise = null;
      reject(err);
    }
  });

  return configDbPromise;
}

/**
 * Synchronously returns the cached layout config if already hydrated in memory or localStorage.
 */
export function getMemoryCachedLayoutConfig(): any {
  if (memoryLayoutConfig && isValidLayoutConfig(memoryLayoutConfig)) {
    return memoryLayoutConfig;
  }
  return hydrateFromLocalStorageSync();
}

/**
 * Reads the persisted layout config from Disk Cache (Browser CacheStorage API -> IndexedDB -> localStorage).
 */
export async function getCachedLayoutConfigFromDisk(): Promise<any> {
  if (memoryLayoutConfig && isValidLayoutConfig(memoryLayoutConfig)) {
    return memoryLayoutConfig;
  }

  // 1. Check Browser CacheStorage API (fast native disk cache)
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(CACHE_STORAGE_NAME);
      const res = await cache.match(SYNTHETIC_CONFIG_URL);
      if (res && res.ok) {
        const data = await res.json();
        if (isValidLayoutConfig(data)) {
          memoryLayoutConfig = data;
          return data;
        }
      }
    } catch (_e) {
      // Fallthrough to IndexedDB
    }
  }

  // 2. Check IndexedDB persistent store
  try {
    const db = await getConfigDB();
    const idbData = await new Promise<any>((resolve) => {
      const tx = db.transaction(CONFIG_STORE_NAME, 'readonly');
      const store = tx.objectStore(CONFIG_STORE_NAME);
      const req = store.get(PRIMARY_CONFIG_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (isValidLayoutConfig(idbData)) {
      memoryLayoutConfig = idbData;
      return idbData;
    }
  } catch (_e) {
    configDbPromise = null;
  }

  // 3. Fallback to localStorage
  return hydrateFromLocalStorageSync();
}

/**
 * Persists the layout config to Disk Cache (both IndexedDB and Browser CacheStorage API, plus localStorage if < 900KB).
 * Runs off the main render path to guarantee 60fps UI responsiveness.
 */
export async function saveLayoutConfigToDisk(configData: any): Promise<void> {
  if (!isValidLayoutConfig(configData)) return;

  const stamped = {
    ...configData,
    cachedAt: Date.now(),
    timestamp: configData.timestamp || configData.updatedAt || Date.now(),
  };

  memoryLayoutConfig = stamped;

  setTimeout(async () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          LS_META_KEY,
          JSON.stringify({
            timestamp: stamped.timestamp,
            cachedAt: stamped.cachedAt,
          })
        );
      }
    } catch (_e) {}

    // Write to IndexedDB
    try {
      const db = await getConfigDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(CONFIG_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CONFIG_STORE_NAME);
        store.put(stamped, PRIMARY_CONFIG_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (_e) {
      configDbPromise = null;
    }

    // Write to Browser CacheStorage API (persistent OS disk cache)
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const jsonStr = JSON.stringify(stamped);
        const cache = await window.caches.open(CACHE_STORAGE_NAME);
        const response = new Response(jsonStr, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=31536000',
          },
        });
        await cache.put(SYNTHETIC_CONFIG_URL, response);

        // If small enough (< 900KB), also mirror to localStorage for synchronous 0ms cold boot
        if (jsonStr.length < 900000) {
          try {
            localStorage.setItem(LS_BACKUP_KEY, jsonStr);
          } catch (_lsErr) {}
        }
      } catch (_e) {}
    }
  }, 0);
}

export function getLastLayoutNetworkCheckAt(): number {
  return lastNetworkCheckAt;
}

export function markLayoutNetworkChecked(): void {
  lastNetworkCheckAt = Date.now();
}

export function getCachedLayoutConfigTimestamp(): number {
  if (memoryLayoutConfig?.timestamp && isValidLayoutConfig(memoryLayoutConfig)) {
    return Number(memoryLayoutConfig.timestamp) || 0;
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LS_META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Number(parsed?.timestamp) || 0;
      }
    } catch (_e) {}
  }
  return 0;
}

// Warm up memoryLayoutConfig from IndexedDB/CacheStorage immediately on startup in background
if (typeof window !== 'undefined') {
  setTimeout(() => {
    getCachedLayoutConfigFromDisk().catch(() => {});
  }, 10);
}
