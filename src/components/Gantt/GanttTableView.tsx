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
        <div
          className="sticky left-0 z-30 bg-slate-100 dark:bg-[#28282b] flex items-center border-r border-slate-300 dark:border-slate-700 font-bold text-xs text-slate-900 dark:text-[#c3c3c3] shrink-0"
          style={{ width: `${sideWidth}px` }}
        >
          <div className="w-10 px-1 py-2 text-center border-r border-slate-200 dark:border-slate-800 shrink-0">
            {isEditMode ? (
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                title="Select All"
              />
            ) : (
              <span>#</span>
            )}
          </div>
          <div className="flex-1 min-w-[140px] px-2 py-2 border-r border-slate-200 dark:border-slate-800 truncate flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleExpandAll}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-[#333336] text-slate-700 dark:text-slate-300 active:scale-90 transition-all shrink-0 cursor-pointer"
              title={isAllExpanded ? "Thu gọn tất cả Dự án" : "Mở rộng tất cả Dự án"}
            >
              {isAllExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 font-bold" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 font-bold" />
              )}
            </button>
            <span className="truncate">{t('Project / Task')}</span>
          </div>
          {showStart && (
            <div
              className="relative px-1.5 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px] font-bold flex items-center justify-between gap-1 group/col shrink-0"
              style={{ width: `${startColWidth}px`, minWidth: `${startColWidth}px`, maxWidth: `${startColWidth}px` }}
            >
              <span className="truncate flex-1">{t('Start')}</span>
              {handleToggleColumn && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleColumn("start");
                  }}
                  className="opacity-0 group-hover/col:opacity-70 hover:!opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer shrink-0"
                  title="Hide Start column"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              )}
              {startResizingColumn && (
                <div
                  onMouseDown={(e) => startResizingColumn('start', e)}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
                  title="Drag to resize column"
                />
              )}
            </div>
          )}
          {showFinish && (
            <div
              className="relative px-1.5 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px] font-bold flex items-center justify-between gap-1 group/col shrink-0"
              style={{ width: `${finishColWidth}px`, minWidth: `${finishColWidth}px`, maxWidth: `${finishColWidth}px` }}
            >
              <span className="truncate flex-1">{t('Finish')}</span>
              {handleToggleColumn && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleColumn("finish");
                  }}
                  className="opacity-0 group-hover/col:opacity-70 hover:!opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer shrink-0"
                  title="Hide Finish column"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              )}
              {startResizingColumn && (
                <div
                  onMouseDown={(e) => startResizingColumn('finish', e)}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
                  title="Drag to resize column"
                />
              )}
            </div>
          )}
          {showParty && (
            <div
              className="relative px-1.5 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px] font-bold flex items-center justify-between gap-1 group/col shrink-0"
              style={{ width: `${partyColWidth}px`, minWidth: `${partyColWidth}px`, maxWidth: `${partyColWidth}px` }}
            >
              <span className="truncate flex-1">{t('Party')}</span>
              {handleToggleColumn && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleColumn("party");
                  }}
                  className="opacity-0 group-hover/col:opacity-70 hover:!opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer shrink-0"
                  title="Hide Party column"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              )}
              {startResizingColumn && (
                <div
                  onMouseDown={(e) => startResizingColumn('party', e)}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
                  title="Drag to resize column"
                />
              )}
            </div>
          )}
          {showDuration && (
            <div
              className="relative px-1.5 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px] font-bold flex items-center justify-between gap-1 group/col shrink-0"
              style={{ width: `${durationColWidth}px`, minWidth: `${durationColWidth}px`, maxWidth: `${durationColWidth}px` }}
            >
              <span className="truncate flex-1">{t('Dur.')}</span>
              {handleToggleColumn && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleColumn("duration");
                  }}
                  className="opacity-0 group-hover/col:opacity-70 hover:!opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer shrink-0"
                  title="Hide Duration column"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              )}
              {startResizingColumn && (
                <div
                  onMouseDown={(e) => startResizingColumn('duration', e)}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
                  title="Drag to resize column"
                />
              )}
            </div>
          )}
          {showPredecessor && (
            <div
              className="relative px-1.5 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px] font-bold flex items-center justify-between gap-1 group/col shrink-0"
              style={{ width: `${predecessorColWidth}px`, minWidth: `${predecessorColWidth}px`, maxWidth: `${predecessorColWidth}px` }}
            >
              <span className="truncate flex-1">{t('Predecessor')}</span>
              {handleToggleColumn && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleColumn("predecessor");
                  }}
                  className="opacity-0 group-hover/col:opacity-70 hover:!opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer shrink-0"
                  title="Hide Predecessor column"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              )}
              {startResizingColumn && (
                <div
                  onMouseDown={(e) => startResizingColumn('predecessor', e)}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
                  title="Drag to resize column"
                />
              )}
            </div>
          )}
        </div>

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
