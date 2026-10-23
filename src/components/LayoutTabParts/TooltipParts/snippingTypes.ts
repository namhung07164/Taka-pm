export type SnippingTool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'rectangle';

export interface CropBox {
  x: number; // percentage (0 - 100) or pixel
  y: number;
  w: number;
  h: number;
}

export interface StrokePoint {
  x: number; // relative to crop box in percentage (0 - 1)
  y: number;
}

export interface AnnotationStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'rectangle';
  color: string;
  size: number;
  points: StrokePoint[];
}

export interface ColorPreset {
  name: string;
  color: string;
}

export const PEN_COLORS: ColorPreset[] = [
  { name: 'Red', color: '#ef4444' },
  { name: 'Blue', color: '#3b82f6' },
  { name: 'Teal', color: '#14b8a6' },
  { name: 'Yellow', color: '#eab308' },
  { name: 'Green', color: '#22c55e' },
  { name: 'White', color: '#ffffff' },
  { name: 'Black', color: '#0f172a' },
];

export const HIGHLIGHTER_COLORS: ColorPreset[] = [
  { name: 'Yellow', color: '#fef08a' },
  { name: 'Green', color: '#bbf7d0' },
  { name: 'Cyan', color: '#a5f3fc' },
  { name: 'Pink', color: '#fbcfe8' },
  { name: 'Orange', color: '#fed7aa' },
];
