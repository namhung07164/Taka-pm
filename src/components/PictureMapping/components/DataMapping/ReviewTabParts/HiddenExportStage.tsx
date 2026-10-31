import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Circle, Line, Image as KonvaImage, Text, Group } from 'react-konva';
import { useOffscreenImage } from '../../../../../hooks/useOffscreenImage';
import { generateSizeLabel, generateSizeLabelLines } from '../../../lib/summaryData';
import { resolveR2UrlToHttp } from '../../../lib/r2Upload';

function renderWrappedTextLines(
  lines: any[],
  effectiveWidth: number,
  containerHeight: number,
  reviewLabelColors?: Record<string, string>
) {
  const fontSize = 14;
  const lineHeight = fontSize * 1.2;
  const estimatedCharWidth = fontSize * 0.55;

  const blocks = lines.map((line: any) => {
    const charsPerLine = Math.max(1, effectiveWidth / estimatedCharWidth);
    const words = String(line.text).split(' ');
    let linesCount = 1;
    let currentLineLen = 0;
    for (let i = 0; i < words.length; i++) {
      const wordLen = words[i].length;
      if (wordLen > charsPerLine) {
        linesCount += Math.floor(wordLen / charsPerLine);
        currentLineLen = wordLen % charsPerLine;
      } else if (currentLineLen > 0 && currentLineLen + 1 + wordLen <= charsPerLine) {
        currentLineLen += 1 + wordLen;
      } else {
        if (i > 0) linesCount++;
        currentLineLen = wordLen;
      }
    }
    const explicitNewlines = (String(line.text).match(/\n/g) || []).length;
    linesCount += explicitNewlines;
    return { ...line, blockHeight: linesCount * lineHeight };
  });

  const totalHeight = blocks.reduce((sum: number, b: any) => sum + b.blockHeight, 0);
  let currentY = (containerHeight - totalHeight) / 2;

  return blocks.map((block: any, i: number) => {
    const y = currentY;
    currentY += block.blockHeight;
    return (
      <Text
        key={i}
        x={0}
        y={y}
        width={effectiveWidth}
        text={block.text}
        fill={reviewLabelColors?.[block.key] || '#ffffff'}
        align="center"
        fontSize={fontSize}
        fontStyle="bold"
        listening={false}
        perfectDrawEnabled={false}
        shadowColor="black"
        shadowBlur={2}
        shadowOpacity={1}
      />
    );
  });
}

export const HiddenExportStage = ({
  version,
  units,
  summaryData,
  dynamicSummaryMap,
  selectedLabels,
  reviewLabelColors,
  paperSize,
  onReady,
  index,
}: any) => {
  const styledUnits = React.useMemo(() => {
    const unitToGroupStyle = new Map<string, { color: string; opacity: number; groupId: string }>();
    if (version?.groups && version?.groupMappings) {
      version.groups.forEach((group: any) => {
        const assignedIds = version.groupMappings[group.id] || [];
        assignedIds.forEach((id: string) => {
          unitToGroupStyle.set(String(id).toLowerCase().trim(), {
            color: group.color,
            opacity: typeof group.opacity === 'number' ? group.opacity : 0.65,
            groupId: group.id,
          });
        });
      });
    }

    const summaryMap = new Map();
    summaryData.forEach((s: any) => summaryMap.set(s.unit, s));

    const vLoc = String(version?.location || '').toUpperCase().trim();
    const candidateUnits =
      Array.isArray(version?.mapUnits) && version.mapUnits.length > 0 ? version.mapUnits : units;

    return candidateUnits
      .filter((unit: any) => {
        const uLoc = String(unit.location || '').toUpperCase().trim();
        if (vLoc && uLoc && uLoc !== vLoc) return false;
        return true;
      })
      .map((unit: any) => {
        const uName = String(unit.name || '').toLowerCase().trim();
        const uId = String(unit.id || '').toLowerCase().trim();
        const dynamicItem =
          dynamicSummaryMap?.get?.(unit.id) || (uName ? dynamicSummaryMap?.get?.(uName) : null);

        let displayColor = 'rgba(0, 0, 0, 0.001)';
        let displayOpacity = 0.85;
        let hasMatchedColor = false;

        if (dynamicItem?.matchedGroupId && dynamicItem?.color) {
          displayColor = dynamicItem.color;
          displayOpacity = dynamicItem.opacity ?? 0.85;
          hasMatchedColor = true;
        } else if (unitToGroupStyle.has(uId)) {
          const g = unitToGroupStyle.get(uId)!;
          displayColor = g.color;
          displayOpacity = g.opacity;
          hasMatchedColor = true;
        } else if (uName && unitToGroupStyle.has(uName)) {
          const g = unitToGroupStyle.get(uName)!;
          displayColor = g.color;
          displayOpacity = g.opacity;
          hasMatchedColor = true;
        } else if ((unit as any).targetColor) {
          displayColor = (unit as any).targetColor;
          displayOpacity = (unit as any).targetOpacity ?? 0.65;
          hasMatchedColor = true;
        } else if (dynamicItem?.hasAppProject && dynamicItem?.appProjectStatus) {
          const st = String(dynamicItem.appProjectStatus).toLowerCase().trim();
          if (st === 'completed') {
            displayColor = '#10b981';
            displayOpacity = 0.85;
            hasMatchedColor = true;
          } else if (st === 'on process' || st === 'in progress') {
            displayColor = '#3b82f6';
            displayOpacity = 0.85;
            hasMatchedColor = true;
          } else if (st === 'delay' || st === 'delayed' || st === 'overdue') {
            displayColor = '#ef4444';
            displayOpacity = 0.85;
            hasMatchedColor = true;
          } else if (st === 'upcoming') {
            displayColor = '#f59e0b';
            displayOpacity = 0.85;
            hasMatchedColor = true;
          }
        }

        const uInfo = summaryMap.get(unit.name);
        const sizeLabelLines = generateSizeLabelLines(unit, uInfo, selectedLabels);
        const sizeLabel = generateSizeLabel(unit, uInfo, selectedLabels);
        return {
          ...unit,
          displayColor,
          displayOpacity: hasMatchedColor ? displayOpacity : 0.85,
          hasMatchedColor,
          sizeLabelLines,
          sizeLabel,
        };
      });
  }, [units, version, summaryData, dynamicSummaryMap, selectedLabels]);

  const [resolvedBgUrl, setResolvedBgUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const rawUrl = version?.backgroundUrl || '';
    if (!rawUrl) {
      setResolvedBgUrl('');
      return;
    }
    if (
      rawUrl.startsWith('r2://') ||
      (!rawUrl.startsWith('http://') &&
        !rawUrl.startsWith('https://') &&
        !rawUrl.startsWith('data:') &&
        !rawUrl.startsWith('blob:'))
    ) {
      resolveR2UrlToHttp(rawUrl)
        .then((url) => {
          if (isMounted) setResolvedBgUrl(url || rawUrl);
        })
        .catch(() => {
          if (isMounted) setResolvedBgUrl(rawUrl);
        });
    } else {
      setResolvedBgUrl(rawUrl);
    }
    return () => {
      isMounted = false;
    };
  }, [version?.backgroundUrl]);

  const [image, status] = useOffscreenImage(
    resolvedBgUrl || version?.backgroundUrl || '',
    'anonymous'
  );
  const stageRef = useRef<any>(null);

  useEffect(() => {
    let timer: any;
    if (status === 'loaded' || status === 'failed') {
      timer = setTimeout(() => {
        if (stageRef.current) {
          onReady(index, stageRef.current);
        } else {
          onReady(index, null);
        }
      }, 350);
    } else {
      timer = setTimeout(() => {
        console.warn(`[HiddenExportStage] Image timeout for version: ${version?.name}`);
        onReady(index, stageRef.current || null);
      }, 8000);
    }
    return () => clearTimeout(timer);
  }, [status, index, onReady, version?.name]);

  if (status !== 'loaded' && status !== 'failed') {
    return null;
  }

  let minX = 0,
    minY = 0,
    maxX = 800,
    maxY = 600;

  if (image) {
    const angle = ((version?.backgroundRotation || 0) * Math.PI) / 180;
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const w =
      ((image as HTMLImageElement).naturalWidth || image.width) * (version?.imageScale || 1);
    const h =
      ((image as HTMLImageElement).naturalHeight || image.height) * (version?.imageScale || 1);
    const px = version?.imagePos?.x || 0;
    const py = version?.imagePos?.y || 0;

    const p1 = { x: px, y: py };
    const p2 = { x: px + w * c, y: py + w * s };
    const p3 = { x: px + w * c - h * s, y: py + w * s + h * c };
    const p4 = { x: px - h * s, y: py + h * c };

    minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
  }

  styledUnits.forEach((unit: any) => {
    if (unit.type === 'rect') {
      minX = Math.min(minX, unit.x);
      minY = Math.min(minY, unit.y);
      maxX = Math.max(maxX, unit.x + unit.width);
      maxY = Math.max(maxY, unit.y + unit.height);
    } else if (unit.type === 'circle') {
      minX = Math.min(minX, unit.x - (unit.radius || 0));
      minY = Math.min(minY, unit.y - (unit.radius || 0));
      maxX = Math.max(maxX, unit.x + (unit.radius || 0));
      maxY = Math.max(maxY, unit.y + (unit.radius || 0));
    } else if (unit.type === 'polygon' && unit.points) {
      for (let i = 0; i < unit.points.length; i += 2) {
        minX = Math.min(minX, unit.points[i]);
        minY = Math.min(minY, unit.points[i + 1]);
        maxX = Math.max(maxX, unit.points[i]);
        maxY = Math.max(maxY, unit.points[i + 1]);
      }
    }
  });

  minX -= 40;
  minY -= 40;
  maxX += 40;
  maxY += 40;

  let logicalWidth = maxX - minX;
  let logicalHeight = maxY - minY;

  if (paperSize && paperSize !== 'original') {
    let paperRatio = 1.4142;
    if (paperSize === 'a4' || paperSize === 'a3' || paperSize === 'a2') {
      paperRatio = 297 / 210;
    } else if (Array.isArray(paperSize) && paperSize.length === 2) {
      paperRatio = Math.max(paperSize[0], paperSize[1]) / Math.min(paperSize[0], paperSize[1]);
    }

    const isLandscape = logicalWidth > logicalHeight;
    const targetRatio = isLandscape ? paperRatio : 1 / paperRatio;
    const currentRatio = logicalWidth / logicalHeight;

    if (currentRatio > targetRatio) {
      const newHeight = logicalWidth / targetRatio;
      const diff = newHeight - logicalHeight;
      minY -= diff / 2;
      maxY += diff / 2;
      logicalHeight = newHeight;
    } else {
      const newWidth = logicalHeight * targetRatio;
      const diff = newWidth - logicalWidth;
      minX -= diff / 2;
      maxX += diff / 2;
      logicalWidth = newWidth;
    }
  }

  const MAX_DIM = 3000;
  let stageScale = 1;
  const maxLogical = Math.max(logicalWidth, logicalHeight);

  if (maxLogical > MAX_DIM) {
    stageScale = MAX_DIM / maxLogical;
  } else if (maxLogical < 500 && maxLogical > 0) {
    stageScale = 1000 / maxLogical;
  }

  const exportWidth = logicalWidth * stageScale;
  const exportHeight = logicalHeight * stageScale;

  return (
    <Stage
      ref={stageRef}
      width={exportWidth}
      height={exportHeight}
      scaleX={stageScale}
      scaleY={stageScale}
      style={{ backgroundColor: 'white' }}
    >
      <Layer x={-minX} y={-minY}>
        <Rect
          x={minX}
          y={minY}
          width={logicalWidth}
          height={logicalHeight}
          fill="white"
          listening={false}
        />
        {image && (
          <KonvaImage
            image={image}
            listening={false}
            x={version?.imagePos?.x || 0}
            y={version?.imagePos?.y || 0}
            scaleX={version?.imageScale || 1}
            scaleY={version?.imageScale || 1}
            rotation={version?.backgroundRotation || 0}
          />
        )}
        {styledUnits.map((unit: any) => {
          const { displayColor, displayOpacity } = unit;

          const shapeProps = {
            key: unit.id,
            x: unit.x,
            y: unit.y,
            fill: displayColor,
            opacity: displayOpacity,
            rotation: unit.rotation || 0,
            stroke: '#ffffff',
            strokeWidth: 2,
            shadowBlur: 4,
            shadowColor: 'rgba(0,0,0,0.5)',
            listening: false,
          };

          if (unit.type === 'rect') {
            return (
              <React.Fragment key={unit.id}>
                <Rect {...shapeProps} width={unit.width} height={unit.height} cornerRadius={4} />
                {unit.name && (
                  <Group
                    x={unit.x}
                    y={unit.y}
                    width={unit.width}
                    height={unit.height}
                    rotation={unit.rotation || 0}
                  >
                    {renderWrappedTextLines(
                      unit.sizeLabelLines || [],
                      unit.width,
                      unit.height,
                      reviewLabelColors
                    )}
                  </Group>
                )}
              </React.Fragment>
            );
          } else if (unit.type === 'circle') {
            const d = (unit.radius || 0) * 2;
            return (
              <React.Fragment key={unit.id}>
                <Circle {...shapeProps} radius={unit.radius} />
                {unit.name && (
                  <Group
                    x={unit.x - (unit.radius || 0)}
                    y={unit.y - (unit.radius || 0)}
                    width={d}
                    height={d}
                  >
                    {renderWrappedTextLines(
                      unit.sizeLabelLines || [],
                      d,
                      d,
                      reviewLabelColors
                    )}
                  </Group>
                )}
              </React.Fragment>
            );
          } else if (unit.type === 'polygon' && unit.points) {
            return (
              <React.Fragment key={unit.id}>
                <Line {...shapeProps} points={unit.points} closed={true} />
                {unit.name &&
                  (() => {
                    const bx = unit.points
                      ? Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 0))
                      : unit.x;
                    const by = unit.points
                      ? Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 1))
                      : unit.y;
                    const bw = unit.points
                      ? Math.max(...unit.points.filter((_: any, i: number) => i % 2 === 0)) - bx
                      : 100;
                    const bh = unit.points
                      ? Math.max(...unit.points.filter((_: any, i: number) => i % 2 === 1)) - by
                      : 30;
                    return (
                      <Group x={bx} y={by} width={bw} height={bh}>
                        {renderWrappedTextLines(
                          unit.sizeLabelLines || [],
                          bw,
                          bh,
                          reviewLabelColors
                        )}
                      </Group>
                    );
                  })()}
              </React.Fragment>
            );
          }
          return null;
        })}
      </Layer>
    </Stage>
  );
};
