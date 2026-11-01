import React, { useState, useEffect, useRef } from "react";
import { useShallow } from 'zustand/react/shallow';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, Line, Text, Group } from 'react-konva';
import { useOffscreenImage } from '../../../../hooks/useOffscreenImage';
import { useDataStore } from '../../DataContext';
import { useSummaryData, generateSizeLabel, generateSizeLabelLines } from '../../lib/summaryData';
import { resolveR2UrlToHttp } from '../../lib/r2Upload';

// Component for a single version stage
const VersionStage = ({ version, mapUnits, summaryData, selectedLabels, reviewLabelColors, windowSize }: any) => {
  const styledUnits = React.useMemo(() => {
    if (!version) return [];

    const unitToGroupStyle = new Map<string, { color: string; opacity: number }>();
    if (version.groups && version.groupMappings) {
      version.groups.forEach((group: any) => {
        const assignedIds = version.groupMappings[group.id] || [];
        assignedIds.forEach((id: string) => {
          unitToGroupStyle.set(id, {
            color: group.color,
            opacity: group.opacity ?? 0.6
          });
        });
      });
    }

    const summaryMap = new Map();
    summaryData.forEach((s: any) => summaryMap.set(s.unit, s));

    const vLoc = String(version?.location || '').toUpperCase().trim();
    const candidateUnits = (Array.isArray(version?.mapUnits) && version.mapUnits.length > 0)
      ? version.mapUnits
      : mapUnits;

    return candidateUnits
      .filter((unit: any) => {
        const uLoc = String(unit.location || '').toUpperCase().trim();
        if (vLoc && uLoc && uLoc !== vLoc) return false;
        return true;
      })
      .map((unit: any) => {
        const uName = String(unit.name || '').toLowerCase().trim();
        const uId = String(unit.id || '').toLowerCase().trim();
        const style = unitToGroupStyle.get(uId) || (uName ? unitToGroupStyle.get(uName) : null);
        const hasMatchedColor = Boolean(style?.color || unit.targetColor);
        const displayColor = style?.color || unit.targetColor || 'rgba(0, 0, 0, 0.001)';
        const displayOpacity = style?.opacity ?? unit.targetOpacity ?? 0.85;
        const uInfo = summaryMap.get(unit.name);
        const sizeLabelLines = generateSizeLabelLines(unit, uInfo, selectedLabels || ['Unit ID', 'Size SQM']);
        const sizeLabel = generateSizeLabel(unit, uInfo, selectedLabels || ['Unit ID', 'Size SQM']);

        let bbox = { x: unit.x, y: unit.y, width: unit.width || 100, height: unit.height || 30 };
        if (unit.type === 'circle') {
          const r = unit.radius || 0;
          bbox = { x: unit.x - r, y: unit.y - r, width: r * 2, height: r * 2 };
        } else if (unit.type === 'polygon' && unit.points && unit.points.length >= 2) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (let i = 0; i < unit.points.length; i += 2) {
            const px = unit.points[i];
            const py = unit.points[i + 1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
          bbox = { x: minX, y: minY, width: Math.max(10, maxX - minX), height: Math.max(10, maxY - minY) };
        }

        return {
          ...unit,
          displayColor,
          displayOpacity: hasMatchedColor ? displayOpacity : 0.85,
          hasMatchedColor,
          sizeLabelLines,
          sizeLabel,
          bbox
        };
      });
  }, [mapUnits, version, summaryData, selectedLabels]);

  const [resolvedBgUrl, setResolvedBgUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const rawUrl = version?.backgroundUrl || '';
    if (!rawUrl) {
      setResolvedBgUrl('');
      return;
    }
    if (rawUrl.startsWith('r2://') || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:'))) {
      resolveR2UrlToHttp(rawUrl).then(url => {
        if (isMounted) setResolvedBgUrl(url || rawUrl);
      }).catch(() => {
        if (isMounted) setResolvedBgUrl(rawUrl);
      });
    } else {
      setResolvedBgUrl(rawUrl);
    }
    return () => { isMounted = false; };
  }, [version?.backgroundUrl]);

  const [image] = useOffscreenImage(resolvedBgUrl || version?.backgroundUrl || '', 'anonymous');
  const stageRef = useRef<any>(null);
  const wheelRafRef = useRef<number | null>(null);
  const wheelSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWheelDeltaRef = useRef<number>(0);
  const lastWheelPointerRef = useRef<{ x: number; y: number } | null>(null);

  const [scale, setScale] = useState(version?.backgroundScale || 1);
  const [position, setPosition] = useState(version?.backgroundPos || { x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (wheelRafRef.current !== null) cancelAnimationFrame(wheelRafRef.current);
      if (wheelSyncTimerRef.current) clearTimeout(wheelSyncTimerRef.current);
    };
  }, []);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    lastWheelPointerRef.current = pointer;
    pendingWheelDeltaRef.current += e.evt.deltaY;

    if (wheelRafRef.current === null) {
      wheelRafRef.current = requestAnimationFrame(() => {
        wheelRafRef.current = null;
        const curStage = stageRef.current;
        const ptr = lastWheelPointerRef.current;
        if (!curStage || !ptr) return;

        const deltaY = pendingWheelDeltaRef.current;
        pendingWheelDeltaRef.current = 0;

        const oldScale = curStage.scaleX();
        const zoomFactor = Math.exp(-deltaY * 0.0008);
        const newScale = Math.max(0.05, Math.min(10, oldScale * zoomFactor));
        const mousePointTo = {
          x: (ptr.x - curStage.x()) / oldScale,
          y: (ptr.y - curStage.y()) / oldScale,
        };

        curStage.scale({ x: newScale, y: newScale });
        curStage.position({
          x: ptr.x - mousePointTo.x * newScale,
          y: ptr.y - mousePointTo.y * newScale,
        });
        curStage.batchDraw();

        if (wheelSyncTimerRef.current) clearTimeout(wheelSyncTimerRef.current);
        wheelSyncTimerRef.current = setTimeout(() => {
          wheelSyncTimerRef.current = null;
          if (!stageRef.current) return;
          stageRef.current.batchDraw();
          setScale(stageRef.current.scaleX());
          setPosition({ x: stageRef.current.x(), y: stageRef.current.y() });
        }, 120);
      });
    }
  };

  const quantizedScale = Math.max(0.3, Math.round(scale * 4) / 4);

  return (
    <div className="relative mb-8 bg-[#1A1D24] rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      <div className="absolute top-4 left-4 z-10 bg-black/60 px-4 py-2 rounded-lg text-white font-bold tracking-wider uppercase text-sm backdrop-blur-sm">
        {version.name}
      </div>
      <Stage 
        ref={stageRef}
        width={windowSize.width - 64} 
        height={windowSize.height - 100}
        onWheel={handleWheel}
        onDragEnd={(e) => { if (e.target === stageRef.current) setPosition({ x: e.target.x(), y: e.target.y() }); }}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable
      >
        <Layer>
          {image && <KonvaImage 
            image={image} 
            listening={false}
            perfectDrawEnabled={false}
            x={version?.imagePos?.x || 0}
            y={version?.imagePos?.y || 0}
            scaleX={version?.imageScale || 1}
            scaleY={version?.imageScale || 1}
            rotation={version?.backgroundRotation || 0}
          />}
          {styledUnits.map((unit: any) => {
            const { displayColor, displayOpacity, bbox } = unit;

            const shapeProps = {
                key: unit.id,
                x: unit.x,
                y: unit.y,
                fill: displayColor,
                opacity: displayOpacity,
                rotation: unit.rotation || 0,
                stroke: '#ffffff',
                strokeWidth: 1.5,
                strokeScaleEnabled: false,
                perfectDrawEnabled: false,
                listening: false,
            };

            return (
              <React.Fragment key={unit.id}>
                {unit.type === 'rect' && (
                  <Rect {...shapeProps} width={unit.width} height={unit.height} cornerRadius={4} />
                )}
                {unit.type === 'circle' && (
                  <Circle {...shapeProps} radius={unit.radius} />
                )}
                {unit.type === 'polygon' && unit.points && (
                  <Line {...shapeProps} points={unit.points} closed={true} />
                )}

                {unit.name && scale > 0.3 && bbox && (
                  <Group x={bbox.x} y={bbox.y} width={bbox.width} height={bbox.height} rotation={unit.rotation || 0} listening={false}>
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
              </React.Fragment>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
};

function ReviewOnlyView() {
  const { mapUnits, mapVersions, isLoading, reviewLabelColors } = useDataStore(useShallow(state => ({
    mapUnits: state.mapUnits,
    mapVersions: state.mapVersions,
    isLoading: state.isLoading,
    reviewLabelColors: state.reviewLabelColors
  })));
  const summaryData = useSummaryData();
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const params = new URLSearchParams(window.location.search);
  const reviewVersionId = params.get('reviewOnly');
  const labelsParam = params.get('labels');
  const selectedLabels = labelsParam ? labelsParam.split(',') : ['Unit ID', 'Size SQM'];

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isLoading) {
    return <div className="fixed inset-0 bg-black flex items-center justify-center text-white">Loading...</div>;
  }

  if (reviewVersionId === 'all') {
    return (
      <div className="fixed inset-0 bg-bg-dark overflow-y-auto overflow-x-hidden p-8">
        <div className="max-w-[100vw] mx-auto flex flex-col items-center">
            {mapVersions.map(version => (
              <VersionStage key={version.id} version={version} mapUnits={mapUnits} summaryData={summaryData} selectedLabels={selectedLabels} reviewLabelColors={reviewLabelColors} windowSize={windowSize} />
            ))}
        </div>
      </div>
    );
  }

  const activeVersion = mapVersions.find(v => v.id === reviewVersionId);
  
  if (!activeVersion) {
    return <div className="fixed inset-0 bg-black flex items-center justify-center text-white">Version not found.</div>;
  }

  return (
    <div className="fixed inset-0 bg-bg-dark overflow-hidden">
        <VersionStage version={activeVersion} mapUnits={mapUnits} summaryData={summaryData} selectedLabels={selectedLabels} reviewLabelColors={reviewLabelColors} windowSize={{width: windowSize.width + 64, height: windowSize.height + 100}} />
    </div>
  );
}

export default React.memo(ReviewOnlyView);
