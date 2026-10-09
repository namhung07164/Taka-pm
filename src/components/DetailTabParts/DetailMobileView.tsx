import React, { memo, useCallback, useEffect } from 'react';
import { ChevronRight, ChevronDown, Plus, ArrowDownUp, Maximize2 } from 'lucide-react';
import { Project, Task, DelegationGroup } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { QuickNavButton } from '../QuickNavButton';
import { DetailMobileTaskItem } from './DetailMobileTaskItem';
import { FastToggle } from './FastToggle';
import { 
  cn, 
  formatDisplayDateMain, 
  calculateDays, 
  computePlanProgressPercent, 
  computeActProgressPercent,
  matchesAdvancedSearch,
  parseDateTime,
  getStatus
} from '../../lib/utils';

function parseStackedDate(dateStr: string | undefined): { month: string; day: string; year: string } | null {
  if (!dateStr) return null;
  const d = parseDateTime(dateStr);
  if (!d || isNaN(d.getTime())) return null;
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }),
    day: `${d.getDate()},`,
    year: String(d.getFullYear())
  };
}

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
  taskCodeMap?: Map<string, string>;
  taskActualStatusMap?: Map<string, { label: string; color: string }>;
  onSortSubTasks?: (p: Project, groupTasks: Task[]) => void;
  onNavigateToDelegation?: (groupId: string, sourceTaskId?: string) => void;
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
  initialFocusTaskId,
  canWrite,
  lowerSearchTerm,
  delegationGroups,
  toggleGroup,
  onEditProject,
  onAddTask,
  onEditTask,
  handleUpdateProject,
  handleMoveTask,
  handleUpdateTask,
  handleDeleteTask,
  taskCodeMap,
  taskActualStatusMap,
  onSortSubTasks
}: DetailMobileViewProps) {
  const handleMobileScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const st = target.scrollTop;
    const sh = target.scrollHeight;
    const ch = target.clientHeight;

    if (sh - (st + ch) < 450) {
      if (visibleCount < filteredProjects.length) {
        setVisibleCount(prev => Math.min(prev + 25, filteredProjects.length));
      }
    }
  }, [visibleCount, filteredProjects.length, setVisibleCount]);

  useEffect(() => {
    if (!filteredProjects || filteredProjects.length === 0) return;
    const visibleSlice = filteredProjects.slice(0, visibleCount);
    const visibleIds = new Set<string>();
    for (const p of visibleSlice) {
      if (p.id) visibleIds.add(String(p.id));
      if (p.code) visibleIds.add(String(p.code));
    }
    const arr = Array.from(visibleIds).filter(Boolean);
    if (arr.length > 0) {
      useAppStore.getState().setVisibleActiveProjectIds(arr);
    }
  }, [filteredProjects, visibleCount]);

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

      <div 
        onScroll={handleMobileScroll}
        className="xl:hidden flex-grow overflow-y-auto flex flex-col gap-4 pb-16 px-2 bg-slate-50/60 dark:bg-[#131314] overscroll-y-contain transition-colors"
      >
        {filteredProjects.slice(0, visibleCount).map((p) => {
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

          const computedTakStart = pInfo.computedTakStart || p.computedTakStart || p.start;
          const computedTakCompl = pInfo.computedTakCompl || p.computedTakCompl || p.handover;
          const computedOpening = p.computedOpening || p.opening;
          const rawStatus = pInfo.status || getStatus(computedTakStart, computedTakCompl, computedOpening, p.code) || p.mdStatus || (p as any).status;
          const status = (!rawStatus || rawStatus === '—' || rawStatus === '-') ? getStatus(computedTakStart, computedTakCompl, computedOpening, p.code) || 'On process' : rawStatus;
          const statusUpper = String(status || 'ON PROCESS').toUpperCase();
          
          let statusBadgeClass = 'bg-amber-500 text-white dark:bg-amber-500 dark:text-white shadow-2xs font-extrabold border-amber-400';
          let borderAccentClass = 'border-l-[5px] border-l-amber-500';
          let bgCardTint = 'bg-amber-50/30 dark:bg-amber-950/20';

          if (status === 'Completed' || statusUpper === 'COMPLETED') {
            statusBadgeClass = 'bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white shadow-2xs font-extrabold border-emerald-500';
            borderAccentClass = 'border-l-[5px] border-l-emerald-500';
            bgCardTint = 'bg-emerald-50/25 dark:bg-emerald-950/15';
          } else if (status === 'Handover' || statusUpper === 'HANDOVER') {
            statusBadgeClass = 'bg-blue-600 text-white dark:bg-blue-600 dark:text-white shadow-2xs font-extrabold border-blue-500';
            borderAccentClass = 'border-l-[5px] border-l-blue-500';
            bgCardTint = 'bg-blue-50/25 dark:bg-blue-950/15';
          } else if (status === 'On process' || statusUpper === 'ON PROCESS') {
            statusBadgeClass = 'bg-amber-500 text-white dark:bg-amber-500 dark:text-white shadow-2xs font-extrabold border-amber-400';
            borderAccentClass = 'border-l-[5px] border-l-amber-500';
            bgCardTint = 'bg-amber-50/30 dark:bg-amber-950/20';
          } else if (status === 'Canceled' || statusUpper === 'CANCELED') {
            statusBadgeClass = 'bg-rose-600 text-white dark:bg-rose-600 dark:text-white shadow-2xs font-extrabold border-rose-500';
            borderAccentClass = 'border-l-[5px] border-l-rose-500';
            bgCardTint = 'bg-rose-50/25 dark:bg-rose-950/15';
          } else {
            statusBadgeClass = 'bg-indigo-600 text-white dark:bg-indigo-600 dark:text-white shadow-2xs font-extrabold border-indigo-500';
            borderAccentClass = 'border-l-[5px] border-l-indigo-500';
            bgCardTint = 'bg-indigo-50/25 dark:bg-indigo-950/15';
          }

          const storeUpper = (p.store || '').toUpperCase();
          let storeBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
          if (storeUpper === 'HCM') {
            storeBadgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200/80 dark:border-blue-800 font-bold';
          } else if (storeUpper === 'HN') {
            storeBadgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200/80 dark:border-rose-800 font-bold';
          }

          const effectiveTaskCount = groupTasks.length > 0 
            ? groupTasks.length 
            : (p.taskCount !== undefined 
                ? p.taskCount 
                : (p.taskSummaries?.length ?? 0));
          const isExpanded =
            expandedCodes.includes(String(p.id || '')) ||
            (p.code ? expandedCodes.includes(p.code) : false) ||
            (p.no !== undefined && p.no !== null ? expandedCodes.includes(String(p.no)) : false);

          const planProgressPercent = groupTasks.length > 0 ? computePlanProgressPercent(groupTasks) : (p.computedPlanProgress ?? 0);
          const actProgressPercent = groupTasks.length > 0 ? computeActProgressPercent(groupTasks, delegationGroups) : (p.computedActProgress ?? 0);

          const isProjectMatch = lowerSearchTerm
            ? matchesAdvancedSearch(lowerSearchTerm, [p.store, p.location, p.year, p.code, p.linkCodes, p.name, p.detail, (p as any).description, p.note, p.party])
            : true;
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
              formatDisplayDateMain(t.finish)
            ];
            const notesFields = t.notes?.map(n => String(n.content || '')) || [];
            return matchesAdvancedSearch(lowerSearchTerm, [...taskFields, ...notesFields]);
          });

          return (
            <div 
              key={p.id || `${p.code}-${p.year}-${p.no}`} 
              id={`detail-project-${p.no ?? p.code}`}
              data-project-item="true"
              data-project-id={String(p.id || p.no || p.code)}
              data-project-code={p.code}
              data-project-year={p.year || ''}
              data-project-store={p.store || ''}
              className={cn(
                "mobile-card-optimized rounded-xl border border-slate-200/90 dark:border-[#38383b] shadow-xs hover:shadow-md p-3 flex flex-col gap-2.5 relative transition-all",
                bgCardTint,
                borderAccentClass
              )}
            >
              {/* Top controls: Badges & Link Codes on left, Program Status on right */}
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                  {p.year && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {p.year}
                    </span>
                  )}
                  {p.store && (
                    <span className={`px-1.5 py-0.5 text-[10px] rounded border font-bold ${storeBadgeClass}`}>
                      {p.store}
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 text-[10px] font-bold font-mono rounded bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800">
                    {p.code}
                  </span>
                  {p.linkCodes && p.linkCodes !== p.code && (
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 font-normal">
                      ({p.linkCodes})
                    </span>
                  )}
                  {p.location && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      • {p.location}
                    </span>
                  )}
                </div>

                <div className="shrink-0">
                  <div className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border font-extrabold whitespace-nowrap shadow-2xs ${statusBadgeClass}`}>
                    {statusUpper === 'ON PROCESS' ? 'ON PROCESS' : (statusUpper === 'UPCOMING' ? 'UPCOMING' : (statusUpper === 'COMPLETED' ? 'COMPLETED' : statusUpper))}
                  </div>
                </div>
              </div>

              {/* Project Title with Expand button on left & Quick Navigation on right (elevated on same line) */}
              <div className="flex items-start justify-between gap-2 w-full">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <button 
                    onClick={() => toggleGroup(p.id!)} 
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 mt-0.5 shrink-0 rounded text-white font-extrabold text-[10px] shadow-2xs transition-all active:scale-95 touch-manipulation cursor-pointer",
                      effectiveTaskCount > 0 
                        ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500" 
                        : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                    )}
                    title={isExpanded ? "Collapse" : `Expand (${effectiveTaskCount})`}
                  >
                    {!isExpanded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>({effectiveTaskCount})</span>
                  </button>

                  <div 
                    onClick={() => onEditProject?.(p, !canWrite, "chat")}
                    className="font-bold text-slate-900 dark:text-[#ffffff] text-sm sm:text-base leading-snug cursor-pointer hover:text-blue-600 dark:hover:text-[#8ab4f8] transition-colors break-words flex-1 min-w-0"
                  >
                    {p.name}
                  </div>
                </div>

                {/* Quick Navigation button placed on top right beneath status badge */}
                <div className="shrink-0 pt-0.5">
                  <QuickNavButton 
                    project={p}
                    className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-[#8ab4f8] border border-blue-200 dark:border-blue-800 transition-colors shadow-2xs" 
                  />
                </div>
              </div>

              {/* Project Dates & Metrics */}
              {(() => {
                const startParts = parseStackedDate(computedTakStart || p.start);
                const complParts = parseStackedDate(computedTakCompl || p.handover || p.opening);
                const displayParty = p.party || Array.from(new Set(groupTasks.map(t => t.party?.trim()).filter(Boolean))).join(', ');

                return (
                  <>
                    {/* Progress Bars (Plan Progress & Actual Progress) */}
                    <div className="flex flex-col gap-2 pt-1 border-t border-slate-200/80 dark:border-[#38383b]">
                      {/* PLAN PRG */}
                      <div className="flex items-center gap-2 w-full">
                        <span className="font-bold text-xs tracking-wider text-slate-400 dark:text-slate-300 w-20 shrink-0">
                          PLAN PRG:
                        </span>
                        <div className="flex-1 h-2.5 sm:h-3 bg-slate-700/60 dark:bg-[#333336] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, planProgressPercent))}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-xs sm:text-sm text-slate-300 dark:text-slate-200 shrink-0 w-10 text-right">
                          {planProgressPercent}%
                        </span>
                      </div>

                      {/* ACT PRG */}
                      <div className="flex items-center gap-2 w-full">
                        <span className="font-bold text-xs tracking-wider text-slate-400 dark:text-slate-300 w-20 shrink-0">
                          ACT PRG:
                        </span>
                        <div className="flex-1 h-2.5 sm:h-3 bg-slate-700/60 dark:bg-[#333336] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, actProgressPercent))}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-xs sm:text-sm text-slate-300 dark:text-slate-200 shrink-0 w-10 text-right">
                          {actProgressPercent}%
                        </span>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-slate-200/80 dark:border-[#38383b] my-0.5" />

                    {/* Controls Bar: Sort, Party, Toggle, Maximize, and Stacked Dates */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                        {/* Sort Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSortSubTasks?.(p, groupTasks);
                          }}
                          className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#28282a] hover:bg-slate-100 dark:hover:bg-[#333336] text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 shadow-2xs active:scale-95 touch-manipulation cursor-pointer"
                          title="Sort sub-tasks by Start Date"
                        >
                          <ArrowDownUp className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          <span>Sort</span>
                        </button>

                        {/* Party / Contractor Tag */}
                        {displayParty ? (
                          <span 
                            className="px-2 py-0.5 rounded-md border border-purple-500/80 dark:border-purple-500 bg-purple-100/60 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 text-xs font-semibold whitespace-nowrap shadow-2xs"
                            title={`Party: ${displayParty}`}
                          >
                            {displayParty}
                          </span>
                        ) : null}

                        {/* Delegation Toggle Switch */}
                        <div className="flex items-center">
                          <FastToggle
                            value={Boolean(p.delegation)}
                            canWrite={canWrite}
                            onToggle={(val) => handleUpdateProject(p, 'delegation', val)}
                            isSmall={true}
                          />
                        </div>

                        {/* Maximize Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditProject?.(p, !canWrite, "chat");
                          }}
                          className="p-1 text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors active:scale-95 touch-manipulation cursor-pointer"
                          title="Open Project Details"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Right side: Stacked Dates */}
                      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                        {startParts && (
                          <div 
                            className="flex flex-col items-center text-center font-bold text-xs sm:text-sm leading-tight text-blue-600 dark:text-sky-400 select-none"
                            title={`Start: ${formatDisplayDateMain(computedTakStart || p.start)}`}
                          >
                            <span>{startParts.month}</span>
                            <span>{startParts.day}</span>
                            <span>{startParts.year}</span>
                          </div>
                        )}
                        {complParts && (
                          <div 
                            className="flex flex-col items-center text-center font-bold text-xs sm:text-sm leading-tight text-pink-600 dark:text-pink-400 select-none"
                            title={`Finish: ${formatDisplayDateMain(computedTakCompl || p.handover || p.opening)}`}
                          >
                            <span>{complParts.month}</span>
                            <span>{complParts.day}</span>
                            <span>{complParts.year}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Sub-tasks section */}
              {isExpanded && (
                <div className="flex flex-col gap-2 mt-2" style={{ contain: 'layout' }}>
                  {tasksToRender.map((t, idx) => {
                    const taskCode = taskCodeMap?.get(t.id) || t.taskCodePhu || (p.code ? `${p.code}#${idx + 1}` : '');
                    const actStatus = taskActualStatusMap?.get(t.id) || { label: 'Pending', color: 'bg-slate-50 text-slate-600' };

                    return (
                      <DetailMobileTaskItem
                        key={t.id}
                        task={t}
                        project={p}
                        groupTasks={groupTasks}
                        index={idx}
                        taskCode={taskCode}
                        actStatus={actStatus}
                        isFocused={initialFocusTaskId === t.id}
                        canWrite={canWrite}
                        onEditTask={onEditTask}
                        handleMoveTask={handleMoveTask}
                        handleUpdateTask={handleUpdateTask}
                        handleDeleteTask={handleDeleteTask}
                      />
                    );
                  })}
                </div>
              )}
              
              {canWrite && isExpanded && (
                <button 
                  onClick={() => onAddTask(p)}
                  className="mt-2 w-full py-2 bg-slate-100 dark:bg-[#1e1e20] hover:bg-slate-200 dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] text-sm font-bold rounded-lg border border-slate-200 dark:border-[#444446] border-dashed flex items-center justify-center gap-2 transition-colors cursor-pointer touch-manipulation active:scale-95"
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
              onClick={() => setVisibleCount(prev => Math.min(prev + 25, filteredProjects.length))}
              className="px-6 py-2.5 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-full text-sm font-bold text-blue-600 dark:text-[#8ab4f8] shadow-sm hover:shadow hover:border-blue-300 dark:hover:border-blue-500 transition-all active:scale-95 cursor-pointer touch-manipulation"
            >
              Load More Projects ({filteredProjects.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </>
  );
});
