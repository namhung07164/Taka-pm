import React from 'react';
import { Calculator } from 'lucide-react';

export interface GanttSumBadgeProps {
  isEditMode: boolean;
  sumMode: 'none' | 'duration';
  selectedTaskCount: number;
  selectedProjectCount: number;
  computedSum: number;
}

export const GanttSumBadge: React.FC<GanttSumBadgeProps> = React.memo(({
  isEditMode,
  sumMode,
  selectedTaskCount,
  selectedProjectCount,
  computedSum,
}) => {
  if (!isEditMode || sumMode === 'none' || (selectedTaskCount === 0 && selectedProjectCount === 0)) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[200] bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4">
      <div className="p-2 bg-emerald-500 rounded-full">
        <Calculator className="w-5 h-5 text-white" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-slate-300 dark:text-slate-600 font-medium">Calculated Sum</span>
        <span className="text-xl font-bold">
          {sumMode === 'duration' && `${computedSum} Days`}
        </span>
      </div>
    </div>
  );
});

GanttSumBadge.displayName = 'GanttSumBadge';
