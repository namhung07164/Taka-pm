import {
  extractR2Key,
  resolveR2UrlToHttp,
} from '../components/PictureMapping/lib/r2Upload';

/**
 * Persistent Disk Cache (Browser CacheStorage API + IndexedDB) & Memory Cache Manager
 * for CAD Floorplan Background Images & Maps (<500 lines per AGENTS.md Rule 12).
 */

const DB_NAME = 'taka_cad_images_db';
const DB_VERSION = 1;
const STORE_NAME = 'cad_blobs';
const CACHE_STORAGE_NAME = 'taka-cad-floorplans-v1';

const IS_CONSTRAINED_DEVICE =
  typeof window !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (typeof navigator !== 'undefined' && typeof (navigator as any).deviceMemory === 'number' && (navigator as any).deviceMemory <= 4));

const MAX_MEMORY_CACHE = IS_CONSTRAINED_DEVICE ? 6 : 12;

const memoryCache = new Map<string, ImageBitmap | HTMLImageElement>();
const memoryObjectUrls = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<Blob | null>>();
const verifiedOnDiskKeys = new Set<string>();

export function normalizeImageCacheKey(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;

  const r2Key = extractR2Key(trimmed);
  if (r2Key) return `r2_object_${r2Key}`;

  try {
    const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    if (
      parsed.searchParams.has('X-Amz-Signature') ||
      parsed.searchParams.has('X-Amz-Credential') ||
      parsed.searchParams.has('x-amz-signature') ||
      parsed.searchParams.has('token') ||
      parsed.searchParams.has('expires') ||
      parsed.searchParams.has('t')
    ) {
      return `${parsed.origin}${parsed.pathname}`;
    }
    return trimmed;
  } catch (_e) {
    return trimmed;
  }
}

function toSyntheticCacheUrl(cacheKey: string): string {
  return `https://cache.taka.local/cad-image/${encodeURIComponent(cacheKey)}`;
}

function cleanupEvictedEntry(cacheKey: string, img: ImageBitmap | HTMLImageElement | undefined, nextImg?: ImageBitmap | HTMLImageElement) {
  if (img && img !== nextImg && 'close' in img && typeof (img as ImageBitmap).close === 'function') {
    try { (img as ImageBitmap).close(); } catch (_) {}
  }
  const prevObjUrl = memoryObjectUrls.get(cacheKey);
  if (prevObjUrl && (!nextImg || !('src' in nextImg) || nextImg.src !== prevObjUrl)) {
    memoryObjectUrls.delete(cacheKey);
    try { URL.revokeObjectURL(prevObjUrl); } catch (_) {}
  }
}

function updateMemoryCache(cacheKey: string, img: ImageBitmap | HTMLImageElement, objectUrl?: string) {
  if (!cacheKey) return;
  if (memoryCache.has(cacheKey)) {
    const prev = memoryCache.get(cacheKey);
    memoryCache.delete(cacheKey);
    cleanupEvictedEntry(cacheKey, prev, img);
  } else if (memoryCache.size >= MAX_MEMORY_CACHE) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) {
      const evicted = memoryCache.get(firstKey);
      memoryCache.delete(firstKey);
      cleanupEvictedEntry(firstKey, evicted);
    }
  }
  if (objectUrl) {
    memoryObjectUrls.set(cacheKey, objectUrl);
  }
  memoryCache.set(cacheKey, img);
}

export function getMemoryCachedImage(url: string): ImageBitmap | HTMLImageElement | null {
  const key = normalizeImageCacheKey(url);
  if (!key) return null;
  const img = memoryCache.get(key);
  if (img) {
    if ('width' in img && img.width === 0 && (!('naturalWidth' in img) || img.naturalWidth === 0)) {
      memoryCache.delete(key);
      return null;
    }
    memoryCache.delete(key);
    memoryCache.set(key, img);
    return img;
  }
  return null;
}

export function setMemoryCachedImage(url: string, img: ImageBitmap | HTMLImageElement, objectUrl?: string) {
  const key = normalizeImageCacheKey(url);
  if (key) updateMemoryCache(key, img, objectUrl);
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => { dbPromise = null; };
        db.onversionchange = () => {
          try { db.close(); } catch (_) {}
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });
  return dbPromise;
}

function queryIDB(db: IDBDatabase, key: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => {
      const res = req.result;
      if (res instanceof Blob && res.size > 0) resolve(res);
      else if (res instanceof ArrayBuffer && res.byteLength > 0) resolve(new Blob([res], { type: 'image/jpeg' }));
      else resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

async function getBlobFromCacheStorage(key: string): Promise<Blob | null> {
  if (typeof window === 'undefined' || !('caches' in window) || !key) return null;
  try {
    const cache = await window.caches.open(CACHE_STORAGE_NAME);
    const res = await cache.match(toSyntheticCacheUrl(key));
    if (res && res.ok) {
      const blob = await res.blob();
      if (blob && blob.size > 0) {
        verifiedOnDiskKeys.add(key);
        return blob;
      }
    }
  } catch (_e) {}
  return null;
}

async function putBlobToCacheStorage(key: string, blob: Blob): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window) || !key || !blob || blob.size === 0) return false;
  try {
    const cache = await window.caches.open(CACHE_STORAGE_NAME);
    await cache.put(
      toSyntheticCacheUrl(key),
      new Response(blob, {
        headers: {
          'Content-Type': blob.type || 'image/jpeg',
          'Content-Length': String(blob.size),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    );
    verifiedOnDiskKeys.add(key);
    return true;
  } catch (_e) {
    return false;
  }
}

export async function getCachedBlobFromIDB(url: string): Promise<Blob | null> {
  const key = normalizeImageCacheKey(url);
  if (!key) return null;

  const cacheStorageHit = await getBlobFromCacheStorage(key);
  if (cacheStorageHit) return cacheStorageHit;

  try {
    let db = await getDB();
    let blob: Blob | null = null;
    try {
      blob = await queryIDB(db, key);
    } catch (_txErr) {
      dbPromise = null;
      db = await getDB();
      blob = await queryIDB(db, key);
    }
    if (blob && blob.size > 0) {
      verifiedOnDiskKeys.add(key);
      putBlobToCacheStorage(key, blob).catch(() => {});
      return blob;
    }
  } catch (_e) {
    dbPromise = null;
  }
  return null;
}

export async function setCachedBlobToIDB(url: string, blob: Blob): Promise<void> {
  const key = normalizeImageCacheKey(url);
  if (!key || !blob || blob.size === 0) return;

  verifiedOnDiskKeys.add(key);
  const storedInCacheApi = await putBlobToCacheStorage(key, blob);

  // On iOS/iPadOS (IS_CONSTRAINED_DEVICE), if CacheStorage succeeded, skip duplicating the raw Blob into
  // IndexedDB to strictly preserve the 40MB WebKit IndexedDB budget for TakaLocalDB & Firestore cache (Rule 3).
  if (IS_CONSTRAINED_DEVICE && storedInCacheApi) {
    return;
  }

  try {
    let db = await getDB();
    try {
      db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(blob, key);
    } catch (_txErr) {
      dbPromise = null;
      db = await getDB();
      db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(blob, key);
    }
  } catch (_e) {
    dbPromise = null;
  }
}

/**
 * Lightweight background downloader that stores the compressed floorplan binary Blob into
 * CacheStorage + IndexedDB without decoding into RAM or blocking the main UI thread.
 */
export async function fetchAndCacheImageBlob(url: string): Promise<Blob | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null;

  const key = normalizeImageCacheKey(trimmed);
  if (!key) return null;
  if (verifiedOnDiskKeys.has(key)) {
    const hit = await getCachedBlobFromIDB(trimmed);
    if (hit) return hit;
  }

  const existingBlob = await getCachedBlobFromIDB(trimmed);
  if (existingBlob) return existingBlob;

  if (inFlightRequests.has(key)) return inFlightRequests.get(key)!;

  const fetchPromise = (async () => {
    try {
      let blob: Blob | null = null;
      let activeFetchUrl = trimmed;

      // Always resolve r2:// or R2 keys to a fresh presigned URL
      if (
        activeFetchUrl.startsWith('r2://') ||
        (!activeFetchUrl.startsWith('http://') && !activeFetchUrl.startsWith('https://'))
      ) {
        const resolved = await resolveR2UrlToHttp(activeFetchUrl);
        if (resolved) activeFetchUrl = resolved;
      }

      if (!/^https?:\/\//i.test(activeFetchUrl)) return null;

      const isR2StorageUrl = activeFetchUrl.includes('.r2.cloudflarestorage.com');

      // For Cloudflare R2 storage URLs, use the same-origin server proxy first to avoid CORS preflight failures
      if (isR2StorageUrl) {
        const proxyRes = await fetch(`/api/pdf-proxy?url=${encodeURIComponent(activeFetchUrl)}`).catch(() => null);
        if (proxyRes && proxyRes.ok) {
          const candidate = await proxyRes.blob().catch(() => null);
          if (candidate && candidate.size > 0 && !candidate.type.includes('text/html')) {
            blob = candidate;
          }
        }
        // If presigned URL expired, re-sign once and retry proxy
        if (!blob && extractR2Key(trimmed)) {
          const refreshedUrl = await resolveR2UrlToHttp(`r2://${extractR2Key(trimmed)}`);
          if (refreshedUrl && refreshedUrl !== activeFetchUrl) {
            activeFetchUrl = refreshedUrl;
            const retryRes = await fetch(`/api/pdf-proxy?url=${encodeURIComponent(refreshedUrl)}`).catch(() => null);
            if (retryRes && retryRes.ok) {
              const candidate = await retryRes.blob().catch(() => null);
              if (candidate && candidate.size > 0 && !candidate.type.includes('text/html')) {
                blob = candidate;
              }
            }
          }
        }
      }

      // Fallback or non-R2 direct CORS fetch
      if (!blob) {
        const directRes = await fetch(activeFetchUrl, { mode: 'cors' }).catch(() => null);
        if (directRes && directRes.ok) {
          const candidate = await directRes.blob().catch(() => null);
          if (candidate && candidate.size > 0 && !candidate.type.includes('text/html')) {
            blob = candidate;
          }
        }
      }

      // Final proxy fallback for non-R2 URLs if direct CORS failed
      if (!blob && !isR2StorageUrl) {
        const proxyRes = await fetch(`/api/pdf-proxy?url=${encodeURIComponent(activeFetchUrl)}`).catch(() => null);
        if (proxyRes && proxyRes.ok) {
          const candidate = await proxyRes.blob().catch(() => null);
          if (candidate && candidate.size > 0 && !candidate.type.includes('text/html')) {
            blob = candidate;
          }
        }
      }

      if (blob && blob.size > 0) {
        await setCachedBlobToIDB(trimmed, blob);
        return blob;
      }
      return null;
    } catch (_err) {
      return null;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, fetchPromise);
  return fetchPromise;
}

let preloadTimer: any = null;

/**
 * Gently caches floorplan Blobs for the current store in the background after the active
 * floor is already rendered. On iOS, skips bulk preloading to protect the 40MB origin quota.
 */
export function preloadFloorImages(urls: (string | undefined | null)[], excludeUrl?: string | null): void {
  if (typeof window === 'undefined' || IS_CONSTRAINED_DEVICE) return;
  const excludeKey = excludeUrl ? normalizeImageCacheKey(excludeUrl) : '';

  const seenKeys = new Set<string>();
  const targetUrls: string[] = [];

  for (const raw of urls) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) continue;
    const k = normalizeImageCacheKey(trimmed);
    if (!k || k === excludeKey || seenKeys.has(k) || verifiedOnDiskKeys.has(k)) continue;
    seenKeys.add(k);
    targetUrls.push(trimmed);
    if (targetUrls.length >= 4) break;
  }

  if (targetUrls.length === 0) return;

  if (preloadTimer) clearTimeout(preloadTimer);
  preloadTimer = setTimeout(async () => {
    for (const u of targetUrls) {
      try {
        const k = normalizeImageCacheKey(u);
        if (!verifiedOnDiskKeys.has(k)) {
          await fetchAndCacheImageBlob(u);
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch (_e) {}
    }
  }, 1800);
}

export async function clearCadImageCache(): Promise<void> {
  memoryCache.forEach((img, key) => {
    cleanupEvictedEntry(key, img);
  });
  memoryCache.clear();
  memoryObjectUrls.clear();
  verifiedOnDiskKeys.clear();
  if (typeof window !== 'undefined' && 'caches' in window) {
    try { await window.caches.delete(CACHE_STORAGE_NAME); } catch (_e) {}
  }
  try {
    const db = await getDB();
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
  } catch (_e) {}
}
