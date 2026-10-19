import React, { startTransition, useEffect, useRef } from "react";
import { useAppStore } from "../../store/useAppStore";
import { safeGetItemLocal, safeSetItemLocal, safeSetItemSession } from "../../lib/storage";
import { computeTaskCode } from "../../lib/ganttUtils";
import { extractFloorFromCodeOrName } from "../../lib/layoutUnitFinder";
import { undoManager } from "../../lib/undoManager";
import { triggerChangeFlash } from "../../lib/changeFlashService";
import { AppRole, Project, TabId, Task } from "../../types";

interface UseAppNavigationAndShortcutsParams {
  projects: Project[];
  tasks: Task[];
  visibleTabs: TabId[];
  isAppReadyRef: React.MutableRefObject<boolean>;
}

export function useAppNavigationAndShortcuts({
  projects,
  tasks,
  visibleTabs,
  isAppReadyRef,
}: UseAppNavigationAndShortcutsParams) {
  const currentUser = useAppStore((state) => state.currentUser)!;
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const tabHistory = useAppStore((state) => state.tabHistory);
  const setTabHistory = useAppStore((state) => state.setTabHistory);
  const setNotificationFilterId = useAppStore((state) => state.setNotificationFilterId);
  const detailTabFocusTaskId = useAppStore((state) => state.detailTabFocusTaskId);
  const setDetailTabFocusTaskId = useAppStore((state) => state.setDetailTabFocusTaskId);
  const setDetailTabFilterCode = useAppStore((state) => state.setDetailTabFilterCode);
  const setGanttTabFocusTaskId = useAppStore((state) => state.setGanttTabFocusTaskId);
  const setLayoutTabFilters = useAppStore((state) => state.setLayoutTabFilters);
  const setGlobalStoreFilter = useAppStore((state) => state.setGlobalStoreFilter);
  const setGlobalYearFilter = useAppStore((state) => state.setGlobalYearFilter);
  const triggerGanttToday = useAppStore((state) => state.triggerGanttToday);
  const undoStack = useAppStore((state) => state.undoStack);
  const redoStack = useAppStore((state) => state.redoStack);
  const isFocusMode = useAppStore((state) => state.isFocusMode);
  const setIsFocusMode = useAppStore((state) => state.setIsFocusMode);
  const isPrintPreview = useAppStore((state) => state.isPrintPreview);
  const setIsPrintPreview = useAppStore((state) => state.setIsPrintPreview);
  const toast = useAppStore((state) => state.toast);
  const setToast = useAppStore((state) => state.setToast);
  const setEditingProject = useAppStore((state) => state.setEditingProject);
  const setEditingTask = useAppStore((state) => state.setEditingTask);
  const setIsReadOnlyModal = useAppStore((state) => state.setIsReadOnlyModal);
  const setModalInitialTab = useAppStore((state) => state.setModalInitialTab);
  const setIsProjectModalOpen = useAppStore((state) => state.setIsProjectModalOpen);
  const setIsTaskModalOpen = useAppStore((state) => state.setIsTaskModalOpen);
  const setPrefillProjectCode = useAppStore((state) => state.setPrefillProjectCode);
  const setPrefillProjectYear = useAppStore((state) => state.setPrefillProjectYear);

  // 15-minute inactivity reset check for location filter
  useEffect(() => {
    const LAST_ACTIVITY_KEY = "taka_last_activity_time";
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

    const checkAndTouchActivity = () => {
      const now = Date.now();
      const lastAct = safeGetItemLocal(LAST_ACTIVITY_KEY);
      if (lastAct) {
        const lastTime = parseInt(lastAct, 10);
        if (!isNaN(lastTime) && now - lastTime > FIFTEEN_MINUTES_MS) {
          useAppStore.getState().setGlobalLocationFilter([]);
        }
      } else {
        useAppStore.getState().setGlobalLocationFilter([]);
      }
      safeSetItemLocal(LAST_ACTIVITY_KEY, String(now));
    };

    checkAndTouchActivity();

    let lastThrottledTime = Date.now();
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastThrottledTime > 30000) {
        lastThrottledTime = now;
        checkAndTouchActivity();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAndTouchActivity();
      }
    };

    window.addEventListener("click", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);
    window.addEventListener("touchstart", handleUserActivity);
    window.addEventListener("focus", checkAndTouchActivity);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("click", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      window.removeEventListener("focus", checkAndTouchActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleTabChange = (newTab: TabId) => {
    if (newTab === "notification") {
      setNotificationFilterId(null);
    }
    if (newTab !== activeTab) {
      if (activeTab === "detail" && newTab !== "detail") {
        setDetailTabFocusTaskId("");
        setDetailTabFilterCode("");
      }
      if (
        activeTab === "gantt" &&
        newTab !== "layout" &&
        newTab !== "gantt" &&
        newTab !== "detail"
      ) {
        setGanttTabFocusTaskId("");
      }
      if (newTab !== "layout") {
        setLayoutTabFilters(null);
      }
      setTabHistory((prev) => [...prev, activeTab]);
      setActiveTab(newTab);
    }
  };

  const handleNavigateToTaskDetail = (taskId: string) => {
    startTransition(() => {
      const targetTask = tasks.find((t) => t.id === taskId);
      if (targetTask) {
        const targetProject =
          projects.find(
            (p) =>
              (targetTask.projectId && p.id && String(p.id) === String(targetTask.projectId)) ||
              (String(p.code || "").trim().toLowerCase() ===
                String(targetTask.projectCode || "").trim().toLowerCase() &&
                (!targetTask.projectStore ||
                  !p.store ||
                  String(p.store).trim().toLowerCase() ===
                    String(targetTask.projectStore).trim().toLowerCase()) &&
                (!targetTask.projectYear ||
                  !p.year ||
                  String(p.year).trim() === String(targetTask.projectYear).trim()))
          ) ||
          projects.find(
            (p) =>
              String(p.code || "").trim().toLowerCase() ===
              String(targetTask.projectCode || "").trim().toLowerCase()
          );

        const subTaskCode =
          computeTaskCode(projects, tasks, targetTask) ||
          targetTask.taskCodePhu ||
          (targetProject ? `${targetProject.code}#1` : targetTask.projectCode || "");

        if (subTaskCode) {
          safeSetItemSession("taka_detail_search", subTaskCode);
        }

        if (targetProject) {
          setDetailTabFilterCode(subTaskCode);
          if (targetProject.store) {
            setGlobalStoreFilter(targetProject.store);
          }
          if (targetProject.year) {
            setGlobalYearFilter(String(targetProject.year));
          }
          if (targetProject.id) {
            const currentExpanded = useAppStore.getState().expandedProjectIds || [];
            if (!currentExpanded.includes(targetProject.id)) {
              useAppStore.getState().setExpandedProjectIds([...currentExpanded, targetProject.id]);
            }
          }
        } else if (targetTask.projectCode) {
          setDetailTabFilterCode(subTaskCode);
          if (targetTask.projectStore) {
            setGlobalStoreFilter(targetTask.projectStore);
          }
          if (targetTask.projectYear) {
            setGlobalYearFilter(String(targetTask.projectYear));
          }
        }
      } else {
        setDetailTabFilterCode("");
      }
      useAppStore.getState().setIsTasksRequested(true);
      setGanttTabFocusTaskId(taskId);
      setDetailTabFocusTaskId(taskId);
      handleTabChange("detail");
    });
  };

  const handleNavigateToLayout = (
    store: string,
    location: string,
    projectCode?: string,
    sourceTaskId?: string
  ) => {
    const rawLoc =
      location && location !== "all" && location !== "ALL"
        ? location
        : extractFloorFromCodeOrName(projectCode) || "";
    if (rawLoc) {
      useAppStore.getState().setGlobalLocationFilter([rawLoc]);
    }
    setLayoutTabFilters({
      store,
      location: rawLoc || location,
      projectCode,
      sourceTaskId,
      _ts: Date.now(),
    });
    handleTabChange("layout");
  };

  const handleQuickNavigate = (targetTab: TabId, target: any) => {
    useAppStore.getState().setQuickNavTarget(null);

    startTransition(() => {
      const p = target?.project;
      const task = target?.task;
      const taskCode = target?.taskCode;
      const effectiveFilterCode =
        taskCode || (task ? task.taskCodePhu || p?.code : p?.code) || "";

      const yearVal = p?.year || (task?.projectYear ? Number(task.projectYear) : null);
      const targetYear = yearVal ? String(yearVal) : "all";
      const storeVal = p?.store || task?.projectStore;
      const targetStore = storeVal ? String(storeVal) : "all";

      if (storeVal) {
        safeSetItemLocal(`taka_store_filter_${currentUser.id}`, String(storeVal));
      } else {
        safeSetItemLocal(`taka_store_filter_${currentUser.id}`, "all");
      }

      const updates: any = {
        globalYearFilter: targetYear,
        globalStoreFilter: targetStore,
        activeTab: targetTab,
      };

      switch (targetTab) {
        case "layout": {
          const unitCode =
            (p as any)?.unit || task?.projectCode || p?.code || effectiveFilterCode || "";
          const rawCode =
            p?.code || (p as any)?.unit || effectiveFilterCode || task?.projectCode || "";
          const targetUnitCode = unitCode || rawCode;

          const extractedFloor =
            extractFloorFromCodeOrName(targetUnitCode) ||
            extractFloorFromCodeOrName((p as any)?.unit) ||
            extractFloorFromCodeOrName(p?.code) ||
            extractFloorFromCodeOrName(effectiveFilterCode);
          const targetFloor =
            p?.location && p.location !== "all" && p.location !== "ALL"
              ? p.location
              : extractedFloor || "all";

          if (targetFloor && targetFloor !== "all" && targetFloor !== "ALL") {
            updates.globalLocationFilter = [targetFloor];
          }

          updates.layoutTabFilters = {
            store: p?.store || task?.projectStore || "all",
            location: targetFloor,
            projectCode: targetUnitCode,
            _ts: Date.now(),
          };
          break;
        }
        case "gantt": {
          const targetProjectId = p?.id ? String(p.id) : p?.code || "";
          updates.ganttTabFilterProjectId = targetProjectId;
          if (effectiveFilterCode) {
            safeSetItemSession("taka_gantt_search", effectiveFilterCode);
          }
          updates.ganttTabFocusTaskId = "";

          if (p?.id) {
            const currentExpanded = useAppStore.getState().expandedProjectIds || [];
            updates.expandedProjectIds = currentExpanded.filter((id) => id !== String(p.id));
          }

          if (p?.location && p.location !== "all" && p.location !== "ALL") {
            updates.globalLocationFilter = [p.location];
          } else {
            updates.globalLocationFilter = [];
          }

          safeSetItemSession("taka_gantt_status_filter", "all");
          safeSetItemSession("taka_gantt_trigger_today", "true");
          triggerGanttToday();
          if (p?.id) {
            triggerChangeFlash(String(p.id), "projects", "QuickNav");
          }
          break;
        }
        case "detail": {
          const isTargetingSpecificTask = Boolean(task && task.id);
          const targetTaskId = isTargetingSpecificTask ? task?.id || "" : "";
          updates.detailTabFocusTaskId = targetTaskId;

          const effectiveCode =
            isTargetingSpecificTask && task
              ? computeTaskCode(projects, tasks, task) ||
                task.taskCodePhu ||
                (p ? `${p.code}#${(task.orderIndex !== undefined ? task.orderIndex : 0) + 1}` : "") ||
                p?.code ||
                ""
              : p?.code || effectiveFilterCode || "";

          updates.detailTabFilterCode = effectiveCode;
          if (effectiveCode) {
            safeSetItemSession("taka_detail_search", effectiveCode);
          }
          if (p?.store || task?.projectStore) {
            updates.detailTabStoreFilter = p?.store || task?.projectStore || "";
          }

          updates.globalLocationFilter = [];
          safeSetItemSession("taka_detail_status_filter", "all");

          if (isTargetingSpecificTask && p?.id) {
            const currentExpanded = useAppStore.getState().expandedProjectIds || [];
            const newExpanded = new Set(currentExpanded);
            newExpanded.add(String(p.id));
            updates.expandedProjectIds = Array.from(newExpanded);
            updates.isTasksRequested = true;
          } else {
            updates.detailTabFocusTaskId = "";
            updates.ganttTabFocusTaskId = "";
          }

          if (p?.id) {
            triggerChangeFlash(String(p.id), "projects", "QuickNav");
          }
          break;
        }
        case "budget": {
          updates.budgetTabSearchTerm = effectiveFilterCode || "";
          break;
        }
        case "cost": {
          updates.costTabSearchTerm = effectiveFilterCode || "";
          break;
        }
        default:
          break;
      }

      useAppStore.setState(updates);
    });
  };

  const handleDataUndo = async () => {
    if (activeTab === "detail" && detailTabFocusTaskId) {
      const prev = tabHistory.length > 0 ? tabHistory[tabHistory.length - 1] : "gantt";
      setTabHistory((h) => h.slice(0, -1));
      setDetailTabFocusTaskId("");
      setDetailTabFilterCode("");
      setActiveTab(prev);
      return;
    }

    if (activeTab === "taskDelegation") {
      window.dispatchEvent(new CustomEvent("taka_clear_delegation_focus"));
    }

    if (undoStack.length > 0) {
      await undoManager.pop();
    } else if (tabHistory.length > 0) {
      const prev = tabHistory[tabHistory.length - 1];
      setTabHistory((h) => h.slice(0, -1));
      if (activeTab === "detail") {
        setDetailTabFocusTaskId("");
        setDetailTabFilterCode("");
      }
      if (activeTab === "gantt") setGanttTabFocusTaskId("");
      setActiveTab(prev);
    }
  };

  const handleGoBack = () => {
    if (activeTab === "detail" && detailTabFocusTaskId) {
      const prev = tabHistory.length > 0 ? tabHistory[tabHistory.length - 1] : "gantt";
      setTabHistory((h) => h.slice(0, -1));
      setDetailTabFocusTaskId("");
      setDetailTabFilterCode("");
      setActiveTab(prev);
      return;
    }
    if (tabHistory.length > 0) {
      const prev = tabHistory[tabHistory.length - 1];
      setTabHistory((h) => h.slice(0, -1));
      if (activeTab === "detail") {
        setDetailTabFocusTaskId("");
        setDetailTabFilterCode("");
      }
      if (activeTab === "gantt") setGanttTabFocusTaskId("");
      setActiveTab(prev);
    }
  };

  const handleGoBackRef = useRef(handleGoBack);
  useEffect(() => {
    handleGoBackRef.current = handleGoBack;
  });

  const handleDataUndoRef = useRef(handleDataUndo);
  useEffect(() => {
    handleDataUndoRef.current = handleDataUndo;
  });

  const handleDataRedo = async () => {
    if (redoStack.length > 0) {
      await undoManager.redo();
    }
  };

  const handleDataRedoRef = useRef(handleDataRedo);
  useEffect(() => {
    handleDataRedoRef.current = handleDataRedo;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTyping =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          (activeElement as HTMLElement).isContentEditable);

      if (e.key === "Escape") {
        if (isPrintPreview) {
          setIsPrintPreview(false);
          return;
        }
        if (toast) {
          setToast(null);
        }
        const state = useAppStore.getState();
        if (state.isProjectModalOpen) state.setIsProjectModalOpen(false);
        if (state.isTaskModalOpen) state.setIsTaskModalOpen(false);
        if (state.isUserModalOpen) state.setIsUserModalOpen(false);
        if (state.isLoginModalOpen) state.setIsLoginModalOpen(false);
        if (activeElement && typeof (activeElement as HTMLElement).blur === "function") {
          (activeElement as HTMLElement).blur();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const state = useAppStore.getState();
        state.setIsCommandPaletteOpen(!state.isCommandPaletteOpen);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (!isTyping) {
          e.preventDefault();
          handleDataUndoRef.current?.();
        }
        return;
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))
      ) {
        if (!isTyping) {
          e.preventDefault();
          handleDataRedoRef.current?.();
        }
        return;
      }

      if (e.shiftKey && e.key.toUpperCase() === "F" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!isTyping) {
          e.preventDefault();
          setIsFocusMode(!isFocusMode);
        }
        return;
      }

      if (isTyping) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "/") {
        e.preventDefault();
        const globalSearchInput = document.querySelector<HTMLInputElement>(
          'input[data-global-search-input="true"]'
        );
        if (globalSearchInput) {
          globalSearchInput.focus();
          globalSearchInput.select?.();
        } else {
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[placeholder*="Search" i], input[placeholder*="Tìm kiếm" i], input[type="search"]'
          );
          if (searchInput) {
            searchInput.focus();
            searchInput.select?.();
          }
        }
        return;
      }

      if (e.key === "Backspace") {
        const state = useAppStore.getState();
        if (
          state.isProjectModalOpen ||
          state.isTaskModalOpen ||
          state.isUserModalOpen ||
          state.isLoginModalOpen
        ) {
          e.preventDefault();
          if (state.isProjectModalOpen) state.setIsProjectModalOpen(false);
          if (state.isTaskModalOpen) state.setIsTaskModalOpen(false);
          if (state.isUserModalOpen) state.setIsUserModalOpen(false);
          if (state.isLoginModalOpen) state.setIsLoginModalOpen(false);
          return;
        }
        e.preventDefault();
        handleGoBackRef.current?.();
        return;
      }

      if (e.key.toLowerCase() === "p") {
        const state = useAppStore.getState();
        const userRole = state.currentUser?.role;
        const canWrite =
          userRole === "admin" ||
          (userRole && state.permissionMatrix[userRole as AppRole]?.Write?.general);
        if (canWrite) {
          e.preventDefault();
          setEditingProject(null);
          setIsReadOnlyModal(false);
          setModalInitialTab("details");
          setIsProjectModalOpen(true);
        }
        return;
      }

      if (e.key.toLowerCase() === "t") {
        if (!isAppReadyRef.current) return;
        const state = useAppStore.getState();
        const userRole = state.currentUser?.role;
        const canWrite =
          userRole === "admin" ||
          (userRole && state.permissionMatrix[userRole as AppRole]?.Write?.detail);
        if (canWrite) {
          e.preventDefault();
          setEditingTask(null);
          setIsReadOnlyModal(false);
          setModalInitialTab("details");
          const safeP = projects && projects.length > 0 ? projects[0] : null;
          setPrefillProjectCode(safeP?.code || "");
          setPrefillProjectYear(safeP?.year || null);
          setIsTaskModalOpen(true);
        }
        return;
      }

      const tabNumberMap: Record<string, TabId> = {
        "1": "general",
        "2": "calendar",
        "3": "gantt",
        "4": "detail",
        "5": "budget",
        "6": "cost",
        "7": "layout",
        "8": "summary",
        "9": "taskDelegation",
      };
      if (tabNumberMap[e.key]) {
        e.preventDefault();
        handleTabChange(tabNumberMap[e.key]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isFocusMode,
    isPrintPreview,
    toast,
    projects,
    handleTabChange,
    setIsFocusMode,
    setIsPrintPreview,
    setToast,
    setEditingProject,
    setEditingTask,
    setIsReadOnlyModal,
    setModalInitialTab,
    setIsProjectModalOpen,
    setIsTaskModalOpen,
    setPrefillProjectCode,
    setPrefillProjectYear,
  ]);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let touchTarget: HTMLElement | null = null;
    let isMultiTouch = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        isMultiTouch = true;
        return;
      }
      isMultiTouch = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      touchTarget = e.target as HTMLElement;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isMultiTouch) return;
      if (window.visualViewport && window.visualViewport.scale > 1) return;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = startX - endX;
      const diffY = startY - endY;

      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      if (
        touchTarget &&
        touchTarget.closest('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }

      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
        if (diffX < 0 && startX <= 40) {
          handleGoBackRef.current();
        }
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [activeTab, visibleTabs]);

  return {
    handleTabChange,
    handleNavigateToTaskDetail,
    handleNavigateToLayout,
    handleQuickNavigate,
    handleDataUndo,
    handleDataRedo,
    handleGoBack,
  };
}
