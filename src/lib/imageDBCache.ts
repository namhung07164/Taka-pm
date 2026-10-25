import {
  extractR2Key,
  resolveR2UrlToHttp,
  getStoredR2CredentialsAsync,
  getS3Sdk,
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

const MAX_MEMORY_CACHE = IS_CONSTRAINED_DEVICE ? 8 : 24;

const memoryCache = new Map<string, ImageBitmap | HTMLImageElement>();
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

function updateMemoryCache(cacheKey: string, img: ImageBitmap | HTMLImageElement) {
  if (!cacheKey) return;
  if (memoryCache.has(cacheKey)) {
    const prev = memoryCache.get(cacheKey);
    memoryCache.delete(cacheKey);
    if (prev && prev !== img && 'close' in prev && typeof (prev as ImageBitmap).close === 'function') {
      try { (prev as ImageBitmap).close(); } catch (_) {}
    }
  } else if (memoryCache.size >= MAX_MEMORY_CACHE) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) {
      const evicted = memoryCache.get(firstKey);
      memoryCache.delete(firstKey);
      if (evicted && evicted !== img && 'close' in evicted && typeof (evicted as ImageBitmap).close === 'function') {
        try { (evicted as ImageBitmap).close(); } catch (_) {}
      }
    }
  }
  memoryCache.set(cacheKey, img);
}

export function getMemoryCachedImage(url: string): ImageBitmap | HTMLImageElement | null {
  const key = normalizeImageCacheKey(url);
  if (!key) return null;
  const img = memoryCache.get(key);
  if (img) {
    if ('width' in img && img.width === 0) {
      memoryCache.delete(key);
      return null;
    }
    memoryCache.delete(key);
    memoryCache.set(key, img);
    return img;
  }
  return null;
}

export function setMemoryCachedImage(url: string, img: ImageBitmap | HTMLImageElement) {
  const key = normalizeImageCacheKey(url);
  if (key) updateMemoryCache(key, img);
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

async function putBlobToCacheStorage(key: string, blob: Blob): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window) || !key || !blob || blob.size === 0) return;
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
  } catch (_e) {}
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
  putBlobToCacheStorage(key, blob).catch(() => {});

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

async function fetchR2BlobViaSdk(rawUrlOrKey: string): Promise<Blob | null> {
  const r2Key = extractR2Key(rawUrlOrKey);
  if (!r2Key) return null;
  try {
    const creds = await getStoredR2CredentialsAsync();
    if (!creds?.accountId || !creds?.accessKeyId || !creds?.secretAccessKey || !creds?.bucketName) return null;
    const { S3Client, GetObjectCommand } = await getS3Sdk();
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${creds.accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: creds.accessKeyId.trim(), secretAccessKey: creds.secretAccessKey.trim() },
    });
    const res = await s3.send(new GetObjectCommand({ Bucket: creds.bucketName.trim(), Key: r2Key }));
    if (res.Body) {
      const bytes = await (res.Body as any).transformToByteArray();
      if (bytes && bytes.byteLength > 0) {
        const mime = res.ContentType || (r2Key.toLowerCase().endsWith('.png') ? 'image/png' : r2Key.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg');
        return new Blob([bytes], { type: mime });
      }
    }
  } catch (_e) {}
  return null;
}

export async function fetchAndCacheImageBlob(
  url: string,
  options?: { decodeToMemory?: boolean }
): Promise<Blob | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;

  const key = normalizeImageCacheKey(trimmed);
  if (!key) return null;
  const shouldDecode = options?.decodeToMemory ?? !IS_CONSTRAINED_DEVICE;

  const existingBlob = await getCachedBlobFromIDB(trimmed);
  if (existingBlob) {
    if (shouldDecode && !getMemoryCachedImage(trimmed) && typeof createImageBitmap === 'function') {
      createImageBitmap(existingBlob).then((bmp) => setMemoryCachedImage(trimmed, bmp)).catch(() => {});
    }
    return existingBlob;
  }

  if (inFlightRequests.has(key)) return inFlightRequests.get(key)!;

  const fetchPromise = (async () => {
    try {
      let blob: Blob | null = null;
      let activeFetchUrl = trimmed;

      if (
        activeFetchUrl.startsWith('r2://') ||
        (!activeFetchUrl.startsWith('http://') && !activeFetchUrl.startsWith('https://') && !activeFetchUrl.startsWith('blob:') && !activeFetchUrl.startsWith('data:'))
      ) {
        const resolved = await resolveR2UrlToHttp(activeFetchUrl);
        if (resolved) activeFetchUrl = resolved;
      }

      if (activeFetchUrl.startsWith('http://') || activeFetchUrl.startsWith('https://') || activeFetchUrl.startsWith('blob:')) {
        let res = await fetch(activeFetchUrl, { mode: 'cors' }).catch(() => null);
        if ((!res || !res.ok) && extractR2Key(trimmed)) {
          const refreshedUrl = await resolveR2UrlToHttp(trimmed);
          if (refreshedUrl && refreshedUrl !== activeFetchUrl) {
            activeFetchUrl = refreshedUrl;
            res = await fetch(refreshedUrl, { mode: 'cors' }).catch(() => null);
          }
        }
        if (res && res.ok) {
          const candidate = await res.blob().catch(() => null);
          if (candidate && candidate.size > 0 && !candidate.type.includes('text/html')) blob = candidate;
        }
      }

      if (!blob && extractR2Key(trimmed)) blob = await fetchR2BlobViaSdk(trimmed);

      if (!blob && /^https?:\/\//i.test(activeFetchUrl)) {
        const res = await fetch(`/api/pdf-proxy?url=${encodeURIComponent(activeFetchUrl)}`).catch(() => null);
        if (res && res.ok) {
          const candidate = await res.blob().catch(() => null);
          if (candidate && candidate.size > 0 && !candidate.type.includes('text/html')) blob = candidate;
        }
      }

      if (blob && blob.size > 0) {
        await setCachedBlobToIDB(trimmed, blob);
        if (shouldDecode && !getMemoryCachedImage(trimmed) && typeof createImageBitmap === 'function') {
          createImageBitmap(blob).then((bmp) => setMemoryCachedImage(trimmed, bmp)).catch(() => {});
        }
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

export function persistHtmlImageElementToDisk(url: string, img: HTMLImageElement): void {
  const key = normalizeImageCacheKey(url);
  if (!key || verifiedOnDiskKeys.has(key) || !img?.naturalWidth || !img?.naturalHeight) return;

  setTimeout(() => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) setCachedBlobToIDB(url, blob).catch(() => {});
          canvas.width = 0;
          canvas.height = 0;
        },
        'image/jpeg',
        0.92
      );
    } catch (_e) {}
  }, 50);
}

export function preloadFloorImages(urls: (string | undefined | null)[], priorityUrl?: string | null): void {
  if (typeof window === 'undefined') return;
  const validUrls = Array.from(
    new Set(urls.filter((u): u is string => !!u && typeof u === 'string' && u.trim().length > 0 && !u.trim().startsWith('data:')))
  );
  if (validUrls.length === 0) return;

  const priorityKey = priorityUrl ? normalizeImageCacheKey(priorityUrl) : '';
  if (priorityKey) {
    validUrls.sort((a, b) => {
      const ka = normalizeImageCacheKey(a);
      const kb = normalizeImageCacheKey(b);
      return ka === priorityKey ? -1 : kb === priorityKey ? 1 : 0;
    });
  }

  if (priorityKey && validUrls.length > 0 && normalizeImageCacheKey(validUrls[0]) === priorityKey) {
    const firstUrl = validUrls.shift()!;
    fetchAndCacheImageBlob(firstUrl, { decodeToMemory: true }).catch(() => {});
  }
  if (validUrls.length === 0) return;

  const runPreload = async () => {
    for (const url of validUrls) {
      try {
        if (normalizeImageCacheKey(url)) {
          await fetchAndCacheImageBlob(url, { decodeToMemory: !IS_CONSTRAINED_DEVICE });
        }
      } catch (_e) {}
    }
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => runPreload(), { timeout: 2000 });
  } else {
    setTimeout(runPreload, 120);
  }
}

export async function clearCadImageCache(): Promise<void> {
  memoryCache.forEach((img) => {
    if (img && 'close' in img && typeof (img as ImageBitmap).close === 'function') {
      try { (img as ImageBitmap).close(); } catch (_) {}
    }
  });
  memoryCache.clear();
  verifiedOnDiskKeys.clear();
  if (typeof window !== 'undefined' && 'caches' in window) {
    try { await window.caches.delete(CACHE_STORAGE_NAME); } catch (_e) {}
  }
  try {
    const db = await getDB();
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
  } catch (_e) {}
}
