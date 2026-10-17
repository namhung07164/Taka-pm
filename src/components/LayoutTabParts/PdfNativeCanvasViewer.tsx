import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  ExternalLink,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  TouchPinchZoomStage,
  TouchPinchZoomStageHandle,
} from './TouchPinchZoomStage';

export interface PdfNativeCanvasViewerProps {
  url: string;
  isFullscreen?: boolean;
  onOpenFullscreen?: () => void;
  className?: string;
  onFallbackToIframe?: () => void;
}

const MAX_CANVAS_DIMENSION = 2048; // Safe iOS WebKit GPU canvas texture cap

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

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomStageRef = useRef<TouchPinchZoomStageHandle>(null);
  const renderTaskRef = useRef<any>(null);
  const activePdfRef = useRef<any>(null);
  const loadingTaskRef = useRef<any>(null);
  const pageBitmapCacheRef = useRef<
    Map<number, { bitmap: ImageBitmap; width: number; height: number; cssWidth: number; cssHeight: number }>
  >(new Map());

  const clearBitmapCache = useCallback(() => {
    pageBitmapCacheRef.current.forEach((entry) => {
      try {
        entry.bitmap.close?.();
      } catch {}
    });
    pageBitmapCacheRef.current.clear();
  }, []);

  // Load PDF Document asynchronously with dynamic import of pdfjs-dist
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setLoadingProgress(10);
    setPdfDoc(null);
    setCurrentPage(1);
    setPageInput('1');
    setZoomScale(1);
    clearBitmapCache();

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
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
        }

        const loadingTask = pdfjsLib.getDocument({
          url,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/cmaps/`,
          cMapPacked: true,
          disableAutoFetch: true,
          disableStream: false,
        });
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

        const doc = await loadingTask.promise;
        if (!isMounted) {
          try {
            doc.cleanup?.();
            doc.destroy?.();
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
        console.warn('Native PDF loading failed or blocked by CORS:', err);
        setError('Cannot load PDF natively (CORS or network policy).');
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
      clearBitmapCache();
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
  }, [url, clearBitmapCache]);

  // Render Page ONCE per page change — zooming uses 60fps GPU transform without re-rendering canvas!
  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;

      // 1. Instant 0ms restore if page is already in bitmap cache
      const cached = pageBitmapCacheRef.current.get(pageNum);
      if (cached) {
        canvas.width = cached.width;
        canvas.height = cached.height;
        canvas.style.width = `${cached.cssWidth}px`;
        canvas.style.height = `${cached.cssHeight}px`;
        context.drawImage(cached.bitmap, 0, 0);
        return;
      }

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }

      setIsRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (!canvasRef.current) return;

        const containerWidth = Math.max(320, (containerRef.current?.clientWidth || 900) - 24);
        const containerHeight = Math.max(320, (containerRef.current?.clientHeight || 700) - 72);
        const unscaledViewport = page.getViewport({ scale: 1 });

        const scaleX = containerWidth / unscaledViewport.width;
        const scaleY = containerHeight / unscaledViewport.height;
        const fitScale = Math.max(0.6, Math.min(scaleX, scaleY * 1.15, 2.2));

        const viewport = page.getViewport({ scale: fitScale });
        const rawDpr = Math.min(window.devicePixelRatio || 1, 1.75);
        const maxAllowedDpr = Math.min(
          rawDpr,
          MAX_CANVAS_DIMENSION / Math.max(viewport.width, viewport.height, 1)
        );
        const dpr = Math.max(1, maxAllowedDpr);

        const pixelWidth = Math.floor(viewport.width * dpr);
        const pixelHeight = Math.floor(viewport.height * dpr);
        const cssWidth = Math.floor(viewport.width);
        const cssHeight = Math.floor(viewport.height);

        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

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

        // Cache up to 5 rendered pages as lightweight ImageBitmap for instant page flipping
        if (typeof createImageBitmap === 'function' && canvas.width > 0 && canvas.height > 0) {
          try {
            if (pageBitmapCacheRef.current.size >= 5) {
              const oldestKey = pageBitmapCacheRef.current.keys().next().value;
              if (oldestKey !== undefined) {
                pageBitmapCacheRef.current.get(oldestKey)?.bitmap.close?.();
                pageBitmapCacheRef.current.delete(oldestKey);
              }
            }
            const bmp = await createImageBitmap(canvas);
            pageBitmapCacheRef.current.set(pageNum, {
              bitmap: bmp,
              width: pixelWidth,
              height: pixelHeight,
              cssWidth,
              cssHeight,
            });
          } catch {}
        }

        page.cleanup?.();
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
        }
      } finally {
        setIsRendering(false);
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
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Switch to Embed Viewer
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 active:scale-95"
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
      {/* Top Toolbar: Page Navigation & Instant GPU Zoom Controls */}
      <div className="z-[60] flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        {/* Left: Page Navigation */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1 || isLoading}
            onClick={() => handlePageChange(currentPage - 1)}
            className="p-1.5 hover:bg-slate-800 disabled:opacity-40 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">Page</span>
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => setPageInput(String(currentPage))}
              className="w-10 px-1.5 py-0.5 text-center bg-slate-800 border border-slate-700 rounded text-xs font-mono font-semibold text-white focus:outline-none focus:border-indigo-500"
            />
            <span className="text-xs text-slate-400 font-mono font-medium">/ {numPages || 1}</span>
          </form>

          <button
            type="button"
            disabled={currentPage >= numPages || isLoading}
            onClick={() => handlePageChange(currentPage + 1)}
            className="p-1.5 hover:bg-slate-800 disabled:opacity-40 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Center: 0ms GPU Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomStageRef.current?.zoomOut(0.4)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="px-2 py-0.5 text-xs font-mono font-bold text-slate-200 bg-slate-800 rounded border border-slate-700 min-w-[3.2rem] text-center">
            {Math.round(zoomScale * 100)}%
          </span>

          <button
            type="button"
            onClick={() => zoomStageRef.current?.zoomIn(0.4)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => zoomStageRef.current?.resetTransform()}
            className="px-2 py-1 text-[11px] font-semibold rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors active:scale-95 touch-manipulation flex items-center gap-1"
            title="Reset Zoom (100%)"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {onOpenFullscreen && !isFullscreen && (
            <button
              type="button"
              onClick={onOpenFullscreen}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
              title="Full Display"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
            title="Open in new window"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Main Canvas Viewport with 60fps iOS Pinch-to-Zoom & Pan */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-950 flex items-center justify-center">
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
          maxScale={8}
          onScaleChange={setZoomScale}
        >
          <div className="relative shadow-xl rounded-lg overflow-hidden border border-slate-800 bg-white">
            <canvas ref={canvasRef} className="block max-w-full h-auto" />
            {isRendering && (
              <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-900/90 text-indigo-400 rounded text-[10px] font-mono flex items-center gap-1 border border-slate-700">
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
