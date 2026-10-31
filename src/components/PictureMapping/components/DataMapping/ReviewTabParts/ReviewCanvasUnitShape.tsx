import React from 'react';
import { Rect, Circle, Line, Text, Group } from 'react-konva';

export const ReviewCanvasUnitShape = React.memo(function ReviewCanvasUnitShape({
  unit,
  isSelected,
  showLabel,
  quantizedScale,
  reviewLabelColors,
}: {
  unit: any;
  isSelected: boolean;
  showLabel: boolean;
  quantizedScale: number;
  reviewLabelColors?: Record<string, string>;
}) {
  const { displayColor, displayOpacity, bbox } = unit;
  const strokeColor = unit.hasMatchedColor ? (isSelected ? '#f59e0b' : '#ffffff') : '#64748b';
  const strokeWidth = isSelected ? 2.5 : 1.2;

  return (
    <>
      {unit.type === 'rect' && (
        <Rect
          x={unit.x}
          y={unit.y}
          width={unit.width}
          height={unit.height}
          fill={unit.hasMatchedColor ? displayColor : 'rgba(0, 0, 0, 0.001)'}
          opacity={displayOpacity}
          rotation={unit.rotation || 0}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
          listening={false}
        />
      )}
      {unit.type === 'circle' && (
        <Circle
          x={unit.x}
          y={unit.y}
          radius={unit.radius}
          fill={unit.hasMatchedColor ? displayColor : 'rgba(0, 0, 0, 0.001)'}
          opacity={displayOpacity}
          rotation={unit.rotation || 0}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
          listening={false}
        />
      )}
      {unit.type === 'polygon' && (
        <Line
          x={unit.x || 0}
          y={unit.y || 0}
          points={unit.points}
          fill={unit.hasMatchedColor ? displayColor : 'rgba(0, 0, 0, 0.001)'}
          opacity={displayOpacity}
          rotation={unit.rotation || 0}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
          closed
          listening={false}
        />
      )}

      {showLabel && bbox && (
        <Group
          x={bbox.x}
          y={bbox.y}
          width={bbox.width}
          height={bbox.height}
          rotation={unit.rotation || 0}
          listening={false}
        >
          {(() => {
            const lines = unit.sizeLabelLines || [];
            const fontSize = Math.max(7, Math.min(18, 10 / quantizedScale));
            const lineHeight = fontSize * 1.2;
            const totalHeight = lines.length * lineHeight;
            const startY = (bbox.height - totalHeight) / 2;
            return lines.map((line: any, i: number) => (
              <Text
                key={i}
                x={0}
                y={startY + i * lineHeight}
                width={bbox.width}
                text={line.text}
                fill={reviewLabelColors?.[line.key] || '#ffffff'}
                align="center"
                fontSize={fontSize}
                fontStyle="bold"
                listening={false}
                perfectDrawEnabled={false}
              />
            ));
          })()}
        </Group>
      )}
    </>
  );
});
