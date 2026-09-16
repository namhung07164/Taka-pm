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
import { getEffectiveStoreFilter, ACTIVE_YEARS } from "../lib/utils";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { collection, onSnapshot, query, where, doc, getDocs, getDoc, limit } from 'firebase/firestore';
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

let isArchiveLoaded = false;

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
  // We use user to trigger data fetch
  const user = useAppStore((state) => state.user);

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
      const needsTasks = tabsRequiringTasks.includes(activeTab) || isTaskModalOpen || isProjectModalOpen;

      const tabsRequiringCosts: TabId[] = ["cost", "budget"];
      const needsCosts = tabsRequiringCosts.includes(activeTab) || isProjectModalOpen;

      const tabsRequiringDelegations: TabId[] = [
        "gantt",
        "detail",
        "taskDelegation",
        "taskDelegationCalendar",
        "notification"
      ];
      const needsDelegations = tabsRequiringDelegations.includes(activeTab) || isTaskModalOpen || isProjectModalOpen;

      // App is evaluating active tab needs. 
      // We NEVER unmount (set to false) because destroying the listener drops the IDB resumeToken,
      // causing massive read storms (4K-6K reads) if the user switches back to the tab or wakes the iOS PWA.
      // Keeping the listener alive is vastly cheaper than a full server re-sync.
      if (needsTasks) setIsTasksRequested(true);
      if (needsCosts) setIsCostsRequested(true);
      if (needsDelegations) setIsDelegationsRequested(true);
    };

    evaluate();
    document.addEventListener('visibilitychange', evaluate);
    return () => {
      document.removeEventListener('visibilitychange', evaluate);
    };
  }, [activeTab, isTaskModalOpen, isProjectModalOpen, setIsTasksRequested, setIsCostsRequested, setIsDelegationsRequested]);

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
        const pending = await getPendingUpdates();
        if (pending.length > 0) {
          const batch = writeBatch(db);
          pending.forEach((update) => {
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
                message: "Offline data has been synced to the server.",
              });
            })
            .catch((e) => {
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

    // Global queries (Realtime listeners for config & users)
    usePerformanceStore.getState().registerListener("taka_users");
    const unsubUsers = onSnapshot(
      collection(db, "artifacts", APP_ID, "public", "data", "taka_users"),
      (snapshot) => {
        usePerformanceStore.getState().trackSnapshot("taka_users", snapshot);
        const loaded: AppUser[] = [];
        snapshot.forEach((docSnap) =>
          loaded.push({ id: docSnap.id, ...docSnap.data() } as AppUser),
        );
        const currentUsers = useAppStore.getState().appUsers;
        if (JSON.stringify(currentUsers) !== JSON.stringify(loaded)) {
          setAppUsers(loaded);
        }

        const cur = useAppStore.getState().currentUser;
        if (cur && cur.id !== "guest") {
          const found = loaded.find((u) => u.id === cur.id);
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

              // Sync hybrid UI state if it changed from remote
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
      },
      (e) => handleFetchError("users", e),
    );

    usePerformanceStore.getState().registerListener("taka_sub_app_users");
    const unsubSubUsers = onSnapshot(
      collection(
        db,
        "artifacts",
        APP_ID,
        "public",
        "data",
        "taka_sub_app_users",
      ),
      (snapshot) => {
        usePerformanceStore.getState().trackSnapshot("taka_sub_app_users", snapshot);
        const loaded: any[] = [];
        snapshot.forEach((docSnap) =>
          loaded.push({ id: docSnap.id, ...docSnap.data() }),
        );

        setSubAppUsers(loaded);
      },
      (e) => handleFetchError("sub users", e),
    );

    // Load permissions from IDB first for instant startup
    // Load global project and task caches from IDB for zero-read instant notification calculation
    usePerformanceStore.getState().registerListener("taka_settings/permissions");
    const unsubPerms = onSnapshot(
      doc(
        db,
        "artifacts",
        APP_ID,
        "public",
        "data",
        "taka_settings",
        "permissions",
      ),
      (docSnap) => {
        usePerformanceStore.getState().trackSnapshot("taka_settings/permissions", docSnap);
        if (docSnap.exists()) {
          const data = docSnap.data();

          setPermissionMatrix(data as PermissionMatrix);
                  }
      },
      (e) => handleFetchError("perms", e),
    );

    // Enterprise Cache + Versioning for truly static configs (locations, parties, exchange rates, notification rules)
    // Replaces 4 continuous listeners with 1 lightweight version watcher (Zero-Read on unchanged sessions)
    const unsubStaticConfig = setupStaticConfigSync();

    // Delegation groups are now fetched in a separate useEffect
    
    return () => {
      window.removeEventListener('online', testConnection);
      unsubUsers();
      unsubSubUsers();
      unsubPerms();
      unsubStaticConfig();
      usePerformanceStore.getState().unregisterListener("taka_users");
      usePerformanceStore.getState().unregisterListener("taka_sub_app_users");
      usePerformanceStore.getState().unregisterListener("taka_settings/permissions");
    };
  }, [user?.uid]);

  // Stable permission indicators to prevent re-querying Firestore on every profile/readNotifs change
  const userCanSee = currentUser?.role === "admin" || !!currentUser?.canSee;
  const userRole = currentUser?.role;
  const userHcmPerm = !!currentUser?.storePermissions?.hcm;
  const userHnPerm = !!currentUser?.storePermissions?.hn;

  // 3. Stable Query Signature (Đóng băng Chữ ký Truy vấn)
  // Ensures that fast rehydration of store variables doesn't trigger multiple duplicate Firebase queries.
  // CRITICAL: globalYearFilter is intentionally EXCLUDED so changing year filters utilizes the
  // Incremental Keep-Alive Pool (projectsPool, tasksPool, costsPool) instead of unmounting and refetching.
  const querySignature = useMemo(() => {
    if (!user?.uid || !userCanSee) return null;
    return `${user.uid}_${userRole}_${userHcmPerm}_${userHnPerm}`;
  }, [user?.uid, userCanSee, userRole, userHcmPerm, userHnPerm]);

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
      const stores: string[] = [];

      if (userHcmPerm) stores.push('HCM');
      if (userHnPerm) stores.push('HN');
      
      if (stores.length === 0) {
        // No access
        q = query(q, where(storeField, '==', 'NONE_NO_ACCESS'));
      } else if (stores.length === 1) {
        // Single store access -> safe to use == along with year == (index merging handles it automatically)
        q = query(q, where(storeField, '==', stores[0]));
      } else {
        // Has both HCM and HN -> No need to filter by store field since those are the only 2 options.
        // This avoids using 'in' combined with '==', preventing "Missing composite index" errors!
      }
    }
    
    return q;
  }, [userRole, userHcmPerm, userHnPerm]);

  // 2.1 Unified Global Delta Sync for Projects (Native Firebase Cache)
  const projectsPool = useRef<Map<string, () => void>>(new Map());
  const prevSigProjects = useRef<string>("");

  useEffect(() => {
    return () => {
      projectsPool.current.forEach(u => u());
      projectsPool.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!querySignature) return;

    if (prevSigProjects.current !== querySignature) {
      projectsPool.current.forEach(u => u());
      projectsPool.current.clear();
      prevSigProjects.current = querySignature;
    }

    const targetYears = (globalYearFilter === 'all' || globalYearFilter === 'ALL')
      ? ACTIVE_YEARS
      : [globalYearFilter];

    targetYears.forEach(year => {
      if (!projectsPool.current.has(year)) {
        const qProjects = buildStoreAndYearQuery(collection(db, "artifacts", APP_ID, "public", "data", "taka_projects"), "store", "year", year);
        
        usePerformanceStore.getState().registerListener(`taka_projects_${year}`);
        const unsub = onSnapshot(
          qProjects,
          (snapshot) => {
            usePerformanceStore.getState().trackSnapshot(`taka_projects_${year}`, snapshot);
            
            const currentProjects = useAppStore.getState().projects || [];
            const projectMap = new Map<string, Project>();
            currentProjects.forEach(p => projectMap.set(p.id, p));

            snapshot.docChanges().forEach((change) => {
              const data = { id: change.doc.id, ...change.doc.data() } as Project;
              if (change.type === "removed" || data.isDeleted) {
                projectMap.delete(change.doc.id);
              } else {
                projectMap.set(change.doc.id, data);
              }
            });

            const updatedList = Array.from(projectMap.values());
            updatedList.sort((a, b) => (a.no || 0) - (b.no || 0));
            
            // Re-fetch setProjects from Zustand directly to avoid dependency issues
            useAppStore.getState().setProjects(updatedList);
            const setNotifs = useAppStore.getState().setAllProjectsForNotifs;
            if (setNotifs) setNotifs(updatedList);
            
            setCloudStatus("online");
          },
          (e) => {
            console.error("Projects listener error:", e);
            setCloudStatus("offline");
          }
        );
        projectsPool.current.set(year, unsub);
      }
    });

  }, [querySignature, buildStoreAndYearQuery, globalYearFilter]);

  // 2.2 Lightweight Always-on Notification Query for Tasks (Polling instead of onSnapshot to save Reads)
  useEffect(() => {
    let isCancelled = false;
    let intervalId: NodeJS.Timeout | null = null;

    if (!querySignature || isTasksRequested) {
      return;
    }

    const fetchNotifs = async () => {
      if (isCancelled) return;
      try {
        const now = new Date();
        const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
        const future30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

        const qNotifTasks = query(
          collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
          where("finish", ">=", past30),
          where("finish", "<=", future30),
          limit(150)
        );

        // Uses getDocs instead of onSnapshot to prevent continuous read storms for background data
        const snapshot = await getDocs(qNotifTasks);
        if (isCancelled) return;

        const loadedNotifTasks: Task[] = [];
        snapshot.forEach((docSnap) => {
          const data = { id: docSnap.id, ...docSnap.data() } as Task;
          if (!data.isDeleted) {
            loadedNotifTasks.push(data);
          }
        });
        setAllTasksForNotifs(loadedNotifTasks);
      } catch (e) {
        console.warn("[useFirebaseData] Notification lightweight tasks query error:", e);
      }
    };

    // Initial fetch
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
  const tasksPool = useRef<Map<string, () => void>>(new Map());
  const prevSigTasks = useRef<string>("");
  const tasksTTLTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const TTL_DURATION_MS = 15 * 60 * 1000; // 15 minutes

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

    if (prevSigTasks.current !== currentSig) {
      // If querySignature (role/perms) changes, clear everything immediately
      const isSignatureChanged = prevSigTasks.current.split('_')[0] !== querySignature;
      if (isSignatureChanged && prevSigTasks.current !== "") {
        tasksPool.current.forEach(u => u());
        tasksPool.current.clear();
        tasksTTLTimeouts.current.forEach(t => clearTimeout(t));
        tasksTTLTimeouts.current.clear();
      } else {
        const currentExpandedSet = new Set(activeProjectIds);
        Array.from(tasksPool.current.keys()).forEach(projectId => {
          if (!currentExpandedSet.has(projectId)) {
            // Project is no longer active, start TTL garbage collection
            if (!tasksTTLTimeouts.current.has(projectId)) {
              const timeoutId = setTimeout(() => {
                const unsub = tasksPool.current.get(projectId);
                if (unsub) unsub();
                tasksPool.current.delete(projectId);
                tasksTTLTimeouts.current.delete(projectId);
                usePerformanceStore.getState().unregisterListener(`taka_tasks_${projectId}`);
              }, TTL_DURATION_MS);
              tasksTTLTimeouts.current.set(projectId, timeoutId);
            }
          } else {
            // Project is active, clear any pending TTL
            if (tasksTTLTimeouts.current.has(projectId)) {
              clearTimeout(tasksTTLTimeouts.current.get(projectId)!);
              tasksTTLTimeouts.current.delete(projectId);
            }
          }
        });
      }
      prevSigTasks.current = currentSig;
    }

    if (activeProjectIds.length === 0) {
      return;
    }

    setIsTasksLoading(true);

    activeProjectIds.forEach(projectId => {
      // Find the project object to get its actual 'code' because taka_tasks stores 'projectCode', not 'projectId'.
      // If we don't have the exact code, we can fallback to projectId assuming it might be the code in some cases.
      const currentProjects = useAppStore.getState().projects || [];
      const proj = currentProjects.find(p => String(p.id || '') === String(projectId) || String(p.no) === String(projectId));
      const codeToQuery = proj?.code || projectId;

      if (!tasksPool.current.has(projectId)) {
        const qTasks = query(
          collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
          where("projectCode", "==", codeToQuery)
        );
        
        usePerformanceStore.getState().registerListener(`taka_tasks_${projectId}`);
        const unsub = onSnapshot(
          qTasks,
          (snapshot) => {
            usePerformanceStore.getState().trackSnapshot(`taka_tasks_${projectId}`, snapshot);
            setIsTasksLoading(false);
            
            const currentTasks = useAppStore.getState().tasks || [];
            const taskMap = new Map<string, Task>();
            currentTasks.forEach(t => taskMap.set(t.id, t));

            snapshot.docChanges().forEach((change) => {
              const data = { id: change.doc.id, ...change.doc.data() } as Task;
              if (change.type === "removed" || data.isDeleted) {
                taskMap.delete(change.doc.id);
              } else {
                taskMap.set(change.doc.id, data);
              }
            });

            const updatedList = Array.from(taskMap.values());
            updatedList.sort((a, b) => {
              if (a.projectCode !== b.projectCode) {
                return (a.projectCode || "").localeCompare(b.projectCode || "");
              }
              return (a.orderIndex || 0) - (b.orderIndex || 0);
            });
            
            // Re-fetch setters from Zustand directly
            useAppStore.getState().setTasks(updatedList);
            const setNotifs = useAppStore.getState().setAllTasksForNotifs;
            if (setNotifs) setNotifs(updatedList);
            
            setCloudStatus("online");
          },
          (e) => {
            setIsTasksLoading(false);
            console.error("Tasks listener error:", e);
            setCloudStatus("offline");
          }
        );
        tasksPool.current.set(projectId, unsub);
      }
    });
  }, [querySignature, isTasksRequested, expandedProjectIds, searchActiveProjectIds]);

  // 2.4 Delta Sync for Costs (Native Firebase Cache with TTL)
  const costsPool = useRef<Map<string, () => void>>(new Map());
  const prevSigCosts = useRef<string>("");
  const costsTTLTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    return () => {
      costsPool.current.forEach(u => u());
      costsPool.current.clear();
      costsTTLTimeouts.current.forEach(t => clearTimeout(t));
      costsTTLTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!querySignature) return;

    const targetYears = isCostsRequested ? (globalYearFilter === 'all' || globalYearFilter === 'ALL' ? ACTIVE_YEARS : [globalYearFilter]) : [];
    const currentSig = `${querySignature}_${targetYears.join(',')}_${isCostsRequested}`;

    if (prevSigCosts.current !== currentSig) {
      // If querySignature (role/perms) changes, clear everything immediately
      const isSignatureChanged = prevSigCosts.current.split('_')[0] !== querySignature;
      
      if (isSignatureChanged && prevSigCosts.current !== "") {
        costsPool.current.forEach(u => u());
        costsPool.current.clear();
        costsTTLTimeouts.current.forEach(t => clearTimeout(t));
        costsTTLTimeouts.current.clear();
      } else {
        const activeYearsSet = new Set(targetYears);
        Array.from(costsPool.current.keys()).forEach(year => {
          if (!activeYearsSet.has(year)) {
            // Year is no longer active, start TTL garbage collection
            if (!costsTTLTimeouts.current.has(year)) {
              const timeoutId = setTimeout(() => {
                const unsub = costsPool.current.get(year);
                if (unsub) unsub();
                costsPool.current.delete(year);
                costsTTLTimeouts.current.delete(year);
                usePerformanceStore.getState().unregisterListener(`taka_costs_${year}`);
              }, TTL_DURATION_MS);
              costsTTLTimeouts.current.set(year, timeoutId);
            }
          } else {
            // Year is active, clear any pending TTL
            if (costsTTLTimeouts.current.has(year)) {
              clearTimeout(costsTTLTimeouts.current.get(year)!);
              costsTTLTimeouts.current.delete(year);
            }
          }
        });
      }
      prevSigCosts.current = currentSig;
    }

    if (targetYears.length === 0) {
      return;
    }

    setIsCostsLoading(true);

    targetYears.forEach(year => {
      if (!costsPool.current.has(year)) {
        const qCosts = buildStoreAndYearQuery(collection(db, "artifacts", APP_ID, "public", "data", "taka_costs"), "projectStore", "projectYear", year);
        
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
    });

  }, [querySignature, isCostsRequested, buildStoreAndYearQuery, globalYearFilter]);

  // 2.5 Delta Sync for Delegation Groups (Native Firebase Cache with TTL)
  const delegationsPool = useRef<Map<string, () => void>>(new Map());
  const prevSigDelegations = useRef<string>("");
  const delegationsTTLTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    return () => {
      delegationsPool.current.forEach(u => u());
      delegationsPool.current.clear();
      delegationsTTLTimeouts.current.forEach(t => clearTimeout(t));
      delegationsTTLTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!querySignature) return;

    const targetYears = isDelegationsRequested ? (globalYearFilter === 'all' || globalYearFilter === 'ALL' ? ACTIVE_YEARS : [globalYearFilter]) : [];
    const currentSig = `${querySignature}_${targetYears.join(',')}_${isDelegationsRequested}`;

    if (prevSigDelegations.current !== currentSig) {
      // If querySignature (role/perms) changes, clear everything immediately
      const isSignatureChanged = prevSigDelegations.current.split('_')[0] !== querySignature;
      
      if (isSignatureChanged && prevSigDelegations.current !== "") {
        delegationsPool.current.forEach(u => u());
        delegationsPool.current.clear();
        delegationsTTLTimeouts.current.forEach(t => clearTimeout(t));
        delegationsTTLTimeouts.current.clear();
      } else {
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
                usePerformanceStore.getState().unregisterListener(`taka_delegation_groups_${year}`);
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
      }
      prevSigDelegations.current = currentSig;
    }

    if (targetYears.length === 0) {
      return;
    }

    setIsDelegationsLoading(true);

    targetYears.forEach(year => {
      if (!delegationsPool.current.has(year)) {
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
            
            const currentDelegations = useAppStore.getState().delegationGroups || [];
            const delegationMap = new Map<string, DelegationGroup>();
            currentDelegations.forEach(d => delegationMap.set(d.id!, d));

            snapshot.docChanges().forEach((change) => {
              const data = { id: change.doc.id, ...change.doc.data() } as DelegationGroup;
              if (change.type === "removed") {
                delegationMap.delete(change.doc.id);
              } else {
                delegationMap.set(change.doc.id, data);
              }
            });

            const loaded: DelegationGroup[] = [];
            const seenParentTaskIds = new Set<string>();

            for (const data of delegationMap.values()) {
              if (data.parentTaskId) {
                if (!seenParentTaskIds.has(data.parentTaskId)) {
                  seenParentTaskIds.add(data.parentTaskId);
                  loaded.push(data);
                }
              } else {
                loaded.push(data);
              }
            }

            useAppStore.getState().setDelegationGroups(loaded);
          },
          (e) => {
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
        useAppStore.getState().setTasks(Array.from(tMap.values()));

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
