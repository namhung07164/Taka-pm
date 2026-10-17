import { useEffect, useRef, useCallback } from "react";
import { collection, onSnapshot, getDocsFromCache, getDocsFromServer } from "firebase/firestore";
import { useAppStore } from "../../store/useAppStore";
import { usePerformanceStore } from "../../store/usePerformanceStore";
import { db, APP_ID } from "../../lib/firebase";
import { Project } from "../../types";
import { PRIMARY_ACTIVE_YEARS, SECONDARY_ACTIVE_YEARS } from "../../lib/utils";
import { buildStoreAndYearQuery } from "./firebaseQueryHelpers";
import {
  bootstrapLocalStore,
  offloadPersistSnapshot,
  hydrateProjectsFromLocal,
} from "../../lib/backgroundSyncWorker";
import { deleteLocalRecord } from "../../lib/localDb";
import {
  fetchYearsMeta,
  setMemoryYearsMeta,
  isYearCacheValid,
  loadYearDataFromLocal,
  YearsMetaMap,
} from "../../lib/yearsFingerprintService";
import { startDeltaSyncService, pullAndApplyDeltas } from "../../lib/deltaSyncService";
import { getLoadedMarkers, hasMarker, markLoaded } from "../../lib/loadedMarkers";
import { markTasksDeleted } from "../../lib/taskDeletedTracker";
import { isTaskBelongsToProject } from "../../lib/taskStateService";

// Delta-first: sau lần tải đầy đủ đầu tiên, hủy onSnapshot lớn, dựa vào Dexie + kênh delta.
// Bật TỪNG CÁI sau khi đã test. Mặc định tắt = hành vi hiện tại.
const DELTA_FIRST = { projects: false, tasks: false, costs: false, delegations: false };


interface UseProjectsHydrationProps {
  querySignature: string | null;
  userRole?: string;
  allowedStores: string[];
}

// Chuyển updatedAt (ISO string / Firestore Timestamp / number) về ms
const tsOf = (v: any): number => {
  if (!v) return 0;
  const n =
    typeof v === "string" ? Date.parse(v)
    : typeof v?.toMillis === "function" ? v.toMillis()
    : Number(v);
  return Number.isFinite(n) ? n : 0;
};
// Snapshot lấy từ cache cục bộ có thể cũ hơn dữ liệu đã nhận qua delta -> không cho ghi đè.
// Chỉ áp dụng cho snapshot fromCache; snapshot từ server luôn được tin (tránh lệch đồng hồ)
const isStaleCacheDoc = (existing: any, incoming: any): boolean => {
  if (!existing) return false;
  const e = tsOf(existing.updatedAt);
  const i = tsOf(incoming?.updatedAt);
  return e > 0 && i > 0 && i < e;
};

// Các (người dùng, bộ lọc store, năm) thuộc nhóm năm phụ đã được nạp trong phiên này: không truy vấn server lặp lại
const secondaryYearsFetched = new Set<string>();

export function useProjectsHydration({
  querySignature,
  userRole,
  allowedStores,
}: UseProjectsHydrationProps) {
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);
  const setCloudStatus = useAppStore((state) => state.setCloudStatus);

  const projectsPool = useRef<Map<string, () => void>>(new Map());
  const prevSigProjects = useRef<string>("");
  const remoteYearsMetaRef = useRef<YearsMetaMap>({});

  // Atomic batching buffers for Projects and Tasks updates to prevent JS main thread freezing
  const pendingProjectsMap = useRef<Map<string, Project> | null>(null);
  const pendingProjectsChanged = useRef<Map<string, Project>>(new Map());
  const pendingProjectsRemoved = useRef<Set<string>>(new Set());
  const pendingDeletedTaskIds = useRef<Set<string>>(new Set());
  const projectsBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchProjectsUpdate = useCallback((docChanges: any[], fromCache: boolean = false) => {
    if (!pendingProjectsMap.current) {
      const currentProjects = useAppStore.getState().projects || [];
      const map = new Map<string, Project>();
      currentProjects.forEach(p => map.set(p.id, p));
      pendingProjectsMap.current = map;
    }

    docChanges.forEach((change) => {
      const id = change.doc.id;
      const rawDocData = change.doc.data();
      const data = { id, ...rawDocData } as Project;
      const isTrueDelete = Boolean(data.isDeleted || change.type === "removed");

      if (isTrueDelete) {
        pendingProjectsMap.current!.delete(id);
        pendingProjectsChanged.current.delete(id);
        pendingProjectsRemoved.current.add(id);
      } else {
        if (fromCache && isStaleCacheDoc(pendingProjectsMap.current!.get(id), data)) return;
        const existing = pendingProjectsMap.current!.get(id);
        const resolvedData = existing ? {
          ...data,
          taskCount: data.taskCount !== undefined ? data.taskCount : (existing.taskCount ?? 0),
          taskSummaries: data.taskSummaries !== undefined ? data.taskSummaries : (existing.taskSummaries || []),
        } : data;

        // If this is a live server update and taskSummaries has shrunk compared to existing project state
        // (a task was deleted on another device), immediately detect the removed task IDs and purge them!
        if (
          !fromCache &&
          existing &&
          Array.isArray(existing.taskSummaries) &&
          Array.isArray(data.taskSummaries) &&
          data.taskSummaries.length < existing.taskSummaries.length
        ) {
          const incomingIds = new Set(
            data.taskSummaries
              .map((s: any) => (s?.id ? String(s.id).trim().toLowerCase() : ""))
              .filter(Boolean)
          );
          existing.taskSummaries.forEach((oldS: any) => {
            const oldId = oldS?.id ? String(oldS.id).trim() : "";
            if (oldId && !incomingIds.has(oldId.toLowerCase())) {
              markTasksDeleted([oldId], id);
              pendingDeletedTaskIds.current.add(oldId);
            }
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

          const currentTasks = useAppStore.getState().tasks || [];
          const filteredTasks = currentTasks.filter(
            (t) => !t?.id || !delIdsLower.has(String(t.id).trim().toLowerCase())
          );
          if (filteredTasks.length !== currentTasks.length) {
            useAppStore.getState().setTasks(filteredTasks);
          }
          delRawIds.forEach((tid) => {
            deleteLocalRecord('taka_tasks', tid).catch(() => {});
          });
        }

        // Chỉ ghi Dexie phần thay đổi; xóa khỏi Dexie phần đã bị xóa (chống "sống lại")
        const changed = Array.from(pendingProjectsChanged.current.values());
        const removed = Array.from(pendingProjectsRemoved.current);
        pendingProjectsChanged.current.clear();
        pendingProjectsRemoved.current.clear();
        if (changed.length > 0) offloadPersistSnapshot('taka_projects', changed);
        removed.forEach((id) => { deleteLocalRecord('taka_projects', id).catch(() => {}); });
        const setNotifs = useAppStore.getState().setAllProjectsForNotifs;
        if (setNotifs) setNotifs(updatedList);
        pendingProjectsMap.current = null;
      }
    }, 40);
  }, []);

  // Stage 3 & Delta Pipeline Startup
  useEffect(() => {
    bootstrapLocalStore().catch(() => {});

    fetchYearsMeta().then((meta) => {
      remoteYearsMetaRef.current = meta;
      setMemoryYearsMeta(meta);
    });

    const stopDeltaSync = startDeltaSyncService();
    return () => {
      stopDeltaSync();
    };
  }, []);

  // Sleep/Wake Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      // KHÔNG hủy listener khi thức giấc.
      // Hủy xong mà không effect nào tạo lại => mất realtime Projects, và bộ đếm activeListeners
      // không giảm => deltaInvalidateService tưởng doc đã có listener phủ rồi bỏ qua việc đọc lại.
      // Socket chết do iOS treo đã có initNetworkRecovery (syncResilience) xử lý.
      hydrateProjectsFromLocal(
        useAppStore.getState().globalYearFilter,
        useAppStore.getState().globalStoreFilter
      ).catch(() => {});
    };

    window.addEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
    return () => {
      window.removeEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
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

    const isAllYears = globalYearFilter === "all" || globalYearFilter === "ALL";
    const liveTargetYears = isAllYears ? PRIMARY_ACTIVE_YEARS : [globalYearFilter];

    liveTargetYears.forEach(async (year) => {
      if (!projectsPool.current.has(year)) {
        // Step 1: Instant Local-First Dexie Hydration (0ms, 0 Read)
        const localCount = await hydrateProjectsFromLocal(year, globalStoreFilter);

        const isClosedOrPastYear = Number(year) < new Date().getFullYear();
        const hasLocalData =
          localCount > 0 ||
          (useAppStore.getState().projects || []).some((p) => String(p.year) === String(year));

        const deltaManaged =
          (hasLocalData && isClosedOrPastYear) ||
          (DELTA_FIRST.projects && hasMarker(await getLoadedMarkers(), 'projects_year', year));
        if (deltaManaged) {
          projectsPool.current.set(year, () => {});
          pullAndApplyDeltas(year)
            .then(() => setCloudStatus("online"))
            .catch(() => {});
          usePerformanceStore
            .getState()
            .trackGetDoc(
              `taka_projects_${year}`,
              true,
              localCount,
              "Dexie Local-First Projects Hydration (0 Read full collection)"
            );
          return;
        }

        if (false && isClosedOrPastYear && isYearCacheValid(year, remoteYearsMetaRef.current)) {
          const cached = loadYearDataFromLocal(year);
          if (cached && cached.projects && cached.projects.length > 0) {
            batchProjectsUpdate(
              cached.projects.map((p) => ({
                type: "added",
                doc: { id: p.id, data: () => p },
              }))
            );
            usePerformanceStore
              .getState()
              .trackGetDoc(
                `taka_projects_${year}`,
                true,
                cached.projects.length,
                "Metadata Fingerprint Cache Hit"
              );
            projectsPool.current.set(year, () => {});
            return;
          }
        }

        const colRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_projects");
        const qProjects = buildStoreAndYearQuery(colRef, "store", "year", year, userRole, allowedStores);

        usePerformanceStore.getState().registerListener(`taka_projects_${year}`);
        const unsub = onSnapshot(
          qProjects,
          (snapshot) => {
            usePerformanceStore.getState().trackSnapshot(`taka_projects_${year}`, snapshot);
            const fromCache = snapshot.metadata.fromCache;
            let changesToApply: any[] = snapshot.docChanges();

            // Server snapshot reconciliation: purge any zombie project in Dexie/Zustand for this year that no longer exists on server
            if (!fromCache) {
              const serverIds = new Set<string>();
              snapshot.docs.forEach((d) => serverIds.add(d.id));
              const currentProjectsNow = useAppStore.getState().projects || [];
              const nowMs = Date.now();
              const allowedLower = allowedStores.map((s) => s.toLowerCase());
              const isStoreRestricted = userRole !== "admin" && allowedLower.length > 0 && !allowedLower.includes("all");
              const zombieRemovals: any[] = [];
              currentProjectsNow.forEach((p) => {
                if (
                  p?.id &&
                  String(p.year ?? "").trim() === String(year).trim() &&
                  !serverIds.has(p.id)
                ) {
                  if (isStoreRestricted && p.store && !allowedLower.includes(String(p.store).trim().toLowerCase())) {
                    return;
                  }
                  const updatedMs = tsOf(p.updatedAt);
                  if (!updatedMs || nowMs - updatedMs > 30000) {
                    zombieRemovals.push({
                      type: "removed",
                      doc: { id: p.id, data: () => ({ ...p, isDeleted: true }) },
                    });
                  }
                }
              });
              if (zombieRemovals.length > 0) {
                changesToApply = [...changesToApply, ...zombieRemovals];
              }
            }

            batchProjectsUpdate(changesToApply, fromCache);
            setCloudStatus("online");

            if (DELTA_FIRST.projects && !fromCache) {
              markLoaded('projects_year', year).catch(() => {});
              const u = projectsPool.current.get(year);
              projectsPool.current.set(year, () => {});
              u?.();
              usePerformanceStore.getState().unregisterListener(`taka_projects_${year}`);
            }
          },
          (e) => {
            console.error("Projects listener error:", e);
            setCloudStatus("offline");
          }
        );
        projectsPool.current.set(year, unsub);
      }
    });

    if (isAllYears) {
      SECONDARY_ACTIVE_YEARS.forEach(async (year) => {
        if (projectsPool.current.has(year)) return;
        const secKey = `${querySignature}_${globalStoreFilter}_${year}`;
        if (secondaryYearsFetched.has(secKey)) return;
        secondaryYearsFetched.add(secKey);
        try {
          const colRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_projects");
          const qProjects = buildStoreAndYearQuery(colRef, "store", "year", year, userRole, allowedStores);
          let snapshot;
          try {
            snapshot = await getDocsFromCache(qProjects);
            if (snapshot.empty) {
              snapshot = await getDocsFromServer(qProjects);
            }
          } catch {
            snapshot = await getDocsFromServer(qProjects);
          }

          if (snapshot && !snapshot.empty) {
            const currentProjects = useAppStore.getState().projects || [];
            const projectMap = new Map<string, Project>();
            currentProjects.forEach((p) => projectMap.set(p.id, p));

            snapshot.forEach((docSnap) => {
              const data = { id: docSnap.id, ...docSnap.data() } as Project;
              if (!data.isDeleted) {
                projectMap.set(docSnap.id, data);
              }
            });

            const updatedList = Array.from(projectMap.values());
            updatedList.sort((a, b) => (a.no || 0) - (b.no || 0));
            useAppStore.getState().setProjects(updatedList);
          }
        } catch {
          // Lỗi mạng hoặc cache: cho phép thử lại ở lần chạy sau
          secondaryYearsFetched.delete(secKey);
        }
      });
    }
  }, [querySignature, userRole, allowedStores, globalYearFilter, globalStoreFilter, batchProjectsUpdate, setCloudStatus]);
}
