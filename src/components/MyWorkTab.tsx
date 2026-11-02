import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import {
  hydrateTasksFromLocal,
  hydrateDelegationsFromLocal,
} from '../lib/backgroundSyncWorker';
import { ensureProjectTasksLoaded } from '../lib/taskStateService';
import { safeGetItemSession } from '../lib/storage';
import {
  MyWorkDisplayMode,
  MyWorkFocusTarget,
  MyWorkKanbanColumnId,
  MyWorkTabView,
  UnifiedWorkItem,
} from './MyWorkTabParts/myWorkTypes';
import { useMyWorkData } from './MyWorkTabParts/useMyWorkData';
import {
  mutateDelegationSubTaskUnified,
  mutateTaskStatusUnified,
  resolveRealTaskForWorkItem,
} from './MyWorkTabParts/myWorkMutationService';
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

  useEffect(() => {
    hydrateTasksFromLocal().catch(() => {});
    hydrateDelegationsFromLocal()
      .then((count) => {
        if (!count && !isDelegationsRequested) setIsDelegationsRequested(true);
      })
      .catch(() => {});
  }, [isDelegationsRequested, setIsDelegationsRequested]);

  useEffect(() => {
    if (focusTarget?.projectCode) {
      ensureProjectTasksLoaded(focusTarget.projectCode, {
        projectId: focusTarget.projectId,
        store: focusTarget.projectStore,
        year: focusTarget.projectYear ? Number(focusTarget.projectYear) : undefined,
      }).catch(() => {});
    }
  }, [focusTarget?.projectCode, focusTarget?.projectId, focusTarget?.projectStore, focusTarget?.projectYear]);

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
    sortBy,
    focusTarget,
  });

  const handleToggleTaskComplete = useCallback(
    async (item: UnifiedWorkItem) => {
      if (!item.canEdit) {
        setToast({
          title: 'Permission Denied',
          message: 'You do not have write permission for this item or it belongs to an archived year.',
          type: 'warning',
        });
        return;
      }
      const nextCompleted = !item.isCompleted;
      const todayIso = new Date().toISOString().substring(0, 10);
      await mutateTaskStatusUnified(
        item,
        {
          runningStatus: nextCompleted ? 'Completed' : 'On process',
          ...(nextCompleted && !item.dueDateStr ? { finish: todayIso } : {}),
        },
        {
          title: nextCompleted ? 'Item Completed' : 'Item Reopened',
          message: `"${item.title}" moved to ${nextCompleted ? 'Completed' : 'In Progress'}.`,
          type: 'success',
        }
      );
    },
    [setToast]
  );

  const handleAcceptItem = useCallback(
    async (item: UnifiedWorkItem) => {
      if (!item.canAccept) return;
      const todayStr = new Date().toISOString().substring(0, 10);
      if (item.type === 'delegation_subtask') {
        await mutateDelegationSubTaskUnified(
          item,
          {
            approvalStatus: 'AcceptTask',
            status: 'On process',
            delegationStatus: 'On process',
            startAct: item.rawSubTask?.startAct || todayStr,
            approvedAt: null,
          },
          currentUser.id,
          'Delegation Accepted (50%)',
          `"${item.title}" moved to In Progress.`
        );
      } else {
        await mutateTaskStatusUnified(
          item,
          { runningStatus: 'On process', start: item.startDateStr || todayStr },
          { title: 'Task Started', message: `"${item.title}" moved to In Progress.`, type: 'info' }
        );
      }
    },
    [currentUser?.id]
  );

  // 1-Click PIC Submit for Approval (Pending completed 85%)
  const handleReportSubTaskComplete = useCallback(
    (item: UnifiedWorkItem) => {
      if (!item.canSubmitApproval) return;
      const todayStr = new Date().toISOString().substring(0, 10);
      mutateDelegationSubTaskUnified(
        item,
        {
          status: 'Pending completed',
          delegationStatus: 'Pending completed',
          approvalStatus: 'Requested',
          finishAct: item.rawSubTask?.finishAct || todayStr,
          approvedAt: null,
        },
        currentUser.id,
        'Requested Approval (85%)',
        `"${item.title}" moved to Pending Approval.`
      ).catch((err) => console.error('[MyWorkTab] handleReportSubTaskComplete error:', err));
    },
    [currentUser?.id]
  );

  const handleApproveItem = useCallback(
    async (item: UnifiedWorkItem) => {
      if (!item.canApproveOrReject) {
        setToast({
          title: 'Approver Permission Required',
          message: 'Only the Delegation Creator or Admin can approve this item.',
          type: 'warning',
        });
        return;
      }
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.substring(0, 10);
      if (item.type === 'delegation_subtask') {
        await mutateDelegationSubTaskUnified(
          item,
          { status: 'Approved', delegationStatus: 'Completed', approvalStatus: 'Approved', finishAct: todayStr, approvedAt: nowIso },
          currentUser.id,
          'Approved (100%)',
          `"${item.title}" has been approved and moved to Completed.`
        );
      } else {
        await mutateTaskStatusUnified(
          item,
          { approval: 'Approved', approvedAt: nowIso, runningStatus: 'Completed', finish: item.dueDateStr || todayStr },
          { title: 'Task Approved', message: `"${item.title}" approved and moved to Completed.`, type: 'success' }
        );
      }
    },
    [currentUser?.id, setToast]
  );

  const handleReworkItem = useCallback(
    async (item: UnifiedWorkItem) => {
      if (!item.canApproveOrReject) {
        setToast({
          title: 'Approver Permission Required',
          message: 'Only the Delegation Creator or Admin can return this item for rework.',
          type: 'warning',
        });
        return;
      }
      if (item.type === 'delegation_subtask') {
        await mutateDelegationSubTaskUnified(
          item,
          { status: 'Needs Rework', delegationStatus: 'Needs Rework', approvalStatus: 'ReqReview', approvedAt: null },
          currentUser.id,
          'Returned for Rework (25%)',
          `"${item.title}" marked as Needs Rework.`,
          'warning'
        );
      } else {
        await mutateTaskStatusUnified(
          item,
          { approval: 'Rejected', runningStatus: 'On process' },
          { title: 'Returned for Rework', message: `"${item.title}" returned to PIC for rework.`, type: 'warning' }
        );
      }
    },
    [currentUser?.id, setToast]
  );

  // Kanban Column Drag & Drop Handler (Enforces RBAC & Delegation State Machine)
  const handleMoveItemToColumn = useCallback(
    async (item: UnifiedWorkItem, targetCol: MyWorkKanbanColumnId) => {
      if (item.type === 'delegation_subtask') {
        if (targetCol === 'in_progress' && item.canEdit) {
          await handleAcceptItem({ ...item, canAccept: true });
        } else if (targetCol === 'pending_approval' && item.canEdit) {
          handleReportSubTaskComplete({ ...item, canSubmitApproval: true });
        } else if (targetCol === 'done') {
          if (item.isCreator) {
            await handleApproveItem({ ...item, canApproveOrReject: true });
          } else {
            handleReportSubTaskComplete({ ...item, canSubmitApproval: true });
          }
        } else if (targetCol === 'todo' && item.isCreator) {
          await handleReworkItem({ ...item, canApproveOrReject: true });
        }
      } else if ((item.type === 'task' || item.type === 'project_milestone') && item.canEdit) {
        const todayIso = new Date().toISOString().substring(0, 10);
        if (targetCol === 'done') {
          await mutateTaskStatusUnified(
            item,
            { runningStatus: 'Completed', finish: item.dueDateStr || todayIso },
            { title: 'Item Completed', message: `"${item.title}" moved to Completed.`, type: 'success' }
          );
        } else if (targetCol === 'pending_approval') {
          await mutateTaskStatusUnified(
            item,
            { approval: 'ReqApproval', runningStatus: 'On process' },
            { title: 'Submitted for Approval', message: `"${item.title}" moved to Pending Approval.`, type: 'info' }
          );
        } else if (targetCol === 'in_progress') {
          await mutateTaskStatusUnified(
            item,
            { runningStatus: 'On process' },
            { title: 'Item In Progress', message: `"${item.title}" moved to In Progress.`, type: 'info' }
          );
        } else {
          await mutateTaskStatusUnified(
            item,
            { runningStatus: 'Upcoming' },
            { title: 'Moved to To Do', message: `"${item.title}" moved to To Do.`, type: 'info' }
          );
        }
      }
    },
    [handleAcceptItem, handleApproveItem, handleReportSubTaskComplete, handleReworkItem]
  );

  // Zero-Query Modal Opener with on-demand summary hydration (Rule 8)
  const handleItemClick = useCallback(
    async (item: UnifiedWorkItem, initialTab: 'details' | 'chat' = 'details') => {
      setIsReadOnlyModal(!item.canEdit && !item.canApproveOrReject);
      setModalInitialTab(initialTab);

      const isVirtual =
        Boolean(item.isSummaryFallback) ||
        Boolean((item.rawTask as any)?._isVirtualSummary) ||
        String(item.rawTask?.id || '').startsWith('ts_');

      if (item.rawTask && !isVirtual) {
        setEditingTask(item.rawTask);
        setIsTaskModalOpen(true);
        return;
      }

      if (item.type === 'task') {
        const matched = await resolveRealTaskForWorkItem(item);
        if (matched) {
          setEditingTask(matched);
          setIsTaskModalOpen(true);
          return;
        }
        if (item.rawTask) {
          setEditingTask(item.rawTask);
          setIsTaskModalOpen(true);
          return;
        }
      }

      if (item.rawProject) {
        setEditingProject(item.rawProject);
        setIsProjectModalOpen(true);
      }
    },
    [
      setEditingProject,
      setEditingTask,
      setIsProjectModalOpen,
      setIsReadOnlyModal,
      setIsTaskModalOpen,
      setModalInitialTab,
    ]
  );

  return (
    <div className="flex flex-col flex-grow min-h-[calc(100dvh-130px)] bg-slate-50/60 dark:bg-[#121215] rounded-xl border border-slate-200/80 dark:border-[#333336] overflow-hidden">
      <MyWorkHeader
        username={currentUser?.username || 'User'}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        activeView={activeView}
        onViewChange={setActiveView}
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
                <span className="font-bold text-violet-700 dark:text-violet-300">
                  Focused Project & Related Work:
                </span>{' '}
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-white dark:bg-[#242429] border border-violet-200 dark:border-violet-800/60 text-violet-700 dark:text-violet-300">
                  {focusTarget.projectCode}
                  {focusTarget.projectStore ? ` • ${focusTarget.projectStore}` : ''}
                  {focusTarget.projectYear ? ` • ${focusTarget.projectYear}` : ''}
                </span>{' '}
                {focusTarget.projectName && (
                  <span className="font-semibold">{focusTarget.projectName}</span>
                )}
                {focusTarget.taskName && (
                  <span className="text-slate-500 dark:text-slate-400">
                    {' '}
                    — Task: <strong className="text-slate-800 dark:text-white">{focusTarget.taskName}</strong>
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

      <MyWorkBriefingBanner
        stats={briefingStats}
        statusFilter={statusFilter}
        onSelectFilter={setStatusFilter}
      />

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
