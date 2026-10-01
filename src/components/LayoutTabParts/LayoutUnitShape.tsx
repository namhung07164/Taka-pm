import React from 'react';
import { Rect, Circle, Line, Path, Text, Group } from 'react-konva';
import { getContrastStyle } from './layoutViewerUtils';

interface LayoutUnitShapeProps {
  unit: any;
  isFocused: boolean;
  isLegendColorOn: boolean;
  selectedLegendGroupId: string | null;
  stageScale: number;
  aggregatedData: Record<string, any>;
  hasStoredUnitImages: (key: string | undefined | null) => boolean;
  isInteracting: boolean;
  isPinned: boolean;
  hasMiniGantt: boolean;
  onUnitMouseEnter: (unit: any, e: any) => void;
  onUnitMouseMove: (unit: any, e: any) => void;
  onUnitMouseLeave: (e: any) => void;
  onUnitClick: (unit: any, e: any) => void;
  onUnitTap: (unit: any, e: any) => void;
}

export const LayoutUnitShape: React.FC<LayoutUnitShapeProps> = React.memo(function LayoutUnitShape({
  unit,
  isFocused,
  isLegendColorOn,
  selectedLegendGroupId,
  stageScale,
  aggregatedData,
  hasStoredUnitImages,
  isInteracting,
  isPinned,
  hasMiniGantt,
  onUnitMouseEnter,
  onUnitMouseMove,
  onUnitMouseLeave,
  onUnitClick,
  onUnitTap,
}) {
  const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const hasColor = Boolean(unit.targetColor);
  const fillColor = isLegendColorOn && hasColor ? unit.targetColor : "rgba(0, 0, 0, 0.001)";
  const isDimmed = isLegendColorOn && hasColor && selectedLegendGroupId !== null && unit.targetGroupId !== selectedLegendGroupId;
  const contrast = isLegendColorOn && hasColor 
    ? getContrastStyle(fillColor) 
    : { text: isDarkMode ? '#e2e8f0' : '#1e293b', shapeStroke: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.6)' };
  
  const displayOpacity = !isLegendColorOn || !hasColor
    ? (isFocused ? 1.0 : 0.6)
    : (isFocused 
        ? 1.0 
        : isDimmed 
        ? 0.2 
        : Math.max(0.85, unit.targetOpacity ?? 0.88));
  
  const commonProps = {
    id: unit.id,
    fill: fillColor,
    opacity: displayOpacity,
    stroke: isFocused ? '#f59e0b' : (isDimmed ? '#94a3b8' : (hasColor ? contrast.shapeStroke : (isDarkMode ? '#64748b' : '#94a3b8'))),
    strokeWidth: isFocused ? 3.5 : (hasColor ? 1.8 : 1.2),
    strokeScaleEnabled: false,
    perfectDrawEnabled: false,
    x: unit.x || 0,
    y: unit.y || 0,
    rotation: unit.rotation || 0,
    onMouseEnter: (e: any) => {
      if (isInteracting || isPinned || hasMiniGantt) return;
      onUnitMouseEnter(unit, e);
    },
    onMouseMove: (e: any) => {
      if (isInteracting || isPinned || hasMiniGantt) return;
      onUnitMouseMove(unit, e);
    },
    onMouseLeave: (e: any) => {
      onUnitMouseLeave(e);
    },
    onClick: (e: any) => {
      if (isInteracting || hasMiniGantt) return;
      onUnitClick(unit, e);
    },
    onTap: (e: any) => {
      if (isInteracting || hasMiniGantt) return;
      onUnitTap(unit, e);
    },
  };

  const unitNameText = unit.name || unit.code || unit.id || '';
  const textPosX = unit.textX !== undefined ? unit.textX : (unit.x || 0);
  const textPosY = unit.textY !== undefined ? unit.textY : (unit.y || 0);
  const unitW = unit.textWidth || unit.width || (unit.radius ? unit.radius * 2 : 90);
  const unitH = unit.textHeight || unit.height || (unit.radius ? unit.radius * 2 : 30);
  
  const baseFont = Math.max(11, Math.min(18, Math.round(Math.min(unitW, unitH * 2.2) / 5.2)));
  const currentZoom = stageScale || 1;
  const dynamicFontSize = Math.max(9.5, Math.min(20, baseFont / Math.max(0.6, Math.min(currentZoom, 1.8))));

  let badgeX = textPosX + unitW - 8;
  let badgeY = textPosY + 8;
  let imgBadgeX = textPosX + 8;
  let imgBadgeY = textPosY + 8;
  if (unit.type === 'circle') {
    const r = unit.radius || 20;
    badgeX = (unit.x || 0) + r * 0.6;
    badgeY = (unit.y || 0) - r * 0.6;
    imgBadgeX = (unit.x || 0) - r * 0.6;
    imgBadgeY = (unit.y || 0) - r * 0.6;
  }

  const uCode = String(unit.name || unit.id || unit.code || '').toLowerCase().trim();
  const unitData = (uCode && aggregatedData[uCode]) 
    ? aggregatedData[uCode] 
    : (unit.id && aggregatedData[String(unit.id).toLowerCase().trim()]);
    
  const hasAlert = Boolean(
    unitData?.alerts?.hasAlert || 
    unitData?.hasAlert || 
    unit.hasAlert ||
    (unitData?.activeTasks && unitData.activeTasks.length > 0) ||
    (unitData?.appProjectStatus === 'Delay' || unitData?.appProjectStatus === 'Overdue')
  );
  
  const hasImage = Boolean(
    unitData?.hasImage || 
    unit.imageUrl || 
    unit.thumbnail || 
    unit.image || 
    unit.photos?.length ||
    hasStoredUnitImages(unit.name) ||
    hasStoredUnitImages(unit.id) ||
    hasStoredUnitImages(unit.code) ||
    hasStoredUnitImages(uCode)
  );

  const badgeRadius = Math.max(5.0, Math.min(9.0, 7.0 / Math.sqrt(Math.max(0.35, stageScale || 1))));
  const badgeFontSize = Math.max(7.0, Math.min(11.0, 9.0 / Math.sqrt(Math.max(0.35, stageScale || 1))));
  const imgPathScale = (badgeRadius * 1.3) / 24;

  const showTextAndBadge = isFocused || (stageScale || 1) >= 0.08;

  return (
    <React.Fragment>
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

      {/* Unit Name / Number Label (Always rendered for identification) */}
      {unitNameText && showTextAndBadge && (
        <Text 
          text={unitNameText}
          x={textPosX}
          y={textPosY}
          width={unitW}
          height={unitH}
          rotation={unit.rotation || 0}
          align="center"
          verticalAlign="middle"
          fontSize={dynamicFontSize}
          fontStyle="bold"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          fill={isLegendColorOn && hasColor ? contrast.text : (isDarkMode ? '#f1f5f9' : '#0f172a')}
          shadowColor={isLegendColorOn && hasColor ? 'transparent' : (isDarkMode ? '#000000' : '#ffffff')}
          shadowBlur={isLegendColorOn && hasColor ? 0 : 3}
          shadowOpacity={0.8}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
          wrap="none"
          ellipsis={true}
          listening={false}
        />
      )}

      {/* Alert Warning Badge (!) */}
      {hasAlert && showTextAndBadge && (
        <Group x={badgeX} y={badgeY} listening={false}>
          <Circle
            radius={badgeRadius}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={Math.max(1.2, 1.8 / Math.sqrt(Math.max(0.35, stageScale || 1)))}
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
            shadowColor="#000000"
            shadowBlur={4}
            shadowOpacity={0.5}
          />
          <Text
            text="!"
            x={-badgeRadius}
            y={-badgeRadius + (badgeFontSize * 0.08)}
            width={badgeRadius * 2}
            height={badgeRadius * 2}
            align="center"
            verticalAlign="middle"
            fontSize={badgeFontSize}
            fontStyle="bold"
            fontFamily="system-ui, sans-serif"
            fill="#ffffff"
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
          />
        </Group>
      )}

      {/* Image Attachment / Photo Link Badge */}
      {hasImage && showTextAndBadge && (
        <Group x={imgBadgeX} y={imgBadgeY} listening={false}>
          <Circle
            radius={badgeRadius}
            fill="#2563eb"
            stroke="#ffffff"
            strokeWidth={Math.max(1.2, 1.8 / Math.sqrt(Math.max(0.35, stageScale || 1)))}
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
            shadowColor="#000000"
            shadowBlur={4}
            shadowOpacity={0.4}
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
});
