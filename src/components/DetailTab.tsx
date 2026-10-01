import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { useAppStore } from "../store/useAppStore";
import { useEnrichedData } from '../hooks/useEnrichedData';
import { Project, Task, AppRole } from '../types';
import { getUserAllowedStores, getEffectiveStoreFilter } from '../lib/utils';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { useLocationOptions } from '../hooks/useLocationOptions';
import { safeGetItemSession, safeSetItemSession } from '../lib/storage';

const ConfirmModal = lazyWithRetry(() => import('./ConfirmModal').then(m => ({ default: m.ConfirmModal })), 'ConfirmModal');
const TaskNoteModal = lazyWithRetry(() => import('./TaskNoteModal').then(m => ({ default: m.TaskNoteModal })), 'TaskNoteModal');

import { DetailFilterToolbar } from './DetailTabParts/DetailFilterToolbar';
import { DetailMobileView } from './DetailTabParts/DetailMobileView';
import { DetailFocusControls } from './DetailTabParts/DetailFocusControls';
import { DetailFloatingActionBar } from './DetailTabParts/DetailFloatingActionBar';
import { DetailTableView } from './DetailTabParts/DetailTableView';
import { DetailTableRow } from './DetailTabParts/detailTabTypes';

import { useDetailPredecessorSync } from '../hooks/useDetailPredecessorSync';
import { useDetailTaskReorder } from '../hooks/useDetailTaskReorder';
import { useDetailCsvHandlers } from '../hooks/useDetailCsvHandlers';
import { useDetailTaskCrud } from '../hooks/useDetailTaskCrud';
import { useDetailSelection } from '../hooks/useDetailSelection';
import { useDetailVirtualTable } from '../hooks/useDetailVirtualTable';
import { useDetailColumns } from '../hooks/useDetailColumns';
import { useDetailViewportTracking } from '../hooks/useDetailViewportTracking';
import { useDetailProjectFilters } from '../hooks/useDetailProjectFilters';

export type { DetailTableRow };

interface DetailTabProps {
  initialFilterCode?: string;
  initialStoreFilter?: string;
  initialFocusTaskId?: string;
  returnScrollId?: string;
  onClearFocus?: () => void;
  onBackToGantt?: () => void;
  onAddProject: () => void;
  onAddTask: (p?: Project | null) => void;
  onEditTask: (t: Task, isReadOnly?: boolean, initialTab?: string) => void;
  onEditProject?: (p: Project, isReadOnly?: boolean, initialTab?: string) => void;
  onNavigateToDelegation?: (groupId: string, sourceTaskId?: string) => void;
}

export function DetailTab({
  initialFilterCode: propInitialFilterCode,
  initialFocusTaskId: propInitialFocusTaskId,
  returnScrollId,
  onClearFocus,
  onBackToGantt,
  onAddProject,
  onAddTask,
  onEditTask,
  onEditProject,
  onNavigateToDelegation
}: DetailTabProps) {
  const storeFilterCode = useAppStore(state => state.detailTabFilterCode);
  const storeFocusTaskId = useAppStore(state => state.detailTabFocusTaskId);

  const initialFilterCode = propInitialFilterCode !== undefined ? propInitialFilterCode : storeFilterCode;
  const initialFocusTaskId = propInitialFocusTaskId !== undefined ? propInitialFocusTaskId : storeFocusTaskId;

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);

  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const setDetailTabFilterCode = useAppStore(state => state.setDetailTabFilterCode);

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [visibleCount, setVisibleCount] = useState(30);
  const [statusFilter, setStatusFilter] = useState(() => safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedStatusFilterRef = useRef<string>(safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedLocationFilterRef = useRef<string[]>(globalLocationFilter);
  const wasSearchingRef = useRef<boolean>(false);

  useEffect(() => {
    const isSearching = !!searchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (statusFilter !== 'all') {
        lastSelectedStatusFilterRef.current = statusFilter;
        safeSetItemSession("taka_detail_status_filter", statusFilter);
      }
      lastSelectedLocationFilterRef.current = globalLocationFilter;
      setStatusFilter('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored = lastSelectedStatusFilterRef.current || safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days';
      setStatusFilter(restored);
      setGlobalLocationFilter(lastSelectedLocationFilterRef.current || []);
      wasSearchingRef.current = false;
    }
  }, [searchTerm, globalLocationFilter, setGlobalLocationFilter, statusFilter]);

  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const expandedCodes = useAppStore(state => state.expandedProjectIds);
  const toggleProjectExpansion = useAppStore(state => state.toggleProjectExpansion);
  const setExpandedCodes = useAppStore(state => state.setExpandedProjectIds);
  const isTasksRequested = useAppStore(state => state.isTasksRequested);
  const setIsTasksRequested = useAppStore(state => state.setIsTasksRequested);

  useEffect(() => {
    if (!isTasksRequested) setIsTasksRequested(true);
  }, [isTasksRequested, setIsTasksRequested]);

  // Escape key listener to clear search/focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const state = useAppStore.getState();
        const hasOpenModal = state.isProjectModalOpen || state.isTaskModalOpen || state.isUserModalOpen;
        if (!hasOpenModal) {
          if (searchTerm) {
            setSearchTerm("");
            setDetailTabFilterCode("");
          }
          if (initialFocusTaskId) onClearFocus?.();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchTerm, initialFocusTaskId, onClearFocus, setDetailTabFilterCode]);

  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const hasWritePermission = (isAdmin || !!permissionMatrix[role]?.Write?.detail) && !isArchiveYear;
  const [isEditMode, setIsEditMode] = useState(false);
  const canWrite = hasWritePermission && isEditMode;

  const years = useMemo(() => {
    const projYears = projects.map(p => p.year ? String(p.year) : (p.start ? String(p.start).substring(0, 4) : null)).filter(Boolean) as string[];
    const taskYears = tasks.map(t => t.projectYear ? String(t.projectYear) : (t.start ? String(t.start).substring(0, 4) : null)).filter(Boolean) as string[];
    const unique = Array.from(new Set([...projYears, ...taskYears])).sort().reverse();
    return unique.length > 0 ? unique : ['2026', '2025'];
  }, [projects, tasks]);

  const stores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);

  const allowedStoreOptions = useMemo(() => {
    if (currentUser.role === 'admin') return [{label: 'HCM', value: 'HCM'}, {label: 'HN', value: 'HN'}];
    const options = [];
    if (currentUser.storePermissions?.hcm) options.push({label: 'HCM', value: 'HCM'});
    if (currentUser.storePermissions?.hn) options.push({label: 'HN', value: 'HN'});
    return options;
  }, [currentUser]);

  const locationFilterOptions = useLocationOptions();
  const allowedLocationOptions = useMemo(() => {
    if (currentUser.role === 'admin') return Array.from(new Set(locations));
    return Array.from(new Set(locations)).filter(loc => currentUser.locationPermissions?.['all'] || currentUser.locationPermissions?.[loc.toLowerCase()]);
  }, [locations, currentUser]);

  // Hook 1: Project Filters & Indexing
  const {
    delegationGroupByParentKey,
    getProjectInfo,
    projectInfoMap,
    filteredProjects,
    taskCodeMap,
    taskActualStatusMap,
  } = useDetailProjectFilters({
    projects, tasks, delegationGroups, globalYearFilter, effectiveStore, globalLocationFilter, statusFilter, deferredSearchTerm
  });

  const { activeProjectInView } = useDetailViewportTracking({
    projects, tasks, initialFilterCode, initialFocusTaskId, returnScrollId, expandedCodes, setExpandedCodes, setDetailTabFilterCode, onClearFocus, setSearchTerm, setStatusFilter
  });

  const {
    visibleColumns, availableColumnsForUser, effectiveVisibleColumns, columnsWithWidths, handleToggleColumn, handleColumnResize, handleResetColumnWidth
  } = useDetailColumns({ currentUser, canWrite });

  const {
    tableContainerRef, handleScroll, allVisibleTaskIds, flatTableRows, startIndex, endIndex, paddingTop, paddingBottom
  } = useDetailVirtualTable({
    filteredProjects, visibleCount, projectInfoMap, getProjectInfo, sortConfig, expandedCodes, delegationGroups, lowerSearchTerm: searchTerm.toLowerCase().trim(), deferredSearchTerm
  });

  const {
    selectedTaskIds, setSelectedTaskIds, handleSelectAllTasksInProject, handleToggleSelectTask, handleBulkAction, selectAllTasksAcrossProjects, clearSelectedTasks
  } = useDetailSelection({
    tasks, projects, delegationGroups, currentUser, allVisibleTaskIds
  });

  const {
    draggingTaskIds, dragOverTaskId, dropPosition, draggingTaskNames, handleSortSubTasks, handleMoveTask, handleDetailTaskDragStart, handleDetailTaskDragOver, handleDetailTaskDragLeave, handleDetailTaskDragEnd, handleDetailTaskDrop
  } = useDetailTaskReorder({
    tasks, projects, selectedTaskIds, setSelectedTaskIds
  });

  const {
    confirmModal, setConfirmModal, noteModalTask, setNoteModalTask, handleDeleteProject, handleDeleteTask, handleUpdateProject, handleUpdateTask, handleSaveNotes
  } = useDetailTaskCrud({
    tasks, projects, delegationGroups, currentUser
  });

  const {
    isSyncingPredecessors, handleSyncAllPredecessors, isConvertingToHash, handleConvertAllSubtasksToHash
  } = useDetailPredecessorSync({
    tasks, projects, hasWritePermission
  });

  const {
    handleExportProjects, handleImportProjects, handleExportTasks, handleImportTasks
  } = useDetailCsvHandlers({
    filteredProjects, projects, tasks, locations, currentUser
  });

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

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
      />

      <DetailFocusControls
        initialFilterCode={initialFilterCode}
        initialFocusTaskId={initialFocusTaskId}
        tasks={tasks}
        projects={projects}
        onClearFocus={() => {
          setDetailTabFilterCode("");
          onClearFocus?.();
        }}
        onBackToGantt={onBackToGantt}
      />

      <DetailTableView
        tableContainerRef={tableContainerRef}
        handleScroll={handleScroll}
        columnsWithWidths={columnsWithWidths}
        sortConfig={sortConfig}
        onSort={handleSort}
        canWrite={canWrite}
        selectedTaskIds={selectedTaskIds}
        allVisibleTaskIds={allVisibleTaskIds}
        onSelectAllVisibleTasks={(select) => {
          if (select) {
            setSelectedTaskIds(new Set(allVisibleTaskIds));
          } else {
            clearSelectedTasks();
          }
        }}
        handleColumnResize={handleColumnResize}
        handleResetColumnWidth={handleResetColumnWidth}
        effectiveVisibleColumns={effectiveVisibleColumns}
        paddingTop={paddingTop}
        paddingBottom={paddingBottom}
        flatTableRows={flatTableRows}
        startIndex={startIndex}
        endIndex={endIndex}
        allowedStoreOptions={allowedStoreOptions}
        allowedLocationOptions={allowedLocationOptions}
        toggleGroup={(id) => toggleProjectExpansion(String(id))}
        handleSelectAllTasksInProject={handleSelectAllTasksInProject}
        handleUpdateProject={handleUpdateProject}
        handleSortSubTasks={handleSortSubTasks}
        onEditProject={onEditProject}
        onAddTask={onAddTask}
        handleDeleteProject={handleDeleteProject}
        draggingTaskIds={draggingTaskIds}
        dragOverTaskId={dragOverTaskId}
        dropPosition={dropPosition}
        draggingTaskNames={draggingTaskNames}
        taskCodeMap={taskCodeMap}
        initialFocusTaskId={initialFocusTaskId}
        taskActualStatusMap={taskActualStatusMap}
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
        totalFilteredProjectsCount={filteredProjects.length}
        onLoadMore={() => setVisibleCount(prev => Math.min(prev + 30, filteredProjects.length))}
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
        lowerSearchTerm={searchTerm.toLowerCase().trim()}
        delegationGroups={delegationGroups}
        toggleGroup={(id) => toggleProjectExpansion(String(id))}
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
        onNavigateToDelegation={onNavigateToDelegation}
      />

      <DetailFloatingActionBar
        selectedTaskIds={selectedTaskIds}
        onSelectAll={() => selectAllTasksAcrossProjects(tasks)}
        onClearSelection={clearSelectedTasks}
        onBulkAction={handleBulkAction}
      />
    </div>
  );
}

export default DetailTab;
