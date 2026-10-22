import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAppStore } from '../../store/useAppStore';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { db, APP_ID } from '../../lib/firebase';
import { Project, Task } from '../../types';
import { buildStoreAndYearQuery } from './firebaseQueryHelpers';
import { markLoaded } from '../../lib/loadedMarkers';
import {
  filterCompatibleProjectChanges,
  buildZombieTaskRemovalsForYear,
  buildZombieTaskRemovalsForProject,
} from './tasksHydrationHelpers';

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
      batchTasksUpdate(changesToApply, fromCache);
      setCloudStatus('online');

      if (deltaFirstTasks && !fromCache) {
        markLoaded('tasks_year', year).catch(() => {});
        if (Array.isArray(projectsInYear)) {
          projectsInYear.forEach((p) => {
            if (p?.id) {
              knownHydratedProjectCodes?.add(String(p.id));
              markLoaded('tasks_proj', p.id).catch(() => {});
            }
          });
        }
        const u = tasksPool.get(yearKey);
        tasksPool.set(yearKey, () => {});
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
      knownHydratedProjectCodes.add(String(p.id));
      usePerformanceStore.getState().trackSnapshot(`taka_tasks_${projKey}`, snapshot);
      setIsTasksLoading(false);
      const fromCache = snapshot.metadata.fromCache;

      let compatibleChanges = filterCompatibleProjectChanges(snapshot.docChanges(), p);

      if (!fromCache && !snapshot.metadata.hasPendingWrites) {
        const currentTasksNow = getCurrentPendingOrStoreTasks();
        const compatibleServerDocs = filterCompatibleServerDocsForProject(snapshot.docs, p);
        const zombieRemovals = buildZombieTaskRemovalsForProject(
          compatibleServerDocs,
          currentTasksNow,
          p
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
        tasksPool.set(projKey, () => {});
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
