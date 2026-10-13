import React, { FC, memo } from 'react';
import { Project } from '../../types';
import { ProjectFinancials } from './budgetTypes';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { Link as LinkIcon, Unlink } from 'lucide-react';

interface BudgetLinkChildColumnProps {
  selectedParentProject: Project | null;
  childSearchTerm: string;
  setChildSearchTerm: (val: string) => void;
  filteredChildProjects: Project[];
  handleLinkParent: (childProject: Project, parentCode: string | null) => Promise<void>;
  getProjectFinancials: (p: Project) => ProjectFinancials;
  formatCurrency: (val: number | undefined) => string;
}

export const BudgetLinkChildColumn: React.FC<BudgetLinkChildColumnProps> = React.memo(({
  selectedParentProject,
  childSearchTerm,
  setChildSearchTerm,
  filteredChildProjects,
  handleLinkParent,
  getProjectFinancials,
  formatCurrency,
}) => {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col h-[500px] lg:h-full min-h-0 bg-white dark:bg-[#1c1c1f] rounded-xl border border-blue-200/80 dark:border-blue-900/30 shadow-xs overflow-hidden">
      {/* Panel Header */}
      <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/30 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-extrabold shadow-xs">2</span>
            <span>{t('Link / Unlink Sub-Projects')}</span>
          </label>
          {selectedParentProject && (
            <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold">
              → {t('Main')}: {selectedParentProject.code}
            </span>
          )}
        </div>
        {/* Search Input */}
        <div className="relative">
          <DebouncedSearchInput 
            placeholder={t('Search sub-projects to link or unlink...')}
            value={childSearchTerm}
            onChange={(val) => setChildSearchTerm(val)}
            className="w-full pl-3 pr-8 py-1.5 border rounded-lg bg-white dark:bg-[#18181a] border-slate-200 dark:border-[#38383a] text-xs text-slate-900 dark:text-[#e3e3e3] focus:ring-2 focus:ring-blue-500 outline-none shadow-xs font-medium"
          />
        </div>
      </div>

      {/* Child Candidates Scrollable List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
        {!selectedParentProject ? (
          <div className="py-20 text-center text-slate-400 dark:text-slate-500">
            <p className="text-sm font-semibold">{t('Please choose a Main Project on the left panel first')}</p>
            <p className="text-xs mt-1">{t('Then manage its sub-projects here.')}</p>
          </div>
        ) : filteredChildProjects.length === 0 ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">
            <p className="text-sm font-medium">{t('No projects available to link')}</p>
            <p className="text-xs mt-1">{t('Try adjusting your search query.')}</p>
          </div>
        ) : (
          filteredChildProjects.map((childP) => {
            const isLinkedToCurrent = childP.parentId && String(childP.parentId).trim().toUpperCase() === String(selectedParentProject.code || '').trim().toUpperCase();
            const isLinkedToOther = childP.parentId && !isLinkedToCurrent;
            const cStore = (childP.store || '').toLowerCase();
            const cStats = getProjectFinancials(childP);

            return (
              <div
                key={childP.id || childP.code}
                className={cn(
                  "p-2.5 rounded-xl border transition-all flex flex-col gap-2",
                  isLinkedToCurrent
                    ? "bg-blue-50/80 dark:bg-blue-950/30 border-blue-400 dark:border-blue-800 shadow-xs"
                    : "bg-white dark:bg-[#18181a] border-slate-200 dark:border-[#2e2e32] hover:border-blue-300 dark:hover:border-blue-800"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn(
                        "px-1.5 py-0.5 text-[9px] font-extrabold rounded uppercase tracking-wider border",
                        cStore === 'hcm'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200/80'
                          : cStore === 'hn'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200/80'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200'
                      )}>
                        {childP.store || '-'}
                      </span>
                      <span className="font-mono font-black text-xs text-blue-700 dark:text-[#8ab4f8]">
                        {childP.code}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        • {childP.year || '-'}
                      </span>
                      {childP.location && (
                        <span className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200/60 dark:border-slate-700">
                          {childP.location}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 line-clamp-1">
                      {childP.name}
                    </div>
                  </div>

                  {/* Link / Unlink Action Button */}
                  <div className="shrink-0">
                    {isLinkedToCurrent ? (
                      <button
                        onClick={() => handleLinkParent(childP, null)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 rounded-lg border border-red-200 dark:border-red-900/60 shadow-2xs transition-colors active:scale-95 cursor-pointer"
                        title="Unlink from this main project"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>{t('Unlink')}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleLinkParent(childP, selectedParentProject.code)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 rounded-lg border border-blue-200 dark:border-blue-900/60 shadow-2xs transition-colors active:scale-95 cursor-pointer"
                        title={isLinkedToOther ? `Change link from ${childP.parentId} to ${selectedParentProject.code}` : "Link as sub-project"}
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span>{isLinkedToOther ? `${t('Relink')} (${childP.parentId})` : t('Link')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Mini Financial Stats of Sub-Project */}
                <div className="grid grid-cols-4 gap-1 text-center bg-slate-50/80 dark:bg-[#141416] p-1.5 rounded-lg border border-slate-100 dark:border-slate-800/80 text-[10px]">
                  <div className="flex flex-col">
                    <span className="text-slate-400 font-bold uppercase">{t('Budget')}</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300 truncate">{formatCurrency(cStats.budget)}</span>
                  </div>
                  <div className="flex flex-col border-x border-slate-200 dark:border-slate-700 px-0.5">
                    <span className="text-slate-400 font-bold uppercase">{t('ACT')}</span>
                    <span className="font-mono font-bold text-emerald-600 truncate">{formatCurrency(cStats.actual)}</span>
                  </div>
                  <div className="flex flex-col border-r border-slate-200 dark:border-slate-700 pr-0.5">
                    <span className="text-slate-400 font-bold uppercase">{t('Fee')}</span>
                    <span className="font-mono font-bold text-indigo-600 truncate">{formatCurrency(cStats.supportingFee)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-slate-400 font-bold uppercase">{t('Rem.')}</span>
                    <span className={cn("font-mono font-bold truncate", cStats.remaining < 0 ? "text-red-500" : "text-emerald-600")}>
                      {formatCurrency(cStats.remaining)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
BudgetLinkChildColumn.displayName = 'BudgetLinkChildColumn';
