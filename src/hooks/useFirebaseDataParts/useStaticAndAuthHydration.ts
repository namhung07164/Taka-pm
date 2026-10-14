import { useEffect, useRef } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { doc } from "firebase/firestore";
import { writeBatch } from "../../lib/firestoreWrites";
import { useAppStore } from "../../store/useAppStore";
import { usePerformanceStore } from "../../store/usePerformanceStore";
import { auth, db } from "../../lib/firebase";
import { safeGetItemLocal, safeSetItemLocal } from "../../lib/storage";
import { getPendingUpdates, clearPendingUpdates } from "../../lib/syncQueue";
import { recordBatchDeltas } from "../../lib/deltaSyncService";
import { setupStaticConfigSync } from "../../lib/configCacheService";
import { enforceStorageBudget } from "../../lib/storageBudgetService";
import {
  hydrateProjectsFromLocal,
  hydrateTasksFromLocal,
  hydrateCostsFromLocal,
  hydrateDelegationsFromLocal,
  hydrateDelegationsForProjects,
} from "../../lib/backgroundSyncWorker";
import { deduplicateTasksInMemory } from "../../lib/taskDeduplicationService";
import { AppUser, TabId } from "../../types";

let isArchiveLoaded = false;
const FIREBASE_HOOK_BOOT_TIME = Date.now();

export function useStaticAndAuthHydration() {
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const setUser = useAppStore((state) => state.setUser);
  const setCloudStatus = useAppStore((state) => state.setCloudStatus);
  const setToast = useAppStore((state) => state.setToast);

  const activeTab = useAppStore((state) => state.activeTab);
  const isTaskModalOpen = useAppStore((state) => state.isTaskModalOpen);
  const isProjectModalOpen = useAppStore((state) => state.isProjectModalOpen);
  const modalInitialTab = useAppStore((state) => state.modalInitialTab);
  const setIsTasksRequested = useAppStore((state) => state.setIsTasksRequested);
  const setIsCostsRequested = useAppStore((state) => state.setIsCostsRequested);
  const setIsDelegationsRequested = useAppStore((state) => state.setIsDelegationsRequested);

  const user = useAppStore((state) => state.user);
  const appUsers = useAppStore((state) => state.appUsers);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);

  const lastActiveTimestampRef = useRef<number>(Date.now());

  // 1. Sleep / Wake Guard
  useEffect(() => {
    const handleSleepWake = () => {
      const isVisible = typeof document !== "undefined" && document.visibilityState === "visible";
      if (!isVisible) {
        lastActiveTimestampRef.current = Date.now();
        return;
      }

      const now = Date.now();
      const elapsedSleepMs = now - lastActiveTimestampRef.current;
      lastActiveTimestampRef.current = now;

      const IS_LONG_SLEEP = elapsedSleepMs > 10 * 60 * 1000; // > 10 min
      if (IS_LONG_SLEEP) {
        // Dispatch recovery event to sub-hooks
        window.dispatchEvent(
          new CustomEvent("taka_sleep_wake_recovery", { detail: { elapsedSleepMs } })
        );

        // Check iOS 40MB storage budget and log audit
        enforceStorageBudget().catch(() => {});
        const sleepMinutes = Math.round(elapsedSleepMs / 60000);
        usePerformanceStore
          .getState()
          .trackGetDoc(
            "sleep_wake_recovery",
            true,
            0,
            `Awoke after ${sleepMinutes}m sleep - Zero Read Delta Sync bypass`
          );
      }
    };

    document.addEventListener("visibilitychange", handleSleepWake);
    window.addEventListener("pageshow", handleSleepWake);
    window.addEventListener("focus", handleSleepWake);

    return () => {
      document.removeEventListener("visibilitychange", handleSleepWake);
      window.removeEventListener("pageshow", handleSleepWake);
      window.removeEventListener("focus", handleSleepWake);
    };
  }, []);

  // 2. Tri-Gate Lazy trigger & Visibility Tracker
  useEffect(() => {
    const evaluate = () => {
      const tabsRequiringTasks: TabId[] = [
        "gantt",
        "detail",
        "calendar",
        "taskDelegation",
        "taskDelegationCalendar",
      ];
      const isChatOnly = isProjectModalOpen && modalInitialTab === "chat";
      const isLayoutTab = activeTab === "layout";
      const needsTasks =
        tabsRequiringTasks.includes(activeTab) ||
        isTaskModalOpen ||
        (isProjectModalOpen && !isChatOnly && !isLayoutTab);

      const tabsRequiringCosts: TabId[] = ["cost", "budget"];
      const needsCosts =
        tabsRequiringCosts.includes(activeTab) ||
        (isProjectModalOpen && !isChatOnly && !isLayoutTab);

      const tabsRequiringDelegations: TabId[] = ["taskDelegation", "taskDelegationCalendar"];
      const needsDelegations = tabsRequiringDelegations.includes(activeTab);

      if (needsTasks) {
        setIsTasksRequested(true);
        hydrateTasksFromLocal().catch(() => {});
      }
      if (needsCosts) {
        setIsCostsRequested(true);
        hydrateCostsFromLocal().catch(() => {});
      }
      if (needsDelegations) {
        setIsDelegationsRequested(true);
        hydrateDelegationsFromLocal(useAppStore.getState().globalYearFilter).catch(() => {});
      } else {
        const store = useAppStore.getState();
        const openProjectKeys: string[] = [];
        if (store.editingProject?.id) openProjectKeys.push(store.editingProject.id);
        if (store.editingProject?.code) openProjectKeys.push(store.editingProject.code);
        if (store.editingTask?.projectId) openProjectKeys.push(store.editingTask.projectId);
        if (store.editingTask?.projectCode) openProjectKeys.push(store.editingTask.projectCode);
        if (openProjectKeys.length > 0) {
          hydrateDelegationsForProjects(openProjectKeys).catch(() => {});
        }
      }
    };

    evaluate();
    document.addEventListener("visibilitychange", evaluate);
    window.addEventListener("pageshow", evaluate);
    window.addEventListener("focus", evaluate);
    return () => {
      document.removeEventListener("visibilitychange", evaluate);
      window.removeEventListener("pageshow", evaluate);
      window.removeEventListener("focus", evaluate);
    };
  }, [
    activeTab,
    isTaskModalOpen,
    isProjectModalOpen,
    modalInitialTab,
    setIsTasksRequested,
    setIsCostsRequested,
    setIsDelegationsRequested,
  ]);

  // 3. Auth Effect
  useEffect(() => {
    const savedAuth = safeGetItemLocal("taka_auth_v1");
    if (savedAuth) {
      try {
        const parsedUser = JSON.parse(savedAuth);
        const localReadNotifsStr = safeGetItemLocal(`taka_read_notifs_${parsedUser.id}`);
        if (localReadNotifsStr) {
          const localReadNotifs = JSON.parse(localReadNotifsStr);
          if (Array.isArray(localReadNotifs)) {
            parsedUser.readNotifs = Array.from(
              new Set([...(parsedUser.readNotifs || []), ...localReadNotifs])
            );
          }
        }
        setCurrentUser(parsedUser);
      } catch (e) {
        console.error("Error parsing savedAuth", e);
      }
    } else {
      const guestReadNotifsStr = safeGetItemLocal("taka_read_notifs_guest");
      if (guestReadNotifsStr) {
        try {
          const guestRead = JSON.parse(guestReadNotifsStr);
          const cur = useAppStore.getState().currentUser;
          if (cur && cur.id === "guest" && Array.isArray(guestRead)) {
            setCurrentUser({ ...cur, readNotifs: guestRead });
          }
        } catch (e) {}
      }
    }

    let isMounted = true;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!isMounted) return;
      setUser(u);
    });

    if (!auth.currentUser) {
      signInAnonymously(auth).catch(console.error);
    }

    return () => {
      isMounted = false;
      unsubAuth();
    };
  }, [setCurrentUser, setUser]);

  // 4. Static / Global Config Data Fetch Effect & Offline Draft Sync
  useEffect(() => {
    if (!user?.uid) return;

    const testConnection = async () => {
      try {
        const timeSinceBoot = Date.now() - FIREBASE_HOOK_BOOT_TIME;
        if (timeSinceBoot < 15000) {
          setTimeout(testConnection, 15000 - timeSinceBoot);
          return;
        }

        const pending = await getPendingUpdates();
        if (pending.length > 0) {
          const currentStore = useAppStore.getState();
          const liveTasks = new Map<string, any>(
            (currentStore.tasks || []).map((t: any) => [t.id, t])
          );
          const liveProjects = new Map<string, any>(
            (currentStore.projects || []).map((p: any) => [p.id, p])
          );
          const liveCosts = new Map<string, any>(
            (currentStore.costs || []).map((c: any) => [c.id, c])
          );
          const liveDelegations = new Map<string, any>(
            (currentStore.delegationGroups || []).map((d: any) => [d.id, d])
          );
          let skipped = 0;
          const validPending = pending.filter((u: any) => {
            const draftAt = u.data?.updatedAt ? new Date(u.data.updatedAt).getTime() : 0;
            if (draftAt && Date.now() - draftAt > 60 * 60 * 1000) {
              skipped++;
              return false;
            }
            if (u.action === "delete") return true;

            let liveItem: any = undefined;
            const path = String(u.collectionPath || "");
            if (path.includes("taka_tasks")) liveItem = liveTasks.get(u.docId);
            else if (path.includes("taka_projects")) liveItem = liveProjects.get(u.docId);
            else if (path.includes("taka_costs")) liveItem = liveCosts.get(u.docId);
            else if (path.includes("taka_delegation")) liveItem = liveDelegations.get(u.docId);

            const liveAt = liveItem?.updatedAt ? new Date(liveItem.updatedAt).getTime() : 0;
            if (draftAt && liveAt && liveAt > draftAt + 1000) {
              skipped++;
              return false;
            }
            return true;
          });

          if (validPending.length === 0) {
            clearPendingUpdates();
            if (skipped > 0) {
              setToast({
                title: "Sync",
                message: `Đã bỏ qua ${skipped} thay đổi offline cũ vì đã có dữ liệu mới hơn.`,
              });
            }
            return;
          }

          const batch = writeBatch(db);
          validPending.forEach((update: any) => {
            const ref = doc(db, update.collectionPath, update.docId);
            if (update.action === "set") {
              batch.set(ref, update.data, { merge: true });
            } else if (update.action === "update") {
              batch.update(ref, update.data);
            } else if (update.action === "delete") {
              batch.delete(ref);
            }
          });
          batch
            .commit()
            .then(() => {
              clearPendingUpdates();
              setToast({
                title: "Sync Complete",
                message:
                  skipped > 0
                    ? `Đã đồng bộ dữ liệu offline (bỏ qua ${skipped} thay đổi cũ hơn dữ liệu hiện có).`
                    : "Offline data has been synced to the server.",
              });

              const deltaItems = validPending.map((u: any) => {
                let collectionName:
                  | "taka_projects"
                  | "taka_tasks"
                  | "taka_costs"
                  | "taka_delegations" = "taka_projects";
                if (u.collectionPath.includes("taka_tasks")) collectionName = "taka_tasks";
                else if (u.collectionPath.includes("taka_costs")) collectionName = "taka_costs";
                else if (u.collectionPath.includes("taka_delegations"))
                  collectionName = "taka_delegations";

                return {
                  docId: u.docId,
                  collectionName,
                  action: (u.action === "set" ? "create" : u.action) as
                    | "create"
                    | "update"
                    | "delete",
                  data: u.data || {},
                  year: u.data?.year || u.data?.projectYear ? String(u.data?.year || u.data?.projectYear) : undefined,
                };
              });
              if (deltaItems.length > 0) {
                recordBatchDeltas(deltaItems).catch(() => {});
              }
            })
            .catch((e: any) => {
              console.error(e);
              setCloudStatus("offline");
            });
        }
      } catch (error) {
        setCloudStatus("offline");
        if (error instanceof Error && error.message.includes("permission")) {
          setToast({
            title: "Authentication / Database Error",
            message: "Missing or insufficient permissions.",
          });
        }
      }
    };
    testConnection();
    window.addEventListener("online", testConnection);

    const unsubStaticConfig = setupStaticConfigSync();

    return () => {
      window.removeEventListener("online", testConnection);
      unsubStaticConfig();
    };
  }, [user?.uid, setCloudStatus, setToast]);

  // 5. Sync Profile Effect
  useEffect(() => {
    if (!appUsers || appUsers.length === 0) return;
    const cur = useAppStore.getState().currentUser;
    if (cur && cur.id !== "guest") {
      const found = appUsers.find((u) => u.id === cur.id);
      if (found) {
        const localReadNotifsStr = safeGetItemLocal(`taka_read_notifs_${cur.id}`);
        let localReadNotifs: string[] = [];
        if (localReadNotifsStr) {
          try {
            localReadNotifs = JSON.parse(localReadNotifsStr);
          } catch (e) {}
        }
        const mergedReadNotifs = Array.from(
          new Set([...(found.readNotifs || []), ...(cur.readNotifs || []), ...localReadNotifs])
        );

        const hasChanged =
          cur.role !== found.role ||
          cur.username !== found.username ||
          cur.canSee !== found.canSee ||
          cur.canWrite !== found.canWrite ||
          cur.byPartyAccess !== found.byPartyAccess ||
          JSON.stringify(cur.storePermissions) !== JSON.stringify(found.storePermissions) ||
          JSON.stringify(cur.locationPermissions) !== JSON.stringify(found.locationPermissions) ||
          JSON.stringify(cur.partyPermissions) !== JSON.stringify(found.partyPermissions) ||
          JSON.stringify(cur.preferences) !== JSON.stringify(found.preferences);

        if (hasChanged) {
          const updated: AppUser = {
            ...cur,
            ...found,
            readNotifs: mergedReadNotifs,
          };
          setCurrentUser(updated);
          safeSetItemLocal("taka_auth_v1", JSON.stringify(updated));

          if (
            found.preferences?.defaultStore &&
            cur.preferences?.defaultStore !== found.preferences.defaultStore
          ) {
            useAppStore.getState().setGlobalStoreFilter(found.preferences.defaultStore);
          }
          if (
            found.preferences?.defaultYear &&
            cur.preferences?.defaultYear !== found.preferences.defaultYear
          ) {
            useAppStore.getState().setGlobalYearFilter(String(found.preferences.defaultYear));
          }
          if (
            found.preferences?.currency &&
            cur.preferences?.currency !== found.preferences.currency
          ) {
            useAppStore.getState().setCurrency(found.preferences.currency);
          }
        }
      }
    }
  }, [appUsers, setCurrentUser]);

  // 6. Cold Storage Archive Fetcher
  useEffect(() => {
    if ((globalYearFilter !== "all" && globalYearFilter !== "ALL") || isArchiveLoaded) return;

    let isCancelled = false;

    const fetchArchive = async () => {
      try {
        const { getDownloadURL, ref } = await import("firebase/storage");
        const { storage } = await import("../../lib/firebase");

        const archiveRef = ref(storage, "archives/taka_archive.json");
        const url = await getDownloadURL(archiveRef);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();

        if (isCancelled) return;

        const currentProjects = useAppStore.getState().projects || [];
        const newProjects = [...currentProjects];
        const pMap = new Map(newProjects.map((p) => [p.id, p]));
        (data.taka_projects || []).forEach((p: any) => pMap.set(p.id, p));
        useAppStore.getState().setProjects(Array.from(pMap.values()));

        const currentTasks = useAppStore.getState().tasks || [];
        const newTasks = [...currentTasks];
        const tMap = new Map(newTasks.map((t) => [t.id, t]));
        (data.taka_tasks || []).forEach((t: any) => tMap.set(t.id, t));
        const rawLoadedTasks = Array.from(tMap.values());
        const { dedupedTasks } = deduplicateTasksInMemory(
          rawLoadedTasks,
          useAppStore.getState().projects
        );
        useAppStore.getState().setTasks(dedupedTasks);

        const currentCosts = useAppStore.getState().costs || [];
        const newCosts = [...currentCosts];
        const cMap = new Map(newCosts.map((c) => [c.id, c]));
        (data.taka_costs || []).forEach((c: any) => cMap.set(c.id, c));
        useAppStore.getState().setCosts(Array.from(cMap.values()));

        const currentDelegations = useAppStore.getState().delegationGroups || [];
        const newDelegations = [...currentDelegations];
        const dMap = new Map(newDelegations.map((d) => [d.id!, d]));
        (data.taka_delegation_groups || []).forEach((d: any) => dMap.set(d.id, d));
        useAppStore.getState().setDelegationGroups(Array.from(dMap.values()));

        isArchiveLoaded = true;
        console.log("Archive data successfully loaded into memory");
      } catch (err) {
        console.warn("No archive data found or error fetching archive", err);
      }
    };

    fetchArchive();

    return () => {
      isCancelled = true;
    };
  }, [globalYearFilter]);
}
