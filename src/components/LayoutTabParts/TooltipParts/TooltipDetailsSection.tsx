import React from 'react';
import { cn } from '../../../lib/utils';

interface TooltipDetailsSectionProps {
  v: any;
  taskLines: string[];
  detailText: string;
  descriptionText: string;
}

export const TooltipDetailsSection: React.FC<TooltipDetailsSectionProps> = ({
  v,
  taskLines,
  detailText,
  descriptionText,
}) => {
  const uniqueTaskLines = Array.from(new Set((taskLines || []).map(l => l.trim()).filter(Boolean)));
  const hasDetails = (v.detail && (uniqueTaskLines.length > 0 || detailText)) || (v.description && (descriptionText || detailText));
  if (!hasDetails) return null;

  return (
    <div className="bg-slate-50/90 dark:bg-[#161618] rounded-lg p-2 sm:p-2.5 border border-slate-200/80 dark:border-[#2e2e32] text-xs shadow-2xs flex flex-col gap-1.5 mt-0.5">
      {/* Active Subtasks / Detail */}
      {v.detail && uniqueTaskLines.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Detail
          </div>
          <div className="flex flex-col gap-0.5">
            {uniqueTaskLines.map((line, idx) => (
              <div 
                key={idx} 
                className={`font-medium text-xs leading-tight ${idx % 2 === 0 ? 'text-blue-600 dark:text-[#8ab4f8]' : 'text-orange-600 dark:text-orange-400'}`}
              >
                • {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Description (p.detail or descriptionText) */}
      {(uniqueTaskLines.length === 0 ? (v.detail && detailText) : (v.description && (detailText || descriptionText))) && (
        <div className={cn("flex flex-col gap-0.5", v.detail && uniqueTaskLines.length > 0 ? "pt-1 border-t border-slate-200/60 dark:border-[#2e2e32]" : "")}>
          <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {uniqueTaskLines.length > 0 ? 'Description' : 'Detail'}
          </div>
          <div className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
            {detailText || descriptionText}
          </div>
        </div>
      )}
    </div>
  );
};
