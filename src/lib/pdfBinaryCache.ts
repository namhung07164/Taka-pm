/**
 * Unified PDF Binary & Persistent Thumbnail Cache Engine
 * - Normalizes all PDF sources (Cloudflare R2, r2://, Google Drive, Firebase Storage, HTTP)
 * - Shares downloaded PDF binaries between Tooltip Thumbnails and the Full PDF Viewer (0ms open)
 * - Persists both page thumbnails AND recent PDF binaries in IndexedDB (respecting iOS 40MB cap)
 * - Always clones (.slice(0)) before passing to PDF.js Worker so ArrayBuffer transfer never detaches cache
 */

const memoryBinaryCache = new Map<string, Uint8Array>();
const inFlightBinaryMap = new Map<string, Promise<Uint8Array | null>>();
const memoryThumbCache = new Map<string, string>();

const MAX_BINARY_CACHE_ENTRIES = 15;
const MAX_IDB_BINARY_BYTES = 12 * 1024 * 1024; // Max 12MB per PDF in IDB to respect iOS 40MB limit
const MAX_THUMB_MEMORY_ENTRIES = 300;
const IDB_NAME = 'TakaPdfThumbCacheDB';
const IDB_VERSION = 2;
const IDB_STORE = 'pageThumbs';
const IDB_BINARY_STORE = 'pdfBinaries';

export function normalizePdfSourceUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('r2://')) {
    return `https://hcm.taka-pm.org/${trimmed.replace('r2://', '')}`;
  }
  if (trimmed.includes('dropbox.com') && !trimmed.includes('raw=1')) {
    return trimmed.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
  }
  return trimmed;
}

export function extractDriveIdFromUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  const driveMatch =
    trimmed.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|thumbnail\?id=)([a-zA-Z0-9_-]+)/i) ||
    trimmed.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i) ||
    trimmed.match(/\/api\/drive-(?:pdf|thumb)\?id=([a-zA-Z0-9_-]+)/i) ||
    (trimmed.includes('drive.google.com') && trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i));
  return driveMatch?.[1] || null;
}

export function canonicalizePdfKey(rawUrl: string): string {
  if (!rawUrl) return '';
  const driveId = extractDriveIdFromUrl(rawUrl);
  if (driveId) {
    return `gdrive:${driveId}`;
  }
  const normalized = normalizePdfSourceUrl(rawUrl);
  try {
    const u = new URL(normalized, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (
      u.searchParams.has('X-Amz-Signature') ||
      u.searchParams.has('x-amz-signature') ||
      u.searchParams.has('token')
    ) {
      return `${u.origin}${u.pathname}`;
    }
  } catch {}
  return normalized.split('#')[0];
}

let idbPromise: Promise<IDBDatabase | null> | null = null;

function openThumbIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (idbPromise) return idbPromise;

  idbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
        if (!db.objectStoreNames.contains(IDB_BINARY_STORE)) {
          db.createObjectStore(IDB_BINARY_STORE);
        }
      };
      req.onblocked = () => {
        idbPromise = null;
        resolve(null);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => { idbPromise = null; };
        db.onversionchange = () => {
          try { db.close(); } catch {}
          idbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        idbPromise = null;
        resolve(null);
      };
      // Timeout guard: never hang indefinitely if IDB open is blocked or slow
      setTimeout(() => {
        if (idbPromise) {
          resolve(null);
        }
      }, 500);
    } catch {
      idbPromise = null;
      resolve(null);
    }
  });

  return idbPromise;
}

export function getCachedPageThumbSync(rawUrl: string | undefined | null, pageNum = 1): string | null {
  if (!rawUrl) return null;
  const key = `${canonicalizePdfKey(rawUrl)}#p${pageNum}`;
  return memoryThumbCache.get(key) || null;
}

export async function getCachedPageThumbAsync(rawUrl: string | undefined | null, pageNum = 1): Promise<string | null> {
  if (!rawUrl) return null;
  const syncHit = getCachedPageThumbSync(rawUrl, pageNum);
  if (syncHit) return syncHit;

  const key = `${canonicalizePdfKey(rawUrl)}#p${pageNum}`;
  const db = await openThumbIdb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const val = typeof req.result === 'string' ? req.result : null;
        if (val) {
          memoryThumbCache.set(key, val);
        }
        resolve(val);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function setCachedPageThumb(rawUrl: string, pageNum: number, dataUrl: string): void {
  if (!rawUrl || !dataUrl) return;
  const key = `${canonicalizePdfKey(rawUrl)}#p${pageNum}`;
  if (memoryThumbCache.size >= MAX_THUMB_MEMORY_ENTRIES) {
    const oldest = memoryThumbCache.keys().next().value;
    if (oldest) memoryThumbCache.delete(oldest);
  }
  memoryThumbCache.set(key, dataUrl);

  setTimeout(async () => {
    const db = await openThumbIdb();
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(dataUrl, key);
    } catch {}
  }, 0);
}

async function getIdbPdfBinary(key: string): Promise<Uint8Array | null> {
  const db = await openThumbIdb();
  if (!db || !db.objectStoreNames.contains(IDB_BINARY_STORE)) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_BINARY_STORE, 'readonly');
      const req = tx.objectStore(IDB_BINARY_STORE).get(key);
      req.onsuccess = () => {
        const res = req.result;
        if (res instanceof Uint8Array && res.byteLength > 64) {
          resolve(res);
        } else if (res instanceof ArrayBuffer && res.byteLength > 64) {
          resolve(new Uint8Array(res));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function storePdfBinary(key: string, data: Uint8Array): void {
  if (data.byteLength > 30 * 1024 * 1024) return;
  if (memoryBinaryCache.size >= MAX_BINARY_CACHE_ENTRIES) {
    const oldest = memoryBinaryCache.keys().next().value;
    if (oldest) memoryBinaryCache.delete(oldest);
  }
  const copy = data.slice(0);
  memoryBinaryCache.set(key, copy);

  if (copy.byteLength <= MAX_IDB_BINARY_BYTES) {
    setTimeout(async () => {
      const db = await openThumbIdb();
      if (!db || !db.objectStoreNames.contains(IDB_BINARY_STORE)) return;
      try {
        const tx = db.transaction(IDB_BINARY_STORE, 'readwrite');
        tx.objectStore(IDB_BINARY_STORE).put(copy, key);
      } catch {}
    }, 0);
  }
}

export function hasCachedPdfBinary(rawUrl: string): boolean {
  const key = canonicalizePdfKey(rawUrl);
  const hit = memoryBinaryCache.get(key);
  return Boolean(hit && hit.byteLength > 0);
}

function isValidPdfBytes(bytes: Uint8Array): boolean {
  if (!bytes || bytes.byteLength < 64) return false;
  // Check within first 1024 bytes for %PDF- header (some servers prepend BOM/whitespace)
  const scanLimit = Math.min(bytes.byteLength - 4, 1024);
  for (let i = 0; i <= scanLimit; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 // F
    ) {
      return true;
    }
  }
  return false;
}

export async function fetchPdfBinaryUnified(
  rawUrl: string,
  onProgress?: (pct: number) => void
): Promise<Uint8Array | null> {
  if (!rawUrl) return null;
  const key = canonicalizePdfKey(rawUrl);

  // 1. Synchronous 0ms RAM Cache Hit
  const cached = memoryBinaryCache.get(key);
  if (cached && cached.byteLength > 0) {
    onProgress?.(100);
    return cached.slice(0);
  }

  // 2. Deduplicate concurrent downloads for the same PDF
  const existingPromise = inFlightBinaryMap.get(key);
  if (existingPromise) {
    const res = await existingPromise;
    if (res && res.byteLength > 0) {
      onProgress?.(100);
      return res.slice(0);
    }
    return null;
  }

  const downloadPromise = (async (): Promise<Uint8Array | null> => {
    try {
      // 3. Check Persistent IndexedDB Binary Cache (~5ms, zero network traffic)
      const idbHit = await getIdbPdfBinary(key);
      if (idbHit && isValidPdfBytes(idbHit)) {
        memoryBinaryCache.set(key, idbHit.slice(0));
        onProgress?.(100);
        return idbHit;
      }

      const normalizedUrl = normalizePdfSourceUrl(rawUrl);
      const driveId = extractDriveIdFromUrl(rawUrl);

      const candidateUrls: string[] = [];
      if (driveId) {
        candidateUrls.push(`/api/drive-pdf?id=${driveId}`);
      } else if (/^https?:\/\//i.test(normalizedUrl)) {
        const isCrossOriginR2OrExternal =
          typeof window !== 'undefined' && !normalizedUrl.startsWith(window.location.origin);
        if (isCrossOriginR2OrExternal) {
          // Prioritize server-side proxy for R2/external URLs to completely avoid CORS blocks on iOS & Desktop
          candidateUrls.push(`/api/pdf-proxy?url=${encodeURIComponent(normalizedUrl)}`);
          candidateUrls.push(normalizedUrl);
        } else {
          candidateUrls.push(normalizedUrl);
        }
      } else {
        candidateUrls.push(normalizedUrl);
      }

      // 4. Try candidate URLs in priority order
      for (const candidate of candidateUrls) {
        try {
          onProgress?.(30);
          const res = await fetch(candidate);
          if (res.ok) {
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (!ct.includes('text/html')) {
              const buf = await res.arrayBuffer();
              const bytes = new Uint8Array(buf);
              if (isValidPdfBytes(bytes)) {
                storePdfBinary(key, bytes);
                onProgress?.(90);
                return bytes;
              }
            }
          }
        } catch {}
      }

      // 5. Fallback for R2 private/signed links: resolve fresh presigned S3 URL + proxy
      if (!driveId) {
        try {
          onProgress?.(55);
          const { resolveR2UrlToHttp } = await import('../components/PictureMapping/lib/r2Upload');
          const presigned = await resolveR2UrlToHttp(rawUrl.trim());
          if (presigned) {
            const tryUrls = [
              `/api/pdf-proxy?url=${encodeURIComponent(presigned)}`,
              presigned,
            ];
            for (const u of tryUrls) {
              try {
                const res = await fetch(u);
                if (res.ok) {
                  const bytes = new Uint8Array(await res.arrayBuffer());
                  if (isValidPdfBytes(bytes)) {
                    storePdfBinary(key, bytes);
                    onProgress?.(90);
                    return bytes;
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }

      return null;
    } finally {
      inFlightBinaryMap.delete(key);
    }
  })();

  inFlightBinaryMap.set(key, downloadPromise);
  const result = await downloadPromise;
  return result && result.byteLength > 0 ? result.slice(0) : null;
}

export async function renderPdfPageToThumbDataUrl(
  pdfDoc: any,
  pageNum: number,
  maxDimension = 280
): Promise<string | null> {
  if (!pdfDoc) return null;
  let page: any = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    page = await pdfDoc.getPage(pageNum);
    const unscaled = page.getViewport({ scale: 1 });
    const maxSide = Math.max(unscaled.width, unscaled.height, 1);
    const scale = Math.min(1.5, Math.max(0.2, maxDimension / maxSide));
    const viewport = page.getViewport({ scale });

    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';

    await page.render({ canvasContext: ctx, viewport }).promise;

    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/webp', 0.76);
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.78);
      }
    } catch {
      dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    }
    return dataUrl && dataUrl.length > 64 ? dataUrl : null;
  } catch {
    return null;
  } finally {
    try {
      page?.cleanup?.();
    } catch {}
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export interface PdfCanvasCacheEntry {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
}

export async function renderPdfPageToCanvasEntry(params: {
  pdfDoc: any;
  pageNum: number;
  availWidth: number;
  availHeight: number;
  maxDimension: number;
  url: string;
  onRenderTask?: (task: any) => void;
}): Promise<PdfCanvasCacheEntry | null> {
  const { pdfDoc, pageNum, availWidth, availHeight, maxDimension, url, onRenderTask } = params;
  if (!pdfDoc) return null;
  const page = await pdfDoc.getPage(pageNum);
  const unscaled = page.getViewport({ scale: 1 });
  const fitScale = Math.min(availWidth / Math.max(1, unscaled.width), availHeight / Math.max(1, unscaled.height), 2.5);
  const rawDpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxDpr = maxDimension / Math.max(unscaled.width * fitScale, unscaled.height * fitScale, 1);
  const dpr = Math.max(1, Math.min(rawDpr, maxDpr));

  const viewport = page.getViewport({ scale: fitScale * dpr });
  const pixelWidth = Math.max(1, Math.floor(viewport.width));
  const pixelHeight = Math.max(1, Math.floor(viewport.height));
  const cssWidth = Math.max(1, Math.floor(viewport.width / dpr));
  const cssHeight = Math.max(1, Math.floor(viewport.height / dpr));

  const offscreen = document.createElement('canvas');
  offscreen.width = pixelWidth;
  offscreen.height = pixelHeight;
  const offCtx = offscreen.getContext('2d', { alpha: false });
  if (!offCtx) {
    page.cleanup?.();
    return null;
  }

  offCtx.fillStyle = '#ffffff';
  offCtx.fillRect(0, 0, pixelWidth, pixelHeight);
  offCtx.imageSmoothingEnabled = true;
  offCtx.imageSmoothingQuality = 'high';

  const task = page.render({ canvasContext: offCtx, viewport });
  onRenderTask?.(task);
  await task.promise;
  page.cleanup?.();

  if (!getCachedPageThumbSync(url, pageNum)) {
    setTimeout(() => {
      try {
        const thumbCanvas = document.createElement('canvas');
        const ratio = Math.min(1, 260 / Math.max(pixelWidth, pixelHeight, 1));
        thumbCanvas.width = Math.max(1, Math.round(pixelWidth * ratio));
        thumbCanvas.height = Math.max(1, Math.round(pixelHeight * ratio));
        const tCtx = thumbCanvas.getContext('2d', { alpha: false });
        if (tCtx) {
          tCtx.fillStyle = '#ffffff';
          tCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
          tCtx.drawImage(offscreen, 0, 0, thumbCanvas.width, thumbCanvas.height);
          const dataUrl = thumbCanvas.toDataURL('image/webp', 0.75);
          if (dataUrl && dataUrl.length > 64) setCachedPageThumb(url, pageNum, dataUrl);
        }
      } catch {}
    }, 20);
  }

  return { canvas: offscreen, width: pixelWidth, height: pixelHeight, cssWidth, cssHeight };
}

