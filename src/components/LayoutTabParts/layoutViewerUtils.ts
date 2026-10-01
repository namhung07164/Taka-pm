export interface LiveLayoutViewerProps {
  storeFilter: string;
  locationFilter: string;
  yearFilter?: string;
  targetUnitSearch?: string | null;
  onUnitSelected?: (unit: any) => void;
  onClearFocus?: () => void;
}

// Calculate high-contrast text color based on background perceived luminance (No drop shadow, razor-sharp vector text)
export function getContrastStyle(hexColor: string) {
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
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  
  if (yiq >= 145) {
    return {
      text: '#0f172a',
      shapeStroke: '#1e293b',
    };
  } else {
    return {
      text: '#ffffff',
      shapeStroke: '#ffffff',
    };
  }
}
