import React, { FC, memo } from 'react';
import { Stage } from 'react-konva';
import { LayoutKonvaLayers } from './LayoutKonvaLayers';
import { ContrastStyle } from './layoutViewerTypes';

interface LayoutCanvasViewportProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<any>;
  dimensions: { width: number; height: number };
  stageScale: number;
  setStageScale: (s: number) => void;
  stagePos: { x: number; y: number };
  setStagePos: (pos: { x: number; y: number }) => void;
  pixelRatio: number;
  isProjectModalOpen: boolean;
  miniGanttProject: any;
  handleDragStart: () => void;
  handleDragMove: () => void;
  handleDragEnd: () => void;
  stopInertia: () => void;
  isPinnedRef: React.MutableRefObject<boolean>;
  setHoverInfo: (info: any) => void;
  touchStateRef: React.MutableRefObject<any>;
  pendingTouchRef: React.MutableRefObject<any>;
  rafTouchIdRef: React.MutableRefObject<number | null>;
  isInteractingRef: React.MutableRefObject<boolean>;
  fitToScreen: (animated?: boolean) => void;
  lastWheelPointerRef: React.MutableRefObject<any>;
  pendingWheelDeltaRef: React.MutableRefObject<number>;
  rafWheelIdRef: React.MutableRefObject<number | null>;
  wheelTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  bgImage: any;
  version: any;
  visibleUnits: any[];
  layoutTooltipVisibility: any;
  focusedUnitId: string | null;
  selectedLegendGroupId: string | null;
  getContrastStyle: (color: string) => ContrastStyle;
  aggregatedData: Record<string, any>;
  focusedUnit: any;
  handleMouseEnterUnit: (unit: any, e: any) => void;
  handleMouseMoveUnit: (unit: any, e: any) => void;
  handleMouseLeaveUnit: (unit: any, e: any) => void;
  handleClickUnit: (unit: any, e: any) => void;
  handleTapUnit: (unit: any, e: any) => void;
  hasStoredUnitImages: (key: string | undefined | null, store?: string) => boolean;
  storeFilter?: string;
}

export const LayoutCanvasViewport: React.FC<LayoutCanvasViewportProps> = React.memo(({
  containerRef,
  stageRef,
  dimensions,
  stageScale,
  setStageScale,
  stagePos,
  setStagePos,
  pixelRatio,
  isProjectModalOpen,
  miniGanttProject,
  handleDragStart,
  handleDragMove,
  handleDragEnd,
  stopInertia,
  isPinnedRef,
  setHoverInfo,
  touchStateRef,
  pendingTouchRef,
  rafTouchIdRef,
  isInteractingRef,
  fitToScreen,
  lastWheelPointerRef,
  pendingWheelDeltaRef,
  rafWheelIdRef,
  wheelTimeoutRef,
  bgImage,
  version,
  visibleUnits,
  layoutTooltipVisibility,
  focusedUnitId,
  selectedLegendGroupId,
  getContrastStyle,
  aggregatedData,
  focusedUnit,
  handleMouseEnterUnit,
  handleMouseMoveUnit,
  handleMouseLeaveUnit,
  handleClickUnit,
  handleTapUnit,
  hasStoredUnitImages,
  storeFilter,
}) => {
  return (
    <div 
      id="live-layout-canvas-container"
      ref={containerRef} 
      className="flex-grow w-full h-full relative cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    >
      <Stage 
        ref={stageRef} 
        width={dimensions.width} 
        height={dimensions.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        pixelRatio={pixelRatio}
        draggable={!isProjectModalOpen && !miniGanttProject}
        style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onClick={(e) => {
          if (document.body.classList.contains('lightbox-open')) return;
          if (isProjectModalOpen || Boolean(miniGanttProject)) return;
          stopInertia();
          if (e.target === stageRef.current) {
            isPinnedRef.current = false;
            setHoverInfo(null);
          }
        }}
        onTap={(e) => {
          if (document.body.classList.contains('lightbox-open')) return;
          if (isProjectModalOpen || Boolean(miniGanttProject)) return;
          stopInertia();
          if (e.target === stageRef.current) {
            isPinnedRef.current = false;
            setHoverInfo(null);
          }
        }}
        onDblClick={() => {
          if (isProjectModalOpen || Boolean(miniGanttProject)) return;
          stopInertia();
          const stage = stageRef.current;
          if (!stage) return;
          const pointer = stage.getPointerPosition();
          if (!pointer) return;
          const oldScale = stage.scaleX();
          const newScale = oldScale > 2.5 ? Math.max(0.1, oldScale / 2.2) : Math.min(20, oldScale * 2.2);
          const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
          };
          const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
          };
          stage.to({
            scaleX: newScale,
            scaleY: newScale,
            x: newPos.x,
            y: newPos.y,
            duration: 0.22,
            easing: (window as any).Konva?.Easings?.EaseOut,
            onFinish: () => {
              setStageScale(newScale);
              setStagePos(newPos);
            }
          });
        }}
        onTouchStart={(e) => {
          if (document.body.classList.contains('lightbox-open')) return;
          if (isProjectModalOpen || Boolean(miniGanttProject)) return;
          stopInertia();
          if (e.evt.touches.length === 2) {
            const touch1 = e.evt.touches[0];
            const touch2 = e.evt.touches[1];
            const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
            const center = {
              x: (touch1.clientX + touch2.clientX) / 2,
              y: (touch1.clientY + touch2.clientY) / 2,
            };
            touchStateRef.current = { lastDist: dist, lastCenter: center, lastTap: 0 };
            const stage = stageRef.current;
            if (stage) stage.draggable(false);
            isInteractingRef.current = true;
            setHoverInfo(null);
          } else if (e.evt.touches.length === 1) {
            const now = Date.now();
            if (now - touchStateRef.current.lastTap < 300) {
              fitToScreen(true);
              touchStateRef.current.lastTap = 0;
            } else {
              touchStateRef.current.lastTap = now;
            }
          }
        }}
        onTouchMove={(e) => {
          if (document.body.classList.contains('lightbox-open')) return;
          if (e.evt.touches.length === 2) {
            e.evt.preventDefault();
            const touch1 = e.evt.touches[0];
            const touch2 = e.evt.touches[1];
            const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
            const center = {
              x: (touch1.clientX + touch2.clientX) / 2,
              y: (touch1.clientY + touch2.clientY) / 2,
            };
            pendingTouchRef.current = { dist, center };

            if (rafTouchIdRef.current === null) {
              rafTouchIdRef.current = requestAnimationFrame(() => {
                rafTouchIdRef.current = null;
                if (!pendingTouchRef.current) return;
                const { dist: curDist, center: curCenter } = pendingTouchRef.current;
                const { lastDist, lastCenter } = touchStateRef.current;
                const stage = stageRef.current;
                if (stage && lastDist > 0 && lastCenter) {
                  const oldScale = stage.scaleX();
                  const scaleDelta = curDist / lastDist;
                  const newScale = Math.max(0.04, Math.min(oldScale * scaleDelta, 20));
                  
                  const stageBox = stage.container().getBoundingClientRect();
                  const lastPointerX = lastCenter.x - stageBox.left;
                  const lastPointerY = lastCenter.y - stageBox.top;
                  const currentPointerX = curCenter.x - stageBox.left;
                  const currentPointerY = curCenter.y - stageBox.top;

                  const worldPointX = (lastPointerX - stage.x()) / oldScale;
                  const worldPointY = (lastPointerY - stage.y()) / oldScale;

                  const newPos = {
                    x: currentPointerX - worldPointX * newScale,
                    y: currentPointerY - worldPointY * newScale,
                  };

                  stage.scale({ x: newScale, y: newScale });
                  stage.position(newPos);
                  stage.batchDraw();

                  touchStateRef.current.lastDist = curDist;
                  touchStateRef.current.lastCenter = curCenter;
                }
              });
            }
          }
        }}
        onTouchEnd={() => {
          if (document.body.classList.contains('lightbox-open')) return;
          if (rafTouchIdRef.current !== null) {
            cancelAnimationFrame(rafTouchIdRef.current);
            rafTouchIdRef.current = null;
          }
          pendingTouchRef.current = null;
          touchStateRef.current.lastDist = 0;
          touchStateRef.current.lastCenter = null;
          const stage = stageRef.current;
          if (stage) {
            stage.draggable(true);
            setStageScale(stage.scaleX());
            setStagePos({ x: stage.x(), y: stage.y() });
          }
          isInteractingRef.current = false;
        }}
        onWheel={(e) => {
          if (document.body.classList.contains('lightbox-open')) return;
          if (isProjectModalOpen || Boolean(miniGanttProject)) return;
          e.evt.preventDefault();
          stopInertia();
          const stage = stageRef.current;
          if (!stage) return;
          
          isInteractingRef.current = true;
          setHoverInfo(null);

          const pointer = stage.getPointerPosition();
          if (!pointer) return;

          lastWheelPointerRef.current = pointer;
          pendingWheelDeltaRef.current += e.evt.deltaY;

          if (rafWheelIdRef.current === null) {
            rafWheelIdRef.current = requestAnimationFrame(() => {
              rafWheelIdRef.current = null;
              const currentStage = stageRef.current;
              const ptr = lastWheelPointerRef.current;
              if (!currentStage || !ptr) return;

              const deltaY = pendingWheelDeltaRef.current;
              pendingWheelDeltaRef.current = 0;

              const oldScale = currentStage.scaleX();
              const zoomFactor = Math.exp(-deltaY * 0.0008);
              const newScale = Math.max(0.04, Math.min(oldScale * zoomFactor, 20));

              const mousePointTo = {
                x: (ptr.x - currentStage.x()) / oldScale,
                y: (ptr.y - currentStage.y()) / oldScale,
              };

              const newPos = {
                x: ptr.x - mousePointTo.x * newScale,
                y: ptr.y - mousePointTo.y * newScale,
              };

              currentStage.scale({ x: newScale, y: newScale });
              currentStage.position(newPos);
              currentStage.batchDraw();

              if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
              wheelTimeoutRef.current = setTimeout(() => {
                setStageScale(currentStage.scaleX());
                setStagePos({ x: currentStage.x(), y: currentStage.y() });
                isInteractingRef.current = false;
              }, 120);
            });
          }
        }}
      >
        <LayoutKonvaLayers
          bgImage={bgImage}
          version={version}
          visibleUnits={visibleUnits}
          layoutTooltipVisibility={layoutTooltipVisibility}
          focusedUnitId={focusedUnitId}
          selectedLegendGroupId={selectedLegendGroupId}
          getContrastStyle={getContrastStyle}
          stageScale={stageScale}
          aggregatedData={aggregatedData}
          focusedUnit={focusedUnit}
          onMouseEnterUnit={handleMouseEnterUnit}
          onMouseMoveUnit={handleMouseMoveUnit}
          onMouseLeaveUnit={handleMouseLeaveUnit}
          onClickUnit={handleClickUnit}
          onTapUnit={handleTapUnit}
          hasStoredUnitImages={hasStoredUnitImages}
          storeFilter={storeFilter}
        />
      </Stage>
    </div>
  );
});
