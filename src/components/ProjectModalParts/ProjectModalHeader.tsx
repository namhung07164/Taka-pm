import React, { memo } from 'react';
import { X } from 'lucide-react';
import { Project } from '../../types';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { QRCodeButton } from '../QRCodeButton';

interface ProjectModalHeaderProps {
  project: Project | null;
  activeTab: 'details' | 'chat' | 'delegation';
  setActiveTab: (tab: 'details' | 'chat' | 'delegation') => void;
  onClose: () => void;
}

export const ProjectModalHeader = memo(function ProjectModalHeader({
  project,
  activeTab,
  setActiveTab,
  onClose
}: ProjectModalHeaderProps) {
  const { t } = useLanguage();

  return (
    <div className="modal-handle cursor-move px-4 md:px-6 py-4 border-b border-slate-100 dark:border-[#333336] flex justify-between items-center bg-slate-50 dark:bg-[#1e1e20]/50 shrink-0 pt-[env(safe-area-inset-top)] md:pt-4">
      {project ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={cn(
              "px-3 py-1 rounded-lg text-sm font-bold transition-colors cursor-pointer",
              activeTab === 'details'
                ? "bg-slate-200 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3]"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-[#28282a]"
            )}
          >
            Project Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={cn(
              "px-3 py-1 rounded-lg text-sm font-bold transition-colors cursor-pointer",
              activeTab === 'chat'
                ? "bg-slate-200 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3]"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-[#28282a]"
            )}
          >
            {t("Comments")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('delegation')}
            className={cn(
              "px-3 py-1 rounded-lg text-sm font-bold transition-colors flex items-center gap-1 cursor-pointer",
              activeTab === 'delegation'
                ? "bg-slate-200 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3]"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-[#28282a]"
            )}
          >
            Tracker
          </button>
        </div>
      ) : (
        <h3 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3]">New Project</h3>
      )}
      <div className="flex items-center gap-1">
        {project && project.id && typeof window !== 'undefined' && (
          <QRCodeButton
            title={project.name || project.code}
            url={`${window.location.origin}${window.location.pathname}?targetType=project&targetId=${project.id || project.no}&code=${encodeURIComponent(project.code || '')}&store=${project.store || ''}&year=${project.year || ''}`}
          />
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 dark:text-[#838383] hover:text-slate-600 p-3 -mr-3 cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
});
