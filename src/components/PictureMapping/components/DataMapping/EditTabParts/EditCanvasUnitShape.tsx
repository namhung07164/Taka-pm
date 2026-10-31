import React, { memo } from 'react';
import { Rect, Circle, Line, Text } from 'react-konva';
import { UnitShape } from '../types';

export interface EditCanvasUnitShapeProps {
  unit: UnitShape;
  isSelected: boolean;
  isSelectTool: boolean;
  showLabel: boolean;
  quantizedScale: number;
  sizeValue?: number;
  onSelectUnit: (unitId: string, unit: UnitShape) => void;
  onDragEndUnit: (unitId: string, rawX: number, rawY: number) => void;
  onTransformEndUnit: (unit: UnitShape, node: any) => void;
}

export const EditCanvasUnitShape = memo(function EditCanvasUnitShape({
  unit,
  isSelected,
  isSelectTool,
  showLabel,
  quantizedScale,
  sizeValue,
  onSelectUnit,
  onDragEndUnit,
  onTransformEndUnit,
}: EditCanvasUnitShapeProps) {
  if (!unit.visible) return null;

  const editFill =
    unit.fill &&
    unit.fill !== 'rgba(0, 0, 0, 0.001)' &&
    unit.fill !== 'transparent' &&
    !unit.fill.startsWith('rgba(0,0,0,0')
      ? unit.fill
      : '#3b82f6';

  const isDraggable = isSelectTool && !unit.locked;

  return (
    <>
      {unit.type === 'rect' && (
        <Rect
          id={unit.id}
          x={unit.x}
          y={unit.y}
          width={unit.width}
          height={unit.height}
          fill={editFill}
          opacity={unit.opacity ?? 0.5}
          rotation={unit.rotation || 0}
          stroke={isSelected ? '#3b82f6' : 'rgba(0,0,0,0.3)'}
          strokeWidth={isSelected ? 3 : 2}
          shadowEnabled={isSelected}
          shadowBlur={isSelected ? 10 : 0}
          shadowColor="#3b82f6"
          shadowForStrokeEnabled={false}
          perfectDrawEnabled={false}
          draggable={isDraggable}
          onClick={() => onSelectUnit(unit.id, unit)}
          onDragEnd={(e) => onDragEndUnit(unit.id, e.target.x(), e.target.y())}
          onTransformEnd={(e) => onTransformEndUnit(unit, e.target)}
        />
      )}
      {unit.type === 'circle' && (
        <Circle
          id={unit.id}
          x={unit.x}
          y={unit.y}
          radius={unit.radius}
          fill={editFill}
          opacity={unit.opacity ?? 0.5}
          rotation={unit.rotation || 0}
          stroke={isSelected ? '#3b82f6' : 'rgba(0,0,0,0.3)'}
          strokeWidth={isSelected ? 3 : 2}
          shadowEnabled={isSelected}
          shadowBlur={isSelected ? 10 : 0}
          shadowColor="#3b82f6"
          shadowForStrokeEnabled={false}
          perfectDrawEnabled={false}
          draggable={isDraggable}
          onClick={() => onSelectUnit(unit.id, unit)}
          onDragEnd={(e) => onDragEndUnit(unit.id, e.target.x(), e.target.y())}
          onTransformEnd={(e) => onTransformEndUnit(unit, e.target)}
        />
      )}
      {unit.type === 'polygon' && (
        <Line
          id={unit.id}
          x={unit.x || 0}
          y={unit.y || 0}
          points={unit.points}
          fill={editFill}
          opacity={unit.opacity ?? 0.5}
          rotation={unit.rotation || 0}
          stroke={isSelected ? '#3b82f6' : 'rgba(0,0,0,0.3)'}
          strokeWidth={isSelected ? 3 : 2}
          shadowEnabled={isSelected}
          shadowBlur={isSelected ? 10 : 0}
          shadowColor="#3b82f6"
          shadowForStrokeEnabled={false}
          perfectDrawEnabled={false}
          closed
          draggable={isDraggable}
          onClick={() => onSelectUnit(unit.id, unit)}
          onDragEnd={(e) => onDragEndUnit(unit.id, e.target.x(), e.target.y())}
          onTransformEnd={(e) => onTransformEndUnit(unit, e.target)}
        />
      )}
      {unit.name && showLabel && (() => {
        const sizeLabel = sizeValue ? `${unit.name}\n${sizeValue} SQM` : unit.name;

        let minPtX = Infinity;
        let maxPtX = -Infinity;
        let minPtY = Infinity;
        let maxPtY = -Infinity;
        if (unit.points && unit.points.length >= 2) {
          for (let i = 0; i < unit.points.length; i += 2) {
            const px = unit.points[i];
            const py = unit.points[i + 1];
            if (px < minPtX) minPtX = px;
            if (px > maxPtX) maxPtX = px;
            if (py < minPtY) minPtY = py;
            if (py > maxPtY) maxPtY = py;
          }
        }
        const hasPts = minPtX !== Infinity;

        const textX =
          unit.type === 'rect'
            ? unit.x || 0
            : unit.type === 'circle'
            ? (unit.x || 0) - (unit.radius || 0)
            : hasPts
            ? (unit.x || 0) + minPtX
            : unit.x || 0;

        const textY =
          unit.type === 'rect'
            ? unit.y || 0
            : unit.type === 'circle'
            ? (unit.y || 0) - (unit.radius || 0)
            : hasPts
            ? (unit.y || 0) + minPtY
            : unit.y || 0;

        const textWidth =
          unit.type === 'rect'
            ? Math.max(10, Math.abs(unit.width || 50))
            : unit.type === 'circle'
            ? Math.max(10, (unit.radius || 20) * 2)
            : hasPts
            ? Math.max(20, maxPtX - minPtX)
            : 100;

        const textHeight =
          unit.type === 'rect'
            ? Math.max(10, Math.abs(unit.height || 30))
            : unit.type === 'circle'
            ? Math.max(10, (unit.radius || 20) * 2)
            : hasPts
            ? Math.max(20, maxPtY - minPtY)
            : 30;

        const calcFontSize =
          unit.type === 'rect'
            ? Math.max(9, Math.min(Math.abs(unit.width || 50), Math.abs(unit.height || 50)) * 0.2)
            : unit.type === 'circle'
            ? Math.max(9, (unit.radius || 20) * 0.4)
            : Math.max(9, 12 / quantizedScale);

        return (
          <Text
            text={sizeLabel}
            x={textX}
            y={textY}
            width={textWidth}
            height={textHeight}
            rotation={unit.rotation || 0}
            align="center"
            verticalAlign="middle"
            fontSize={calcFontSize}
            fill="#ffffff"
            fontStyle="bold"
            perfectDrawEnabled={false}
            listening={false}
          />
        );
      })()}
    </>
  );
});
