import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ChevronUp, ChevronDown, ArrowUpToLine, ArrowDownToLine, MousePointer } from 'lucide-react';
import { TouchPinchZoomStage, TouchPinchZoomStageHandle } from './TouchPinchZoomStage';

export interface LightboxIframeViewerProps {
  embedUrl: string;
  title?: string;
  touchZoomMode: 'pinch' | 'scroll';
  zoomScale: number;
  onScaleChange: (scale: number) => void;
  zoomStageRef: React.RefObject<TouchPinchZoomStageHandle | null>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  className?: string;
}

export const LightboxIframeViewer: React.FC<LightboxIframeViewerProps> = ({
  embedUrl,
  title = 'Document Embed Viewer',
  touchZoomMode,
  zoomScale,
  onScaleChange,
  zoomStageRef,
  iframeRef,
  className = '',
}) => {
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchLastYRef = useRef<number | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(true);

  // Guarantee embedUrl never loads /api/pdf-proxy (which serves index.html on static/edge deployments)
  const safeEmbedUrl = React.useMemo(() => {
    if (!embedUrl) return '';
    if (embedUrl.includes('/api/pdf-proxy')) {
      const match = embedUrl.match(/[?&]url=([^&]+)/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]);
        if (/^https?:\/\//i.test(decoded)) {
          return `https://docs.google.com/viewer?url=${encodeURIComponent(decoded)}&embedded=true`;
        }
      }
    }
    return embedUrl;
  }, [embedUrl]);

  // Anti-nesting guard: If iframe accidentally loads the SPA itself (e.g. #root or Takashimaya title),
  // immediately escape and redirect iframe to Google Docs Viewer
  const handleIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const iframeDoc = e.currentTarget.contentDocument;
      if (iframeDoc && (iframeDoc.getElementById('root') || iframeDoc.title?.includes('Takashimaya'))) {
        console.warn('[LightboxIframeViewer] Anti-nesting guard triggered: iframe loaded SPA index.html. Redirecting to Google Docs Viewer fallback.');
        let target = embedUrl;
        const m = embedUrl.match(/[?&]url=([^&]+)/);
        if (m && m[1]) target = decodeURIComponent(m[1]);
        if (/^https?:\/\//i.test(target)) {
          e.currentTarget.src = `https://docs.google.com/viewer?url=${encodeURIComponent(target)}&embedded=true`;
        }
      }
    } catch {
      // Cross-origin iframe is expected for Google Docs Viewer, Google Drive, R2, etc. Cross-origin throws DOMException which is safe.
    }
  }, [embedUrl]);

  // Helper function to perform scroll up
  const handleScrollUp = useCallback((step: number = 420) => {
    // 1. Scroll container directly
    if (scrollWrapperRef.current) {
      scrollWrapperRef.current.scrollBy({ top: -step, behavior: 'smooth' });
    }
    // 2. Also scroll iframe window if accessible (same-origin proxy)
    try {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.scrollBy({ top: -step, behavior: 'smooth' });
      }
    } catch {}
  }, [iframeRef]);

  // Helper function to scroll down
  const handleScrollDown = useCallback((step: number = 420) => {
    if (scrollWrapperRef.current) {
      scrollWrapperRef.current.scrollBy({ top: step, behavior: 'smooth' });
    }
    try {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.scrollBy({ top: step, behavior: 'smooth' });
      }
    } catch {}
  }, [iframeRef]);

  // Helper function to scroll to absolute top
  const handleScrollToTop = useCallback(() => {
    if (scrollWrapperRef.current) {
      scrollWrapperRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    try {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {}
  }, [iframeRef]);

  // Helper function to scroll to bottom
  const handleScrollToBottom = useCallback(() => {
    if (scrollWrapperRef.current) {
      scrollWrapperRef.current.scrollTo({
        top: scrollWrapperRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    try {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.scrollTo({
          top: win.document?.body?.scrollHeight || 99999,
          behavior: 'smooth',
        });
      }
    } catch {}
  }, [iframeRef]);

  // Track scroll position to update canScrollUp / canScrollDown
  const updateScrollIndicators = useCallback(() => {
    const el = scrollWrapperRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 10);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 10);
  }, []);

  useEffect(() => {
    const el = scrollWrapperRef.current;
    if (!el || touchZoomMode !== 'scroll') return;
    el.addEventListener('scroll', updateScrollIndicators, { passive: true });
    return () => el.removeEventListener('scroll', updateScrollIndicators);
  }, [touchZoomMode, updateScrollIndicators]);

  // Keyboard navigation for Scroll Mode: PageUp, PageDown, ArrowUp, ArrowDown, Home
  useEffect(() => {
    if (touchZoomMode !== 'scroll') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleScrollUp(120);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleScrollDown(120);
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        handleScrollUp(500);
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        handleScrollDown(500);
      } else if (e.key === 'Home') {
        e.preventDefault();
        handleScrollToTop();
      } else if (e.key === 'End') {
        e.preventDefault();
        handleScrollToBottom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [touchZoomMode, handleScrollUp, handleScrollDown, handleScrollToTop, handleScrollToBottom]);

  // Passive touch tracking for iOS Safari rubber-band defense
  useEffect(() => {
    const el = scrollWrapperRef.current;
    if (!el || touchZoomMode !== 'scroll') return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartYRef.current = e.touches[0].clientY;
        touchLastYRef.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || touchLastYRef.current === null) return;
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchLastYRef.current;
      touchLastYRef.current = currentY;

      // If user drags finger DOWN (deltaY > 0), they want to scroll UP
      // When at scrollTop = 0, iOS Safari would lock up.
      // If scrollTop > 0 and user pulls down, assist scroll up if needed
      if (deltaY > 6 && el.scrollTop > 0) {
        el.scrollTop = Math.max(0, el.scrollTop - deltaY);
      }
    };

    const onTouchEnd = () => {
      touchStartYRef.current = null;
      touchLastYRef.current = null;
      updateScrollIndicators();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [touchZoomMode, updateScrollIndicators]);

  return (
    <div className={`w-full h-full relative flex flex-col items-center justify-center p-0.5 sm:p-1 ${className}`}>
      <TouchPinchZoomStage
        ref={zoomStageRef}
        initialScale={1}
        minScale={0.5}
        maxScale={8}
        onScaleChange={onScaleChange}
        captureOverlay={touchZoomMode === 'pinch'}
        allowNativeTouch={touchZoomMode === 'scroll'}
        className="w-full h-full flex items-center justify-center"
      >
        <div
          ref={scrollWrapperRef}
          className="w-full h-full rounded-xl overflow-hidden border border-slate-800 bg-white relative"
          style={touchZoomMode === 'scroll' ? {
            overflowY: 'auto',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y pan-x',
          } : undefined}
        >
          <iframe
            ref={iframeRef}
            src={safeEmbedUrl}
            onLoad={handleIframeLoad}
            scrolling={touchZoomMode === 'scroll' ? 'yes' : 'no'}
            className="w-full h-full border-0 bg-white block"
            title={title}
            allow="autoplay; fullscreen"
            style={{
              minWidth: '100%',
              minHeight: '100%',
              touchAction: touchZoomMode === 'scroll' ? 'auto' : 'none',
            }}
          />
        </div>
      </TouchPinchZoomStage>

      {/* Floating Quick-Scroll Pill Buttons for Scroll Mode */}
      {touchZoomMode === 'scroll' && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-2 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-700 shadow-2xl">
          <button
            type="button"
            onClick={handleScrollToTop}
            className="p-2 rounded-xl bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all active:scale-95 touch-manipulation cursor-pointer flex flex-col items-center gap-0.5 group shadow-sm"
            title="Scroll to Top (Lên đầu trang)"
          >
            <ArrowUpToLine className="w-4 h-4 text-blue-400 group-hover:text-white" />
            <span className="text-[9px] font-bold tracking-tight">Top</span>
          </button>

          <button
            type="button"
            onClick={() => handleScrollUp(450)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all active:scale-95 touch-manipulation cursor-pointer flex flex-col items-center gap-0.5 group shadow-sm"
            title="Scroll Up (Cuộn lên)"
          >
            <ChevronUp className="w-4 h-4 text-emerald-400 group-hover:text-white" />
            <span className="text-[9px] font-bold tracking-tight">Up</span>
          </button>

          <button
            type="button"
            onClick={() => handleScrollDown(450)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all active:scale-95 touch-manipulation cursor-pointer flex flex-col items-center gap-0.5 group shadow-sm"
            title="Scroll Down (Cuộn xuống)"
          >
            <ChevronDown className="w-4 h-4 text-indigo-400 group-hover:text-white" />
            <span className="text-[9px] font-bold tracking-tight">Down</span>
          </button>

          <button
            type="button"
            onClick={handleScrollToBottom}
            className="p-2 rounded-xl bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all active:scale-95 touch-manipulation cursor-pointer flex flex-col items-center gap-0.5 group shadow-sm"
            title="Scroll to Bottom (Xuống cuối trang)"
          >
            <ArrowDownToLine className="w-4 h-4 text-slate-400 group-hover:text-white" />
            <span className="text-[9px] font-bold tracking-tight">End</span>
          </button>
        </div>
      )}
    </div>
  );
};
