import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { Project, Task } from '../types';
import { getEffectiveStoreFilter, scrollToElement } from '../lib/utils';
import { backfillMissingProjectDates } from '../lib/projectDatesService';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { safeSetItemSession } from '../lib/storage';

// Modular Subcomponents & Hooks according to AGENTS.md Rule 12
import { DetailTabProps } from './DetailTabParts/detailTypes';
import { DetailFilterToolbar } from './DetailTabParts/DetailFilterToolbar';
import { DetailTableView } from './DetailTabParts/DetailTableView';
import { DetailMobileView } from './DetailTabParts/DetailMobileView';
import { DetailFocusControls } from './DetailTabParts/DetailFocusControls';
import { DetailFloatingActionBar } from './DetailTabParts/DetailFloatingActionBar';
import { useDetailOptions } from './DetailTabParts/useDetailOptions';
import { useDetailColumns } from './DetailTabParts/useDetailColumns';
import { useDetailData } from './DetailTabParts/useDetailData';
import { useDetailVirtualization } from './DetailTabParts/useDetailVirtualization';
import { useDetailProjectMutations } from './DetailTabParts/useDetailProjectMutations';
import { useDetailTaskMutations } from './DetailTabParts/useDetailTaskMutations';
import { useDetailProjectCsv } from './DetailTabParts/useDetailProjectCsv';
import { useDetailTaskCsv } from './DetailTabParts/useDetailTaskCsv';
import { useDetailBulkActions } from './DetailTabParts/useDetailBulkActions';
import { useDetailPredecessorSync } from '../hooks/useDetailPredecessorSync';
import { useDetailTaskReorder } from '../hooks/useDetailTaskReorder';

const ConfirmModal = lazyWithRetry(() => import('./ConfirmModal').then(m => ({ default: m.ConfirmModal })), 'ConfirmModal');
const TaskNoteModal = lazyWithRetry(() => import('./TaskNoteModal').then(m => ({ default: m.TaskNoteModal })), 'TaskNoteModal');

export function DetailTab({
  initialFilterCode: propInitialFilterCode,
  initialFocusTaskId: propInitialFocusTaskId,
  returnScrollId: propReturnScrollId,
  onClearFocus,
  onBackToGantt,
  onAddProject,
  onAddTask,
  onEditTask,
  onEditProject,
  onNavigateToDelegation: _onNavigateToDelegation,
}: DetailTabProps) {
  // Global Zustand Selectors
  const storeFilterCode = useAppStore(state => state.detailTabFilterCode);
  const storeFocusTaskId = useAppStore(state => state.detailTabFocusTaskId);
  const storeReturnScrollId = useAppStore(state => state.detailReturnScrollId);
  const initialFilterCode = propInitialFilterCode !== undefined ? propInitialFilterCode : storeFilterCode;
  const initialFocusTaskId = propInitialFocusTaskId !== undefined ? propInitialFocusTaskId : storeFocusTaskId;
  const returnScrollId = propReturnScrollId !== undefined ? propReturnScrollId : storeReturnScrollId;

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const appUsers = useAppStore(state => state.appUsers);

  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);

  const expandedCodes = useAppStore(state => state.expandedProjectIds);
  const toggleProjectExpansion = useAppStore(state => state.toggleProjectExpansion);
  const setExpandedCodes = useAppStore(state => state.setExpandedProjectIds);
  const setVisibleActiveProjectIds = useAppStore(state => state.setVisibleActiveProjectIds);
  const setDetailTabFilterCode = useAppStore(state => state.setDetailTabFilterCode);

  // Tri-Gate Lazy Loading Guard
  const isTasksRequested = useAppStore(state => state.isTasksRequested);
  const setIsTasksRequested = useAppStore(state => state.setIsTasksRequested);
  useEffect(() => {
    if (!isTasksRequested) setIsTasksRequested(true);
  }, [isTasksRequested, setIsTasksRequested]);

  // Options & Permissions Hook
  const {
    hasWritePermission,
    isEditMode,
    setIsEditMode,
    canWrite,
    stores,
    allowedStoreOptions,
    locationFilterOptions,
    allowedLocationOptions,
    years,
  } = useDetailOptions({
    currentUser,
    locations,
    projects,
    tasks,
    globalYearFilter,
    globalLocationFilter,
    setGlobalLocationFilter,
    permissionMatrix,
  });

  // Modals state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: async () => {},
  });
  const [noteModalTask, setNoteModalTask] = useState<Task | null>(null);

  // Column management
  const {
    availableColumnsForUser,
    visibleColumns,
    colWidths,
    sortConfig,
    handleResize,
    handleToggleColumn,
    handleSort,
    effectiveVisibleColumns,
    totalTableWidth,
  } = useDetailColumns({ currentUser, canWrite });

  // Core Data & Virtualization Rows Hook
  const {
    searchTerm,
    setSearchTerm,
    visibleCount,
    setVisibleCount,
    statusFilter,
    setStatusFilter,
    lastSelectedStatusFilterRef,
    selectedTaskIds,
    setSelectedTaskIds,
    lastCheckedTaskIdRef,
    activeProjectInView,
    delegationGroupByParentKey,
    projectInfoMap,
    getProjectInfo,
    filteredProjects,
    allVisibleTaskIds,
    lowerSearchTerm,
    taskCodeMap,
    taskActualStatusMap,
    flatTableRows,
    handleSelectAllTasksInProject,
    handleToggleSelectTask,
    handleClearFocus,
    handleBackToGantt,
  } = useDetailData({
    projects,
    tasks,
    delegationGroups,
    currentUser,
    effectiveStore,
    globalYearFilter,
    setGlobalYearFilter,
    globalStoreFilter,
    setGlobalStoreFilter,
    globalLocationFilter,
    setGlobalLocationFilter,
    initialFilterCode,
    initialFocusTaskId,
    returnScrollId,
    onClearFocus,
    onBackToGantt,
    sortConfig,
    expandedCodes,
    setExpandedCodes,
    setVisibleActiveProjectIds,
    canWrite,
  });

  // Virtual Windowing Table
  const {
    tableContainerRef,
    handleTableScroll,
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
  } = useDetailVirtualization({
    flatTableRows,
    initialFocusTaskId,
    visibleCount,
    setVisibleCount,
    filteredProjectsLength: filteredProjects.length,
  });

  // Reordering & Predecessor Synchronization
  const {
    isSyncingPredecessors,
    handleSyncAllPredecessors,
    isConvertingToHash,
    handleConvertAllSubtasksToHash,
  } = useDetailPredecessorSync({
    tasks,
    projects,
    hasWritePermission,
  });

  const {
    draggingTaskIds,
    dragOverTaskId,
    dropPosition,
    draggingTaskNames,
    handleSortSubTasks,
    handleMoveTask,
    handleDetailTaskDragStart,
    handleDetailTaskDragOver,
    handleDetailTaskDragLeave,
    handleDetailTaskDragEnd,
    handleDetailTaskDrop,
  } = useDetailTaskReorder({
    tasks,
    projects,
    selectedTaskIds,
    setSelectedTaskIds,
  });

  // Project & Task Mutations
  const {
    handleDeleteProject,
    handleUpdateProject,
  } = useDetailProjectMutations({
    projects,
    tasks,
    delegationGroups,
    currentUser,
    setConfirmModal,
  });

  const {
    handleDeleteTask,
    handleUpdateTask,
    handleSaveNotes,
  } = useDetailTaskMutations({
    tasks,
    projects,
    delegationGroups,
    currentUser,
    setConfirmModal,
  });

  // Project & Task CSV Operations
  const {
    handleExportProjects,
    handleImportProjects,
  } = useDetailProjectCsv({
    filteredProjects,
    projects,
  });

  const {
    handleExportTasks,
    handleImportTasks,
    parseCSVDate,
  } = useDetailTaskCsv({
    filteredProjects,
    projects,
    tasks,
    appUsers,
    currentUser,
  });

  // Bulk Actions
  const {
    handleBulkAction,
  } = useDetailBulkActions({
    selectedTaskIds,
    setSelectedTaskIds,
    lastCheckedTaskIdRef,
    tasks,
    projects,
    delegationGroups,
    currentUser,
  });

  // Backfill dates once loaded
  useEffect(() => {
    if (projects.length > 0 && tasks.length > 0) {
      backfillMissingProjectDates(projects, tasks, delegationGroups);
    }
  }, [projects.length, tasks.length, delegationGroups.length]);

  // Initial Filter Code Scrolling & Auto-Expansion
  const lastProcessedFilterCodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialFilterCode && initialFilterCode !== lastProcessedFilterCodeRef.current) {
      lastProcessedFilterCodeRef.current = initialFilterCode;
      setSearchTerm(initialFilterCode);
      setStatusFilter('all');

      const filterUpper = String(initialFilterCode).trim().toUpperCase();
      const matchedProj = projects.find(
        (p) => String(p.code || "").trim().toUpperCase() === filterUpper
      ) || projects.find(
        (p) => p.code && filterUpper.startsWith(String(p.code).trim().toUpperCase() + '-')
      ) || projects.find(
        (p) => p.code && filterUpper.includes(String(p.code).trim().toUpperCase())
      );

      if (matchedProj) {
        const keysToExpand = [
          matchedProj.id,
          matchedProj.code,
          matchedProj.no !== undefined && matchedProj.no !== null ? String(matchedProj.no) : '',
          filterUpper
        ].filter(Boolean) as string[];

        const currentExpanded = useAppStore.getState().expandedProjectIds;
        setExpandedCodes([...new Set([...currentExpanded, ...keysToExpand])]);
      }

      useAppStore.getState().setIsTasksRequested(true);

      setTimeout(() => {
        const el =
          (matchedProj ? document.getElementById(`detail-project-${matchedProj.no ?? matchedProj.code}`) : null) ||
          document.querySelector(`[data-project-code="${initialFilterCode}"]`);
        if (el && el instanceof HTMLElement) {
          scrollToElement(el);
        }
      }, 300);
    } else if (!initialFilterCode && lastProcessedFilterCodeRef.current !== null) {
      lastProcessedFilterCodeRef.current = null;
      if (!initialFocusTaskId) setSearchTerm('');
    }
  }, [initialFilterCode, initialFocusTaskId, projects, setExpandedCodes, setSearchTerm, setStatusFilter]);

  const toggleGroup = useCallback((id: string) => {
    toggleProjectExpansion(id);
  }, [toggleProjectExpansion]);

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm">
      <React.Suspense fallback={null}>
        {confirmModal.isOpen && (
          <ConfirmModal 
            isOpen={confirmModal.isOpen}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          />
        )}
        {!!noteModalTask && (
          <TaskNoteModal
            isOpen={!!noteModalTask}
            onClose={() => setNoteModalTask(null)}
            task={noteModalTask}
            onSave={handleSaveNotes}
            canWrite={canWrite}
          />
        )}
      </React.Suspense>

      <DetailFilterToolbar
        globalYearFilter={globalYearFilter}
        setGlobalYearFilter={setGlobalYearFilter}
        years={years}
        effectiveStore={effectiveStore}
        setGlobalStoreFilter={setGlobalStoreFilter}
        stores={stores}
        globalLocationFilter={globalLocationFilter}
        setGlobalLocationFilter={setGlobalLocationFilter}
        locationFilterOptions={locationFilterOptions}
        statusFilter={statusFilter}
        onStatusFilterChange={(val) => {
          setStatusFilter(val);
          if (!searchTerm.trim()) {
            lastSelectedStatusFilterRef.current = val;
            safeSetItemSession("taka_detail_status_filter", val);
          }
        }}
        searchTerm={searchTerm}
        onSearchTermChange={(val) => {
          setSearchTerm(val);
          if (!val) {
            setDetailTabFilterCode("");
            onClearFocus?.();
          }
        }}
        availableColumnsForUser={availableColumnsForUser}
        visibleColumns={visibleColumns}
        onToggleColumn={handleToggleColumn}
        hasWritePermission={hasWritePermission}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        canWrite={canWrite}
        onAddProject={onAddProject}
        onAddTask={onAddTask}
        activeProjectInView={activeProjectInView}
        filteredProjects={filteredProjects}
        projects={projects}
        handleSyncAllPredecessors={handleSyncAllPredecessors}
        isSyncingPredecessors={isSyncingPredecessors}
        handleConvertAllSubtasksToHash={handleConvertAllSubtasksToHash}
        isConvertingToHash={isConvertingToHash}
        currentUser={currentUser}
        handleExportProjects={handleExportProjects}
        handleImportProjects={handleImportProjects}
        handleExportTasks={handleExportTasks}
        handleImportTasks={handleImportTasks}
        parseCSVDate={parseCSVDate}
      />

      <DetailTableView
        tableContainerRef={tableContainerRef}
        handleTableScroll={handleTableScroll}
        totalTableWidth={totalTableWidth}
        effectiveVisibleColumns={effectiveVisibleColumns}
        colWidths={colWidths}
        canWrite={canWrite}
        selectedTaskIds={selectedTaskIds}
        allVisibleTaskIds={allVisibleTaskIds}
        expandedCodes={expandedCodes}
        setExpandedCodes={setExpandedCodes}
        filteredProjects={filteredProjects}
        availableColumnsForUser={availableColumnsForUser}
        sortConfig={sortConfig}
        onResize={handleResize}
        onToggleColumn={handleToggleColumn}
        onSort={handleSort}
        setSelectedTaskIds={setSelectedTaskIds}
        paddingTop={paddingTop}
        paddingBottom={paddingBottom}
        flatTableRows={flatTableRows}
        startIndex={startIndex}
        endIndex={endIndex}
        allowedStoreOptions={allowedStoreOptions}
        allowedLocationOptions={allowedLocationOptions}
        toggleGroup={toggleGroup}
        handleSelectAllTasksInProject={handleSelectAllTasksInProject}
        handleUpdateProject={handleUpdateProject}
        handleSortSubTasks={handleSortSubTasks}
        onEditProject={onEditProject}
        onAddTask={onAddTask}
        handleDeleteProject={handleDeleteProject}
        taskActualStatusMap={taskActualStatusMap}
        taskCodeMap={taskCodeMap}
        draggingTaskIds={draggingTaskIds}
        dragOverTaskId={dragOverTaskId}
        dropPosition={dropPosition}
        draggingTaskNames={draggingTaskNames}
        initialFocusTaskId={initialFocusTaskId}
        tasks={tasks}
        projects={projects}
        handleToggleSelectTask={handleToggleSelectTask}
        onEditTask={onEditTask}
        handleUpdateTask={handleUpdateTask}
        handleMoveTask={handleMoveTask}
        handleDeleteTask={handleDeleteTask}
        handleDetailTaskDragStart={handleDetailTaskDragStart}
        handleDetailTaskDragOver={handleDetailTaskDragOver}
        handleDetailTaskDragLeave={handleDetailTaskDragLeave}
        handleDetailTaskDragEnd={handleDetailTaskDragEnd}
        handleDetailTaskDrop={handleDetailTaskDrop}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
      />

      <DetailMobileView
        filteredProjects={filteredProjects}
        expandedCodes={expandedCodes}
        setExpandedCodes={setExpandedCodes}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        projectInfoMap={projectInfoMap}
        getProjectInfo={getProjectInfo}
        sortConfig={sortConfig}
        delegationGroupByParentKey={delegationGroupByParentKey}
        initialFocusTaskId={initialFocusTaskId}
        canWrite={canWrite}
        tasks={tasks}
        projects={projects}
        lowerSearchTerm={lowerSearchTerm}
        delegationGroups={delegationGroups}
        toggleGroup={toggleGroup}
        onEditProject={onEditProject}
        onAddTask={onAddTask}
        onEditTask={onEditTask}
        handleUpdateProject={handleUpdateProject}
        handleMoveTask={handleMoveTask}
        handleUpdateTask={handleUpdateTask}
        handleDeleteTask={handleDeleteTask}
        taskCodeMap={taskCodeMap}
        taskActualStatusMap={taskActualStatusMap}
        onSortSubTasks={handleSortSubTasks}
      />

      <DetailFocusControls 
        initialFocusTaskId={initialFocusTaskId}
        onBackToGantt={handleBackToGantt}
        onClearFocus={onClearFocus ? handleClearFocus : undefined}
      />

      <DetailFloatingActionBar
        selectedCount={selectedTaskIds.size}
        canWrite={canWrite}
        onBulkAction={handleBulkAction}
        onClearSelection={() => { 
          setSelectedTaskIds(new Set()); 
          lastCheckedTaskIdRef.current = null; 
        }}
      />
    </div>
  );
}

export type { DetailTableRow } from './DetailTabParts/detailTypes';
export default DetailTab;
