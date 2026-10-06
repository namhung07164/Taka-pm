import React, { memo } from 'react';
import { X, Link as LinkIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { QRCodeButton } from '../QRCodeButton';
import { Task, DelegationGroup } from '../../types';
import { useIsRowFlashed } from '../../lib/changeFlashService';

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
}: TaskModalHeaderProps) {
  const { isFlashed, updatedBy } = useIsRowFlashed(task?.id);

  return (
    <div className="modal-handle cursor-move px-4 md:px-6 py-4 border-b border-slate-100 dark:border-[#333336] flex justify-between items-center bg-slate-50 dark:bg-[#1e1e20]/50 shrink-0 pt-[env(safe-area-inset-top)] md:pt-4">
      {task ? (
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="flex gap-1 bg-slate-200/50 dark:bg-[#28282a] p-1 rounded-lg shrink-0">
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
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-200/50 dark:bg-[#28282a] hover:bg-slate-200 dark:hover:bg-[#333336] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer active:scale-95 touch-manipulation shrink-0"
            title="Go to Project Comments"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("Project")}</span>
          </button>
          {isFlashed && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 rounded-lg text-xs font-bold border border-emerald-300 dark:border-emerald-700 animate-pulse shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{updatedBy ? `Live updated by ${updatedBy}` : 'Live Synced'}</span>
            </div>
          )}
        </div>
      ) : (
        <h3 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3]">Task Details</h3>
      )}

      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        {task && task.id && (
          <QRCodeButton 
            title={task.name} 
            url={`${window.location.origin}${window.location.pathname}?targetType=task&targetId=${task.id}&code=${encodeURIComponent(task.projectCode || '')}&store=${task.projectStore || ''}&year=${task.projectYear || ''}`} 
          />
        )}
        <button 
          type="button"
          onClick={onClose} 
          className="text-slate-400 dark:text-[#838383] hover:text-slate-600 dark:hover:text-white p-2.5 -mr-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#28282a] transition-colors cursor-pointer active:scale-95 touch-manipulation"
          title="Close (Esc)"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
});
