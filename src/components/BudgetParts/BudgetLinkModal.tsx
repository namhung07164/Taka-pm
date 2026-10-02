import React from 'react';
import { motion, useDragControls } from 'motion/react';
import { Layers, X, Check, Link as LinkIcon, Unlink, Sparkles } from 'lucide-react';
import { Project } from '../../types';
import { ProjectFinancials } from './budgetTypes';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';

interface BudgetLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedParentProject: Project | null;
  setSelectedParentProject: (p: Project | null) => void;
  parentSearchTerm: string;
  setParentSearchTerm: (term: string) => void;
  childSearchTerm: string;
  setChildSearchTerm: (term: string) => void;
  candidateParentProjects: Project[];
  candidateChildProjects: Project[];
  linkedChildrenCount: number;
  getProjectFinancials: (p: Project) => ProjectFinancials;
  handleLinkParent: (childProject: Project, parentCode: string | null) => Promise<void>;
  formatCurrency: (val: number | undefined) => string;
}

export function BudgetLinkModal({
  isOpen,
  onClose,
  selectedParentProject,
  setSelectedParentProject,
  parentSearchTerm,
  setParentSearchTerm,
  childSearchTerm,
  setChildSearchTerm,
  candidateParentProjects,
  candidateChildProjects,
  linkedChildrenCount,
  getProjectFinancials,
  handleLinkParent,
  formatCurrency
}: BudgetLinkModalProps) {
  const { t } = useLanguage();
  const dragControls = useDragControls();

  if (!isOpen && !selectedParentProject) return null;

  const parentStats = selectedParentProject ? getProjectFinancials(selectedParentProject) : null;
  const parentStore = selectedParentProject ? String(selectedParentProject.store || '').toLowerCase() : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-hidden pointer-events-auto">
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl w-[96vw] max-w-6xl xl:max-w-7xl h-[90vh] max-h-[860px] flex flex-col border border-slate-200 dark:border-[#333336] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Drag Header */}
        <div 
          onPointerDown={(e) => dragControls.start(e)}
          className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-[#333336] flex items-center justify-between bg-slate-50/90 dark:bg-[#18181a] cursor-grab active:cursor-grabbing select-none shrink-0"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-[#8ab4f8]">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base md:text-lg text-slate-900 dark:text-[#e3e3e3]">
              {t('Project Modular (Link Budget)')}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#28282a] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Side-by-side 2 Column Layout (Desktop: Main left, Sub right | Mobile: Top, Bottom) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden bg-slate-100/40 dark:bg-[#121214]">
          {/* PANEL 1: CHOOSE MAIN PROJECT */}
          <div className="flex flex-col h-[500px] lg:h-full min-h-0 bg-white dark:bg-[#1c1c1f] rounded-xl border border-emerald-200/80 dark:border-emerald-900/30 shadow-xs overflow-hidden">
            {/* Panel Header */}
            <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-extrabold shadow-xs">1</span>
                  <span>{t('Choose Main Project')}</span>
                </label>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {candidateParentProjects.length} {t('projects')}
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
                {t('Main Project List')} ({candidateParentProjects.length}) — {t('Click to select')}
              </div>
              {candidateParentProjects.length === 0 ? (
                <div className="py-16 text-center text-slate-400 dark:text-slate-500">
                  <p className="text-sm font-medium">{t('No matching project found')}</p>
                  <p className="text-xs mt-1">{t('Please adjust your search.')}</p>
                </div>
              ) : (
                candidateParentProjects.map(p => {
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

          {/* PANEL 2: LINK / UNLINK SUB-PROJECTS */}
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
              ) : candidateChildProjects.length === 0 ? (
                <div className="py-16 text-center text-slate-400 dark:text-slate-500">
                  <p className="text-sm font-medium">{t('No projects available to link')}</p>
                  <p className="text-xs mt-1">{t('Try adjusting your search query.')}</p>
                </div>
              ) : (
                candidateChildProjects.map(childP => {
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
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 rounded-lg border border-red-200 dark:border-red-900/60 shadow-2xs transition-colors active:scale-95"
                              title="Unlink from this main project"
                            >
                              <Unlink className="w-3.5 h-3.5" />
                              <span>{t('Unlink')}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleLinkParent(childP, selectedParentProject.code)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 rounded-lg border border-blue-200 dark:border-blue-900/60 shadow-2xs transition-colors active:scale-95"
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
        </div>
      </motion.div>
    </div>
  );
}
