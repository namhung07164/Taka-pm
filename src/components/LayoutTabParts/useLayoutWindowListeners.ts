import React, { Dispatch, SetStateAction, useEffect, useRef } from 'react';

interface UseLayoutWindowListenersParams {
  isPrintPreview: boolean;
  fitToScreen: (animated?: boolean) => void;
  fitToScreenRef: React.MutableRefObject<(animated?: boolean) => void>;
  handleExport: () => void;
  stageRef: React.RefObject<any>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setDimensions: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
}

export function useLayoutWindowListeners({
  isPrintPreview,
  fitToScreen,
  fitToScreenRef,
  handleExport,
  stageRef,
  containerRef,
  setDimensions,
}: UseLayoutWindowListenersParams) {
  // ResizeObserver for canvas container: safely only update state when width/height actually changes
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const newW = containerRef.current.offsetWidth || 800;
      const newH = containerRef.current.offsetHeight || 600;
      setDimensions(prev => (prev.width === newW && prev.height === newH) ? prev : { width: newW, height: newH });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(updateSize);
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', updateSize);
      if (ro) ro.disconnect();
    };
  }, [containerRef, setDimensions]);

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
}
