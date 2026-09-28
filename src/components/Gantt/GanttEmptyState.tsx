import React from 'react';
import { Calendar } from 'lucide-react';

export interface GanttEmptyStateProps {
  colSpan: number;
}

export const GanttEmptyState: React.FC<GanttEmptyStateProps> = React.memo(({ colSpan }) => {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-20 text-slate-400 dark:text-slate-500">
        <div className="flex flex-col items-center justify-center gap-2">
          <Calendar className="w-8 h-8 opacity-30" />
          <p className="text-sm font-medium">No accessible projects or tasks found</p>
          <p className="text-xs text-slate-400">
            There are no projects matching your account permissions or filter criteria.
          </p>
        </div>
      </td>
    </tr>
  );
});

GanttEmptyState.displayName = 'GanttEmptyState';
