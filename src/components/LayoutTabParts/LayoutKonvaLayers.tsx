import React, { FC, Fragment, memo } from 'react';
import { FastLayer, Layer, Image as KonvaImage, Rect, Circle, Path, Line, Text, Group } from 'react-konva';

export interface LayoutKonvaLayersProps {
  bgImage: HTMLImageElement | null;
  version: any;
  visibleUnits: any[];
  layoutTooltipVisibility: any;
  focusedUnitId: string | null;
  selectedLegendGroupId: string | null;
  getContrastStyle: (fillColor: string) => { text: string; shapeStroke: string };
  stageScale: number;
  aggregatedData: Record<string, any>;
  focusedUnit: any;
  onMouseEnterUnit: (unit: any, e: any) => void;
  onMouseMoveUnit: (unit: any, e: any) => void;
  onMouseLeaveUnit: (unit: any, e: any) => void;
  onClickUnit: (unit: any, e: any) => void;
  onTapUnit: (unit: any, e: any) => void;
  hasStoredUnitImages: (codeOrName: string | undefined | null, store?: string) => boolean;
  storeFilter?: string;
}

export const LayoutKonvaLayers: React.FC<LayoutKonvaLayersProps> = React.memo(({
  bgImage,
  version,
  visibleUnits,
  layoutTooltipVisibility,
  focusedUnitId,
  selectedLegendGroupId,
  getContrastStyle,
  stageScale,
  aggregatedData,
  focusedUnit,
  onMouseEnterUnit,
  onMouseMoveUnit,
  onMouseLeaveUnit,
  onClickUnit,
  onTapUnit,
  hasStoredUnitImages,
  storeFilter,
}) => {
  const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const isLegendColorOn = layoutTooltipVisibility?.legendColor !== false;
  const currentZoom = stageScale || 1;

  return (
    <>
      {/* Layer 1: Static FastLayer for background CAD layout image to bypass hit-graph calculations */}
      <FastLayer listening={false}>
        {bgImage && (
          <KonvaImage
            image={bgImage}
            listening={false}
            perfectDrawEnabled={false}
            x={version.imagePos?.x || 0}
            y={version.imagePos?.y || 0}
            scaleX={version.imageScale || 1}
            scaleY={version.imageScale || 1}
            rotation={version.backgroundRotation || 0}
          />
        )}
      </FastLayer>

      {/* Layer 2: Interactive unit shapes, text, and alert badges */}
      <Layer id="units-interactive-layer">
        {visibleUnits.map((unit: any) => {
          const hasColor = Boolean(unit.targetColor);
          const fillColor = isLegendColorOn && hasColor ? unit.targetColor : "rgba(0, 0, 0, 0.001)";
          const isFocused = focusedUnitId === unit.id;
          const isDimmed = isLegendColorOn && hasColor && selectedLegendGroupId !== null && unit.targetGroupId !== selectedLegendGroupId;
          const contrast = isLegendColorOn && hasColor 
            ? getContrastStyle(fillColor) 
            : { text: isDarkMode ? '#94a3b8' : '#64748b', shapeStroke: isDarkMode ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.45)' };
          
          const displayOpacity = !isLegendColorOn || !hasColor
            ? (isFocused ? 1.0 : 0.5)
            : (isFocused 
                ? 1.0 
                : isDimmed 
                ? 0.2 
                : Math.max(0.82, unit.targetOpacity ?? 0.85));
          
          const commonProps = {
            id: unit.id,
            fill: fillColor,
            opacity: displayOpacity,
            stroke: isFocused ? '#f59e0b' : (isDimmed ? '#94a3b8' : contrast.shapeStroke),
            strokeWidth: isFocused ? 3 : (hasColor ? 1.5 : 1),
            strokeScaleEnabled: false,
            perfectDrawEnabled: false,
            x: unit.x || 0,
            y: unit.y || 0,
            rotation: unit.rotation || 0,
            onMouseEnter: (e: any) => onMouseEnterUnit(unit, e),
            onMouseMove: (e: any) => onMouseMoveUnit(unit, e),
            onMouseLeave: (e: any) => onMouseLeaveUnit(unit, e),
            onClick: (e: any) => onClickUnit(unit, e),
            onTap: (e: any) => onTapUnit(unit, e),
          };

          // Calculated font size for optimal legibility
          const unitW = unit.textWidth || 100;
          const unitH = unit.textHeight || 30;
          const baseFont = Math.max(10, Math.min(18, Math.round(Math.min(unitW, unitH * 2.2) / 5.5)));
          const dynamicFontSize = Math.max(9, Math.min(22, baseFont / Math.max(0.65, Math.min(currentZoom, 1.8))));

          // Badge placement coordinates
          let badgeX = (unit.textX || unit.x || 0) + (unit.textWidth || unit.width || 100) - 8;
          let badgeY = (unit.textY || unit.y || 0) + 8;
          let imgBadgeX = (unit.textX || unit.x || 0) + 8;
          let imgBadgeY = (unit.textY || unit.y || 0) + 8;
          if (unit.type === 'circle') {
            const r = unit.radius || 20;
            badgeX = (unit.x || 0) + r * 0.6;
            badgeY = (unit.y || 0) - r * 0.6;
            imgBadgeX = (unit.x || 0) - r * 0.6;
            imgBadgeY = (unit.y || 0) - r * 0.6;
          }
          const uCode = String(unit.name || unit.id || unit.code || '').toLowerCase();
          const unitData = (uCode && aggregatedData[uCode]) ? aggregatedData[uCode] : null;
          const hasAlert = Boolean(unitData?.alerts?.hasAlert);
          const hasImage = Boolean(
            unitData?.hasImage || 
            unit.imageUrl || 
            unit.thumbnail || 
            unit.image || 
            hasStoredUnitImages(unit.name, storeFilter) ||
            hasStoredUnitImages(unit.id, storeFilter) ||
            hasStoredUnitImages(unit.code, storeFilter)
          );
          const badgeRadius = Math.max(4.5, Math.min(8.5, 6.5 / Math.sqrt(Math.max(0.4, stageScale || 1))));
          const badgeFontSize = Math.max(6.5, Math.min(10.5, 8.5 / Math.sqrt(Math.max(0.4, stageScale || 1))));
          const imgPathScale = (badgeRadius * 1.3) / 24;

          // Dynamic Level of Detail (LOD) threshold:
          // Only rasterize expensive text & alert badges when zoom level is legible (scale >= 0.22) or if focused
          const showTextAndBadge = isFocused || (stageScale || 1) >= 0.22;

          return (
            <React.Fragment key={unit.id}>
              {unit.type === 'rect' && (
                <Rect {...commonProps} width={unit.width} height={unit.height} cornerRadius={4} />
              )}
              {unit.type === 'circle' && (
                <Circle {...commonProps} radius={unit.radius} />
              )}
              {unit.type === 'polygon' && (
                unit.svgPath ? (
                  <Path {...commonProps} data={unit.svgPath} />
                ) : (
                  <Line {...commonProps} points={unit.points} closed={true} />
                )
              )}

              {hasColor && unit.name && showTextAndBadge && (
                <Text 
                  text={unit.name}
                  x={unit.textX}
                  y={unit.textY}
                  width={unit.textWidth}
                  height={unit.textHeight}
                  rotation={unit.rotation || 0}
                  align="center"
                  verticalAlign="middle"
                  fontSize={dynamicFontSize}
                  fontStyle="bold"
                  fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                  fill={contrast.text}
                  strokeScaleEnabled={false}
                  perfectDrawEnabled={false}
                  wrap="none"
                  ellipsis={true}
                  listening={false}
                />
              )}

              {/* Smart Alert Badge (Rendered ONLY when unit is colored, has real alerts, and LOD permits) */}
              {hasColor && hasAlert && unitData?.alerts && showTextAndBadge && (
                <Group x={badgeX} y={badgeY} listening={false}>
                  <Circle
                    radius={badgeRadius}
                    fill={unitData.alerts.level === 'critical' ? '#ef4444' : '#f59e0b'}
                    stroke="#ffffff"
                    strokeWidth={Math.max(1, 1.5 / Math.sqrt(Math.max(0.4, stageScale || 1)))}
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                  />
                  <Text
                    text={unitData.alerts.count > 1 ? String(unitData.alerts.count) : '!'}
                    x={-badgeRadius}
                    y={-badgeRadius + 0.5}
                    width={badgeRadius * 2}
                    height={badgeRadius * 2}
                    align="center"
                    verticalAlign="middle"
                    fontSize={badgeFontSize}
                    fontStyle="bold"
                    fill="#ffffff"
                    fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                  />
                </Group>
              )}

              {/* Thumbnail / Image Indicator Badge (Rendered when project has attached photos/thumbnails) */}
              {hasImage && showTextAndBadge && (
                <Group x={imgBadgeX} y={imgBadgeY} listening={false}>
                  <Circle
                    radius={badgeRadius}
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth={Math.max(1, 1.5 / Math.sqrt(Math.max(0.4, stageScale || 1)))}
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                  />
                  <Path
                    data="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54-1.96-2.36L6.5 17h11l-3.54-4.71z"
                    fill="#ffffff"
                    scaleX={imgPathScale}
                    scaleY={imgPathScale}
                    x={-badgeRadius * 0.65}
                    y={-badgeRadius * 0.65}
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                  />
                </Group>
              )}
            </React.Fragment>
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
    </>
  );
});
