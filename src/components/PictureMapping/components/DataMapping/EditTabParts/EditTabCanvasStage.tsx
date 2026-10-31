import React, { useRef } from 'react';
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Line,
  Image as KonvaImage,
  Transformer,
  Text,
  Group,
} from 'react-konva';
import { UnitShape, ShapeType } from '../types';
import { EditCanvasUnitShape } from './EditCanvasUnitShape';
import { useEditCanvasDrawing } from './useEditCanvasInteractions';

interface EditTabCanvasStageProps {
  canvasSize: { width: number; height: number };
  scale: number;
  position: { x: number; y: number };
  setPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  stageRef: React.MutableRefObject<any>;
  activeTool: ShapeType | 'select' | 'edit-bg';
  setActiveTool: (tool: ShapeType | 'select' | 'edit-bg') => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedUnit: UnitShape | null;
  alignStep: 'none' | 'bg1' | 'bg2' | 'target1' | 'target2';
  setAlignStep: React.Dispatch<
    React.SetStateAction<'none' | 'bg1' | 'bg2' | 'target1' | 'target2'>
  >;
  alignPts: {
    bg1?: { x: number; y: number };
    bg2?: { x: number; y: number };
    target1?: { x: number; y: number };
  };
  setAlignPts: React.Dispatch<
    React.SetStateAction<{
      bg1?: { x: number; y: number };
      bg2?: { x: number; y: number };
      target1?: { x: number; y: number };
    }>
  >;
  image: HTMLImageElement | ImageBitmap | null | undefined;
  imagePos: { x: number; y: number };
  setImagePos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  imageScale: number;
  setImageScale: React.Dispatch<React.SetStateAction<number>>;
  bgRotation: number;
  isLocked: boolean;
  magneticGrid: boolean;
  gridSize: number;
  gridPattern: HTMLCanvasElement;
  units: UnitShape[];
  summaryMap: Map<string, any>;
  handleSetUnitsWithHistory: (units: UnitShape[]) => void;
  openNamingModal: () => Promise<string>;
  handleWheel: (e: any) => void;
  handleTouchMove: (e: any) => void;
  handleTouchEnd: () => void;
}

export const EditTabCanvasStage: React.FC<EditTabCanvasStageProps> = React.memo(
  ({
    canvasSize,
    scale,
    position,
    setPosition,
    stageRef,
    activeTool,
    setActiveTool,
    selectedId,
    setSelectedId,
    selectedUnit,
    alignStep,
    setAlignStep,
    alignPts,
    setAlignPts,
    image,
    imagePos,
    setImagePos,
    imageScale,
    setImageScale,
    bgRotation,
    isLocked,
    magneticGrid,
    gridSize,
    gridPattern,
    units,
    summaryMap,
    handleSetUnitsWithHistory,
    openNamingModal,
    handleWheel,
    handleTouchMove,
    handleTouchEnd,
  }) => {
    const trRef = useRef<any>(null);

    const {
      isDrawing,
      newShape,
      handleSelectCanvasUnit,
      handleDragEndCanvasUnit,
      handleTransformEndCanvasUnit,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleDoubleClick,
    } = useEditCanvasDrawing({
      units,
      activeTool,
      setActiveTool,
      selectedId,
      setSelectedId,
      alignStep,
      setAlignStep,
      alignPts,
      setAlignPts,
      imagePos,
      setImagePos,
      imageScale,
      setImageScale,
      magneticGrid,
      gridSize,
      handleSetUnitsWithHistory,
      openNamingModal,
      stageRef,
      trRef,
    });

    return (
      <div className="w-full h-full bg-[#141416]">
        <Stage
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDblClick={handleDoubleClick}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          scaleX={scale}
          scaleY={scale}
          x={position.x}
          y={position.y}
          ref={stageRef}
          draggable={activeTool === 'select' && !selectedId && alignStep === 'none'}
          style={{
            cursor:
              alignStep !== 'none'
                ? 'crosshair'
                : activeTool === 'edit-bg'
                  ? 'move'
                  : activeTool === 'select'
                    ? selectedId
                      ? 'default'
                      : 'grab'
                    : 'crosshair',
          }}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) {
              setPosition({ x: e.target.x(), y: e.target.y() });
            }
          }}
        >
          <Layer>
            {image && (
              <KonvaImage
                image={image}
                name="bgImage"
                x={imagePos.x}
                y={imagePos.y}
                scaleX={imageScale}
                scaleY={imageScale}
                rotation={bgRotation}
                perfectDrawEnabled={false}
                draggable={activeTool === 'edit-bg' && alignStep === 'none'}
                listening={isLocked || activeTool === 'edit-bg'}
                onDragEnd={(e) => {
                  if (activeTool === 'edit-bg' && e.target.name() === 'bgImage') {
                    setImagePos({ x: e.target.x(), y: e.target.y() });
                  }
                }}
              />
            )}
            {[
              { pt: alignPts.bg1, label: 'Point 1', color: '#f59e0b' },
              { pt: alignPts.bg2, label: 'Point 2', color: '#f59e0b' },
              { pt: alignPts.target1, label: 'Target 1a', color: '#10b981' },
            ].map(
              ({ pt, label, color }) =>
                pt && (
                  <Group key={label} x={pt.x} y={pt.y} listening={false}>
                    <Line
                      points={[-10, 0, 10, 0]}
                      stroke={color}
                      strokeWidth={2}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                    <Line
                      points={[0, -10, 0, 10]}
                      stroke={color}
                      strokeWidth={2}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                    <Circle
                      radius={3}
                      fill={color}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                    <Text
                      text={label}
                      x={8}
                      y={8}
                      fill={color}
                      fontSize={14}
                      fontStyle="bold"
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  </Group>
                )
            )}
            {magneticGrid && (
              <Rect
                x={-10000}
                y={-10000}
                width={20000}
                height={20000}
                fillPatternImage={gridPattern as any}
                fillPatternRepeat="repeat"
                fillPatternScale={{ x: 1 / scale, y: 1 / scale }}
                listening={false}
                perfectDrawEnabled={false}
                opacity={0.3}
              />
            )}
            {(() => {
              const showUnitLabels = scale > 0.4;
              const quantizedScale = Math.max(0.5, Math.round((scale || 1) * 4) / 4);
              const isSelectTool = activeTool === 'select';
              return units.map((unit) => (
                <EditCanvasUnitShape
                  key={unit.id}
                  unit={unit}
                  isSelected={selectedId === unit.id}
                  isSelectTool={isSelectTool}
                  showLabel={showUnitLabels}
                  quantizedScale={quantizedScale}
                  sizeValue={unit.name ? summaryMap.get(unit.name)?.size : undefined}
                  onSelectUnit={handleSelectCanvasUnit}
                  onDragEndUnit={handleDragEndCanvasUnit}
                  onTransformEndUnit={handleTransformEndCanvasUnit}
                />
              ));
            })()}
            {isDrawing && newShape && newShape.type === 'rect' && (
              <Rect
                x={newShape.x}
                y={newShape.y}
                width={newShape.width}
                height={newShape.height}
                fill="rgba(59, 130, 246, 0.4)"
                stroke="#3b82f6"
                strokeDasharray={[4, 4]}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            {isDrawing && newShape && newShape.type === 'circle' && (
              <Circle
                x={newShape.x}
                y={newShape.y}
                radius={newShape.radius}
                fill="rgba(59, 130, 246, 0.4)"
                stroke="#3b82f6"
                strokeDasharray={[4, 4]}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            {isDrawing && newShape && newShape.type === 'polygon' && (
              <Line
                points={newShape.points}
                fill="rgba(59, 130, 246, 0.4)"
                stroke="#3b82f6"
                strokeDasharray={[4, 4]}
                closed={false}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            <Transformer
              ref={trRef}
              enabledAnchors={selectedUnit?.locked ? [] : undefined}
              rotateEnabled={!selectedUnit?.locked}
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
              }
            />
          </Layer>
        </Stage>
      </div>
    );
  }
);
