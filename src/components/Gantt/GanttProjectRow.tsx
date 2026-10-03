import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../lib/utils';
import { Project, Task } from '../../types';
import { getStatus, computeActProgressPercent } from '../../lib/utils';
import { formatGanttDate } from './GanttUtils';
import { GanttBar } from './GanttBar';
import { GanttBaseline } from './GanttBaseline';

export interface GanttProjectRowProps {
  p: Project;
  pIdx: number;
  projectTasks?: Task[];
  isExpanded: boolean;
  expandedModularTasks?: string[];
  setExpandedModularTasks?: React.Dispatch<React.SetStateAction<string[]>>;
  isEditMode?: boolean;
  canWrite?: boolean;
  selectedProjectSet?: Set<string>;
  selectedProjectIds?: string[];
  setSelectedProjectIds?: (ids: string[]) => void;
  setSelectedTaskIds?: React.Dispatch<React.SetStateAction<string[]>>;
  toggleProject?: (id: string) => void;
  toggleProjectExpansion?: (id: string) => void;
  isResizingSide?: boolean;
  startResizingSide?: (e: React.MouseEvent) => void;
  sideWidth: number;
  showStart?: boolean;
  startColWidth?: number;
  showFinish?: boolean;
  finishColWidth?: number;
  showParty?: boolean;
  partyColWidth?: number;
  showDuration?: boolean;
  durationColWidth?: number;
  timeUnits?: any[];
  delegationGroups?: any[];
  getRowVisibilityClass?: (id: string) => string;
  startDate: Date;
  dayWidth: number;
  activeTooltip: string | null;
  setActiveTooltip: (id: string | null) => void;
  getBarColor?: (status: string, duration?: string | number) => string;
  isHideMode?: boolean;
  toggleHideRow?: (id: string, e: React.MouseEvent) => void;
  handleTogglePin?: (p: any) => void | Promise<void>;
  onNavigateToLayout?: (
    store: string,
    location: string,
    projectCode?: string,
    sourceTaskId?: string,
  ) => void;
}

export const GanttProjectRow: React.FC<GanttProjectRowProps> = React.memo(({
  p, pIdx, projectTasks = [], isExpanded, expandedModularTasks = [], setExpandedModularTasks, isEditMode = false, canWrite = false,
  selectedProjectSet = new Set(), selectedProjectIds = [], setSelectedProjectIds, setSelectedTaskIds,
  toggleProject, toggleProjectExpansion, isResizingSide = false, startResizingSide,
  sideWidth, showStart = false, startColWidth = 80, showFinish = false, finishColWidth = 80, showParty = false, partyColWidth = 70, showDuration = false, durationColWidth = 50,
  timeUnits = [], delegationGroups = [], getRowVisibilityClass = () => '', startDate, dayWidth, activeTooltip, setActiveTooltip, getBarColor = () => 'bg-blue-500',
  isHideMode = false, toggleHideRow, handleTogglePin, onNavigateToLayout
}) => {
  const setQuickNavTarget = useAppStore(state => state.setQuickNavTarget);
  const handleToggle = toggleProjectExpansion || toggleProject;
  const pStart = p.computedTakStart || p.start;
  const pEnd = p.computedTakCompl || p.handover;

  let projectDuration = "-";
  if (pStart && pEnd) {
    const sD = new Date(pStart);
    const eD = new Date(pEnd);
    if (!isNaN(sD.getTime()) && !isNaN(eD.getTime())) {
      const days = Math.round((eD.getTime() - sD.getTime()) / (1000 * 60 * 60 * 24));
      projectDuration = String(days);
    }
  }

  const pStatus = getStatus(pStart, pEnd, p.computedOpening || p.opening, p.code);
  const pActPrg = projectTasks.length > 0
    ? computeActProgressPercent(projectTasks, delegationGroups)
    : (p.computedActProgress ?? 0);
  const effectiveTaskCount = p.taskCount !== undefined ? p.taskCount : (projectTasks ? projectTasks.length : 0);
  const canToggle = effectiveTaskCount > 0 || Boolean(p.id);

  const rowId = `project-${p.no}`;

  // Find modular parent tasks belonging to this project
  const projectModularParentIds = React.useMemo(() => {
    const childParentIds = new Set<string>();
    (projectTasks || []).forEach((t) => {
      if (t.parentTaskId) {
        childParentIds.add(String(t.parentTaskId));
      }
    });
    return (projectTasks || [])
      .filter((t) => childParentIds.has(String(t.id)))
      .map((t) => String(t.id));
  }, [projectTasks]);

  const hasModularTasks = projectModularParentIds.length > 0;
  const isProjectModularExpanded =
    hasModularTasks &&
    projectModularParentIds.some((id) => expandedModularTasks.includes(id));

  const handleToggleProjectModular = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasModularTasks) return;
    if (isProjectModularExpanded) {
      setExpandedModularTasks((prev) =>
        prev.filter((id) => !projectModularParentIds.includes(id))
      );
    } else {
      setExpandedModularTasks((prev) =>
        Array.from(new Set([...prev, ...projectModularParentIds]))
      );
      if (!isExpanded) {
        if (handleToggle) handleToggle(p.id!);
      }
    }
  };

  return (
    <div
      id={`gantt-project-row-${p.no}`}
      className={cn(
        "flex h-12 min-h-[48px] border-b border-slate-200 dark:border-[#444446] transition-colors relative group project-row",
        "bg-white dark:bg-[#1e1e20] hover:bg-slate-50 dark:hover:bg-[#28282a]",
        getRowVisibilityClass(rowId)
      )}
    >
      <div
        className={cn(
          "print-sticky-x sticky left-0 z-30 border-r border-slate-200 dark:border-[#444446] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center shrink-0 overflow-hidden",
          "bg-white dark:bg-[#1e1e20] group-hover:bg-slate-50 dark:group-hover:bg-[#28282a]"
        )}
        style={{ width: sideWidth, minWidth: sideWidth, maxWidth: sideWidth }}
      >
        {/* Project Name Column */}
        <div className="flex-1 min-w-0 p-1.5 flex items-center overflow-hidden">
          <div className="flex items-center gap-1 w-full relative min-w-0">
            {isEditMode && (
              <label
                className="flex items-center justify-center p-1 shrink-0 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedProjectSet?.has(String(p.no)) || false}
                  onChange={(e) => {
                    if (e.target.checked) {
                      if (setSelectedProjectIds) setSelectedProjectIds([...selectedProjectIds, String(p.no)]);
                      if (setSelectedTaskIds) setSelectedTaskIds((prev: any) => [...new Set([...prev, ...projectTasks.map((t) => t.id)])]);
                    } else {
                      if (setSelectedProjectIds) setSelectedProjectIds(selectedProjectIds.filter((id) => id !== String(p.no)));
                      const pTasksIds = new Set(projectTasks.map((t) => t.id));
                      if (setSelectedTaskIds) setSelectedTaskIds((prev: any) => prev.filter((id: string) => !pTasksIds.has(id)));
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 bg-white cursor-pointer active:scale-95 transition-all touch-manipulation"
                />
              </label>
            )}
            <div className="flex flex-col items-center justify-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (canToggle && handleToggle) {
                    handleToggle(p.id!);
                  }
                }}
                disabled={!canToggle}
                className={cn(
                  "p-0.5 rounded shrink-0 active:scale-90 transition-all touch-manipulation",
                  !canToggle
                    ? "opacity-30 cursor-not-allowed text-slate-400 dark:text-slate-600"
                    : isExpanded
                    ? "text-slate-600 dark:text-[#c3c3c3] bg-slate-100 dark:bg-[#28282a] hover:bg-slate-200 dark:hover:bg-[#333336] cursor-pointer"
                    : "text-slate-500 dark:text-[#a3a3a3] hover:bg-slate-100 dark:hover:bg-[#28282a] cursor-pointer"
                )}
                title={
                  !canToggle
                    ? "Dự án chưa có công việc"
                    : isExpanded
                    ? "Thu gọn Dự án này"
                    : `Mở rộng Dự án này (${effectiveTaskCount} công việc)`
                }
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 pointer-events-none" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 pointer-events-none" />
                )}
              </button>
              <button
                type="button"
                onClick={handleToggleProjectModular}
                disabled={!hasModularTasks}
                className={cn(
                  "p-0.5 rounded shrink-0 active:scale-90 transition-all touch-manipulation",
                  !hasModularTasks
                    ? "opacity-25 cursor-not-allowed bg-slate-100 dark:bg-[#28282a] text-slate-400 dark:text-slate-600"
                    : isProjectModularExpanded
                    ? "bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-600 dark:hover:bg-purple-500 shadow-xs ring-1 ring-purple-400/50 cursor-pointer"
                    : "bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/60 dark:hover:bg-purple-900/90 dark:text-purple-200 border border-purple-300 dark:border-purple-600/70 cursor-pointer"
                )}
                title={
                  !hasModularTasks
                    ? "Dự án không có Task Modular"
                    : isProjectModularExpanded
                    ? "Thu gọn Task Modular của dự án này"
                    : "Mở rộng Task Modular của dự án này"
                }
              >
                {isProjectModularExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 pointer-events-none" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 pointer-events-none" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => {
                if (isEditMode) return;
                e.stopPropagation();
                setQuickNavTarget({ project: p });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (handleToggle) handleToggle(p.id!);
              }}
              className={cn(
                "flex items-center gap-1 flex-1 min-w-0 text-left hover:bg-slate-100 dark:hover:bg-[#333336] p-1 rounded transition-colors group/pname overflow-hidden",
                !isEditMode ? "cursor-pointer" : ""
              )}
              title={
                !isEditMode
                  ? `Quick Navigator - Dự án: ${p.name} (${p.code})`
                  : p.name
              }
            >
              <div className="flex flex-col min-w-0 flex-1 justify-center gap-0.5 overflow-hidden">
                <span 
                  className={cn(
                    "font-bold text-xs sm:text-sm truncate text-slate-900 dark:text-white leading-tight",
                    !isEditMode && "group-hover/pname:text-blue-500 dark:group-hover/pname:text-blue-400 transition-colors"
                  )} 
                  title={p.name}
                >
                  {p.name}
                </span>
                <span className="text-[10px] text-slate-400 truncate font-mono flex items-center gap-1 flex-wrap leading-none">
                  <span className="px-1 py-0.5 text-[9px] font-bold font-mono rounded bg-[#142340] text-[#60a5fa] border border-[#1d4ed8] shrink-0 leading-none">
                    {p.code}
                  </span>
                  <span className="px-1 py-0.5 text-[9px] font-bold rounded bg-[#142340] text-[#60a5fa] border border-[#1d4ed8] uppercase shrink-0 leading-none">
                    {p.store}
                  </span>
                  {p.location && (
                    <span className="text-slate-400 text-[10px] font-medium leading-none">
                      • {p.location}
                    </span>
                  )}
                  <span className="text-amber-400 text-[9px] font-bold leading-none">●</span>
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Extra Columns inside Side Container */}
        {showStart && (
          <div
            className="font-mono text-[10px] sm:text-xs text-blue-700 dark:text-[#8ab4f8] font-bold border-l border-slate-200 dark:border-[#444446] p-1 flex items-center justify-center shrink-0 h-full"
            style={{ width: startColWidth, minWidth: startColWidth, maxWidth: startColWidth }}
          >
            {formatGanttDate(pStart)}
          </div>
        )}

        {showFinish && (
          <div
            className="font-mono text-[10px] sm:text-xs text-pink-700 dark:text-pink-400 font-bold border-l border-slate-200 dark:border-[#444446] p-1 flex items-center justify-center shrink-0 h-full"
            style={{ width: finishColWidth, minWidth: finishColWidth, maxWidth: finishColWidth }}
          >
            {formatGanttDate(pEnd)}
          </div>
        )}

        {showParty && (
          <div
            className="text-xs text-slate-500 dark:text-[#838383] border-l border-slate-200 dark:border-[#444446] p-1 flex items-center justify-center shrink-0 h-full"
            style={{ width: partyColWidth, minWidth: partyColWidth, maxWidth: partyColWidth }}
          >
            {p.party || "-"}
          </div>
        )}

        {showDuration && (
          <div
            className="font-mono text-[10px] sm:text-xs text-slate-500 dark:text-[#838383] border-l border-slate-200 dark:border-[#444446] p-1 flex items-center justify-center font-bold shrink-0 h-full"
            style={{ width: durationColWidth, minWidth: durationColWidth, maxWidth: durationColWidth }}
          >
            {projectDuration}
          </div>
        )}

        {startResizingSide && (
          <div
            className={cn(
              "absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-40 transition-colors pointer-events-auto",
              isResizingSide ? "bg-blue-500" : "bg-transparent group-hover/header:bg-slate-200 dark:group-hover/header:bg-slate-600"
            )}
            onMouseDown={startResizingSide}
          />
        )}
      </div>

      {/* Right Timeline Area */}
      <div className="flex-1 relative h-full flex items-center">
        <GanttBar
          startStr={pStart}
          endStr={pEnd}
          status={pStatus}
          label={p.name}
          id={rowId}
          extraVars={{ actPrg: pActPrg, duration: projectDuration }}
          startDate={startDate}
          dayWidth={dayWidth}
          activeTooltip={activeTooltip}
          setActiveTooltip={setActiveTooltip}
          isEditMode={isEditMode}
          getBarColor={getBarColor}
        />
        <GanttBaseline
          startStr={p.baselineStart}
          endStr={p.baselineFinish}
          type="project"
          startDate={startDate}
          dayWidth={dayWidth}
        />
      </div>
    </div>
  );
}, (prev, next) => {
  const prevModularExpanded = prev.projectTasks?.some(t => prev.expandedModularTasks?.includes(String(t.id)));
  const nextModularExpanded = next.projectTasks?.some(t => next.expandedModularTasks?.includes(String(t.id)));
  if (prevModularExpanded !== nextModularExpanded) return false;

  const prevSelected = prev.selectedProjectSet ? prev.selectedProjectSet.has(String(prev.p.no)) : false;
  const nextSelected = next.selectedProjectSet ? next.selectedProjectSet.has(String(next.p.no)) : false;

  return prev.isExpanded === next.isExpanded &&
         prev.isEditMode === next.isEditMode &&
         prev.canWrite === next.canWrite &&
         prevSelected === nextSelected &&
         prev.sideWidth === next.sideWidth &&
         prev.startColWidth === next.startColWidth &&
         prev.finishColWidth === next.finishColWidth &&
         prev.partyColWidth === next.partyColWidth &&
         prev.durationColWidth === next.durationColWidth &&
         prev.showStart === next.showStart &&
         prev.showFinish === next.showFinish &&
         prev.showParty === next.showParty &&
         prev.showDuration === next.showDuration &&
         prev.timeUnits?.length === next.timeUnits?.length &&
         prev.p === next.p &&
         prev.projectTasks === next.projectTasks &&
         prev.startDate?.getTime() === next.startDate?.getTime() &&
         prev.dayWidth === next.dayWidth &&
         (prev.activeTooltip === `project-${prev.p.no}` || next.activeTooltip === `project-${next.p.no}` ? prev.activeTooltip === next.activeTooltip : true);
});
