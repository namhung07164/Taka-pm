import React, { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import { exportStageHighRes } from './layoutStageUtils';

interface UseLayoutWindowListenersParams {
  isPrintPreview: boolean;
  fitToScreen: (animated?: boolean) => void;
  fitToScreenRef: React.MutableRefObject<(animated?: boolean) => void>;
  handleExport: () => void;
  stageRef: React.RefObject<any>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setDimensions: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  versionId?: string | null;
  activeTab?: string;
  focusedUnitId?: string | null;
  bgImage?: any;
  version?: any;
  units?: any[];
}

export function useLayoutWindowListeners({
  isPrintPreview,
  fitToScreen,
  fitToScreenRef,
  handleExport,
  stageRef,
  containerRef,
  setDimensions,
  versionId,
  activeTab,
  focusedUnitId,
  bgImage,
  version,
  units,
}: UseLayoutWindowListenersParams) {
  const focusedUnitIdRef = useRef(focusedUnitId);
  focusedUnitIdRef.current = focusedUnitId;
  const hasMeasuredRealSizeRef = useRef(false);

  // ResizeObserver for canvas container: re-binds whenever versionId or activeTab causes containerRef to mount
  useEffect(() => {
    const updateSize = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const newW = Math.round(rect.width || el.clientWidth || el.offsetWidth || 0);
      const newH = Math.round(rect.height || el.clientHeight || el.offsetHeight || 0);
      if (newW <= 0 || newH <= 0) return;

      if (stageRef.current) {
        if (stageRef.current.width() !== newW) stageRef.current.width(newW);
        if (stageRef.current.height() !== newH) stageRef.current.height(newH);
        stageRef.current.batchDraw();
      }

      setDimensions(prev => {
        const changed = prev.width !== newW || prev.height !== newH;
        if (changed && (!hasMeasuredRealSizeRef.current || Math.abs(prev.height - newH) > 20 || Math.abs(prev.width - newW) > 20)) {
          hasMeasuredRealSizeRef.current = true;
          if (!focusedUnitIdRef.current) {
            requestAnimationFrame(() => fitToScreenRef.current(false));
          }
        }
        return changed ? { width: newW, height: newH } : prev;
      });
    };

    updateSize();
    const rafId = requestAnimationFrame(updateSize);
    const t1 = setTimeout(updateSize, 60);
    const t2 = setTimeout(updateSize, 220);

    window.addEventListener('resize', updateSize);
    window.addEventListener('orientationchange', updateSize);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', updateSize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(updateSize);
      ro.observe(containerRef.current);
    }
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', updateSize);
      vv?.removeEventListener('resize', updateSize);
      if (ro) ro.disconnect();
    };
  }, [containerRef, setDimensions, stageRef, fitToScreenRef, versionId, activeTab]);

  // When print preview activates or deactivates, automatically fit floor plan to screen
  const prevPrintPreviewRef = useRef(isPrintPreview);
  useEffect(() => {
    if (prevPrintPreviewRef.current !== isPrintPreview) {
      prevPrintPreviewRef.current = isPrintPreview;
      const timer = setTimeout(() => {
        fitToScreen(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isPrintPreview, fitToScreen]);

  // Handle browser native print & custom export events
  useEffect(() => {
    const handleBeforePrint = () => fitToScreenRef.current(false);
    const handleExportPngEvent = () => handleExport();
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('export-png', handleExportPngEvent);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('export-png', handleExportPngEvent);
    };
  }, [handleExport, fitToScreenRef]);

  // Wake-up redraw handler after tab cold freeze or background sleep
  useEffect(() => {
    const handleWakeUp = () => {
      if (document.visibilityState === 'visible') {
        stageRef.current?.batchDraw();
      }
    };
    document.addEventListener('visibilitychange', handleWakeUp);
    window.addEventListener('focus', handleWakeUp);
    return () => {
      document.removeEventListener('visibilitychange', handleWakeUp);
      window.removeEventListener('focus', handleWakeUp);
    };
  }, [stageRef]);

  // Global window references for high-res export
  useEffect(() => {
    (window as any).__taka_layout_stage = stageRef.current;
    (window as any).__taka_layout_export = (dpi: number = 200) => {
      return exportStageHighRes(stageRef.current, bgImage, version, units || [], dpi);
    };

    return () => {
      if ((window as any).__taka_layout_stage === stageRef.current) {
        (window as any).__taka_layout_stage = null;
        (window as any).__taka_layout_export = null;
      }
    };
  }, [bgImage, version, units, stageRef]);
}
