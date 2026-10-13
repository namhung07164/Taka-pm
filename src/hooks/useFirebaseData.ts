import {
  safeGetItemLocal,
  safeSetItemLocal,
  safeRemoveItemLocal,
  safeGetItemSession,
  safeSetItemSession,
  safeRemoveItemSession,
} from "../lib/storage";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import { usePerformanceStore } from "../store/usePerformanceStore";
import {   auth, db, APP_ID , writeBatch , setDoc } from "../lib/firebase";
import { getPendingUpdates, clearPendingUpdates } from "../lib/syncQueue";
import { recordBatchDeltas } from "../lib/deltaSyncService";
import { getEffectiveStoreFilter, getUserAllowedStores, ACTIVE_YEARS, PRIMARY_ACTIVE_YEARS, SECONDARY_ACTIVE_YEARS } from "../lib/utils";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { collection, onSnapshot, query, where, doc, getDocs, getDoc, limit, getDocsFromCache, getDocsFromServer } from 'firebase/firestore';
import {
  Project,
  Task,
  Cost,
  AppUser,
  DelegationGroup,
  PermissionMatrix,
  TabId,
  NotificationRule,
} from "../types";
import { setupStaticConfigSync } from "../lib/configCacheService";
import { startDeltaSyncService, pullAndApplyDeltas, triggerImmediateDeltaSync } from "../lib/deltaSyncService";
import { enforceStorageBudget } from "../lib/storageBudgetService";
import {
  bootstrapLocalStore,
  offloadPersistSnapshot,
  hydrateProjectsFromLocal,
  hydrateTasksFromLocal,
  hydrateTasksForProjects,
  hydrateCostsFromLocal,
  hydrateDelegationsFromLocal,
  hydrateDelegationsForProjects
} from "../lib/backgroundSyncWorker";
import { getLocalDelegations } from "../lib/localDb";
import { loadNotificationTasks } from "../lib/notificationTaskService";
import { deduplicateTasksInMemory } from "../lib/taskDeduplicationService";
import { cleanOrphanTasks } from "../lib/taskStateService";
import {
  fetchYearsMeta,
  setMemoryYearsMeta,
  isYearCacheValid,
  loadYearDataFromLocal,
  saveYearDataToLocal,
  YearsMetaMap,
} from "../lib/yearsFingerprintService";

let isArchiveLoaded = false;
const FIREBASE_HOOK_BOOT_TIME = Date.now();

export function useFirebaseData() {
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setUser = useAppStore((state) => state.setUser);
  const setProjects = useAppStore((state) => state.setProjects);
  const setTasks = useAppStore((state) => state.setTasks);
  const setAllProjectsForNotifs = useAppStore(
    (state) => state.setAllProjectsForNotifs,
  );
  const setAllTasksForNotifs = useAppStore(
    (state) => state.setAllTasksForNotifs,
  );
  const setCosts = useAppStore((state) => state.setCosts);
  const setNotificationRules = useAppStore(
    (state) => state.setNotificationRules,
  );
  const setAppUsers = useAppStore((state) => state.setAppUsers);
  const setSubAppUsers = useAppStore((state) => state.setSubAppUsers);
  const setLocations = useAppStore((state) => state.setLocations);
  const setLocationVisibility = useAppStore(
    (state) => state.setLocationVisibility,
  );
  const setPermissionMatrix = useAppStore((state) => state.setPermissionMatrix);
  const setJpyRate = useAppStore((state) => state.setJpyRate);
  const setUsdRate = useAppStore((state) => state.setUsdRate);
  const setParties = useAppStore((state) => state.setParties);
  const setDelegationGroups = useAppStore((state) => state.setDelegationGroups);
  const setCloudStatus = useAppStore((state) => state.setCloudStatus);
  const setToast = useAppStore((state) => state.setToast);

  const currentUser = useAppStore((state) => state.currentUser);
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const activeTab = useAppStore((state) => state.activeTab);
  const isTasksRequested = useAppStore((state) => state.isTasksRequested);
  const expandedProjectIds = useAppStore((state) => state.expandedProjectIds);
  const visibleActiveProjectIds = useAppStore((state) => state.visibleActiveProjectIds);
  const visibleActiveProjectIdsRef = useRef(visibleActiveProjectIds);
  visibleActiveProjectIdsRef.current = visibleActiveProjectIds;
  const searchActiveProjectIds = useAppStore((state) => state.searchActiveProjectIds);
  const setIsTasksRequested = useAppStore((state) => state.setIsTasksRequested);
  const setIsTasksLoading = useAppStore((state) => state.setIsTasksLoading);
  const isCostsRequested = useAppStore((state) => state.isCostsRequested);
  const setIsCostsRequested = useAppStore((state) => state.setIsCostsRequested);
  const setIsCostsLoading = useAppStore((state) => state.setIsCostsLoading);
  const isDelegationsRequested = useAppStore((state) => state.isDelegationsRequested);
  const setIsDelegationsRequested = useAppStore((state) => state.setIsDelegationsRequested);
  const setIsDelegationsLoading = useAppStore((state) => state.setIsDelegationsLoading);
  const isTaskModalOpen = useAppStore((state) => state.isTaskModalOpen);
  const isProjectModalOpen = useAppStore((state) => state.isProjectModalOpen);
  const modalInitialTab = useAppStore((state) => state.modalInitialTab);
  // We use user to trigger data fetch
  const user = useAppStore((state) => state.user);

  // Hoisted listener pools & TTL timeouts for access by both query effects and SleepWakeGuard
  const tasksPool = useRef<Map<string, () => void>>(new Map());
  const tasksTTLTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const costsPool = useRef<Map<string, () => void>>(new Map());
  const costsTTLTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const delegationsPool = useRef<Map<string, () => void>>(new Map());
  const delegationsTTLTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const yearDelegationsCache = useRef<Map<string, Map<string, DelegationGroup>>>(new Map());
  const knownHydratedProjectCodes = useRef<Set<string>>(new Set());
  const lastActiveTimestampRef = useRef<number>(Date.now());
  const TTL_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  // iOS Sleep/Wake Guard (Giai đoạn 1: Triệt tiêu bão đọc sau 2-4-8h)
  useEffect(() => {
    const handleSleepWake = () => {
      const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
      if (!isVisible) {
        lastActiveTimestampRef.current = Date.now();
        return;
      }

      const now = Date.now();
      const elapsedSleepMs = now - lastActiveTimestampRef.current;
      lastActiveTimestampRef.current = now;

      // Nếu máy ngủ hoặc tab không hoạt động > 10 phút (2h, 4h, 8h)
      const IS_LONG_SLEEP = elapsedSleepMs > 10 * 60 * 1000;
      if (IS_LONG_SLEEP) {
        // 1. Dọn sạch các listener cũ để chống lỗi token hết hạn gây full-scan read storm
        tasksPool.current.forEach((u) => u());
        tasksPool.current.clear();
        tasksTTLTimeouts.current.forEach((t) => clearTimeout(t));
        tasksTTLTimeouts.current.clear();

        costsPool.current.forEach((u) => u());
        costsPool.current.clear();
        costsTTLTimeouts.current.forEach((t) => clearTimeout(t));
        costsTTLTimeouts.current.clear();

        delegationsPool.current.forEach((u) => u());
        delegationsPool.current.clear();
        delegationsTTLTimeouts.current.forEach((t) => clearTimeout(t));
        delegationsTTLTimeouts.current.clear();

        // 2. Tái nạp 0ms từ IndexedDB (Dexie) nếu Safari dọn sạch bộ nhớ
        hydrateProjectsFromLocal().catch(() => {});
        if (useAppStore.getState().isTasksRequested) {
          hydrateTasksFromLocal().catch(() => {});
        }
        if (useAppStore.getState().isCostsRequested) {
          hydrateCostsFromLocal().catch(() => {});
        }
        if (useAppStore.getState().isDelegationsRequested) {
          hydrateDelegationsFromLocal(useAppStore.getState().globalYearFilter).catch(() => {});
        }

        // 3. Kích hoạt Delta Sync tức thì (chỉ kéo các thay đổi mới phát sinh trong thời gian ngủ)
        triggerImmediateDeltaSync(useAppStore.getState().globalYearFilter).catch(() => {});

        // 4. Kiểm tra ngân sách bộ nhớ 40MB iOS và ghi nhận kiểm toán thức giấc
        enforceStorageBudget().catch(() => {});
        const sleepMinutes = Math.round(elapsedSleepMs / 60000);
        usePerformanceStore
          .getState()
          .trackGetDoc('sleep_wake_recovery', true, 0, `Awoke after ${sleepMinutes}m sleep - Zero Read Delta Sync bypass`);
      }
    };

    document.addEventListener('visibilitychange', handleSleepWake);
    window.addEventListener('pageshow', handleSleepWake);
    window.addEventListener('focus', handleSleepWake);

    return () => {
      document.removeEventListener('visibilitychange', handleSleepWake);
      window.removeEventListener('pageshow', handleSleepWake);
      window.removeEventListener('focus', handleSleepWake);
    };
  }, []);

  // Lazy trigger & Visibility Tracker
  useEffect(() => {
    const evaluate = () => {
      const isVisible = document.visibilityState === 'visible';
      
      const tabsRequiringTasks: TabId[] = [
        "gantt",
        "detail",
        "calendar",
        "taskDelegation",
        "taskDelegationCalendar"
      ];
      const isChatOnly = isProjectModalOpen && modalInitialTab === 'chat';
      const isLayoutTab = activeTab === 'layout';
      const needsTasks = tabsRequiringTasks.includes(activeTab) || isTaskModalOpen || (isProjectModalOpen && !isChatOnly && !isLayoutTab);

      const tabsRequiringCosts: TabId[] = ["cost", "budget"];
      const needsCosts = tabsRequiringCosts.includes(activeTab) || (isProjectModalOpen && !isChatOnly && !isLayoutTab);

      const tabsRequiringDelegations: TabId[] = [
        "taskDelegation",
        "taskDelegationCalendar"
      ];
      const storeDelegations = useAppStore.getState().delegationGroups || [];
      const needsDelegations = tabsRequiringDelegations.includes(activeTab) || 
        isTaskModalOpen || 
        (isProjectModalOpen && !isChatOnly && !isLayoutTab) ||
        // If local Dexie/Zustand cache has zero delegations and user lands on Gantt/Detail/Notification, hydrate once
        (storeDelegations.length === 0 && (activeTab === "gantt" || activeTab === "detail" || activeTab === "notification"));

      // App is evaluating active tab needs. 
      // We NEVER unmount (set to false) because destroying the listener drops the IDB resumeToken,
      // causing massive read storms (4K-6K reads) if the user switches back to the tab or wakes the iOS PWA.
      // Keeping the listener alive is vastly cheaper than a full server re-sync.
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
      }
    };

    evaluate();
    document.addEventListener('visibilitychange', evaluate);
    window.addEventListener('pageshow', evaluate);
    window.addEventListener('focus', evaluate);
    return () => {
      document.removeEventListener('visibilitychange', evaluate);
      window.removeEventListener('pageshow', evaluate);
      window.removeEventListener('focus', evaluate);
    };
  }, [activeTab, isTaskModalOpen, isProjectModalOpen, modalInitialTab, setIsTasksRequested, setIsCostsRequested, setIsDelegationsRequested]);

  // Auth Effect

  useEffect(() => {
    const savedAuth = safeGetItemLocal("taka_auth_v1");
    if (savedAuth) {
      try {
        const parsedUser = JSON.parse(savedAuth);
        const localReadNotifsStr = safeGetItemLocal(
          `taka_read_notifs_${parsedUser.id}`,
        );
        if (localReadNotifsStr) {
          const localReadNotifs = JSON.parse(localReadNotifsStr);
          if (Array.isArray(localReadNotifs)) {
            parsedUser.readNotifs = Array.from(
              new Set([...(parsedUser.readNotifs || []), ...localReadNotifs]),
            );
          }
        }
        setCurrentUser(parsedUser);
        // Removed firstPage/lastTab setActiveTab calls to enforce Safe Boot to 'general'
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
      // Removed firstPage/lastTab setActiveTab calls to enforce Safe Boot to 'general'
    }

    let isMounted = true;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!isMounted) return;
      setUser(u);
    });

    // Only sign in anonymously if there is no cached credentials in Firebase Auth
    if (!auth.currentUser) {
      signInAnonymously(auth).catch(console.error);
    }

    return () => {
      isMounted = false;
      unsubAuth();
    };
  }, [setCurrentUser, setActiveTab, setUser]);

  // 1. Static/Global Config Data Fetch Effect (Only on authentication)
  // Use [user?.uid] instead of [user] as dependency to prevent 
  // re-triggering 8 static listeners when the user object reference changes.
  useEffect(() => {
    if (!user?.uid) return;

    const handleFetchError = (entity: string, error: any) => {
      console.error(`Error fetching static ${entity}:`, error);
      setCloudStatus("offline");
    };

    // Test connection with a lightweight read instead of continuous setDoc
    const testConnection = async () => {
      try {
        const timeSinceBoot = Date.now() - FIREBASE_HOOK_BOOT_TIME;
        // BẢO VỆ DỮ LIỆU DESKTOP: Chờ 15s để kéo Delta Sync & Local Dexie về xong mới quét và đẩy hàng đợi offline
        if (timeSinceBoot < 15000) {
          setTimeout(testConnection, 15000 - timeSinceBoot);
          return;
        }

        const pending = await getPendingUpdates();
        if (pending.length > 0) {
          const currentStore = useAppStore.getState();
          const liveTasks = new Map<string, any>((currentStore.tasks || []).map((t: any) => [t.id, t]));
          const liveProjects = new Map<string, any>((currentStore.projects || []).map((p: any) => [p.id, p]));
          const liveCosts = new Map<string, any>((currentStore.costs || []).map((c: any) => [c.id, c]));
          const liveDelegations = new Map<string, any>((currentStore.delegationGroups || []).map((d: any) => [d.id, d]));
          let skipped = 0;
          const validPending = pending.filter((u: any) => {
            const draftAt = u.data?.updatedAt ? new Date(u.data.updatedAt).getTime() : 0;
            // Safety: Skip drafts older than 1 hour to avoid resurrecting stale offline edits
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
              console.log("[Sync] Processed offline drafts.");
              setToast({
                title: "Sync Complete",
                message:
                  skipped > 0
                    ? `Đã đồng bộ dữ liệu offline (bỏ qua ${skipped} thay đổi cũ hơn dữ liệu hiện có).`
                    : "Offline data has been synced to the server.",
              });

              // Record batch deltas for synced items so other machines know
              const deltaItems = validPending.map((u: any) => {
                let collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations' = 'taka_projects';
                if (u.collectionPath.includes('taka_tasks')) collectionName = 'taka_tasks';
                else if (u.collectionPath.includes('taka_costs')) collectionName = 'taka_costs';
                else if (u.collectionPath.includes('taka_delegations')) collectionName = 'taka_delegations';

                return {
                  docId: u.docId,
                  collectionName,
                  action: (u.action === 'set' ? 'create' : u.action) as 'create' | 'update' | 'delete',
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
    window.addEventListener('online', testConnection);

    // Enterprise Cache + Versioning for static configs & users (locations, parties, rates, rules, permissions, sub_app_users, app_users)
    // Replaces multiple continuous listeners with 1 lightweight version watcher (Zero-Read on unchanged sessions)
    const unsubStaticConfig = setupStaticConfigSync();

    return () => {
      window.removeEventListener('online', testConnection);
      unsubStaticConfig();
    };
  }, [user?.uid]);

  // Sync currentUser profile whenever appUsers is updated via versioning cache
  const appUsers = useAppStore((state) => state.appUsers);

  useEffect(() => {
    if (!appUsers || appUsers.length === 0) return;
    const cur = useAppStore.getState().currentUser;
    if (cur && cur.id !== "guest") {
      const found = appUsers.find((u) => u.id === cur.id);
      if (found) {
        const localReadNotifsStr = safeGetItemLocal(
          `taka_read_notifs_${cur.id}`,
        );
        let localReadNotifs: string[] = [];
        if (localReadNotifsStr) {
          try {
            localReadNotifs = JSON.parse(localReadNotifsStr);
          } catch (e) {}
        }
        const mergedReadNotifs = Array.from(
          new Set([
            ...(found.readNotifs || []),
            ...(cur.readNotifs || []),
            ...localReadNotifs,
          ]),
        );

        // Only update currentUser if relevant profile or permission data actually changed
        const hasChanged =
          cur.role !== found.role ||
          cur.username !== found.username ||
          cur.canSee !== found.canSee ||
          cur.canWrite !== found.canWrite ||
          cur.byPartyAccess !== found.byPartyAccess ||
          JSON.stringify(cur.storePermissions) !==
            JSON.stringify(found.storePermissions) ||
          JSON.stringify(cur.locationPermissions) !==
            JSON.stringify(found.locationPermissions) ||
          JSON.stringify(cur.partyPermissions) !==
            JSON.stringify(found.partyPermissions) ||
          JSON.stringify(cur.preferences) !==
            JSON.stringify(found.preferences);

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
            useAppStore
              .getState()
              .setGlobalStoreFilter(found.preferences.defaultStore);
          }
          if (
            found.preferences?.defaultYear &&
            cur.preferences?.defaultYear !== found.preferences.defaultYear
          ) {
            useAppStore
              .getState()
              .setGlobalYearFilter(String(found.preferences.defaultYear));
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

  // Stable permission indicators to prevent re-querying Firestore on every profile/readNotifs change
  const userCanSee = currentUser?.role === "admin" || !!currentUser?.canSee;
  const userRole = currentUser?.role;
  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);

  // 3. Stable Query Signature (Đóng băng Chữ ký Truy vấn)
  // Ensures that fast rehydration of store variables doesn't trigger multiple duplicate Firebase queries.
  // CRITICAL: globalYearFilter is intentionally EXCLUDED so changing year filters utilizes the
  // Incremental Keep-Alive Pool (projectsPool, tasksPool, costsPool) instead of unmounting and refetching.
  const querySignature = useMemo(() => {
    if (!user?.uid || !userCanSee) return null;
    return `${user.uid}_${userRole}_${allowedStores.slice().sort().join('-')}`;
  }, [user?.uid, userCanSee, userRole, allowedStores]);

  // Layer 1 Security & Optimization: Build query to fetch only allowed stores AND selected year
  const buildStoreAndYearQuery = useCallback((colRef: any, storeField: string, yearField: string, yearValue: string) => {
    let q = colRef;
    
    // 1. Year Filter (strict equality + type safety)
    // To prevent massive read storms when iOS PWA drops the resume token overnight,
    // we MUST filter by year at the Firestore level.
    // We use "in" to handle both String and Number types safely without composite indexes.
    if (yearValue && String(yearValue).toLowerCase() !== "all") {
      q = query(q, where(yearField, "in", [String(yearValue), Number(yearValue)]));
    }
    
    // 2. Store Filter
    if (userRole !== 'admin') {
      if (allowedStores.length === 0) {
        // No access
        q = query(q, where(storeField, '==', 'NONE_NO_ACCESS'));
      } else if (allowedStores.length === 1) {
        // Single store access -> safe to support both uppercase and lowercase values
        const singleStore = allowedStores[0];
        q = query(q, where(storeField, 'in', [singleStore, singleStore.toLowerCase()]));
      } else {
        // Has both HCM and HN -> No need to filter by store field since those are the only 2 options.
        // This avoids using 'in' combined with '==', preventing "Missing composite index" errors!
      }
    }
    
    return q;
  }, [userRole, allowedStores]);

  // 2.1 Unified Global Delta Sync for Projects (Native Firebase Cache)
  const projectsPool = useRef<Map<string, () => void>>(new Map());
  const prevSigProjects = useRef<string>("");
  const remoteYearsMetaRef = useRef<YearsMetaMap>({});

  useEffect(() => {
    // Stage 3: Instant Local-First Boot from Dexie (~5ms, 0 Read, 0 Network)
    bootstrapLocalStore().catch(() => {});

    fetchYearsMeta().then((meta) => {
      remoteYearsMetaRef.current = meta;
      setMemoryYearsMeta(meta);
    });

    // Start Background Delta Sync Service (Stage 2 Delta Pipeline)
    const stopDeltaSync = startDeltaSyncService();
    return () => {
      stopDeltaSync();
    };
  }, []);

  // Atomic batching buffers for Projects and Tasks updates to prevent JS main thread freezing
  const pendingProjectsMap = useRef<Map<string, Project> | null>(null);
  const projectsBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchProjectsUpdate = useCallback((docChanges: any[]) => {
    if (!pendingProjectsMap.current) {
      const currentProjects = useAppStore.getState().projects || [];
      const map = new Map<string, Project>();
      currentProjects.forEach(p => map.set(p.id, p));
      pendingProjectsMap.current = map;
    }

    docChanges.forEach((change) => {
      const data = { id: change.doc.id, ...change.doc.data() } as Project;
      if (change.type === "removed" || data.isDeleted) {
        pendingProjectsMap.current!.delete(change.doc.id);
      } else {
        pendingProjectsMap.current!.set(change.doc.id, data);
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
        offloadPersistSnapshot('taka_projects', updatedList);
        const setNotifs = useAppStore.getState().setAllProjectsForNotifs;
        if (setNotifs) setNotifs(updatedList);
        pendingProjectsMap.current = null;
      }
      projectsBatchTimer.current = null;
    }, 40);
  }, []);

  const pendingTasksMap = useRef<Map<string, Task> | null>(null);
  const tasksBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchTasksUpdate = useCallback((docChanges: any[]) => {
    if (!pendingTasksMap.current) {
      const currentTasks = useAppStore.getState().tasks || [];
      const map = new Map<string, Task>();
      currentTasks.forEach(t => map.set(t.id, t));
      pendingTasksMap.current = map;
    }

    docChanges.forEach((change) => {
      const data = { id: change.doc.id, ...change.doc.data() } as Task;
      if (change.type === "removed" || data.isDeleted) {
        pendingTasksMap.current!.delete(change.doc.id);
      } else {
        pendingTasksMap.current!.set(change.doc.id, data);
      }
    });

    if (tasksBatchTimer.current) {
      clearTimeout(tasksBatchTimer.current);
    }

    tasksBatchTimer.current = setTimeout(() => {
      if (pendingTasksMap.current) {
        const rawList = Array.from(pendingTasksMap.current.values());
        const projects = useAppStore.getState().projects || [];
        const { dedupedTasks, duplicateCount, removedTaskIds } = deduplicateTasksInMemory(rawList, projects);
        const { cleaned: finalTasks } = cleanOrphanTasks(dedupedTasks);
        finalTasks.sort((a, b) => {
          if (a.projectCode !== b.projectCode) {
            return (a.projectCode || "").localeCompare(b.projectCode || "");
          }
          return (a.orderIndex || 0) - (b.orderIndex || 0);
        });
        useAppStore.getState().setTasks(finalTasks);
        offloadPersistSnapshot('taka_tasks', finalTasks);
        const setNotifs = useAppStore.getState().setAllTasksForNotifs;
        if (setNotifs) setNotifs(finalTasks);
        pendingTasksMap.current = null;
      }
      tasksBatchTimer.current = null;
    }, 120);
  }, []);

  useEffect(() => {
    return () => {
      projectsPool.current.forEach(u => u());
      projectsPool.current.clear();
      if (projectsBatchTimer.current) clearTimeout(projectsBatchTimer.current);
      if (tasksBatchTimer.current) clearTimeout(tasksBatchTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!querySignature) return;

    if (prevSigProjects.current !== querySignature) {
      projectsPool.current.forEach(u => u());
      projectsPool.current.clear();
      prevSigProjects.current = querySignature;
    }

    const isAllYears = globalYearFilter === 'all' || globalYearFilter === 'ALL';
    const liveTargetYears = isAllYears ? PRIMARY_ACTIVE_YEARS : [globalYearFilter];

    liveTargetYears.forEach(async (year) => {
      if (!projectsPool.current.has(year)) {
        // Step 1: Instant Local-First Dexie Hydration (0ms, 0 Read)
        const localCount = await hydrateProjectsFromLocal(year, globalStoreFilter);
        
        // Metadata Fingerprinting check: If local cache is valid or data is already hydrated for PAST/CLOSED years (< 2026)
        const isClosedOrPastYear = Number(year) < 2026;
        const hasLocalData = localCount > 0 || (useAppStore.getState().projects || []).some(p => String(p.year) === String(year));

        if (hasLocalData && isClosedOrPastYear) {
          // If we already have local projects for a PAST/CLOSED year, mark pool as active (0 Read full table query)
          // and catch any latest changes via lightweight Delta Sync Pipeline (0-2 reads)
          projectsPool.current.set(year, () => {});
          pullAndApplyDeltas(year).then(() => setCloudStatus("online")).catch(() => {});
          usePerformanceStore.getState().trackGetDoc(`taka_projects_${year}`, true, localCount, 'Dexie Local-First Projects Hydration (0 Read full collection)');
          return;
        }

        if (isClosedOrPastYear && isYearCacheValid(year, remoteYearsMetaRef.current)) {
          const cached = loadYearDataFromLocal(year);
          if (cached && cached.projects && cached.projects.length > 0) {
            batchProjectsUpdate(
              cached.projects.map((p) => ({
                type: 'added',
                doc: { id: p.id, data: () => p },
              }))
            );
            usePerformanceStore.getState().trackGetDoc(`taka_projects_${year}`, true, cached.projects.length, 'Metadata Fingerprint Cache Hit');
            projectsPool.current.set(year, () => {});
            return;
          }
        }

        const qProjects = buildStoreAndYearQuery(collection(db, "artifacts", APP_ID, "public", "data", "taka_projects"), "store", "year", year);
        
        usePerformanceStore.getState().registerListener(`taka_projects_${year}`);
        const unsub = onSnapshot(
          qProjects,
          (snapshot) => {
            usePerformanceStore.getState().trackSnapshot(`taka_projects_${year}`, snapshot);
            batchProjectsUpdate(snapshot.docChanges());
            setCloudStatus("online");

            // Cache to local storage with fingerprint
            const yearProjects = snapshot.docs
              .map((d) => ({ id: d.id, ...d.data() } as Project))
              .filter((p) => !p.isDeleted);
            if (yearProjects.length > 0) {
              const updatedAt = remoteYearsMetaRef.current[year]?.updatedAt || new Date().toISOString();
              saveYearDataToLocal(year, updatedAt, { projects: yearProjects });
              offloadPersistSnapshot('taka_projects', yearProjects);
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

    // When "All Years" is chosen, secondary future years (2028-2030) are hydrated via zero-read Cache-First
    // instead of creating wasteful long-lived WebSocket listeners.
    if (isAllYears) {
      SECONDARY_ACTIVE_YEARS.forEach(async (year) => {
        if (projectsPool.current.has(year)) return;
        try {
          const qProjects = buildStoreAndYearQuery(
            collection(db, "artifacts", APP_ID, "public", "data", "taka_projects"),
            "store",
            "year",
            year
          );
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
            currentProjects.forEach(p => projectMap.set(p.id, p));

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

  }, [querySignature, buildStoreAndYearQuery, globalYearFilter]);

  // 2.2 Local-First Notification Query for Tasks (0 Read from Dexie with Safe Firestore Fallback)
  useEffect(() => {
    let isCancelled = false;
    let intervalId: NodeJS.Timeout | null = null;

    if (!querySignature || isTasksRequested) {
      return;
    }

    const fetchNotifs = async () => {
      if (isCancelled) return;
      try {
        const loadedNotifTasks = await loadNotificationTasks();
        if (isCancelled) return;
        setAllTasksForNotifs(loadedNotifTasks);
      } catch (e) {
        console.warn("[useFirebaseData] Notification lightweight tasks query error:", e);
      }
    };

    // Initial fetch (Instant 0ms from Dexie Local DB)
    fetchNotifs();

    // Poll every 4 hours (14400000 ms)
    const POLL_INTERVAL_MS = 4 * 60 * 60 * 1000;
    intervalId = setInterval(fetchNotifs, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [querySignature, isTasksRequested]);

  // 2.3 Unified Global Delta Sync for Tasks (Native Firebase Cache with TTL)
  const prevQuerySigTasks = useRef<string>("");
  const prevSigTasks = useRef<string>("");

  useEffect(() => {
    return () => {
      tasksPool.current.forEach(u => u());
      tasksPool.current.clear();
      tasksTTLTimeouts.current.forEach(t => clearTimeout(t));
      tasksTTLTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!querySignature) return;

    const activeProjectIds = isTasksRequested
      ? [...new Set([...expandedProjectIds, ...searchActiveProjectIds])]
      : [];
    const currentSig = `${querySignature}_${activeProjectIds.join(',')}_${isTasksRequested}`;

    if (prevQuerySigTasks.current !== querySignature) {
      // If querySignature (role/perms) truly changes, clear everything immediately
      if (prevQuerySigTasks.current !== "") {
        tasksPool.current.forEach(u => u());
        tasksPool.current.clear();
        tasksTTLTimeouts.current.forEach(t => clearTimeout(t));
        tasksTTLTimeouts.current.clear();
      }
      prevQuerySigTasks.current = querySignature;
    }
    prevSigTasks.current = currentSig;

    if (activeProjectIds.length === 0) {
      // Start TTL cleanup for any existing listeners when all projects collapsed
      Array.from(tasksPool.current.keys()).forEach(key => {
        if (!tasksTTLTimeouts.current.has(key)) {
          const timeoutId = setTimeout(() => {
            const unsub = tasksPool.current.get(key);
            if (unsub) unsub();
            tasksPool.current.delete(key);
            tasksTTLTimeouts.current.delete(key);
            usePerformanceStore.getState().unregisterListener(`taka_tasks_${key}`);
          }, TTL_DURATION_MS);
          tasksTTLTimeouts.current.set(key, timeoutId);
        }
      });
      setIsTasksLoading(false);
      return;
    }

    // Instant 0ms Dexie Local-First Hydration for active projects
    let isCancelled = false;
    const runTasksSync = async () => {
      const currentProjects = useAppStore.getState().projects || [];
      const keysToHydrate = new Set<string>();
      activeProjectIds.forEach(id => {
        keysToHydrate.add(String(id));
        const matched = currentProjects.find(p => 
          String(p.id || '') === String(id) || 
          String(p.no) === String(id) || 
          String(p.code || '') === String(id) ||
          `${p.code}-${p.year}-${p.store}-${p.no}` === String(id)
        );
        if (matched) {
          if (matched.id) keysToHydrate.add(String(matched.id));
          if (matched.code) keysToHydrate.add(String(matched.code));
          if (matched.linkCodes) {
            matched.linkCodes.split(/[,;/]+/).forEach(c => {
              if (c.trim()) keysToHydrate.add(c.trim());
            });
          }
        }
      });

      await Promise.all([
        hydrateTasksForProjects(Array.from(keysToHydrate)),
        hydrateDelegationsForProjects(activeProjectIds)
      ]);
      if (isCancelled) return;

      setIsTasksLoading(true);

      // Group active projects by year to optimize: if > 10 projects in a year, use 1 consolidated query for that year
      const projectsByYear = new Map<string, Array<{ id: string; code: string }>>();
    
    activeProjectIds.forEach(projectId => {
      const proj = currentProjects.find(p => 
        String(p.id || '') === String(projectId) || 
        String(p.no) === String(projectId) ||
        String(p.code || '') === String(projectId) ||
        `${p.code}-${p.year}-${p.store}-${p.no}` === String(projectId)
      );
      const codeToQuery = proj?.code || String(projectId);
      const yearToGroup = proj?.year 
        ? String(proj.year).trim() 
        : (proj?.start ? String(proj.start).substring(0, 4) : (globalYearFilter !== 'all' ? globalYearFilter : '2026'));
      
      let list = projectsByYear.get(yearToGroup);
      if (!list) {
        list = [];
        projectsByYear.set(yearToGroup, list);
      }
      list.push({ id: String(projectId), code: codeToQuery });
    });

    const neededKeys = new Set<string>();

    projectsByYear.forEach((projs, year) => {
      if (projs.length > 10) {
        // ① BATCH / CONSOLIDATED QUERY for year when > 10 projects are active (e.g. Expand All)
        const yearKey = `year_${year}`;
        neededKeys.add(yearKey);

        // Cancel any pending TTL timeout for this year query
        if (tasksTTLTimeouts.current.has(yearKey)) {
          clearTimeout(tasksTTLTimeouts.current.get(yearKey)!);
          tasksTTLTimeouts.current.delete(yearKey);
        }

        // Clean up any overlapping individual listeners for this year to avoid duplicate socket overhead
        projs.forEach(p => {
          const pKey = `proj_${p.id}`;
          if (tasksPool.current.has(pKey)) {
            const u = tasksPool.current.get(pKey);
            if (u) u();
            tasksPool.current.delete(pKey);
            usePerformanceStore.getState().unregisterListener(`taka_tasks_${pKey}`);
          }
        });

        if (!tasksPool.current.has(yearKey)) {
          const currentTasks = useAppStore.getState().tasks || [];
          const hasLocalYearTasks = currentTasks.some(t => String(t.projectYear || '') === String(year));
          const isClosedOrPastYear = Number(year) < 2026;

          if (hasLocalYearTasks && isClosedOrPastYear) {
            // Local-First: Đã có tasks của năm cũ trong Dexie/Zustand -> Giữ pool hoạt động (0 Read full collection)
            // và đồng bộ các thay đổi mới qua Delta Pipeline (0-2 reads)
            tasksPool.current.set(yearKey, () => {});
            setIsTasksLoading(false);
            pullAndApplyDeltas(year).then(() => setCloudStatus("online")).catch(() => {});
            usePerformanceStore.getState().trackGetDoc(`taka_tasks_${yearKey}`, true, currentTasks.length, 'Dexie Local-First Tasks (0 Read full collection)');
          } else {
            const qTasks = buildStoreAndYearQuery(
              collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
              "projectStore",
              "projectYear",
              year
            );

            usePerformanceStore.getState().registerListener(`taka_tasks_${yearKey}`);
            const unsub = onSnapshot(
              qTasks,
              (snapshot) => {
                usePerformanceStore.getState().trackSnapshot(`taka_tasks_${yearKey}`, snapshot);
                setIsTasksLoading(false);
                batchTasksUpdate(snapshot.docChanges());
                setCloudStatus("online");
              },
              (e) => {
                setIsTasksLoading(false);
                console.error("Tasks consolidated listener error:", e);
                setCloudStatus("offline");
              }
            );
            tasksPool.current.set(yearKey, unsub);
          }
        }
      } else {
        // Individual listeners for <= 10 projects
        // Sort with viewport priority (visible projects attached first)
        const visibleSet = new Set((visibleActiveProjectIdsRef.current || []).map(id => String(id)));
        const sortedProjs = [...projs].sort((a, b) => {
          const aVis = visibleSet.has(a.id) || visibleSet.has(a.code) ? 1 : 0;
          const bVis = visibleSet.has(b.id) || visibleSet.has(b.code) ? 1 : 0;
          return bVis - aVis;
        });

        sortedProjs.forEach(p => {
          const projKey = `proj_${p.id}`;
          const yearKey = `year_${year}`;
          
          // If the consolidated year query is already running, no need for individual listener
          if (tasksPool.current.has(yearKey)) {
            neededKeys.add(yearKey);
            return;
          }

          neededKeys.add(projKey);

          if (tasksTTLTimeouts.current.has(projKey)) {
            clearTimeout(tasksTTLTimeouts.current.get(projKey)!);
            tasksTTLTimeouts.current.delete(projKey);
          }

          if (!tasksPool.current.has(projKey)) {
            const currentTasks = useAppStore.getState().tasks || [];
            const hasLocalProjTasks = currentTasks.some(t => String(t.projectCode || '') === String(p.code)) || knownHydratedProjectCodes.current.has(p.code);
            const isClosedOrPastYear = Number(year) < 2026;

            if (hasLocalProjTasks && isClosedOrPastYear) {
              // Local-First: Đã có tasks của dự án năm cũ trong Dexie/Zustand -> Giữ pool hoạt động (0 Read)
              tasksPool.current.set(projKey, () => {});
              setIsTasksLoading(false);
              pullAndApplyDeltas(year).then(() => setCloudStatus("online")).catch(() => {});
              usePerformanceStore.getState().trackGetDoc(`taka_tasks_${projKey}`, true, 1, 'Dexie Local-First Project Tasks (0 Read)');
            } else {
              const qTasks = query(
                collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
                where("projectCode", "==", p.code)
              );

              usePerformanceStore.getState().registerListener(`taka_tasks_${projKey}`);
              const unsub = onSnapshot(
                qTasks,
                (snapshot) => {
                  knownHydratedProjectCodes.current.add(p.code);
                  usePerformanceStore.getState().trackSnapshot(`taka_tasks_${projKey}`, snapshot);
                  setIsTasksLoading(false);
                  batchTasksUpdate(snapshot.docChanges());
                  setCloudStatus("online");
                },
                (e) => {
                  setIsTasksLoading(false);
                  console.error("Tasks listener error:", e);
                  setCloudStatus("offline");
                }
              );
              tasksPool.current.set(projKey, unsub);
            }
          }
        });
      }
    });

    // Clean up or start TTL on listeners no longer needed
      Array.from(tasksPool.current.keys()).forEach(key => {
        if (!neededKeys.has(key)) {
          if (!tasksTTLTimeouts.current.has(key)) {
            const timeoutId = setTimeout(() => {
              const unsub = tasksPool.current.get(key);
              if (unsub) unsub();
              tasksPool.current.delete(key);
              tasksTTLTimeouts.current.delete(key);
              usePerformanceStore.getState().unregisterListener(`taka_tasks_${key}`);
            }, TTL_DURATION_MS);
            tasksTTLTimeouts.current.set(key, timeoutId);
          }
        }
      });
    };

    runTasksSync().catch(err => {
      console.warn("[useFirebaseData] runTasksSync error:", err);
    });

    return () => {
      isCancelled = true;
    };
  }, [querySignature, isTasksRequested, expandedProjectIds, searchActiveProjectIds, globalYearFilter, buildStoreAndYearQuery]);

  // 2.4 Delta Sync for Costs (Native Firebase Cache for active target years with Keep-Alive Pool)
  const prevSigCosts = useRef<string>("");

  useEffect(() => {
    return () => {
      costsPool.current.forEach(u => u());
      costsPool.current.clear();
      costsTTLTimeouts.current.forEach(t => clearTimeout(t));
      costsTTLTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!querySignature || !isCostsRequested) {
      if (!isCostsRequested) {
        setIsCostsLoading(false);
        // Start TTL cleanup for costs listeners if not requested (15 min)
        Array.from(costsPool.current.keys()).forEach(key => {
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

    // Cancel pending TTL timeouts when costs requested
    costsTTLTimeouts.current.forEach(t => clearTimeout(t));
    costsTTLTimeouts.current.clear();

    if (prevSigCosts.current !== querySignature) {
      costsPool.current.forEach(u => u());
      costsPool.current.clear();
      prevSigCosts.current = querySignature;
    }

    const isAllYears = globalYearFilter === 'all' || globalYearFilter === 'ALL';
    const liveTargetYears = isAllYears ? PRIMARY_ACTIVE_YEARS : [globalYearFilter];

    setIsCostsLoading(true);

    liveTargetYears.forEach(async (year) => {
      if (!costsPool.current.has(year)) {
        const localCount = await hydrateCostsFromLocal();
        const currentCosts = useAppStore.getState().costs || [];
        const hasLocalCosts = localCount > 0 || currentCosts.some(c => String(c.projectYear || '') === String(year));
        const isClosedOrPastYear = Number(year) < 2026;

        if (hasLocalCosts && isClosedOrPastYear) {
          costsPool.current.set(year, () => {});
          setIsCostsLoading(false);
          pullAndApplyDeltas(year).then(() => setCloudStatus("online")).catch(() => {});
          usePerformanceStore.getState().trackGetDoc(`taka_costs_${year}`, true, localCount, 'Dexie Local-First Costs (0 Read full collection)');
          return;
        } else {
          const qCosts = buildStoreAndYearQuery(
            collection(db, "artifacts", APP_ID, "public", "data", "taka_costs"),
            "projectStore",
            "projectYear",
            year
          );

          usePerformanceStore.getState().registerListener(`taka_costs_${year}`);
          const unsub = onSnapshot(
            qCosts,
            (snapshot) => {
              usePerformanceStore.getState().trackSnapshot(`taka_costs_${year}`, snapshot);
              setIsCostsLoading(false);

              const currentCosts = useAppStore.getState().costs || [];
              const costMap = new Map<string, Cost>();
              currentCosts.forEach(c => costMap.set(c.id, c));

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
          const qCosts = buildStoreAndYearQuery(
            collection(db, "artifacts", APP_ID, "public", "data", "taka_costs"),
            "projectStore",
            "projectYear",
            year
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
            const currentCosts = useAppStore.getState().costs || [];
            const costMap = new Map<string, Cost>();
            currentCosts.forEach(c => costMap.set(c.id, c));

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

  }, [querySignature, isCostsRequested, buildStoreAndYearQuery, globalYearFilter]);

  // 2.5 Delta Sync for Delegation Groups (Native Firebase Cache with TTL)
  const prevQuerySigDelegations = useRef<string>("");
  const prevSigDelegations = useRef<string>("");

  useEffect(() => {
    return () => {
      delegationsPool.current.forEach(u => u());
      delegationsPool.current.clear();
      delegationsTTLTimeouts.current.forEach(t => clearTimeout(t));
      delegationsTTLTimeouts.current.clear();
      yearDelegationsCache.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!querySignature) return;

    const isAllYears = globalYearFilter === 'all' || globalYearFilter === 'ALL';
    const targetYears = isDelegationsRequested 
      ? (isAllYears ? PRIMARY_ACTIVE_YEARS : [globalYearFilter]) 
      : [];
    const currentSig = `${querySignature}_${targetYears.join(',')}_${isDelegationsRequested}`;

    if (prevQuerySigDelegations.current !== querySignature) {
      // If querySignature (role/perms) changes, clear everything immediately
      if (prevQuerySigDelegations.current !== "") {
        delegationsPool.current.forEach(u => u());
        delegationsPool.current.clear();
        delegationsTTLTimeouts.current.forEach(t => clearTimeout(t));
        delegationsTTLTimeouts.current.clear();
        yearDelegationsCache.current.clear();
      }
      prevQuerySigDelegations.current = querySignature;
    }
    prevSigDelegations.current = currentSig;

    const activeYearsSet = new Set(targetYears);
    Array.from(delegationsPool.current.keys()).forEach(year => {
      if (!activeYearsSet.has(year)) {
        // Year is no longer active, start TTL garbage collection
        if (!delegationsTTLTimeouts.current.has(year)) {
          const timeoutId = setTimeout(() => {
            const unsub = delegationsPool.current.get(year);
            if (unsub) unsub();
            delegationsPool.current.delete(year);
            delegationsTTLTimeouts.current.delete(year);
            yearDelegationsCache.current.delete(year);
            usePerformanceStore.getState().unregisterListener(`taka_delegation_groups_${year}`);
            // Free RAM: If no delegation listeners remain and delegations are not requested, release Zustand array
            if (delegationsPool.current.size === 0 && !useAppStore.getState().isDelegationsRequested) {
              useAppStore.getState().setDelegationGroups([]);
            }
          }, TTL_DURATION_MS);
          delegationsTTLTimeouts.current.set(year, timeoutId);
        }
      } else {
        // Year is active, clear any pending TTL
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
        // Step 1: Instant Local-First Dexie Hydration (0ms, 0 Read)
        const localCount = await hydrateDelegationsFromLocal(year);
        const isClosedOrPastYear = Number(year) < 2026;
        const currentDelegations = useAppStore.getState().delegationGroups || [];
        const hasLocalDelegations = localCount > 0 || currentDelegations.some(d => String(d.projectYear || '') === String(year));

        if (hasLocalDelegations && isClosedOrPastYear) {
          delegationsPool.current.set(year, () => {});
          setIsDelegationsLoading(false);
          pullAndApplyDeltas(year).then(() => setCloudStatus("online")).catch(() => {});
          usePerformanceStore.getState().trackGetDoc(`taka_delegation_groups_${year}`, true, localCount, 'Dexie Local-First Delegations (0 Read full collection)');
          return;
        }

        // Concurrency guard: Mark pending immediately so duplicate onSnapshot listeners cannot be created concurrently
        delegationsPool.current.set(year, () => {});
        setIsDelegationsLoading(false);

        // Pre-populate yearDelegationsCache with local Dexie items if available to eliminate memory latency
        if (!yearDelegationsCache.current.has(year)) {
          yearDelegationsCache.current.set(year, new Map());
        }
        const yearMap = yearDelegationsCache.current.get(year)!;
        if (localCount > 0) {
          const localItems = await getLocalDelegations(year);
          localItems.forEach(d => {
            if (d.id) yearMap.set(d.id, d);
          });
          // Catch recent mutations via lightweight delta sync (0-1 read instead of full collection read)
          pullAndApplyDeltas(year).then(() => setCloudStatus("online")).catch(() => {});
        }

        const qDelegations = buildStoreAndYearQuery(
          collection(db, "artifacts", APP_ID, "public", "data", "taka_delegation_groups"),
          "projectStore",
          "projectYear",
          year
        );
        
        usePerformanceStore.getState().registerListener(`taka_delegation_groups_${year}`);
        const unsub = onSnapshot(
          qDelegations,
          (snapshot) => {
            usePerformanceStore.getState().trackSnapshot(`taka_delegation_groups_${year}`, snapshot);
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

            // Aggregate only across active year caches to keep RAM footprint compact
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
            offloadPersistSnapshot('taka_delegations', loaded);
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

  }, [querySignature, isDelegationsRequested, buildStoreAndYearQuery, globalYearFilter]);

  // 3. Cold Storage Archive Fetcher (2024, 2025)
  useEffect(() => {
    if ((globalYearFilter !== 'all' && globalYearFilter !== 'ALL') || isArchiveLoaded) return;

    let isCancelled = false;

    const fetchArchive = async () => {
      try {
        const { getDownloadURL, ref } = await import("firebase/storage");
        const { storage } = await import("../lib/firebase");
        
        const archiveRef = ref(storage, "archives/taka_archive.json");
        const url = await getDownloadURL(archiveRef);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();
        
        if (isCancelled) return;

        // Append to existing store arrays safely
        const currentProjects = useAppStore.getState().projects || [];
        const newProjects = [...currentProjects];
        const pMap = new Map(newProjects.map(p => [p.id, p]));
        (data.taka_projects || []).forEach((p: any) => pMap.set(p.id, p));
        useAppStore.getState().setProjects(Array.from(pMap.values()));

        const currentTasks = useAppStore.getState().tasks || [];
        const newTasks = [...currentTasks];
        const tMap = new Map(newTasks.map(t => [t.id, t]));
        (data.taka_tasks || []).forEach((t: any) => tMap.set(t.id, t));
        const rawLoadedTasks = Array.from(tMap.values());
        const { dedupedTasks } = deduplicateTasksInMemory(rawLoadedTasks, useAppStore.getState().projects);
        useAppStore.getState().setTasks(dedupedTasks);

        const currentCosts = useAppStore.getState().costs || [];
        const newCosts = [...currentCosts];
        const cMap = new Map(newCosts.map(c => [c.id, c]));
        (data.taka_costs || []).forEach((c: any) => cMap.set(c.id, c));
        useAppStore.getState().setCosts(Array.from(cMap.values()));

        const currentDelegations = useAppStore.getState().delegationGroups || [];
        const newDelegations = [...currentDelegations];
        const dMap = new Map(newDelegations.map(d => [d.id!, d]));
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
