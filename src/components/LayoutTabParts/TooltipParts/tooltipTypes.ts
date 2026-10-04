import React from 'react';
import { Project } from '../../../types';

export interface TooltipHoverInfo {
  visible: boolean;
  data: any;
  unitName: string;
  clientX?: number;
  clientY?: number;
  unitScreenBounds?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    centerX: number;
    centerY: number;
  };
}

export interface LayoutUnitTooltipProps {
  hoverInfo: TooltipHoverInfo;
  tooltipRef: React.RefObject<HTMLDivElement>;
  containerRef?: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onEditProject?: (project: Project, isReadOnly?: boolean, tab?: 'details' | 'chat' | 'delegation') => void;
  onOpenMiniGantt?: (project: Project) => void;
  onFocusUnit?: (unitName: string) => void;
  canWrite?: boolean;
  storeFilter?: string;
}

export interface TooltipImageItem {
  id: string;
  url: string;
  title: string;
  source: string;
  isCustom?: boolean;
}

export function getMdStatusColorClass(mdStatus: string): string {
  if (!mdStatus) return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  
  const s = mdStatus.trim().toLowerCase();

  // 1. Signed agreement / Contract Signed / Fully Executed / Finalized (Emerald Green)
  if (s === 'signed agreement' || s.includes('signed agreement') || s.includes('contract signed') || s.includes('executed') || s.includes('fully signed') || s.includes('finalized') || s.includes('agreement signed')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/80';
  }

  // 2. MOU signed / LOI Signed / Pre-Agreed (Teal / Cyan)
  if (s === 'mou signed' || s.includes('mou') || s.includes('loi') || s.includes('loa') || s.includes('pre-agreed') || s.includes('intent')) {
    return 'bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-800/80';
  }

  // 3. Verbally agreed / Verbal / Initial Talk (Warm Amber / Gold)
  if (s === 'verbally agreed' || s.includes('verbal') || s.includes('initial agreement') || s.includes('talks agreed')) {
    return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/80';
  }

  // 4. negotiation / Discussion / Under Review (Sky Blue)
  if (s === 'negotiation' || s.includes('negotiat') || s.includes('discuss') || s.includes('proposal') || s.includes('offer') || s.includes('review') || s.includes('draft') || s.includes('pending')) {
    return 'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800/80';
  }

  // 5. approached / Contacted / Outreach (Indigo)
  if (s === 'approached' || s.includes('approach') || s.includes('contact') || s.includes('reach')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800/80';
  }

  // 6. Rejected / Cancelled / Refused (Rose / Red)
  if (s === 'rejected' || s.includes('reject') || s.includes('cancel') || s.includes('terminat') || s.includes('drop') || s.includes('vacant') || s.includes('hold') || s.includes('fail') || s.includes('refus')) {
    return 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800/80';
  }

  // Default Fallback
  return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
}
