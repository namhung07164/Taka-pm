import React, { useCallback, useEffect, useRef } from 'react';
import { doc, getDoc, getDocs, collection, query, where, limit } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { useAppStore } from '../store/useAppStore';
import { Project, Task } from '../types';

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
    extraParams?: { store?: string; year?: string; code?: string };
  } | null>(null);
  const executeDeepLinkRef = useRef<((targetType: string, targetId: string, extraParams?: { store?: string; year?: string; code?: string }) => Promise<void>) | null>(null);

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

  const executeDeepLink = useCallback(
    async (
      targetType: string,
      targetId: string,
      extraParams?: { store?: string; year?: string; code?: string }
    ) => {
      if (!targetType || !targetId) return;

      const user = useAppStore.getState().currentUser;
      if (!user || user.id === "guest") {
        pendingDeepLinkRef.current = { targetType, targetId, extraParams };
        setIsLoginModalOpen(true);
        return;
      }

      // If extraParams contains year or store, proactively sync filters
      if (extraParams?.year && String(extraParams.year) !== useAppStore.getState().globalYearFilter) {
        useAppStore.getState().setGlobalYearFilter(String(extraParams.year));
      }
      if (
        extraParams?.store &&
        useAppStore.getState().globalStoreFilter !== "all" &&
        extraParams.store.toLowerCase() !== useAppStore.getState().globalStoreFilter.toLowerCase()
      ) {
        useAppStore.getState().setGlobalStoreFilter("all");
      }

      // 1. PROJECT TARGET
      if (targetType === "project") {
        const normId = String(targetId).trim().toLowerCase();
        const curEnriched = enrichedProjectsRef.current || [];
        const curProjects = useAppStore.getState().projects || [];
        const curNotifProjects = useAppStore.getState().allProjectsForNotifs || [];

        let p: Project | undefined =
          curEnriched.find(
            (item) =>
              String(item.no) === targetId ||
              String(item.id).toLowerCase() === normId ||
              String(item.code || "").toLowerCase() === normId
          ) ||
          curProjects.find(
            (item) =>
              String(item.no) === targetId ||
              String(item.id).toLowerCase() === normId ||
              String(item.code || "").toLowerCase() === normId
          ) ||
          curNotifProjects.find(
            (item) =>
              String(item.no) === targetId ||
              String(item.id).toLowerCase() === normId ||
              String(item.code || "").toLowerCase() === normId
          );

        if (p) {
          if (!checkAccessLocally(p)) {
            window.history.replaceState({}, document.title, window.location.pathname);
            useAppStore.getState().setToast({
              title: "Access Denied",
              message: "You do not have permission to access this project's store.",
            });
            return;
          }
          if (p.year && String(p.year) !== useAppStore.getState().globalYearFilter) {
            useAppStore.getState().setGlobalYearFilter(String(p.year));
          }
          if (
            p.store &&
            useAppStore.getState().globalStoreFilter !== "all" &&
            p.store.toLowerCase() !== useAppStore.getState().globalStoreFilter.toLowerCase()
          ) {
            useAppStore.getState().setGlobalStoreFilter("all");
          }
          handleTabChange("detail");
          if (p.code) {
            useAppStore.getState().setDetailTabFilterCode(p.code);
          }
          useAppStore.getState().setEditingProject(p);
          useAppStore.getState().setIsReadOnlyModal(true);
          useAppStore.getState().setIsProjectModalOpen(true);
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        // Fast Firestore point read (<100ms)
        try {
          let fetchedProj: Project | null = null;
          if (targetId.includes("_") || targetId.length > 8) {
            const docRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", targetId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              fetchedProj = { id: snap.id, ...snap.data() } as Project;
            }
          }
          if (!fetchedProj) {
            const isNum = !isNaN(Number(targetId));
            const constraints: any[] = [];
            if (isNum) {
              constraints.push(where("no", "==", Number(targetId)));
            } else {
              constraints.push(where("code", "==", targetId));
            }
            const q = query(
              collection(db, "artifacts", APP_ID, "public", "data", "taka_projects"),
              ...constraints,
              limit(1)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              fetchedProj = { id: snap.docs[0].id, ...snap.docs[0].data() } as Project;
            }
          }

          if (fetchedProj) {
            if (!checkAccessLocally(fetchedProj)) {
              window.history.replaceState({}, document.title, window.location.pathname);
              useAppStore.getState().setToast({
                title: "Access Denied",
                message: "You do not have permission to access this project's store.",
              });
              return;
            }
            if (fetchedProj.year && String(fetchedProj.year) !== useAppStore.getState().globalYearFilter) {
              useAppStore.getState().setGlobalYearFilter(String(fetchedProj.year));
            }
            if (
              fetchedProj.store &&
              useAppStore.getState().globalStoreFilter !== "all" &&
              fetchedProj.store.toLowerCase() !== useAppStore.getState().globalStoreFilter.toLowerCase()
            ) {
              useAppStore.getState().setGlobalStoreFilter("all");
            }
            handleTabChange("detail");
            if (fetchedProj.code) {
              useAppStore.getState().setDetailTabFilterCode(fetchedProj.code);
            }
            useAppStore.getState().setEditingProject(fetchedProj);
            useAppStore.getState().setIsReadOnlyModal(true);
            useAppStore.getState().setIsProjectModalOpen(true);
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            window.history.replaceState({}, document.title, window.location.pathname);
            useAppStore.getState().setToast({
              title: "Not Found",
              message: "This project was not found or data has been deleted.",
            });
          }
        } catch (err) {
          console.error("Error fetching project deep link:", err);
          window.history.replaceState({}, document.title, window.location.pathname);
          useAppStore.getState().setToast({
            title: "Error",
            message: "Could not load project.",
          });
        }
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

        if (t) {
          if (!checkAccessLocally(t)) {
            window.history.replaceState({}, document.title, window.location.pathname);
            useAppStore.getState().setToast({
              title: "Access Denied",
              message: "You do not have permission to access this task's store.",
            });
            return;
          }
          if (t.projectYear && String(t.projectYear) !== useAppStore.getState().globalYearFilter) {
            useAppStore.getState().setGlobalYearFilter(String(t.projectYear));
          }
          if (
            t.projectStore &&
            useAppStore.getState().globalStoreFilter !== "all" &&
            t.projectStore.toLowerCase() !== useAppStore.getState().globalStoreFilter.toLowerCase()
          ) {
            useAppStore.getState().setGlobalStoreFilter("all");
          }
          handleTabChange("detail");
          if (t.projectCode) {
            useAppStore.getState().setDetailTabFilterCode(t.projectCode);
          }
          useAppStore.getState().setDetailTabFocusTaskId(t.id);
          useAppStore.getState().setGanttTabFocusTaskId(t.id);
          useAppStore.getState().setEditingTask(t);
          useAppStore.getState().setIsReadOnlyModal(true);
          useAppStore.getState().setIsTaskModalOpen(true);
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        // Fast Firestore point read
        try {
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
            if (fetchedTask.projectYear && String(fetchedTask.projectYear) !== useAppStore.getState().globalYearFilter) {
              useAppStore.getState().setGlobalYearFilter(String(fetchedTask.projectYear));
            }
            if (
              fetchedTask.projectStore &&
              useAppStore.getState().globalStoreFilter !== "all" &&
              fetchedTask.projectStore.toLowerCase() !== useAppStore.getState().globalStoreFilter.toLowerCase()
            ) {
              useAppStore.getState().setGlobalStoreFilter("all");
            }
            handleTabChange("detail");
            if (fetchedTask.projectCode) {
              useAppStore.getState().setDetailTabFilterCode(fetchedTask.projectCode);
            }
            useAppStore.getState().setDetailTabFocusTaskId(fetchedTask.id);
            useAppStore.getState().setGanttTabFocusTaskId(fetchedTask.id);
            useAppStore.getState().setEditingTask(fetchedTask);
            useAppStore.getState().setIsReadOnlyModal(true);
            useAppStore.getState().setIsTaskModalOpen(true);
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            window.history.replaceState({}, document.title, window.location.pathname);
            useAppStore.getState().setToast({
              title: "Not Found",
              message: "This task was not found or data has been deleted.",
            });
          }
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
    },
    [checkAccessLocally, handleTabChange]
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
          if (searchTab === 'detail') {
            useAppStore.getState().setDetailTabFilterCode(searchQuery);
          } else if (searchTab === 'budget') {
            useAppStore.getState().setBudgetTabSearchTerm(searchQuery);
          } else if (searchTab === 'cost') {
            // For cost, we might receive a description/vendor or a project code. 
            // In CostTab, searchTerm handles both. So we can just set costTabSearchTerm.
                        useAppStore.getState().setCostTabSearchTerm(searchQuery);
          }
          useAppStore.getState().setActiveTab(searchTab);
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        if (notificationId) {
          useAppStore.getState().setNotificationFilterId(notificationId);
          useAppStore.getState().setActiveTab("notification");
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        if (targetType && targetId) {
          executeDeepLink(targetType, targetId, { store, year, code });
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
