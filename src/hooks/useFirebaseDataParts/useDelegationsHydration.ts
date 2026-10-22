import { useEffect, useRef, useCallback } from "react";
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
import { getLocalDelegations, deleteLocalRecord } from "../../lib/localDb";
import { pullAndApplyDeltas } from "../../lib/deltaSyncService";
import { getLoadedMarkers, hasFreshMarker, markLoaded } from "../../lib/loadedMarkers";

// Delta-first with 6-hour warm marker TTL: reopens within 30m-6h use Dexie + taka_deltas (0 collection reads)
const DELTA_FIRST = { projects: true, tasks: true, costs: true, delegations: true };


interface UseDelegationsHydrationProps {
  querySignature: string | null;
  userRole?: string;
  allowedStores: string[];
}

const TTL_DURATION_MS = 15 * 60 * 1000; // 15 minutes

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

  // Atomic batching buffers for Delegations updates
  const pendingDelegationsMap = useRef<Map<string, DelegationGroup> | null>(null);
  const pendingDelegationsChanged = useRef<Map<string, DelegationGroup>>(new Map());
  const pendingDelegationsRemoved = useRef<Set<string>>(new Set());
  const delegationsBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchDelegationsUpdate = useCallback((docChanges: any[], fromCache: boolean = false) => {
    if (!pendingDelegationsMap.current) {
      const currentDelegations = useAppStore.getState().delegationGroups || [];
      const map = new Map<string, DelegationGroup>();
      currentDelegations.forEach((g) => map.set(g.id, g));
      pendingDelegationsMap.current = map;
    }

    docChanges.forEach((change) => {
      const id = change.doc.id;
      const rawDocData = change.doc.data();
      const data = { id, ...rawDocData } as DelegationGroup;
      const isTrueDelete = Boolean(data.isDeleted || change.type === "removed");

      if (isTrueDelete) {
        pendingDelegationsMap.current!.delete(id);
        pendingDelegationsChanged.current.delete(id);
        pendingDelegationsRemoved.current.add(id);
      } else {
        if (fromCache && isStaleCacheDoc(pendingDelegationsMap.current!.get(id), data)) return;
        pendingDelegationsMap.current!.set(id, data);
        pendingDelegationsChanged.current.set(id, data);
        pendingDelegationsRemoved.current.delete(id);
      }
    });

    if (delegationsBatchTimer.current) {
      clearTimeout(delegationsBatchTimer.current);
    }

    delegationsBatchTimer.current = setTimeout(() => {
      if (pendingDelegationsMap.current) {
        const updatedList = Array.from(pendingDelegationsMap.current.values());
        useAppStore.getState().setDelegationGroups(updatedList);
        
        const changed = Array.from(pendingDelegationsChanged.current.values());
        const removed = Array.from(pendingDelegationsRemoved.current);
        pendingDelegationsChanged.current.clear();
        pendingDelegationsRemoved.current.clear();
        
        if (changed.length > 0) offloadPersistSnapshot('taka_delegations', changed);
        removed.forEach((id) => { deleteLocalRecord('taka_delegations', id).catch(() => {}); });
        
        pendingDelegationsMap.current = null;
      }
    }, 100);
  }, []);

  // Sleep/Wake & Network Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      // Preserve active onSnapshot listeners in delegationsPool so Firestore SDK resumes via resumeToken
      if (useAppStore.getState().isDelegationsRequested) {
        hydrateDelegationsFromLocal(useAppStore.getState().globalYearFilter).catch(() => {});
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
      delegationsPool.current.forEach((u, key) => {
        u();
        usePerformanceStore.getState().unregisterListener(`taka_delegation_groups_${key}`);
      });
      delegationsPool.current.clear();
      delegationsTTLTimeouts.current.forEach((t) => clearTimeout(t));
      delegationsTTLTimeouts.current.clear();
      yearDelegationsCache.current.clear();
      if (delegationsBatchTimer.current) clearTimeout(delegationsBatchTimer.current);
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
        delegationsPool.current.forEach((u, key) => {
          u();
          usePerformanceStore.getState().unregisterListener(`taka_delegation_groups_${key}`);
        });
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
        // Reserve slot synchronously before awaiting IndexedDB to prevent duplicate listener attachment
        delegationsPool.current.set(year, () => {});

        const localCount = await hydrateDelegationsFromLocal(year);
        const isClosedOrPastYear = Number(year) < new Date().getFullYear();
        const currentDelegations = useAppStore.getState().delegationGroups || [];
        const hasLocalDelegations =
          localCount > 0 ||
          currentDelegations.some((d) => String(d.projectYear || "") === String(year));

        const deltaManaged =
          (hasLocalDelegations && isClosedOrPastYear) ||
          (DELTA_FIRST.delegations && hasLocalDelegations && hasFreshMarker(await getLoadedMarkers(), 'delegations_year', year));
        if (deltaManaged) {
          setIsDelegationsLoading(false);
          setCloudStatus("online");
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

        setIsDelegationsLoading(false);

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

        const existingUnsub = delegationsPool.current.get(year);
        if (existingUnsub) existingUnsub();

        usePerformanceStore.getState().registerListener(`taka_delegation_groups_${year}`);
        const unsub = onSnapshot(
          qDelegations,
          (snapshot) => {
            usePerformanceStore
              .getState()
              .trackSnapshot(`taka_delegation_groups_${year}`, snapshot);
            setIsDelegationsLoading(false);
            const fromCache = snapshot.metadata.fromCache;
            let changesToApply: any[] = snapshot.docChanges();

            if (!fromCache && !snapshot.metadata.hasPendingWrites) {
              const serverIds = new Set<string>();
              snapshot.docs.forEach((d) => serverIds.add(d.id));
              const nowMs = Date.now();
              const allowedLower = allowedStores.map((s) => s.toLowerCase());
              const isStoreRestricted =
                userRole !== "admin" && allowedLower.length > 0 && !allowedLower.includes("all");
              const currentDelegationsNow = useAppStore.getState().delegationGroups || [];
              currentDelegationsNow.forEach((g) => {
                const gYr = String(g.projectYear ?? (g as any).year ?? "").trim();
                if (g?.id && gYr === String(year).trim() && !serverIds.has(g.id)) {
                  const gSt = g.projectStore || (g as any).store;
                  if (
                    isStoreRestricted &&
                    gSt &&
                    !allowedLower.includes(String(gSt).trim().toLowerCase())
                  ) {
                    return;
                  }
                  const updatedMs = tsOf(g.updatedAt);
                  if (!updatedMs || nowMs - updatedMs > 30000) {
                    changesToApply.push({
                      type: "removed",
                      doc: { id: g.id, data: () => ({ ...g, isDeleted: true }) },
                    });
                  }
                }
              });
            }

            batchDelegationsUpdate(changesToApply, fromCache);
            setCloudStatus("online");

            if (!fromCache) {
              markLoaded('delegations_year', year).catch(() => {});
            }

            if (DELTA_FIRST.delegations && !fromCache) {
              const u = delegationsPool.current.get(year);
              delegationsPool.current.set(year, () => {});
              u?.();
              usePerformanceStore.getState().unregisterListener(`taka_delegation_groups_${year}`);
            }
          },
          (e) => {
            delegationsPool.current.delete(year);
            usePerformanceStore.getState().unregisterListener(`taka_delegation_groups_${year}`);
            setIsDelegationsLoading(false);
            console.error("Delegation groups listener error:", e);
          }
        );
        delegationsPool.current.set(year, unsub);
      } else {
        hydrateDelegationsFromLocal(year).catch(() => {});
        setIsDelegationsLoading(false);
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
