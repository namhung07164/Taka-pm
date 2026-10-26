import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAppStore } from '../../store/useAppStore';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { db, APP_ID } from '../../lib/firebase';
import { Project, Task, TakaDeltaItem } from '../../types';
import { buildStoreAndYearQuery } from './firebaseQueryHelpers';
import { hasFreshMarker, markLoaded } from '../../lib/loadedMarkers';
import { markProjectTasksHydrated } from '../../lib/utils';
import { resolveInvalidations } from '../../lib/deltaInvalidateService';
import { applyIncomingDeltas } from '../../lib/deltaSyncService';
import {
  filterCompatibleProjectChanges,
  buildZombieTaskRemovalsForYear,
  buildZombieTaskRemovalsForProject,
} from './tasksHydrationHelpers';

/**
 * Computes a primitive signature of active projects and their summary counts so useTasksHydration
 * reacts immediately when projects load or their taskSummaries count changes, without re-rendering on unrelated edits.
 */
export function computeActiveProjectsSummarySig(
  projects: Project[],
  expandedProjectIds: string[],
  searchActiveProjectIds: string[],
  isTasksRequested: boolean
): string {
  if (!isTasksRequested || !Array.isArray(projects) || projects.length === 0) return '';
  const activeIds = new Set([
    ...(expandedProjectIds || []).map(String),
    ...(searchActiveProjectIds || []).map(String),
  ]);
  if (activeIds.size === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (!p || p.isDeleted) continue;
    const pId = String(p.id || '');
    const pCode = String(p.code || '').trim();
    if ((pId && activeIds.has(pId)) || (pCode && activeIds.has(pCode))) {
      const sLen = Array.isArray(p.taskSummaries) ? p.taskSummaries.length : -1;
      parts.push(`${pId}:${sLen}:${p.taskCount ?? 0}`);
    }
  }
  return parts.join('|');
}

/**
 * Evaluates whether a single project's tasks are already covered by local Dexie/memory and delta sync,
 * or whether a Firestore listener needs to be attached.
 */
export function evaluateProjectTaskHydrationState(params: {
  p: Project;
  projKey: string;
  localProjTasks: Task[];
  markers: Set<string>;
  isYearFresh: boolean;
  isArchivedPastYear: boolean;
  isTargetedExpansion: boolean;
  deltaFirstTasks: boolean;
  tasksPool: Map<string, () => void>;
  knownHydratedProjectCodes: Set<string>;
}): { alreadyActiveInPool: boolean; deltaManaged: boolean; isZeroTaskProject: boolean; coversAllSummaries: boolean } {
  const {
    p,
    projKey,
    localProjTasks,
    markers,
    isYearFresh,
    isArchivedPastYear,
    isTargetedExpansion,
    deltaFirstTasks,
    tasksPool,
    knownHydratedProjectCodes,
  } = params;

  const expectedSummaryCount = Array.isArray(p.taskSummaries)
    ? p.taskSummaries.length
    : p.taskCount || 0;
  const localTaskByIdLower = new Map<string, Task>();
  localProjTasks.forEach((t) => {
    const idL = String(t.id || '').trim().toLowerCase();
    if (idL) localTaskByIdLower.set(idL, t);
  });
  const coversAllSummaries =
    expectedSummaryCount > 0 &&
    localProjTasks.length === expectedSummaryCount &&
    (!Array.isArray(p.taskSummaries) ||
      p.taskSummaries.every((s: any) => {
        const sId = String(s?.id || '').trim().toLowerCase();
        if (!sId || sId.startsWith('ts_')) return true;
        const localT = localTaskByIdLower.get(sId);
        if (!localT) return false;
        return (
          (s.start === undefined || (localT.start || '') === (s.start || '')) &&
          (s.finish === undefined || (localT.finish || '') === (s.finish || '')) &&
          (s.runningStatus === undefined || (localT.runningStatus || '') === (s.runningStatus || ''))
        );
      }));

  const isVerifiedInSession = knownHydratedProjectCodes.has(String(p.id));
  const existingListener = tasksPool.get(projKey);
  const isNoop = Boolean((existingListener as any)?.__isNoop);
  if (
    isNoop &&
    (!coversAllSummaries ||
      expectedSummaryCount !== localProjTasks.length ||
      (localProjTasks.length === 0 && expectedSummaryCount > 0))
  ) {
    tasksPool.delete(projKey);
    knownHydratedProjectCodes.delete(String(p.id));
  }

  if (tasksPool.has(projKey)) {
    return { alreadyActiveInPool: true, deltaManaged: false, isZeroTaskProject: false, coversAllSummaries };
  }

  const isProjMarkerFresh =
    hasFreshMarker(markers, 'tasks_proj', p.id) ||
    hasFreshMarker(markers, 'tasks_proj', p.code) ||
    isYearFresh;

  const hasTaskSummaryArray = Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0;
  const hasLocalProjTasks =
    coversAllSummaries ||
    (!hasTaskSummaryArray &&
      expectedSummaryCount > 0 &&
      ((isVerifiedInSession && localProjTasks.length === expectedSummaryCount) ||
        (isProjMarkerFresh && localProjTasks.length === expectedSummaryCount)));

  const isZeroTaskProject =
    (p.taskCount || 0) === 0 &&
    Array.isArray(p.taskSummaries) &&
    p.taskSummaries.length === 0 &&
    localProjTasks.length === 0;

  const deltaManaged =
    (isZeroTaskProject && (!isTargetedExpansion || isVerifiedInSession || isProjMarkerFresh)) ||
    (hasLocalProjTasks && isArchivedPastYear) ||
    (deltaFirstTasks &&
      (coversAllSummaries ||
        (hasLocalProjTasks && (isProjMarkerFresh || isVerifiedInSession))));

  return { alreadyActiveInPool: false, deltaManaged, isZeroTaskProject, coversAllSummaries };
}

/**
 * Builds Firestore query for a single project's tasks (including linkCodes and case variations).
 */
export function buildProjectCodeTasksQuery(p: Project) {
  const codeSet = new Set<string>();
  if (p.code) {
    const raw = String(p.code).trim();
    if (raw) {
      codeSet.add(raw);
      codeSet.add(raw.toUpperCase());
      codeSet.add(raw.toLowerCase());
    }
  }
  if (p.linkCodes) {
    const extra = String(p.linkCodes)
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    extra.forEach((c) => {
      codeSet.add(c);
      codeSet.add(c.toUpperCase());
      codeSet.add(c.toLowerCase());
    });
  }
  const codeList = Array.from(codeSet);
  const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks');
  if (codeList.length === 0) {
    return query(colRef, where('projectId', '==', String(p.id || '').trim()));
  }
  return codeList.length > 1
    ? query(colRef, where('projectCode', 'in', codeList.slice(0, 10)))
    : query(colRef, where('projectCode', '==', codeList[0]));
}

/**
 * Filters snapshot.docs so only documents compatible with project `p` (matching projectId or store+year) are kept.
 */
export function filterCompatibleServerDocsForProject(snapshotDocs: any[], p: Project): any[] {
  const pIdStr = p.id ? String(p.id).trim() : '';
  const pStoreLower = p.store ? String(p.store).trim().toLowerCase() : '';
  const pYearStr = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';

  return snapshotDocs.filter((docSnap) => {
    const dt: any = docSnap.data();
    if (dt?.isDeleted) return false;
    const dtProjId = dt?.projectId ? String(dt.projectId).trim() : '';
    if (dtProjId && pIdStr) {
      return dtProjId === pIdStr;
    }
    if (dt && dt.projectStore && pStoreLower) {
      if (String(dt.projectStore).trim().toLowerCase() !== pStoreLower) return false;
    }
    const dy = dt?.projectYear;
    if (dy !== undefined && dy !== null && dy !== '' && pYearStr) {
      if (String(dy).trim() !== pYearStr) return false;
    }
    return true;
  });
}

/**
 * Attaches a consolidated year-level Firestore listener for tasks.
 */
export function attachYearTasksListener(params: {
  year: string;
  yearKey: string;
  projectsInYear?: Project[];
  userRole?: string;
  allowedStores: string[];
  deltaFirstTasks: boolean;
  tasksPool: Map<string, () => void>;
  knownHydratedProjectCodes?: Set<string>;
  getCurrentPendingOrStoreTasks: () => Task[];
  batchTasksUpdate: (docChanges: any[], fromCache: boolean) => void;
  setIsTasksLoading: (loading: boolean) => void;
  setCloudStatus: (status: 'online' | 'offline' | 'syncing') => void;
}): void {
  const {
    year,
    yearKey,
    projectsInYear,
    userRole,
    allowedStores,
    deltaFirstTasks,
    tasksPool,
    knownHydratedProjectCodes,
    getCurrentPendingOrStoreTasks,
    batchTasksUpdate,
    setIsTasksLoading,
    setCloudStatus,
  } = params;

  const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks');
  const qTasks = buildStoreAndYearQuery(
    colRef,
    'projectStore',
    'projectYear',
    year,
    userRole,
    allowedStores
  );

  usePerformanceStore.getState().registerListener(`taka_tasks_${yearKey}`);
  const unsub = onSnapshot(
    qTasks,
    (snapshot) => {
      usePerformanceStore.getState().trackSnapshot(`taka_tasks_${yearKey}`, snapshot);
      setIsTasksLoading(false);
      const fromCache = snapshot.metadata.fromCache;
      let changesToApply: any[] = snapshot.docChanges();
      if (!fromCache && !snapshot.metadata.hasPendingWrites) {
        const currentTasksNow = getCurrentPendingOrStoreTasks();
        const zombieRemovals = buildZombieTaskRemovalsForYear(
          snapshot.docs,
          currentTasksNow,
          year,
          userRole,
          allowedStores
        );
        if (zombieRemovals.length > 0) {
          changesToApply = [...changesToApply, ...zombieRemovals];
        }
      }
      if (!fromCache && Array.isArray(projectsInYear)) {
        projectsInYear.forEach((p) => {
          if (p?.id) {
            knownHydratedProjectCodes?.add(String(p.id));
            markProjectTasksHydrated(p.id);
          }
        });
      }
      batchTasksUpdate(changesToApply, fromCache);
      setCloudStatus('online');

      if (deltaFirstTasks && !fromCache) {
        markLoaded('tasks_year', year).catch(() => {});
        if (Array.isArray(projectsInYear)) {
          projectsInYear.forEach((p) => {
            if (p?.id) {
              markLoaded('tasks_proj', p.id).catch(() => {});
            }
          });
        }
        const u = tasksPool.get(yearKey);
        const noop = () => {};
        (noop as any).__isNoop = true;
        tasksPool.set(yearKey, noop);
        u?.();
        usePerformanceStore.getState().unregisterListener(`taka_tasks_${yearKey}`);
      }
    },
    (e) => {
      setIsTasksLoading(false);
      console.error('Tasks consolidated listener error:', e);
      tasksPool.delete(yearKey);
      usePerformanceStore.getState().unregisterListener(`taka_tasks_${yearKey}`);
      setCloudStatus('offline');
    }
  );
  tasksPool.set(yearKey, unsub);
}

/**
 * Attaches a project-level Firestore listener for tasks.
 */
export function attachProjectTasksListener(params: {
  p: Project;
  projKey: string;
  deltaFirstTasks: boolean;
  tasksPool: Map<string, () => void>;
  knownHydratedProjectCodes: Set<string>;
  getCurrentPendingOrStoreTasks: () => Task[];
  batchTasksUpdate: (docChanges: any[], fromCache: boolean) => void;
  setIsTasksLoading: (loading: boolean) => void;
  setCloudStatus: (status: 'online' | 'offline' | 'syncing') => void;
}): void {
  const {
    p,
    projKey,
    deltaFirstTasks,
    tasksPool,
    knownHydratedProjectCodes,
    getCurrentPendingOrStoreTasks,
    batchTasksUpdate,
    setIsTasksLoading,
    setCloudStatus,
  } = params;

  const qTasks = buildProjectCodeTasksQuery(p);

  usePerformanceStore.getState().registerListener(`taka_tasks_${projKey}`);
  const unsub = onSnapshot(
    qTasks,
    (snapshot) => {
      usePerformanceStore.getState().trackSnapshot(`taka_tasks_${projKey}`, snapshot);
      setIsTasksLoading(false);
      const fromCache = snapshot.metadata.fromCache;
      const latestProj =
        (useAppStore.getState().projects || []).find((proj) => proj.id === p.id) || p;
      const expectedCount = Array.isArray(latestProj.taskSummaries)
        ? latestProj.taskSummaries.length
        : latestProj.taskCount || 0;
      if (!fromCache || snapshot.docs.length >= expectedCount) {
        knownHydratedProjectCodes.add(String(p.id));
        markProjectTasksHydrated(p.id);
      }

      let compatibleChanges = filterCompatibleProjectChanges(snapshot.docChanges(), latestProj);

      if (!fromCache && !snapshot.metadata.hasPendingWrites) {
        const currentTasksNow = getCurrentPendingOrStoreTasks();
        const compatibleServerDocs = filterCompatibleServerDocsForProject(
          snapshot.docs,
          latestProj
        );
        const zombieRemovals = buildZombieTaskRemovalsForProject(
          compatibleServerDocs,
          currentTasksNow,
          latestProj
        );
        if (zombieRemovals.length > 0) {
          compatibleChanges = [...compatibleChanges, ...zombieRemovals];
        }
      }

      batchTasksUpdate(compatibleChanges, fromCache);
      setCloudStatus('online');

      if (deltaFirstTasks && !fromCache) {
        markLoaded('tasks_proj', p.id).catch(() => {});
        const u = tasksPool.get(projKey);
        const noop = () => {};
        (noop as any).__isNoop = true;
        tasksPool.set(projKey, noop);
        u?.();
        usePerformanceStore.getState().unregisterListener(`taka_tasks_${projKey}`);
      }
    },
    (e) => {
      setIsTasksLoading(false);
      console.error('Tasks listener error:', e);
      tasksPool.delete(projKey);
      usePerformanceStore.getState().unregisterListener(`taka_tasks_${projKey}`);
      setCloudStatus('offline');
    }
  );
  tasksPool.set(projKey, unsub);
}
