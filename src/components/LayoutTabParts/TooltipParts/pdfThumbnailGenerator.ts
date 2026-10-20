import {
  fetchPdfBinaryUnified,
  getCachedPageThumbSync,
  getCachedPageThumbAsync,
  setCachedPageThumb,
  renderPdfPageToThumbDataUrl,
  canonicalizePdfKey,
} from '../../../lib/pdfBinaryCache';

const inFlightRequests = new Map<string, Promise<string | null>>();
const THUMBNAIL_MAX_DIMENSION = 640;

export function getCachedPdfThumbnail(rawUrl: string | undefined | null): string | null {
  return getCachedPageThumbSync(rawUrl, 1);
}

/**
 * Renders Page 1 of ANY PDF URL (R2 Cloud, Google Drive, Firebase Storage, HTTP)
 * into a lightweight, crisp WebP/JPEG data URL and persists it in both RAM and IndexedDB.
 * Also caches the PDF binary in memory so opening the full PDF viewer afterwards takes 0ms!
 */
export async function generatePdfFirstPageThumbnail(rawUrl: string): Promise<string | null> {
  if (!rawUrl || typeof window === 'undefined') return null;

  const key = canonicalizePdfKey(rawUrl);
  if (!key) return null;

  // 1. Check synchronous RAM cache first (0ms)
  const syncCached = getCachedPageThumbSync(rawUrl, 1);
  if (syncCached) return syncCached;

  // 2. Check persistent IndexedDB cache (< 2ms, zero network download)
  const idbCached = await getCachedPageThumbAsync(rawUrl, 1);
  if (idbCached) {
    // Warm up binary cache in background so clicking to open full PDF is instant
    setTimeout(() => {
      fetchPdfBinaryUnified(rawUrl).catch(() => {});
    }, 50);
    return idbCached;
  }

  const existingPromise = inFlightRequests.get(key);
  if (existingPromise) return existingPromise;

  const taskPromise = (async (): Promise<string | null> => {
    let loadingTask: any = null;
    let pdfDoc: any = null;

    try {
      const [pdfjsLib, binaryData] = await Promise.all([
        import('pdfjs-dist'),
        fetchPdfBinaryUnified(rawUrl),
      ]);

      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      }

      const baseOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const docConfig: any = {
        cMapUrl: `${baseOrigin}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${baseOrigin}/standard_fonts/`,
        disableAutoFetch: false,
        disableStream: true,
      };

      if (binaryData) {
        docConfig.data = binaryData;
      } else {
        docConfig.url = rawUrl.trim();
      }

      loadingTask = pdfjsLib.getDocument(docConfig);
      pdfDoc = await loadingTask.promise;
      if (!pdfDoc) return null;

      const dataUrl = await renderPdfPageToThumbDataUrl(pdfDoc, 1, THUMBNAIL_MAX_DIMENSION);
      if (dataUrl) {
        setCachedPageThumb(rawUrl, 1, dataUrl);
        return dataUrl;
      }
      return null;
    } catch (err) {
      console.warn('[PDF Thumbnail] Could not generate thumbnail for PDF URL:', rawUrl, err);
      return null;
    } finally {
      try {
        pdfDoc?.cleanup?.();
        pdfDoc?.destroy?.();
      } catch {}
      try {
        loadingTask?.destroy?.();
      } catch {}
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, taskPromise);
  return taskPromise;
}

export default generatePdfFirstPageThumbnail;
