import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { QuickNavButton } from '../QuickNavButton';
import { cn } from '../../lib/utils';
import { Project, Task } from '../../types';
import { getStatus, computeActProgressPercent } from '../../lib/utils';
import { formatGanttDate } from './GanttUtils';
import { GanttBar } from './GanttBar';
import { GanttBaseline } from './GanttBaseline';

export interface GanttProjectRowProps {
  p: Project;
  pIdx: number;
  projectTasks: Task[];
  isExpanded: boolean;
  expandedModularTasks: string[];
  setExpandedModularTasks: React.Dispatch<React.SetStateAction<string[]>>;
  isEditMode: boolean;
  canWrite: boolean;
  selectedProjectSet: Set<string>;
  selectedProjectIds: string[];
  setSelectedProjectIds: (ids: string[]) => void;
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  toggleProject: (id: string) => void;
  isResizingSide: boolean;
  startResizingSide: (e: React.MouseEvent) => void;
  sideWidth: number;
  showStart: boolean;
  startColWidth: number;
  showFinish: boolean;
  finishColWidth: number;
  showParty: boolean;
  partyColWidth: number;
  showDuration: boolean;
  durationColWidth: number;
  timeUnits: any[];
  delegationGroups: any[];
  getRowVisibilityClass: (id: string) => string;
  startDate: Date;
  dayWidth: number;
  activeTooltip: string | null;
  setActiveTooltip: (id: string | null) => void;
  getBarColor: (status: string, duration?: string | number) => string;
  onNavigateToLayout?: (
    store: string,
    location: string,
    projectCode?: string,
    sourceTaskId?: string,
  ) => void;
}

export const GanttProjectRow: React.FC<GanttProjectRowProps> = React.memo(({
  p, pIdx, projectTasks, isExpanded, expandedModularTasks, setExpandedModularTasks, isEditMode, canWrite,
  selectedProjectSet, selectedProjectIds, setSelectedProjectIds, setSelectedTaskIds,
  toggleProject, isResizingSide, startResizingSide,
  sideWidth, showStart, startColWidth, showFinish, finishColWidth, showParty, partyColWidth, showDuration, durationColWidth,
  timeUnits, delegationGroups, getRowVisibilityClass, startDate, dayWidth, activeTooltip, setActiveTooltip, getBarColor,
  onNavigateToLayout
}) => {
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
        toggleProject(p.id!);
      }
    }
  };

  return (
    <tr
      className={cn(
        "transition-colors group project-row",
        "bg-white dark:bg-[#1e1e20] hover:bg-slate-50 dark:hover:bg-[#28282a]",
        getRowVisibilityClass(rowId)
      )}
    >
      <td
        className={cn(
          "print-sticky-x sticky left-0 z-30 border-b border-r border-slate-200 dark:border-[#444446] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] p-2",
          "bg-white dark:bg-[#1e1e20] group-hover:bg-slate-50 dark:group-hover:bg-[#28282a]"
        )}
        style={{ position: "sticky", left: 0, zIndex: 30, width: sideWidth, minWidth: sideWidth, maxWidth: sideWidth }}
      >
        <div className="flex items-center gap-1 w-full relative">
          {isEditMode && (
            <label
              className="flex items-center justify-center p-1 shrink-0 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selectedProjectSet.has(String(p.no))}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedProjectIds([...selectedProjectIds, String(p.no)]);
                    setSelectedTaskIds((prev: any) => [...new Set([...prev, ...projectTasks.map((t) => t.id)])]);
                  } else {
                    setSelectedProjectIds(selectedProjectIds.filter((id) => id !== String(p.no)));
                    const pTasksIds = new Set(projectTasks.map((t) => t.id));
                    setSelectedTaskIds((prev: any) => prev.filter((id: string) => !pTasksIds.has(id)));
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
                if (canToggle) {
                  toggleProject(p.id!);
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
              if (onNavigateToLayout) {
                e.stopPropagation();
                onNavigateToLayout(p.store || 'all', p.location || 'all', p.code);
              } else {
                toggleProject(p.id!);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              toggleProject(p.id!);
            }}
            className={cn(
              "flex items-center gap-1.5 flex-1 min-w-0 text-left hover:bg-slate-100 dark:hover:bg-[#333336] p-1.5 rounded transition-colors group/pname",
              onNavigateToLayout && !isEditMode ? "cursor-pointer" : ""
            )}
            title={
              onNavigateToLayout && !isEditMode
                ? `Xem sơ đồ mặt bằng Layout (${p.store}${p.location ? ` • ${p.location}` : ''}) - Dự án: ${p.name} (${p.code})`
                : p.name
            }
          >
            <div className="flex flex-col min-w-0 flex-1">
              <span 
                className={cn(
                  "font-bold text-xs truncate text-slate-800 dark:text-[#e3e3e3]",
                  onNavigateToLayout && !isEditMode && "group-hover/pname:text-blue-600 dark:group-hover/pname:text-[#8ab4f8] group-hover/pname:underline transition-colors"
                )} 
                title={p.name}
              >
                {p.name}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-[#838383] truncate font-mono flex items-center gap-1 flex-wrap">
                <span>{p.code}</span>
                <span>•</span>
                <span className={cn(
                  p.store?.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8] font-semibold' :
                  p.store?.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400 font-semibold' : ''
                )}>{p.store}</span>
                {p.location && (
                  <>
                    <span>•</span>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">{p.location}</span>
                  </>
                )}
              </span>
            </div>
          </button>
          <QuickNavButton 
            project={p} 
            className="opacity-70 group-hover:opacity-100 transition-opacity shrink-0 ml-0.5" 
            title={`Quick Navigator (${p.code})`} 
          />
        </div>
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-40 transition-colors pointer-events-auto",
            isResizingSide ? "bg-blue-500" : "bg-transparent group-hover/header:bg-slate-200 dark:group-hover/header:bg-slate-600"
          )}
          onMouseDown={startResizingSide}
        />
      </td>
      {showStart && (
        <td
          className={cn(
            "print-sticky-x sticky z-30 font-mono text-[10px] sm:text-xs text-slate-500 dark:text-[#838383] border-b border-r border-slate-200 dark:border-[#444446] p-2 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
            "bg-white dark:bg-[#1e1e20] group-hover:bg-slate-50 dark:hover:bg-[#28282a]"
          )}
          style={{ position: "sticky", left: sideWidth, zIndex: 30, width: startColWidth, minWidth: startColWidth, maxWidth: startColWidth }}
        >
          {formatGanttDate(pStart)}
        </td>
      )}
      {showFinish && (
        <td
          className={cn(
            "print-sticky-x sticky z-30 font-mono text-[10px] sm:text-xs text-slate-500 dark:text-[#838383] border-b border-r border-slate-200 dark:border-[#444446] p-2 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
            "bg-white dark:bg-[#1e1e20] group-hover:bg-slate-50 dark:hover:bg-[#28282a]"
          )}
          style={{ position: "sticky", left: sideWidth + (showStart ? startColWidth : 0), zIndex: 30, width: finishColWidth, minWidth: finishColWidth, maxWidth: finishColWidth }}
        >
          {formatGanttDate(pEnd)}
        </td>
      )}
      {showParty && (
        <td
          className={cn(
            "print-sticky-x sticky z-30 text-xs text-slate-500 dark:text-[#838383] border-b border-r border-slate-200 dark:border-[#444446] p-2 text-center",
            "bg-white dark:bg-[#1e1e20] group-hover:bg-slate-50 dark:hover:bg-[#28282a]"
          )}
          style={{ position: "sticky", left: sideWidth + (showStart ? startColWidth : 0) + (showFinish ? finishColWidth : 0), zIndex: 30, width: partyColWidth, minWidth: partyColWidth, maxWidth: partyColWidth }}
        >
          {p.party || "-"}
        </td>
      )}
      {showDuration && (
        <td
          className={cn(
            "print-sticky-x sticky z-30 font-mono text-[10px] sm:text-xs text-slate-500 dark:text-[#838383] border-b border-r border-slate-200 dark:border-[#444446] p-2 text-center font-bold",
            "bg-white dark:bg-[#1e1e20] group-hover:bg-slate-50 dark:hover:bg-[#28282a]"
          )}
          style={{ position: "sticky", left: sideWidth + (showStart ? startColWidth : 0) + (showFinish ? finishColWidth : 0) + (showParty ? partyColWidth : 0), zIndex: 30, width: durationColWidth, minWidth: durationColWidth, maxWidth: durationColWidth }}
        >
          {projectDuration}
        </td>
      )}
      <td colSpan={timeUnits.length} className="border-b border-slate-200 dark:border-[#444446] relative p-0 h-10">
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
          onBarClick={!isEditMode && onNavigateToLayout ? () => onNavigateToLayout(p.store || 'all', p.location || 'all', p.code) : undefined}
        />
        <GanttBaseline
          startStr={p.baselineStart}
          endStr={p.baselineFinish}
          type="project"
          startDate={startDate}
          dayWidth={dayWidth}
        />
      </td>
    </tr>
  );
}, (prev, next) => {
  return prev.isExpanded === next.isExpanded &&
         prev.expandedModularTasks === next.expandedModularTasks &&
         prev.isEditMode === next.isEditMode &&
         prev.canWrite === next.canWrite &&
         prev.selectedProjectSet.has(String(prev.p.no)) === next.selectedProjectSet.has(String(next.p.no)) &&
         prev.sideWidth === next.sideWidth &&
         prev.startColWidth === next.startColWidth &&
         prev.finishColWidth === next.finishColWidth &&
         prev.partyColWidth === next.partyColWidth &&
         prev.durationColWidth === next.durationColWidth &&
         prev.showStart === next.showStart &&
         prev.showFinish === next.showFinish &&
         prev.showParty === next.showParty &&
         prev.showDuration === next.showDuration &&
         prev.timeUnits.length === next.timeUnits.length &&
         prev.p === next.p &&
         prev.projectTasks === next.projectTasks &&
         prev.startDate === next.startDate &&
         prev.dayWidth === next.dayWidth &&
         (prev.activeTooltip === `project-${prev.p.no}` || next.activeTooltip === `project-${next.p.no}` ? prev.activeTooltip === next.activeTooltip : true);
});
