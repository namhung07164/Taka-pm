import { useEffect, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useAppStore } from "../../store/useAppStore";
import { usePerformanceStore } from "../../store/usePerformanceStore";
import { db, APP_ID } from "../../lib/firebase";
import { DelegationGroup } from "../../types";
import { PRIMARY_ACTIVE_YEARS } from "../../lib/utils";
import { buildStoreAndYearQuery } from "./firebaseQueryHelpers";
import {
  hydrateDelegationsFromLocal,
  offloadPersistSnapshot,
} from "../../lib/backgroundSyncWorker";
import { getLocalDelegations } from "../../lib/localDb";
import { pullAndApplyDeltas } from "../../lib/deltaSyncService";

interface UseDelegationsHydrationProps {
  querySignature: string | null;
  userRole?: string;
  allowedStores: string[];
}

const TTL_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function useDelegationsHydration({
  querySignature,
  userRole,
  allowedStores,
}: UseDelegationsHydrationProps) {
  const isDelegationsRequested = useAppStore((state) => state.isDelegationsRequested);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setIsDelegationsLoading = useAppStore((state) => state.setIsDelegationsLoading);
  const setCloudStatus = useAppStore((state) => state.setCloudStatus);

  const delegationsPool = useRef<Map<string, () => void>>(new Map());
  const delegationsTTLTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const yearDelegationsCache = useRef<Map<string, Map<string, DelegationGroup>>>(new Map());

  const prevQuerySigDelegations = useRef<string>("");
  const prevSigDelegations = useRef<string>("");

  // Sleep/Wake Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      delegationsPool.current.forEach((u) => u());
      delegationsPool.current.clear();
      delegationsTTLTimeouts.current.forEach((t) => clearTimeout(t));
      delegationsTTLTimeouts.current.clear();
      yearDelegationsCache.current.clear();

      if (useAppStore.getState().isDelegationsRequested) {
        hydrateDelegationsFromLocal(useAppStore.getState().globalYearFilter).catch(() => {});
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
      delegationsPool.current.forEach((u) => u());
      delegationsPool.current.clear();
      delegationsTTLTimeouts.current.forEach((t) => clearTimeout(t));
      delegationsTTLTimeouts.current.clear();
      yearDelegationsCache.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!querySignature) return;

    const isAllYears = globalYearFilter === "all" || globalYearFilter === "ALL";
    const targetYears = isDelegationsRequested
      ? isAllYears
        ? PRIMARY_ACTIVE_YEARS
        : [globalYearFilter]
      : [];
    const currentSig = `${querySignature}_${targetYears.join(",")}_${isDelegationsRequested}`;

    if (prevQuerySigDelegations.current !== querySignature) {
      if (prevQuerySigDelegations.current !== "") {
        delegationsPool.current.forEach((u) => u());
        delegationsPool.current.clear();
        delegationsTTLTimeouts.current.forEach((t) => clearTimeout(t));
        delegationsTTLTimeouts.current.clear();
        yearDelegationsCache.current.clear();
      }
      prevQuerySigDelegations.current = querySignature;
    }
    prevSigDelegations.current = currentSig;

    const activeYearsSet = new Set(targetYears);
    Array.from(delegationsPool.current.keys()).forEach((year) => {
      if (!activeYearsSet.has(year)) {
        if (!delegationsTTLTimeouts.current.has(year)) {
          const timeoutId = setTimeout(() => {
            const unsub = delegationsPool.current.get(year);
            if (unsub) unsub();
            delegationsPool.current.delete(year);
            delegationsTTLTimeouts.current.delete(year);
            yearDelegationsCache.current.delete(year);
            usePerformanceStore.getState().unregisterListener(`taka_delegation_groups_${year}`);
            if (
              delegationsPool.current.size === 0 &&
              !useAppStore.getState().isDelegationsRequested
            ) {
              useAppStore.getState().setDelegationGroups([]);
            }
          }, TTL_DURATION_MS);
          delegationsTTLTimeouts.current.set(year, timeoutId);
        }
      } else {
        if (delegationsTTLTimeouts.current.has(year)) {
          clearTimeout(delegationsTTLTimeouts.current.get(year)!);
          delegationsTTLTimeouts.current.delete(year);
        }
      }
    });

    if (targetYears.length === 0) {
      return;
    }

    setIsDelegationsLoading(true);

    targetYears.forEach(async (year) => {
      if (!delegationsPool.current.has(year)) {
        const localCount = await hydrateDelegationsFromLocal(year);
        const isClosedOrPastYear = Number(year) < 2026;
        const currentDelegations = useAppStore.getState().delegationGroups || [];
        const hasLocalDelegations =
          localCount > 0 ||
          currentDelegations.some((d) => String(d.projectYear || "") === String(year));

        if (hasLocalDelegations && isClosedOrPastYear) {
          delegationsPool.current.set(year, () => {});
          setIsDelegationsLoading(false);
          pullAndApplyDeltas(year)
            .then(() => setCloudStatus("online"))
            .catch(() => {});
          usePerformanceStore
            .getState()
            .trackGetDoc(
              `taka_delegation_groups_${year}`,
              true,
              localCount,
              "Dexie Local-First Delegations (0 Read full collection)"
            );
          return;
        }

        delegationsPool.current.set(year, () => {});
        setIsDelegationsLoading(false);

        if (!yearDelegationsCache.current.has(year)) {
          yearDelegationsCache.current.set(year, new Map());
        }
        const yearMap = yearDelegationsCache.current.get(year)!;
        if (localCount > 0) {
          const localItems = await getLocalDelegations(year);
          localItems.forEach((d) => {
            if (d.id) yearMap.set(d.id, d);
          });
          pullAndApplyDeltas(year)
            .then(() => setCloudStatus("online"))
            .catch(() => {});
        }

        const colRef = collection(
          db,
          "artifacts",
          APP_ID,
          "public",
          "data",
          "taka_delegation_groups"
        );
        const qDelegations = buildStoreAndYearQuery(
          colRef,
          "projectStore",
          "projectYear",
          year,
          userRole,
          allowedStores
        );

        usePerformanceStore.getState().registerListener(`taka_delegation_groups_${year}`);
        const unsub = onSnapshot(
          qDelegations,
          (snapshot) => {
            usePerformanceStore
              .getState()
              .trackSnapshot(`taka_delegation_groups_${year}`, snapshot);
            setIsDelegationsLoading(false);

            if (!yearDelegationsCache.current.has(year)) {
              yearDelegationsCache.current.set(year, new Map());
            }
            const currentYearMap = yearDelegationsCache.current.get(year)!;

            snapshot.docChanges().forEach((change) => {
              const data = { id: change.doc.id, ...change.doc.data() } as DelegationGroup;
              if (change.type === "removed") {
                currentYearMap.delete(change.doc.id);
              } else {
                currentYearMap.set(change.doc.id, data);
              }
            });

            const loaded: DelegationGroup[] = [];
            const seenGroupIds = new Set<string>();

            activeYearsSet.forEach((targetYear) => {
              const map = yearDelegationsCache.current.get(targetYear);
              if (map) {
                for (const data of map.values()) {
                  if (data.id && !seenGroupIds.has(data.id)) {
                    seenGroupIds.add(data.id);
                    loaded.push(data);
                  }
                }
              }
            });

            useAppStore.getState().setDelegationGroups(loaded);
            offloadPersistSnapshot("taka_delegations", loaded);
          },
          (e) => {
            delegationsPool.current.delete(year);
            setIsDelegationsLoading(false);
            console.error("Delegation groups listener error:", e);
          }
        );
        delegationsPool.current.set(year, unsub);
      }
    });
  }, [
    querySignature,
    userRole,
    allowedStores,
    isDelegationsRequested,
    globalYearFilter,
    setIsDelegationsLoading,
    setCloudStatus,
  ]);
}
