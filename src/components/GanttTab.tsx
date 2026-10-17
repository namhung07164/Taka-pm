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
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const isTasksLoading = useAppStore(state => state.isTasksLoading);
  const isTasksRequested = useAppStore(state => state.isTasksRequested);
  const setIsTasksRequested = useAppStore(state => state.setIsTasksRequested);
  const ganttTabFocusTaskId = useAppStore(state => state.ganttTabFocusTaskId);
  const setGanttTabFocusTaskId = useAppStore(state => state.setGanttTabFocusTaskId);
  const ganttTabFilterProjectId = useAppStore(state => state.ganttTabFilterProjectId);
  const setGanttTabFilterProjectId = useAppStore(state => state.setGanttTabFilterProjectId);
  const expandedProjects = useAppStore(state => state.expandedProjectIds);
  const toggleProjectExpansion = useAppStore(state => state.toggleProjectExpansion);

  useEffect(() => {
    if (!isTasksRequested) {
      setIsTasksRequested(true);
    }
  }, [isTasksRequested, setIsTasksRequested]);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: async () => {}
  });

  const {
    filterStartDate,
    setFilterStartDate,
    filterEndDate,
    setFilterEndDate,
    tempStartDate,
    setTempStartDate,
    tempEndDate,
    setTempEndDate,
    sideWidth,
    setSideWidth,
    visibleColumns,
    handleToggleColumn,
  } = useGanttLayoutState(currentUser?.id);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // 1. Projects Filter & Search
  const {
    globalYearFilter,
    setGlobalYearFilter,
    effectiveStore,
    setGlobalStoreFilter,
    globalLocationFilter,
    setGlobalLocationFilter,
    filterProjectStatus,
    onStatusFilterChange,
    searchTerm,
    setSearchTerm,
    uniqueYears,
    uniqueStores,
    locationOptions,
    getGroupTasksForProject,
    paginatedProjects
  } = useGanttProjectsFilter({
    projects,
    tasks,
    delegationGroups,
    currentUser
  });

  // 2. Timeline and Date Offset Calculations
  const {
    viewMode,
    setViewMode,
    dayWidth,
    setDayWidth,
    isWidthChanged,
    setIsWidthChanged,
    scaleInput,
    setScaleInput,
    saveDayWidth,
    customToday,
    setCustomToday,
    isDraggingToday,
    setIsDraggingToday,
    timeUnits,
    startDate,
    totalDays,
    getDateFromOffsetPx,
    handleTodayClick,
    topScrollRef,
    mainScrollRef,
    handleTopScroll,
    handleMainScroll
  } = useGanttTimeline({
    filterStartDate,
    filterEndDate,
    printDateRangeOverride,
    paginatedProjects,
    tasks,
    getGroupTasksForProject,
    globalYearFilter
  });

  // 3. Batch Operations & Selection
  const {
    selectedTaskIds,
    setSelectedTaskIds,
    selectedProjectIds,
    setSelectedProjectIds,
    selectedTaskSet,
    selectedProjectSet,
    isAllSelected,
    handleToggleSelectAll,
    handleTaskCheckboxChange,
    handleDeleteSelected,
    handleSetTextColor,
    handleSetBaselineSelected,
    handleToggleRealtimeUpdate,
    handleTogglePin,
    handleGroupModularTasks,
    handleUnlinkModularTasks,
    isTaskModularModalOpen,
    setIsTaskModularModalOpen,
    expandedModularTasks,
    setExpandedModularTasks,
    expandedModularSet,
    toggleModularParent,
    sumMode,
    setSumMode,
    computedSum,
    isHighlightDelegationOn,
    setIsHighlightDelegationOn,
    isEditMode,
    setIsEditMode,
    isHideMode,
    setIsHideMode,
    hiddenRows,
    setHiddenRows,
    hiddenRowsSet,
    toggleHideRow,
    getRowVisibilityClass
  } = useGanttBatchOps({
    tasks,
    projects,
    paginatedProjects,
    currentUser,
    getGroupTasksForProject,
    setConfirmModal
  });

  // 4. Virtualization Engine
  const {
    flatGanttRows,
    visibleGanttRows,
    paddingTop,
    paddingBottom,
    handleCombinedMainScroll
  } = useGanttVirtualization({
    paginatedProjects,
    expandedProjects,
    expandedModularSet,
    hiddenRowsSet,
    getGroupTasksForProject,
    tableContainerRef,
    handleMainScroll
  });

  // 5. Dependencies and Tooltips
  const {
    activeTooltip,
    setActiveTooltip,
    dependencyLines
  } = useGanttDependencies({
    tasks,
    projects,
    delegationGroups,
    visibleGanttRows,
    startDate,
    dayWidth,
    sideWidth,
    paddingTop,
    showStart: visibleColumns.includes('start'),
    showFinish: visibleColumns.includes('finish'),
    showParty: visibleColumns.includes('party'),
    showDuration: visibleColumns.includes('duration'),
    showPredecessor: visibleColumns.includes('predecessor')
  });

  // 6. Drag & Drop Task Reordering
  const {
    dragOverTaskId,
    dropPosition,
    draggingTaskIds,
    handleTaskDragStart,
    handleTaskDragOver,
    handleContainerDragOver,
    handleTaskDragLeave,
    handleTaskDrop,
    handleTaskDragEnd
  } = useGanttDragReorder({
    tasks,
    projects,
    mainScrollRef
  });

  // 7. PDF / PNG Export
  const { isExporting, handleExportToPDF } = useGanttExport({
    tableRef: tableContainerRef
  });

  // 8. Dynamic Column Width Resizing
  const { colWidths, startResizingColumn } = useGanttColumnResize();

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

  // Auto-scroll to Today on tab mount
  useEffect(() => {
    const timer = setTimeout(() => {
      handleTodayClick();
    }, 250);
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
  const canWrite = (
    currentUser.role === 'admin' || 
    currentUser.canWrite === true || 
    !!permissionMatrix[currentUser.role]?.Write?.detail || 
    !!permissionMatrix[currentUser.role]?.Write?.report ||
    !!(permissionMatrix[currentUser.role]?.Write as any)?.gantt
  ) && !isArchiveYear;

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm min-h-0">
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
        dayWidth={dayWidth}
        sideWidth={sideWidth}
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
        onNavigateToTaskDetail={onNavigateToTaskDetail}
        onNavigateToLayout={onNavigateToLayout}
        paginatedProjects={paginatedProjects}
        expandedModularTasks={expandedModularTasks}
        setExpandedModularTasks={setExpandedModularTasks}
        getGroupTasksForProject={getGroupTasksForProject}
      />

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
