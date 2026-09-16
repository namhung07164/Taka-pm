export type ShapeType = 'rect' | 'circle' | 'polygon';

export interface Point {
  x: number;
  y: number;
}

export interface UnitShape {
  id: string;
  name: string;
  type: ShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: number[]; // for polygon
  fill?: string;
  opacity?: number;
  rotation?: number;
  visible: boolean;
  locked?: boolean;
}

export interface GroupRule {
  field: string;
  operator: string;
  value: string;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  opacity?: number;
  rules?: GroupRule[];
}

export interface MapVersion {
  id: string;
  name: string;
  backgroundUrl: string | null;
  backgroundScale: number;
  backgroundPos: { x: number; y: number };
  backgroundRotation?: number;
  imagePos?: { x: number; y: number };
  imageScale?: number;
  groups: Group[];
  groupMappings: Record<string, string[]>; // groupId -> array of unitIds
  isDynamicActive?: boolean;
}
