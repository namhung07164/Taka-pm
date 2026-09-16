import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, Line, Text, Group } from 'react-konva';
import useImage from 'use-image';
import { useDataStore } from '../../DataContext';
import { useSummaryData, generateSizeLabel, generateSizeLabelLines } from '../../lib/summaryData';

// Component for a single version stage
const VersionStage = ({ version, mapUnits, summaryData, selectedLabels, reviewLabelColors, windowSize }: any) => {
  const styledUnits = React.useMemo(() => {
    if (!version) return [];

    const unitToGroupStyle = new Map<string, { color: string; opacity: number }>();
    version.groups.forEach((group: any) => {
      const assignedIds = version.groupMappings[group.id] || [];
      assignedIds.forEach((id: string) => {
        unitToGroupStyle.set(id, {
          color: group.color,
          opacity: group.opacity ?? 0.6
        });
      });
    });

    const summaryMap = new Map();
    summaryData.forEach((s: any) => summaryMap.set(s.unit, s));

    return mapUnits
      .filter((unit: any) => unitToGroupStyle.has(unit.id))
      .map((unit: any) => {
        const style = unitToGroupStyle.get(unit.id)!;
        const uInfo = summaryMap.get(unit.name);
        const sizeLabelLines = generateSizeLabelLines(unit, uInfo, selectedLabels || ['Unit ID', 'Size SQM']);
        const sizeLabel = generateSizeLabel(unit, uInfo, selectedLabels || ['Unit ID', 'Size SQM']);
        return {
          ...unit,
          displayColor: style.color,
          displayOpacity: style.opacity,
          sizeLabelLines,
          sizeLabel
        };
      });
  }, [mapUnits, version, summaryData, selectedLabels]);

  const [image] = useImage(version?.backgroundUrl || '', 'anonymous');
  
  const [scale, setScale] = useState(version?.backgroundScale || 1);
  const [position, setPosition] = useState(version?.backgroundPos || { x: 0, y: 0 });

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  return (
    <div className="relative mb-8 bg-[#1A1D24] rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      <div className="absolute top-4 left-4 z-10 bg-black/60 px-4 py-2 rounded-lg text-white font-bold tracking-wider uppercase text-sm backdrop-blur-sm">
        {version.name}
      </div>
      <Stage 
        width={windowSize.width - 64} 
        height={windowSize.height - 100}
        onWheel={handleWheel}
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
            x={version?.imagePos?.x || 0}
            y={version?.imagePos?.y || 0}
            scaleX={version?.imageScale || 1}
            scaleY={version?.imageScale || 1}
            rotation={version?.backgroundRotation || 0}
          />}
          {styledUnits.map((unit: any) => {
            const {  displayColor, displayOpacity } = unit;

            const shapeProps = {
                key: unit.id,
                x: unit.x,
                y: unit.y,
                fill: displayColor,
                opacity: displayOpacity,
                rotation: unit.rotation || 0,
                stroke: '#ffffff',
                strokeWidth: 2 / scale,
                shadowBlur: 4,
                shadowColor: 'rgba(0,0,0,0.5)',
                listening: false,
            };

            if (unit.type === 'rect') {
                return (
                    <React.Fragment key={unit.id}>
                        <Rect {...shapeProps} width={unit.width} height={unit.height} cornerRadius={4} />
                        {unit.name && scale > 0.4 && (
                            <Group x={unit.x} y={unit.y} width={unit.width} height={unit.height} rotation={unit.rotation || 0}>
                                {(() => {
                                  const lines = unit.sizeLabelLines || [];
                                  const fontSize = 14 / scale;
                                  const lineHeight = fontSize * 1.2;
                                  const estimatedCharWidth = fontSize * 0.55;
                                  const effectiveWidth = unit.width;
                                  
                                  const blocks = lines.map((line: any) => {
                                      const charsPerLine = Math.max(1, effectiveWidth / estimatedCharWidth);
                                      const words = String(line.text).split(' ');
                                      let linesCount = 1;
                                      let currentLineLen = 0;
                                      for (let i = 0; i < words.length; i++) {
                                          const wordLen = words[i].length;
                                          if (wordLen > charsPerLine) {
                                              // Word itself is longer than a line, it will wrap
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
                                  let currentY = (unit.height - totalHeight) / 2;
                                  
                                  return blocks.map((block: any, i: number) => {
                                      const y = currentY;
                                      currentY += block.blockHeight;
                                      return (
                                        <Text key={i} x={0} y={y} width={effectiveWidth} text={block.text} fill={reviewLabelColors?.[block.key] || '#ffffff'} align="center" fontSize={fontSize} fontStyle="bold" listening={false} shadowColor="black" shadowBlur={2} shadowOpacity={1} />
                                      );
                                  });
                                })()}
                            </Group>
                        )}
                    </React.Fragment>
                );
            } else if (unit.type === 'circle') {
                 return (
                    <React.Fragment key={unit.id}>
                        <Circle {...shapeProps} radius={unit.radius} />
                        {unit.name && scale > 0.4 && (
                            <Group x={unit.x - (unit.radius||0)} y={unit.y - (unit.radius||0)} width={(unit.radius||0)*2} height={(unit.radius||0)*2}>
                                {(() => {
                                  const lines = unit.sizeLabelLines || [];
                                  const fontSize = 14 / scale;
                                  const lineHeight = fontSize * 1.2;
                                  const estimatedCharWidth = fontSize * 0.55;
                                  const effectiveWidth = (unit.radius||0)*2;
                                  
                                  const blocks = lines.map((line: any) => {
                                      const charsPerLine = Math.max(1, effectiveWidth / estimatedCharWidth);
                                      const words = String(line.text).split(' ');
                                      let linesCount = 1;
                                      let currentLineLen = 0;
                                      for (let i = 0; i < words.length; i++) {
                                          const wordLen = words[i].length;
                                          if (wordLen > charsPerLine) {
                                              // Word itself is longer than a line, it will wrap
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
                                  let currentY = (effectiveWidth - totalHeight) / 2;
                                  
                                  return blocks.map((block: any, i: number) => {
                                      const y = currentY;
                                      currentY += block.blockHeight;
                                      return (
                                        <Text key={i} x={0} y={y} width={effectiveWidth} text={block.text} fill={reviewLabelColors?.[block.key] || '#ffffff'} align="center" fontSize={fontSize} fontStyle="bold" listening={false} shadowColor="black" shadowBlur={2} shadowOpacity={1} />
                                      );
                                  });
                                })()}
                            </Group>
                        )}
                    </React.Fragment>
                );
            } else if (unit.type === 'polygon' && unit.points) {
                return (
                    <React.Fragment key={unit.id}>
                        <Line {...shapeProps} points={unit.points} closed={true} />
                        {unit.name && scale > 0.4 && (() => {
                                const bx = unit.points ? Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 0)) : unit.x;
                                const by = unit.points ? Math.min(...unit.points.filter((_: any, i: number) => i % 2 === 1)) : unit.y;
                                const bw = unit.points ? Math.max(...unit.points.filter((_: any, i: number) => i % 2 === 0)) - bx : 100;
                                const bh = unit.points ? Math.max(...unit.points.filter((_: any, i: number) => i % 2 === 1)) - by : 30;
                                return (
                                  <Group x={bx} y={by} width={bw} height={bh}>
                                    {(() => {
                                      const lines = unit.sizeLabelLines || [];
                                      const fontSize = 14 / scale;
                                      const lineHeight = fontSize * 1.2;
                                      const estimatedCharWidth = fontSize * 0.55;
                                      const effectiveWidth = bw;
                                      
                                      const blocks = lines.map((line: any) => {
                                          const charsPerLine = Math.max(1, effectiveWidth / estimatedCharWidth);
                                          const words = String(line.text).split(' ');
                                          let linesCount = 1;
                                          let currentLineLen = words[0].length;
                                          for (let i = 1; i < words.length; i++) {
                                              if (currentLineLen + 1 + words[i].length <= charsPerLine) {
                                                  currentLineLen += 1 + words[i].length;
                                              } else {
                                                  linesCount++;
                                                  currentLineLen = words[i].length;
                                              }
                                          }
                                          const explicitNewlines = (String(line.text).match(/\n/g) || []).length;
                                          linesCount += explicitNewlines;
                                          return { ...line, blockHeight: linesCount * lineHeight };
                                      });
                                      
                                      const totalHeight = blocks.reduce((sum: number, b: any) => sum + b.blockHeight, 0);
                                      let currentY = (bh - totalHeight) / 2;
                                      
                                      return blocks.map((block: any, i: number) => {
                                          const y = currentY;
                                          currentY += block.blockHeight;
                                          return (
                                            <Text key={i} x={0} y={y} width={effectiveWidth} text={block.text} fill={reviewLabelColors?.[block.key] || '#ffffff'} align="center" fontSize={fontSize} fontStyle="bold" listening={false} shadowColor="black" shadowBlur={2} shadowOpacity={1} />
                                          );
                                      });
                                    })()}
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
