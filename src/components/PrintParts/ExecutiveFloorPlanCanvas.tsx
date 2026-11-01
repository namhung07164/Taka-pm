import React, { useEffect, useRef } from 'react';
import { MapPin, Layers } from 'lucide-react';
import { useOffscreenImage } from '../../hooks/useOffscreenImage';
import { UnitShape } from '../PictureMapping/components/DataMapping/types';
import { MatchedUnitHighlight } from './executiveDeckTypes';

interface ExecutiveFloorPlanCanvasProps {
  floorBgUrl: string | null;
  floorVersionName: string;
  floorBgScale?: number;
  floorBgPos?: { x: number; y: number };
  allFloorUnits: UnitShape[];
  matchedUnits: MatchedUnitHighlight[];
  projectCode?: string;
  locationLabel?: string;
  zoomToUnit?: boolean;
  className?: string;
}

function getUnitBounds(u: UnitShape): { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number } | null {
  const ox = Number(u.x) || 0;
  const oy = Number(u.y) || 0;

  if (u.type === 'rect' && u.width && u.height) {
    return {
      minX: ox,
      minY: oy,
      maxX: ox + u.width,
      maxY: oy + u.height,
      cx: ox + u.width / 2,
      cy: oy + u.height / 2,
    };
  }
  if (u.type === 'circle' && u.radius) {
    return {
      minX: ox - u.radius,
      minY: oy - u.radius,
      maxX: ox + u.radius,
      maxY: oy + u.radius,
      cx: ox,
      cy: oy,
    };
  }
  if (u.type === 'polygon' && Array.isArray(u.points) && u.points.length >= 4) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < u.points.length; i += 2) {
      const px = ox + u.points[i];
      const py = oy + u.points[i + 1];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    if (minX < Infinity) {
      return {
        minX,
        minY,
        maxX,
        maxY,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
      };
    }
  }
  return null;
}

function drawUnitPath(ctx: CanvasRenderingContext2D, u: UnitShape) {
  const ox = Number(u.x) || 0;
  const oy = Number(u.y) || 0;
  ctx.beginPath();
  if (u.type === 'rect' && u.width && u.height) {
    ctx.rect(ox, oy, u.width, u.height);
  } else if (u.type === 'circle' && u.radius) {
    ctx.arc(ox, oy, u.radius, 0, Math.PI * 2);
  } else if (u.type === 'polygon' && Array.isArray(u.points) && u.points.length >= 4) {
    ctx.moveTo(ox + u.points[0], oy + u.points[1]);
    for (let i = 2; i < u.points.length; i += 2) {
      ctx.lineTo(ox + u.points[i], oy + u.points[i + 1]);
    }
    ctx.closePath();
  }
}

export const ExecutiveFloorPlanCanvas: React.FC<ExecutiveFloorPlanCanvasProps> = React.memo(({
  floorBgUrl,
  floorVersionName,
  floorBgScale = 1,
  floorBgPos = { x: 0, y: 0 },
  allFloorUnits,
  matchedUnits,
  projectCode,
  locationLabel,
  zoomToUnit = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [bgImage, status] = useOffscreenImage(floorBgUrl, 'anonymous');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = 540;
    const cssH = 380;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear with clean architectural light slate background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, cssW, cssH);

    // Subtle blueprint grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx < cssW; gx += 24) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, cssH);
      ctx.stroke();
    }
    for (let gy = 0; gy < cssH; gy += 24) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(cssW, gy);
      ctx.stroke();
    }

    // Determine world bounding box of floor plan image + all units
    let worldMinX = Infinity;
    let worldMinY = Infinity;
    let worldMaxX = -Infinity;
    let worldMaxY = -Infinity;

    if (bgImage) {
      const imgW = ('naturalWidth' in bgImage ? bgImage.naturalWidth : bgImage.width) || 1200;
      const imgH = ('naturalHeight' in bgImage ? bgImage.naturalHeight : bgImage.height) || 800;
      const bx = floorBgPos?.x || 0;
      const by = floorBgPos?.y || 0;
      const bs = floorBgScale || 1;
      worldMinX = Math.min(worldMinX, bx);
      worldMinY = Math.min(worldMinY, by);
      worldMaxX = Math.max(worldMaxX, bx + imgW * bs);
      worldMaxY = Math.max(worldMaxY, by + imgH * bs);
    }

    allFloorUnits.forEach((u) => {
      const b = getUnitBounds(u);
      if (b) {
        if (b.minX < worldMinX) worldMinX = b.minX;
        if (b.minY < worldMinY) worldMinY = b.minY;
        if (b.maxX > worldMaxX) worldMaxX = b.maxX;
        if (b.maxY > worldMaxY) worldMaxY = b.maxY;
      }
    });

    // If zoomToUnit is requested and matchedUnits exist, zoom around matchedUnits with generous context padding
    if (zoomToUnit && matchedUnits.length > 0) {
      let uMinX = Infinity;
      let uMinY = Infinity;
      let uMaxX = -Infinity;
      let uMaxY = -Infinity;
      matchedUnits.forEach((mu) => {
        const b = getUnitBounds(mu.unit);
        if (b) {
          if (b.minX < uMinX) uMinX = b.minX;
          if (b.minY < uMinY) uMinY = b.minY;
          if (b.maxX > uMaxX) uMaxX = b.maxX;
          if (b.maxY > uMaxY) uMaxY = b.maxY;
        }
      });
      if (uMinX < Infinity) {
        const spanW = Math.max(240, (uMaxX - uMinX) * 3.2);
        const spanH = Math.max(180, (uMaxY - uMinY) * 3.2);
        const cx = (uMinX + uMaxX) / 2;
        const cy = (uMinY + uMaxY) / 2;
        worldMinX = cx - spanW / 2;
        worldMaxX = cx + spanW / 2;
        worldMinY = cy - spanH / 2;
        worldMaxY = cy + spanH / 2;
      }
    }

    if (worldMinX === Infinity || worldMaxX <= worldMinX || worldMaxY <= worldMinY) {
      worldMinX = 0;
      worldMinY = 0;
      worldMaxX = 1000;
      worldMaxY = 700;
    }

    const pad = 18;
    const availW = cssW - pad * 2;
    const availH = cssH - pad * 2;
    const worldW = Math.max(1, worldMaxX - worldMinX);
    const worldH = Math.max(1, worldMaxY - worldMinY);
    const scale = Math.min(availW / worldW, availH / worldH);
    const offsetX = pad + (availW - worldW * scale) / 2 - worldMinX * scale;
    const offsetY = pad + (availH - worldH * scale) / 2 - worldMinY * scale;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // 1. Draw Floor Plan Background Image
    if (bgImage) {
      const bx = floorBgPos?.x || 0;
      const by = floorBgPos?.y || 0;
      const bs = floorBgScale || 1;
      const imgW = ('naturalWidth' in bgImage ? bgImage.naturalWidth : bgImage.width) || 1200;
      const imgH = ('naturalHeight' in bgImage ? bgImage.naturalHeight : bgImage.height) || 800;
      ctx.drawImage(bgImage as CanvasImageSource, bx, by, imgW * bs, imgH * bs);
    }

    // 2. Draw Subtle Context Outlines for Non-Matched Floor Units
    const matchedIds = new Set(matchedUnits.map((m) => m.unit.id || m.unit.name));
    allFloorUnits.forEach((u) => {
      if (matchedIds.has(u.id || u.name)) return;
      drawUnitPath(ctx, u);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
      ctx.lineWidth = 1 / scale;
      ctx.stroke();
    });

    // 3. Draw Highlighted Target Unit(s) with Callout Ring & Label
    matchedUnits.forEach((mu) => {
      const b = getUnitBounds(mu.unit);
      drawUnitPath(ctx, mu.unit);
      ctx.fillStyle = mu.color ? `${mu.color}55` : 'rgba(239, 68, 68, 0.38)';
      ctx.fill();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.8 / scale;
      ctx.stroke();

      if (b) {
        // Outer callout highlight ring around the unit
        const calloutRadius = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.72 + 12 / scale;
        ctx.beginPath();
        ctx.arc(b.cx, b.cy, calloutRadius, 0, Math.PI * 2);
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2.2 / scale;
        ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    ctx.restore();

    // 4. Draw Crisp Screen-Space Callout Tags for Matched Units
    matchedUnits.slice(0, 12).forEach((mu) => {
      const b = getUnitBounds(mu.unit);
      if (!b) return;
      const screenX = b.cx * scale + offsetX;
      const screenY = b.minY * scale + offsetY - 10;

      const labelText = mu.unit.name || mu.projectCode;
      ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
      const textW = ctx.measureText(labelText).width;
      const pillW = textW + 12;
      const pillH = 18;
      const px = Math.max(4, Math.min(cssW - pillW - 4, screenX - pillW / 2));
      const py = Math.max(4, Math.min(cssH - pillH - 4, screenY - pillH));

      // Tag background
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.roundRect(px, py, pillW, pillH, 4);
      ctx.fill();

      // Tag border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Tag text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, px + pillW / 2, py + pillH / 2);
    });

    ctx.restore();
  }, [bgImage, status, floorBgPos, floorBgScale, allFloorUnits, matchedUnits, zoomToUnit]);

  const hasUnitMatch = matchedUnits.length > 0;

  return (
    <div className={`relative w-full h-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex flex-col ${className}`}>
      {/* Top Floating Overlay Badge */}
      <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between gap-2 pointer-events-none">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/85 text-white text-[10px] font-bold shadow-sm backdrop-blur-xs">
          <Layers className="w-3 h-3 text-blue-400 shrink-0" />
          <span className="truncate max-w-[180px]">{floorVersionName || locationLabel || 'Floor Layout'}</span>
        </div>

        <div
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-sm ${
            hasUnitMatch
              ? 'bg-red-600 text-white'
              : 'bg-amber-100 text-amber-800 border border-amber-300'
          }`}
        >
          <MapPin className="w-3 h-3 shrink-0" />
          <span>
            {hasUnitMatch
              ? matchedUnits.length === 1
                ? `Unit: ${matchedUnits[0].unit.name || projectCode}`
                : `${matchedUnits.length} Highlighted Units`
              : projectCode
              ? `Loc: ${locationLabel || 'Store'} (${projectCode})`
              : 'Floor Overview'}
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain block"
      />

      {!floorBgUrl && allFloorUnits.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-50/90">
          <MapPin className="w-8 h-8 text-slate-400 mb-1.5" />
          <div className="text-xs font-bold text-slate-700">
            Floor Layout Not Linked Yet ({locationLabel || 'N/A'})
          </div>
          <div className="text-[10px] text-slate-500 max-w-[220px] mt-0.5">
            Unit {projectCode || ''} is registered on floor {locationLabel || 'Store'}. Upload or link floor plan in Picture Mapping to display CAD map.
          </div>
        </div>
      )}
    </div>
  );
});

ExecutiveFloorPlanCanvas.displayName = 'ExecutiveFloorPlanCanvas';
