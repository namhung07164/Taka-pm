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
import { getLoadedMarkers, hasMarker, markLoaded } from "../../lib/loadedMarkers";

// Delta-first: sau lần tải đầy đủ đầu tiên, hủy onSnapshot lớn, dựa vào Dexie + kênh delta.
// Bật TỪNG CÁI sau khi đã test. Mặc định tắt = hành vi hiện tại.
const DELTA_FIRST = { projects: false, tasks: false, costs: false, delegations: false };


interface UseDelegationsHydrationProps {
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

  // Sleep/Wake Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      // KHÔNG hủy listener và KHÔNG xóa cache năm khi thức giấc (xem giải thích ở B1).
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
        const localCount = await hydrateDelegationsFromLocal(year);
        const isClosedOrPastYear = Number(year) < new Date().getFullYear();
        const currentDelegations = useAppStore.getState().delegationGroups || [];
        const hasLocalDelegations =
          localCount > 0 ||
          currentDelegations.some((d) => String(d.projectYear || "") === String(year));

        const deltaManaged =
          (hasLocalDelegations && isClosedOrPastYear) ||
          (DELTA_FIRST.delegations && hasMarker(await getLoadedMarkers(), 'delegations_year', year));
        if (deltaManaged) {
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
            batchDelegationsUpdate(snapshot.docChanges(), snapshot.metadata.fromCache);

            if (DELTA_FIRST.delegations && !snapshot.metadata.fromCache) {
              markLoaded('delegations_year', year).catch(() => {});
              const u = delegationsPool.current.get(year);
              delegationsPool.current.set(year, () => {});
              u?.();
              usePerformanceStore.getState().unregisterListener(`taka_delegation_groups_${year}`);
            }
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
