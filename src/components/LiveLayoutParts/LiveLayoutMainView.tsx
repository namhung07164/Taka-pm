import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import { Stage, Layer, FastLayer, Image as KonvaImage, Rect, Circle, Line, Text, Group, Path } from 'react-konva';
import useImage from 'use-image';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  RefreshCw, 
  Maximize2, 
  Palette, 
  SlidersHorizontal,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { LiveLayoutMainViewProps } from './liveLayoutTypes';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { LayoutUnitTooltip } from '../LayoutTabParts/LayoutUnitTooltip';
import { resolveR2UrlToHttp } from '../PictureMapping/lib/r2Upload';
import { 
  getStatus, 
  computeProjectActStatus, 
  cn, 
  extractAllProjectCodes, 
  projectMatchesUnitCode 
} from '../../lib/utils';
import { Project } from '../../types';

// Contrast calculator for crisp text labels
function getContrastStyle(hexColor: string) {
  if (!hexColor || typeof hexColor !== 'string') {
    return { text: '#ffffff', shapeStroke: '#ffffff' };
  }
  let c = hexColor.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) return { text: '#ffffff', shapeStroke: '#ffffff' };
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return {
    text: yiq >= 140 ? '#0f172a' : '#ffffff',
    shapeStroke: yiq >= 140 ? '#334155' : '#e2e8f0',
  };
}

export const LiveLayoutMainView: React.FC<LiveLayoutMainViewProps> = ({
  config,
  storeFilter,
  locationFilter,
  yearFilter,
  targetUnitSearch,
  onUnitSelected,
  onClearFocus,
  onRefreshConfig,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredUnitCode, setHoveredUnitCode] = useState<string | null>(null);

  const { enrichedProjects: allProjects } = useEnrichedData();
  const tooltipRef = useRef<HTMLDivElement>(null as any);

  // Find active floor version from config
  const activeVersion = useMemo(() => {
    if (!config) return null;
    if (config.storeLocationData) {
      // Find matching partition
      const sKey = (storeFilter || 'HCM').toUpperCase();
      const lKey = (locationFilter || 'L1').toUpperCase();
      const pKey = `${sKey}_${lKey}`;
      const part = config.storeLocationData[pKey];
      if (part?.mapVersions?.length) {
        return part.mapVersions.find((v: any) => v.isDynamicActive) || part.mapVersions[0];
      }
    }
    if (Array.isArray(config.versions) && config.versions.length) {
      return config.versions.find((v: any) => v.isDynamicActive) || config.versions[0];
    }
    return config.version || null;
  }, [config, storeFilter, locationFilter]);

  const [bgUrl, setBgUrl] = useState<string>('');
  useEffect(() => {
    if (!activeVersion?.backgroundUrl) {
      setBgUrl('');
      return;
    }
    resolveR2UrlToHttp(activeVersion.backgroundUrl).then(url => {
      setBgUrl(url || '');
    });
  }, [activeVersion]);

  const [bgImage] = useImage(bgUrl, 'anonymous');

  // Candidate units
  const units = useMemo(() => {
    if (!activeVersion) return [];
    return activeVersion.units || activeVersion.mapUnits || config?.units || [];
  }, [activeVersion, config]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth || 800,
          height: containerRef.current.offsetHeight || 600,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Zoom handlers
  const handleZoom = (factor: number) => {
    const newScale = Math.max(0.2, Math.min(8, scale * factor));
    setScale(newScale);
  };

  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col bg-slate-900 overflow-hidden select-none">
      {/* Floating Toolbar Controls */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-lg text-white">
        <button
          type="button"
          onClick={() => handleZoom(1.2)}
          title="Phóng to (+)"
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors active:scale-95 touch-manipulation"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(0.8)}
          title="Thu nhỏ (-)"
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors active:scale-95 touch-manipulation"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          title="Tỷ lệ 100%"
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors active:scale-95 touch-manipulation"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        {onRefreshConfig && (
          <button
            type="button"
            onClick={onRefreshConfig}
            title="Làm mới bản đồ"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors active:scale-95 touch-manipulation"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Konva Canvas Stage */}
      <div className="flex-1 w-full h-full cursor-grab active:cursor-grabbing">
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={dimensions.height}
          scaleX={scale}
          scaleY={scale}
          x={position.x}
          y={position.y}
          draggable
          onDragEnd={(e) => {
            setPosition({ x: e.target.x(), y: e.target.y() });
          }}
          onClick={(e) => {
            if (e.target === stageRef.current) {
              setSelectedUnit(null);
              setTooltipPos(null);
              onClearFocus?.();
            }
          }}
        >
          {/* Fast Background Layer */}
          <FastLayer listening={false} perfectDrawEnabled={false}>
            {bgImage && (
              <KonvaImage
                image={bgImage}
                x={0}
                y={0}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
          </FastLayer>

          {/* Interactive Units Layer */}
          <Layer>
            {units.map((unit: any) => {
              const unitCode = unit.code || unit.name || unit.id || '';
              const matchedProject = allProjects.find(p => projectMatchesUnitCode(extractAllProjectCodes(p), unitCode));
              const isHovered = hoveredUnitCode === unitCode;
              const isSelected = selectedUnit?.code === unitCode;
              const isSearchTarget = targetUnitSearch && unitCode.toLowerCase().includes(targetUnitSearch.toLowerCase());

              const actStatus = matchedProject ? computeProjectActStatus(matchedProject) : 'Upcoming';
              let fillColor = unit.fillColor || unit.color || '#3b82f6';
              if (actStatus === 'Completed') fillColor = '#10b981';
              else if (actStatus === 'On process') fillColor = '#3b82f6';
              else if (actStatus === 'Delay') fillColor = '#ef4444';
              else if (actStatus === 'Upcoming') fillColor = '#64748b';

              const contrast = getContrastStyle(fillColor);

              return (
                <Group
                  key={unit.id || unitCode}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    setSelectedUnit(unit);
                    const pointer = stageRef.current?.getPointerPosition();
                    if (pointer) {
                      setTooltipPos({ x: pointer.x, y: pointer.y });
                    }
                    onUnitSelected?.(unit);
                  }}
                  onTap={(e) => {
                    e.cancelBubble = true;
                    setSelectedUnit(unit);
                    const pointer = stageRef.current?.getPointerPosition();
                    if (pointer) {
                      setTooltipPos({ x: pointer.x, y: pointer.y });
                    }
                    onUnitSelected?.(unit);
                  }}
                  onMouseEnter={() => setHoveredUnitCode(unitCode)}
                  onMouseLeave={() => setHoveredUnitCode(null)}
                >
                  {unit.path ? (
                    <Path
                      data={unit.path}
                      fill={fillColor}
                      opacity={isSelected || isSearchTarget ? 0.95 : 0.8}
                      stroke={isSelected || isSearchTarget ? '#eab308' : contrast.shapeStroke}
                      strokeWidth={isSelected || isSearchTarget ? 3 : 1}
                    />
                  ) : (
                    <Rect
                      x={unit.x || 0}
                      y={unit.y || 0}
                      width={unit.width || 80}
                      height={unit.height || 60}
                      fill={fillColor}
                      opacity={isSelected || isSearchTarget ? 0.95 : 0.8}
                      stroke={isSelected || isSearchTarget ? '#eab308' : contrast.shapeStroke}
                      strokeWidth={isSelected || isSearchTarget ? 3 : 1}
                      cornerRadius={4}
                    />
                  )}

                  {/* Unit Label Text */}
                  <Text
                    x={(unit.x || 0) + 4}
                    y={(unit.y || 0) + 4}
                    text={unitCode}
                    fontSize={11}
                    fontStyle="bold"
                    fill={contrast.text}
                    listening={false}
                  />
                </Group>
              );
            })}
          </Layer>
        </Stage>
      </div>

      {/* Floating Selected Unit Tooltip */}
      {selectedUnit && (
        <LayoutUnitTooltip
          hoverInfo={{
            visible: true,
            data: selectedUnit,
            unitName: selectedUnit.name || selectedUnit.code || selectedUnit.id || '',
            clientX: tooltipPos?.x,
            clientY: tooltipPos?.y,
          }}
          tooltipRef={tooltipRef}
          containerRef={containerRef}
          onClose={() => setSelectedUnit(null)}
          storeFilter={storeFilter}
        />
      )}
    </div>
  );
};

export default LiveLayoutMainView;
