import React from 'react';

export type HatchPatternType = 
  | 'none' 
  | 'diagonal-right' 
  | 'diagonal-left' 
  | 'cross' 
  | 'dots' 
  | 'horizontal' 
  | 'vertical';

export const PRESET_SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: '★', label: 'Star (VIP / Priority)' },
  { symbol: '▲', label: 'Triangle (Focus / Attention)' },
  { symbol: '◆', label: 'Diamond (Flagship / Luxury)' },
  { symbol: '■', label: 'Square (Anchor Tenant)' },
  { symbol: '●', label: 'Circle (Core Zone)' },
  { symbol: '✕', label: 'Cross (Exclude / Restricted)' },
  { symbol: '⚡', label: 'Bolt (Urgent / Active)' },
  { symbol: '✓', label: 'Check (Confirmed / Done)' },
  { symbol: '!', label: 'Alert (Pending Review)' },
  { symbol: 'P', label: 'P (Process / Planned)' },
  { symbol: 'H', label: 'H (Handover)' },
  { symbol: 'O', label: 'O (Opening Soon)' },
];

export const HATCH_PATTERNS: { id: HatchPatternType; label: string; iconLabel: string; desc: string }[] = [
  { id: 'none', label: 'Solid Color', iconLabel: 'Solid', desc: 'No hatching' },
  { id: 'diagonal-right', label: 'Diagonal 45°', iconLabel: '///', desc: 'Stripe 45 deg' },
  { id: 'diagonal-left', label: 'Diagonal 135°', iconLabel: '\\\\\\', desc: 'Stripe 135 deg' },
  { id: 'cross', label: 'Cross-hatch', iconLabel: '▨', desc: 'Grid crisscross' },
  { id: 'dots', label: 'Dots / Stipple', iconLabel: '⁘', desc: 'Polka dots' },
  { id: 'horizontal', label: 'Horizontal', iconLabel: '═', desc: 'Horizontal lines' },
  { id: 'vertical', label: 'Vertical', iconLabel: '║', desc: 'Vertical lines' },
];

// In-RAM Canvas Pattern Cache for Konva
const patternCanvasCache = new Map<string, HTMLCanvasElement>();

/**
 * Generates or retrieves a cached seamless tile for Konva fillPatternImage
 */
export function getHatchPatternCanvas(color: string, pattern?: string | null): HTMLCanvasElement | null {
  if (!pattern || pattern === 'none') return null;

  const cacheKey = `${color}_${pattern}`;
  const existing = patternCanvasCache.get(cacheKey);
  if (existing) return existing;

  if (typeof document === 'undefined') return null;

  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 1. Draw base color
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  // 2. High-contrast stroke color based on luminance
  const isLight = isColorLight(color);
  const strokeColor = isLight ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.55)';
  const fillColor = isLight ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.7)';

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'square';

  if (pattern === 'diagonal-right') {
    ctx.beginPath();
    ctx.moveTo(0, size); ctx.lineTo(size, 0);
    ctx.moveTo(-size / 2, size / 2); ctx.lineTo(size / 2, -size / 2);
    ctx.moveTo(size / 2, size * 1.5); ctx.lineTo(size * 1.5, size / 2);
    ctx.stroke();
  } else if (pattern === 'diagonal-left') {
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(size, size);
    ctx.moveTo(-size / 2, size / 2); ctx.lineTo(size / 2, size * 1.5);
    ctx.moveTo(size / 2, -size / 2); ctx.lineTo(size * 1.5, size / 2);
    ctx.stroke();
  } else if (pattern === 'cross') {
    ctx.beginPath();
    ctx.moveTo(0, size); ctx.lineTo(size, 0);
    ctx.moveTo(0, 0); ctx.lineTo(size, size);
    ctx.moveTo(-size / 2, size / 2); ctx.lineTo(size / 2, -size / 2);
    ctx.moveTo(size / 2, size * 1.5); ctx.lineTo(size * 1.5, size / 2);
    ctx.moveTo(-size / 2, size / 2); ctx.lineTo(size / 2, size * 1.5);
    ctx.moveTo(size / 2, -size / 2); ctx.lineTo(size * 1.5, size / 2);
    ctx.stroke();
  } else if (pattern === 'dots') {
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 2.5, 0, Math.PI * 2);
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.arc(size, 0, 2.5, 0, Math.PI * 2);
    ctx.arc(0, size, 2.5, 0, Math.PI * 2);
    ctx.arc(size, size, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (pattern === 'horizontal') {
    ctx.beginPath();
    ctx.moveTo(0, 6); ctx.lineTo(size, 6);
    ctx.moveTo(0, 18); ctx.lineTo(size, 18);
    ctx.stroke();
  } else if (pattern === 'vertical') {
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(6, size);
    ctx.moveTo(18, 0); ctx.lineTo(18, size);
    ctx.stroke();
  }

  patternCanvasCache.set(cacheKey, canvas);
  return canvas;
}

/**
 * Returns CSS styles for preview swatches and legend bars
 */
export function getHatchCssStyle(color: string, pattern?: string | null): React.CSSProperties {
  if (!pattern || pattern === 'none') {
    return { backgroundColor: color };
  }

  const isLight = isColorLight(color);
  const stripe = isLight ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.5)';
  const dotColor = isLight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.65)';

  if (pattern === 'diagonal-right') {
    return {
      backgroundColor: color,
      backgroundImage: `repeating-linear-gradient(45deg, ${stripe}, ${stripe} 2px, transparent 2px, transparent 6px)`,
    };
  }
  if (pattern === 'diagonal-left') {
    return {
      backgroundColor: color,
      backgroundImage: `repeating-linear-gradient(-45deg, ${stripe}, ${stripe} 2px, transparent 2px, transparent 6px)`,
    };
  }
  if (pattern === 'cross') {
    return {
      backgroundColor: color,
      backgroundImage: `repeating-linear-gradient(45deg, ${stripe}, ${stripe} 2px, transparent 2px, transparent 6px), repeating-linear-gradient(-45deg, ${stripe}, ${stripe} 2px, transparent 2px, transparent 6px)`,
    };
  }
  if (pattern === 'dots') {
    return {
      backgroundColor: color,
      backgroundImage: `radial-gradient(circle, ${dotColor} 1.5px, transparent 1.5px)`,
      backgroundSize: '6px 6px',
    };
  }
  if (pattern === 'horizontal') {
    return {
      backgroundColor: color,
      backgroundImage: `repeating-linear-gradient(0deg, ${stripe}, ${stripe} 2px, transparent 2px, transparent 6px)`,
    };
  }
  if (pattern === 'vertical') {
    return {
      backgroundColor: color,
      backgroundImage: `repeating-linear-gradient(90deg, ${stripe}, ${stripe} 2px, transparent 2px, transparent 6px)`,
    };
  }

  return { backgroundColor: color };
}

function isColorLight(hexColor: string): boolean {
  if (!hexColor || typeof hexColor !== 'string') return false;
  let c = hexColor.trim().replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  if (c.length !== 6) return false;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  // Perceived brightness formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}
