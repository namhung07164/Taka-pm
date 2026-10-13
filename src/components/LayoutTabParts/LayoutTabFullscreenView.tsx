import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { X, ArrowLeft, Maximize2 } from 'lucide-react';
import { LiveLayoutViewer } from '../LiveLayoutViewer';
import { PdfOrImageViewer } from './PdfOrImageViewer';

interface LayoutTabFullscreenViewProps {
  isFullscreenView: boolean;
  setIsFullscreenView: (val: boolean) => void;
  activeStore: string;
  locFilterStr: string;
  effectiveYear: string;
  targetUnitSearch: string | null;
  onUnitSelected?: (unit: any) => void;
  onClearFocus?: () => void;
  isLiveMapMode: boolean;
  url: string;
  getCleanUrl: (u: string | undefined | null) => string | undefined;
  fallbackSvg: string;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
}

export const LayoutTabFullscreenView = React.memo(function LayoutTabFullscreenView({
  isFullscreenView,
  setIsFullscreenView,
  activeStore,
  locFilterStr,
  effectiveYear,
  targetUnitSearch,
  onUnitSelected,
  onClearFocus,
  isLiveMapMode,
  url,
  getCleanUrl,
  fallbackSvg,
  isEditing,
  setIsEditing,
}: LayoutTabFullscreenViewProps) {
  const y = useMotionValue(0);
  const bgOpacity = useTransform(y, [-300, 0, 300], [0, 1, 0]);
  const dismissScale = useTransform(y, [-300, 0, 300], [0.85, 1, 0.85]);
  const [fsScale, setFsScale] = useState(1);
  const [isPinching, setIsPinching] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isMultiTouchRef = useRef(false);
  const isSwipingUpRef = useRef(false);
  const fsScaleRef = useRef(fsScale);

  useEffect(() => {
    fsScaleRef.current = fsScale;
  }, [fsScale]);

  useEffect(() => {
    if (!isFullscreenView) {
      y.set(0);
      setFsScale(1);
      touchStartRef.current = null;
      isMultiTouchRef.current = false;
      isSwipingUpRef.current = false;
    }
  }, [isFullscreenView, y]);

  useEffect(() => {
    if (!isFullscreenView && !isEditing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isFullscreenView) {
          setIsFullscreenView(false);
        } else if (isEditing) {
          setIsEditing(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreenView, isEditing, setIsFullscreenView, setIsEditing]);

  const handleFsTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      isMultiTouchRef.current = true;
      isSwipingUpRef.current = false;
      touchStartRef.current = null;
      if (y.get() !== 0) {
        animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
      return;
    }

    if (isMultiTouchRef.current || fsScaleRef.current > 1.05) {
      touchStartRef.current = null;
      isSwipingUpRef.current = false;
      return;
    }

    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
    isSwipingUpRef.current = false;
  };

  const handleFsTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      isMultiTouchRef.current = true;
      isSwipingUpRef.current = false;
      touchStartRef.current = null;
      if (y.get() !== 0) {
        animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
      return;
    }

    if (isMultiTouchRef.current || !touchStartRef.current || fsScaleRef.current > 1.05) {
      return;
    }

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartRef.current.x;
    const deltaY = currentY - touchStartRef.current.y;

    if (deltaY < -10) {
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.2 || isSwipingUpRef.current) {
        isSwipingUpRef.current = true;
        y.set(deltaY);
      }
    } else if (isSwipingUpRef.current) {
      y.set(Math.min(0, deltaY));
    }
  };

  const handleFsTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      const wasSwiping = isSwipingUpRef.current;
      const startData = touchStartRef.current;
      const currentY = y.get();

      touchStartRef.current = null;
      isMultiTouchRef.current = false;
      isSwipingUpRef.current = false;

      if (wasSwiping && startData && fsScaleRef.current <= 1.05) {
        const duration = Math.max(1, Date.now() - startData.time);
        const velocity = Math.abs(currentY) / duration;

        if (currentY < -70 || (currentY < -30 && velocity > 0.35)) {
          animate(y, -window.innerHeight, { duration: 0.22, ease: "easeOut" }).then(() => {
            setIsFullscreenView(false);
            y.set(0);
          });
          return;
        }
      }

      if (currentY !== 0) {
        animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
    }
  };

  const handleFsTouchCancel = () => {
    touchStartRef.current = null;
    isMultiTouchRef.current = false;
    isSwipingUpRef.current = false;
    if (y.get() !== 0) {
      animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  };

  // Add native browser Fullscreen API toggle
  const toggleNativeFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Lock body scroll when fullscreen mode is open
  useEffect(() => {
    if (isFullscreenView) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [isFullscreenView]);

  return (
    <AnimatePresence>
      {isFullscreenView && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ opacity: bgOpacity }}
          className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col overflow-hidden select-none w-screen h-[100dvh]"
        >
          {/* Top Bar with Exit and Controls */}
          <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white z-[60] shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFullscreenView(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-slate-700 shadow-sm active:scale-95 touch-manipulation"
                title="Exit Fullscreen (Esc)"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <span>Exit Fullscreen</span>
              </button>

              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-mono font-bold">
                {activeStore} • {locFilterStr}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleNativeFullscreen}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-xs"
                title="Toggle Native Browser Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
                <span className="hidden sm:inline font-medium text-[11px]">Browser Fullscreen</span>
              </button>

              <span className="hidden md:inline text-xs text-slate-400">
                Nhấn <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono text-[10px]">Esc</kbd> hoặc vuốt lên để thoát
              </span>

              <button
                type="button"
                onClick={() => setIsFullscreenView(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Fullscreen Canvas Content */}
          <motion.div 
            style={{ y, scale: dismissScale }}
            onTouchStart={handleFsTouchStart}
            onTouchMove={handleFsTouchMove}
            onTouchEnd={handleFsTouchEnd}
            onTouchCancel={handleFsTouchCancel}
            className="flex-grow w-full h-[calc(100dvh-50px)] relative overflow-hidden bg-slate-950 flex items-center justify-center"
          >
            {isLiveMapMode ? (
              <div className="w-full h-full relative">
                <LiveLayoutViewer
                  storeFilter={activeStore}
                  locationFilter={locFilterStr}
                  yearFilter={effectiveYear}
                  targetUnitSearch={targetUnitSearch}
                  onUnitSelected={onUnitSelected}
                  onClearFocus={onClearFocus}
                />
              </div>
            ) : (
              <PdfOrImageViewer
                url={url}
                getCleanUrl={getCleanUrl}
                fallbackSvg={fallbackSvg}
                isFullscreen={true}
                alt="Layout Fullscreen"
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
