import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { useLanguage } from '../lib/LanguageContext';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { safeGetDeviceItemLocal, safeSetDeviceItemLocal, getDeviceScreenType } from '../lib/storage';
import { GanttTabProps } from './Gantt/ganttTypes';
import { useGanttLayoutState } from './Gantt/useGanttLayoutState';
import { useGanttProjectsFilter } from './Gantt/useGanttProjectsFilter';
import { useGanttTimeline } from './Gantt/useGanttTimeline';
import { useGanttVirtualization } from './Gantt/useGanttVirtualization';
import { useGanttDependencies } from './Gantt/useGanttDependencies';
import { useGanttDragReorder } from './Gantt/useGanttDragReorder';
import { useGanttColumnResize } from './Gantt/useGanttColumnResize';
import { useGanttBatchOps } from './Gantt/useGanttBatchOps';
import { useGanttExport } from './Gantt/useGanttExport';
import { GanttToolbar } from './Gantt/GanttToolbar';
import { GanttTableView } from './Gantt/GanttTableView';
import { useGanttFocus } from './Gantt/useGanttFocus';
import { getBarColor } from './Gantt/GanttUtils';
import { useGanttPrintDimensions } from './Gantt/useGanttPrintDimensions';

const TaskModularModal = lazyWithRetry(
  () => import('./TaskModularModal').then(m => ({ default: m.TaskModularModal })),
  'TaskModularModal'
);
const ConfirmModal = lazyWithRetry(
  () => import('./ConfirmModal').then(m => ({ default: m.ConfirmModal })),
  'ConfirmModal'
);

export function GanttTab({
  onNavigateToTaskDetail,
  onNavigateToLayout,
  initialFocusTaskId,
  onClearFocus,
  printDateRangeOverride
}: GanttTabProps) {
  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser);
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const isTasksLoading = useAppStore(state => state.isTasksLoading);
  const isTasksRequested = useAppStore(state => state.isTasksRequested);
  const setIsTasksRequested = useAppStore(state => state.setIsTasksRequested);
  const ganttTabFocusTaskId = useAppStore(state => state.ganttTabFocusTaskId);
  const setGanttTabFocusTaskId = useAppStore(state => state.setGanttTabFocusTaskId);
  const ganttTabFilterProjectId = useAppStore(state => state.ganttTabFilterProjectId);
  const expandedProjects = useAppStore(state => state.expandedProjectIds);
  const toggleProjectExpansion = useAppStore(state => state.toggleProjectExpansion);

  useEffect(() => {
    if (!isTasksRequested) setIsTasksRequested(true);
  }, [isTasksRequested, setIsTasksRequested]);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }>({ isOpen: false, title: '', message: '', onConfirm: async () => {} });

  const {
    filterStartDate, setFilterStartDate, filterEndDate, setFilterEndDate,
    tempStartDate, setTempStartDate, tempEndDate, setTempEndDate,
    sideWidth, setSideWidth, visibleColumns, handleToggleColumn,
  } = useGanttLayoutState(currentUser?.id);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // 1. Projects Filter & Search
  const {
    globalYearFilter, setGlobalYearFilter, effectiveStore, setGlobalStoreFilter,
    globalLocationFilter, setGlobalLocationFilter, filterProjectStatus, onStatusFilterChange,
    searchTerm, setSearchTerm, deferredSearchTerm, uniqueYears, uniqueStores,
    locationOptions, getGroupTasksForProject, sortedProjects, paginatedProjects,
    visibleCount, handleLoadMore
  } = useGanttProjectsFilter({ projects, tasks, delegationGroups, currentUser });

  // 2. Timeline and Date Offset Calculations
  const {
    viewMode, setViewMode, dayWidth, setDayWidth, isWidthChanged, setIsWidthChanged,
    scaleInput, setScaleInput, saveDayWidth, customToday, setCustomToday,
    isDraggingToday, setIsDraggingToday, timeUnits, startDate, totalDays,
    getDateFromOffsetPx, handleTodayClick, topScrollRef, mainScrollRef,
    handleTopScroll, handleMainScroll
  } = useGanttTimeline({
    filterStartDate, filterEndDate, printDateRangeOverride,
    paginatedProjects, tasks, getGroupTasksForProject, globalYearFilter
  });

  // 3. Batch Operations & Selection
  const {
    selectedTaskIds, setSelectedTaskIds, selectedProjectIds, setSelectedProjectIds,
    selectedTaskSet, selectedProjectSet, isAllSelected, handleToggleSelectAll,
    handleTaskCheckboxChange, handleDeleteSelected, handleSetTextColor,
    handleSetBaselineSelected, handleToggleRealtimeUpdate, handleTogglePin,
    handleGroupModularTasks, handleUnlinkModularTasks, isTaskModularModalOpen,
    setIsTaskModularModalOpen, expandedModularTasks, setExpandedModularTasks,
    expandedModularSet, toggleModularParent, sumMode, setSumMode, computedSum,
    isHighlightDelegationOn, setIsHighlightDelegationOn, isEditMode, setIsEditMode,
    showPredecessorLines, setShowPredecessorLines,
    isHideMode, setIsHideMode, hiddenRows, setHiddenRows, hiddenRowsSet,
    toggleHideRow, getRowVisibilityClass
  } = useGanttBatchOps({
    tasks, projects, paginatedProjects, currentUser, getGroupTasksForProject, setConfirmModal
  });

  // 4. Virtualization Engine
  const {
    flatGanttRows, visibleGanttRows, paddingTop, paddingBottom, handleCombinedMainScroll
  } = useGanttVirtualization({
    paginatedProjects, expandedProjects, expandedModularSet, hiddenRowsSet,
    getGroupTasksForProject, tableContainerRef, handleMainScroll, deferredSearchTerm
  });

  // 5. Dynamic Column Width Resizing & Print Aspect-Ratio Auto-Calibration
  const { colWidths, startResizingColumn } = useGanttColumnResize();
  const { effectiveSideWidth, effectiveDayWidth } = useGanttPrintDimensions({
    sideWidth,
    dayWidth,
    totalDays,
    visibleGanttRows,
    visibleColumns,
    colWidths,
  });

  // 6. Dependencies and Tooltips
  const { activeTooltip, setActiveTooltip, dependencyLines, allCodesMap } = useGanttDependencies({
    tasks, projects, delegationGroups, visibleGanttRows, startDate,
    dayWidth: effectiveDayWidth,
    sideWidth: effectiveSideWidth,
    paddingTop,
    showStart: visibleColumns.includes('start'),
    showFinish: visibleColumns.includes('finish'),
    showParty: visibleColumns.includes('party'),
    showDuration: visibleColumns.includes('duration'),
    showPredecessor: visibleColumns.includes('predecessor'),
    showPredecessorLines,
  });

  // 7. Drag & Drop Task Reordering
  const {
    dragOverTaskId, dropPosition, draggingTaskIds, handleTaskDragStart,
    handleTaskDragOver, handleContainerDragOver, handleTaskDragLeave,
    handleTaskDrop, handleTaskDragEnd
  } = useGanttDragReorder({ tasks, projects, mainScrollRef });

  // 8. PDF / PNG Export
  const { isExporting, handleExportToPDF } = useGanttExport({ tableRef: tableContainerRef });

  // Resizing side width
  const startResizingSide = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sideWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newW = Math.max(180, Math.min(600, startW + delta));
      setSideWidth(newW);
      safeSetDeviceItemLocal('taka_gantt_side_width', String(newW), currentUser?.id);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [sideWidth]);

  // Auto-scroll to Today ONCE on initial tab mount (without re-snapping when tasks load or user pans)
  const hasInitialScrolledTodayRef = useRef(false);
  useEffect(() => {
    if (hasInitialScrolledTodayRef.current) return;
    hasInitialScrolledTodayRef.current = true;
    const timer = setTimeout(() => {
      handleTodayClick();
    }, 180);
    return () => clearTimeout(timer);
  }, [handleTodayClick]);

  // 9. Focus Mode, Auto-Reveal & Auto-Center
  const {
    activeFocusId,
    focusedTask,
    focusedProject,
    locateTask,
    handleClearFocus
  } = useGanttFocus({
    tasks,
    projects,
    initialFocusTaskId,
    ganttTabFocusTaskId,
    setGanttTabFocusTaskId,
    setExpandedModularTasks,
    mainScrollRef,
    topScrollRef,
    startDate,
    dayWidth,
    sideWidth,
    onClearFocus: () => {
      setSearchTerm('');
      if (onClearFocus) onClearFocus();
    }
  });

  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = Boolean(
    currentUser && (
      currentUser.role === 'admin' || 
      currentUser.canWrite === true || 
      (currentUser.role && !!permissionMatrix?.[currentUser.role]?.Write?.detail) || 
      (currentUser.role && !!permissionMatrix?.[currentUser.role]?.Write?.report) ||
      (currentUser.role && !!(permissionMatrix?.[currentUser.role]?.Write as any)?.gantt)
    )
  ) && !isArchiveYear;

  return (
    <div
      data-gesture-ignore="true"
      className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm min-h-0 overscroll-x-contain"
    >
      {/* Top Filter & Toolbar */}
      <GanttToolbar
        globalYearFilter={globalYearFilter}
        setGlobalYearFilter={setGlobalYearFilter}
        uniqueYears={uniqueYears}
        effectiveStore={effectiveStore}
        setGlobalStoreFilter={setGlobalStoreFilter}
        uniqueStores={uniqueStores}
        globalLocationFilter={globalLocationFilter}
        setGlobalLocationFilter={setGlobalLocationFilter}
        locationOptions={locationOptions}
        filterProjectStatus={filterProjectStatus}
        onStatusFilterChange={onStatusFilterChange}
        isTasksLoading={isTasksLoading}
        canWrite={canWrite}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        isHighlightDelegationOn={isHighlightDelegationOn}
        setIsHighlightDelegationOn={setIsHighlightDelegationOn}
        selectedProjectIds={selectedProjectIds}
        selectedTaskIds={selectedTaskIds}
        setSelectedProjectIds={setSelectedProjectIds}
        setSelectedTaskIds={setSelectedTaskIds}
        handleSetTextColor={handleSetTextColor}
        handleSetBaselineSelected={handleSetBaselineSelected}
        handleToggleRealtimeUpdate={handleToggleRealtimeUpdate}
        handleUnlinkModularTasks={handleUnlinkModularTasks}
        isTaskModularModalOpen={isTaskModularModalOpen}
        setIsTaskModularModalOpen={setIsTaskModularModalOpen}
        sumMode={sumMode}
        setSumMode={setSumMode}
        handleDeleteSelected={handleDeleteSelected}
        handleDragStart={() => {}}
        isHideMode={isHideMode}
        setIsHideMode={setIsHideMode}
        hiddenRows={hiddenRows}
        setHiddenRows={setHiddenRows}
        showPredecessorLines={showPredecessorLines}
        setShowPredecessorLines={setShowPredecessorLines}
        handleExportToPDF={handleExportToPDF}
        isExporting={isExporting}
        tempStartDate={tempStartDate}
        setTempStartDate={setTempStartDate}
        tempEndDate={tempEndDate}
        setTempEndDate={setTempEndDate}
        setFilterStartDate={setFilterStartDate}
        setFilterEndDate={setFilterEndDate}
        visibleColumns={visibleColumns}
        handleToggleColumn={handleToggleColumn}
        handleTodayClick={handleTodayClick}
        viewMode={viewMode}
        setViewMode={setViewMode}
        scaleInput={scaleInput}
        setScaleInput={setScaleInput}
        dayWidth={dayWidth}
        setDayWidth={setDayWidth}
        isWidthChanged={isWidthChanged}
        setIsWidthChanged={setIsWidthChanged}
        saveDayWidth={saveDayWidth}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        initialFocusTaskId={initialFocusTaskId}
        ganttTabFocusTaskId={ganttTabFocusTaskId}
        ganttTabFilterProjectId={ganttTabFilterProjectId}
        handleClearFocus={handleClearFocus}
      />

      {/* Main Gantt Table View */}
      <GanttTableView
        tableContainerRef={tableContainerRef}
        mainScrollRef={mainScrollRef}
        topScrollRef={topScrollRef}
        handleCombinedMainScroll={handleCombinedMainScroll}
        handleTopScroll={handleTopScroll}
        flatGanttRows={flatGanttRows}
        visibleGanttRows={visibleGanttRows}
        paddingTop={paddingTop}
        paddingBottom={paddingBottom}
        totalDays={totalDays}
        dayWidth={effectiveDayWidth}
        sideWidth={effectiveSideWidth}
        setSideWidth={setSideWidth}
        startResizingSide={startResizingSide}
        colWidths={colWidths}
        startResizingColumn={startResizingColumn}
        timeUnits={timeUnits}
        startDate={startDate}
        customToday={customToday}
        setCustomToday={setCustomToday}
        isDraggingToday={isDraggingToday}
        setIsDraggingToday={setIsDraggingToday}
        getDateFromOffsetPx={getDateFromOffsetPx}
        activeTooltip={activeTooltip}
        setActiveTooltip={setActiveTooltip}
        getBarColor={getBarColor}
        visibleColumns={visibleColumns}
        handleToggleColumn={handleToggleColumn}
        projects={projects}
        tasks={tasks}
        delegationGroups={delegationGroups}
        currentUser={currentUser}
        canWrite={canWrite}
        isEditMode={isEditMode}
        isHideMode={isHideMode}
        toggleHideRow={toggleHideRow}
        getRowVisibilityClass={getRowVisibilityClass}
        selectedTaskSet={selectedTaskSet}
        selectedTaskIds={selectedTaskIds}
        setSelectedTaskIds={setSelectedTaskIds}
        selectedProjectSet={selectedProjectSet}
        selectedProjectIds={selectedProjectIds}
        setSelectedProjectIds={setSelectedProjectIds}
        handleTaskCheckboxChange={handleTaskCheckboxChange}
        handleToggleSelectAll={handleToggleSelectAll}
        isAllSelected={isAllSelected}
        toggleProjectExpansion={toggleProjectExpansion}
        toggleModularParent={toggleModularParent}
        handleGroupModularTasks={handleGroupModularTasks}
        handleUnlinkModularTasks={handleUnlinkModularTasks}
        handleTogglePin={handleTogglePin}
        initialFocusTaskId={initialFocusTaskId}
        ganttTabFocusTaskId={ganttTabFocusTaskId}
        draggingTaskIds={draggingTaskIds}
        handleTaskDragStart={handleTaskDragStart}
        handleTaskDragOver={handleTaskDragOver}
        handleContainerDragOver={handleContainerDragOver}
        handleTaskDragLeave={handleTaskDragLeave}
        handleTaskDrop={handleTaskDrop}
        handleTaskDragEnd={handleTaskDragEnd}
        dragOverTaskId={dragOverTaskId}
        dropPosition={dropPosition}
        dependencyLines={dependencyLines}
        computedSum={computedSum}
        isExporting={isExporting}
        allCodesMap={allCodesMap}
        isHighlightDelegationOn={isHighlightDelegationOn}
        onNavigateToTaskDetail={onNavigateToTaskDetail}
        onNavigateToLayout={onNavigateToLayout}
        paginatedProjects={paginatedProjects}
        expandedModularTasks={expandedModularTasks}
        setExpandedModularTasks={setExpandedModularTasks}
        getGroupTasksForProject={getGroupTasksForProject}
      />

      {visibleCount < sortedProjects.length && (
        <div className="py-3 text-center bg-slate-50/90 dark:bg-[#18181a]/90 border-t border-slate-200 dark:border-[#444446] rounded-b-xl print:hidden hide-on-actual-print shrink-0">
          <button
            onClick={handleLoadMore}
            className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-xs transition-colors text-xs sm:text-sm cursor-pointer active:scale-95 touch-manipulation"
          >
            Load More Projects ({sortedProjects.length - visibleCount} remaining)
          </button>
        </div>
      )}

      {/* Task Modular Grouping Modal */}
      {isTaskModularModalOpen && (
        <Suspense fallback={null}>
          <TaskModularModal
            isOpen={isTaskModularModalOpen}
            onClose={() => setIsTaskModularModalOpen(false)}
            selectedTaskIds={selectedTaskIds}
            tasks={tasks}
            projects={projects}
            onGroupTasks={handleGroupModularTasks}
            onUnlinkTasks={handleUnlinkModularTasks}
          />
        </Suspense>
      )}

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <Suspense fallback={null}>
          <ConfirmModal
            isOpen={confirmModal.isOpen}
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          />
        </Suspense>
      )}

    </div>
  );
}

export default GanttTab;
