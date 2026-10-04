import React from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Project } from '../../../types';
import { cn } from '../../../lib/utils';

interface TooltipAlertBannerProps {
  alerts?: {
    hasAlert?: boolean;
    level?: string;
    count?: number;
    reasons?: string[];
  };
  visNotifications?: boolean;
  p?: Project;
  canWrite: boolean;
  onEditProject?: (project: Project, isReadOnly?: boolean, tab?: 'details' | 'chat' | 'delegation') => void;
}

export const TooltipAlertBanner: React.FC<TooltipAlertBannerProps> = ({
  alerts,
  visNotifications = true,
  p,
  canWrite,
  onEditProject,
}) => {
  if (!alerts?.hasAlert || visNotifications === false) return null;

  return (
    <div 
      onClick={() => {
        if (p) {
          onEditProject?.(p, !canWrite, 'details');
        }
      }}
      className={cn(
        "group flex items-start justify-between gap-2 p-2.5 rounded-xl text-xs border font-medium my-1 transition-all cursor-pointer active:scale-[0.98] touch-manipulation hover:shadow-md",
        alerts.level === 'critical'
          ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50 hover:bg-red-100/70 dark:hover:bg-red-900/40"
          : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50 hover:bg-amber-100/70 dark:hover:bg-amber-900/40"
      )}
      title="Click to inspect project & tasks"
    >
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <AlertTriangle className={cn(
          "w-4 h-4 shrink-0 mt-0.5",
          alerts.level === 'critical' ? "text-red-500 animate-pulse" : "text-amber-500"
        )} />
        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[10.5px] uppercase tracking-wide">
              {alerts.level === 'critical' ? 'Critical Alert' : 'Schedule Notice'}
            </span>
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.2 rounded-full",
              alerts.level === 'critical' 
                ? "bg-red-200/80 dark:bg-red-900/60 text-red-800 dark:text-red-200" 
                : "bg-amber-200/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200"
            )}>
              {alerts.count} issue{(alerts.count || 0) > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-[11px] mt-0.5">
            {alerts.reasons?.map((reason: string, idx: number) => (
              <span key={idx} className="flex items-center gap-1.5 break-words">
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
                <span>{reason}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0 self-center text-[10px] font-bold opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600 dark:text-[#8ab4f8]">
        <span>Inspect</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};
