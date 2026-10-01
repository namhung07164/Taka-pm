import { useState, useRef, useEffect, useCallback } from 'react';
import { formatDisplayDateTime } from '../../lib/utils';
import { executeTriggerExportProcess } from '../PictureMapping/lib/dynamicExportService';

interface UseLiveLayoutWindowEventsParams {
  stageRef: React.RefObject<any>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  fitToScreen: (animated?: boolean) => void;
  setStageScale: (scale: number) => void;
  setStagePos: (pos: { x: number; y: number }) => void;
  targetUnitSearch?: string | null;
  zoomAndPanToUnit: (target: string) => void;
  setFocusedUnitId: (id: string | null) => void;
  focusedUnitId: string | null;
  onClearFocus?: () => void;
  isPinnedRef: React.MutableRefObject<boolean>;
  setHoverInfo: React.Dispatch<React.SetStateAction<any>>;
  isPrintPreview: boolean;
  storeFilter: string;
  targetLoc: string;
  effectiveLayoutYear: string;
  onRefreshConfig?: () => Promise<void> | void;
}

export function useLiveLayoutWindowEvents({
  stageRef,
  containerRef,
  fitToScreen,
  setStageScale,
  setStagePos,
  targetUnitSearch,
  zoomAndPanToUnit,
  setFocusedUnitId,
  focusedUnitId,
  onClearFocus,
  isPinnedRef,
  setHoverInfo,
  isPrintPreview,
  storeFilter,
  targetLoc,
  effectiveLayoutYear,
  onRefreshConfig,
}: UseLiveLayoutWindowEventsParams) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const lastHandledSearchRef = useRef<string | null>(null);

  // Check stored unit images
  const hasStoredUnitImages = useCallback((key: string | undefined | null): boolean => {
    if (!key) return false;
    try {
      const cleanKey = key.trim().toLowerCase();
      const stored = localStorage.getItem(`unit_images_${cleanKey}`);
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }, []);

  // Container Resize Observer
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({
          width: clientWidth || 800,
          height: clientHeight || 600,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [containerRef]);

  // RAF Throttled Tooltip Positioning
  const rafTooltipIdRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (rafTooltipIdRef.current !== null) cancelAnimationFrame(rafTooltipIdRef.current);
    };
  }, []);

  const updateTooltipPos = useCallback((clientX: number, clientY: number) => {
    if (rafTooltipIdRef.current !== null) cancelAnimationFrame(rafTooltipIdRef.current);
    rafTooltipIdRef.current = requestAnimationFrame(() => {
      rafTooltipIdRef.current = null;
      if (!tooltipRef.current) return;
      const el = tooltipRef.current;
      const tWidth = el.offsetWidth || 340;
      const tHeight = el.offsetHeight || 260;
      const pad = 16;
      let left = clientX + pad;
      let top = clientY + pad;
      if (left + tWidth > window.innerWidth - pad) {
        left = clientX - tWidth - pad;
      }
      if (top + tHeight > window.innerHeight - pad) {
        top = clientY - tHeight - pad;
      }
      left = Math.max(pad, Math.min(left, window.innerWidth - tWidth - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - tHeight - pad));
      el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    });
  }, []);

  // Search auto-zoom
  useEffect(() => {
    if (targetUnitSearch && targetUnitSearch.trim()) {
      const cleanSearch = targetUnitSearch.trim().toLowerCase();
      if (cleanSearch !== lastHandledSearchRef.current) {
        lastHandledSearchRef.current = cleanSearch;
        zoomAndPanToUnit(cleanSearch);
      }
    } else {
      lastHandledSearchRef.current = null;
      setFocusedUnitId(null);
    }
  }, [targetUnitSearch, zoomAndPanToUnit, setFocusedUnitId]);

  // Escape hotkey
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (focusedUnitId) {
          setFocusedUnitId(null);
          if (onClearFocus) onClearFocus();
          fitToScreen(true);
        }
        if (isPinnedRef.current) {
          isPinnedRef.current = false;
          setHoverInfo(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedUnitId, onClearFocus, fitToScreen, isPinnedRef, setHoverInfo, setFocusedUnitId]);

  // Print Preview auto-fit
  const prevPrintPreviewRef = useRef(isPrintPreview);
  useEffect(() => {
    if (isPrintPreview !== prevPrintPreviewRef.current) {
      prevPrintPreviewRef.current = isPrintPreview;
      const timer = setTimeout(() => fitToScreen(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isPrintPreview, fitToScreen]);

  // PNG Export Handler
  const handleExport = useCallback(() => {
    if (!stageRef.current) return;
    const oldScale = stageRef.current.scaleX();
    const oldPos = { ...stageRef.current.position() };
    fitToScreen(false);
    setTimeout(() => {
      try {
        const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
        const dataURL = stageRef.current.toDataURL({
          pixelRatio: isIOS ? 1.2 : 2.0,
          mimeType: 'image/png'
        });
        const link = document.createElement('a');
        link.download = `Takashimaya_Layout_${storeFilter}_${targetLoc}_${effectiveLayoutYear}_${formatDisplayDateTime(new Date().toISOString()).replace(/[/:]/g, '-')}.png`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error('Export PNG failed:', err);
      } finally {
        stageRef.current.scale({ x: oldScale, y: oldScale });
        stageRef.current.position(oldPos);
        stageRef.current.batchDraw();
        setStageScale(oldScale);
        setStagePos(oldPos);
      }
    }, 150);
  }, [stageRef, fitToScreen, storeFilter, targetLoc, effectiveLayoutYear, setStageScale, setStagePos]);

  useEffect(() => {
    const handleExportPngEvent = () => handleExport();
    window.addEventListener('export-png', handleExportPngEvent);
    return () => window.removeEventListener('export-png', handleExportPngEvent);
  }, [handleExport]);

  // Trigger export to R2
  const handleTriggerExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportStatus('Đang khởi tạo...');
    try {
      const targetStore = storeFilter === 'HN' ? 'HN' : 'HCM';
      const res = await executeTriggerExportProcess(targetStore, (status) => {
        setExportStatus(status);
      });
      if (res.success) {
        alert(res.message || 'Xuất bản vẽ và đồng bộ Cloud R2 thành công!');
        if (onRefreshConfig) onRefreshConfig();
      } else {
        alert(`Lỗi xuất dữ liệu: ${res.message || 'Không thành công'}`);
      }
    } catch (e: any) {
      alert(`Đã xảy ra lỗi khi xuất file: ${e.message}`);
    } finally {
      setIsExporting(false);
      setExportStatus('');
    }
  }, [isExporting, storeFilter, onRefreshConfig]);

  return {
    tooltipRef,
    dimensions,
    isExporting,
    exportStatus,
    updateTooltipPos,
    hasStoredUnitImages,
    handleExport,
    handleTriggerExport,
  };
}
