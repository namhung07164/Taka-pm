import { Project } from '../../types';

export interface LiveLayoutViewerProps {
  storeFilter: string;
  locationFilter: string;
  yearFilter?: string;
  targetUnitSearch?: string | null;
  onUnitSelected?: (unit: any) => void;
  onClearFocus?: () => void;
}

export interface ContrastStyle {
  text: string;
  shapeStroke: string;
}

// Calculate high-contrast text color based on background perceived luminance (No drop shadow, razor-sharp vector text)
export function getContrastStyle(hexColor: string): ContrastStyle {
  if (!hexColor || typeof hexColor !== 'string') {
    return {
      text: '#ffffff',
      shapeStroke: '#ffffff',
    };
  }
  let c = hexColor.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) {
    return {
      text: '#ffffff',
      shapeStroke: '#ffffff',
    };
  }
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  // Perceived luminance (YIQ standard)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  
  if (yiq >= 145) {
    // Light / bright color background -> Crisp deep dark slate text (#0f172a)
    return {
      text: '#0f172a',
      shapeStroke: '#1e293b',
    };
  } else {
    // Dark / saturated color background -> Crisp pure white text (#ffffff)
    return {
      text: '#ffffff',
      shapeStroke: '#ffffff',
    };
  }
}

export interface UnitScreenBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export interface HoverInfo {
  visible: boolean;
  data: any;
  unitName: string;
  clientX?: number;
  clientY?: number;
  unitScreenBounds?: UnitScreenBounds;
}
