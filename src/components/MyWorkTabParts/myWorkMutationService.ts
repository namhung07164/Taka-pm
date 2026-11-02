import { doc } from 'firebase/firestore';
import { setDoc, writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { useAppStore } from '../../store/useAppStore';
import { Project, Task } from '../../types';
import { getLocalTasksForProjects, upsertLocalRecord } from '../../lib/localDb';
import { syncQueueManager, isPermanentWriteError } from '../../lib/syncQueue';
import {
  calculateProjectComputedDates,
  getTasksForProject,
} from '../../lib/projectDatesService';
import { getStatus, getTaskStatus, isTaskBelongsToProject, resolveActualStatus } from '../../lib/utils';
import { checkAndSyncRealtimeSubTaskCompletion } from '../TaskDelegationParts/delegationAutoSync';
import { UnifiedWorkItem } from './myWorkTypes';
import {
  buildKeysFromUnifiedItem,
  persistAccountMyWorkState,
  sanitizeWorkKeyPart,
} from './myWorkAccountSync';

interface PendingBatchMutation {
  tasksById: Map<string, Task>;
  projectsById: Map<string, Record<string, any>>;
}

const pendingMutationQueue: PendingBatchMutation = {
  tasksById: new Map(),
  projectsById: new Map(),
};
let flushMutationTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Rule 8 & Rule 15: Debounces (400ms) and coalesces Task + Project Summary mutations
 * into a single atomic `writeBatch` (from `firestoreWrites.ts`), with Offline Queue fallback.
 */
function scheduleCoalescedTaskAndProjectFlush(
  taskToWrite?: Task,
  projectId?: string,
  projectPatch?: Record<string, any>
): void {
  if (taskToWrite && taskToWrite.id && !String(taskToWrite.id).startsWith('ts_')) {
    pendingMutationQueue.tasksById.set(taskToWrite.id, taskToWrite);
  }
  if (projectId && projectPatch) {
    const existing = pendingMutationQueue.projectsById.get(projectId) || {};
    pendingMutationQueue.projectsById.set(projectId, { ...existing, ...projectPatch });
  }

  if (flushMutationTimer) clearTimeout(flushMutationTimer);
  flushMutationTimer = setTimeout(() => {
    flushMutationTimer = null;
    void flushCoalescedTaskAndProjectMutations();
  }, 400);
}

async function flushCoalescedTaskAndProjectMutations(): Promise<void> {
  const tasksToFlush = Array.from(pendingMutationQueue.tasksById.values());
  const projectsToFlush = Array.from(pendingMutationQueue.projectsById.entries());
  pendingMutationQueue.tasksById.clear();
  pendingMutationQueue.projectsById.clear();

  if (tasksToFlush.length === 0 && projectsToFlush.length === 0) return;

  try {
    const batch = writeBatch(db);
    for (const t of tasksToFlush) {
      const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
      batch.set(taskRef, t, { merge: true });
    }
    for (const [projId, patch] of projectsToFlush) {
      const projRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', projId);
      batch.update(projRef, patch);
    }
    await batch.commit();
  } catch (err) {
    console.warn('[myWorkMutationService] Batch commit failed, queueing to Offline SyncQueue:', err);
    if (!isPermanentWriteError(err)) {
      const fallbackItems: Array<{
        collectionName: string;
        docId: string;
        action: 'set' | 'update' | 'delete';
        data: any;
      }> = [];
      for (const t of tasksToFlush) {
        fallbackItems.push({
          collectionName: 'taka_tasks',
          docId: t.id,
          action: 'set',
          data: t,
        });
      }
      for (const [projId, patch] of projectsToFlush) {
        fallbackItems.push({
          collectionName: 'taka_projects',
          docId: projId,
          action: 'update',
          data: patch,
        });
      }
      await syncQueueManager.bulkAddToQueue(fallbackItems);
    }
  }
}

/**
 * Matches a task summary entry inside Project.taskSummaries by id, taskCodePhu, or normalized name.
 */
function matchesSummaryEntry(s: any, item: UnifiedWorkItem, idx: number): boolean {
  if (!s) return false;
  const sId = s.id ? String(s.id).trim() : '';
  const rawTaskId = item.rawTask?.id ? String(item.rawTask.id).trim() : '';
  const rawSumId = item.rawSummaryId ? String(item.rawSummaryId).trim() : '';

  if (sId && (sId === rawTaskId || sId === rawSumId)) return true;
  if (rawTaskId && rawTaskId.endsWith(`_${idx}`) && rawTaskId.startsWith('ts_')) return true;

  const sCode = s.taskCodePhu ? String(s.taskCodePhu).trim().toLowerCase() : '';
  const tCode = item.rawTask?.taskCodePhu ? String(item.rawTask.taskCodePhu).trim().toLowerCase() : '';
  if (sCode && tCode && sCode === tCode) return true;

  const sName = s.name ? String(s.name).trim().toLowerCase() : '';
  const iTitle = item.title ? String(item.title).trim().toLowerCase() : '';
  return Boolean(sName && iTitle && sName === iTitle);
}

/**
 * Rule 8 & Rule 14: Zero-Query Local Resolution for a Work Item's underlying Task.
 * Searches Zustand memory first, then local IndexedDB (Dexie) — NEVER triggers Firestore `getDocs`.
 */
export async function resolveRealTaskForWorkItem(item: UnifiedWorkItem): Promise<Task | undefined> {
  const rawTask = item.rawTask;
  const isVirtual =
    !rawTask ||
    Boolean((rawTask as any)._isVirtualSummary) ||
    Boolean(item.isSummaryFallback) ||
    String(rawTask.id || '').startsWith('ts_');

  if (rawTask && !isVirtual) {
    return rawTask;
  }

  const proj = item.rawProject;
  const projectCode = proj?.code || item.projectCode;
  const projectId = proj?.id || item.projectId;
  const projectStore = proj?.store || item.projectStore;
  const projectYear = proj?.year || item.projectYear;

  if (!projectCode && !projectId) return rawTask;

  const rawId = rawTask?.id ? String(rawTask.id).trim() : '';
  const rawSumId = item.rawSummaryId ? String(item.rawSummaryId).trim() : '';
  const rawCode = rawTask?.taskCodePhu ? String(rawTask.taskCodePhu).trim().toLowerCase() : '';
  const titleLower = String(item.title || '').trim().toLowerCase();

  const matchesCandidate = (t: Task): boolean => {
    if (!t || t.isDeleted || String(t.id || '').startsWith('ts_')) return false;
    if (proj && !isTaskBelongsToProject(t, proj)) return false;
    const tId = String(t.id).trim();
    if (rawId && !rawId.startsWith('ts_') && tId === rawId) return true;
    if (rawSumId && !rawSumId.startsWith('ts_') && tId === rawSumId) return true;
    if (rawCode && t.taskCodePhu && String(t.taskCodePhu).trim().toLowerCase() === rawCode) return true;
    return Boolean(titleLower && String(t.name || '').trim().toLowerCase() === titleLower);
  };

  // 1. Check in-memory Zustand store first (0ms)
  const memoryTasks = useAppStore.getState().tasks || [];
  const inMemoryMatch = memoryTasks.find(matchesCandidate);
  if (inMemoryMatch) return inMemoryMatch;

  // 2. Check local IndexedDB (Dexie) only — 0 Firestore Reads!
  const keys = [projectId, projectCode].filter(Boolean) as string[];
  const localCandidates = await getLocalTasksForProjects(keys, projectYear, projectStore);
  return localCandidates.find(matchesCandidate);
}

/**
 * 0ms Optimistic UI + Account-Synced Persistence for Task & Milestone Status Mutations.
 * Simultaneously updates:
 * 1) currentUser.myWorkStates (debounced sync to `taka_users/{userId}` + `taka_deltas`)
 * 2) project.taskSummaries + computedDates (0ms in Zustand/Dexie, 400ms coalesced `writeBatch` to `taka_projects`)
 * 3) state.tasks (0ms in Zustand/Dexie, 400ms coalesced `writeBatch` to `taka_tasks`)
 */
export async function mutateTaskStatusUnified(
  item: UnifiedWorkItem,
  updates: Partial<Task>,
  toastInfo?: { title: string; message: string; type?: 'success' | 'info' | 'warning' }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const state = useAppStore.getState();
  const projId = item.rawProject?.id || item.projectId;
  const projCodeLower = String(item.projectCode || '').trim().toLowerCase();
  const projStoreLower = String(item.projectStore || '').trim().toLowerCase();
  const projYearStr = String(item.projectYear || '').trim();

  const accountStatus =
    updates.runningStatus === 'Completed' || updates.approval === 'Approved'
      ? 'Completed'
      : updates.approval === 'ReqApproval'
      ? 'ReqApproval'
      : updates.approval === 'Rejected'
      ? 'Needs Rework'
      : updates.runningStatus || 'On process';

  // 0. 0ms Account-Level Sync (Zustand + localStorage + debounced `taka_users` & `taka_deltas`)
  const syncKeys = buildKeysFromUnifiedItem(item);
  persistAccountMyWorkState(syncKeys, accountStatus).catch((err) =>
    console.warn('[myWorkMutationService] persistAccountMyWorkState warning:', err)
  );

  if (toastInfo) {
    useAppStore.getState().setToast({
      title: toastInfo.title,
      message: toastInfo.message,
      type: toastInfo.type || 'success',
    });
  }

  if (item.type === 'project_milestone') {
    return;
  }

  // 1. 0ms Synchronous Optimistic Update on state.tasks if already present in memory
  const rawTask = item.rawTask;
  const existingInTasks =
    rawTask &&
    !String(rawTask.id || '').startsWith('ts_') &&
    (state.tasks || []).find((t) => t.id === rawTask.id);

  let updatedRealTask: Task | undefined;
  if (existingInTasks) {
    updatedRealTask = {
      ...existingInTasks,
      projectId: existingInTasks.projectId || projId,
      projectCode: existingInTasks.projectCode || item.projectCode,
      projectStore: existingInTasks.projectStore || item.projectStore || 'HCM',
      projectYear: Number(existingInTasks.projectYear || item.projectYear || new Date().getFullYear()),
      ...updates,
      updatedAt: nowIso,
    };
    delete (updatedRealTask as any)._isVirtualSummary;
    useAppStore.getState().optimisticUpdateTasks([updatedRealTask]);
    upsertLocalRecord('taka_tasks', updatedRealTask).catch(() => {});
  }

  // 2. 0ms Synchronous Optimistic Update on Project.taskSummaries + Computed Rollup Dates in Zustand
  let matchedProjectInStore: Project | undefined;
  let updatedSummariesForProject: any[] | undefined;
  let computedDatesPatch: Partial<Project> = {};

  const latestTasksInMemory = useAppStore.getState().tasks || [];
  const latestDelegationsInMemory = useAppStore.getState().delegationGroups || [];
  const currentProjects = useAppStore.getState().projects || [];

  const nextProjects = currentProjects.map((p) => {
    if (!p || p.isDeleted) return p;
    const isSameProj =
      (projId && p.id && String(p.id).trim() === String(projId).trim()) ||
      (!projId &&
        String(p.code || '').trim().toLowerCase() === projCodeLower &&
        String(p.store || '').trim().toLowerCase() === projStoreLower &&
        String(p.year || '').trim() === projYearStr);

    if (!isSameProj) return p;
    matchedProjectInStore = p;
    if (!Array.isArray(p.taskSummaries) || p.taskSummaries.length === 0) return p;

    let changed = false;
    const nextSummaries = p.taskSummaries.map((s: any, idx: number) => {
      if (!matchesSummaryEntry(s, item, idx)) return s;
      changed = true;
      return {
        ...s,
        ...(updates.runningStatus !== undefined ? { runningStatus: updates.runningStatus } : {}),
        ...(updates.approval !== undefined ? { approval: updates.approval } : {}),
        ...(updates.finish !== undefined ? { finish: updates.finish } : {}),
        ...(updates.start !== undefined ? { start: updates.start } : {}),
      };
    });

    if (!changed) return p;
    updatedSummariesForProject = nextSummaries;
    const draftProj: Project = {
      ...p,
      taskSummaries: nextSummaries,
      updatedAt: nowIso,
    };
    const projectTasks = getTasksForProject(draftProj, latestTasksInMemory);
    computedDatesPatch = calculateProjectComputedDates(
      draftProj,
      projectTasks,
      latestDelegationsInMemory
    );
    const enrichedProj: Project = {
      ...draftProj,
      ...computedDatesPatch,
      updatedAt: nowIso,
    };
    upsertLocalRecord('taka_projects', enrichedProj).catch(() => {});
    return enrichedProj;
  });

  if (updatedSummariesForProject) {
    useAppStore.getState().setProjects(nextProjects);
  }

  // 3. Resolve Real Task from Local Dexie if not already in Zustand memory (0 Firestore Reads)
  const realTask = updatedRealTask || (await resolveRealTaskForWorkItem(item));
  let finalTaskToWrite: Task | undefined = updatedRealTask;

  if (realTask && !String(realTask.id || '').startsWith('ts_') && !updatedRealTask) {
    const realTaskKey = `tid_${sanitizeWorkKeyPart(realTask.id)}`;
    if (!syncKeys.includes(realTaskKey)) {
      persistAccountMyWorkState([realTaskKey], accountStatus).catch(() => {});
    }

    finalTaskToWrite = {
      ...realTask,
      projectId: realTask.projectId || projId,
      projectCode: realTask.projectCode || item.projectCode,
      projectStore: realTask.projectStore || item.projectStore || 'HCM',
      projectYear: Number(realTask.projectYear || item.projectYear || new Date().getFullYear()),
      ...updates,
      updatedAt: nowIso,
    };
    delete (finalTaskToWrite as any)._isVirtualSummary;
    useAppStore.getState().optimisticUpdateTasks([finalTaskToWrite]);
    upsertLocalRecord('taka_tasks', finalTaskToWrite).catch(() => {});
  }

  // 4. Schedule single coalesced 400ms atomic writeBatch to Firestore (Rule 8 & Rule 15)
  const targetProject = matchedProjectInStore || item.rawProject;
  const projectPatch =
    targetProject?.id && updatedSummariesForProject
      ? {
          taskSummaries: updatedSummariesForProject,
          ...computedDatesPatch,
          updatedAt: nowIso,
        }
      : undefined;

  scheduleCoalescedTaskAndProjectFlush(finalTaskToWrite, targetProject?.id, projectPatch);
}

/**
 * 0ms Optimistic UI + Account-Synced Persistence for Delegation SubTask Transitions.
 * Includes Offline SyncQueue protection (Rule 2 & Rule 14).
 */
export async function mutateDelegationSubTaskUnified(
  item: UnifiedWorkItem,
  updates: Record<string, any>,
  currentUserId: string,
  toastTitle: string,
  toastMessage: string,
  toastType: 'success' | 'info' | 'warning' = 'success'
): Promise<void> {
  const group = item.rawDelegationGroup;
  const subTask = item.rawSubTask;
  if (!group || !subTask || !group.id) return;

  const rawNextStatus = String(
    updates.status || updates.delegationStatus || updates.approvalStatus || ''
  ).toLowerCase();
  const delAccountStatus =
    rawNextStatus === 'approved' || rawNextStatus === 'completed'
      ? 'Completed'
      : rawNextStatus === 'pending completed' || rawNextStatus === 'requested'
      ? 'ReqApproval'
      : rawNextStatus === 'needs rework' || rawNextStatus === 'rejected'
      ? 'Needs Rework'
      : 'On process';

  persistAccountMyWorkState(buildKeysFromUnifiedItem(item), delAccountStatus).catch(() => {});

  const nowIso = new Date().toISOString();
  const updatedSubTasks = (group.subTasks || []).map((st) =>
    st.id === subTask.id
      ? {
          ...st,
          ...updates,
          updatedAt: nowIso,
          involvedUsers: Array.from(new Set([...(st.involvedUsers || []), currentUserId])),
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

  // Rule 16.1: Enforce all 4 composite keys on delegation record
  const updatedGroup = {
    ...group,
    projectId: group.projectId || parentProject?.id || item.projectId,
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

  useAppStore.getState().setToast({
    title: toastTitle,
    message: toastMessage,
    type: toastType,
  });

  try {
    await setDoc(
      doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id),
      updatedGroup
    );
  } catch (err) {
    console.warn('[myWorkMutationService] Delegation write failed, queueing to SyncQueue:', err);
    if (!isPermanentWriteError(err)) {
      await syncQueueManager.addToQueue('taka_delegation_groups', group.id, 'set', updatedGroup);
    }
  }

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
}
