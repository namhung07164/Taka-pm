import React, { FC, memo } from 'react';
import { Project } from '../../types';
import { ProjectFinancials } from './budgetTypes';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { Check } from 'lucide-react';

interface BudgetLinkParentColumnProps {
  filteredParentProjects: Project[];
  selectedParentProject: Project | null;
  setSelectedParentProject: (p: Project | null) => void;
  parentSearchTerm: string;
  setParentSearchTerm: (val: string) => void;
  parentStats: ProjectFinancials | null;
  linkedChildrenCount: number;
  formatCurrency: (val: number | undefined) => string;
}

export const BudgetLinkParentColumn: React.FC<BudgetLinkParentColumnProps> = React.memo(({
  filteredParentProjects,
  selectedParentProject,
  setSelectedParentProject,
  parentSearchTerm,
  setParentSearchTerm,
  parentStats,
  linkedChildrenCount,
  formatCurrency,
}) => {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col h-[500px] lg:h-full min-h-0 bg-white dark:bg-[#1c1c1f] rounded-xl border border-emerald-200/80 dark:border-emerald-900/30 shadow-xs overflow-hidden">
      {/* Panel Header */}
      <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-extrabold shadow-xs">1</span>
            <span>{t('Choose Main Project')}</span>
          </label>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            {filteredParentProjects.length} {t('projects')}
          </span>
        </div>
        {/* Search Input */}
        <div className="relative">
          <DebouncedSearchInput 
            placeholder={t('Search main project by code, name, area...')}
            value={parentSearchTerm}
            onChange={(val) => setParentSearchTerm(val)}
            className="w-full pl-3 pr-8 py-1.5 border rounded-lg bg-white dark:bg-[#18181a] border-slate-200 dark:border-[#38383a] text-xs text-slate-900 dark:text-[#e3e3e3] focus:ring-2 focus:ring-emerald-500 outline-none shadow-xs font-medium"
          />
        </div>
      </div>

      {/* Parent Candidates Scrollable List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
          {t('Main Project List')} ({filteredParentProjects.length}) — {t('Click to select')}
        </div>
        {filteredParentProjects.length === 0 ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">
            <p className="text-sm font-medium">{t('No matching project found')}</p>
            <p className="text-xs mt-1">{t('Please adjust your search.')}</p>
          </div>
        ) : (
          filteredParentProjects.map((p) => {
            const isSelected = selectedParentProject && (selectedParentProject.id === p.id || selectedParentProject.code === p.code);
            const pStore = (p.store || '').toLowerCase();
            return (
              <div
                key={p.id || p.code}
                onClick={() => setSelectedParentProject(p)}
                className={cn(
                  "p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5",
                  isSelected
                    ? "bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/30 shadow-xs"
                    : "bg-white dark:bg-[#18181a] border-slate-200 dark:border-[#2e2e32] hover:border-emerald-300 dark:hover:border-emerald-800 hover:bg-emerald-50/20"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn(
                      "px-1.5 py-0.5 text-[9px] font-extrabold rounded uppercase tracking-wider border",
                      pStore === 'hcm'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200/80'
                        : pStore === 'hn'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200/80'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200'
                    )}>
                      {p.store || '-'}
                    </span>
                    <span className="font-mono font-black text-xs text-blue-700 dark:text-[#8ab4f8]">
                      {p.code}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      • {p.year || '-'}
                    </span>
                    {p.location && (
                      <span className="text-[10px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200/60 dark:border-slate-700">
                        {p.location}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold shrink-0">
                      <Check className="w-4 h-4" />
                      <span>{t('Active Main')}</span>
                    </div>
                  )}
                </div>
                <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 line-clamp-1">
                  {p.name}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Selected Parent Info Footer */}
      {selectedParentProject && parentStats && (
        <div className="p-3 bg-slate-50 dark:bg-[#18181a] border-t border-emerald-100 dark:border-emerald-900/30 flex flex-col gap-1.5 shrink-0 text-xs">
          <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-300">
            <span>{t('Active Main Project')}: <span className="font-mono text-blue-600 dark:text-[#8ab4f8]">{selectedParentProject.code}</span></span>
            <span className="text-emerald-600 font-extrabold">{linkedChildrenCount} {t('Sub-projects linked')}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center pt-1 border-t border-slate-200 dark:border-slate-700/60">
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 font-bold uppercase">{t('Budget')}</span>
              <span className="font-mono text-[11px] font-bold text-blue-900 dark:text-[#8ab4f8] truncate">{formatCurrency(parentStats.budget)}</span>
            </div>
            <div className="flex flex-col border-x border-slate-200 dark:border-slate-700/60 px-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase">{t('ACT / FORC')}</span>
              <span className="font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400 truncate">{formatCurrency(parentStats.actual)}</span>
            </div>
            <div className="flex flex-col border-r border-slate-200 dark:border-slate-700/60 pr-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase">{t('Support Fee')}</span>
              <span className="font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-400 truncate">{formatCurrency(parentStats.supportingFee)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 font-bold uppercase">{t('Remaining')}</span>
              <span className={cn("font-mono text-[11px] font-bold truncate", parentStats.remaining < 0 ? "text-red-500" : "text-emerald-600")}>
                {formatCurrency(parentStats.remaining)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
BudgetLinkParentColumn.displayName = 'BudgetLinkParentColumn';
