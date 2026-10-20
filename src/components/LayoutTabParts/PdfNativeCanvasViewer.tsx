import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { TouchPinchZoomStage, TouchPinchZoomStageHandle } from './TouchPinchZoomStage';
import { PdfNativeViewerToolbar } from './PdfNativeViewerToolbar';

export interface PdfNativeCanvasViewerProps {
  url: string;
  isFullscreen?: boolean;
  onOpenFullscreen?: () => void;
  className?: string;
  onFallbackToIframe?: () => void;
}

const MAX_CANVAS_DIMENSION = 2400; // Safe GPU canvas texture cap

export function PdfNativeCanvasViewer({
  url,
  isFullscreen = false,
  onOpenFullscreen,
  className = '',
  onFallbackToIframe,
}: PdfNativeCanvasViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState<string>('1');
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'page' | 'scroll'>('page');

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomStageRef = useRef<TouchPinchZoomStageHandle>(null);
  const renderTaskRef = useRef<any>(null);
  const activePdfRef = useRef<any>(null);
  const loadingTaskRef = useRef<any>(null);

  // In-memory cloned canvas cache to avoid WebKit ImageBitmap memory and blank canvas bugs
  const pageCacheRef = useRef<
    Map<number, { canvas: HTMLCanvasElement; width: number; height: number; cssWidth: number; cssHeight: number }>
  >(new Map());

  const clearPageCache = useCallback(() => {
    pageCacheRef.current.clear();
  }, []);

  // Determine effective PDF source (Google Drive proxy fallback if drive URL)
  const resolveEffectiveUrl = useCallback((inputUrl: string): string => {
    if (!inputUrl) return '';
    const trimmed = inputUrl.trim();
    const driveMatch =
      trimmed.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/i) ||
      trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (driveMatch?.[1]) {
      return `/api/drive-pdf?id=${driveMatch[1]}`;
    }
    return trimmed;
  }, []);

  const effectivePdfUrl = resolveEffectiveUrl(url);

  // Load PDF Document asynchronously
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setLoadingProgress(10);
    setPdfDoc(null);
    setCurrentPage(1);
    setPageInput('1');
    setZoomScale(1);
    clearPageCache();

    if (activePdfRef.current) {
      try {
        activePdfRef.current.cleanup?.();
        activePdfRef.current.destroy?.();
      } catch {}
      activePdfRef.current = null;
    }

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        if (!isMounted) return;

        if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
          try {
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
              'pdfjs-dist/build/pdf.worker.min.mjs',
              import.meta.url
            ).toString();
          } catch {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
          }
        }

        const baseOrigin = typeof window !== 'undefined' ? window.location.origin : '';
        const cMapLocal = `${baseOrigin}/cmaps/`;
        const fontLocal = `${baseOrigin}/standard_fonts/`;

        const getDocConfig = (fetchUrl: string) => ({
          url: fetchUrl,
          cMapUrl: cMapLocal,
          cMapPacked: true,
          standardFontDataUrl: fontLocal,
          disableAutoFetch: false,
          disableStream: true, // Prevents Range-request stream worker freeze on mobile Safari
        });

        let doc: any;
        try {
          const loadingTask = pdfjsLib.getDocument(getDocConfig(effectivePdfUrl));
          loadingTaskRef.current = loadingTask;

          loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
            if (!isMounted) return;
            if (progress.total > 0) {
              const pct = Math.min(99, Math.round((progress.loaded / progress.total) * 100));
              setLoadingProgress(pct);
            } else {
              setLoadingProgress((prev) => Math.min(90, prev + 15));
            }
          };

          doc = await loadingTask.promise;
        } catch (initialErr) {
          // If effectivePdfUrl was a Google Drive proxy and failed, or R2 direct URL failed:
          if (effectivePdfUrl !== url) {
            // Re-throw so user can use embed fallback
            throw initialErr;
          }

          // Fallback for R2 links: try S3 Presigned URL
          const { resolveR2UrlToHttp } = await import('../PictureMapping/lib/r2Upload');
          const presigned = await resolveR2UrlToHttp(url);
          if (presigned && presigned !== url) {
            const fallbackTask = pdfjsLib.getDocument(getDocConfig(presigned));
            loadingTaskRef.current = fallbackTask;
            doc = await fallbackTask.promise;
          } else {
            throw initialErr;
          }
        }

        if (!isMounted) {
          try {
            doc.cleanup?.();
            (doc as any).destroy?.();
          } catch {}
          return;
        }

        activePdfRef.current = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setIsLoading(false);
        setLoadingProgress(100);
      } catch (err) {
        if (!isMounted) return;
        console.warn('Native PDF loading failed:', err);
        setError('Cannot load PDF natively (CORS or permissions).');
        setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy?.();
        } catch {}
        loadingTaskRef.current = null;
      }
      clearPageCache();
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      if (activePdfRef.current) {
        try {
          activePdfRef.current.cleanup?.();
          activePdfRef.current.destroy?.();
        } catch {}
        activePdfRef.current = null;
      }
    };
  }, [url, effectivePdfUrl, clearPageCache]);

  const renderSeqRef = useRef<number>(0);

  // Render Page with true responsive fit-to-screen and white background fill
  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      const seq = ++renderSeqRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;

      // 1. Instant 0ms restore from cloned offscreen canvas cache
      const cached = pageCacheRef.current.get(pageNum);
      if (cached) {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
          renderTaskRef.current = null;
        }
        canvas.width = cached.width;
        canvas.height = cached.height;
        canvas.style.width = `${cached.cssWidth}px`;
        canvas.style.height = `${cached.cssHeight}px`;

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, cached.width, cached.height);
        context.drawImage(cached.canvas, 0, 0);
        setIsRendering(false);
        return;
      }

      if (renderTaskRef.current) {
        const prevTask = renderTaskRef.current;
        renderTaskRef.current = null;
        try {
          prevTask.cancel();
          await prevTask.promise;
        } catch {}
      }

      if (seq !== renderSeqRef.current || !canvasRef.current) return;

      setIsRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (seq !== renderSeqRef.current || !canvasRef.current) return;

        // Container bounds (with safety fallbacks for initial mount on mobile)
        const availWidth = Math.max(260, (containerRef.current?.clientWidth || window.innerWidth) - 24);
        const availHeight = Math.max(260, (containerRef.current?.clientHeight || window.innerHeight) - 80);

        const unscaledViewport = page.getViewport({ scale: 1 });

        // TRUE fit-to-screen scale without artificial Math.max(0.6) clamp!
        // This ensures entire CAD blueprints / signages fit inside mobile screen without showing empty margins!
        const scaleX = availWidth / Math.max(1, unscaledViewport.width);
        const scaleY = availHeight / Math.max(1, unscaledViewport.height);
        const fitScale = Math.min(scaleX, scaleY, 2.5);

        const viewport = page.getViewport({ scale: fitScale });

        // Device pixel ratio with safe mobile WebKit GPU texture cap
        const rawDpr = Math.min(window.devicePixelRatio || 1, 2);
        const maxDprByDimension = MAX_CANVAS_DIMENSION / Math.max(viewport.width, viewport.height, 1);
        const dpr = Math.max(1, Math.min(rawDpr, maxDprByDimension));

        const pixelWidth = Math.max(1, Math.floor(viewport.width * dpr));
        const pixelHeight = Math.max(1, Math.floor(viewport.height * dpr));
        const cssWidth = Math.max(1, Math.floor(viewport.width));
        const cssHeight = Math.max(1, Math.floor(viewport.height));

        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        // CRITICAL: Fill canvas with solid white before rendering vector drawings!
        // Architectural CAD drawings have transparent backgrounds and dark lines.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pixelWidth, pixelHeight);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
        const renderTask = page.render({
          canvasContext: context,
          transform,
          viewport,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        // Cache rendered page into a lightweight offscreen canvas
        if (seq === renderSeqRef.current && canvas.width > 0 && canvas.height > 0) {
          try {
            if (pageCacheRef.current.size >= 8) {
              const oldestKey = pageCacheRef.current.keys().next().value;
              if (oldestKey !== undefined) pageCacheRef.current.delete(oldestKey);
            }
            const offscreen = document.createElement('canvas');
            offscreen.width = pixelWidth;
            offscreen.height = pixelHeight;
            const offCtx = offscreen.getContext('2d');
            if (offCtx) {
              offCtx.drawImage(canvas, 0, 0);
              pageCacheRef.current.set(pageNum, {
                canvas: offscreen,
                width: pixelWidth,
                height: pixelHeight,
                cssWidth,
                cssHeight,
              });
            }
          } catch {}
        }

        page.cleanup?.();
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
        }
      } finally {
        if (seq === renderSeqRef.current) {
          setIsRendering(false);
        }
      }
    },
    [pdfDoc]
  );

  useEffect(() => {
    if (pdfDoc && currentPage >= 1 && currentPage <= numPages) {
      zoomStageRef.current?.resetTransform();
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, numPages, renderPage]);

  // ResizeObserver to re-fit page cleanly when container size settles or orientation changes
  useEffect(() => {
    if (!containerRef.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pdfDoc && currentPage) {
          renderPage(currentPage);
        }
      }, 150);
    });
    observer.observe(containerRef.current);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [pdfDoc, currentPage, renderPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= numPages) {
      setCurrentPage(newPage);
      setPageInput(String(newPage));
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= numPages) {
      setCurrentPage(parsed);
    } else {
      setPageInput(String(currentPage));
    }
  };

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-slate-200 text-center bg-slate-900 rounded-xl">
        <AlertCircle className="w-10 h-10 text-amber-400 mb-3 shrink-0" />
        <p className="text-base font-semibold text-slate-100">Cannot load PDF directly in canvas</p>
        <p className="text-xs text-slate-400 mt-1 max-w-md">
          The document server prevents direct binary access. You can use embedded mode or open in a new window.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onFallbackToIframe && (
            <button
              type="button"
              onClick={onFallbackToIframe}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Switch to Embed Viewer
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open File in New Tab
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none ${className}`}
    >
      {/* Unified Toolbar for both R2 Cloud and Google Drive */}
      <PdfNativeViewerToolbar
        currentPage={currentPage}
        numPages={numPages}
        pageInput={pageInput}
        onPageInputChange={setPageInput}
        onPageInputSubmit={handlePageInputSubmit}
        onPageChange={handlePageChange}
        isLoading={isLoading}
        zoomScale={zoomScale}
        onZoomIn={() => zoomStageRef.current?.zoomIn(0.4)}
        onZoomOut={() => zoomStageRef.current?.zoomOut(0.4)}
        onResetZoom={() => zoomStageRef.current?.resetTransform()}
        isFullscreen={isFullscreen}
        onOpenFullscreen={onOpenFullscreen}
        url={url}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode((m) => (m === 'page' ? 'scroll' : 'page'))}
      />

      {/* Main Canvas Viewport with 60fps Gesture Pinch-to-Zoom & Pan */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-950 flex items-center justify-center p-1 sm:p-2">
        {isLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 text-slate-300">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
            <p className="text-xs font-semibold tracking-wide">
              Loading PDF Document ({loadingProgress}%)...
            </p>
            <div className="w-48 h-1.5 bg-slate-800 rounded-full mt-2.5 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-150"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        )}

        <TouchPinchZoomStage
          ref={zoomStageRef}
          initialScale={1}
          minScale={0.5}
          maxScale={10}
          onScaleChange={setZoomScale}
          className="w-full h-full flex items-center justify-center"
        >
          <div className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-white inline-block">
            <canvas ref={canvasRef} className="block select-none" />
            {isRendering && (
              <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-900/90 text-indigo-400 rounded text-[10px] font-mono flex items-center gap-1 border border-slate-700 pointer-events-none">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Rendering...</span>
              </div>
            )}
          </div>
        </TouchPinchZoomStage>
      </div>
    </div>
  );
}

export default PdfNativeCanvasViewer;
