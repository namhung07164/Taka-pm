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
import { checkAndSyncRealtimeSubTaskCompletion } from './TaskDelegationParts/delegationAutoSync';
import { MyWorkFocusTarget, MyWorkTabView, UnifiedWorkItem } from './MyWorkTabParts/myWorkTypes';
import { useMyWorkData } from './MyWorkTabParts/useMyWorkData';
import { MyWorkHeader } from './MyWorkTabParts/MyWorkHeader';
import { MyWorkStreamView } from './MyWorkTabParts/MyWorkStreamView';
import { safeGetItemSession } from '../lib/storage';
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
  const isTasksRequested = useAppStore((state) => state.isTasksRequested);
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

  const [activeView, setActiveView] = useState<MyWorkTabView>('today');
  const [searchQuery, setSearchQuery] = useState('');
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

  // Ensure tasks for the focused project are loaded immediately
  useEffect(() => {
    if (focusTarget?.projectCode) {
      ensureProjectTasksLoaded(focusTarget.projectCode, {
        projectId: focusTarget.projectId,
        store: focusTarget.projectStore,
        year: focusTarget.projectYear ? Number(focusTarget.projectYear) : undefined,
      }).catch(() => {});
    }
  }, [focusTarget?.projectCode, focusTarget?.projectId, focusTarget?.projectStore, focusTarget?.projectYear]);

  const handleClearFocusTarget = useCallback(() => {
    setFocusTarget(null);
    try {
      sessionStorage.removeItem('taka_mywork_focus');
    } catch {
      // ignore
    }
  }, []);

  // Tri-Gate Activation & Instant Local-First Hydration (0ms UI)
  useEffect(() => {
    if (!isTasksRequested) setIsTasksRequested(true);
    if (!isDelegationsRequested) setIsDelegationsRequested(true);
    hydrateTasksFromLocal().catch(() => {});
    hydrateDelegationsFromLocal().catch(() => {});
  }, [isTasksRequested, setIsTasksRequested, isDelegationsRequested, setIsDelegationsRequested]);

  const {
    overdueItems,
    approvalItems,
    todayItems,
    weekItems,
    monthItems,
    doneItems,
    counts,
  } = useMyWorkData({
    projects,
    tasks,
    delegationGroups,
    currentUser,
    searchQuery,
    storeFilter: globalStoreFilter,
    globalYearFilter,
    focusTarget,
  });

  // 1-Click Task Completion Toggle (0ms Optimistic UI via saveTaskStateUnified)
  const handleToggleTaskComplete = useCallback(
    async (item: UnifiedWorkItem) => {
      try {
        let targetTask = item.rawTask;
        if (!targetTask && item.rawProject) {
          const loaded = await ensureProjectTasksLoaded(item.rawProject.code, {
            projectId: item.rawProject.id,
            store: item.rawProject.store,
            year: item.rawProject.year,
          });
          targetTask = loaded.find(
            (t) =>
              String(t.name || '').trim().toLowerCase() ===
              String(item.title || '').trim().toLowerCase()
          );
        }
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
    [setToast]
  );

  // Helper to mutate a DelegationSubTask with 0ms Optimistic UI + Firestore write
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

      const updatedGroup = {
        ...group,
        projectId: group.projectId || item.rawProject?.id,
        projectCode: group.projectCode || item.projectCode,
        projectStore: group.projectStore || item.projectStore || 'HCM',
        projectYear: Number(group.projectYear || item.projectYear || new Date().getFullYear()),
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

      if (group.parentTaskId && item.rawTask) {
        checkAndSyncRealtimeSubTaskCompletion(
          item.rawTask,
          item.rawProject,
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

  // 1-Click PIC Submit for Approval
  const handleReportSubTaskComplete = useCallback(
    (item: UnifiedWorkItem) => {
      const todayStr = new Date().toISOString().substring(0, 10);
      mutateDelegationSubTask(
        item,
        {
          status: 'Pending completed',
          delegationStatus: 'ReqApproval',
          approvalStatus: 'ReqApproval',
          finishAct: item.rawSubTask?.finishAct || todayStr,
        },
        'Submitted for Approval',
        `"${item.title}" sent to approver.`
      );
    },
    [mutateDelegationSubTask]
  );

  // 1-Click Approve (for DelegationSubTask or Task)
  const handleApproveItem = useCallback(
    async (item: UnifiedWorkItem) => {
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.substring(0, 10);

      if (item.type === 'delegation_subtask') {
        await mutateDelegationSubTask(
          item,
          {
            status: 'Approved',
            delegationStatus: 'Completed',
            approvalStatus: 'Approved',
            finishAct: item.rawSubTask?.finishAct || todayStr,
            approvedAt: nowIso,
          },
          'Approved',
          `"${item.title}" has been approved.`
        );
      } else if (item.type === 'task' && item.rawTask) {
        await saveTaskStateUnified([
          {
            id: item.rawTask.id,
            approval: 'Approved',
            approvedAt: nowIso,
            runningStatus: 'Completed',
            finish: item.rawTask.finish || todayStr,
          },
        ]);
        setToast({
          title: 'Task Approved',
          message: `"${item.title}" approved and completed.`,
          type: 'success',
        });
      }
    },
    [mutateDelegationSubTask, setToast]
  );

  // 1-Click Request Rework (for DelegationSubTask or Task)
  const handleReworkItem = useCallback(
    async (item: UnifiedWorkItem) => {
      if (item.type === 'delegation_subtask') {
        await mutateDelegationSubTask(
          item,
          {
            status: 'Needs Rework',
            delegationStatus: 'Needs Rework',
            approvalStatus: 'Needs Rework',
          },
          'Returned for Rework',
          `"${item.title}" marked as Needs Rework.`
        );
      } else if (item.type === 'task' && item.rawTask) {
        await saveTaskStateUnified([
          {
            id: item.rawTask.id,
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
    [mutateDelegationSubTask, setToast]
  );

  // Zero-Query Modal Opener (Rule 8)
  const handleItemClick = useCallback(
    async (item: UnifiedWorkItem, initialTab: 'details' | 'chat' = 'details') => {
      setIsReadOnlyModal(false);
      setModalInitialTab(initialTab);

      if (item.rawTask) {
        setEditingTask(item.rawTask);
        setIsTaskModalOpen(true);
        return;
      }

      if (item.isSummaryFallback && item.rawProject) {
        const loaded = await ensureProjectTasksLoaded(item.rawProject.code, {
          projectId: item.rawProject.id,
          store: item.rawProject.store,
          year: item.rawProject.year,
        });
        const matched = loaded.find(
          (t) =>
            String(t.name || '').trim().toLowerCase() ===
            String(item.title || '').trim().toLowerCase()
        );
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
        activeView={activeView}
        onViewChange={setActiveView}
        counts={counts}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        storeFilter={globalStoreFilter}
        onStoreFilterChange={setGlobalStoreFilter}
        onOpenCalendarSync={() => setIsCalendarSyncModalOpen(true)}
      />

      {focusTarget && (
        <div className="bg-violet-50/90 dark:bg-violet-950/40 border-b border-violet-200/80 dark:border-violet-800/60 px-4 py-2.5 sm:px-6">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
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

      <MyWorkStreamView
        activeView={activeView}
        isProjectFocused={Boolean(focusTarget)}
        overdueItems={overdueItems}
        approvalItems={approvalItems}
        todayItems={todayItems}
        weekItems={weekItems}
        monthItems={monthItems}
        doneItems={doneItems}
        onToggleTaskComplete={handleToggleTaskComplete}
        onReportSubTaskComplete={handleReportSubTaskComplete}
        onApproveItem={handleApproveItem}
        onReworkItem={handleReworkItem}
        onItemClick={handleItemClick}
      />
    </div>
  );
}

export default MyWorkTab;
