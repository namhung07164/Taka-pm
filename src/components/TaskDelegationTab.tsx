import React, { Suspense, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { TaskDelegationTabProps } from './TaskDelegationParts/taskDelegationTypes';
import { useTaskDelegationData } from './TaskDelegationParts/useTaskDelegationData';
import { useTaskDelegationMutations } from './TaskDelegationParts/useTaskDelegationMutations';
import { TaskDelegationFilterToolbar } from './TaskDelegationParts/TaskDelegationFilterToolbar';
import { TaskDelegationTableView } from './TaskDelegationParts/TaskDelegationTableView';
import { TaskDelegationMobileView } from './TaskDelegationParts/TaskDelegationMobileView';

const ConfirmModal = lazyWithRetry(
  () => import('./ConfirmModal').then((m) => ({ default: m.ConfirmModal })),
  'ConfirmModal'
);

export function TaskDelegationTab({ onBackFromFocus }: TaskDelegationTabProps) {
  const { enrichedProjects: projects, filteredTasks: tasks } = useEnrichedData();
  const currentUser = useAppStore((state) => state.currentUser)!;
  const isTasksRequested = useAppStore((state) => state.isTasksRequested);
  const setIsTasksRequested = useAppStore((state) => state.setIsTasksRequested);
  const isDelegationsRequested = useAppStore((state) => state.isDelegationsRequested);
  const setIsDelegationsRequested = useAppStore((state) => state.setIsDelegationsRequested);

  // Tri-Gate Lazy Loading (Rule 3)
  useEffect(() => {
    if (!isTasksRequested) setIsTasksRequested(true);
    if (!isDelegationsRequested) setIsDelegationsRequested(true);
  }, [isTasksRequested, setIsTasksRequested, isDelegationsRequested, setIsDelegationsRequested]);

  const {
    groups,
    searchTerm,
    setSearchTerm,
    filterFlowStatus,
    setFilterFlowStatus,
    multiSearchTerm,
    setMultiSearchTerm,
    filterParty,
    setFilterParty,
    focusTarget,
    setFocusTarget,
    visibleCount,
    setVisibleCount,
    colWidths,
    handleResize,
    visibleColumns,
    availableColumnsForUser,
    handleToggleColumn,
    isSearchFocused,
    setIsSearchFocused,
    searchRef,
    expandedProjects,
    expandedGroups,
    toggleGroup,
    toggleProject,
    handleToggleAllGroups,
    isAllExpanded,
    picOptions,
    uniqueParties,
    searchResults,
    visibleGroups,
    groupedDelegations,
    handleTextareaInput,
    canWrite,
    globalYearFilter,
    globalStoreFilter,
  } = useTaskDelegationData({
    projects,
    tasks,
    currentUser,
    onBackFromFocus,
  });

  const {
    confirmModal,
    setConfirmModal,
    isAddingTask,
    handleAddLinkedGroup,
    handleAddCustomGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    handleUpdateSubTask,
    handleDeleteSubTask,
  } = useTaskDelegationMutations({
    canWrite,
    currentUser,
    projects,
    tasks,
    groups,
    globalYearFilter,
    globalStoreFilter,
    setSearchTerm,
    setIsSearchFocused,
  });

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm">
      <React.Suspense fallback={null}>
        {confirmModal.isOpen && (
          <ConfirmModal
            isOpen={confirmModal.isOpen}
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
          />
        )}
      </React.Suspense>

      {/* Filter and Link/Custom Action Bar */}
      <TaskDelegationFilterToolbar
        focusTarget={focusTarget}
        setFocusTarget={setFocusTarget}
        onBackFromFocus={onBackFromFocus}
        picOptions={picOptions}
        uniqueParties={uniqueParties}
        canWrite={canWrite}
        handleAddCustomGroup={handleAddCustomGroup}
        searchRef={searchRef}
        isSearchFocused={isSearchFocused}
        setIsSearchFocused={setIsSearchFocused}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        searchResults={searchResults}
        handleAddLinkedGroup={handleAddLinkedGroup}
        isAddingTask={isAddingTask}
        filterFlowStatus={filterFlowStatus}
        setFilterFlowStatus={setFilterFlowStatus}
        filterParty={filterParty}
        setFilterParty={setFilterParty}
        multiSearchTerm={multiSearchTerm}
        setMultiSearchTerm={setMultiSearchTerm}
        availableColumnsForUser={availableColumnsForUser}
        visibleColumns={visibleColumns}
        handleToggleColumn={handleToggleColumn}
      />

      {/* Desktop Table View */}
      <TaskDelegationTableView
        visibleColumns={visibleColumns}
        colWidths={colWidths}
        handleResize={handleResize}
        handleToggleColumn={handleToggleColumn}
        handleToggleAllGroups={handleToggleAllGroups}
        isAllExpanded={isAllExpanded}
        groupedDelegations={groupedDelegations}
        expandedProjects={expandedProjects}
        toggleProject={toggleProject}
        expandedGroups={expandedGroups}
        toggleGroup={toggleGroup}
        visibleGroups={visibleGroups}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        projects={projects}
        tasks={tasks}
        canWrite={canWrite}
        currentUser={currentUser}
        focusTarget={focusTarget}
        picOptions={picOptions}
        uniqueParties={uniqueParties}
        handleUpdateGroup={handleUpdateGroup}
        handleDeleteGroup={handleDeleteGroup}
        handleUpdateSubTask={handleUpdateSubTask}
        handleDeleteSubTask={handleDeleteSubTask}
        handleTextareaInput={handleTextareaInput}
        setMultiSearchTerm={setMultiSearchTerm}
      />

      {/* Mobile Vertical View */}
      <TaskDelegationMobileView
        groupedDelegations={groupedDelegations}
        expandedProjects={expandedProjects}
        toggleProject={toggleProject}
        expandedGroups={expandedGroups}
        toggleGroup={toggleGroup}
        handleToggleAllGroups={handleToggleAllGroups}
        isAllExpanded={isAllExpanded}
        visibleGroups={visibleGroups}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        projects={projects}
        tasks={tasks}
        canWrite={canWrite}
        currentUser={currentUser}
        focusTarget={focusTarget}
        picOptions={picOptions}
        uniqueParties={uniqueParties}
        handleDeleteGroup={handleDeleteGroup}
        handleUpdateSubTask={handleUpdateSubTask}
        handleDeleteSubTask={handleDeleteSubTask}
        setMultiSearchTerm={setMultiSearchTerm}
      />
    </div>
  );
}

export default TaskDelegationTab;
