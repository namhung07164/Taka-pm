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
  saveYearDataToLocal,
  YearsMetaMap,
} from "../../lib/yearsFingerprintService";
import { startDeltaSyncService, pullAndApplyDeltas } from "../../lib/deltaSyncService";
import { getLoadedMarkers, hasMarker, markLoaded } from "../../lib/loadedMarkers";

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
      const data = { id, ...change.doc.data() } as Project;
      if (change.type === "removed" || data.isDeleted) {
        pendingProjectsMap.current!.delete(id);
        pendingProjectsChanged.current.delete(id);
        pendingProjectsRemoved.current.add(id);
      } else {
        if (fromCache && isStaleCacheDoc(pendingProjectsMap.current!.get(id), data)) return;
        pendingProjectsMap.current!.set(id, data);
        pendingProjectsChanged.current.set(id, data);
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
      projectsPool.current.forEach((u) => u());
      projectsPool.current.clear();
      hydrateProjectsFromLocal(useAppStore.getState().globalYearFilter).catch(() => {});
    };

    window.addEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
    return () => {
      window.removeEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
    };
  }, []);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      projectsPool.current.forEach((u) => u());
      projectsPool.current.clear();
      if (projectsBatchTimer.current) clearTimeout(projectsBatchTimer.current);
    };
  }, []);

  // Main Unified Global Delta Sync for Projects
  useEffect(() => {
    if (!querySignature) return;

    if (prevSigProjects.current !== querySignature) {
      projectsPool.current.forEach((u) => u());
      projectsPool.current.clear();
      prevSigProjects.current = querySignature;
    }

    const isAllYears = globalYearFilter === "all" || globalYearFilter === "ALL";
    const liveTargetYears = isAllYears ? PRIMARY_ACTIVE_YEARS : [globalYearFilter];

    liveTargetYears.forEach(async (year) => {
      if (!projectsPool.current.has(year)) {
        // Step 1: Instant Local-First Dexie Hydration (0ms, 0 Read)
        const localCount = await hydrateProjectsFromLocal(year, globalStoreFilter);

        const isClosedOrPastYear = Number(year) < 2026;
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

        if (isClosedOrPastYear && isYearCacheValid(year, remoteYearsMetaRef.current)) {
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
            batchProjectsUpdate(snapshot.docChanges(), snapshot.metadata.fromCache);
            setCloudStatus("online");

            if (DELTA_FIRST.projects && !snapshot.metadata.fromCache) {
              markLoaded('projects_year', year).catch(() => {});
              const u = projectsPool.current.get(year);
              projectsPool.current.set(year, () => {});
              u?.();
              usePerformanceStore.getState().unregisterListener(`taka_projects_${year}`);
            }

            if (!snapshot.metadata.fromCache) {
              const yearProjects = snapshot.docs
                .map((d) => ({ id: d.id, ...d.data() } as Project))
                .filter((p) => !p.isDeleted);
              if (yearProjects.length > 0) {
                const updatedAt = remoteYearsMetaRef.current[year]?.updatedAt || new Date().toISOString();
                saveYearDataToLocal(year, updatedAt, { projects: yearProjects });
                offloadPersistSnapshot("taka_projects", yearProjects);
              }
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
          // Ignore cache misses
        }
      });
    }
  }, [querySignature, userRole, allowedStores, globalYearFilter, globalStoreFilter, batchProjectsUpdate, setCloudStatus]);
}
