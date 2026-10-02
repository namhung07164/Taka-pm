import React, { memo } from 'react';
import { X, Link as LinkIcon } from 'lucide-react';
import { cn, getTaskStatus, resolveActualStatus } from '../../lib/utils';
import { QRCodeButton } from '../QRCodeButton';
import { Task, DelegationGroup } from '../../types';

interface TaskModalHeaderProps {
  task: Task | null;
  activeTab: 'details' | 'chat';
  setActiveTab: (tab: 'details' | 'chat') => void;
  handleOpenProjectComments: () => void;
  onClose: () => void;
  t: (key: string) => string;
  delegationGroups?: DelegationGroup[];
}

export const TaskModalHeader = memo(function TaskModalHeader({
  task,
  activeTab,
  setActiveTab,
  handleOpenProjectComments,
  onClose,
  t,
  delegationGroups
}: TaskModalHeaderProps) {
  const planStatus = task ? getTaskStatus(task.start, task.finish) : 'Upcoming';
  const linkedGroup = task && delegationGroups ? delegationGroups.find(g => g.parentTaskId === task.id) : undefined;
  const actualStatus = task ? resolveActualStatus(planStatus, linkedGroup?.subTasks || []) : { label: 'Upcoming', color: 'bg-slate-50 text-slate-600 border-slate-200' };

  let planColorClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-bold';
  if (planStatus === 'Completed') {
    planColorClass = 'bg-emerald-600 text-white border-emerald-500 font-extrabold shadow-2xs';
  } else if (planStatus === 'On process') {
    planColorClass = 'bg-amber-500 text-white border-amber-400 font-extrabold shadow-2xs';
  }

  return (
    <div className="modal-handle cursor-move px-4 md:px-6 py-4 border-b border-slate-100 dark:border-[#333336] flex justify-between items-center bg-slate-50 dark:bg-[#1e1e20]/50 shrink-0 pt-[env(safe-area-inset-top)] md:pt-4">
      {task ? (
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex gap-1 bg-slate-200/50 dark:bg-[#28282a] p-1 rounded-lg">
            <button 
              type="button"
              onClick={() => setActiveTab('details')} 
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-bold transition-colors cursor-pointer active:scale-95 touch-manipulation", 
                activeTab === 'details' 
                  ? "bg-white dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3] shadow-sm" 
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              {t("Details")}
            </button>
            <button 
              type="button"
              onClick={() => setActiveTab('chat')} 
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-bold transition-colors cursor-pointer active:scale-95 touch-manipulation", 
                activeTab === 'chat' 
                  ? "bg-white dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3] shadow-sm" 
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              {t("Comments")}
            </button>
          </div>
          <button 
            type="button"
            onClick={handleOpenProjectComments}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-200/50 dark:bg-[#28282a] hover:bg-slate-200 dark:hover:bg-[#333336] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer active:scale-95 touch-manipulation"
            title="Go to Project Comments"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("Project")}</span>
          </button>
        </div>
      ) : (
        <h3 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3]">Task Details</h3>
      )}

      <div className="flex items-center gap-1.5">
        {task && (
          <div className="flex items-center gap-1 mr-1">
            <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border shadow-2xs whitespace-nowrap", planColorClass)}>
              Pl: {planStatus}
            </span>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border shadow-2xs whitespace-nowrap", actualStatus.color)}>
              Act: {actualStatus.label}
            </span>
          </div>
        )}
        {task && task.id && (
          <QRCodeButton 
            title={task.name} 
            url={`${window.location.origin}${window.location.pathname}?targetType=task&targetId=${task.id}&code=${encodeURIComponent(task.projectCode || '')}&store=${task.projectStore || ''}&year=${task.projectYear || ''}`} 
          />
        )}
        <button 
          type="button"
          onClick={onClose} 
          className="text-slate-400 dark:text-[#838383] hover:text-slate-600 dark:hover:text-white p-3 -mr-3 transition-colors cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
});
