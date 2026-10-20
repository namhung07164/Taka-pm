import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, Loader2, RefreshCw, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { TouchPinchZoomStage, TouchPinchZoomStageHandle } from './TouchPinchZoomStage';
import { PdfNativeViewerToolbar } from './PdfNativeViewerToolbar';
import { PdfScrollablePagesView } from './PdfScrollablePagesView';
import { PdfPageThumbnailStrip } from './PdfPageThumbnailStrip';
import {
  fetchPdfBinaryUnified,
  getCachedPageThumbSync,
  normalizePdfSourceUrl,
  renderPdfPageToCanvasEntry,
  PdfCanvasCacheEntry,
} from '../../lib/pdfBinaryCache';

export interface PdfNativeCanvasViewerProps {
  url: string;
  isFullscreen?: boolean;
  onOpenFullscreen?: () => void;
  className?: string;
  onFallbackToIframe?: () => void;
}

const MAX_CANVAS_DIMENSION = 2400; // Safe GPU canvas texture cap for iOS Safari & Desktop

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
  const [showThumbnails, setShowThumbnails] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomStageRef = useRef<TouchPinchZoomStageHandle>(null);
  const renderTaskRef = useRef<any>(null);
  const activePdfRef = useRef<any>(null);
  const loadingTaskRef = useRef<any>(null);

  const initialThumbPlaceholder = getCachedPageThumbSync(url, 1);
  const pageCacheRef = useRef<Map<number, PdfCanvasCacheEntry>>(new Map());

  const clearPageCache = useCallback(() => {
    pageCacheRef.current.clear();
  }, []);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setLoadingProgress(15);
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
        const [pdfjsLib, binaryData] = await Promise.all([
          import('pdfjs-dist'),
          fetchPdfBinaryUnified(url, (pct) => {
            if (isMounted) setLoadingProgress(pct);
          }),
        ]);
        if (!isMounted) return;

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

        if (binaryData && binaryData.byteLength > 0) {
          docConfig.data = binaryData;
        } else {
          const normalized = normalizePdfSourceUrl(url);
          docConfig.url = normalized.startsWith('http')
            ? `/api/pdf-proxy?url=${encodeURIComponent(normalized)}`
            : normalized;
        }

        const loadingTask = pdfjsLib.getDocument(docConfig);
        loadingTaskRef.current = loadingTask;

        loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
          if (!isMounted) return;
          if (progress.total > 0) {
            const pct = Math.min(99, Math.round((progress.loaded / progress.total) * 100));
            setLoadingProgress(pct);
          }
        };

        const doc = await loadingTask.promise;
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
        setShowThumbnails(doc.numPages > 1);
        setIsLoading(false);
        setLoadingProgress(100);
      } catch (err) {
        if (!isMounted) return;
        console.warn('Native PDF loading failed:', err);
        if (onFallbackToIframe) {
          onFallbackToIframe();
          return;
        }
        setError('Cannot load PDF directly in canvas (CORS or permissions).');
        setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }
      if (loadingTaskRef.current) {
        try { loadingTaskRef.current.destroy?.(); } catch {}
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
  }, [url, onFallbackToIframe, clearPageCache]);

  const renderSeqRef = useRef<number>(0);

  const renderPageToCacheEntry = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc) return null;
      const availWidth = Math.max(260, (containerRef.current?.clientWidth || window.innerWidth) - 24);
      const availHeight = Math.max(260, (containerRef.current?.clientHeight || window.innerHeight) - (showThumbnails ? 155 : 80));
      const entry = await renderPdfPageToCanvasEntry({
        pdfDoc,
        pageNum,
        availWidth,
        availHeight,
        maxDimension: MAX_CANVAS_DIMENSION,
        url,
        onRenderTask: (task) => { renderTaskRef.current = task; },
      });
      if (entry) {
        if (pageCacheRef.current.size >= 8) {
          const oldestKey = pageCacheRef.current.keys().next().value;
          if (oldestKey !== undefined) pageCacheRef.current.delete(oldestKey);
        }
        pageCacheRef.current.set(pageNum, entry);
      }
      return entry;
    },
    [pdfDoc, showThumbnails, url]
  );

  // Render active page to visible canvas (0ms from cache or fresh render + adjacent page pre-render)
  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current) return;
      const seq = ++renderSeqRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;

      const drawEntryToCanvas = (entry: {
        canvas: HTMLCanvasElement;
        width: number;
        height: number;
        cssWidth: number;
        cssHeight: number;
      }) => {
        canvas.width = entry.width;
        canvas.height = entry.height;
        canvas.style.width = `${entry.cssWidth}px`;
        canvas.style.height = `${entry.cssHeight}px`;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, entry.width, entry.height);
        context.drawImage(entry.canvas, 0, 0);
      };

      const cached = pageCacheRef.current.get(pageNum);
      if (cached) {
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch {}
          renderTaskRef.current = null;
        }
        drawEntryToCanvas(cached);
        setIsRendering(false);
      } else {
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
          const entry = await renderPageToCacheEntry(pageNum);
          if (seq === renderSeqRef.current && entry && canvasRef.current) {
            drawEntryToCanvas(entry);
          }
        } catch (err: any) {
          if (err?.name !== 'RenderingCancelledException') {
            console.error('PDF page render error:', err);
          }
        } finally {
          if (seq === renderSeqRef.current) {
            setIsRendering(false);
          }
        }
      }

      // Silently pre-render next page (pageNum + 1) in idle time for instant 0ms page flip
      if (seq === renderSeqRef.current && pageNum < numPages && !pageCacheRef.current.has(pageNum + 1)) {
        setTimeout(() => {
          if (seq === renderSeqRef.current && !pageCacheRef.current.has(pageNum + 1)) {
            renderPageToCacheEntry(pageNum + 1).catch(() => {});
          }
        }, 120);
      }
    },
    [pdfDoc, numPages, renderPageToCacheEntry]
  );

  useEffect(() => {
    if (pdfDoc && currentPage >= 1 && currentPage <= numPages) {
      zoomStageRef.current?.resetTransform();
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, numPages, renderPage]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= numPages) {
        setCurrentPage(newPage);
        setPageInput(String(newPage));
      }
    },
    [numPages]
  );

  // Desktop Keyboard Arrow Navigation (Left/Up = Prev Page, Right/Down = Next Page)
  useEffect(() => {
    if (!pdfDoc || numPages <= 1) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        handlePageChange(currentPage + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        handlePageChange(currentPage - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pdfDoc, numPages, currentPage, handlePageChange]);

  // ResizeObserver: only invalidate cache & re-render when container size meaningfully changes
  const lastContainerSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    if (!containerRef.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (Math.abs(w - lastContainerSizeRef.current.w) < 8 && Math.abs(h - lastContainerSizeRef.current.h) < 8) return;
      lastContainerSizeRef.current = { w, h };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pdfDoc && currentPage) {
          clearPageCache();
          renderPage(currentPage);
        }
      }, 150);
    });
    observer.observe(containerRef.current);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [pdfDoc, currentPage, renderPage, clearPageCache]);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= numPages) setCurrentPage(parsed);
    else setPageInput(String(currentPage));
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
            <button type="button" onClick={onFallbackToIframe} className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 touch-manipulation cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" /> Switch to Embed Viewer
            </button>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer" className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 active:scale-95 touch-manipulation cursor-pointer">
            <ExternalLink className="w-3.5 h-3.5" /> Open File in New Tab
          </a>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`w-full h-full relative flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none ${className}`}>
      <PdfNativeViewerToolbar
        currentPage={currentPage}
        numPages={numPages}
        pageInput={pageInput}
        onPageInputChange={setPageInput}
        onPageInputSubmit={handlePageInputSubmit}
        onPageChange={handlePageChange}
        isLoading={isLoading}
        zoomScale={zoomScale}
        onZoomIn={() => viewMode === 'scroll' ? setZoomScale((s) => Math.min(6, Math.round((s + 0.4) * 100) / 100)) : zoomStageRef.current?.zoomIn(0.4)}
        onZoomOut={() => viewMode === 'scroll' ? setZoomScale((s) => Math.max(0.5, Math.round((s - 0.4) * 100) / 100)) : zoomStageRef.current?.zoomOut(0.4)}
        onResetZoom={() => viewMode === 'scroll' ? setZoomScale(1) : zoomStageRef.current?.resetTransform()}
        isFullscreen={isFullscreen}
        onOpenFullscreen={onOpenFullscreen}
        url={url}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode((m) => (m === 'page' ? 'scroll' : 'page'))}
        showThumbnails={showThumbnails}
        onToggleThumbnails={() => setShowThumbnails((prev) => !prev)}
      />

      {/* Main Canvas Viewport: Wheel Zoom & Arrow Buttons on Desktop | 2-Finger Pinch & Swipe-Up Page Flip on iOS */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-950 flex items-center justify-center p-1 sm:p-2">
        {isLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 text-slate-300">
            {initialThumbPlaceholder && (
              <img
                src={initialThumbPlaceholder}
                alt="PDF Preview"
                className="max-w-[85%] max-h-[80%] object-contain rounded-lg opacity-45 blur-[0.5px] mb-4 pointer-events-none"
              />
            )}
            <div className="flex flex-col items-center bg-slate-900/95 px-5 py-3.5 rounded-xl border border-slate-800 shadow-xl">
              <Loader2 className="w-7 h-7 text-indigo-400 animate-spin mb-2" />
              <p className="text-xs font-semibold tracking-wide">Loading PDF Document ({loadingProgress}%)...</p>
              <div className="w-44 h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-150" style={{ width: `${loadingProgress}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Desktop Floating Left/Right Page Arrow Buttons */}
        {viewMode === 'page' && numPages > 1 && !isLoading && (
          <>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-slate-900/85 hover:bg-blue-600 text-slate-100 border border-slate-700/80 shadow-xl disabled:opacity-20 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
              title="Previous Page (Left Arrow)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              disabled={currentPage >= numPages}
              onClick={() => handlePageChange(currentPage + 1)}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-slate-900/85 hover:bg-blue-600 text-slate-100 border border-slate-700/80 shadow-xl disabled:opacity-20 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
              title="Next Page (Right Arrow)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {viewMode === 'scroll' && pdfDoc ? (
          <PdfScrollablePagesView
            pdfDoc={pdfDoc}
            numPages={numPages}
            zoomScale={zoomScale}
            onVisiblePageChange={(p) => {
              setCurrentPage(p);
              setPageInput(String(p));
            }}
          />
        ) : (
          <TouchPinchZoomStage
            ref={zoomStageRef}
            initialScale={1}
            minScale={0.5}
            maxScale={10}
            onScaleChange={setZoomScale}
            onSwipeUp={numPages > 1 ? () => handlePageChange(currentPage + 1) : undefined}
            onSwipeDown={numPages > 1 ? () => handlePageChange(currentPage - 1) : undefined}
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
        )}
      </div>

      {/* Unified Interactive Page Thumbnail Filmstrip (Desktop & iOS) */}
      {showThumbnails && pdfDoc && numPages >= 1 && (
        <PdfPageThumbnailStrip
          pdfDoc={pdfDoc}
          url={url}
          numPages={numPages}
          currentPage={currentPage}
          onSelectPage={(pageNum) => {
            handlePageChange(pageNum);
            if (viewMode === 'scroll') setViewMode('page');
          }}
        />
      )}
    </div>
  );
}

export default PdfNativeCanvasViewer;
