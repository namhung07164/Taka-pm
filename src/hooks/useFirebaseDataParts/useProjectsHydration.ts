import { useEffect, useRef, useCallback, useState } from 'react';
import { collection, onSnapshot, getDocsFromCache, getDocsFromServer } from 'firebase/firestore';
import { useAppStore } from '../../store/useAppStore';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { db, APP_ID } from '../../lib/firebase';
import { Project, TakaDeltaItem } from '../../types';
import { PRIMARY_ACTIVE_YEARS, SECONDARY_ACTIVE_YEARS } from '../../lib/utils';
import { buildStoreAndYearQuery } from './firebaseQueryHelpers';
import {
  bootstrapLocalStore,
  offloadPersistSnapshot,
  hydrateProjectsFromLocal,
} from '../../lib/backgroundSyncWorker';
import { deleteLocalRecord } from '../../lib/localDb';
import {
  startDeltaSyncService,
  pullAndApplyDeltas,
  applyIncomingDeltas,
} from '../../lib/deltaSyncService';
import { resolveInvalidations } from '../../lib/deltaInvalidateService';
import { getLoadedMarkers, hasMarker, markLoaded } from '../../lib/loadedMarkers';
import {
  isStaleCacheDoc,
  buildProjectTasksLookupIndex,
  reconcileProjectSummaryWithLocalTasks,
  runBackgroundDexieProjectTaskReconciliation,
  buildZombieProjectRemovalsForYear,
} from './projectsHydrationHelpers';

// Delta-first: sau lần tải đầy đủ đầu tiên, hủy onSnapshot lớn, dựa vào Dexie + kênh delta.
// Bật TỪNG CÁI sau khi đã test. Mặc định tắt = hành vi hiện tại.
const DELTA_FIRST = { projects: false, tasks: false, costs: false, delegations: false };

interface UseProjectsHydrationProps {
  querySignature: string | null;
  userRole?: string;
  allowedStores: string[];
}

// Các (người dùng, năm) thuộc nhóm năm phụ đã được nạp trong phiên này: không truy vấn server lặp lại
const secondaryYearsFetched = new Set<string>();

export function useProjectsHydration({
  querySignature,
  userRole,
  allowedStores,
}: UseProjectsHydrationProps) {
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setCloudStatus = useAppStore((state) => state.setCloudStatus);
  const [recoveryTick] = useState(0);

  const projectsPool = useRef<Map<string, () => void>>(new Map());
  const prevSigProjects = useRef<string>('');

  // Atomic batching buffers for Projects and Tasks updates to prevent JS main thread freezing
  const pendingProjectsMap = useRef<Map<string, Project> | null>(null);
  const pendingProjectsChanged = useRef<Map<string, Project>>(new Map());
  const pendingProjectsRemoved = useRef<Set<string>>(new Set());
  const pendingDeletedTaskIds = useRef<Set<string>>(new Set());
  const pendingInvalidatedTaskIds = useRef<Map<string, string>>(new Map()); // taskId -> year
  const projectsBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchProjectsUpdate = useCallback((docChanges: any[], fromCache: boolean = false) => {
    if (!pendingProjectsMap.current) {
      const currentProjects = useAppStore.getState().projects || [];
      const map = new Map<string, Project>();
      currentProjects.forEach((p) => map.set(p.id, p));
      pendingProjectsMap.current = map;
    }

    const storeState = useAppStore.getState();
    const currentTasks = storeState.tasks || [];
    const expandedSet = new Set(
      [...(storeState.expandedProjectIds || []), ...(storeState.searchActiveProjectIds || [])].map(
        String
      )
    );
    const nowMs = Date.now();

    // O(T) Pre-indexing of currentTasks by projectId and projectCode before docChanges.forEach
    // Reduces complexity from O(Delta_P * T) down to O(Delta_P + T)
    const tasksIndex = !fromCache ? buildProjectTasksLookupIndex(currentTasks) : null;

    docChanges.forEach((change) => {
      const id = change.doc.id;
      const rawDocData = change.doc.data();
      const data = { id, ...rawDocData } as Project;
      const isTrueDelete = Boolean(data.isDeleted || change.type === 'removed');

      if (isTrueDelete) {
        pendingProjectsMap.current!.delete(id);
        pendingProjectsChanged.current.delete(id);
        pendingProjectsRemoved.current.add(id);
      } else {
        if (fromCache && isStaleCacheDoc(pendingProjectsMap.current!.get(id), data)) return;
        const existing = pendingProjectsMap.current!.get(id);
        const hasPendingWrites = Boolean(change.doc?.metadata?.hasPendingWrites);

        const resolvedSummaries =
          data.taskSummaries !== undefined ? data.taskSummaries : existing?.taskSummaries || [];
        const resolvedCount =
          Array.isArray(data.taskSummaries) && data.taskSummaries.length > 0
            ? data.taskSummaries.length
            : data.taskCount !== undefined
              ? data.taskCount
              : (existing?.taskCount ?? 0);

        const resolvedData: Project = existing
          ? {
              ...existing,
              ...data,
              taskCount: resolvedCount,
              taskSummaries: resolvedSummaries,
            }
          : {
              ...data,
              taskCount: resolvedCount,
              taskSummaries: resolvedSummaries,
            };

        if (!fromCache && !hasPendingWrites && tasksIndex && Array.isArray(data.taskSummaries)) {
          reconcileProjectSummaryWithLocalTasks({
            id,
            data,
            existing,
            resolvedData,
            tasksIndex,
            expandedSet,
            nowMs,
            pendingDeletedTaskIds: pendingDeletedTaskIds.current,
            pendingInvalidatedTaskIds: pendingInvalidatedTaskIds.current,
          });
        }

        pendingProjectsMap.current!.set(id, resolvedData);
        pendingProjectsChanged.current.set(id, resolvedData);
        pendingProjectsRemoved.current.delete(id);
      }
    });

    if (projectsBatchTimer.current) {
      clearTimeout(projectsBatchTimer.current);
    }

    projectsBatchTimer.current = setTimeout(() => {
      if (pendingProjectsMap.current) {
        const updatedList = Array.from(pendingProjectsMap.current.values());
        updatedList.sort((a, b) => (a.no || 0) - (b.no || 0));
        useAppStore.getState().setProjects(updatedList);

        if (pendingDeletedTaskIds.current.size > 0) {
          const delIdsLower = new Set(
            Array.from(pendingDeletedTaskIds.current).map((tid) => String(tid).trim().toLowerCase())
          );
          const delRawIds = Array.from(pendingDeletedTaskIds.current);
          pendingDeletedTaskIds.current.clear();

          const latestTasks = useAppStore.getState().tasks || [];
          const filteredTasks = latestTasks.filter(
            (t) => !t?.id || !delIdsLower.has(String(t.id).trim().toLowerCase())
          );
          if (filteredTasks.length !== latestTasks.length) {
            useAppStore.getState().setTasks(filteredTasks);
          }
          delRawIds.forEach((tid) => {
            deleteLocalRecord('taka_tasks', tid).catch(() => {});
          });
        }

        if (pendingInvalidatedTaskIds.current.size > 0) {
          const itemsToResolve: TakaDeltaItem[] = [];
          pendingInvalidatedTaskIds.current.forEach((yr, tid) => {
            itemsToResolve.push({
              docId: tid,
              collectionName: 'taka_tasks',
              action: 'update',
              data: {},
              isPatch: true,
              invalidate: true,
              year: yr,
            });
          });
          pendingInvalidatedTaskIds.current.clear();
          resolveInvalidations(itemsToResolve)
            .then((synthetic) => {
              if (synthetic.length > 0) applyIncomingDeltas(synthetic);
            })
            .catch(() => {});
        }

        const changed = Array.from(pendingProjectsChanged.current.values());
        const removed = Array.from(pendingProjectsRemoved.current);
        pendingProjectsChanged.current.clear();
        pendingProjectsRemoved.current.clear();
        if (changed.length > 0) {
          offloadPersistSnapshot('taka_projects', changed);
          if (!fromCache) {
            runBackgroundDexieProjectTaskReconciliation(changed);
          }
        }
        removed.forEach((id) => {
          deleteLocalRecord('taka_projects', id).catch(() => {});
        });
        const setNotifs = useAppStore.getState().setAllProjectsForNotifs;
        if (setNotifs) setNotifs(updatedList);
        pendingProjectsMap.current = null;
      }
    }, 40);
  }, []);

  // Stage 3 & Delta Pipeline Startup
  useEffect(() => {
    bootstrapLocalStore().catch(() => {});

    const stopDeltaSync = startDeltaSyncService();
    return () => {
      stopDeltaSync();
    };
  }, []);

  // Sleep/Wake & Network Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      // Preserve active onSnapshot listeners in projectsPool so Firestore SDK resumes via resumeToken (0 full-collection re-read)
      hydrateProjectsFromLocal(
        useAppStore.getState().globalYearFilter,
        useAppStore.getState().globalStoreFilter
      ).catch(() => {});
    };

    window.addEventListener('taka_sleep_wake_recovery', handleSleepWakeRecovery);
    window.addEventListener('taka_network_recovered', handleSleepWakeRecovery);
    return () => {
      window.removeEventListener('taka_sleep_wake_recovery', handleSleepWakeRecovery);
      window.removeEventListener('taka_network_recovered', handleSleepWakeRecovery);
    };
  }, []);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      projectsPool.current.forEach((u, key) => {
        u();
        usePerformanceStore.getState().unregisterListener(`taka_projects_${key}`);
      });
      projectsPool.current.clear();
      if (projectsBatchTimer.current) clearTimeout(projectsBatchTimer.current);
    };
  }, []);

  // Main Unified Global Delta Sync for Projects
  useEffect(() => {
    if (!querySignature) return;

    if (prevSigProjects.current !== querySignature) {
      projectsPool.current.forEach((u, key) => {
        u();
        usePerformanceStore.getState().unregisterListener(`taka_projects_${key}`);
      });
      projectsPool.current.clear();
      prevSigProjects.current = querySignature;
    }

    const isAllYears = globalYearFilter === 'all' || globalYearFilter === 'ALL';
    const liveTargetYears = isAllYears ? PRIMARY_ACTIVE_YEARS : [globalYearFilter];

    liveTargetYears.forEach(async (year) => {
      if (projectsPool.current.has(year)) {
        hydrateProjectsFromLocal(year, useAppStore.getState().globalStoreFilter).catch(() => {});
        return;
      }
      // Reserve slot synchronously before awaiting IndexedDB to prevent duplicate listener attachment on rapid effect re-runs
      projectsPool.current.set(year, () => {});

      const localCount = await hydrateProjectsFromLocal(
        year,
        useAppStore.getState().globalStoreFilter
      );

      const isClosedOrPastYear = Number(year) < new Date().getFullYear() - 1;
      const hasLocalData =
        localCount > 0 ||
        (useAppStore.getState().projects || []).some((p) => String(p.year) === String(year));

      const deltaManaged =
        (hasLocalData && isClosedOrPastYear) ||
        (DELTA_FIRST.projects &&
          hasLocalData &&
          hasMarker(await getLoadedMarkers(), 'projects_year', year));
      if (deltaManaged) {
        setCloudStatus('online');
        usePerformanceStore
          .getState()
          .trackGetDoc(
            `taka_projects_${year}`,
            true,
            localCount,
            'Dexie Local-First Projects Hydration (0 Read full collection)'
          );
        return;
      }

      const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects');
      const qProjects = buildStoreAndYearQuery(
        colRef,
        'store',
        'year',
        year,
        userRole,
        allowedStores
      );

      const existingUnsub = projectsPool.current.get(year);
      if (existingUnsub) existingUnsub();

      usePerformanceStore.getState().registerListener(`taka_projects_${year}`);
      const unsub = onSnapshot(
        qProjects,
        (snapshot) => {
          usePerformanceStore.getState().trackSnapshot(`taka_projects_${year}`, snapshot);
          const fromCache = snapshot.metadata.fromCache;
          let changesToApply: any[] = snapshot.docChanges();

          if (!fromCache && !snapshot.metadata.hasPendingWrites) {
            const currentProjectsNow = useAppStore.getState().projects || [];
            const zombieRemovals = buildZombieProjectRemovalsForYear(
              snapshot.docs,
              currentProjectsNow,
              year,
              userRole,
              allowedStores
            );
            if (zombieRemovals.length > 0) {
              changesToApply = [...changesToApply, ...zombieRemovals];
            }
          }

          batchProjectsUpdate(changesToApply, fromCache);
          setCloudStatus('online');

          if (!fromCache) {
            markLoaded('projects_year', year).catch(() => {});
          }

          if (DELTA_FIRST.projects && !fromCache) {
            const u = projectsPool.current.get(year);
            projectsPool.current.set(year, () => {});
            u?.();
            usePerformanceStore.getState().unregisterListener(`taka_projects_${year}`);
          }
        },
        (e) => {
          projectsPool.current.delete(year);
          usePerformanceStore.getState().unregisterListener(`taka_projects_${year}`);
          console.error('Projects listener error:', e);
          setCloudStatus('offline');
        }
      );
      projectsPool.current.set(year, unsub);
    });

    if (isAllYears) {
      SECONDARY_ACTIVE_YEARS.forEach(async (year) => {
        if (projectsPool.current.has(year)) return;
        const secKey = `${querySignature}_${year}`;
        if (secondaryYearsFetched.has(secKey)) return;
        secondaryYearsFetched.add(secKey);
        try {
          const localCount = await hydrateProjectsFromLocal(
            year,
            useAppStore.getState().globalStoreFilter
          );
          const markers = await getLoadedMarkers();
          if (localCount > 0 || hasMarker(markers, 'projects_year', year)) {
            return;
          }

          const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects');
          const qProjects = buildStoreAndYearQuery(
            colRef,
            'store',
            'year',
            year,
            userRole,
            allowedStores
          );
          let snapshot;
          let fetchedFromServer = false;
          try {
            snapshot = await getDocsFromCache(qProjects);
            if (snapshot.empty) {
              snapshot = await getDocsFromServer(qProjects);
              fetchedFromServer = true;
            }
          } catch {
            snapshot = await getDocsFromServer(qProjects);
            fetchedFromServer = true;
          }

          if (fetchedFromServer) {
            markLoaded('projects_year', year).catch(() => {});
          }

          if (snapshot && !snapshot.empty) {
            const currentProjects = useAppStore.getState().projects || [];
            const projectMap = new Map<string, Project>();
            currentProjects.forEach((p) => projectMap.set(p.id, p));
            const fetchedDocs: Project[] = [];

            snapshot.forEach((docSnap) => {
              const data = { id: docSnap.id, ...docSnap.data() } as Project;
              if (!data.isDeleted) {
                projectMap.set(docSnap.id, data);
                fetchedDocs.push(data);
              }
            });

            if (fetchedDocs.length > 0) {
              offloadPersistSnapshot('taka_projects', fetchedDocs);
            }

            const updatedList = Array.from(projectMap.values());
            updatedList.sort((a, b) => (a.no || 0) - (b.no || 0));
            useAppStore.getState().setProjects(updatedList);
          }
        } catch {
          secondaryYearsFetched.delete(secKey);
        }
      });
    }
  }, [
    querySignature,
    userRole,
    allowedStores,
    globalYearFilter,
    batchProjectsUpdate,
    setCloudStatus,
    recoveryTick,
  ]);
}
