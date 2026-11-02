import { doc } from 'firebase/firestore';
import { setDoc, updateDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { useAppStore } from '../../store/useAppStore';
import { Project, Task } from '../../types';
import { upsertLocalRecord } from '../../lib/localDb';
import {
  ensureProjectTasksLoaded,
  saveTaskStateUnified,
} from '../../lib/taskStateService';
import {
  calculateProjectComputedDates,
  getTasksForProject,
  syncProjectDatesToFirestore,
} from '../../lib/projectDatesService';
import { getStatus, getTaskStatus, resolveActualStatus } from '../../lib/utils';
import { checkAndSyncRealtimeSubTaskCompletion } from '../TaskDelegationParts/delegationAutoSync';
import { UnifiedWorkItem } from './myWorkTypes';
import {
  buildKeysFromUnifiedItem,
  persistAccountMyWorkState,
  sanitizeWorkKeyPart,
} from './myWorkAccountSync';

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
 * Resolves a real Task from Zustand / Dexie / Firestore for an item (including virtual summary tasks).
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

  const loaded = await ensureProjectTasksLoaded(projectCode, {
    projectId,
    store: projectStore,
    year: projectYear,
  });

  const rawId = rawTask?.id ? String(rawTask.id).trim() : '';
  const rawSumId = item.rawSummaryId ? String(item.rawSummaryId).trim() : '';
  const rawCode = rawTask?.taskCodePhu ? String(rawTask.taskCodePhu).trim().toLowerCase() : '';
  const titleLower = String(item.title || '').trim().toLowerCase();

  return loaded.find((t) => {
    if (!t || t.isDeleted || String(t.id || '').startsWith('ts_')) return false;
    const tId = String(t.id).trim();
    if (rawId && !rawId.startsWith('ts_') && tId === rawId) return true;
    if (rawSumId && !rawSumId.startsWith('ts_') && tId === rawSumId) return true;
    if (rawCode && t.taskCodePhu && String(t.taskCodePhu).trim().toLowerCase() === rawCode) return true;
    return Boolean(titleLower && String(t.name || '').trim().toLowerCase() === titleLower);
  });
}

/**
 * 0ms Optimistic UI + Account-Synced Persistence for Task & Milestone Status Mutations.
 * Simultaneously updates:
 * 1) currentUser.myWorkStates (synced to `taka_users/{userId}` across iOS & Laptop)
 * 2) project.taskSummaries (in Zustand, Dexie, and Firestore `taka_projects`)
 * 3) state.tasks (in Zustand, Dexie, and Firestore `taka_tasks`)
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

  // 0. 0ms Account-Level Sync (Zustand + localStorage + Firestore `taka_users/{userId}`)
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

  // 1. 0ms Synchronous Optimistic Update on Project.taskSummaries in Zustand
  let matchedProjectInStore: Project | undefined;
  let updatedSummariesForProject: any[] | undefined;

  const currentProjects = state.projects || [];
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
    return {
      ...p,
      taskSummaries: nextSummaries,
      updatedAt: nowIso,
    };
  });

  if (updatedSummariesForProject) {
    useAppStore.getState().setProjects(nextProjects);
  }

  // 2. 0ms Synchronous Optimistic Update on state.tasks if already present in memory
  const rawTask = item.rawTask;
  const existingInTasks =
    rawTask &&
    !String(rawTask.id || '').startsWith('ts_') &&
    (state.tasks || []).find((t) => t.id === rawTask.id);

  if (existingInTasks) {
    const immediateTask: Task = {
      ...existingInTasks,
      projectId: existingInTasks.projectId || projId,
      projectCode: existingInTasks.projectCode || item.projectCode,
      projectStore: existingInTasks.projectStore || item.projectStore || 'HCM',
      projectYear: existingInTasks.projectYear || item.projectYear,
      ...updates,
      updatedAt: nowIso,
    };
    delete (immediateTask as any)._isVirtualSummary;
    useAppStore.getState().optimisticUpdateTasks([immediateTask]);
  }

  // 3. Resolve Real Task & Persist to Dexie + Firestore (via firestoreWrites.ts)
  const realTask = existingInTasks || (await resolveRealTaskForWorkItem(item));

  if (realTask && !String(realTask.id || '').startsWith('ts_')) {
    const realTaskKey = `tid_${sanitizeWorkKeyPart(realTask.id)}`;
    if (!syncKeys.includes(realTaskKey)) {
      persistAccountMyWorkState([realTaskKey], accountStatus).catch(() => {});
    }

    const fullTaskUpdate: Task = {
      ...realTask,
      projectId: realTask.projectId || projId,
      projectCode: realTask.projectCode || item.projectCode,
      projectStore: realTask.projectStore || item.projectStore || 'HCM',
      projectYear: realTask.projectYear || item.projectYear,
      ...updates,
      updatedAt: nowIso,
    };
    delete (fullTaskUpdate as any)._isVirtualSummary;

    await saveTaskStateUnified([fullTaskUpdate]);
    await setDoc(
      doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', fullTaskUpdate.id),
      fullTaskUpdate,
      { merge: true }
    );

    // Guarantee `taka_projects.taskSummaries` is written to Firestore for Summary Mode (0 Read) devices
    const targetProject = matchedProjectInStore || item.rawProject;
    if (targetProject?.id && updatedSummariesForProject) {
      upsertLocalRecord('taka_projects', {
        ...targetProject,
        taskSummaries: updatedSummariesForProject,
        updatedAt: nowIso,
      }).catch(() => {});
      await updateDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', targetProject.id),
        {
          taskSummaries: updatedSummariesForProject,
          updatedAt: nowIso,
        }
      );
    }
    return;
  }

  // 4. Fallback for Summary-Only Projects (where tasks exist only in Project.taskSummaries)
  const targetProject = matchedProjectInStore || item.rawProject;
  if (targetProject?.id && updatedSummariesForProject) {
    const latestProj: Project = {
      ...targetProject,
      taskSummaries: updatedSummariesForProject,
      updatedAt: nowIso,
    };
    const projectTasks = getTasksForProject(latestProj, useAppStore.getState().tasks || []);
    const computedDates = calculateProjectComputedDates(
      latestProj,
      projectTasks,
      useAppStore.getState().delegationGroups || []
    );
    const enrichedProj = { ...latestProj, ...computedDates };
    upsertLocalRecord('taka_projects', enrichedProj).catch(() => {});
    await syncProjectDatesToFirestore(targetProject.id, computedDates);
    await updateDoc(
      doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', targetProject.id),
      {
        taskSummaries: updatedSummariesForProject,
        updatedAt: nowIso,
      }
    );
  }
}

/**
 * 0ms Optimistic UI + Account-Synced Persistence for Delegation SubTask Transitions.
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
  if (!group || !subTask) return;

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

  useAppStore.getState().setToast({
    title: toastTitle,
    message: toastMessage,
    type: toastType,
  });

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
}
