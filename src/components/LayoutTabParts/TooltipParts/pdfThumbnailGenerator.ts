import { normalizeImageUrl } from '../LayoutUnitLightboxModal';

/**
 * In-memory LRU cache mapping normalized PDF URLs to lightweight WebP/JPEG data URLs of Page 1.
 * Ensures 0ms instant thumbnail display on subsequent opens without re-fetching or re-decoding the PDF.
 */
const pdfThumbnailCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string | null>>();

const MAX_CACHE_ENTRIES = 120;
const THUMBNAIL_MAX_DIMENSION = 680;

export function getCachedPdfThumbnail(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  const normalized = normalizeImageUrl(rawUrl, 'w600');
  return pdfThumbnailCache.get(normalized) || pdfThumbnailCache.get(rawUrl) || null;
}

function setCachedPdfThumbnail(key: string, dataUrl: string): void {
  if (pdfThumbnailCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = pdfThumbnailCache.keys().next().value;
    if (oldestKey) pdfThumbnailCache.delete(oldestKey);
  }
  pdfThumbnailCache.set(key, dataUrl);
}

/**
 * Renders Page 1 of a PDF URL (including Cloudflare R2 https://hcm.taka-pm.org/... links)
 * into a lightweight, crisp WebP/JPEG data URL for instant thumbnail preview inside Quick Image.
 */
export async function generatePdfFirstPageThumbnail(rawUrl: string): Promise<string | null> {
  if (!rawUrl || typeof window === 'undefined') return null;

  const url = normalizeImageUrl(rawUrl, 'w600') || rawUrl.trim();
  if (!url) return null;

  const cached = pdfThumbnailCache.get(url);
  if (cached) return cached;

  const existingPromise = inFlightRequests.get(url);
  if (existingPromise) return existingPromise;

  const taskPromise = (async (): Promise<string | null> => {
    let loadingTask: any = null;
    let pdfDoc: any = null;
    let page: any = null;
    let canvas: HTMLCanvasElement | null = null;

    try {
      const pdfjsLib = await import('pdfjs-dist');

      if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();
        } catch {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
        }
      }

      try {
        loadingTask = pdfjsLib.getDocument({
          url,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/cmaps/`,
          cMapPacked: true,
          disableAutoFetch: true,
          disableStream: false,
        });
        pdfDoc = await loadingTask.promise;
      } catch (directErr) {
        // Fallback for R2 links if direct URL fetch fails: try fetching object via S3 presigned URL
        try {
          const { resolveR2UrlToHttp } = await import('../../PictureMapping/lib/r2Upload');
          const presignedUrl = await resolveR2UrlToHttp(url);
          if (presignedUrl && presignedUrl !== url) {
            loadingTask = pdfjsLib.getDocument({
              url: presignedUrl,
              cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/cmaps/`,
              cMapPacked: true,
              disableAutoFetch: true,
              disableStream: false,
            });
            pdfDoc = await loadingTask.promise;
          } else {
            throw directErr;
          }
        } catch {
          throw directErr;
        }
      }

      if (!pdfDoc) return null;

      page = await pdfDoc.getPage(1);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const maxSide = Math.max(unscaledViewport.width, unscaledViewport.height, 1);
      const scale = Math.min(2.0, Math.max(0.4, THUMBNAIL_MAX_DIMENSION / maxSide));
      const viewport = page.getViewport({ scale });

      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return null;

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      let dataUrl = '';
      try {
        dataUrl = canvas.toDataURL('image/webp', 0.84);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        }
      } catch {
        dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      }

      if (dataUrl && dataUrl.length > 64) {
        setCachedPdfThumbnail(url, dataUrl);
        if (rawUrl !== url) {
          setCachedPdfThumbnail(rawUrl, dataUrl);
        }
        return dataUrl;
      }
      return null;
    } catch (err) {
      console.warn('[PDF Thumbnail] Could not generate thumbnail for PDF URL:', url, err);
      return null;
    } finally {
      try {
        page?.cleanup?.();
      } catch {}
      try {
        pdfDoc?.cleanup?.();
        pdfDoc?.destroy?.();
      } catch {}
      try {
        loadingTask?.destroy?.();
      } catch {}
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, taskPromise);
  return taskPromise;
}
