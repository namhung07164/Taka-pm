import React, { FC, memo } from 'react';
import { Calculator } from 'lucide-react';

export interface GanttSumBadgeProps {
  isEditMode?: boolean;
  sumMode?: 'none' | 'duration';
  selectedTaskCount?: number;
  selectedProjectCount?: number;
  computedSum?: number | null;
  sumDuration?: number | null;
}

export const GanttSumBadge: React.FC<GanttSumBadgeProps> = React.memo(({
  isEditMode = true,
  sumMode = 'duration',
  selectedTaskCount,
  selectedProjectCount,
  computedSum,
  sumDuration,
}) => {
  const finalSum = sumDuration !== undefined ? sumDuration : computedSum;
  if (finalSum === null || finalSum === undefined) {
    return null;
  }
  if (!isEditMode && sumDuration === undefined) {
    return null;
  }
  if (sumMode === 'none' && sumDuration === undefined) {
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
          {finalSum} Days
        </span>
      </div>
    </div>
  );
});

GanttSumBadge.displayName = 'GanttSumBadge';
