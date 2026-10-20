import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface PdfScrollablePagesViewProps {
  pdfDoc: any;
  numPages: number;
  zoomScale: number;
  onVisiblePageChange?: (pageNum: number) => void;
}

const MAX_SCROLL_CANVAS_DIM = 2000;

interface SingleScrollPageProps {
  pdfDoc: any;
  pageNumber: number;
  containerWidth: number;
  zoomScale: number;
  onPageVisible?: (pageNum: number) => void;
}

const SingleScrollPage: React.FC<SingleScrollPageProps> = React.memo(({
  pdfDoc,
  pageNumber,
  containerWidth,
  zoomScale,
  onPageVisible,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(pageNumber <= 2);
  const [isRendered, setIsRendered] = useState(false);
  const [pageDimensions, setPageDimensions] = useState<{ w: number; h: number }>({
    w: Math.max(280, containerWidth - 24),
    h: Math.round(Math.max(280, containerWidth - 24) * 0.72),
  });

  // Track visibility via IntersectionObserver for lazy canvas allocation (iOS Safari GPU safety)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (entry.intersectionRatio >= 0.45) {
              onPageVisible?.(pageNumber);
            }
          }
        });
      },
      { rootMargin: '500px 0px', threshold: [0.05, 0.5] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onPageVisible]);

  useEffect(() => {
    if (!isVisible || !pdfDoc || !canvasRef.current) return;

    let cancelled = false;
    let renderTask: any = null;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const unscaled = page.getViewport({ scale: 1 });
        const targetCssWidth = Math.max(260, (containerWidth - 24) * Math.max(0.5, zoomScale));
        const fitScale = targetCssWidth / Math.max(1, unscaled.width);

        const rawDpr = Math.min(window.devicePixelRatio || 1, 2);
        const maxDpr = MAX_SCROLL_CANVAS_DIM / Math.max(unscaled.width * fitScale, unscaled.height * fitScale, 1);
        const dpr = Math.max(1, Math.min(rawDpr, maxDpr));

        const viewport = page.getViewport({ scale: fitScale * dpr });
        const pixelWidth = Math.max(1, Math.floor(viewport.width));
        const pixelHeight = Math.max(1, Math.floor(viewport.height));
        const cssWidth = Math.max(1, Math.floor(viewport.width / dpr));
        const cssHeight = Math.max(1, Math.floor(viewport.height / dpr));

        setPageDimensions({ w: cssWidth, h: cssHeight });

        const canvas = canvasRef.current;
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pixelWidth, pixelHeight);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

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
    })();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {}
      }
    };
  }, [isVisible, pdfDoc, pageNumber, containerWidth, zoomScale]);

  return (
    <div
      ref={wrapperRef}
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
  onVisiblePageChange,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.min(window.innerWidth, 1000) : 800
  );

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
          onPageVisible={onVisiblePageChange}
        />
      ))}
    </div>
  );
};

export default PdfScrollablePagesView;
