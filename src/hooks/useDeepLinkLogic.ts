import React, { useCallback, useEffect, useRef } from 'react';
import { doc, getDoc, getDocs, collection, query, where, limit } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { useAppStore } from '../store/useAppStore';
import { Project, Task } from '../types';
import { resolveStoreAndYearForQuery, findProjectWithCompositeIsolation } from './deepLinkStoreResolver';
import { DeepLinkExtraParams, openProjectTarget } from './deepLinkLayoutHelper';

export type { DeepLinkExtraParams };

export function useDeepLinkLogic(
  handleTabChange: (tab: any) => void,
  enrichedProjectsRef: React.RefObject<any[]>,
  filteredTasksRef: React.RefObject<any[]>
) {
  const currentUser = useAppStore(state => state.currentUser);
  const setIsLoginModalOpen = useAppStore(state => state.setIsLoginModalOpen);

  const pendingDeepLinkRef = useRef<{
    targetType: string;
    targetId: string;
    extraParams?: DeepLinkExtraParams;
  } | null>(null);
  const executeDeepLinkRef = useRef<((targetType: string, targetId: string, extraParams?: DeepLinkExtraParams) => Promise<void>) | null>(null);

  useEffect(() => {
    if (currentUser?.id && currentUser.id !== "guest" && pendingDeepLinkRef.current && executeDeepLinkRef.current) {
      const pending = pendingDeepLinkRef.current;
      pendingDeepLinkRef.current = null;
      executeDeepLinkRef.current(pending.targetType, pending.targetId, pending.extraParams);
    }
  }, [currentUser?.id]);

  const checkAccessLocally = useCallback((data: any): boolean => {
    const user = useAppStore.getState().currentUser;
    if (!user || user.role === "admin") return true;
    const store = String(data.store || data.projectStore || "").toUpperCase().trim();
    if (store === "HCM" && !user.storePermissions?.hcm) return false;
    if (store === "HN" && !user.storePermissions?.hn) return false;
    return true;
  }, []);

  const syncProjectScopeFilters = useCallback((pStore?: string, pYear?: string | number, pLocation?: string, pId?: string) => {
    const state = useAppStore.getState();
    if (pYear && String(pYear).toLowerCase() !== "all" && String(pYear) !== state.globalYearFilter) {
      state.setGlobalYearFilter(String(pYear));
    }
    if (pStore && pStore.toLowerCase() !== "all") {
      const normStore = pStore.trim().toUpperCase();
      if (state.globalStoreFilter.toUpperCase() !== normStore) {
        state.setGlobalStoreFilter(normStore as any);
      }
    }
    if (state.globalLocationFilter.length > 0 && pLocation && !state.globalLocationFilter.includes(pLocation)) {
      state.setGlobalLocationFilter([]);
    }
    if (pId) {
      const curExpanded = state.expandedProjectIds || [];
      if (!curExpanded.includes(String(pId))) {
        state.setExpandedProjectIds([...curExpanded, String(pId)]);
      }
    }
  }, []);

  const executeDeepLink = useCallback(
    async (
      targetType: string,
      targetId: string,
      extraParams?: DeepLinkExtraParams
    ) => {
      if (!targetType || !targetId) return;

      const user = useAppStore.getState().currentUser;
      if (!user || user.id === "guest") {
        pendingDeepLinkRef.current = { targetType, targetId, extraParams };
        setIsLoginModalOpen(true);
        return;
      }

      // Proactively sync store & year filters from extraParams
      if (extraParams?.year && String(extraParams.year).toLowerCase() !== "all" && String(extraParams.year) !== useAppStore.getState().globalYearFilter) {
        useAppStore.getState().setGlobalYearFilter(String(extraParams.year));
      }
      if (
        extraParams?.store &&
        extraParams.store.toLowerCase() !== "all" &&
        useAppStore.getState().globalStoreFilter.toUpperCase() !== extraParams.store.trim().toUpperCase()
      ) {
        useAppStore.getState().setGlobalStoreFilter(extraParams.store.trim().toUpperCase() as any);
      }

      // 1. PROJECT TARGET
      if (targetType === "project") {
        const curEnriched = enrichedProjectsRef.current || [];
        await openProjectTarget(
          String(targetId),
          extraParams,
          curEnriched,
          checkAccessLocally,
          syncProjectScopeFilters,
          handleTabChange
        );
        return;
      }

      // 2. TASK TARGET
      if (targetType === "task") {
        useAppStore.getState().setIsTasksRequested(true);
        const normId = String(targetId).trim().toLowerCase();
        const curFilteredTasks = filteredTasksRef.current || [];
        const curTasks = useAppStore.getState().tasks || [];
        const curNotifTasks = useAppStore.getState().allTasksForNotifs || [];

        let t: Task | undefined =
          curFilteredTasks.find((item) => item.id && item.id.toLowerCase() === normId) ||
          curTasks.find((item) => item.id && item.id.toLowerCase() === normId) ||
          curNotifTasks.find((item) => item.id && item.id.toLowerCase() === normId);

        if (!t && !String(targetId).startsWith("ts_")) {
          try {
            const { localDb } = await import("../lib/localDb");
            if (localDb) {
              const directMatch = await localDb.tasks.get(String(targetId));
              if (directMatch && !directMatch.isDeleted) {
                t = directMatch;
              }
            }
          } catch {}
        }

        if (t) {
          if (!checkAccessLocally(t)) {
            window.history.replaceState({}, document.title, window.location.pathname);
            useAppStore.getState().setToast({
              title: "Access Denied",
              message: "You do not have permission to access this task's store.",
            });
            return;
          }
          const resolvedStore = t.projectStore || extraParams?.store;
          const resolvedYear = t.projectYear || extraParams?.year;
          const resolvedProjId = t.projectId || extraParams?.projectId;
          syncProjectScopeFilters(resolvedStore, resolvedYear, t.location, resolvedProjId);
          handleTabChange("detail");
          if (t.projectCode || extraParams?.code) {
            useAppStore.getState().setDetailTabFilterCode(t.projectCode || extraParams?.code || "");
          }
          useAppStore.getState().setDetailTabFocusTaskId(t.id);
          useAppStore.getState().setGanttTabFocusTaskId(t.id);
          if (extraParams?.openModal !== false) {
            useAppStore.getState().setEditingTask(t);
            useAppStore.getState().setModalInitialTab(extraParams?.openChat ? "chat" : "details");
            useAppStore.getState().setIsReadOnlyModal(!extraParams?.openChat);
            useAppStore.getState().setIsTaskModalOpen(true);
          }
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        // Fast Firestore point read (or fallback if virtual summary task ts_...)
        try {
          if (!String(targetId).startsWith("ts_")) {
            const docRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", String(targetId));
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              const fetchedTask = { id: snap.id, ...snap.data() } as Task;
              if (!checkAccessLocally(fetchedTask)) {
                window.history.replaceState({}, document.title, window.location.pathname);
                useAppStore.getState().setToast({
                  title: "Access Denied",
                  message: "You do not have permission to access this task's store.",
                });
                return;
              }
              syncProjectScopeFilters(
                fetchedTask.projectStore || extraParams?.store,
                fetchedTask.projectYear || extraParams?.year,
                fetchedTask.location,
                fetchedTask.projectId || extraParams?.projectId
              );
              handleTabChange("detail");
              if (fetchedTask.projectCode || extraParams?.code) {
                useAppStore.getState().setDetailTabFilterCode(fetchedTask.projectCode || extraParams?.code || "");
              }
              useAppStore.getState().setDetailTabFocusTaskId(fetchedTask.id);
              useAppStore.getState().setGanttTabFocusTaskId(fetchedTask.id);
              if (extraParams?.openModal !== false) {
                useAppStore.getState().setEditingTask(fetchedTask);
                useAppStore.getState().setModalInitialTab(extraParams?.openChat ? "chat" : "details");
                useAppStore.getState().setIsReadOnlyModal(!extraParams?.openChat);
                useAppStore.getState().setIsTaskModalOpen(true);
              }
              window.history.replaceState({}, document.title, window.location.pathname);
              return;
            }
          }
          // Fallback: if virtual task summary (ts_...) or task not yet hydrated, navigate to parent project in DetailTab
          if (extraParams?.code || extraParams?.projectId) {
            syncProjectScopeFilters(extraParams.store, extraParams.year, undefined, extraParams.projectId);
            handleTabChange("detail");
            if (extraParams.code) {
              useAppStore.getState().setDetailTabFilterCode(extraParams.code);
            }
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          }
          window.history.replaceState({}, document.title, window.location.pathname);
          useAppStore.getState().setToast({
            title: "Not Found",
            message: "This task was not found or data has been deleted.",
          });
        } catch (err) {
          console.error("Error fetching task deep link:", err);
          window.history.replaceState({}, document.title, window.location.pathname);
          useAppStore.getState().setToast({
            title: "Error",
            message: "Could not load task.",
          });
        }
        return;
      }

      // 3. TASK DELEGATION TARGET
      if (targetType === "task_delegation") {
        useAppStore.getState().setIsDelegationsRequested(true);
        handleTabChange("taskDelegation");
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("taka_open_delegation_group", { detail: { groupId: targetId } })
          );
        }, 100);
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // 4. TAB SEARCH TARGET (Deep links with ?tab=...&q=...)
      if (targetType === "tab_search") {
        await applyTabSearch(extraParams?.code as any, targetId, extraParams?.store, extraParams?.year);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    },
    [checkAccessLocally, handleTabChange]
  );

  const applyTabSearch = useCallback(
    async (
      searchTab: string,
      searchQuery: string,
      explicitStore?: string,
      explicitYear?: string
    ) => {
      const resolved = await resolveStoreAndYearForQuery(searchQuery, enrichedProjectsRef.current || []);
      const targetStore = explicitStore?.trim().toUpperCase() || resolved.store;
      const targetYear = explicitYear ? String(explicitYear).trim() : resolved.year;

      if (targetStore) {
        const user = useAppStore.getState().currentUser;
        const hasAccess =
          !user ||
          user.role === 'admin' ||
          (targetStore === 'HCM' && user.storePermissions?.hcm) ||
          (targetStore === 'HN' && user.storePermissions?.hn);

        if (hasAccess && useAppStore.getState().globalStoreFilter.toUpperCase() !== targetStore) {
          useAppStore.getState().setGlobalStoreFilter(targetStore as any);
        }
      }

      if (targetYear && String(targetYear) !== useAppStore.getState().globalYearFilter) {
        useAppStore.getState().setGlobalYearFilter(String(targetYear));
      }

      if (searchTab === 'budget' || searchTab === 'cost') {
        useAppStore.getState().setIsCostsRequested(true);
      } else if (searchTab === 'detail' || searchTab === 'gantt') {
        useAppStore.getState().setIsTasksRequested(true);
      }

      if (searchTab === 'detail') {
        useAppStore.getState().setDetailTabFilterCode(searchQuery);
      } else if (searchTab === 'budget') {
        useAppStore.getState().setBudgetTabSearchTerm(searchQuery);
      } else if (searchTab === 'cost') {
        useAppStore.getState().setCostTabSearchTerm(searchQuery);
      } else if (searchTab === 'gantt') {
        useAppStore.getState().setGanttTabFilterProjectId(searchQuery);
        try {
          sessionStorage.setItem("taka_gantt_search", searchQuery);
        } catch {}
      }

      handleTabChange(searchTab);
    },
    [handleTabChange, enrichedProjectsRef]
  );

  useEffect(() => {
    executeDeepLinkRef.current = executeDeepLink;
  }, [executeDeepLink]);

  const handleDeepLinkString = useCallback(
    (rawInput: string) => {
      if (!rawInput) return;
      try {
        let searchStr = "";
        if (rawInput.includes("?")) {
          searchStr = rawInput.split("?")[1];
        } else if (
          rawInput.includes("targetType=") ||
          rawInput.includes("targetId=") ||
          rawInput.includes("notificationId=")
        ) {
          searchStr = rawInput;
        } else {
          try {
            const u = new URL(rawInput);
            searchStr = u.search.replace(/^\?/, "");
          } catch {
            if (rawInput.startsWith("http://") || rawInput.startsWith("https://")) {
              window.open(rawInput, "_blank");
            }
            return;
          }
        }

        const params = new URLSearchParams(searchStr);
        const notificationId = params.get("notificationId");
        const targetType = params.get("targetType");
        const targetId = params.get("targetId");
        const code = params.get("code") || undefined;
        const store = params.get("store") || undefined;
        const year = params.get("year") || undefined;
        const searchTab = params.get("tab") as any;
        const searchQuery = params.get("q");

        if (searchTab && searchQuery) {
          const user = useAppStore.getState().currentUser;
          if (!user || user.id === "guest") {
            pendingDeepLinkRef.current = {
              targetType: "tab_search",
              targetId: searchQuery,
              extraParams: { store, year, code: searchTab }
            };
            setIsLoginModalOpen(true);
            return;
          }
          applyTabSearch(searchTab, searchQuery, store, year).then(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
          });
          return;
        }

        if (notificationId) {
          useAppStore.getState().setNotificationFilterId(notificationId);
          useAppStore.getState().setActiveTab("notification");
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        if (targetType && targetId) {
          executeDeepLink(targetType, targetId, {
            store,
            year,
            code,
            tab: searchTab || undefined,
            isQrOrUrl: true,
          });
        } else if (rawInput.startsWith("http://") || rawInput.startsWith("https://")) {
          window.open(rawInput, "_blank");
        }
      } catch (e) {
        console.error("Error parsing deep link:", e);
      }
    },
    [executeDeepLink, useAppStore.getState().setActiveTab, useAppStore.getState().setNotificationFilterId]
  );

  // Initial deep link handling on mount
  const initialUrlHandledRef = useRef(false);
  useEffect(() => {
    if (initialUrlHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const targetType = params.get("targetType");
    const targetId = params.get("targetId");
    const notificationId = params.get("notificationId");
    const tab = params.get("tab");
    const q = params.get("q");

    if (notificationId || (targetType && targetId) || (tab && q)) {
      initialUrlHandledRef.current = true;
      handleDeepLinkString(window.location.search);
    }
  }, [handleDeepLinkString]);

  

  // Also include the SW notification handler
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "NOTIFICATION_CLICK") {
        const { targetType, targetId, notificationId } = event.data.data;
        if (notificationId) {
          useAppStore.getState().setNotificationFilterId(notificationId);
          handleTabChange("notification");
        } else if (targetType && targetId) {
          executeDeepLink(targetType, targetId);
        }
      }
    };

    navigator.serviceWorker?.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
    };
  }, [executeDeepLink, handleTabChange]);

  return {
    handleDeepLinkString,
    pendingDeepLinkRef,
    executeDeepLinkRef
  };
}
