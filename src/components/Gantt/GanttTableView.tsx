import React from 'react';
import { Project, Task, AppUser } from '../../types';
import { TimeUnit, GanttTableRow as GanttRowType, DependencyLine } from './ganttTypes';
import { GanttProjectRow } from './GanttProjectRow';
import { GanttTaskRow } from './GanttTaskRow';
import { GanttTimelineHeader } from './GanttTimelineHeader';
import { GanttGridOverlay } from './GanttGridOverlay';
import { GanttTodayLine } from './GanttTodayLine';
import { GanttDependencyLinks } from './GanttDependencyLinks';
import { GanttSumBadge } from './GanttSumBadge';
import { GanttExportOverlay } from './GanttExportOverlay';
import { GanttEmptyState } from './GanttEmptyState';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';

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

  const showStart = visibleColumns.includes('start');
  const showFinish = visibleColumns.includes('finish');
  const showParty = visibleColumns.includes('party');
  const showDuration = visibleColumns.includes('duration');

  const startColWidth = 75;
  const finishColWidth = 75;
  const partyColWidth = 75;
  const durationColWidth = 55;

  const totalTimelineWidth = totalDays * dayWidth;

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
          <div className="w-10 px-1 py-2 text-center border-r border-slate-200 dark:border-slate-800">
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
          <div className="flex-1 min-w-[140px] px-3 py-2 border-r border-slate-200 dark:border-slate-800 truncate">
            {t('Project / Task')}
          </div>
          {showStart && (
            <div className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px]" style={{ width: `${startColWidth}px` }}>
              {t('Start')}
            </div>
          )}
          {showFinish && (
            <div className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px]" style={{ width: `${finishColWidth}px` }}>
              {t('Finish')}
            </div>
          )}
          {showParty && (
            <div className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px]" style={{ width: `${partyColWidth}px` }}>
              {t('Party')}
            </div>
          )}
          {showDuration && (
            <div className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px]" style={{ width: `${durationColWidth}px` }}>
              {t('Dur.')}
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
        className="flex-grow overflow-auto relative flex min-h-0"
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
