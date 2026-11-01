import React, { useCallback, useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { setDoc } from '../lib/firestoreWrites';
import { db, APP_ID } from '../lib/firebase';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import {
  hydrateTasksFromLocal,
  hydrateDelegationsFromLocal,
} from '../lib/backgroundSyncWorker';
import { upsertLocalRecord } from '../lib/localDb';
import {
  saveTaskStateUnified,
  ensureProjectTasksLoaded,
} from '../lib/taskStateService';
import { getStatus, getTaskStatus, resolveActualStatus } from '../lib/utils';
import { safeGetItemSession } from '../lib/storage';
import { checkAndSyncRealtimeSubTaskCompletion } from './TaskDelegationParts/delegationAutoSync';
import {
  MyWorkDisplayMode,
  MyWorkFocusTarget,
  MyWorkKanbanColumnId,
  MyWorkTabView,
  UnifiedWorkItem,
} from './MyWorkTabParts/myWorkTypes';
import { useMyWorkData } from './MyWorkTabParts/useMyWorkData';
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

  const currentUser = useAppStore((state) => state.currentUser)!;
  const permissionMatrix = useAppStore((state) => state.permissionMatrix);
  const setIsTasksRequested = useAppStore((state) => state.setIsTasksRequested);
  const isDelegationsRequested = useAppStore((state) => state.isDelegationsRequested);
  const setIsDelegationsRequested = useAppStore((state) => state.setIsDelegationsRequested);
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore((state) => state.setGlobalStoreFilter);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setIsCalendarSyncModalOpen = useAppStore((state) => state.setIsCalendarSyncModalOpen);
  const setEditingTask = useAppStore((state) => state.setEditingTask);
  const setEditingProject = useAppStore((state) => state.setEditingProject);
  const setIsTaskModalOpen = useAppStore((state) => state.setIsTaskModalOpen);
  const setIsProjectModalOpen = useAppStore((state) => state.setIsProjectModalOpen);
  const setModalInitialTab = useAppStore((state) => state.setModalInitialTab);
  const setIsReadOnlyModal = useAppStore((state) => state.setIsReadOnlyModal);
  const setToast = useAppStore((state) => state.setToast);

  const [displayMode, setDisplayMode] = useState<MyWorkDisplayMode>('kanban');
  const [activeView, setActiveView] = useState<MyWorkTabView>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'urgency' | 'due_asc' | 'project' | 'priority'>('urgency');
  const [focusTarget, setFocusTarget] = useState<MyWorkFocusTarget | null>(readInitialFocusTarget);

  // Listen to Quick Navigator focus updates even while already on MyWorkTab
  useEffect(() => {
    const handleFocusChanged = (e: Event) => {
      const custom = e as CustomEvent<MyWorkFocusTarget | null>;
      setFocusTarget(custom.detail || null);
      if (custom.detail) {
        setActiveView('today');
      }
    };
    window.addEventListener('taka-mywork-focus-changed', handleFocusChanged);
    return () => window.removeEventListener('taka-mywork-focus-changed', handleFocusChanged);
  }, []);

  // Summary-First & Local Dexie Priority (0 Firestore Read on Boot - Rule 3 & Rule 14)
  useEffect(() => {
    hydrateTasksFromLocal().catch(() => {});
    hydrateDelegationsFromLocal()
      .then((hydratedCount) => {
        if (!hydratedCount && !isDelegationsRequested) {
          setIsDelegationsRequested(true);
        }
      })
      .catch(() => {});
  }, [isDelegationsRequested, setIsDelegationsRequested]);

  // On-demand targeted hydration ONLY when focused on a specific project from Quick Navigator
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

  // Helper to resolve a summary fallback task on-demand before mutating
  const resolveRealTaskOnDemand = useCallback(async (item: UnifiedWorkItem) => {
    if (item.rawTask) return item.rawTask;
    if (item.rawProject) {
      const loaded = await ensureProjectTasksLoaded(item.rawProject.code, {
        projectId: item.rawProject.id,
        store: item.rawProject.store,
        year: item.rawProject.year,
      });
      return loaded.find(
        (t) =>
          String(t.name || '').trim().toLowerCase() ===
          String(item.title || '').trim().toLowerCase()
      );
    }
    return undefined;
  }, []);

  // 1-Click Task Completion Toggle (0ms Optimistic UI via saveTaskStateUnified)
  const handleToggleTaskComplete = useCallback(
    async (item: UnifiedWorkItem) => {
      if (!item.canEdit) {
        setToast({
          title: 'Permission Denied',
          message: 'You do not have write permission for this task or it belongs to an archived year.',
          type: 'warning',
        });
        return;
      }
      try {
        const targetTask = await resolveRealTaskOnDemand(item);
        if (!targetTask) return;

        const nextCompleted = !item.isCompleted;
        const todayIso = new Date().toISOString().substring(0, 10);
        await saveTaskStateUnified([
          {
            id: targetTask.id,
            runningStatus: nextCompleted ? 'Completed' : 'On process',
            finish: nextCompleted ? targetTask.finish || todayIso : targetTask.finish,
          },
        ]);

        setToast({
          title: nextCompleted ? 'Task Completed' : 'Task Reopened',
          message: `"${item.title}" marked as ${nextCompleted ? 'Completed' : 'On process'}.`,
          type: 'success',
        });
      } catch (err) {
        console.error('[MyWorkTab] handleToggleTaskComplete error:', err);
      }
    },
    [resolveRealTaskOnDemand, setToast]
  );

  // Helper to mutate a DelegationSubTask with strict RBAC, plStatus/actStatus sync & 0ms Optimistic UI
  const mutateDelegationSubTask = useCallback(
    async (
      item: UnifiedWorkItem,
      updates: Record<string, any>,
      toastTitle: string,
      toastMessage: string
    ) => {
      const group = item.rawDelegationGroup;
      const subTask = item.rawSubTask;
      if (!group || !subTask) return;

      const nowIso = new Date().toISOString();
      const updatedSubTasks = (group.subTasks || []).map((st) =>
        st.id === subTask.id
          ? {
              ...st,
              ...updates,
              updatedAt: nowIso,
              involvedUsers: Array.from(
                new Set([...(st.involvedUsers || []), currentUser.id])
              ),
            }
          : st
      );

      const parentTask = item.rawTask;
      const parentProject = item.rawProject;
      let computedPlStatus = 'Upcoming';
      if (parentTask) {
        computedPlStatus = getTaskStatus(parentTask.start, parentTask.finish);
      } else if (parentProject) {
        computedPlStatus = getStatus(
          parentProject.computedTakStart || parentProject.start,
          parentProject.computedTakCompl,
          parentProject.computedOpening || parentProject.opening,
          parentProject.code
        );
      }
      const computedActStatus = resolveActualStatus(computedPlStatus, updatedSubTasks).label;

      const updatedGroup = {
        ...group,
        projectId: group.projectId || parentProject?.id,
        projectCode: group.projectCode || item.projectCode,
        projectStore: group.projectStore || item.projectStore || 'HCM',
        projectYear: Number(group.projectYear || item.projectYear || new Date().getFullYear()),
        plStatus: computedPlStatus,
        actStatus: computedActStatus,
        subTasks: updatedSubTasks,
        updatedAt: nowIso,
      };

      // 0ms Optimistic Update in Zustand + Dexie
      const allGroups = useAppStore.getState().delegationGroups || [];
      useAppStore
        .getState()
        .setDelegationGroups(allGroups.map((g) => (g.id === group.id ? updatedGroup : g)));
      upsertLocalRecord('taka_delegations', updatedGroup).catch(() => {});

      // Persist via firestoreWrites wrapper (Rule 15 & 16.5)
      await setDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id),
        updatedGroup
      );

      if (group.parentTaskId && parentTask) {
        checkAndSyncRealtimeSubTaskCompletion(
          parentTask,
          parentProject,
          group.subTasks,
          updatedSubTasks,
          useAppStore.getState().tasks || [],
          useAppStore.getState().projects || []
        );
      }

      setToast({
        title: toastTitle,
        message: toastMessage,
        type: 'success',
      });
    },
    [currentUser?.id, setToast]
  );

  // 1-Click Accept Task / Delegation (Assigned 0% -> On process 50%)
  const handleAcceptItem = useCallback(
    async (item: UnifiedWorkItem) => {
      if (!item.canAccept) return;
      const todayStr = new Date().toISOString().substring(0, 10);
      if (item.type === 'delegation_subtask') {
        await mutateDelegationSubTask(
          item,
          {
            approvalStatus: 'AcceptTask',
            status: 'On process',
            delegationStatus: 'On process',
            startAct: item.rawSubTask?.startAct || todayStr,
            approvedAt: null,
          },
          'Delegation Accepted (50%)',
          `"${item.title}" is now On Process.`
        );
      } else if (item.type === 'task') {
        const targetTask = await resolveRealTaskOnDemand(item);
        if (!targetTask) return;
        await saveTaskStateUnified([
          {
            id: targetTask.id,
            runningStatus: 'On process',
            start: targetTask.start || todayStr,
          },
        ]);
      }
    },
    [mutateDelegationSubTask, resolveRealTaskOnDemand]
  );

  // 1-Click PIC Submit for Approval (Pending completed 85%)
  const handleReportSubTaskComplete = useCallback(
    (item: UnifiedWorkItem) => {
      if (!item.canSubmitApproval) return;
      const todayStr = new Date().toISOString().substring(0, 10);
      mutateDelegationSubTask(
        item,
        {
          status: 'Pending completed',
          delegationStatus: 'Pending completed',
          approvalStatus: 'Requested',
          finishAct: item.rawSubTask?.finishAct || todayStr,
          approvedAt: null,
        },
        'Requested Approval (85%)',
        `"${item.title}" submitted to creator/approver.`
      );
    },
    [mutateDelegationSubTask]
  );

  // 1-Click Approve (Strictly gated to Creator / Admin)
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
        await mutateDelegationSubTask(
          item,
          {
            status: 'Approved',
            delegationStatus: 'Completed',
            approvalStatus: 'Approved',
            finishAct: todayStr,
            approvedAt: nowIso,
          },
          'Approved (100%)',
          `"${item.title}" has been approved and completed.`
        );
      } else if (item.type === 'task') {
        const targetTask = await resolveRealTaskOnDemand(item);
        if (!targetTask) return;
        await saveTaskStateUnified([
          {
            id: targetTask.id,
            approval: 'Approved',
            approvedAt: nowIso,
            runningStatus: 'Completed',
            finish: targetTask.finish || todayStr,
          },
        ]);
        setToast({
          title: 'Task Approved',
          message: `"${item.title}" approved and completed.`,
          type: 'success',
        });
      }
    },
    [mutateDelegationSubTask, resolveRealTaskOnDemand, setToast]
  );

  // 1-Click Request Rework (Strictly gated to Creator / Admin)
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
        await mutateDelegationSubTask(
          item,
          {
            status: 'Needs Rework',
            delegationStatus: 'Needs Rework',
            approvalStatus: 'ReqReview',
            approvedAt: null,
          },
          'Returned for Rework (25%)',
          `"${item.title}" marked as Needs Rework.`
        );
      } else if (item.type === 'task') {
        const targetTask = await resolveRealTaskOnDemand(item);
        if (!targetTask) return;
        await saveTaskStateUnified([
          {
            id: targetTask.id,
            approval: 'Rejected',
            runningStatus: 'On process',
          },
        ]);
        setToast({
          title: 'Returned for Rework',
          message: `"${item.title}" returned to PIC for rework.`,
          type: 'warning',
        });
      }
    },
    [mutateDelegationSubTask, resolveRealTaskOnDemand, setToast]
  );

  // Kanban Column Drag & Drop Handler (Enforces RBAC & Delegation State Machine)
  const handleMoveItemToColumn = useCallback(
    async (item: UnifiedWorkItem, targetCol: MyWorkKanbanColumnId) => {
      if (item.type === 'project_milestone') return;
      if (item.type === 'delegation_subtask') {
        if (targetCol === 'in_progress' && item.canEdit) {
          await handleAcceptItem({ ...item, canAccept: true });
        } else if (targetCol === 'pending_approval' && item.canEdit) {
          handleReportSubTaskComplete({ ...item, canSubmitApproval: true });
        } else if (targetCol === 'done') {
          if (item.isCreator) {
            await handleApproveItem({ ...item, canApproveOrReject: true });
          } else {
            // If PIC drags to Done, submit for approval instead of self-approving!
            handleReportSubTaskComplete({ ...item, canSubmitApproval: true });
          }
        } else if (targetCol === 'todo' && item.isCreator) {
          await handleReworkItem({ ...item, canApproveOrReject: true });
        }
      } else if (item.type === 'task' && item.canEdit) {
        const targetTask = await resolveRealTaskOnDemand(item);
        if (!targetTask) return;
        const todayIso = new Date().toISOString().substring(0, 10);
        if (targetCol === 'done') {
          await saveTaskStateUnified([
            { id: targetTask.id, runningStatus: 'Completed', finish: targetTask.finish || todayIso },
          ]);
        } else if (targetCol === 'pending_approval') {
          await saveTaskStateUnified([
            { id: targetTask.id, approval: 'ReqApproval', runningStatus: 'On process' },
          ]);
        } else if (targetCol === 'in_progress') {
          await saveTaskStateUnified([{ id: targetTask.id, runningStatus: 'On process' }]);
        } else {
          await saveTaskStateUnified([{ id: targetTask.id, runningStatus: 'Upcoming' }]);
        }
      }
    },
    [
      handleAcceptItem,
      handleApproveItem,
      handleReportSubTaskComplete,
      handleReworkItem,
      resolveRealTaskOnDemand,
    ]
  );

  // Zero-Query Modal Opener with on-demand summary hydration (Rule 8)
  const handleItemClick = useCallback(
    async (item: UnifiedWorkItem, initialTab: 'details' | 'chat' = 'details') => {
      setIsReadOnlyModal(!item.canEdit && !item.canApproveOrReject);
      setModalInitialTab(initialTab);

      if (item.rawTask) {
        setEditingTask(item.rawTask);
        setIsTaskModalOpen(true);
        return;
      }

      if (item.isSummaryFallback && item.rawProject) {
        const matched = await resolveRealTaskOnDemand(item);
        if (matched) {
          setEditingTask(matched);
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
      resolveRealTaskOnDemand,
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

      {/* Top Briefing Banner (4 Interactive Summary Cards inspired by Image 2) */}
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
