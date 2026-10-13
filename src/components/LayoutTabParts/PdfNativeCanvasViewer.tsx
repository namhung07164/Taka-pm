import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Download, 
  ExternalLink, 
  AlertCircle, 
  Loader2, 
  Layers,
  Maximize,
  RefreshCw,
  Eye
} from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

// Configure pdfjs worker URL cleanly
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
}

export interface PdfNativeCanvasViewerProps {
  url: string;
  isFullscreen?: boolean;
  onOpenFullscreen?: () => void;
  className?: string;
  onFallbackToIframe?: () => void;
}

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
  const [scale, setScale] = useState<number>(1.2);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'single' | 'fitWidth' | 'fitPage'>('fitWidth');

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const activePdfRef = useRef<any>(null);

  // Load PDF Document asynchronously
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setLoadingProgress(5);
    setPdfDoc(null);
    setCurrentPage(1);
    setPageInput('1');

    // Cancel previous document if active
    if (activePdfRef.current) {
      try {
        (activePdfRef.current as any).destroy?.() || (activePdfRef.current as any).cleanup?.();
      } catch (e) {
        // ignore cleanup error
      }
      activePdfRef.current = null;
    }

    const loadingTask = pdfjsLib.getDocument({
      url,
      cMapUrl: 'https://unpkg.com/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
    });

    loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
      if (!isMounted) return;
      if (progress.total > 0) {
        const pct = Math.min(99, Math.round((progress.loaded / progress.total) * 100));
        setLoadingProgress(pct);
      } else {
        setLoadingProgress((prev) => Math.min(90, prev + 15));
      }
    };

    loadingTask.promise
      .then((doc) => {
        if (!isMounted) {
          (doc as any).destroy?.() || (doc as any).cleanup?.();
          return;
        }
        activePdfRef.current = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setIsLoading(false);
        setLoadingProgress(100);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Native PDF loading failed or blocked by CORS:', err);
        setError('Cannot load PDF natively (CORS or network policy).');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) {}
      }
      if (activePdfRef.current) {
        try { (activePdfRef.current as any).destroy?.() || (activePdfRef.current as any).cleanup?.(); } catch (e) {}
        activePdfRef.current = null;
      }
    };
  }, [url]);

  // Render Page to Canvas
  const renderPage = useCallback(
    async (pageNum: number, pageScale: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) {}
        renderTaskRef.current = null;
      }

      setIsRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        // Calculate auto scale for fitWidth / fitPage
        let targetScale = pageScale;
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth - 32;
          const containerHeight = containerRef.current.clientHeight - 80;
          const unscaledViewport = page.getViewport({ scale: 1 });

          if (viewMode === 'fitWidth' && containerWidth > 100) {
            targetScale = containerWidth / unscaledViewport.width;
          } else if (viewMode === 'fitPage' && containerHeight > 100) {
            const scaleX = containerWidth / unscaledViewport.width;
            const scaleY = containerHeight / unscaledViewport.height;
            targetScale = Math.min(scaleX, scaleY);
          }
        }

        const viewport = page.getViewport({ scale: Math.max(0.4, Math.min(4, targetScale)) });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;

        const renderContext = {
          canvasContext: context,
          transform,
          viewport,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
        }
      } finally {
        setIsRendering(false);
      }
    },
    [pdfDoc, viewMode]
  );

  useEffect(() => {
    if (pdfDoc && currentPage >= 1 && currentPage <= numPages) {
      renderPage(currentPage, scale);
    }
  }, [pdfDoc, currentPage, scale, viewMode, renderPage]);

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
          The document server prevents direct binary access. You can use embedded mode or open in new window.
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
      {/* Top Toolbar: Navigation & Per-Page Zoom Controls */}
      <div className="z-[60] flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md shrink-0">
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

        {/* Center: Zoom & View Mode */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setViewMode('single'); setScale((s) => Math.max(0.5, s - 0.25)); }}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="px-2 py-0.5 text-xs font-mono font-bold text-slate-300 bg-slate-800/80 rounded border border-slate-700">
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            onClick={() => { setViewMode('single'); setScale((s) => Math.min(3.5, s + 0.25)); }}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={() => { setViewMode('fitWidth'); setScale(1); }}
            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
              viewMode === 'fitWidth' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Fit Width"
          >
            Fit Width
          </button>

          <button
            type="button"
            onClick={() => { setViewMode('fitPage'); setScale(1); }}
            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors hidden sm:inline-block ${
              viewMode === 'fitPage' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Fit Page"
          >
            Fit Page
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

      {/* Main Canvas Viewport with Touch Pan & Zoom */}
      <div className="flex-grow w-full h-full relative overflow-auto bg-slate-950 flex items-center justify-center p-2 sm:p-4 scrollbar-thin scrollbar-thumb-slate-800">
        {isLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xs text-slate-300">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
            <p className="text-xs font-semibold tracking-wide">Loading PDF Document ({loadingProgress}%)...</p>
            <div className="w-48 h-1.5 bg-slate-800 rounded-full mt-2.5 overflow-hidden">
              <div 
                className="h-full bg-indigo-500 transition-all duration-200"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        )}

        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={10}
          centerOnInit={true}
          smooth={false}
          wheel={{ step: 0.25 }}
          pinch={{ step: 12 }}
          doubleClick={{ mode: 'reset' }}
        >
          {() => (
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                <canvas
                  ref={canvasRef}
                  className="block max-w-full h-auto cursor-grab active:cursor-grabbing transition-opacity duration-150"
                  style={{ opacity: isRendering ? 0.85 : 1 }}
                />
                {isRendering && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-900/90 text-indigo-400 rounded text-[10px] font-mono flex items-center gap-1 border border-slate-700 shadow-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Rendering...</span>
                  </div>
                )}
              </div>
            </TransformComponent>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
}

export default PdfNativeCanvasViewer;
