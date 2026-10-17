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
import { getLoadedMarkers, hasMarker, markLoaded } from "../../lib/loadedMarkers";

// Delta-first: sau lần tải đầy đủ đầu tiên, hủy onSnapshot lớn, dựa vào Dexie + kênh delta.
// Bật TỪNG CÁI sau khi đã test. Mặc định tắt = hành vi hiện tại.
const DELTA_FIRST = { projects: false, tasks: false, costs: false, delegations: false };


interface UseCostsHydrationProps {
  querySignature: string | null;
  userRole?: string;
  allowedStores: string[];
}

const TTL_DURATION_MS = 15 * 60 * 1000; // 15 minutes

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

  // Sleep/Wake Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      // 1. KHÔNG hủy listener khi thức giấc.
      
      if (useAppStore.getState().isCostsRequested) {
        hydrateCostsFromLocal(useAppStore.getState().globalYearFilter).catch(() => {});
      }
    };

    window.addEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
    return () => {
      window.removeEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
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
        const localCount = await hydrateCostsFromLocal(year);
        const currentCosts = useAppStore.getState().costs || [];
        const hasLocalCosts =
          localCount > 0 || currentCosts.some((c) => String(c.projectYear || "") === String(year));
        const isClosedOrPastYear = Number(year) < new Date().getFullYear();

        const deltaManaged =
          (hasLocalCosts && isClosedOrPastYear) ||
          (DELTA_FIRST.costs && hasMarker(await getLoadedMarkers(), 'costs_year', year));
        if (deltaManaged) {
          costsPool.current.set(year, () => {});
          setIsCostsLoading(false);
          pullAndApplyDeltas(year)
            .then(() => setCloudStatus("online"))
            .catch(() => {});
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

          usePerformanceStore.getState().registerListener(`taka_costs_${year}`);
          const unsub = onSnapshot(
            qCosts,
            (snapshot) => {
              usePerformanceStore.getState().trackSnapshot(`taka_costs_${year}`, snapshot);
              setIsCostsLoading(false);
              const fromCache = snapshot.metadata.fromCache;
              batchCostsUpdate(snapshot.docChanges(), fromCache);

              if (DELTA_FIRST.costs && !fromCache) {
                markLoaded('costs_year', year).catch(() => {});
                const u = costsPool.current.get(year);
                costsPool.current.set(year, () => {});
                u?.();
                usePerformanceStore.getState().unregisterListener(`taka_costs_${year}`);
              }
            },
            (e) => {
              setIsCostsLoading(false);
              console.error("Costs listener error:", e);
            }
          );
          costsPool.current.set(year, unsub);
        }
      } else {
        setIsCostsLoading(false);
      }
    });

    if (isAllYears) {
      SECONDARY_ACTIVE_YEARS.forEach(async (year) => {
        if (costsPool.current.has(year)) return;
        try {
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
          try {
            snapshot = await getDocsFromCache(qCosts);
            if (snapshot.empty) {
              snapshot = await getDocsFromServer(qCosts);
            }
          } catch {
            snapshot = await getDocsFromServer(qCosts);
          }

          if (snapshot && !snapshot.empty) {
            const liveCosts = useAppStore.getState().costs || [];
            const costMap = new Map<string, Cost>();
            liveCosts.forEach((c) => costMap.set(c.id, c));

            snapshot.forEach((docSnap) => {
              const data = { id: docSnap.id, ...docSnap.data() } as Cost;
              if (!data.isDeleted) {
                costMap.set(docSnap.id, data);
              }
            });

            const updatedList = Array.from(costMap.values());
            useAppStore.getState().setCosts(updatedList);
          }
        } catch {}
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
