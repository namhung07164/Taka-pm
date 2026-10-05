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
import {
  fetchYearsMeta,
  isYearCacheValid,
  loadYearDataFromLocal,
  saveYearDataToLocal,
  YearsMetaMap,
} from "../lib/yearsFingerprintService";

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
  const modalInitialTab = useAppStore((state) => state.modalInitialTab);
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
      const isChatOnly = isProjectModalOpen && modalInitialTab === 'chat';
      const isLayoutTab = activeTab === 'layout';
      const needsTasks = tabsRequiringTasks.includes(activeTab) || isTaskModalOpen || (isProjectModalOpen && !isChatOnly && !isLayoutTab);

      const tabsRequiringCosts: TabId[] = ["cost", "budget"];
      const needsCosts = tabsRequiringCosts.includes(activeTab) || (isProjectModalOpen && !isChatOnly && !isLayoutTab);

      const tabsRequiringDelegations: TabId[] = [
        "gantt",
        "detail",
        "taskDelegation",
        "taskDelegationCalendar",
        "notification"
      ];
      const needsDelegations = tabsRequiringDelegations.includes(activeTab) || isTaskModalOpen || (isProjectModalOpen && !isChatOnly && !isLayoutTab);

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
    fetchYearsMeta().then((meta) => {
      remoteYearsMetaRef.current = meta;
    });
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
        const updatedList = Array.from(pendingTasksMap.current.values());
        updatedList.sort((a, b) => {
          if (a.projectCode !== b.projectCode) {
            return (a.projectCode || "").localeCompare(b.projectCode || "");
          }
          return (a.orderIndex || 0) - (b.orderIndex || 0);
        });
        useAppStore.getState().setTasks(updatedList);
        const setNotifs = useAppStore.getState().setAllTasksForNotifs;
        if (setNotifs) setNotifs(updatedList);
        pendingTasksMap.current = null;
      }
      tasksBatchTimer.current = null;
    }, 40);
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

    liveTargetYears.forEach(year => {
      if (!projectsPool.current.has(year)) {
        // Metadata Fingerprinting check: If year is closed or past, and local cache matches remote timestamp, skip network read!
        const isClosedOrPastYear = Number(year) < 2026 || remoteYearsMetaRef.current[year]?.closed;
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
        const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
        const future14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

        const qNotifTasks = query(
          collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
          where("finish", ">=", past7),
          where("finish", "<=", future14),
          limit(50)
        );

        // Cache-First strategy: read from IndexedDB cache first (0 Read cost).
        // Only fetch from Server if cache is empty or unavailable.
        let snapshot;
        try {
          snapshot = await getDocsFromCache(qNotifTasks);
          if (snapshot.empty) {
            snapshot = await getDocsFromServer(qNotifTasks);
          }
        } catch {
          snapshot = await getDocsFromServer(qNotifTasks);
        }
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
      }
      prevSigTasks.current = currentSig;
    }

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

    setIsTasksLoading(true);

    const currentProjects = useAppStore.getState().projects || [];
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
      } else {
        // Individual listeners for <= 10 projects
        projs.forEach(p => {
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
            const qTasks = query(
              collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
              where("projectCode", "==", p.code)
            );

            usePerformanceStore.getState().registerListener(`taka_tasks_${projKey}`);
            const unsub = onSnapshot(
              qTasks,
              (snapshot) => {
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
  }, [querySignature, isTasksRequested, expandedProjectIds, searchActiveProjectIds, globalYearFilter, buildStoreAndYearQuery]);

  // 2.4 Delta Sync for Costs (Native Firebase Cache for active target years with Keep-Alive Pool)
  const costsPool = useRef<Map<string, () => void>>(new Map());
  const prevSigCosts = useRef<string>("");

  useEffect(() => {
    return () => {
      costsPool.current.forEach(u => u());
      costsPool.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!querySignature || !isCostsRequested) {
      if (!isCostsRequested) {
        setIsCostsLoading(false);
      }
      return;
    }

    if (prevSigCosts.current !== querySignature) {
      costsPool.current.forEach(u => u());
      costsPool.current.clear();
      prevSigCosts.current = querySignature;
    }

    const isAllYears = globalYearFilter === 'all' || globalYearFilter === 'ALL';
    const liveTargetYears = isAllYears ? PRIMARY_ACTIVE_YEARS : [globalYearFilter];

    setIsCostsLoading(true);

    liveTargetYears.forEach(year => {
      if (!costsPool.current.has(year)) {
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

    const isAllYears = globalYearFilter === 'all' || globalYearFilter === 'ALL';
    const targetYears = isDelegationsRequested 
      ? (isAllYears ? PRIMARY_ACTIVE_YEARS : [globalYearFilter]) 
      : [];
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
