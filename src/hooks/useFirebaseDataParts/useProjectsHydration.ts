import { useEffect, useRef, useCallback, useState } from "react";
import { collection, onSnapshot, getDocsFromCache, getDocsFromServer } from "firebase/firestore";
import { useAppStore } from "../../store/useAppStore";
import { usePerformanceStore } from "../../store/usePerformanceStore";
import { db, APP_ID } from "../../lib/firebase";
import { Project, TakaDeltaItem } from "../../types";
import { PRIMARY_ACTIVE_YEARS, SECONDARY_ACTIVE_YEARS } from "../../lib/utils";
import { buildStoreAndYearQuery } from "./firebaseQueryHelpers";
import {
  bootstrapLocalStore,
  offloadPersistSnapshot,
  hydrateProjectsFromLocal,
} from "../../lib/backgroundSyncWorker";
import { localDb, deleteLocalRecord, patchLocalRecord } from "../../lib/localDb";
import {
  fetchYearsMeta,
  setMemoryYearsMeta,
  isYearCacheValid,
  loadYearDataFromLocal,
  YearsMetaMap,
} from "../../lib/yearsFingerprintService";
import { startDeltaSyncService, pullAndApplyDeltas, applyIncomingDeltas } from "../../lib/deltaSyncService";
import { resolveInvalidations } from "../../lib/deltaInvalidateService";
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

// Chuyển updatedAt (ISO string / Firestore Timestamp / plain {seconds} / number) về ms
const tsOf = (v: any): number => {
  if (!v) return 0;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v?.toMillis === "function") {
    const n = v.toMillis();
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v?.seconds === "number") {
    return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  }
  const n = Number(v);
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
  const [recoveryTick, setRecoveryTick] = useState(0);

  const projectsPool = useRef<Map<string, () => void>>(new Map());
  const prevSigProjects = useRef<string>("");
  const remoteYearsMetaRef = useRef<YearsMetaMap>({});

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
      currentProjects.forEach(p => map.set(p.id, p));
      pendingProjectsMap.current = map;
    }

    const storeState = useAppStore.getState();
    const currentTasks = storeState.tasks || [];
    const expandedSet = new Set([
      ...(storeState.expandedProjectIds || []),
      ...(storeState.searchActiveProjectIds || []),
    ].map(String));
    const nowMs = Date.now();

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
        const hasPendingWrites = Boolean(change.doc?.metadata?.hasPendingWrites);

        const resolvedSummaries = data.taskSummaries !== undefined ? data.taskSummaries : (existing?.taskSummaries || []);
        const resolvedCount = Array.isArray(data.taskSummaries) && data.taskSummaries.length > 0
          ? data.taskSummaries.length
          : (data.taskCount !== undefined ? data.taskCount : (existing?.taskCount ?? 0));

        const resolvedData: Project = existing ? {
          ...existing,
          ...data,
          taskCount: resolvedCount,
          taskSummaries: resolvedSummaries,
        } : {
          ...data,
          taskCount: resolvedCount,
          taskSummaries: resolvedSummaries,
        };

        // Server-to-Device Task Summary Reconciliation:
        // Compare authoritative server project.taskSummaries with local tasks (Zustand + Dexie)
        if (!fromCache && !hasPendingWrites && Array.isArray(data.taskSummaries)) {
          const serverSummaryIds = new Set(
            data.taskSummaries.map((s: any) => String(s?.id || "").trim().toLowerCase()).filter(Boolean)
          );
          const isZeroTaskServer = data.taskSummaries.length === 0 && (data.taskCount ?? 0) === 0;

          if (serverSummaryIds.size > 0 || isZeroTaskServer) {
            // 1. Any task ID that was in existing.taskSummaries but is no longer in server data.taskSummaries was deleted on another device
            if (existing && Array.isArray(existing.taskSummaries)) {
              existing.taskSummaries.forEach((oldS: any) => {
                const oldId = String(oldS?.id || "").trim();
                if (oldId && !serverSummaryIds.has(oldId.toLowerCase())) {
                  markTasksDeleted([oldId], id);
                  pendingDeletedTaskIds.current.add(oldId);
                }
              });
            }

            // 2. Any in-memory task belonging to this project that is not in serverSummaryIds (and not edited in last 30s) is a zombie task
            const localProjTasks = currentTasks.filter(t => isTaskBelongsToProject(t, resolvedData));
            const localProjTasksById = new Map<string, any>();
            localProjTasks.forEach((t) => {
              if (!t?.id || String(t.id).startsWith("ts_")) return;
              const tIdLower = String(t.id).trim().toLowerCase();
              localProjTasksById.set(tIdLower, t);
              if (!serverSummaryIds.has(tIdLower)) {
                const updatedMs = tsOf(t.updatedAt);
                if (!updatedMs || nowMs - updatedMs > 30000) {
                  markTasksDeleted([t.id], id);
                  pendingDeletedTaskIds.current.add(t.id);
                }
              }
            });

            // 3. If project already has tasks hydrated in RAM (or is expanded), check if server data.taskSummaries has added or modified tasks
            const isProjHydratedOrExpanded =
              localProjTasks.length > 0 ||
              expandedSet.has(String(id)) ||
              (resolvedData.code && expandedSet.has(String(resolvedData.code)));

            if (isProjHydratedOrExpanded && serverSummaryIds.size > 0) {
              data.taskSummaries.forEach((s: any) => {
                const sId = String(s?.id || "").trim();
                if (!sId || sId.startsWith("ts_")) return;
                const localT = localProjTasksById.get(sId.toLowerCase());
                if (!localT) {
                  pendingInvalidatedTaskIds.current.set(sId, String(resolvedData.year || ""));
                } else {
                  const localUpdatedMs = tsOf(localT.updatedAt);
                  const isRecentlyEditedLocally = localUpdatedMs > 0 && nowMs - localUpdatedMs <= 30000;
                  if (!isRecentlyEditedLocally) {
                    const summaryDiffers =
                      (s.name !== undefined && s.name !== localT.name) ||
                      (s.start !== undefined && s.start !== localT.start) ||
                      (s.finish !== undefined && s.finish !== localT.finish) ||
                      (s.runningStatus !== undefined && s.runningStatus !== localT.runningStatus) ||
                      (s.approval !== undefined && s.approval !== localT.approval) ||
                      (s.party !== undefined && s.party !== localT.party);
                    if (summaryDiffers) {
                      pendingInvalidatedTaskIds.current.set(sId, String(resolvedData.year || ""));
                    }
                  }
                }
              });
            }
          }
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

        // Chỉ ghi Dexie phần thay đổi; xóa khỏi Dexie phần đã bị xóa (chống "sống lại")
        const changed = Array.from(pendingProjectsChanged.current.values());
        const removed = Array.from(pendingProjectsRemoved.current);
        pendingProjectsChanged.current.clear();
        pendingProjectsRemoved.current.clear();
        if (changed.length > 0) {
          offloadPersistSnapshot('taka_projects', changed);

          // Background Dexie Task Reconciliation: even when on General tab (store.tasks is empty),
          // purge any zombie tasks in localDb.tasks that were deleted on another device according to server project.taskSummaries!
          if (!fromCache) {
            setTimeout(async () => {
              try {
                const nowBg = Date.now();
                for (const p of changed) {
                  if (!p?.id || !Array.isArray(p.taskSummaries)) continue;
                  const summaryIds = new Set(
                    p.taskSummaries.map((s: any) => String(s?.id || "").trim().toLowerCase()).filter(Boolean)
                  );
                  const isZeroTask = p.taskSummaries.length === 0 && (p.taskCount ?? 0) === 0;
                  if (summaryIds.size === 0 && !isZeroTask) continue;

                  const summaryById = new Map<string, any>();
                  p.taskSummaries.forEach((s: any) => {
                    if (s?.id) summaryById.set(String(s.id).trim().toLowerCase(), s);
                  });

                  const keys = [String(p.id)];
                  if (p.code) keys.push(String(p.code).trim());
                  if (p.linkCodes) {
                    String(p.linkCodes).split(/[,;/]+/).forEach(c => {
                      if (c.trim()) keys.push(c.trim());
                    });
                  }
                  const [byId, byCode] = await Promise.all([
                    localDb.tasks.where('projectId').equals(String(p.id)).toArray().catch(() => []),
                    localDb.tasks.where('projectCode').anyOf(keys).toArray().catch(() => []),
                  ]);
                  const candidateMap = new Map<string, any>();
                  byId.forEach(t => { if (t?.id) candidateMap.set(t.id, t); });
                  byCode.forEach(t => { if (t?.id && isTaskBelongsToProject(t, p)) candidateMap.set(t.id, t); });

                  for (const [tid, t] of candidateMap.entries()) {
                    const tidLower = String(tid).trim().toLowerCase();
                    const tUpdatedMs = tsOf(t.updatedAt);
                    if (tUpdatedMs > 0 && nowBg - tUpdatedMs <= 30000) continue;

                    if (!summaryIds.has(tidLower)) {
                      markTasksDeleted([tid], p.id);
                      await deleteLocalRecord('taka_tasks', tid);
                      const curTasks = useAppStore.getState().tasks || [];
                      if (curTasks.some(ct => String(ct.id).trim().toLowerCase() === tidLower)) {
                        useAppStore.getState().setTasks(
                          curTasks.filter(ct => String(ct.id).trim().toLowerCase() !== tidLower)
                        );
                      }
                    } else {
                      const s = summaryById.get(tidLower);
                      if (s) {
                        const needsPatch =
                          (s.name !== undefined && s.name !== t.name) ||
                          (s.start !== undefined && s.start !== t.start) ||
                          (s.finish !== undefined && s.finish !== t.finish) ||
                          (s.runningStatus !== undefined && s.runningStatus !== t.runningStatus);
                        if (needsPatch) {
                          await patchLocalRecord('taka_tasks', tid, {
                            name: s.name ?? t.name,
                            start: s.start ?? t.start,
                            finish: s.finish ?? t.finish,
                            ...(s.runningStatus !== undefined ? { runningStatus: s.runningStatus } : {}),
                            ...(s.duration !== undefined ? { duration: s.duration } : {}),
                            ...(s.orderIndex !== undefined ? { orderIndex: s.orderIndex } : {}),
                          });
                        }
                      }
                    }
                  }
                }
              } catch {}
            }, 60);
          }
        }
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

  // Sleep/Wake & Network Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      // Sau khi thức giấc từ chế độ ngủ hoặc khôi phục mạng:
      // Hủy các listener cũ (hoặc dummy listener) trong projectsPool và tăng recoveryTick
      // để useEffect chính gắn lại listener mới và đối soát (reconcile) snapshot trực tiếp với server!
      projectsPool.current.forEach((u, key) => {
        try { u(); } catch {}
        usePerformanceStore.getState().unregisterListener(`taka_projects_${key}`);
      });
      projectsPool.current.clear();
      secondaryYearsFetched.clear();
      setRecoveryTick((c) => c + 1);
    };

    window.addEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
    window.addEventListener("taka_network_recovered", handleSleepWakeRecovery);
    return () => {
      window.removeEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
      window.removeEventListener("taka_network_recovered", handleSleepWakeRecovery);
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
      // LUÔN đảm bảo nạp lại dữ liệu từ Dexie Local-First khi người dùng đổi bộ lọc Year hoặc Store,
      // kể cả khi listener của năm đó đã nằm trong projectsPool!
      const localCount = await hydrateProjectsFromLocal(year, globalStoreFilter);

      if (!projectsPool.current.has(year)) {
        // Chỉ coi các năm cũ hơn năm ngoái (vd <= 2024) là năm đã đóng sổ hoàn toàn
        const isClosedOrPastYear = Number(year) < new Date().getFullYear() - 1;
        const hasLocalData =
          localCount > 0 ||
          (useAppStore.getState().projects || []).some((p) => String(p.year) === String(year));

        const deltaManaged =
          (hasLocalData && isClosedOrPastYear) ||
          (DELTA_FIRST.projects && hasLocalData && hasMarker(await getLoadedMarkers(), 'projects_year', year));
        if (deltaManaged) {
          projectsPool.current.set(year, () => {});
          pullAndApplyDeltas(year, true)
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
            if (!fromCache && !snapshot.metadata.hasPendingWrites) {
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
            projectsPool.current.delete(year);
            usePerformanceStore.getState().unregisterListener(`taka_projects_${year}`);
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
  }, [querySignature, userRole, allowedStores, globalYearFilter, globalStoreFilter, batchProjectsUpdate, setCloudStatus, recoveryTick]);
}
