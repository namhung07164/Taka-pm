import { useEffect, useRef } from "react";
import { collection, onSnapshot, getDocsFromCache, getDocsFromServer } from "firebase/firestore";
import { useAppStore } from "../../store/useAppStore";
import { usePerformanceStore } from "../../store/usePerformanceStore";
import { db, APP_ID } from "../../lib/firebase";
import { Cost } from "../../types";
import { PRIMARY_ACTIVE_YEARS, SECONDARY_ACTIVE_YEARS } from "../../lib/utils";
import { buildStoreAndYearQuery } from "./firebaseQueryHelpers";
import { hydrateCostsFromLocal } from "../../lib/backgroundSyncWorker";
import { pullAndApplyDeltas } from "../../lib/deltaSyncService";

interface UseCostsHydrationProps {
  querySignature: string | null;
  userRole?: string;
  allowedStores: string[];
}

const TTL_DURATION_MS = 15 * 60 * 1000; // 15 minutes

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

  // Sleep/Wake Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      costsPool.current.forEach((u) => u());
      costsPool.current.clear();
      costsTTLTimeouts.current.forEach((t) => clearTimeout(t));
      costsTTLTimeouts.current.clear();

      if (useAppStore.getState().isCostsRequested) {
        hydrateCostsFromLocal().catch(() => {});
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
      costsPool.current.forEach((u) => u());
      costsPool.current.clear();
      costsTTLTimeouts.current.forEach((t) => clearTimeout(t));
      costsTTLTimeouts.current.clear();
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
      costsPool.current.forEach((u) => u());
      costsPool.current.clear();
      prevSigCosts.current = querySignature;
    }

    const isAllYears = globalYearFilter === "all" || globalYearFilter === "ALL";
    const liveTargetYears = isAllYears ? PRIMARY_ACTIVE_YEARS : [globalYearFilter];

    setIsCostsLoading(true);

    liveTargetYears.forEach(async (year) => {
      if (!costsPool.current.has(year)) {
        const localCount = await hydrateCostsFromLocal();
        const currentCosts = useAppStore.getState().costs || [];
        const hasLocalCosts =
          localCount > 0 || currentCosts.some((c) => String(c.projectYear || "") === String(year));
        const isClosedOrPastYear = Number(year) < 2026;

        if (hasLocalCosts && isClosedOrPastYear) {
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

              const liveCosts = useAppStore.getState().costs || [];
              const costMap = new Map<string, Cost>();
              liveCosts.forEach((c) => costMap.set(c.id, c));

              snapshot.docChanges().forEach((change) => {
                const data = { id: change.doc.id, ...change.doc.data() } as Cost;
                if (change.type === "removed" || data.isDeleted) {
                  costMap.delete(change.doc.id);
                } else {
                  costMap.set(change.doc.id, data);
                }
              });

              const updatedList = Array.from(costMap.values());
              useAppStore.getState().setCosts(updatedList);
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
