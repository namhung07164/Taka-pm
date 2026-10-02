import React from 'react';
import { Stage, Layer, FastLayer, Image as KonvaImage, Rect, Group } from 'react-konva';
import { LayoutUnitShape } from '../LayoutTabParts/LayoutUnitShape';
import { Project } from '../../types';

interface LiveLayoutCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<any>;
  dimensions: { width: number; height: number };
  bgImage: CanvasImageSource | null;
  version: any;
  visibleUnits: any[];
  focusedUnit: any;
  focusedUnitId: string | null;
  stageScale: number;
  stagePos: { x: number; y: number };
  selectedLegendGroupId: string | null;
  layoutTooltipVisibility: any;
  aggregatedData: Record<string, any>;
  hasStoredUnitImages: (key: string | undefined | null) => boolean;
  isPinnedRef: React.MutableRefObject<boolean>;
  isInteractingRef: React.MutableRefObject<boolean>;
  miniGanttProject: Project | null;
  isProjectModalOpen: boolean;
  setHoverInfo: React.Dispatch<React.SetStateAction<any>>;
  updateTooltipPos: (clientX: number, clientY: number) => void;
  // Gesture handlers & refs
  handleDragStart: () => void;
  handleDragMove: () => void;
  handleDragEnd: (e: any) => void;
  touchStateRef: React.MutableRefObject<any>;
  pendingTouchRef: React.MutableRefObject<any>;
  rafTouchIdRef: React.MutableRefObject<any>;
  wheelTimeoutRef: React.MutableRefObject<any>;
  pendingWheelDeltaRef: React.MutableRefObject<any>;
  rafWheelIdRef: React.MutableRefObject<any>;
  lastWheelPointerRef: React.MutableRefObject<any>;
  stopInertia: () => void;
  fitToScreen: (animated?: boolean) => void;
  setStageScale: (scale: number) => void;
  setStagePos: (pos: { x: number; y: number }) => void;
}

export const LiveLayoutCanvas: React.FC<LiveLayoutCanvasProps> = ({
  containerRef,
  stageRef,
  dimensions,
  bgImage,
  version,
  visibleUnits,
  focusedUnit,
  focusedUnitId,
  stageScale,
  stagePos,
  selectedLegendGroupId,
  layoutTooltipVisibility,
  aggregatedData,
  hasStoredUnitImages,
  isPinnedRef,
  isInteractingRef,
  miniGanttProject,
  isProjectModalOpen,
  setHoverInfo,
  updateTooltipPos,
  handleDragStart,
  handleDragMove,
  handleDragEnd,
  touchStateRef,
  pendingTouchRef,
  rafTouchIdRef,
  wheelTimeoutRef,
  pendingWheelDeltaRef,
  rafWheelIdRef,
  lastWheelPointerRef,
  stopInertia,
  fitToScreen,
  setStageScale,
  setStagePos,
}) => {
  const isLegendColorOn = layoutTooltipVisibility?.legendColor !== false;

  const handleTouchStart = (e: any) => {
    if (e.evt.touches.length === 2) {
      e.evt.preventDefault();
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
  };

  const handleTouchMove = (e: any) => {
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
  };

  const handleTouchEnd = () => {
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
  };

  const handleWheel = (e: any) => {
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
        const zoomFactor = Math.exp(-deltaY * 0.002);
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
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-grab active:cursor-grabbing select-none overflow-hidden touch-none"
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        draggable={true}
        scale={{ x: stageScale, y: stageScale }}
        position={stagePos}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        {/* Layer 1: Static FastLayer for background CAD layout image to bypass hit-graph calculations */}
        <FastLayer listening={false}>
          {bgImage && (
            <KonvaImage
              image={bgImage}
              listening={false}
              perfectDrawEnabled={false}
              x={version?.imagePos?.x || 0}
              y={version?.imagePos?.y || 0}
              scaleX={version?.imageScale || 1}
              scaleY={version?.imageScale || 1}
              rotation={version?.backgroundRotation || 0}
            />
          )}
        </FastLayer>

        {/* Layer 2: Interactive unit shapes, text, and alert badges */}
        <Layer id="units-interactive-layer">
          {visibleUnits.map((unit: any) => {
            const isFocused = focusedUnitId === unit.id;
            return (
              <LayoutUnitShape
                key={unit.id}
                unit={unit}
                isFocused={isFocused}
                isLegendColorOn={isLegendColorOn}
                selectedLegendGroupId={selectedLegendGroupId}
                stageScale={stageScale}
                aggregatedData={aggregatedData}
                hasStoredUnitImages={hasStoredUnitImages}
                isInteracting={isInteractingRef.current}
                isPinned={isPinnedRef.current}
                hasMiniGantt={Boolean(miniGanttProject)}
                onUnitMouseEnter={(u, e) => {
                  if (isInteractingRef.current || isPinnedRef.current || Boolean(miniGanttProject)) return;
                  try {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'pointer';
                    const uName = (u.name || '').toLowerCase();
                    setHoverInfo({
                      visible: true,
                      data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
                      unitName: u.name || 'Unknown',
                      clientX: e.evt.clientX,
                      clientY: e.evt.clientY,
                    });
                    setTimeout(() => updateTooltipPos(e.evt.clientX, e.evt.clientY), 0);
                  } catch (err) {
                    console.error("Defensive Check: Error onMouseEnter unit in LiveLayoutViewer:", err, u);
                  }
                }}
                onUnitMouseMove={(_u, e) => {
                  if (isInteractingRef.current || isPinnedRef.current || Boolean(miniGanttProject)) return;
                  try {
                    updateTooltipPos(e.evt.clientX, e.evt.clientY);
                  } catch (err) {
                    console.error("Defensive Check: Error onMouseMove unit in LiveLayoutViewer:", err, _u);
                  }
                }}
                onUnitMouseLeave={(e) => {
                  try {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'grab';
                    if (isPinnedRef.current || Boolean(miniGanttProject)) return;
                    setHoverInfo(null);
                  } catch (err) {
                    console.error("Defensive Check: Error onMouseLeave unit in LiveLayoutViewer:", err);
                  }
                }}
                onUnitClick={(u, e) => {
                  if (isInteractingRef.current || Boolean(miniGanttProject)) return;
                  try {
                    isPinnedRef.current = true;
                    const uName = (u.name || '').toLowerCase();
                    setHoverInfo({
                      visible: true,
                      data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
                      unitName: u.name || 'Unknown',
                      clientX: e.evt.clientX,
                      clientY: e.evt.clientY,
                    });
                    setTimeout(() => updateTooltipPos(e.evt.clientX, e.evt.clientY), 0);
                  } catch (err) {
                    console.error("Defensive Check: Error onClick unit in LiveLayoutViewer:", err, u);
                  }
                }}
                onUnitTap={(u, e) => {
                  if (isInteractingRef.current || Boolean(miniGanttProject)) return;
                  try {
                    isPinnedRef.current = true;
                    const clientX = e.evt.changedTouches ? e.evt.changedTouches[0].clientX : e.evt.clientX;
                    const clientY = e.evt.changedTouches ? e.evt.changedTouches[0].clientY : e.evt.clientY;
                    const uName = (u.name || '').toLowerCase();
                    setHoverInfo({
                      visible: true,
                      data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
                      unitName: u.name || 'Unknown',
                      clientX,
                      clientY,
                    });
                    setTimeout(() => updateTooltipPos(clientX, clientY), 0);
                  } catch (err) {
                    console.error("Defensive Check: Error onTap unit in LiveLayoutViewer:", err, u);
                  }
                }}
              />
            );
          })}
        </Layer>

        {/* Layer 3: Dynamic Isolated Overlay Layer for Focused Unit Golden Ring */}
        <Layer id="overlay-highlight-layer" listening={false}>
          {focusedUnit && (
            <Group listening={false}>
              <Rect
                x={(focusedUnit.textX || focusedUnit.x || 0) - 4}
                y={(focusedUnit.textY || focusedUnit.y || 0) - 4}
                width={(focusedUnit.textWidth || focusedUnit.width || 100) + 8}
                height={(focusedUnit.textHeight || focusedUnit.height || 40) + 8}
                stroke="#f59e0b"
                strokeWidth={2.5}
                strokeScaleEnabled={false}
                dash={[6, 4]}
                cornerRadius={6}
                shadowColor="#f59e0b"
                shadowBlur={10}
                shadowOpacity={0.8}
                listening={false}
                perfectDrawEnabled={false}
              />
            </Group>
          )}
        </Layer>
      </Stage>
    </div>
  );
};
