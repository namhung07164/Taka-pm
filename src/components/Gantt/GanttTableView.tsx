import React from 'react';
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
import { useGanttZoomAndPan } from './useGanttZoomAndPan';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { useAppStore } from '../../store/useAppStore';

interface GanttTableViewProps {
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  mainScrollRef: React.RefObject<HTMLDivElement | null>;
  topScrollRef: React.RefObject<HTMLDivElement | null>;
  handleCombinedMainScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleTopScroll: (e: React.UIEvent<HTMLDivElement>) => void;
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
  handleTaskCheckboxChange: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
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
}

export function GanttTableView({
  tableContainerRef,
  mainScrollRef,
  topScrollRef,
  handleCombinedMainScroll,
  handleTopScroll,
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
  onNavigateToLayout
}: GanttTableViewProps) {
  const { t } = useLanguage();
  const expandedProjects = useAppStore((state) => state.expandedProjectIds);
  const setExpandedProjectIds = useAppStore((state) => state.setExpandedProjectIds);

  const isAllExpanded = projects.length > 0 && projects.every((p) => expandedProjects.includes(p.id!));

  const handleToggleExpandAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAllExpanded) {
      setExpandedProjectIds([]);
    } else {
      setExpandedProjectIds(projects.map((p) => p.id!).filter(Boolean) as string[]);
    }
  };

  const showStart = visibleColumns.includes('start');
  const showFinish = visibleColumns.includes('finish');
  const showParty = visibleColumns.includes('party');
  const showDuration = visibleColumns.includes('duration');
  const showPredecessor = visibleColumns.includes('predecessor');

  const startColWidth = colWidths?.start ?? 85;
  const finishColWidth = colWidths?.finish ?? 85;
  const partyColWidth = colWidths?.party ?? 80;
  const durationColWidth = colWidths?.duration ?? 60;
  const predecessorColWidth = colWidths?.predecessor ?? 90;

  const totalTimelineWidth = totalDays * dayWidth;

  const { isPanning, handlePointerDown } = useGanttZoomAndPan({
    mainScrollRef,
    topScrollRef,
    sideWidth
  });

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
            showStart={showStart}
            startColWidth={startColWidth}
            showFinish={showFinish}
            finishColWidth={finishColWidth}
            showParty={showParty}
            partyColWidth={partyColWidth}
            showDuration={showDuration}
            durationColWidth={durationColWidth}
            showPredecessor={showPredecessor}
            predecessorColWidth={predecessorColWidth}
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
                    pIdx={row.projectIndex}
                    isExpanded={row.isExpanded}
                    toggleProjectExpansion={toggleProjectExpansion}
                    sideWidth={sideWidth}
                    showStart={showStart}
                    startColWidth={startColWidth}
                    showFinish={showFinish}
                    finishColWidth={finishColWidth}
                    showParty={showParty}
                    partyColWidth={partyColWidth}
                    showDuration={showDuration}
                    durationColWidth={durationColWidth}
                    showPredecessor={showPredecessor}
                    predecessorColWidth={predecessorColWidth}
                    startDate={startDate}
                    dayWidth={dayWidth}
                    activeTooltip={activeTooltip}
                    setActiveTooltip={setActiveTooltip}
                    isEditMode={isEditMode}
                    canWrite={canWrite}
                    selectedProjectSet={selectedProjectSet}
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
                  p={row.project}
                  isChild={row.isChild}
                  parentTask={row.parentTask}
                  hasChildren={row.hasChildren}
                  childCount={row.childCount}
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
                  showStart={showStart}
                  startColWidth={startColWidth}
                  showFinish={showFinish}
                  finishColWidth={finishColWidth}
                  showParty={showParty}
                  partyColWidth={partyColWidth}
                  showDuration={showDuration}
                  durationColWidth={durationColWidth}
                  showPredecessor={showPredecessor}
                  predecessorColWidth={predecessorColWidth}
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
                  handleTaskCheckboxChange={handleTaskCheckboxChange}
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
