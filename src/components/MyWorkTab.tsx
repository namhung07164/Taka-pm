import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import {
  hydrateTasksFromLocal,
  hydrateTasksForProjects,
  hydrateDelegationsFromLocal,
} from '../lib/backgroundSyncWorker';
import { safeGetItemSession } from '../lib/storage';
import {
  MyWorkDisplayMode,
  MyWorkFocusTarget,
  MyWorkTabView,
  MyWorkTimeFilter,
} from './MyWorkTabParts/myWorkTypes';
import { useMyWorkData } from './MyWorkTabParts/useMyWorkData';
import { useMyWorkActions } from './MyWorkTabParts/useMyWorkActions';
import { MyWorkHeader } from './MyWorkTabParts/MyWorkHeader';
import { MyWorkBriefingBanner } from './MyWorkTabParts/MyWorkBriefingBanner';
import { MyWorkKanbanView } from './MyWorkTabParts/MyWorkKanbanView';
import { MyWorkStreamView } from './MyWorkTabParts/MyWorkStreamView';
import { Target, X } from 'lucide-react';

function readInitialFocusTarget(): MyWorkFocusTarget | null {
  try {
    const raw = safeGetItemSession('taka_mywork_focus');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.projectId || parsed.projectCode)) return parsed;
  } catch {
    // ignore parse error
  }
  return null;
}

export function MyWorkTab() {
  const {
    enrichedProjects: projects,
    filteredTasks: tasks,
    visibleDelegationGroups: delegationGroups,
  } = useEnrichedData();

  const currentUser = useAppStore((s) => s.currentUser)!;
  const permissionMatrix = useAppStore((s) => s.permissionMatrix);
  const setIsTasksRequested = useAppStore((s) => s.setIsTasksRequested);
  const isDelegationsRequested = useAppStore((s) => s.isDelegationsRequested);
  const setIsDelegationsRequested = useAppStore((s) => s.setIsDelegationsRequested);
  const globalStoreFilter = useAppStore((s) => s.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore((s) => s.setGlobalStoreFilter);
  const globalYearFilter = useAppStore((s) => s.globalYearFilter);
  const setIsCalendarSyncModalOpen = useAppStore((s) => s.setIsCalendarSyncModalOpen);
  const setEditingTask = useAppStore((s) => s.setEditingTask);
  const setEditingProject = useAppStore((s) => s.setEditingProject);
  const setIsTaskModalOpen = useAppStore((s) => s.setIsTaskModalOpen);
  const setIsProjectModalOpen = useAppStore((s) => s.setIsProjectModalOpen);
  const setModalInitialTab = useAppStore((s) => s.setModalInitialTab);
  const setIsReadOnlyModal = useAppStore((s) => s.setIsReadOnlyModal);
  const setToast = useAppStore((s) => s.setToast);

  const [displayMode, setDisplayMode] = useState<MyWorkDisplayMode>('kanban');
  const [activeView, setActiveView] = useState<MyWorkTabView>('today');
  const [timeFilter, setTimeFilter] = useState<MyWorkTimeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'urgency' | 'due_asc' | 'project' | 'priority'>('urgency');
  const [focusTarget, setFocusTarget] = useState<MyWorkFocusTarget | null>(readInitialFocusTarget);

  useEffect(() => {
    const handleFocusChanged = (e: Event) => {
      const custom = e as CustomEvent<MyWorkFocusTarget | null>;
      setFocusTarget(custom.detail || null);
      if (custom.detail) setActiveView('today');
    };
    window.addEventListener('taka-mywork-focus-changed', handleFocusChanged);
    return () => window.removeEventListener('taka-mywork-focus-changed', handleFocusChanged);
  }, []);

  // Rule 3 & Rule 14: Local-First Dexie hydration only on mount (0 Firestore Reads, preserves Tri-Gate flags)
  useEffect(() => {
    hydrateTasksFromLocal(globalYearFilter).catch(() => {});
    hydrateDelegationsFromLocal(globalYearFilter).catch(() => {});
  }, [globalYearFilter]);

  // If user explicitly filters by Delegation workflow and none are in memory, enable delegation gate on-demand
  useEffect(() => {
    if (statusFilter === 'delegation' && !isDelegationsRequested && delegationGroups.length === 0) {
      setIsDelegationsRequested(true);
    }
  }, [statusFilter, isDelegationsRequested, delegationGroups.length, setIsDelegationsRequested]);

  // Rule 8 & Rule 14: Local-only project task hydration when focused (0 Firestore Reads)
  useEffect(() => {
    const keys = [focusTarget?.projectId, focusTarget?.projectCode].filter(Boolean) as string[];
    if (keys.length > 0) {
      hydrateTasksForProjects(
        keys,
        focusTarget?.projectYear || globalYearFilter,
        focusTarget?.projectStore || globalStoreFilter
      ).catch(() => {});
    }
  }, [
    focusTarget?.projectCode,
    focusTarget?.projectId,
    focusTarget?.projectStore,
    focusTarget?.projectYear,
    globalStoreFilter,
    globalYearFilter,
  ]);

  const handleRequestFullHydration = useCallback(() => {
    setIsTasksRequested(true);
    setIsDelegationsRequested(true);
    setToast({
      title: 'Full Task Details Activated',
      message: 'Synchronizing full task & delegation records in real time.',
      type: 'info',
    });
  }, [setIsDelegationsRequested, setIsTasksRequested, setToast]);

  const handleClearFocusTarget = useCallback(() => {
    setFocusTarget(null);
    useAppStore.getState().setFixedProjectCode('');
    try {
      sessionStorage.removeItem('taka_mywork_focus');
    } catch {
      // ignore
    }
  }, []);

  const {
    overdueItems,
    approvalItems,
    todayItems,
    weekItems,
    monthItems,
    doneItems,
    kanbanTodo,
    kanbanInProgress,
    kanbanPendingApproval,
    kanbanDone,
    counts,
    briefingStats,
    hasSummaryFallbacks,
  } = useMyWorkData({
    projects,
    tasks,
    delegationGroups,
    currentUser,
    permissionMatrix,
    searchQuery,
    storeFilter: globalStoreFilter,
    globalYearFilter,
    statusFilter,
    timeFilter,
    sortBy,
    focusTarget,
  });

  const {
    handleToggleTaskComplete,
    handleAcceptItem,
    handleReportSubTaskComplete,
    handleApproveItem,
    handleReworkItem,
    handleMoveItemToColumn,
    handleItemClick,
  } = useMyWorkActions({
    currentUser,
    setToast,
    setEditingTask,
    setEditingProject,
    setIsTaskModalOpen,
    setIsProjectModalOpen,
    setModalInitialTab,
    setIsReadOnlyModal,
  });


  return (
    <div className="flex flex-col flex-grow min-h-[calc(100dvh-130px)] bg-slate-50/60 dark:bg-[#121215] rounded-xl border border-slate-200/80 dark:border-[#333336] overflow-hidden">
      <MyWorkHeader
        username={currentUser?.username || 'User'}
        projects={projects}
        yearFilter={globalYearFilter}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        activeView={activeView}
        onViewChange={setActiveView}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        counts={counts}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        storeFilter={globalStoreFilter}
        onStoreFilterChange={setGlobalStoreFilter}
        hasSummaryFallbacks={hasSummaryFallbacks}
        onRequestFullHydration={handleRequestFullHydration}
        onOpenCalendarSync={() => setIsCalendarSyncModalOpen(true)}
      />

      {focusTarget && (
        <div className="bg-violet-50/90 dark:bg-violet-950/40 border-b border-violet-200/80 dark:border-violet-800/60 px-4 py-2.5 sm:px-6">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Target className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 truncate">
                <span className="font-bold text-violet-700 dark:text-violet-300">Focused Project & Related Work:</span>{' '}
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-white dark:bg-[#242429] border border-violet-200 dark:border-violet-800/60 text-violet-700 dark:text-violet-300">
                  {focusTarget.projectCode}
                  {focusTarget.projectStore ? ` • ${focusTarget.projectStore}` : ''}
                  {focusTarget.projectYear ? ` • ${focusTarget.projectYear}` : ''}
                </span>{' '}
                {focusTarget.projectName && <span className="font-semibold">{focusTarget.projectName}</span>}
                {focusTarget.taskName && (
                  <span className="text-slate-500 dark:text-slate-400">
                    {' '}— Task: <strong className="text-slate-800 dark:text-white">{focusTarget.taskName}</strong>
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleClearFocusTarget}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-[#242429] hover:bg-violet-100 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60 transition-colors cursor-pointer active:scale-95 shrink-0"
              title="Clear project/task focus and view all personal work"
            >
              <span>Show All My Work</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <MyWorkBriefingBanner stats={briefingStats} statusFilter={statusFilter} onSelectFilter={setStatusFilter} />

      {displayMode === 'kanban' ? (
        <MyWorkKanbanView
          todoItems={kanbanTodo}
          inProgressItems={kanbanInProgress}
          pendingApprovalItems={kanbanPendingApproval}
          doneItems={kanbanDone}
          onAcceptItem={handleAcceptItem}
          onReportSubTaskComplete={handleReportSubTaskComplete}
          onToggleTaskComplete={handleToggleTaskComplete}
          onApproveItem={handleApproveItem}
          onReworkItem={handleReworkItem}
          onMoveItemToColumn={handleMoveItemToColumn}
          onItemClick={handleItemClick}
        />
      ) : (
        <MyWorkStreamView
          activeView={activeView}
          isProjectFocused={Boolean(focusTarget)}
          overdueItems={overdueItems}
          approvalItems={approvalItems}
          todayItems={todayItems}
          weekItems={weekItems}
          monthItems={monthItems}
          doneItems={doneItems}
          onAcceptItem={handleAcceptItem}
          onToggleTaskComplete={handleToggleTaskComplete}
          onReportSubTaskComplete={handleReportSubTaskComplete}
          onApproveItem={handleApproveItem}
          onReworkItem={handleReworkItem}
          onItemClick={handleItemClick}
        />
      )}
    </div>
  );
}
