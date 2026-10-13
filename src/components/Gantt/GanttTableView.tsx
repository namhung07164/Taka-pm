import React, { Dispatch, SetStateAction, useMemo } from 'react';
import { ChevronDown, ChevronRight, EyeOff } from 'lucide-react';
import { Project, Task, AppUser } from '../../types';
import { TimeUnit, GanttTableRow as GanttRowType, DependencyLine } from './ganttTypes';
import { GanttColumnWidths } from './useGanttColumnResize';
import { GanttProjectRow } from './GanttProjectRow';
import { GanttTaskRow } from './GanttTaskRow';
import { GanttTimelineHeader } from './GanttTimelineHeader';
import { GanttGridOverlay } from './GanttGridOverlay';
import { GanttTodayLine } from './GanttTodayLine';
import { GanttDependencyLinks } from './GanttDependencyLinks';
import { GanttSumBadge } from './GanttSumBadge';
import { GanttExportOverlay } from './GanttExportOverlay';
import { GanttEmptyState } from './GanttEmptyState';
import { GanttLeftHeader } from './GanttLeftHeader';
import { computeAllTaskCodes } from '../../lib/ganttUtils';
import { useGanttZoomAndPan } from './useGanttZoomAndPan';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { useAppStore } from '../../store/useAppStore';
import { safeSetItemSession } from '../../lib/storage';

interface GanttTableViewProps {
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  mainScrollRef: React.RefObject<HTMLDivElement | null>;
  topScrollRef: React.RefObject<HTMLDivElement | null>;
  handleCombinedMainScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleTopScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  flatGanttRows?: GanttRowType[];
  visibleGanttRows: GanttRowType[];
  paddingTop: number;
  paddingBottom: number;
  totalDays: number;
  dayWidth: number;
  sideWidth: number;
  setSideWidth: React.Dispatch<React.SetStateAction<number>>;
  startResizingSide: (e: React.MouseEvent) => void;
  colWidths?: GanttColumnWidths;
  startResizingColumn?: (colKey: keyof GanttColumnWidths, e: React.MouseEvent) => void;
  timeUnits: TimeUnit[];
  startDate: Date;
  customToday: Date;
  setCustomToday: (d: Date) => void;
  isDraggingToday: boolean;
  setIsDraggingToday: (v: boolean) => void;
  getDateFromOffsetPx: (offsetPx: number) => Date;
  activeTooltip: string | null;
  setActiveTooltip: (id: string | null) => void;
  getBarColor: (status: string, duration?: string | number) => string;
  visibleColumns: string[];
  handleToggleColumn?: (colId: string) => void;
  projects: Project[];
  tasks: Task[];
  delegationGroups: any[];
  currentUser: AppUser | null;
  canWrite: boolean;
  isEditMode: boolean;
  isHideMode: boolean;
  toggleHideRow: (id: string, e: React.MouseEvent) => void;
  getRowVisibilityClass: (id: string) => string;
  selectedTaskSet: Set<string>;
  selectedTaskIds: string[];
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedProjectSet: Set<string>;
  selectedProjectIds?: string[]; setSelectedProjectIds?: (ids: string[]) => void;
  handleTaskCheckboxChange: (e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent, id: string, isShift?: boolean, orderedTaskIds?: string[]) => void;
  handleToggleSelectAll: () => void;
  isAllSelected: boolean;
  toggleProjectExpansion: (id: string) => void;
  toggleModularParent: (taskId: string | number) => void;
  handleGroupModularTasks: (parentTaskId: string, childTaskIds: string[]) => void;
  handleUnlinkModularTasks: (childTaskIds: string[]) => void;
  handleTogglePin: (p: Project) => Promise<void>;
  initialFocusTaskId?: string | null;
  ganttTabFocusTaskId?: string | null;
  draggingTaskIds: string[];
  handleTaskDragStart: (e: React.DragEvent, id: string) => void;
  handleTaskDragOver: (e: React.DragEvent, id: string) => void;
  handleContainerDragOver: (e: React.DragEvent) => void;
  handleTaskDragLeave: (e: React.DragEvent, id: string) => void;
  handleTaskDrop: (e: React.DragEvent, targetTask: Task, parentProject?: Project) => Promise<void> | void;
  handleTaskDragEnd: () => void;
  dragOverTaskId: string | null;
  dropPosition: 'before' | 'after' | null;
  dependencyLines: DependencyLine[];
  computedSum: number | null;
  isExporting: boolean;
  onNavigateToTaskDetail?: (taskId: string) => void;
  onNavigateToLayout?: (store: string, location: string, projectCode?: string, sourceTaskId?: string) => void;
  paginatedProjects?: Project[];
  expandedModularTasks?: string[];
  setExpandedModularTasks?: React.Dispatch<React.SetStateAction<string[]>>;
  getGroupTasksForProject?: (p: Project) => Task[];
}

export function GanttTableView({
  tableContainerRef,
  mainScrollRef,
  topScrollRef,
  handleCombinedMainScroll,
  handleTopScroll,
  flatGanttRows = [],
  visibleGanttRows,
  paddingTop,
  paddingBottom,
  totalDays,
  dayWidth,
  sideWidth,
  startResizingSide,
  colWidths,
  startResizingColumn,
  timeUnits,
  startDate,
  customToday,
  setCustomToday,
  isDraggingToday,
  setIsDraggingToday,
  getDateFromOffsetPx,
  activeTooltip,
  setActiveTooltip,
  getBarColor,
  visibleColumns,
  handleToggleColumn,
  projects,
  tasks,
  delegationGroups,
  currentUser,
  canWrite,
  isEditMode,
  isHideMode,
  toggleHideRow,
  getRowVisibilityClass,
  selectedTaskSet,
  selectedTaskIds,
  setSelectedTaskIds,
  selectedProjectSet,
  selectedProjectIds = [],
  setSelectedProjectIds,
  handleTaskCheckboxChange,
  handleToggleSelectAll,
  isAllSelected,
  toggleProjectExpansion,
  toggleModularParent,
  handleGroupModularTasks,
  handleUnlinkModularTasks,
  handleTogglePin,
  initialFocusTaskId,
  ganttTabFocusTaskId,
  draggingTaskIds,
  handleTaskDragStart,
  handleTaskDragOver,
  handleContainerDragOver,
  handleTaskDragLeave,
  handleTaskDrop,
  handleTaskDragEnd,
  dragOverTaskId,
  dropPosition,
  dependencyLines,
  computedSum,
  isExporting,
  onNavigateToTaskDetail,
  onNavigateToLayout,
  paginatedProjects,
  expandedModularTasks = [],
  setExpandedModularTasks,
  getGroupTasksForProject
}: GanttTableViewProps) {
  const { t } = useLanguage();
  const expandedProjects = useAppStore((state) => state.expandedProjectIds);
  const setExpandedProjectIds = useAppStore((state) => state.setExpandedProjectIds);

  const currentProjects = (paginatedProjects && paginatedProjects.length > 0) ? paginatedProjects : projects;
  const isAllExpanded = currentProjects.length > 0 && currentProjects.every((p) => expandedProjects.includes(p.id!));

  const handleToggleExpandAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAllExpanded) {
      setExpandedProjectIds([]);
    } else {
      setExpandedProjectIds(currentProjects.map((p) => p.id!).filter(Boolean) as string[]);
    }
  };

  // Find all modular parent task IDs for currently displayed/searched projects
  const currentModularParentIds = useMemo(() => {
    const parentIdSet = new Set<string>();

    currentProjects.forEach((p) => {
      const pTasks = getGroupTasksForProject ? getGroupTasksForProject(p) : [];
      if (!pTasks || pTasks.length === 0) return;

      const projectTaskById = new Map<string, Task>();
      const projectTaskByCode = new Map<string, Task>();
      pTasks.forEach((t) => {
        if (t.id) projectTaskById.set(String(t.id), t);
        if (t.taskCodePhu) {
          projectTaskByCode.set(String(t.taskCodePhu).trim().toLowerCase(), t);
        }
      });

      pTasks.forEach((t) => {
        const rawParentId = t.parentTaskId || (t as any).parentId;
        if (rawParentId) {
          const parentKey = String(rawParentId).trim().toLowerCase();
          const matchedParent = projectTaskById.get(String(rawParentId)) || projectTaskByCode.get(parentKey);
          const effectiveParentId = matchedParent ? String(matchedParent.id) : String(rawParentId);
          parentIdSet.add(effectiveParentId);
        }
      });
    });

    return Array.from(parentIdSet);
  }, [currentProjects, getGroupTasksForProject]);

  const hasModularTasks = currentModularParentIds.length > 0;
  const isAnyModularExpanded =
    hasModularTasks &&
    currentModularParentIds.some((id) => expandedModularTasks.includes(id));

  const handleToggleExpandAllModular = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasModularTasks || !setExpandedModularTasks) return;

    if (isAnyModularExpanded) {
      const toRemove = new Set(currentModularParentIds);
      setExpandedModularTasks((prev) => {
        const next = prev.filter((id) => !toRemove.has(id));
        safeSetItemSession("taka_gantt_modular_expanded", JSON.stringify(next));
        return next;
      });
    } else {
      setExpandedModularTasks((prev) => {
        const next = Array.from(new Set([...prev, ...currentModularParentIds]));
        safeSetItemSession("taka_gantt_modular_expanded", JSON.stringify(next));
        return next;
      });
    }
  };

  const showStart = visibleColumns.includes('start');
  const showFinish = visibleColumns.includes('finish');
  const showParty = visibleColumns.includes('party');
  const showDuration = visibleColumns.includes('duration');
  const showPredecessor = visibleColumns.includes('predecessor');

  const startColWidth = colWidths?.start ?? 85; const finishColWidth = colWidths?.finish ?? 85; const partyColWidth = colWidths?.party ?? 80; const durationColWidth = colWidths?.duration ?? 60; const predecessorColWidth = colWidths?.predecessor ?? 90;

  const taskCodeMap = useMemo(() => {
    return computeAllTaskCodes(projects, tasks);
  }, [projects, tasks]);

  const delegationGroupByTaskId = useMemo(() => {
    const map = new Map<string, any>();
    (delegationGroups || []).forEach(g => {
      if (g.taskId) map.set(g.taskId, g);
      if (g.parentTaskId) map.set(g.parentTaskId, g);
      if (g.subTasks) {
        g.subTasks.forEach((st: any) => {
          if (st.taskId) map.set(st.taskId, g);
        });
      }
    });
    return map;
  }, [delegationGroups]);

  const totalTimelineWidth = totalDays * dayWidth;

  const { isPanning, handlePointerDown } = useGanttZoomAndPan({
    mainScrollRef,
    topScrollRef,
    sideWidth
  });

  const allOrderedTaskIds = useMemo(() => {
    const fromRows = (flatGanttRows && flatGanttRows.length > 0 ? flatGanttRows : visibleGanttRows)
      .filter(r => r.type === 'task')
      .map(r => r.task.id);
    if (fromRows.length > 0) return fromRows;
    const fallbackIds: string[] = [];
    currentProjects.forEach(p => {
      const pTasks = getGroupTasksForProject ? getGroupTasksForProject(p) : [];
      pTasks.forEach(t => {
        if (t && t.id && !t.isDeleted && !fallbackIds.includes(t.id)) fallbackIds.push(t.id);
      });
    });
    return fallbackIds;
  }, [flatGanttRows, visibleGanttRows, currentProjects, getGroupTasksForProject]);

  return (
    <div
      ref={tableContainerRef}
      onDragOver={handleContainerDragOver}
      className="flex-grow overflow-hidden flex flex-col bg-white dark:bg-[#1e1e20] relative min-h-0 select-none"
    >
      {/* Top Synchronized Timeline Header */}
      <div
        ref={topScrollRef}
        onScroll={handleTopScroll}
        className="overflow-x-hidden overflow-y-hidden border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#18181a] flex shrink-0"
      >
        {/* Left Side Header */}
        <GanttLeftHeader
          sideWidth={sideWidth}
          isEditMode={isEditMode}
          isAllSelected={isAllSelected}
          handleToggleSelectAll={handleToggleSelectAll}
          isAllExpanded={isAllExpanded}
          handleToggleExpandAll={handleToggleExpandAll}
          isAllModularExpanded={isAnyModularExpanded}
          handleToggleExpandAllModular={handleToggleExpandAllModular}
          hasModularTasks={hasModularTasks}
          visibleColumns={visibleColumns}
          colWidths={colWidths}
          handleToggleColumn={handleToggleColumn}
          startResizingColumn={startResizingColumn}
        />

        {/* Right Side Timeline Units Header */}
        <div className="flex-1 overflow-visible" style={{ width: `${totalTimelineWidth}px` }}>
          <GanttTimelineHeader timeUnits={timeUnits} dayWidth={dayWidth} />
        </div>
      </div>

      {/* Main Scrollable Table & Timeline Canvas */}
      <div
        ref={mainScrollRef}
        onScroll={handleCombinedMainScroll}
        onPointerDown={handlePointerDown}
        className={cn(
          "flex-grow overflow-auto relative flex min-h-0",
          isPanning ? "cursor-grabbing select-none" : "cursor-grab"
        )}
      >
        {/* Left Side Resizable Divider Bar */}
        <div
          onMouseDown={startResizingSide}
          className="absolute top-0 bottom-0 z-40 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors"
          style={{ left: `${sideWidth - 1}px` }}
        />

        {/* Rows Virtual Container */}
        <div
          className="flex flex-col relative w-full"
          style={{
            minWidth: `${sideWidth + totalTimelineWidth}px`,
            paddingTop: `${paddingTop}px`,
            paddingBottom: `${paddingBottom}px`
          }}
        >
          {/* Background Grid Lines */}
          <GanttGridOverlay
            totalDays={totalDays}
            dayWidth={dayWidth}
            sideWidth={sideWidth}
            timeUnits={timeUnits}
          />

          {/* Today Indicator Line */}
          <GanttTodayLine
            customToday={customToday}
            setCustomToday={setCustomToday}
            isDraggingToday={isDraggingToday}
            setIsDraggingToday={setIsDraggingToday}
            startDate={startDate}
            dayWidth={dayWidth}
            sideWidth={sideWidth}
            showStart={showStart} startColWidth={startColWidth} showFinish={showFinish} finishColWidth={finishColWidth}
            showParty={showParty} partyColWidth={partyColWidth} showDuration={showDuration} durationColWidth={durationColWidth}
            showPredecessor={showPredecessor} predecessorColWidth={predecessorColWidth}
            getDateFromOffsetPx={getDateFromOffsetPx}
          />

          {/* SVG Dependency Lines */}
          {dependencyLines.length > 0 && (
            <GanttDependencyLinks dependencyLines={dependencyLines} />
          )}

          {/* Virtualized Rows List */}
          {visibleGanttRows.length === 0 ? (
            <GanttEmptyState />
          ) : (
            visibleGanttRows.map((row) => {
              if (row.type === 'project') {
                return (
                  <GanttProjectRow
                    key={row.key}
                    p={row.project}
                    pIdx={row.projectIndex} projectTasks={getGroupTasksForProject ? getGroupTasksForProject(row.project) : []}
                    isExpanded={row.isExpanded}
                    expandedModularTasks={expandedModularTasks}
                    setExpandedModularTasks={setExpandedModularTasks}
                    toggleProjectExpansion={toggleProjectExpansion}
                    sideWidth={sideWidth}
                    showStart={showStart} startColWidth={startColWidth} showFinish={showFinish} finishColWidth={finishColWidth}
                    showParty={showParty} partyColWidth={partyColWidth} showDuration={showDuration} durationColWidth={durationColWidth}
                    showPredecessor={showPredecessor} predecessorColWidth={predecessorColWidth}
                    startDate={startDate}
                    dayWidth={dayWidth}
                    activeTooltip={activeTooltip}
                    setActiveTooltip={setActiveTooltip}
                    isEditMode={isEditMode}
                    canWrite={canWrite}
                    selectedProjectSet={selectedProjectSet}
                    selectedProjectIds={selectedProjectIds}
                    selectedTaskSet={selectedTaskSet}
                    selectedTaskIds={selectedTaskIds}
                    setSelectedProjectIds={setSelectedProjectIds}
                    setSelectedTaskIds={setSelectedTaskIds}
                    getBarColor={getBarColor}
                    handleTogglePin={handleTogglePin}
                    getRowVisibilityClass={getRowVisibilityClass}
                    isHideMode={isHideMode}
                    toggleHideRow={toggleHideRow}
                  />
                );
              }

              return (
                <GanttTaskRow
                  key={row.key}
                  t={row.task}
                  taskIndex={row.taskIndex}
                  p={row.project}
                  isChild={row.isChild}
                  parentTask={row.parentTask}
                  hasChildren={row.hasChildren}
                  childCount={row.childCount}
                  childTasks={row.type === 'task' ? row.childTasks : undefined}
                  isModularExpanded={row.isModularExpanded}
                  projects={projects}
                  tasks={tasks}
                  delegationGroups={delegationGroups}
                  isHighlightDelegationOn={false}
                  currentUser={currentUser}
                  selectedTaskSet={selectedTaskSet}
                  selectedTaskIds={selectedTaskIds}
                  setSelectedTaskIds={setSelectedTaskIds}
                  isEditMode={isEditMode}
                  canWrite={canWrite}
                  handleGroupModularTasks={handleGroupModularTasks}
                  handleUnlinkModularTasks={handleUnlinkModularTasks}
                  toggleModularParent={toggleModularParent}
                  getRowVisibilityClass={getRowVisibilityClass}
                  sideWidth={sideWidth}
                  showStart={showStart} startColWidth={startColWidth} showFinish={showFinish} finishColWidth={finishColWidth}
                  showParty={showParty} partyColWidth={partyColWidth} showDuration={showDuration} durationColWidth={durationColWidth}
                  showPredecessor={showPredecessor} predecessorColWidth={predecessorColWidth}
                  taskCodeMap={taskCodeMap}
                  delegationGroupByTaskId={delegationGroupByTaskId}
                  timeUnits={timeUnits}
                  startDate={startDate}
                  dayWidth={dayWidth}
                  activeTooltip={activeTooltip}
                  setActiveTooltip={setActiveTooltip}
                  getBarColor={getBarColor}
                  initialFocusTaskId={initialFocusTaskId}
                  ganttTabFocusTaskId={ganttTabFocusTaskId}
                  draggingTaskIds={draggingTaskIds}
                  handleTaskDragStart={handleTaskDragStart}
                  handleTaskDragOver={handleTaskDragOver}
                  handleTaskDragLeave={handleTaskDragLeave}
                  handleTaskDrop={handleTaskDrop}
                  handleTaskDragEnd={handleTaskDragEnd}
                  dragOverTaskId={dragOverTaskId}
                  dropPosition={dropPosition}
                  handleTaskCheckboxChange={(e, id, isShift) => handleTaskCheckboxChange(e, id, isShift, allOrderedTaskIds)}
                  isHideMode={isHideMode}
                  toggleHideRow={toggleHideRow}
                  onNavigateToTaskDetail={onNavigateToTaskDetail}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Floating Sum Duration Badge */}
      {computedSum !== null && (
        <GanttSumBadge sumDuration={computedSum} />
      )}

      {/* Fullscreen Export Overlay */}
      {isExporting && (
        <GanttExportOverlay />
      )}
    </div>
  );
}
