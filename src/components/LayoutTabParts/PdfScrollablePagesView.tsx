import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

interface PdfScrollablePagesViewProps {
  pdfDoc: any;
  numPages: number;
  zoomScale: number;
  initialPage?: number;
  onVisiblePageChange?: (pageNum: number) => void;
}

const MAX_SCROLL_CANVAS_DIM = 1400; // Fast GPU rendering cap for smooth scrolling
const MAX_CONCURRENT_RENDERS = 1; // Strict queue to prevent CPU/GPU main thread freeze

// Shared FIFO/Priority Render Queue across all scroll pages
class PageRenderQueue {
  private running = 0;
  private queue: Array<{ id: number; fn: () => Promise<void>; cancel: () => void }> = [];

  enqueue(id: number, fn: () => Promise<void>, cancel: () => void) {
    this.dequeue(id); // Remove any existing entry for this page
    this.queue.push({ id, fn, cancel });
    this.processNext();
  }

  dequeue(id: number) {
    const idx = this.queue.findIndex((item) => item.id === id);
    if (idx !== -1) {
      const [removed] = this.queue.splice(idx, 1);
      removed.cancel();
    }
  }

  private async processNext() {
    if (this.running >= MAX_CONCURRENT_RENDERS || this.queue.length === 0) return;
    const nextItem = this.queue.shift();
    if (!nextItem) return;

    this.running++;
    try {
      await nextItem.fn();
    } catch {
      // Ignored
    } finally {
      this.running--;
      this.processNext();
    }
  }
}

const globalRenderQueue = new PageRenderQueue();

interface SingleScrollPageProps {
  pdfDoc: any;
  pageNumber: number;
  containerWidth: number;
  zoomScale: number;
}

const SingleScrollPage: React.FC<SingleScrollPageProps> = React.memo(({
  pdfDoc,
  pageNumber,
  containerWidth,
  zoomScale,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(pageNumber <= 2);
  const [isRendered, setIsRendered] = useState(false);
  const [pageDimensions, setPageDimensions] = useState<{ w: number; h: number }>({
    w: Math.max(280, containerWidth - 24),
    h: Math.round(Math.max(280, containerWidth - 24) * 0.72),
  });

  // Observe visibility with rootMargin of 400px (1 viewport before/after)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setIsVisible(true);
        } else {
          // Unload canvas from GPU memory if far away to keep iOS Safari memory under 40MB
          setIsVisible(false);
          setIsRendered(false);
          globalRenderQueue.dequeue(pageNumber);
          if (canvasRef.current) {
            canvasRef.current.width = 0;
            canvasRef.current.height = 0;
          }
        }
      },
      { rootMargin: '400px 0px 400px 0px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      globalRenderQueue.dequeue(pageNumber);
    };
  }, [pageNumber]);

  useEffect(() => {
    if (!isVisible || !pdfDoc || !canvasRef.current) return;

    let cancelled = false;
    let renderTask: any = null;

    const renderJob = async () => {
      if (cancelled || !canvasRef.current) return;
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled || !canvasRef.current) {
          try { page.cleanup?.(); } catch {}
          return;
        }

        const unscaled = page.getViewport({ scale: 1 });
        const targetCssWidth = Math.max(260, (containerWidth - 24) * Math.max(0.5, zoomScale));
        const fitScale = targetCssWidth / Math.max(1, unscaled.width);

        // Cap DPR at 1.25 in scroll mode for ultra-fast, stutter-free scrolling on mobile/iPad
        const rawDpr = Math.min(window.devicePixelRatio || 1, 1.25);
        const maxDpr = MAX_SCROLL_CANVAS_DIM / Math.max(unscaled.width * fitScale, unscaled.height * fitScale, 1);
        const dpr = Math.max(0.8, Math.min(rawDpr, maxDpr));

        const viewport = page.getViewport({ scale: fitScale * dpr });
        const pixelWidth = Math.max(1, Math.floor(viewport.width));
        const pixelHeight = Math.max(1, Math.floor(viewport.height));
        const cssWidth = Math.max(1, Math.floor(viewport.width / dpr));
        const cssHeight = Math.max(1, Math.floor(viewport.height / dpr));

        setPageDimensions({ w: cssWidth, h: cssHeight });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pixelWidth, pixelHeight);

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });

        await renderTask.promise;

        if (!cancelled) {
          setIsRendered(true);
        }
        page.cleanup?.();
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Error rendering scroll page ${pageNumber}:`, err);
        }
      }
    };

    globalRenderQueue.enqueue(
      pageNumber,
      renderJob,
      () => {
        cancelled = true;
        if (renderTask) {
          try { renderTask.cancel(); } catch {}
        }
      }
    );

    return () => {
      cancelled = true;
      globalRenderQueue.dequeue(pageNumber);
      if (renderTask) {
        try { renderTask.cancel(); } catch {}
      }
    };
  }, [isVisible, pdfDoc, pageNumber, containerWidth, zoomScale]);

  return (
    <div
      ref={wrapperRef}
      data-page-num={pageNumber}
      style={{ minHeight: `${pageDimensions.h}px` }}
      className="relative flex flex-col items-center justify-center my-2 shadow-xl rounded-lg overflow-hidden border border-slate-800 bg-white shrink-0"
    >
      <canvas ref={canvasRef} className="block select-none" />
      {!isRendered && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 text-slate-500 text-xs gap-1.5">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
          <span>Page {pageNumber}...</span>
        </div>
      )}
      <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-slate-900/75 text-white text-[10px] font-mono rounded backdrop-blur-xs pointer-events-none">
        {pageNumber}
      </div>
    </div>
  );
});

export const PdfScrollablePagesView: React.FC<PdfScrollablePagesViewProps> = ({
  pdfDoc,
  numPages,
  zoomScale,
  initialPage = 1,
  onVisiblePageChange,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.min(window.innerWidth, 1000) : 800
  );
  const lastActivePageRef = useRef<number>(initialPage);
  const initialScrolledRef = useRef(false);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setContainerWidth(Math.max(280, el.clientWidth));

    if (typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const obs = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (scrollContainerRef.current) {
          setContainerWidth(Math.max(280, scrollContainerRef.current.clientWidth));
        }
      }, 150);
    });
    obs.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      obs.disconnect();
    };
  }, []);

  // Jump to initialPage immediately on mount
  useEffect(() => {
    if (initialScrolledRef.current || !initialPage || initialPage <= 1) return;
    const targetEl = scrollContainerRef.current?.querySelector(`[data-page-num="${initialPage}"]`);
    if (targetEl) {
      initialScrolledRef.current = true;
      targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [initialPage, numPages]);

  // Throttled scroll listener to accurately detect currently visible page
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !onVisiblePageChange) return;

    const containerRect = container.getBoundingClientRect();
    const probeY = containerRect.top + Math.min(200, containerRect.height / 3);

    const pageNodes = container.querySelectorAll<HTMLElement>('[data-page-num]');
    let closestPage = 1;
    let minDistance = Infinity;

    pageNodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const pageMiddle = rect.top + rect.height / 2;
      const distance = Math.abs(pageMiddle - probeY);
      if (distance < minDistance) {
        minDistance = distance;
        const p = parseInt(node.getAttribute('data-page-num') || '1', 10);
        if (!isNaN(p)) closestPage = p;
      }
    });

    if (closestPage !== lastActivePageRef.current) {
      lastActivePageRef.current = closestPage;
      onVisiblePageChange(closestPage);
    }
  }, [onVisiblePageChange]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const onScrollThrottled = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        handleScroll();
        rafId = null;
      });
    };

    container.addEventListener('scroll', onScrollThrottled, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScrollThrottled);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [handleScroll]);

  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div
      ref={scrollContainerRef}
      className="w-full h-full overflow-y-auto overflow-x-auto flex flex-col items-center p-2 sm:p-4 bg-slate-950 scroll-smooth"
      style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
    >
      {pages.map((pageNum) => (
        <SingleScrollPage
          key={pageNum}
          pdfDoc={pdfDoc}
          pageNumber={pageNum}
          containerWidth={containerWidth}
          zoomScale={zoomScale}
        />
      ))}
    </div>
  );
};

export default PdfScrollablePagesView;
