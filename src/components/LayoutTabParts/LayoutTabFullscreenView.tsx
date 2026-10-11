import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { X, ZoomIn, ZoomOut, Maximize, ArrowLeft, RefreshCw, Layers } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { LiveLayoutViewer } from '../LiveLayoutViewer';

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

  return (
    <AnimatePresence>
      {isFullscreenView && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ opacity: bgOpacity }}
          className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col overflow-hidden select-none"
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
            className="flex-grow w-full h-[calc(100vh-50px)] relative overflow-hidden bg-slate-950 touch-none flex items-center justify-center"
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
            ) : url?.includes('drive.google.com') ? (
              <iframe 
                src={getCleanUrl(url)} 
                width="100%" 
                style={{ height: '100%', border: 'none' }}
                allow="autoplay"
              />
            ) : (
              <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={6}
                centerOnInit={true}
                smooth={false}
                wheel={{ step: 0.05 }}
                zoomAnimation={{ disabled: true }}
                pinch={{ step: 5 }}
                panning={{ disabled: false }}
                doubleClick={{ mode: "toggle", step: 2.2 }}
                onZoom={(ref) => {
                  setFsScale(ref.state.scale);
                  setIsPinching(true);
                }}
                onPinchStop={() => {
                  setTimeout(() => setIsPinching(false), 200);
                }}
              >
                {({ zoomIn, zoomOut, resetTransform, state }) => (
                  <>
                    <div className="absolute top-4 right-4 z-[50] flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1 border border-slate-700 shadow-md rounded-xl">
                      <button
                        type="button"
                        onClick={() => zoomIn(0.3)}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
                        title="Zoom In"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => zoomOut(0.3)}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
                        title="Zoom Out"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <span className="px-2 py-0.5 text-xs font-mono font-bold text-slate-200 border-l border-r border-slate-700">
                        {Math.round((state.scale || 1) * 100)}%
                      </span>
                      <button 
                        type="button"
                        onClick={() => resetTransform()}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
                        title="Reset"
                      >
                        <Maximize className="w-4 h-4" />
                      </button>
                    </div>
                    <TransformComponent
                      wrapperStyle={{ width: "100%", height: "100%" }}
                      contentStyle={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}
                    >
                      <img 
                        src={getCleanUrl(url)} 
                        alt="Layout Fullscreen" 
                        decoding="async"
                        className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = fallbackSvg;
                        }}
                      />
                    </TransformComponent>
                  </>
                )}
              </TransformWrapper>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
