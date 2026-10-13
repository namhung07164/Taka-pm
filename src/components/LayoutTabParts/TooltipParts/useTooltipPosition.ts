import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { TooltipHoverInfo } from './tooltipTypes';

interface UseTooltipPositionParams {
  hoverInfo: TooltipHoverInfo;
  tooltipRef: React.RefObject<HTMLDivElement>;
  containerRef?: React.RefObject<HTMLDivElement>;
  showImagePanel: boolean;
}

export function useTooltipPosition({
  hoverInfo,
  tooltipRef,
  containerRef,
  showImagePanel,
}: UseTooltipPositionParams) {
  const isDraggingRef = useRef(false);
  const hasUserDraggedRef = useRef(false);
  const hasInitialPositionRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialLeft: number; initialTop: number }>({
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('input')) {
      return;
    }
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    isDraggingRef.current = true;
    hasUserDraggedRef.current = true;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: rect.left,
      initialTop: rect.top
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const el = tooltipRef.current;
    if (!el) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const newLeft = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, dragStartRef.current.initialLeft + dx));
    const newTop = Math.max(60, Math.min(window.innerHeight - el.offsetHeight - 8, dragStartRef.current.initialTop + dy));
    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
    el.style.right = 'auto';
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Reset user dragged flag and initial position flag whenever a new unit is searched/focused
  useEffect(() => {
    hasUserDraggedRef.current = false;
    hasInitialPositionRef.current = false;
  }, [hoverInfo.unitName, hoverInfo.clientX, hoverInfo.clientY]);

  // Auto Anti-Collision & Obstruction-Proof Positioning Engine
  const positionTooltip = useCallback((forceRecalculate = false) => {
    if (!tooltipRef.current || hasUserDraggedRef.current) return;
    if (hasInitialPositionRef.current && !forceRecalculate) return;

    const el = tooltipRef.current;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = rect.width > 0 ? rect.width : 350;
    const tooltipHeight = rect.height > 0 ? rect.height : 220;

    const viewportWidth = window.innerWidth;
    const visualVp = typeof window !== 'undefined' ? window.visualViewport : null;
    const viewportHeight = visualVp ? visualVp.height : window.innerHeight;
    const isMobile = viewportWidth < 640;

    const pad = 12;
    // Bottom clearance: 80px on mobile to leave room for Menu button & Home indicator, 64px on desktop
    const bottomMargin = isMobile ? 80 : 64;

    // Calculate safe top clearance to ensure the tooltip is NEVER covered by the App Header or Layout toolbars
    let safeTop = isMobile ? 152 : 115;

    // 1. Check if the map container element exists
    const containerEl = containerRef?.current || (typeof document !== 'undefined' ? (document.getElementById('live-layout-canvas-container') || document.querySelector('.cursor-grab')) : null);
    if (containerEl) {
      const cRect = containerEl.getBoundingClientRect();
      if (cRect.top > 0) {
        // Place below the container top and clear floating top controls (HCM • L1 & Zoom)
        safeTop = Math.max(safeTop, cRect.top + (isMobile ? 48 : 42));
      }
    }

    // 2. Also inspect the App Header (.sticky or header)
    if (typeof document !== 'undefined') {
      const headerEl = document.querySelector('.sticky.top-0') || document.querySelector('header');
      if (headerEl) {
        const hRect = headerEl.getBoundingClientRect();
        if (hRect.bottom > 0) {
          safeTop = Math.max(safeTop, hRect.bottom + (isMobile ? 64 : 50));
        }
      }
    }

    const bounds = hoverInfo.unitScreenBounds;

    if (isMobile) {
      // Mobile: Horizontal Auto-Centering with 12px margin
      const left = pad;
      const right = pad;
      
      let top = safeTop;
      if (!showImagePanel && bounds) {
        if (bounds.centerY > viewportHeight * 0.52) {
          top = safeTop;
        } else {
          top = Math.max(safeTop, viewportHeight - tooltipHeight - bottomMargin);
        }
      }

      el.style.position = 'fixed';
      el.style.zIndex = '999999';
      el.style.left = `${left}px`;
      el.style.right = `${right}px`;
      el.style.top = `${Math.max(safeTop, top)}px`;
      el.style.width = `calc(100vw - ${pad * 2}px)`;
      el.style.maxWidth = '420px';
      el.style.maxHeight = `calc(${Math.max(160, viewportHeight - safeTop - bottomMargin)}px)`;
      el.style.margin = '0 auto';
      el.style.transform = 'none';
    } else {
      // Desktop / Tablet: Smart 4-Way Anti-Obstruction Clamping
      let left: number;
      let top: number;

      if (bounds) {
        const spaceRight = viewportWidth - bounds.right;
        const spaceLeft = bounds.left;

        if (spaceRight >= tooltipWidth + pad + 20) {
          // Place cleanly to the right of the unit
          left = bounds.right + 24;
        } else if (spaceLeft >= tooltipWidth + pad + 20) {
          // Place cleanly to the left of the unit
          left = bounds.left - tooltipWidth - 24;
        } else {
          left = Math.max(pad, viewportWidth - tooltipWidth - pad);
        }
        top = Math.max(safeTop, Math.min(bounds.top, viewportHeight - tooltipHeight - bottomMargin));
      } else {
        const clientX = hoverInfo.clientX !== undefined ? hoverInfo.clientX : viewportWidth / 2;
        const clientY = hoverInfo.clientY !== undefined ? hoverInfo.clientY : viewportHeight / 2;

        left = clientX + 16;
        if (left + tooltipWidth > viewportWidth - pad) {
          left = clientX - tooltipWidth - 16;
        }
        left = Math.max(pad, Math.min(left, viewportWidth - tooltipWidth - pad));

        top = clientY + 16;
        if (top + tooltipHeight > viewportHeight - bottomMargin) {
          top = clientY - tooltipHeight - 16;
        }
        top = Math.max(safeTop, Math.min(top, viewportHeight - tooltipHeight - bottomMargin));
      }

      el.style.position = 'fixed';
      el.style.zIndex = '999999';
      el.style.left = `${left}px`;
      el.style.right = 'auto';
      el.style.top = `${top}px`;
      el.style.width = '370px';
      el.style.maxWidth = `calc(100vw - ${pad * 2}px)`;
      el.style.maxHeight = `calc(${Math.max(160, viewportHeight - safeTop - bottomMargin)}px)`;
      el.style.margin = '0';
      el.style.transform = 'none';
    }

    hasInitialPositionRef.current = true;
  }, [hoverInfo.clientX, hoverInfo.clientY, hoverInfo.unitScreenBounds, tooltipRef, containerRef, showImagePanel]);

  useLayoutEffect(() => {
    positionTooltip();
  }, [positionTooltip]);

  // Handle browser window resize cleanly without jumping on internal input focus or size changes
  useEffect(() => {
    if (!tooltipRef.current) return;
    const handleWindowResize = () => {
      positionTooltip(true);
    };
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [positionTooltip, tooltipRef]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    positionTooltip,
  };
}
