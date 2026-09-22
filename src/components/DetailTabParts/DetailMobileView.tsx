import React, { memo } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, Plus, Maximize2, Trash2 } from 'lucide-react';
import { Project, Task, DelegationGroup } from '../../types';
import { FastToggle } from './FastToggle';
import { QuickNavButton } from '../QuickNavButton';
import { 
  cn, 
  formatDisplayDateMain, 
  formatDisplayDateTime, 
  calculateDays, 
  parseDateTime, 
  getTaskStatus, 
  resolveActualStatus, 
  computePlanProgressPercent, 
  computeActProgressPercent
} from '../../lib/utils';
import { normalizeAndHealTaskPredecessors, computeTaskCode } from '../../lib/ganttUtils';

interface DetailMobileViewProps {
  filteredProjects: Project[];
  expandedCodes: string[];
  setExpandedCodes: React.Dispatch<React.SetStateAction<string[]>>;
  visibleCount: number;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
  projectInfoMap: Map<string, any>;
  getProjectInfo: (p: Project) => any;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  delegationGroupByParentKey: Map<string, DelegationGroup>;
  initialFocusTaskId?: string;
  canWrite: boolean;
  tasks: Task[];
  projects: Project[];
  lowerSearchTerm: string;
  delegationGroups: DelegationGroup[];
  toggleGroup: (id: string) => void;
  onEditProject?: (p: Project, isReadOnly?: boolean, initialTab?: string) => void;
  onAddTask: (p?: Project | null) => void;
  onEditTask: (t: Task, isReadOnly?: boolean, initialTab?: string) => void;
  handleUpdateProject: (p: Project, field: string, val: any) => void;
  handleMoveTask: (p: Project, groupTasks: Task[], index: number, direction: 'up' | 'down') => void;
  handleUpdateTask: (task: Task, updates: Partial<Task>) => void;
  handleDeleteTask: (task: Task) => void;
}

export const DetailMobileView = memo(function DetailMobileView({
  filteredProjects,
  expandedCodes,
  setExpandedCodes,
  visibleCount,
  setVisibleCount,
  projectInfoMap,
  getProjectInfo,
  sortConfig,
  delegationGroupByParentKey,
  initialFocusTaskId,
  canWrite,
  tasks,
  projects,
  lowerSearchTerm,
  delegationGroups,
  toggleGroup,
  onEditProject,
  onAddTask,
  onEditTask,
  handleUpdateProject,
  handleMoveTask,
  handleUpdateTask,
  handleDeleteTask
}: DetailMobileViewProps) {
  return (
    <>
      <div className="xl:hidden flex justify-between items-center px-2 pb-2">
        <span className="text-sm font-bold text-slate-600 dark:text-[#a3a3a3]">Projects ({filteredProjects.length})</span>
        <button 
          onClick={() => setExpandedCodes(expandedCodes.length === 0 ? filteredProjects.map(p => String(p.id!)) : [])} 
          className="flex items-center gap-1 text-sm text-blue-600 dark:text-[#8ab4f8] font-medium hover:text-blue-800 dark:text-[#8ab4f8] transition-colors cursor-pointer"
        >
          {expandedCodes.length === 0 ? (
            <><ChevronRight className="w-4 h-4" /> Expand All</>
          ) : (
            <><ChevronDown className="w-4 h-4" /> Collapse All</>
          )}
        </button>
      </div>

      <div className="xl:hidden flex-grow overflow-y-auto flex flex-col gap-4 pb-4 px-2">
        {filteredProjects.slice(0, visibleCount).map((p, pIdx) => {
          const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
          const pInfo = projectInfoMap.get(pKey) || getProjectInfo(p);
          const sortedTasks = pInfo.sortedTasks || [];
          const groupTasks = sortConfig ? [...sortedTasks].sort((a, b) => {
            if (!sortConfig) return 0;
            let valA = '';
            let valB = '';
            let direction = sortConfig.direction;
            if (sortConfig.key === 'start') {
              valA = a.start || '9999-12-31';
              valB = b.start || '9999-12-31';
            } else if (sortConfig.key === 'finish') {
              valA = a.finish || '9999-12-31';
              valB = b.finish || '9999-12-31';
            } else if (sortConfig.key === 'taskName') {
              valA = a.name || '';
              valB = b.name || '';
            } else if (sortConfig.key === 'duration') {
              const numA = Number(a.duration || '0');
              const numB = Number(b.duration || '0');
              if (numA < numB) return direction === 'asc' ? -1 : 1;
              if (numA > numB) return direction === 'asc' ? 1 : -1;
              return 0;
            }
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
          }) : sortedTasks;

          const computedTakStart = pInfo.computedTakStart;
          const computedTakCompl = pInfo.computedTakCompl;
          const status = pInfo.status;
          
          let statusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
          if (status === 'Completed') statusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
          else if (status === 'Handover') statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
          else if (status === 'On process') statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
          else if (status === 'Canceled') statusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200';

          const effectiveTaskCount = groupTasks.length > 0 
            ? groupTasks.length 
            : (p.taskCount !== undefined 
                ? p.taskCount 
                : (p.taskSummaries?.length ?? 0));
          const isExpanded = expandedCodes.includes(String(p.id!));
          const hasDelegatedSubTask = groupTasks.some(t => t.delegation);
          const isProjDelegationOn = !!(p.delegation || hasDelegatedSubTask);

          const planProgressPercent = groupTasks.length > 0 ? computePlanProgressPercent(groupTasks) : (p.computedPlanProgress ?? 0);
          const actProgressPercent = groupTasks.length > 0 ? computeActProgressPercent(groupTasks, delegationGroups) : (p.computedActProgress ?? 0);

          const isProjectMatch = lowerSearchTerm ? [p.store, p.location, p.year, p.code, p.name].some(val => String(val || "").toLowerCase().includes(lowerSearchTerm)) : true;
          const tasksToRender = isProjectMatch ? groupTasks : groupTasks.filter((t, idx) => {
            const taskFields = [
              t.taskCodePhu,
              `${p.code}-${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}`,
              t.name,
              t.duration,
              t.start,
              t.finish,
              t.party,
              formatDisplayDateMain(t.start),
              formatDisplayDateTime(t.start),
              formatDisplayDateMain(t.finish),
              formatDisplayDateTime(t.finish)
            ];
            const fieldMatch = taskFields.some(val => String(val || "").toLowerCase().includes(lowerSearchTerm));
            const notesMatch = t.notes?.some(n => String(n.content || '').toLowerCase().includes(lowerSearchTerm)) || false;
            return fieldMatch || notesMatch;
          });

          return (
            <div 
              key={p.id || `${p.code}-${p.year}-${p.no}`} 
              id={`detail-project-${p.no ?? p.code}`}
              data-project-item="true"
              data-project-code={p.code}
              data-project-year={p.year || ''}
              data-project-store={p.store || ''}
              className={cn("table-row-optimized rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm p-4 flex flex-col gap-3 relative transition-colors", pIdx % 2 === 0 ? "bg-white dark:bg-[#1e1e20]" : "bg-blue-50/30 dark:bg-[#1e1e20]")}
            >
              <div className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-md border ${statusColorClass}`}>
                {status}
              </div>
              <div className="font-bold text-slate-800 dark:text-[#e3e3e3] text-base leading-snug pr-20 flex items-start gap-2">
                <button 
                  onClick={() => toggleGroup(p.id!)} 
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 mt-0.5 shrink-0 rounded font-bold text-xs shadow-sm transition-all active:scale-95 touch-manipulation cursor-pointer",
                    effectiveTaskCount >= 2
                      ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white"
                      : effectiveTaskCount === 1
                      ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white"
                      : "bg-slate-200 hover:bg-slate-300 dark:bg-[#333336] dark:hover:bg-[#444446] text-slate-600 dark:text-slate-300"
                  )}
                  title={isExpanded ? "Collapse" : `Expand (${effectiveTaskCount})`}
                >
                  {!isExpanded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span className="text-[10px]">({effectiveTaskCount})</span>
                </button>
                <span><span className={p.store?.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8]' : p.store?.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400' : ''}>{p.store}</span> - {p.code} - {p.name}</span>
              </div>

              <div className="flex flex-col gap-1 px-1 mt-1 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[60px]">Plan Prg:</span>
                  <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${planProgressPercent}%` }}></div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-8 text-right">{planProgressPercent}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[60px]">Act Prg:</span>
                  <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${actProgressPercent}%` }}></div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-8 text-right">{actProgressPercent}%</span>
                </div>
              </div>

              <div className="flex justify-between items-center px-1 border-t border-slate-50 dark:border-slate-800 pt-2">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500 dark:text-[#a3a3a3] italic font-bold">
                    {effectiveTaskCount} Sub-
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditProject?.(p, false, "chat"); }}
                    className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] p-1 rounded hover:bg-slate-100 dark:hover:bg-[#28282a] transition-colors"
                    title="Open Project Modal"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {p.party && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 truncate max-w-[80px]">
                        {p.party}
                      </span>
                    )}
                    <FastToggle value={Boolean(isProjDelegationOn)} canWrite={canWrite} onToggle={(val) => handleUpdateProject(p, 'delegation', val)} isSmall={true} />
                    <QuickNavButton 
                      project={p} 
                      title={`Quick Navigator (${p.code})`} 
                      className="p-1! rounded!"
                    />
                    {canWrite && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAddTask(p); }}
                        className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded transition-colors"
                        title={`Add Task for ${p.code}`}
                      >
                        <Plus className="w-3 h-3" />
                        Task
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 text-[11px] font-bold leading-tight">
                  <div className="text-blue-700 dark:text-[#8ab4f8] text-right">
                    {(() => {
                      const d = parseDateTime(computedTakStart);
                      if (!d) return null;
                      return (
                        <>
                          <div>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</div>
                          <div>{d.getFullYear()}</div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="text-pink-700 dark:text-pink-400 text-right">
                    {(() => {
                      const d = parseDateTime(computedTakCompl);
                      if (!d) return null;
                      return (
                        <>
                          <div>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</div>
                          <div>{d.getFullYear()}</div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
              
              {isExpanded && (
                <div className="flex flex-col gap-2 mt-2">
                {tasksToRender.map((t) => {
                  const originalIndex = groupTasks.findIndex(gt => gt.id === t.id);
                  const i = originalIndex !== -1 ? originalIndex : 0;
                  const taskStatus = getTaskStatus(t.start, t.finish);
                  let taskStatusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
                  if (taskStatus === 'Completed') taskStatusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
                  else if (taskStatus === 'On process') taskStatusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';

                  const delegationGroup = delegationGroupByParentKey.get(t.id);
                  const actStatus = resolveActualStatus(taskStatus, delegationGroup?.subTasks || []);
                  let delStatusText = actStatus.label;
                  let delStatusColorClass = actStatus.color;

                  return (
                    <div id={`detail-task-${t.id}`} key={t.id} className={cn("bg-slate-50 dark:bg-[#1e1e20]/50 rounded-lg p-3 border border-slate-200 dark:border-[#444446] text-sm shadow-sm flex flex-col gap-2", initialFocusTaskId === t.id ? "ring-2 ring-inset ring-yellow-400 !bg-yellow-50 dark:!bg-yellow-900/20" : "")} onClick={() => canWrite && onEditTask(t, false, "chat")}>
                      <div className="flex gap-3">
                        {canWrite && (
                          <div className="shrink-0 flex flex-col items-center justify-center -mr-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMoveTask(p, groupTasks, i, 'up'); }}
                              disabled={i === 0}
                              className="p-1 text-slate-400 dark:text-[#838383] hover:text-blue-600 dark:text-[#8ab4f8] disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMoveTask(p, groupTasks, i, 'down'); }}
                              disabled={i === groupTasks.length - 1}
                              className="p-1 text-slate-400 dark:text-[#838383] hover:text-blue-600 dark:text-[#8ab4f8] disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <div className="flex flex-col w-20 shrink-0 text-xs text-slate-500 dark:text-[#a3a3a3] gap-1 border-r border-slate-200 dark:border-[#444446] pr-2">
                          <div className="font-mono text-blue-700 dark:text-[#8ab4f8] font-bold">{formatDisplayDateMain(t.start)}</div>
                          <div className="font-mono text-pink-700 font-bold">{formatDisplayDateMain(t.finish)}</div>
                          <div className="text-[10px] italic mt-1">{calculateDays(t.start, t.finish)}</div>
                        </div>
                        <div className="flex-grow flex flex-col gap-1">
                          <div className="font-bold text-slate-800 dark:text-[#e3e3e3]">
                            <span className="text-blue-600 dark:text-[#8ab4f8] mr-1">{computeTaskCode(projects, tasks, t) || t.taskCodePhu || `${p.code}-${i + 1}`}</span>
                            {t.name}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-slate-600 dark:text-[#a3a3a3] font-medium">{t.party || ''}</span>
                              {t.predecessor && (
                                <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.2 rounded border border-blue-200 dark:border-blue-800">
                                  Pred: {normalizeAndHealTaskPredecessors(t, tasks, projects).newPredecessor || t.predecessor}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <FastToggle value={Boolean(t.delegation)} canWrite={canWrite} onToggle={(val) => handleUpdateTask(t, { delegation: val })} />
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-end pt-2 border-t border-slate-200 dark:border-[#444446] mt-1">
                        <div className="flex gap-3 items-center">
                          <button onClick={(e) => { e.stopPropagation(); onEditTask(t, false, "chat"); }} className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#28282a] transition-colors" title="Open Task Modal">
                            <Maximize2 className="w-4 h-4" />
                          </button>
                          {canWrite && (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteTask(t); }} className="text-red-400 hover:text-red-600 dark:text-red-400 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${taskStatusColorClass}`}>
                            Pl: {taskStatus}
                          </div>
                          <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${delStatusColorClass}`}>
                            Act: {delStatusText}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
              
              {canWrite && isExpanded && (
                <button 
                  onClick={() => onAddTask(p)}
                  className="mt-2 w-full py-2 bg-slate-100 dark:bg-[#1e1e20] hover:bg-slate-200 dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] text-sm font-bold rounded-lg border border-slate-200 dark:border-[#444446] border-dashed flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Task
                </button>
              )}
            </div>
          );
        })}
        {visibleCount < filteredProjects.length && (
          <div className="py-6 flex justify-center w-full">
            <button 
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="px-6 py-2.5 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-full text-sm font-bold text-blue-600 dark:text-[#8ab4f8] shadow-sm hover:shadow hover:border-blue-300 dark:hover:border-blue-500 transition-all active:scale-95 cursor-pointer"
            >
              Load More Projects ({filteredProjects.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </>
  );
});
