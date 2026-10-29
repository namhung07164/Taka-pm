import React, { FC, Fragment, memo } from 'react';
import { FastLayer, Layer, Image as KonvaImage, Rect, Circle, Path, Line, Text, Group } from 'react-konva';
import { getHatchPatternCanvas } from './layoutPatternUtils';

export interface LayoutKonvaLayersProps {
  bgImage: HTMLImageElement | null;
  version: any;
  visibleUnits: any[];
  layoutTooltipVisibility: any;
  focusedUnitId: string | null;
  selectedLegendGroupId: string | null;
  activeGroups?: any[];
  getContrastStyle: (fillColor: string) => { text: string; shapeStroke: string };
  stageScale: number;
  aggregatedData: Record<string, any>;
  focusedUnit: any;
  onMouseEnterUnit: (unit: any, e: any) => void;
  onMouseMoveUnit: (unit: any, e: any) => void;
  onMouseLeaveUnit: (unit: any, e: any) => void;
  onClickUnit: (unit: any, e: any, quickImageMode?: boolean) => void;
  onTapUnit: (unit: any, e: any, quickImageMode?: boolean) => void;
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
  activeGroups,
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
        {(() => {
          const renderedImgBadgePositions: { x: number; y: number; normCode: string }[] = [];
          return visibleUnits.map((unit: any) => {
            const hasColor = Boolean(unit.targetColor);
            const fillColor = isLegendColorOn && hasColor ? unit.targetColor : "rgba(0, 0, 0, 0.001)";
            const isFocused = focusedUnitId === unit.id;

            const uCode = String(unit.name || unit.id || unit.code || '').toLowerCase().trim();
            const uName = String(unit.name || '').toLowerCase().trim();
            const uId = String(unit.id || '').toLowerCase().trim();
            const unitData = (uName && aggregatedData[uName]) || (uId && aggregatedData[uId]) || (uCode && aggregatedData[uCode]) || null;

            const selectedGroup = activeGroups?.find(
              (g: any) => g.id === selectedLegendGroupId || String(g.name).toLowerCase() === String(selectedLegendGroupId).toLowerCase()
            );

            const isLegendFiltered = selectedLegendGroupId !== null;
            const isGroupMatched = isLegendFiltered && (
              (unit.targetGroupId && unit.targetGroupId === selectedLegendGroupId) ||
              (unit.targetGroupId && String(unit.targetGroupId).toLowerCase() === String(selectedLegendGroupId).toLowerCase()) ||
              (selectedGroup && unit.targetGroupId === selectedGroup.id) ||
              (selectedGroup && unit.targetColor && selectedGroup.color && unit.targetColor.toLowerCase() === selectedGroup.color.toLowerCase()) ||
              (unitData?.projectStatus && String(unitData.projectStatus).toLowerCase() === String(selectedLegendGroupId).toLowerCase()) ||
              (unitData?.status && String(unitData.status).toLowerCase() === String(selectedLegendGroupId).toLowerCase()) ||
              (unitData?.appProjectStatus && String(unitData.appProjectStatus).toLowerCase() === String(selectedLegendGroupId).toLowerCase())
            );
            const isDimmed = isLegendColorOn && hasColor && isLegendFiltered && !isGroupMatched;

            const contrast = isLegendColorOn && hasColor 
              ? getContrastStyle(fillColor) 
              : { text: isDarkMode ? '#94a3b8' : '#64748b', shapeStroke: isDarkMode ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.45)' };

            // Determine if unit or project has area
            const areaVal = 
              Number(unitData?.matchedProject?.sizeM2 ?? 0) ||
              Number(unitData?.appProjectSizeM2 ?? 0) ||
              Number(unitData?.sizeM2 ?? 0) ||
              Number(unitData?.size ?? 0) ||
              Number(unit?.sizeM2 ?? 0) ||
              Number(unit?.size ?? 0) ||
              0;
            const hasArea = areaVal > 0;

            const statusColor = selectedGroup?.color || unit.targetColor || fillColor;

            let unitStroke: string | undefined = undefined;
            let unitStrokeWidth = 0;
            let unitShadowColor: string | undefined = undefined;
            let unitShadowBlur = 0;
            let unitShadowOpacity = 0;

            if (isFocused) {
              unitStroke = '#f59e0b';
              unitStrokeWidth = 3;
            } else if (isLegendFiltered) {
              if (isGroupMatched) {
                if (hasArea) {
                  // User rule: "nếu unit/ project nào có diện tích thì thêm viền màu chính status đó bao xung quanh"
                  unitStroke = statusColor;
                  unitStrokeWidth = 3.5;
                  unitShadowColor = statusColor;
                  unitShadowBlur = 5;
                  unitShadowOpacity = 0.75;
                } else {
                  // User rule: "ko thì ko có"
                  unitStroke = undefined;
                  unitStrokeWidth = 0;
                }
              } else {
                unitStroke = isDarkMode ? 'rgba(100, 116, 139, 0.15)' : 'rgba(148, 163, 184, 0.2)';
                unitStrokeWidth = 0.5;
              }
            } else {
              unitStroke = isDimmed ? '#94a3b8' : contrast.shapeStroke;
              unitStrokeWidth = hasColor ? 1.5 : 1;
            }

            const displayOpacity = !isLegendColorOn || !hasColor
              ? (isFocused ? 1.0 : 0.5)
              : (isFocused 
                  ? 1.0 
                  : isLegendFiltered
                  ? (isGroupMatched ? (hasArea ? 1.0 : 0.75) : 0.18)
                  : Math.max(0.82, unit.targetOpacity ?? 0.85));

            const patternCanvas = (isLegendColorOn && hasColor && unit.targetHatchPattern && unit.targetHatchPattern !== 'none')
              ? getHatchPatternCanvas(fillColor, unit.targetHatchPattern)
              : null;

            const commonProps = {
              id: unit.id,
              fill: patternCanvas ? undefined : fillColor,
              fillPatternImage: (patternCanvas as any) || undefined,
              fillPatternRepeat: patternCanvas ? 'repeat' : undefined,
              fillPriority: patternCanvas ? 'pattern' : 'color',
              opacity: displayOpacity,
              stroke: unitStrokeWidth > 0 ? unitStroke : undefined,
              strokeWidth: unitStrokeWidth,
              shadowColor: unitShadowBlur > 0 ? unitShadowColor : undefined,
              shadowBlur: unitShadowBlur,
              shadowOpacity: unitShadowOpacity,
              strokeScaleEnabled: false,
              perfectDrawEnabled: false,
              x: unit.x || 0,
              y: unit.y || 0,
              rotation: unit.rotation || 0,
              onMouseEnter: (e: any) => onMouseEnterUnit(unit, e),
              onMouseMove: (e: any) => onMouseMoveUnit(unit, e),
              onMouseLeave: (e: any) => onMouseLeaveUnit(unit, e),
              onClick: (e: any) => onClickUnit(unit, e, false),
              onTap: (e: any) => onTapUnit(unit, e, false),
            };

            // Calculated font size for optimal legibility
            const unitW = unit.textWidth || 100;
            const unitH = unit.textHeight || 30;
            const baseFont = Math.max(10, Math.min(18, Math.round(Math.min(unitW, unitH * 2.2) / 5.5)));
            const dynamicFontSize = Math.max(9, Math.min(22, baseFont / Math.max(0.65, Math.min(currentZoom, 1.8))));

            const badgeRadius = Math.max(4.5, Math.min(8.5, 6.5 / Math.sqrt(Math.max(0.4, stageScale || 1))));
            const badgeFontSize = Math.max(6.5, Math.min(10.5, 8.5 / Math.sqrt(Math.max(0.4, stageScale || 1))));

            // Distinct, easily recognizable Interactive Image Button dimensions
            const imgBtnH = Math.max(11.5, Math.min(20, 14.5 / Math.sqrt(Math.max(0.45, stageScale || 1))));
            const imgBtnW = imgBtnH * 1.26;
            const imgIconScale = (imgBtnH * 0.78) / 24;

            // Badge placement coordinates
            let badgeX = (unit.textX || unit.x || 0) + (unit.textWidth || unit.width || 100) - 8;
            let badgeY = (unit.textY || unit.y || 0) + 8;
            let imgBadgeX = (unit.textX || unit.x || 0) + Math.max(9, imgBtnW * 0.5 + 1.5);
            let imgBadgeY = (unit.textY || unit.y || 0) + Math.max(8, imgBtnH * 0.5 + 1.5);
            if (unit.type === 'circle') {
              const r = unit.radius || 20;
              badgeX = (unit.x || 0) + r * 0.6;
              badgeY = (unit.y || 0) - r * 0.6;
              imgBadgeX = (unit.x || 0) - r * 0.65;
              imgBadgeY = (unit.y || 0) - r * 0.65;
            }
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

          // Dynamic Level of Detail (LOD) threshold:
          // Only rasterize expensive text & alert badges when zoom level is legible (scale >= 0.22) or if focused
          const showTextAndBadge = isFocused || (stageScale || 1) >= 0.22;

          const normUnitCode = String(unit.name || unit.id || unit.code || '')
            .toLowerCase()
            .replace(/^(l\d+|b\d+|md-[lb]\d+)[-_]/i, '')
            .trim();

          const isDuplicateImgBtn = Boolean(
            hasImage && renderedImgBadgePositions.some(
              pos => (pos.normCode && normUnitCode && pos.normCode === normUnitCode) ||
                     Math.hypot(pos.x - imgBadgeX, pos.y - imgBadgeY) < 32
            )
          );

          if (hasImage && !isDuplicateImgBtn && showTextAndBadge) {
            renderedImgBadgePositions.push({ x: imgBadgeX, y: imgBadgeY, normCode: normUnitCode });
          }

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
                  text={unit.targetSymbol ? `${unit.targetSymbol} ${unit.name}` : unit.name}
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

              {/* Group Symbol Marker Badge */}
              {hasColor && unit.targetSymbol && showTextAndBadge && (
                <Group 
                  x={unit.type === 'circle' ? (unit.x || 0) - (unit.radius || 20) * 0.55 : (unit.textX || unit.x || 0) + 7} 
                  y={unit.type === 'circle' ? (unit.y || 0) + (unit.radius || 20) * 0.55 : (unit.textY || unit.y || 0) + (unit.textHeight || unit.height || 30) - 7} 
                  listening={false}
                >
                  <Circle
                    radius={badgeRadius}
                    fill={contrast.shapeStroke || "#1e293b"}
                    stroke="#ffffff"
                    strokeWidth={Math.max(1, 1.2 / Math.sqrt(Math.max(0.4, stageScale || 1)))}
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                    listening={false}
                  />
                  <Text
                    text={unit.targetSymbol}
                    x={-badgeRadius}
                    y={-badgeRadius + 0.5}
                    width={badgeRadius * 2}
                    height={badgeRadius * 2}
                    align="center"
                    verticalAlign="middle"
                    fontSize={badgeFontSize * 0.95}
                    fontStyle="bold"
                    fill="#ffffff"
                    fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                    listening={false}
                  />
                </Group>
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
                    listening={false}
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
                    listening={false}
                  />
                </Group>
              )}

              {/* Interactive Quick-Image Button Badge (Click/Tap opens Quick Image Tooltip directly) */}
              {hasImage && !isDuplicateImgBtn && showTextAndBadge && (
                <Group x={imgBadgeX} y={imgBadgeY}>
                  <Rect
                    x={-imgBtnW / 2}
                    y={-imgBtnH / 2}
                    width={imgBtnW}
                    height={imgBtnH}
                    cornerRadius={imgBtnH * 0.28}
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth={Math.max(1.2, 1.6 / Math.sqrt(Math.max(0.4, stageScale || 1)))}
                    hitStrokeWidth={10}
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                    onMouseEnter={(e: any) => {
                      e.cancelBubble = true;
                      const container = e.target.getStage()?.container();
                      if (container) container.style.cursor = 'pointer';
                    }}
                    onMouseMove={(e: any) => {
                      e.cancelBubble = true;
                    }}
                    onMouseLeave={(e: any) => {
                      e.cancelBubble = true;
                    }}
                    onClick={(e: any) => {
                      e.cancelBubble = true;
                      onClickUnit(unit, e, true);
                    }}
                    onTap={(e: any) => {
                      e.cancelBubble = true;
                      onTapUnit(unit, e, true);
                    }}
                  />
                  {/* Golden Sun inside Photo Button */}
                  <Circle
                    x={-imgBtnW * 0.18}
                    y={-imgBtnH * 0.15}
                    radius={imgBtnH * 0.12}
                    fill="#fde047"
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                    listening={false}
                  />
                  {/* Crisp White Mountain Landscape inside Photo Button */}
                  <Path
                    data="M4 18l4-5 3 3.5L15 11l5 7H4z"
                    fill="#ffffff"
                    scaleX={imgIconScale}
                    scaleY={imgIconScale}
                    x={-12 * imgIconScale}
                    y={-11.5 * imgIconScale}
                    strokeScaleEnabled={false}
                    perfectDrawEnabled={false}
                    listening={false}
                  />
                </Group>
              )}
            </React.Fragment>
          );
        });
      })()}
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
