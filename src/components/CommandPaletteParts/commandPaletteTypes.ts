import React from 'react';
import { TabId } from '../../types';

export interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTabChange: (tab: TabId) => void;
  onToggleTheme?: () => void;
  onToggleFocusMode?: () => void;
  onPrintPreviewToggle?: () => void;
}

export type CommandCategory = 'all' | 'actions' | 'navigation' | 'floors' | 'projects' | 'tasks';

export interface PaletteItem {
  id: string;
  category: 'actions' | 'navigation' | 'floors' | 'projects' | 'tasks';
  title: string;
  subtitle?: string;
  code?: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ElementType;
  iconColor?: string;
  shortcut?: string;
  onSelect: () => void;
  score?: number;
}
