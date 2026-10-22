import { useEffect, useRef, useCallback } from "react";
import { collection, onSnapshot, getDocsFromCache, getDocsFromServer } from "firebase/firestore";
import { useAppStore } from "../../store/useAppStore";
import { usePerformanceStore } from "../../store/usePerformanceStore";
import { db, APP_ID } from "../../lib/firebase";
import { Cost } from "../../types";
import { PRIMARY_ACTIVE_YEARS, SECONDARY_ACTIVE_YEARS } from "../../lib/utils";
import { buildStoreAndYearQuery } from "./firebaseQueryHelpers";
import { hydrateCostsFromLocal, offloadPersistSnapshot } from "../../lib/backgroundSyncWorker";
import { deleteLocalRecord } from "../../lib/localDb";
import { pullAndApplyDeltas } from "../../lib/deltaSyncService";
import { getLoadedMarkers, hasFreshMarker, markLoaded } from "../../lib/loadedMarkers";

// Delta-first with 6-hour warm marker TTL: reopens within 30m-6h use Dexie + taka_deltas (0 collection reads)
const DELTA_FIRST = { projects: true, tasks: true, costs: true, delegations: true };


interface UseCostsHydrationProps {
  querySignature: string | null;
  userRole?: string;
  allowedStores: string[];
}

const TTL_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const secondaryCostsYearsFetched = new Set<string>();

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

export function useCostsHydration({
  querySignature,
  userRole,
  allowedStores,
}: UseCostsHydrationProps) {
  const isCostsRequested = useAppStore((state) => state.isCostsRequested);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setIsCostsLoading = useAppStore((state) => state.setIsCostsLoading);
  const setCloudStatus = useAppStore((state) => state.setCloudStatus);

  const costsPool = useRef<Map<string, () => void>>(new Map());
  const costsTTLTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const prevSigCosts = useRef<string>("");

  // Atomic batching buffers for Costs updates
  const pendingCostsMap = useRef<Map<string, Cost> | null>(null);
  const pendingCostsChanged = useRef<Map<string, Cost>>(new Map());
  const pendingCostsRemoved = useRef<Set<string>>(new Set());
  const costsBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchCostsUpdate = useCallback((docChanges: any[], fromCache: boolean = false) => {
    if (!pendingCostsMap.current) {
      const currentCosts = useAppStore.getState().costs || [];
      const map = new Map<string, Cost>();
      currentCosts.forEach((c) => map.set(c.id, c));
      pendingCostsMap.current = map;
    }

    docChanges.forEach((change) => {
      const id = change.doc.id;
      const rawDocData = change.doc.data();
      const data = { id, ...rawDocData } as Cost;
      const isTrueDelete = Boolean(data.isDeleted || change.type === "removed");

      if (isTrueDelete) {
        pendingCostsMap.current!.delete(id);
        pendingCostsChanged.current.delete(id);
        pendingCostsRemoved.current.add(id);
      } else {
        if (fromCache && isStaleCacheDoc(pendingCostsMap.current!.get(id), data)) return;
        pendingCostsMap.current!.set(id, data);
        pendingCostsChanged.current.set(id, data);
        pendingCostsRemoved.current.delete(id);
      }
    });

    if (costsBatchTimer.current) {
      clearTimeout(costsBatchTimer.current);
    }

    costsBatchTimer.current = setTimeout(() => {
      if (pendingCostsMap.current) {
        const updatedList = Array.from(pendingCostsMap.current.values());
        useAppStore.getState().setCosts(updatedList);
        
        const changed = Array.from(pendingCostsChanged.current.values());
        const removed = Array.from(pendingCostsRemoved.current);
        pendingCostsChanged.current.clear();
        pendingCostsRemoved.current.clear();
        
        if (changed.length > 0) offloadPersistSnapshot('taka_costs', changed);
        removed.forEach((id) => { deleteLocalRecord('taka_costs', id).catch(() => {}); });
        
        pendingCostsMap.current = null;
      }
    }, 80);
  }, []);

  // Sleep/Wake & Network Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      // Preserve active onSnapshot listeners in costsPool so Firestore SDK resumes via resumeToken
      if (useAppStore.getState().isCostsRequested) {
        hydrateCostsFromLocal(useAppStore.getState().globalYearFilter).catch(() => {});
      }
    };

    window.addEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
    window.addEventListener("taka_network_recovered", handleSleepWakeRecovery);
    return () => {
      window.removeEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
      window.removeEventListener("taka_network_recovered", handleSleepWakeRecovery);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      costsPool.current.forEach((u, key) => {
        u();
        usePerformanceStore.getState().unregisterListener(`taka_costs_${key}`);
      });
      costsPool.current.clear();
      costsTTLTimeouts.current.forEach((t) => clearTimeout(t));
      costsTTLTimeouts.current.clear();
      if (costsBatchTimer.current) clearTimeout(costsBatchTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!querySignature || !isCostsRequested) {
      if (!isCostsRequested) {
        setIsCostsLoading(false);
        Array.from(costsPool.current.keys()).forEach((key) => {
          if (!costsTTLTimeouts.current.has(key)) {
            const timeoutId = setTimeout(() => {
              const unsub = costsPool.current.get(key);
              if (unsub) unsub();
              costsPool.current.delete(key);
              costsTTLTimeouts.current.delete(key);
              usePerformanceStore.getState().unregisterListener(`taka_costs_${key}`);
            }, TTL_DURATION_MS);
            costsTTLTimeouts.current.set(key, timeoutId);
          }
        });
      }
      return;
    }

    costsTTLTimeouts.current.forEach((t) => clearTimeout(t));
    costsTTLTimeouts.current.clear();

    if (prevSigCosts.current !== querySignature) {
      costsPool.current.forEach((u, key) => {
        u();
        usePerformanceStore.getState().unregisterListener(`taka_costs_${key}`);
      });
      costsPool.current.clear();
      prevSigCosts.current = querySignature;
    }

    const isAllYears = globalYearFilter === "all" || globalYearFilter === "ALL";
    const liveTargetYears = isAllYears ? PRIMARY_ACTIVE_YEARS : [globalYearFilter];

    setIsCostsLoading(true);

    liveTargetYears.forEach(async (year) => {
      if (!costsPool.current.has(year)) {
        // Reserve slot synchronously before awaiting IndexedDB to prevent duplicate listener attachment
        costsPool.current.set(year, () => {});

        const localCount = await hydrateCostsFromLocal(year);
        const storeState = useAppStore.getState();
        const currentCosts = storeState.costs || [];
        const hasLocalCosts =
          localCount > 0 || currentCosts.some((c) => String(c.projectYear || "") === String(year));
        const isClosedOrPastYear = Number(year) < new Date().getFullYear();
        const markers = await getLoadedMarkers();
        const hasFreshCostMarker = hasFreshMarker(markers, 'costs_year', year);
        const yearHasZeroProjects =
          hasFreshMarker(markers, 'projects_year', year) &&
          !(storeState.projects || []).some((p) => String(p.year) === String(year));

        const deltaManaged =
          (hasLocalCosts && isClosedOrPastYear) ||
          yearHasZeroProjects ||
          (DELTA_FIRST.costs && hasFreshCostMarker && hasLocalCosts);
        if (deltaManaged) {
          setIsCostsLoading(false);
          setCloudStatus("online");
          usePerformanceStore
            .getState()
            .trackGetDoc(
              `taka_costs_${year}`,
              true,
              localCount,
              "Dexie Local-First Costs (0 Read full collection)"
            );
          return;
        } else {
          const colRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_costs");
          const qCosts = buildStoreAndYearQuery(
            colRef,
            "projectStore",
            "projectYear",
            year,
            userRole,
            allowedStores
          );

          const existingUnsub = costsPool.current.get(year);
          if (existingUnsub) existingUnsub();

          usePerformanceStore.getState().registerListener(`taka_costs_${year}`);
          const unsub = onSnapshot(
            qCosts,
            (snapshot) => {
              usePerformanceStore.getState().trackSnapshot(`taka_costs_${year}`, snapshot);
              setIsCostsLoading(false);
              const fromCache = snapshot.metadata.fromCache;
              let changesToApply: any[] = snapshot.docChanges();

              if (!fromCache && !snapshot.metadata.hasPendingWrites) {
                const serverIds = new Set<string>();
                snapshot.docs.forEach((d) => serverIds.add(d.id));
                const nowMs = Date.now();
                const allowedLower = allowedStores.map((s) => s.toLowerCase());
                const isStoreRestricted =
                  userRole !== "admin" && allowedLower.length > 0 && !allowedLower.includes("all");
                const currentCostsNow = useAppStore.getState().costs || [];
                currentCostsNow.forEach((c) => {
                  const cYr = String(c.projectYear ?? (c as any).year ?? "").trim();
                  if (c?.id && cYr === String(year).trim() && !serverIds.has(c.id)) {
                    const cSt = c.projectStore || (c as any).store;
                    if (
                      isStoreRestricted &&
                      cSt &&
                      !allowedLower.includes(String(cSt).trim().toLowerCase())
                    ) {
                      return;
                    }
                    const updatedMs = tsOf(c.updatedAt);
                    if (!updatedMs || nowMs - updatedMs > 30000) {
                      changesToApply.push({
                        type: "removed",
                        doc: { id: c.id, data: () => ({ ...c, isDeleted: true }) },
                      });
                    }
                  }
                });
              }

              batchCostsUpdate(changesToApply, fromCache);
              setCloudStatus("online");

              if (!fromCache) {
                markLoaded('costs_year', year).catch(() => {});
              }

              if (DELTA_FIRST.costs && !fromCache) {
                const u = costsPool.current.get(year);
                costsPool.current.set(year, () => {});
                u?.();
                usePerformanceStore.getState().unregisterListener(`taka_costs_${year}`);
              }
            },
            (e) => {
              costsPool.current.delete(year);
              usePerformanceStore.getState().unregisterListener(`taka_costs_${year}`);
              setIsCostsLoading(false);
              console.error("Costs listener error:", e);
            }
          );
          costsPool.current.set(year, unsub);
        }
      } else {
        hydrateCostsFromLocal(year).catch(() => {});
        setIsCostsLoading(false);
      }
    });

    if (isAllYears) {
      SECONDARY_ACTIVE_YEARS.forEach(async (year) => {
        if (costsPool.current.has(year)) return;
        const secKey = `${querySignature}_${year}`;
        if (secondaryCostsYearsFetched.has(secKey)) return;
        secondaryCostsYearsFetched.add(secKey);
        try {
          const localCount = await hydrateCostsFromLocal(year);
          const markers = await getLoadedMarkers();
          if (localCount > 0 || hasFreshMarker(markers, 'costs_year', year)) {
            return;
          }

          const colRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_costs");
          const qCosts = buildStoreAndYearQuery(
            colRef,
            "projectStore",
            "projectYear",
            year,
            userRole,
            allowedStores
          );
          let snapshot;
          let fetchedFromServer = false;
          try {
            snapshot = await getDocsFromCache(qCosts);
            if (snapshot.empty) {
              snapshot = await getDocsFromServer(qCosts);
              fetchedFromServer = true;
            }
          } catch {
            snapshot = await getDocsFromServer(qCosts);
            fetchedFromServer = true;
          }

          if (fetchedFromServer) {
            markLoaded('costs_year', year).catch(() => {});
          }

          if (snapshot && !snapshot.empty) {
            const liveCosts = useAppStore.getState().costs || [];
            const costMap = new Map<string, Cost>();
            liveCosts.forEach((c) => costMap.set(c.id, c));
            const fetchedDocs: Cost[] = [];

            snapshot.forEach((docSnap) => {
              const data = { id: docSnap.id, ...docSnap.data() } as Cost;
              if (!data.isDeleted) {
                costMap.set(docSnap.id, data);
                fetchedDocs.push(data);
              }
            });

            if (fetchedDocs.length > 0) {
              offloadPersistSnapshot('taka_costs', fetchedDocs);
            }

            const updatedList = Array.from(costMap.values());
            useAppStore.getState().setCosts(updatedList);
          }
        } catch {
          secondaryCostsYearsFetched.delete(secKey);
        }
      });
    }
  }, [
    querySignature,
    userRole,
    allowedStores,
    isCostsRequested,
    globalYearFilter,
    setIsCostsLoading,
    setCloudStatus,
  ]);
}
