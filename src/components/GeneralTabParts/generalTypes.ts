import React from 'react';
import { Project } from '../../types';

export interface GeneralTabProps {
  onProjectClick: (p: Project) => void;
}

export interface DragOverTarget {
  id: string;
  position: 'above' | 'below';
  index: number;
  projectCode?: string;
  projectName?: string;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface CanvasColDef {
  label: string;
  key: string;
}
