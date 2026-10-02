import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "./lib/storage";
import { useFirebaseData } from "./hooks/useFirebaseData";
import { useDeepLinkLogic } from "./hooks/useDeepLinkLogic";
import { useNotificationActions } from "./hooks/useNotificationActions";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useState, useEffect, useMemo, useRef, useCallback, Profiler, lazy, Suspense, startTransition } from "react";

import { auth, APP_ID } from "./lib/firebase";
import { requestNotificationPermission } from "./lib/notifications";
import { cleanupLocalStorage } from "./lib/cleanup";
import { getPendingUpdates, clearPendingUpdates } from "./lib/syncQueue";
import { getStatus, matchesAdvancedSearch, parseDateTime } from "./lib/utils";
import { computeTaskCode } from "./lib/ganttUtils";
import { motion, AnimatePresence } from "motion/react";
import {
  Project,
  Task,
  Cost,
  AppUser,
  NotificationRule,
  TabId,
  ActiveNotification,
  PermissionMatrix,
  DEFAULT_PERMISSION_MATRIX,
  AppRole,
  PermissionModule,
  DelegationGroup,
} from "./types";
import { X, GripHorizontal } from "lucide-react";
import { Header } from "./components/Header";
import { Navigation } from "./components/Navigation";
import { RibbonDisplayMenu } from "./components/RibbonDisplayMenu";
import { lazyWithRetry } from "./lib/lazyWithRetry";
import { TabErrorBoundary } from "./components/TabErrorBoundary";
const GeneralTab = lazyWithRetry(() => import("./components/GeneralTab"), "GeneralTab");
const SummaryTab = lazyWithRetry(() => import("./components/SummaryTab"), "SummaryTab");
const LayoutTab = lazyWithRetry(() => import("./components/LayoutTab"), "LayoutTab");
const DetailTab = lazyWithRetry(() => import("./components/DetailTab"), "DetailTab");
const TaskDelegationTab = lazyWithRetry(() => import("./components/TaskDelegationTab"), "TaskDelegationTab");
const DelegationCalendarTab = lazyWithRetry(() => import("./components/DelegationCalendarTab"), "DelegationCalendarTab");
const CalendarTab = lazyWithRetry(() => import("./components/CalendarTab"), "CalendarTab");
const GanttTab = lazyWithRetry(() => import("./components/GanttTab"), "GanttTab");
const BudgetTab = lazyWithRetry(() => import("./components/BudgetTab"), "BudgetTab");
const CostTab = lazyWithRetry(() => import("./components/CostTab"), "CostTab");
const AccControlTab = lazyWithRetry(() => import("./components/AccControlTab"), "AccControlTab");
const CsvExportTab = lazyWithRetry(() => import("./components/CsvExportTab"), "CsvExportTab");
const PictureMappingTab = lazyWithRetry(() => import("./components/PictureMappingTab").then(m => ({ default: m.PictureMappingTab })), "PictureMappingTab");
const NotificationTab = lazyWithRetry(() => import("./components/NotificationTab"), "NotificationTab");
const SettingTab = lazyWithRetry(() => import("./components/SettingTab"), "SettingTab");
const ManualTab = lazyWithRetry(() => import("./components/ManualTab").then(m => ({ default: m.ManualTab })), "ManualTab");
const AuditLogTab = lazyWithRetry(() => import("./components/AuditLogTab").then(m => ({ default: m.AuditLogTab })), "AuditLogTab");
const AppTour = lazyWithRetry(() => import("./components/AppTour").then(m => ({ default: m.AppTour })), "AppTour");
const CommandPaletteModal = lazyWithRetry(() => import("./components/CommandPaletteModal").then(m => ({ default: m.CommandPaletteModal })), "CommandPaletteModal");
import { ProjectQuickNavModal } from "./components/ProjectQuickNavModal";
const PrintPreviewOverlay = lazyWithRetry(() => import("./components/PrintPreviewOverlay").then(m => ({ default: m.PrintPreviewOverlay })), "PrintPreviewOverlay");
import { AppModals } from "./components/AppModals";
import { PrintOptionsPanel } from "./components/PrintOptionsPanel";
import { Toast } from "./components/Toast";
import { initAuth } from './lib/firebase';
import { enrichProjects, calculateActiveNotifications, getUserAllowedStores } from "./lib/utils";
import { findProjectLayoutUnit } from "./lib/layoutUnitFinder";
import { undoManager, UndoAction } from "./lib/undoManager";
import { useAppStore } from "./store/useAppStore";
import { PrintFilterHeader } from "./components/PrintFilterHeader";
import { getPrintFilterContext } from "./lib/printFilterHelper";
import { exportToExcel, exportToPdf } from "./lib/exportPdfEngine";

export default function App() {
  
  const isFocusMode = useAppStore(state => state.isFocusMode);
  const setIsFocusMode = useAppStore(state => state.setIsFocusMode);
  const isPrintPreview = useAppStore(state => state.isPrintPreview);
  const setIsPrintPreview = useAppStore(state => state.setIsPrintPreview);
  const printOrientation = useAppStore(state => state.printOrientation);
  const printPaperSize = useAppStore(state => state.printPaperSize);
  const printDate = useAppStore(state => state.printDate);
  const printFilterHeader = useAppStore(state => state.printFilterHeader);
  const printScaleMode = useAppStore(state => state.printScaleMode);
  const printScaleCustom = useAppStore(state => state.printScaleCustom);
  const printDpi = useAppStore(state => state.printDpi);
  const printWatermark = useAppStore(state => state.printWatermark);
  const showTour = useAppStore(state => state.showTour);
  const setShowTour = useAppStore(state => state.setShowTour);
  const isExportingPDF = useAppStore(state => state.isExportingPDF);
  const setIsExportingPDF = useAppStore(state => state.setIsExportingPDF);
  const triggerGanttToday = useAppStore(state => state.triggerGanttToday);
  const isCommandPaletteOpen = useAppStore(state => state.isCommandPaletteOpen);
  const setIsCommandPaletteOpen = useAppStore(state => state.setIsCommandPaletteOpen);
  
  useEffect(() => {
    if (isPrintPreview) {
      document.body.classList.add('print-preview-active');
      document.body.style.setProperty('--print-orientation', printOrientation);
      document.documentElement.classList.remove("dark");
    } else {
      document.body.classList.remove('print-preview-active');
      document.body.style.removeProperty('--print-orientation');
      if (useAppStore.getState().theme === "dark") {
        document.documentElement.classList.add("dark");
      }
    }
  }, [isPrintPreview, printOrientation]);

  const onRenderCallback = (
    _id: string,
    _phase: "mount" | "update" | "nested-update",
    _actualDuration: number,
    _baseDuration: number,
    _startTime: number,
    _commitTime: number
  ) => {
    // Profiler onRender callback
  };


  const user = useAppStore(state => state.user);
  const setUser = useAppStore(state => state.setUser);
  const toast = useAppStore(state => state.toast);
  const setToast = useAppStore(state => state.setToast);

  // 15-minute inactivity reset check for location filter
  useEffect(() => {
    const LAST_ACTIVITY_KEY = "taka_last_activity_time";
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

    const checkAndTouchActivity = () => {
      const now = Date.now();
      const lastAct = safeGetItemLocal(LAST_ACTIVITY_KEY);
      if (lastAct) {
        const lastTime = parseInt(lastAct, 10);
        if (!isNaN(lastTime) && (now - lastTime > FIFTEEN_MINUTES_MS)) {
          // Exceeded 15 minutes of inactivity -> Reset location filter to all location ([])
          useAppStore.getState().setGlobalLocationFilter([]);
        }
      } else {
        // First launch
        useAppStore.getState().setGlobalLocationFilter([]);
      }
      safeSetItemLocal(LAST_ACTIVITY_KEY, String(now));
    };

    // Check on initial mount
    checkAndTouchActivity();

    // Listen to user interactions and visibility/focus changes
    let lastThrottledTime = Date.now();
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastThrottledTime > 30000) { // Throttle activity updates every 30s
        lastThrottledTime = now;
        checkAndTouchActivity();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndTouchActivity();
      }
    };

    window.addEventListener('click', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);
    window.addEventListener('focus', checkAndTouchActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('focus', checkAndTouchActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const currentUser = useAppStore(state => state.currentUser);
  useEffect(() => {
    if (currentUser?.role === 'guest') {
      const hasSeenTour = safeGetItemLocal('taka_has_seen_tour');
      if (!hasSeenTour) {
        setShowTour(true);
      }
    }
  }, [currentUser]);

  const handleCloseTour = () => {
    safeSetItemLocal('taka_has_seen_tour', 'true');
    setShowTour(false);
  };

  const setCurrentUser = useAppStore(state => state.setCurrentUser);
  const projects = useAppStore(state => state.projects);
  const setProjects = useAppStore(state => state.setProjects);
  const tasks = useAppStore(state => state.tasks);
  const setTasks = useAppStore(state => state.setTasks);
  const setCosts = useAppStore(state => state.setCosts);
  const appUsers = useAppStore(state => state.appUsers);
  const setAppUsers = useAppStore(state => state.setAppUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const setSubAppUsers = useAppStore(state => state.setSubAppUsers);
  const notificationRules = useAppStore(state => state.notificationRules);
  const setNotificationRules = useAppStore(state => state.setNotificationRules);
  const locations = useAppStore(state => state.locations);
  const setLocations = useAppStore(state => state.setLocations);
  const locationVisibility = useAppStore(state => state.locationVisibility);
  const setLocationVisibility = useAppStore(state => state.setLocationVisibility);
  const parties = useAppStore(state => state.parties);
  const setParties = useAppStore(state => state.setParties);
  const delegationGroups = useAppStore(state => state.delegationGroups);
  const setDelegationGroups = useAppStore(state => state.setDelegationGroups);
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const setPermissionMatrix = useAppStore(state => state.setPermissionMatrix);
  const setJpyRate = useAppStore(state => state.setJpyRate);
  const setUsdRate = useAppStore(state => state.setUsdRate);
  const activeNotifications = useAppStore(state => state.activeNotifications);
  const setActiveNotifications = useAppStore(state => state.setActiveNotifications);
  const activeTab = useAppStore(state => state.activeTab);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const setActiveTab = useAppStore(state => state.setActiveTab);
  const tabHistory = useAppStore(state => state.tabHistory);
  const setTabHistory = useAppStore(state => state.setTabHistory);
  const notificationFilterId = useAppStore(state => state.notificationFilterId);
  const setNotificationFilterId = useAppStore(state => state.setNotificationFilterId);
  const undoStack = useAppStore(state => state.undoStack);
  const setUndoStack = useAppStore(state => state.setUndoStack);



  // Safe Harbor Fallback (Idle Timeout)
  const isAppReadyRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      isAppReadyRef.current = true;
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // ⛔ QUY TẮC BẤT KHẢ XÂM PHẠM: Không unmount data listeners khi sleep
    // (Xóa toàn bộ logic timer debounce chuyển về tab general khi tab bị ẩn)
    // Cho phép giữ resumeToken để sync delta rẻ tiền thay vì cold-boot tải lại toàn bộ.
  }, []);

  useEffect(() => {
    cleanupLocalStorage();
    if (typeof window !== "undefined") {
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const savedAuth = safeGetItemLocal("taka_auth_v1");
      let savedAppUser: AppUser | null = null;
      if (savedAuth) {
        try {
          savedAppUser = JSON.parse(savedAuth) as AppUser;
          if (savedAppUser.preferences?.defaultStore) {
            useAppStore.getState().setGlobalStoreFilter(savedAppUser.preferences.defaultStore);
          }
          if (savedAppUser.preferences?.defaultYear) {
            useAppStore.getState().setGlobalYearFilter(String(savedAppUser.preferences.defaultYear));
          }
          if (savedAppUser.preferences?.currency) {
            useAppStore.getState().setCurrency(savedAppUser.preferences.currency);
          }
        } catch (e) {
          console.error(e);
        }
      }
      
      const userId = savedAppUser?.id || "guest";
      // Removed firstPage/lastTab setActiveTab calls to enforce Safe Boot to 'general'
    }
  }, [setActiveTab]);

  useEffect(() => {
    return undoManager.subscribe(setUndoStack);
  }, [setUndoStack]);

  const isAnyModalOpen = useAppStore(state => !!(state.isLoginModalOpen || state.isProjectModalOpen || state.isTaskModalOpen || state.isUserModalOpen));
  const setIsLoginModalOpen = useAppStore(state => state.setIsLoginModalOpen);
  const setIsProjectModalOpen = useAppStore(state => state.setIsProjectModalOpen);
  const setIsTaskModalOpen = useAppStore(state => state.setIsTaskModalOpen);
  const setIsUserModalOpen = useAppStore(state => state.setIsUserModalOpen);
  const setEditingProject = useAppStore(state => state.setEditingProject);
  const setEditingTask = useAppStore(state => state.setEditingTask);
  const setEditingUser = useAppStore(state => state.setEditingUser);
  const setModalInitialTab = useAppStore(state => state.setModalInitialTab);
  const setFocusCommentId = useAppStore(state => state.setFocusCommentId);
  const setIsReadOnlyModal = useAppStore(state => state.setIsReadOnlyModal);
  const setPrefillProjectCode = useAppStore(state => state.setPrefillProjectCode);
  const setPrefillProjectYear = useAppStore(state => state.setPrefillProjectYear);
  const setPrefillProjectStore = useAppStore(state => state.setPrefillProjectStore);
  const setCostTabSearchTerm = useAppStore(state => state.setCostTabSearchTerm);
  const costTabSearchTerm = useAppStore(state => state.costTabSearchTerm);
  const setBudgetTabSearchTerm = useAppStore(state => state.setBudgetTabSearchTerm);
  const budgetTabSearchTerm = useAppStore(state => state.budgetTabSearchTerm);
  const setDetailTabFilterCode = useAppStore(state => state.setDetailTabFilterCode);
  const detailTabFilterCode = useAppStore(state => state.detailTabFilterCode);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const setDetailTabStoreFilter = useAppStore(state => state.setDetailTabStoreFilter);
  const setDetailTabFocusTaskId = useAppStore(state => state.setDetailTabFocusTaskId);
  const detailTabFocusTaskId = useAppStore(state => state.detailTabFocusTaskId);
  const setDetailReturnScrollId = useAppStore(state => state.setDetailReturnScrollId);
  const detailReturnScrollId = useAppStore(state => state.detailReturnScrollId);
  const setGanttTabFocusTaskId = useAppStore(state => state.setGanttTabFocusTaskId);
  const ganttTabFocusTaskId = useAppStore(state => state.ganttTabFocusTaskId);
  const setLayoutTabFilters = useAppStore(state => state.setLayoutTabFilters);
  const layoutTabFilters = useAppStore(state => state.layoutTabFilters);
  const printRangeType = useAppStore(state => state.printRangeType);
  const printStartDate = useAppStore(state => state.printStartDate);
  const printEndDate = useAppStore(state => state.printEndDate);
  const cloudStatus = useAppStore(state => state.cloudStatus);
  const setCloudStatus = useAppStore(state => state.setCloudStatus);
  const theme = useAppStore(state => state.theme);
  const setTheme = useAppStore(state => state.setTheme);
  const allProjectsForNotifs = useAppStore(state => state.allProjectsForNotifs);
  const allTasksForNotifs = useAppStore(state => state.allTasksForNotifs);
  const quickNavTarget = useAppStore(state => state.quickNavTarget);
  const setQuickNavTarget = useAppStore(state => state.setQuickNavTarget);
  const ribbonDisplayMode = useAppStore(state => state.ribbonDisplayMode);
  const setRibbonDisplayMode = useAppStore(state => state.setRibbonDisplayMode);

  useEffect(() => {
    if (ribbonDisplayMode !== 'fullscreen') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRibbonDisplayMode('always_show');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ribbonDisplayMode, setRibbonDisplayMode]);

  useEffect(() => {
    // Clear custom today line so it refreshes once on app launch
    safeRemoveItemLocal("taka_gantt_custom_today");
  }, []);

  useEffect(() => {
    const savedTheme = safeGetItemLocal("taka_theme_v1");
    if (savedTheme === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    } else {
      setTheme("light");
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    safeSetItemLocal("taka_theme_v1", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const handleRequestPermission = async () => {
    const token = await requestNotificationPermission(currentUser.id);
    if (token) {
      // Small delay to let iOS UI recover from permission dialog/alerts
      setTimeout(() => {
        setToast({ title: "Thành công", message: "Đã kích hoạt thông báo!" });
      }, 500);
    }
  };

  useEffect(() => {
    if (currentUser.id !== "guest" && 'Notification' in window && Notification.permission === 'granted') {
      requestNotificationPermission(currentUser.id, true).catch(console.error);
    }
  }, [currentUser.id]);

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [isAnyModalOpen]);

  useFirebaseData();
  usePushNotifications();
  const notifActions = useNotificationActions();

  const enrichedProjects = useMemo(() => {
    const tasksByProject = new Map<string, Task[]>();
    tasks.forEach(t => {
      const key = `${t.projectCode || ""}-${t.projectYear || ""}-${t.projectStore || ""}`;
      if (!tasksByProject.has(key)) tasksByProject.set(key, []);
      tasksByProject.get(key)!.push(t);
    });
    
    const enriched = enrichProjects(projects, tasks);
    if (currentUser.role === "admin") return enriched;

    let visibleEnriched = enriched.filter((p) => {
      // Store check
      const store = String(p.store || "").toUpperCase().trim();
      const allowedStores = getUserAllowedStores(currentUser);
      let hasStorePerm = allowedStores.includes(store);
      if (!hasStorePerm && (store === "HCM" || store === "HN")) {
        hasStorePerm = allowedStores.includes(store);
      } else if (!hasStorePerm && store !== "HCM" && store !== "HN") {
        hasStorePerm = currentUser.role === "admin" || allowedStores.length >= 2;
      }
      const hasLocAll = currentUser.locationPermissions?.all === true;
      const hasPartyAll = currentUser.partyPermissions?.all === true;

      // Location check (Dynamic)
      const loc = String(p.location || "").toLowerCase().trim();
      let permLoc = loc;
      if (["md-b1", "md-l1", "md-l2", "md-l3", "md-l4"].includes(permLoc)) {
        permLoc = permLoc.replace("md-", "");
      }
      const hasLocPerm =
        currentUser.locationPermissions?.all ||
        (currentUser.locationPermissions?.[permLoc] ?? false);

      // Party check for project
      const userParties = currentUser.partyPermissions
        ? Object.keys(currentUser.partyPermissions)
            .filter((k) => currentUser.partyPermissions![k] && k.toLowerCase() !== "all")
            .map((k) => k.toLowerCase().trim())
        : [];
      const isPartyRestricted = false;
      const username = String(currentUser.username || "")
        .toLowerCase()
        .trim();
      const userId = String(currentUser.id || "")
        .toLowerCase()
        .trim();

      const pPartyList = String(p.party || "")
        .toLowerCase()
        .split(/[,;/+]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const pMatch =
        pPartyList.some((party) => userParties.includes(party)) ||
        pPartyList.includes(username) ||
        pPartyList.includes(userId);

      const pKey = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
      const groupTasks = tasksByProject.get(pKey) || [];

      const tMatch = groupTasks.some((t) => {
        const tPartyList = String(t.party || "")
          .toLowerCase()
          .split(/[,;/+]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const tMatch =
          tPartyList.some((party) => userParties.includes(party)) ||
          tPartyList.includes(username) ||
          tPartyList.includes(userId);
        return tMatch;
      });

      // Mandatory Store & Location permission checks
      if (!hasStorePerm || !hasLocPerm) {
        return false;
      }

      // If By-Party Access is enabled for user, require party match
      if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true) {
        return pMatch || tMatch;
      }

      return true;
    });

    return visibleEnriched;
  }, [projects, tasks, currentUser]);

  const filteredTasks = useMemo(() => {
    if (currentUser.role === "admin") return tasks;
    const visibleProjectKeys = new Set(
      enrichedProjects.map((p) =>
        `${String(p.code).trim()}_${String(p.year || "").trim()}_${String(p.store || "").trim()}`.toLowerCase(),
      ),
    );

    // First, filter by visible projects (based on store/location permissions)
    let visibleTasks = tasks.filter((t) => {
      const taskKey =
        `${String(t.projectCode).trim()}_${String(t.projectYear || "").trim()}_${String(t.projectStore || "").trim()}`.toLowerCase();
      return (
        visibleProjectKeys.has(taskKey) ||
        visibleProjectKeys.has(`${String(t.projectCode).trim()}__`.toLowerCase())
      ); // Fallback for legacy tasks without year/store if needed, but better strict
    });

    const userParties = currentUser.partyPermissions
      ? Object.keys(currentUser.partyPermissions)
          .filter((k) => currentUser.partyPermissions![k] && k.toLowerCase() !== "all")
          .map((k) => k.toLowerCase().trim())
      : [];
    const isPartyRestricted = false;
    const username = String(currentUser.username || "")
      .toLowerCase()
      .trim();
    const userId = String(currentUser.id || "")
      .toLowerCase()
      .trim();

    if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true) {
      visibleTasks = visibleTasks.filter((t) => {
        const parentProject = enrichedProjects.find(
          (p) =>
            `${String(p.code).trim()}_${String(p.year || "").trim()}_${String(p.store || "").trim()}`.toLowerCase() ===
              `${String(t.projectCode).trim()}_${String(t.projectYear || "").trim()}_${String(t.projectStore || "").trim()}`.toLowerCase() ||
            `${String(p.code).trim()}__`.toLowerCase() === `${String(t.projectCode).trim()}__`.toLowerCase(),
        );

        const projectPartyList = parentProject
          ? String(parentProject.party || "")
              .toLowerCase()
              .split(/[,;/+]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        const tPartyList = String(t.party || "")
          .toLowerCase()
          .split(/[,;/+]+/)
          .map((s) => s.trim())
          .filter(Boolean);

        const pMatch =
          projectPartyList.some((p) => userParties.includes(p)) ||
          projectPartyList.includes(username) ||
          projectPartyList.includes(userId);
        const tMatch =
          tPartyList.some((p) => userParties.includes(p)) ||
          tPartyList.includes(username) ||
          tPartyList.includes(userId);

        return pMatch || tMatch;
      });
    }

    return visibleTasks;
  }, [tasks, enrichedProjects, currentUser]);

  const visibleDelegationGroups = useMemo(() => {
    if (currentUser.role === "admin") return delegationGroups;

    return delegationGroups.filter((group) => {
      let hasAccess = false;
      const isAdmin = currentUser.role === "admin";
      if (isAdmin) {
        hasAccess = true;
      } else {
        const isCreator = group.createdBy === currentUser.id;
        const isSubTaskInvolved = group.subTasks?.some(
          (st) =>
            st.createdBy === currentUser.id ||
            (st.involvedUsers && st.involvedUsers.includes(currentUser.id)),
        );
        const groupHasParty = group.subTasks?.some((st) => {
          const pPartyList = String(st.party || "")
            .toLowerCase()
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          const userParties = currentUser.partyPermissions
            ? Object.keys(currentUser.partyPermissions)
                .filter((k) => currentUser.partyPermissions![k])
                .map((k) => k.toLowerCase().trim())
            : [];

          if (userParties.includes("all")) {
            return true;
          }
          const username = String(currentUser.username || "")
            .toLowerCase()
            .trim();
          return (
            pPartyList.some((p) => userParties.includes(p)) ||
            pPartyList.includes(username)
          );
        });

        hasAccess = isCreator || isSubTaskInvolved || groupHasParty;
      }
      if (!hasAccess) return false;

      return true;
    });
  }, [delegationGroups, filteredTasks, enrichedProjects, currentUser]);

  const enrichedProjectsRef = useRef(enrichedProjects);
  const filteredTasksRef = useRef(filteredTasks);

  useEffect(() => {
    enrichedProjectsRef.current = enrichedProjects;
    filteredTasksRef.current = filteredTasks;
  }, [enrichedProjects, filteredTasks]);

  // Service Worker and URL deep linking are handled via the unified, instant executeDeepLink handler below

  const globalEnrichedProjectsForNotifs = useMemo(() => {
    const baseProjects = allProjectsForNotifs.length > 0 ? allProjectsForNotifs : projects;
    const baseTasks = allTasksForNotifs.length > 0 ? allTasksForNotifs : tasks;
    const enriched = enrichProjects(baseProjects, baseTasks);
    if (currentUser.role === "admin") return enriched;

    const userParties = currentUser.partyPermissions
      ? Object.keys(currentUser.partyPermissions)
          .filter((k) => currentUser.partyPermissions![k] && k.toLowerCase() !== "all")
          .map((k) => k.toLowerCase().trim())
      : [];
    const isPartyRestricted = false;
    const username = String(currentUser.username || "").toLowerCase().trim();
    const userId = String(currentUser.id || "").toLowerCase().trim();

    const tasksByProject = new Map<string, Task[]>();
    baseTasks.forEach((t) => {
      const key = `${t.projectCode || ""}-${t.projectYear || ""}-${t.projectStore || ""}`;
      if (!tasksByProject.has(key)) tasksByProject.set(key, []);
      tasksByProject.get(key)!.push(t);
    });

    return enriched.filter((p) => {
      const store = String(p.store || "").toUpperCase().trim();
      const allowedStores = getUserAllowedStores(currentUser);
      let hasStorePerm = allowedStores.includes(store);
      if (!hasStorePerm && (store === "HCM" || store === "HN")) {
        hasStorePerm = allowedStores.includes(store);
      } else if (!hasStorePerm && store !== "HCM" && store !== "HN") {
        hasStorePerm = currentUser.role === "admin" || allowedStores.length >= 2;
      }
      const hasLocAll = currentUser.locationPermissions?.all === true;
      const hasPartyAll = currentUser.partyPermissions?.all === true;

      const loc = String(p.location || "").toLowerCase().trim();
      let permLoc = loc;
      if (["md-b1", "md-l1", "md-l2", "md-l3", "md-l4"].includes(permLoc)) {
        permLoc = permLoc.replace("md-", "");
      }
      const hasLocPerm =
        currentUser.locationPermissions?.all ||
        (currentUser.locationPermissions?.[permLoc] ?? false);

      const pPartyList = String(p.party || "")
        .toLowerCase()
        .split(/[,;/+]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const pMatch =
        pPartyList.some((party) => userParties.includes(party)) ||
        pPartyList.includes(username) ||
        pPartyList.includes(userId);

      const pKey = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
      const groupTasks = tasksByProject.get(pKey) || [];

      const tMatch = groupTasks.some((t) => {
        const tPartyList = String(t.party || "")
          .toLowerCase()
          .split(/[,;/+]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        return (
          tPartyList.some((party) => userParties.includes(party)) ||
          tPartyList.includes(username) ||
          tPartyList.includes(userId)
        );
      });

      // Mandatory Store & Location permission checks
      if (!hasStorePerm || !hasLocPerm) {
        return false;
      }

      // If By-Party Access is enabled for user, require party match
      if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true) {
        return pMatch || tMatch;
      }

      return true;
    });
  }, [allProjectsForNotifs, allTasksForNotifs, projects, tasks, currentUser]);

  const globalFilteredTasksForNotifs = useMemo(() => {
    const baseTasks = allTasksForNotifs.length > 0 ? allTasksForNotifs : tasks;
    if (currentUser.role === "admin") return baseTasks;

    const visibleProjectKeys = new Set(
      globalEnrichedProjectsForNotifs.map((p) =>
        `${String(p.code).trim()}_${String(p.year || "").trim()}_${String(p.store || "").trim()}`.toLowerCase(),
      ),
    );

    let visibleTasks = baseTasks.filter((t) => {
      const taskKey = `${String(t.projectCode).trim()}_${String(t.projectYear || "").trim()}_${String(t.projectStore || "").trim()}`.toLowerCase();
      return (
        visibleProjectKeys.has(taskKey) ||
        visibleProjectKeys.has(`${String(t.projectCode).trim()}__`.toLowerCase())
      );
    });

    const userParties = currentUser.partyPermissions
      ? Object.keys(currentUser.partyPermissions)
          .filter((k) => currentUser.partyPermissions![k] && k.toLowerCase() !== "all")
          .map((k) => k.toLowerCase().trim())
      : [];
    const isPartyRestricted = false;
    const username = String(currentUser.username || "").toLowerCase().trim();
    const userId = String(currentUser.id || "").toLowerCase().trim();

    if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true) {
      visibleTasks = visibleTasks.filter((t) => {
        const parentProject = globalEnrichedProjectsForNotifs.find(
          (p) =>
            `${String(p.code).trim()}_${String(p.year || "").trim()}_${String(p.store || "").trim()}`.toLowerCase() ===
              `${String(t.projectCode).trim()}_${String(t.projectYear || "").trim()}_${String(t.projectStore || "").trim()}`.toLowerCase() ||
            `${String(p.code).trim()}__`.toLowerCase() === `${String(t.projectCode).trim()}__`.toLowerCase(),
        );

        const projectPartyList = parentProject
          ? String(parentProject.party || "").toLowerCase().split(/[,;/+]+/).map((s) => s.trim()).filter(Boolean)
          : [];

        const tPartyList = String(t.party || "").toLowerCase().split(/[,;/+]+/).map((s) => s.trim()).filter(Boolean);

        const pMatch =
          projectPartyList.some((p) => userParties.includes(p)) ||
          projectPartyList.includes(username) ||
          projectPartyList.includes(userId);
        const tMatch =
          tPartyList.some((p) => userParties.includes(p)) ||
          tPartyList.includes(username) ||
          tPartyList.includes(userId);

        return pMatch || tMatch;
      });
    }

    return visibleTasks;
  }, [allTasksForNotifs, tasks, globalEnrichedProjectsForNotifs, currentUser]);

  useEffect(() => {
    const notifs = calculateActiveNotifications(
      globalEnrichedProjectsForNotifs,
      globalFilteredTasksForNotifs,
      notificationRules,
      visibleDelegationGroups,
      currentUser.id,
      currentUser.username,
    );
    setActiveNotifications(notifs);

    // Keep readNotifs list clean locally (keep last 300 IDs)
    if (currentUser.readNotifs && currentUser.readNotifs.length > 300) {
      const trimmed = currentUser.readNotifs.slice(-200);
      safeSetItemLocal(`taka_read_notifs_${currentUser.id}`, JSON.stringify(trimmed));
    }

    // Check for new notifications to show system pop-ups
    if (
      currentUser.id !== "guest" &&
      currentUser.notification !== false &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const notifiedStr = safeGetItemLocal(
        `taka_notified_${currentUser.id}`,
      );
      const notifiedIds: string[] = notifiedStr ? JSON.parse(notifiedStr) : [];
      let hasNew = false;

      notifs.forEach((notif) => {
        if (!notifiedIds.includes(notif.id)) {
          hasNew = true;
          notifiedIds.push(notif.id);

          // Show system notification
          if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready
              .then((registration) => {
                registration.showNotification(notif.title, {
                  body: notif.message,
                  icon: "/manifest-icon-192.maskable.png",
                  data: {
                    targetType: notif.targetType,
                    targetId: notif.targetId,
                    notificationId: notif.id,
                  },
                });
              })
              .catch(console.error);
          } else {
            const n = new Notification(notif.title, {
              body: notif.message,
              icon: "/manifest-icon-192.maskable.png",
              data: {
                targetType: notif.targetType,
                targetId: notif.targetId,
                notificationId: notif.id,
              },
            });
            n.onclick = (e) => {
              e.preventDefault();
              window.focus();
              setNotificationFilterId(notif.id);
              setActiveTab("notification");
            };
          }
        }
      });

      if (hasNew) {
        safeSetItemLocal(
          `taka_notified_${currentUser.id}`,
          JSON.stringify(notifiedIds),
        );
      }
    }
  }, [globalEnrichedProjectsForNotifs, globalFilteredTasksForNotifs, notificationRules, visibleDelegationGroups, currentUser]);

  const readNotifs = currentUser.readNotifs || [];
  const unreadCount = currentUser.notification === false ? 0 : activeNotifications.filter(
    (n) => !readNotifs.includes(n.id),
  ).length;

  const visibleTabs = useMemo(() => {
    const isAdmin = currentUser.role === "admin";
    const uRole = (
      currentUser.role === "admin"
        ? "admin"
        : (currentUser.role as string)?.toUpperCase() === "CP"
        ? "CP"
        : (currentUser.role as string)?.toLowerCase() === "manager"
        ? "Manager"
        : (currentUser.role as string)?.toLowerCase() === "staff"
        ? "Staff"
        : (currentUser.role as string)?.toLowerCase() === "external"
        ? "External"
        : currentUser.role
    ) as AppRole;
    const perms = permissionMatrix[uRole]?.See;
    const writePerms = permissionMatrix[uRole]?.Write;
    if (!isAdmin && !currentUser.canSee) return [];

    const canSeeModule = (module: PermissionModule) => {
    if (module === 'taskDelegation') return isAdmin || !!perms?.[module];
    return isAdmin || !!perms?.[module] || !!writePerms?.[module];
  };

    const order: { id: TabId; hidden: boolean }[] = [
      {
        id: "calendar",
        hidden: !(canSeeModule("calendar") || canSeeModule("report")),
      },
      {
        id: "taskDelegationCalendar",
        hidden: !canSeeModule("taskDelegation"),
      },
      { id: "general", hidden: !canSeeModule("general") },
      { id: "taskDelegation", hidden: !canSeeModule("taskDelegation") },
      { id: "detail", hidden: !canSeeModule("detail") },
      { id: "gantt", hidden: !canSeeModule("report") },
      {
        id: "summary",
        hidden: !(canSeeModule("summary") || canSeeModule("report")),
      },
      { id: "layout", hidden: !canSeeModule("layout") },
      { id: "budget", hidden: !canSeeModule("budget") },
      { id: "cost", hidden: !canSeeModule("costDetail") },
      { id: "picture_mapping", hidden: !canSeeModule("pictureMapping") },
      { id: "csv_export", hidden: !canSeeModule("importCsv") },
      { id: "accControl", hidden: false },
      {
        id: "notification",
        hidden: !isAdmin && currentUser.notification === false,
      },
      { id: "setting", hidden: currentUser.role === "guest" },
    ];
    return order.filter((t) => !t.hidden).map((t) => t.id);
  }, [currentUser, permissionMatrix]);

  useEffect(() => {
    if ("setAppBadge" in navigator) {
      if (unreadCount > 0) {
        (navigator as any).setAppBadge(unreadCount).catch(console.error);
      } else {
        (navigator as any).clearAppBadge().catch(console.error);
      }
    }
  }, [unreadCount]);



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


  const { handleDeepLinkString, pendingDeepLinkRef, executeDeepLinkRef } = useDeepLinkLogic(
    handleTabChange,
    enrichedProjectsRef,
    filteredTasksRef
  );

  const handleLogin = (appUser: AppUser) => {
    setCurrentUser(appUser);
    safeSetItemLocal("taka_auth_v1", JSON.stringify(appUser));
    
    if (appUser.preferences?.defaultStore) {
      useAppStore.getState().setGlobalStoreFilter(appUser.preferences.defaultStore);
    }
    if (appUser.preferences?.defaultYear) {
      useAppStore.getState().setGlobalYearFilter(String(appUser.preferences.defaultYear));
    }
    if (appUser.preferences?.currency) {
      useAppStore.getState().setCurrency(appUser.preferences.currency);
    }

    setIsLoginModalOpen(false);

    if (pendingDeepLinkRef.current && executeDeepLinkRef.current) {
      const pending = pendingDeepLinkRef.current;
      pendingDeepLinkRef.current = null;
      executeDeepLinkRef.current(pending.targetType, pending.targetId, pending.extraParams);
    } else {
      // Enforce Safe Boot to 'general' tab after login
      setActiveTab("general");
    }
  };

  // Reset scroll position to top when switching tabs to prevent layout jumping ("nhảy màn hình")
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [activeTab]);

  const handleNavigateToTaskDetail = (taskId: string) => {
    startTransition(() => {
      const targetTask = tasks.find((t) => t.id === taskId);
      if (targetTask) {
        const targetProject = projects.find(
          (p) =>
            String(p.code || "").trim().toLowerCase() === String(targetTask.projectCode || "").trim().toLowerCase() &&
            (!targetTask.projectStore || !p.store || String(p.store).trim().toLowerCase() === String(targetTask.projectStore).trim().toLowerCase()) &&
            (!targetTask.projectYear || !p.year || String(p.year).trim() === String(targetTask.projectYear).trim())
        ) || projects.find(
          (p) => String(p.code || "").trim().toLowerCase() === String(targetTask.projectCode || "").trim().toLowerCase()
        );

        const subTaskCode = computeTaskCode(projects, tasks, targetTask) || targetTask.taskCodePhu || (targetProject ? `${targetProject.code}#1` : targetTask.projectCode || "");

        if (targetProject) {
          setDetailTabFilterCode(subTaskCode);
          if (targetProject.store) {
            setGlobalStoreFilter(targetProject.store);
          }
          if (targetProject.year) {
            setGlobalYearFilter(String(targetProject.year));
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
      setGanttTabFocusTaskId(taskId);
      setDetailTabFocusTaskId(taskId);
      handleTabChange("detail");
    });
  };

  const handleNavigateToLayout = (
    store: string,
    location: string,
    projectCode?: string,
    sourceTaskId?: string,
  ) => {
    setLayoutTabFilters({ store, location, projectCode, sourceTaskId });
    handleTabChange("layout");
  };

  const handleQuickNavigate = (targetTab: TabId, target: any) => {
    const p = target.project;
    const task = target.task;
    const taskCode = target.taskCode;
    const effectiveFilterCode = taskCode || (task ? (task.taskCodePhu || p?.code) : p?.code) || "";

    // 1. Sync Year filter
    const yearVal = p?.year || (task?.projectYear ? Number(task.projectYear) : null);
    if (yearVal) {
      setGlobalYearFilter(String(yearVal));
    } else {
      setGlobalYearFilter("all");
    }

    // 2. Sync Store filter
    const storeVal = p?.store || task?.projectStore;
    if (storeVal) {
      setGlobalStoreFilter(storeVal);
      safeSetItemLocal(
        `taka_store_filter_${currentUser.id}`,
        String(storeVal),
      );
    } else {
      setGlobalStoreFilter("all");
      safeSetItemLocal(
        `taka_store_filter_${currentUser.id}`,
        "all",
      );
    }

    // 3. Tab-specific search & filter synchronization
    switch (targetTab) {
      case "layout": {
        setLayoutTabFilters({
          store: p?.store || task?.projectStore || "all",
          location: p?.location || "all",
          projectCode: p?.code || task?.projectCode || "",
        });
        handleTabChange("layout");
        break;
      }
      case "gantt": {
        if (effectiveFilterCode) {
          safeSetItemSession("taka_gantt_search", effectiveFilterCode);
        }
        if (task?.id) {
          setGanttTabFocusTaskId(task.id);
        }
        safeSetItemSession("taka_gantt_trigger_today", "true");
        triggerGanttToday();
        handleTabChange("gantt");
        break;
      }
      case "detail": {
        if (effectiveFilterCode) {
          setDetailTabFilterCode(effectiveFilterCode);
        } else {
          setDetailTabFilterCode("");
        }
        if (p?.store || task?.projectStore) {
          setDetailTabStoreFilter(p?.store || task?.projectStore || "");
        }
        if (task?.id) {
          setDetailTabFocusTaskId(task.id);
        }
        handleTabChange("detail");
        break;
      }
      case "budget": {
        if (effectiveFilterCode) {
          setBudgetTabSearchTerm(effectiveFilterCode);
        } else {
          setBudgetTabSearchTerm("");
        }
        handleTabChange("budget");
        break;
      }
      case "cost": {
        if (effectiveFilterCode) {
          setCostTabSearchTerm(effectiveFilterCode);
        } else {
          setCostTabSearchTerm("");
        }
        handleTabChange("cost");
        break;
      }
      default: {
        handleTabChange(targetTab);
        break;
      }
    }
  };

  const handleDataUndo = async () => {
    if (activeTab === "detail" && detailTabFocusTaskId) {
      const prev =
        tabHistory.length > 0 ? tabHistory[tabHistory.length - 1] : "gantt";
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTyping =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          (activeElement as HTMLElement).isContentEditable);

      // Esc: Close open modals / blur / print preview
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

      // Ctrl + K / Cmd + K: Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const state = useAppStore.getState();
        state.setIsCommandPaletteOpen(!state.isCommandPaletteOpen);
        return;
      }

      // Ctrl + Z / Cmd + Z: Undo action (when not actively editing text in input)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (!isTyping) {
          e.preventDefault();
          handleDataUndoRef.current?.();
        }
        return;
      }

      // Shift + F: Toggle Focus Mode
      if (e.shiftKey && e.key.toUpperCase() === "F" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!isTyping) {
          e.preventDefault();
          setIsFocusMode(!isFocusMode);
        }
        return;
      }

      // If typing inside an input/textarea or holding modifier keys, ignore single-key shortcuts
      if (isTyping) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // /: Focus global search input (Projects, Tasks, Assignees)
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

      // Backspace: Back to previous page / tab history
      if (e.key === "Backspace") {
        const state = useAppStore.getState();
        if (state.isProjectModalOpen || state.isTaskModalOpen || state.isUserModalOpen || state.isLoginModalOpen) {
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

      // P: New Project
      if (e.key.toLowerCase() === "p") {
        const state = useAppStore.getState();
        const userRole = state.currentUser?.role;
        const canWrite = userRole === "admin" || (userRole && state.permissionMatrix[userRole as AppRole]?.Write?.general);
        if (canWrite) {
          e.preventDefault();
          setEditingProject(null);
          setIsReadOnlyModal(false);
          setModalInitialTab("details");
          setIsProjectModalOpen(true);
        }
        return;
      }

      // T: New Task
      if (e.key.toLowerCase() === "t") {
        if (!isAppReadyRef.current) return;
        const state = useAppStore.getState();
        const userRole = state.currentUser?.role;
        const canWrite = userRole === "admin" || (userRole && state.permissionMatrix[userRole as AppRole]?.Write?.detail);
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

      // 1 - 9: Switch tabs
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
    projects,
    handleTabChange,
    setIsFocusMode,
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

    const isScrollableX = (el: HTMLElement | null): boolean => {
      if (!el || el === document.body || el === document.documentElement)
        return false;
      const style = window.getComputedStyle(el);
      const overflowX = style.overflowX;
      if (overflowX === "auto" || overflowX === "scroll") {
        if (el.scrollWidth > el.clientWidth) {
          return true;
        }
      }
      return isScrollableX(el.parentElement);
    };

    const isScrollableY = (el: HTMLElement | null): boolean => {
      if (!el || el === document.body || el === document.documentElement)
        return false;
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        if (el.scrollHeight > el.clientHeight) {
          return true;
        }
      }
      return isScrollableY(el.parentElement);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isMultiTouch) return;

      // Disable swipe-to-tab if the user is zoomed in
      if (window.visualViewport && window.visualViewport.scale > 1) {
        return;
      }

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;

      const diffX = startX - endX; // Positive means swiped left
      const diffY = startY - endY;

      // Check if user has selected text
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        return;
      }

      // Check if target is an input field
      if (
        touchTarget &&
        touchTarget.closest('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }

      // Handle Tab Switch Gestures
      // Handle swipe right to go back
      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
        // Swiped right from left edge (always trigger GoBack, overriding scrollable content)
        if (diffX < 0 && startX <= 40) { 
          handleGoBackRef.current();
        } else if (!isScrollableX(touchTarget)) {
          // Other non-edge swipe gestures can go here
        }
      }
    };

    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [activeTab, visibleTabs]);

  const handleLogout = () => {
    const guest: AppUser = {
      id: "guest",
      username: "Guest",
      role: "guest",
      canSee: false,
      canWrite: false,
    };
    setCurrentUser(guest);
    safeSetItemLocal("taka_auth_v1", JSON.stringify(guest));
    handleTabChange("calendar");
  };

  const handlePrintClick = () => {
    setIsPrintPreview(true);
  };

  const canSee = currentUser.role === "admin" || currentUser.canSee;
  const userRole = (
    currentUser?.role === "admin"
      ? "admin"
      : (currentUser?.role as string)?.toUpperCase() === "CP"
      ? "CP"
      : (currentUser?.role as string)?.toLowerCase() === "manager"
      ? "Manager"
      : (currentUser?.role as string)?.toLowerCase() === "staff"
      ? "Staff"
      : (currentUser?.role as string)?.toLowerCase() === "external"
      ? "External"
      : currentUser?.role
  ) as AppRole;

  const visibleLocations = locations.filter(
    (loc) => locationVisibility[loc] !== false,
  );

  const activeLocations = useMemo(() => {
    const used = new Set<string>();
    enrichedProjects.forEach((p) => {
      if (p.location) used.add(p.location);
    });
    return visibleLocations.filter((loc) => used.has(loc));
  }, [visibleLocations, enrichedProjects]);

  const getPaperDimensions = () => {
    if (printPaperSize === 'A2') return { w: 420, h: 594 };
    if (printPaperSize === 'A3') return { w: 297, h: 420 };
    return { w: 210, h: 297 };
  };
  const { w: paperW, h: paperH } = getPaperDimensions();
  const printWidth = printOrientation === 'landscape' ? paperH : paperW;
  const printHeight = printOrientation === 'landscape' ? paperW : paperH;

  const printFilteredData = useMemo(() => {
    if (!isPrintPreview || activeTab !== "gantt") return { sortedProjects: [], tasksByProj: new Map(), expanded: [] };

    const expandedStr = safeGetItemSession("taka_gantt_expanded_projects");
    const expanded = expandedStr ? JSON.parse(expandedStr) : [];
      
    const filterLocationStr = safeGetItemSession("taka_gantt_filter_location");
    const filterLocation: string[] = filterLocationStr ? JSON.parse(filterLocationStr) : [];
    const filterProjectStatus = safeGetItemSession("taka_gantt_filter_project_status") || "active";
    const filterYear = safeGetItemSession("taka_gantt_filter_year") || "all";
    const filterStore = safeGetItemLocal(`taka_store_filter_${currentUser?.id}`) || "all";
    const searchTerm = safeGetItemSession("taka_gantt_search") || "";

    const tasksByProj = new Map<string, typeof filteredTasks>();
    filteredTasks.forEach(t => {
      const pKeys: string[] = [];
      if (t.party === "All") {
        enrichedProjects.forEach(p => pKeys.push(`${p.code || ""}-${p.year || ""}-${p.store || ""}`));
      } else {
        enrichedProjects.filter(p => p.location === t.party).forEach(p => pKeys.push(`${p.code || ""}-${p.year || ""}-${p.store || ""}`));
      }
      pKeys.forEach(key => {
        if (!tasksByProj.has(key)) tasksByProj.set(key, []);
        tasksByProj.get(key)!.push(t);
      });
    });

    const actuallyVisibleProjects = enrichedProjects.filter((p) => {
      if (filterYear !== "all" && String(p.year) !== filterYear) return false;
      if (filterStore !== "all" && p.store !== filterStore) return false;
      if (filterLocation.length > 0 && !filterLocation.includes(p.location)) return false;

      if (filterProjectStatus && filterProjectStatus !== "all") {
        const pStart = p.computedTakStart || p.start || "9999-12-31";
        const pEnd = p.computedTakCompl || p.handover;
        const pStatus = getStatus(
          pStart,
          pEnd,
          p.computedOpening || p.opening,
          p.code,
        );

        if (filterProjectStatus === "active") {
          if (pStatus !== "On process" && pStatus !== "Upcoming") return false;
        } else if (pStatus !== filterProjectStatus) {
          return false;
        }
      }

      const pKey = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
      const projectTasks = tasksByProj.get(pKey) || [];

      if (searchTerm) {
        return matchesAdvancedSearch(
          searchTerm,
          [p.code, p.name, p.store, p.location],
          [],
          (term, andTerms) => {
            return projectTasks.some((t) => {
              return andTerms.every((tTerm) => {
                const inProject = [p.code, p.name, p.store, p.location].some(
                  (v) =>
                    String(v || "")
                      .toLowerCase()
                      .includes(tTerm),
                );
                if (inProject) return true;
                return [t.name, t.party].some((v) =>
                  String(v || "")
                    .toLowerCase()
                    .includes(tTerm),
                );
              });
            });
          },
        );
      }
      return true;
    });

    const statusPriority: Record<string, number> = {
      "On process": 1,
      Upcoming: 2,
      Completed: 3,
      Handover: 4,
      Canceled: 5,
    };

    const sortedProjects = [...actuallyVisibleProjects].sort((a, b) => {
      const pinA = a.isPinned ? 1 : 0;
      const pinB = b.isPinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;

      const aStart = a.computedTakStart || a.start || "9999-12-31";
      const aEnd = a.computedTakCompl || a.handover;
      const aStatus = getStatus(aStart, aEnd, a.computedOpening || a.opening, a.code);

      const bStart = b.computedTakStart || b.start || "9999-12-31";
      const bEnd = b.computedTakCompl || b.handover;
      const bStatus = getStatus(bStart, bEnd, b.computedOpening || b.opening, b.code);

      const pA = statusPriority[aStatus] || 99;
      const pB = statusPriority[bStatus] || 99;

      if (pA !== pB) return pA - pB;

      if (aStatus === "On process") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const finishA = parseDateTime(aEnd || a.computedOpening || a.opening);
        const finishB = parseDateTime(bEnd || b.computedOpening || b.opening);

        if (finishA && finishB) {
          const diffA = Math.abs(finishA.getTime() - today.getTime());
          const diffB = Math.abs(finishB.getTime() - today.getTime());
          if (diffA !== diffB) {
            return diffA - diffB;
          }
        }
      }
      return aStart.localeCompare(bStart);
    });

    return { sortedProjects, tasksByProj, expanded };
  }, [isPrintPreview, activeTab, enrichedProjects, filteredTasks, currentUser?.id]);

  const printFilterContext = useMemo(() => {
    let fallbackCode = "";
    if (activeTab === "gantt" && printFilteredData.sortedProjects.length === 1) {
      fallbackCode = printFilteredData.sortedProjects[0].code;
    }
    return getPrintFilterContext({
      activeTab,
      globalStoreFilter,
      globalYearFilter,
      currentUser,
      detailTabFilterCode,
            layoutTabFilters,
      fallbackProjectCode: fallbackCode,
    });
  }, [
    activeTab,
    globalStoreFilter,
    globalYearFilter,
    currentUser,
    detailTabFilterCode,
        layoutTabFilters,
    printFilteredData,
  ]);

  const printDates = useMemo(() => {
    let minDate = new Date();
    let maxDate = new Date();
    let hasDates = false;

    const { sortedProjects, tasksByProj } = printFilteredData;

    if (printRangeType === "custom") {
       if (printStartDate) { minDate = parseDateTime(printStartDate) || new Date(); hasDates = true; }
       if (printEndDate) { maxDate = parseDateTime(printEndDate) || new Date(); hasDates = true; }
    } else {
      const updateMinMax = (dateStr: string | undefined | null) => {
        if (!dateStr) return;
        const d = parseDateTime(dateStr);
        if (d && !isNaN(d.getTime())) {
          if (!hasDates) {
            minDate = d;
            maxDate = d;
            hasDates = true;
          } else {
            if (d < minDate) minDate = d;
            if (d > maxDate) maxDate = d;
          }
        }
      };

      sortedProjects.forEach((p) => {
        updateMinMax(p.computedTakStart || p.start);
        updateMinMax(p.computedTakCompl || p.handover);
        updateMinMax(p.computedOpening || p.opening);
        
        const pKey = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
        const projectTasks = tasksByProj.get(pKey) || [];
        projectTasks.forEach(t => {
          updateMinMax(t.start);
          updateMinMax(t.finish);
        });
      });
    }

    if (hasDates) {
      if (printRangeType !== "custom") {
         minDate = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
         maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
      }
    } else {
      minDate = new Date();
      minDate = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
      maxDate = new Date();
      maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
    }

    return { minDate, maxDate };
  }, [printFilteredData, printRangeType, printStartDate, printEndDate]);

  const printScale = useMemo(() => {
    if (printScaleMode === "default") return 100;
    if (printScaleMode === "custom") return printScaleCustom;

    const { sortedProjects, tasksByProj, expanded } = printFilteredData;
    const { minDate, maxDate } = printDates;

    let estimatedGanttWidth = 0;
    let estimatedGanttHeight = 0;

    if (printScaleMode === "fit-cols" || printScaleMode === "fit-page") {
       const savedDayWidth = safeGetItemLocal("taka_gantt_day_width");
       const currentDayWidth = savedDayWidth ? Math.round(parseFloat(savedDayWidth)) : 4;
       
       const savedSideWidth = safeGetItemLocal("taka_gantt_side_width");
       const currentSideWidth = savedSideWidth ? parseInt(savedSideWidth, 10) : 300;
       
       const savedCols = safeGetItemLocal("taka_gantt_columns");
       let visibleCols: string[] = [];
       try { visibleCols = savedCols ? JSON.parse(savedCols) : []; } catch (e) {}
       const safeColumns = visibleCols || [];
       
       const startColWidth = safeGetItemLocal("taka_gantt_start_width") ? parseInt(safeGetItemLocal("taka_gantt_start_width")!, 10) : 110;
       const finishColWidth = safeGetItemLocal("taka_gantt_finish_width") ? parseInt(safeGetItemLocal("taka_gantt_finish_width")!, 10) : 110;
       const partyColWidth = safeGetItemLocal("taka_gantt_party_width") ? parseInt(safeGetItemLocal("taka_gantt_party_width")!, 10) : 95;
       const durationColWidth = safeGetItemLocal("taka_gantt_duration_width") ? parseInt(safeGetItemLocal("taka_gantt_duration_width")!, 10) : 60;
       
       const dateColsWidth = 
         (safeColumns.includes("start") ? startColWidth : 0) +
         (safeColumns.includes("finish") ? finishColWidth : 0) +
         (safeColumns.includes("party") ? partyColWidth : 0) +
         (safeColumns.includes("duration") ? durationColWidth : 0);
         
       const leftAreaWidth = currentSideWidth + dateColsWidth;

       const totalDays = Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
       estimatedGanttWidth = leftAreaWidth + (totalDays * currentDayWidth);
    }
    
    if (printScaleMode === "fit-rows" || printScaleMode === "fit-page") {
       estimatedGanttHeight = 160; 
       sortedProjects.forEach(p => {
         const pKey = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
         let itemHeight = 44; 
         if (expanded.includes(String(p.no))) {
            const tCount = (tasksByProj.get(pKey) || []).length;
            itemHeight += (tCount * 32); 
         }
         estimatedGanttHeight += itemHeight;
       });
    }

    if (printScaleMode === "fit-cols") {
       const targetWidthPx = (printWidth - 20) * 3.78;
       const scale = Math.floor((targetWidthPx / estimatedGanttWidth) * 100);
       return Math.max(10, Math.min(scale, 100));
    }
    
    if (printScaleMode === "fit-rows") {
       const targetHeightPx = (printHeight - 20) * 3.78;
       const scale = Math.floor((targetHeightPx / estimatedGanttHeight) * 100);
       return Math.max(10, Math.min(scale, 100));
    }
    
    if (printScaleMode === "fit-page") {
       const targetWidthPx = (printWidth - 20) * 3.78;
       const scaleCols = Math.floor((targetWidthPx / estimatedGanttWidth) * 100);
       
       const targetHeightPx = (printHeight - 20) * 3.78;
       const scaleRows = Math.floor((targetHeightPx / estimatedGanttHeight) * 100);
       
       return Math.max(10, Math.min(scaleCols, scaleRows, 100));
    }

    return 100;
  }, [printScaleMode, printScaleCustom, printWidth, printHeight, printFilteredData, printDates]);

  const ganttPrintPages = useMemo(() => {
    if (!isPrintPreview || activeTab !== "gantt") return null;
    return [{ dateRange: undefined as any }];
  }, [isPrintPreview, activeTab, printFilteredData, printDates]);

  
  
  const handleExportToExcel = async () => {
    if (isExportingPDF || activeTab === 'gantt') return;
    setIsExportingPDF(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    try {
      await exportToExcel({
        activeTab,
        sortedProjects: printFilteredData.sortedProjects,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handlePrintToPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    try {
      await exportToPdf({
        activeTab,
        printOrientation,
        printPaperSize,
        printDpi,
        printScaleMode,
        printScale,
        printWidth,
        printHeight,
        printFilterHeader,
        printFilterContext,
        printDate,
        printWatermark,
      });
    } catch (err) {
      console.error("Export to PDF failed:", err);
      useAppStore.getState().setToast({ title: "Thông báo", message: String("Xuất PDF thất bại. Vui lòng thử lại.") });
    } finally {
      setIsExportingPDF(false);
    }
  };


  return (
    <div className={`min-h-[100dvh] p-2 lg:p-4 flex flex-col bg-slate-50 dark:bg-[#131314] text-slate-800 dark:text-[#f3f3f3] font-sans pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] print:p-0 transition-colors ${isPrintPreview ? 'print-preview-container' : ''}`}>
      <style>{`
        /* Global print overrides for better visibility */
        @media print, screen {
          html:not(.dark) .print-preview-content-active {
             /* Darker text */
             --tw-text-opacity: 1;
          }
          html:not(.dark) .print-preview-content-active .border-slate-200,
          html:not(.dark) .print-preview-content-active .border-b,
          html:not(.dark) .print-preview-content-active .border-r {
             border-color: #475569 !important; /* slate-600 */
          }
          html:not(.dark) .print-preview-content-active .text-slate-500,
          html:not(.dark) .print-preview-content-active .text-slate-600 {
             color: #1e293b !important; /* slate-800 */
             font-weight: 700 !important;
          }
          html:not(.dark) .print-preview-content-active .text-slate-700,
          html:not(.dark) .print-preview-content-active .text-slate-800,
          html:not(.dark) .print-preview-content-active .text-slate-900 {
             color: #000000 !important; /* black */
             font-weight: 800 !important;
          }
          html:not(.dark) .print-preview-content-active .bg-slate-100 {
             background-color: #e2e8f0 !important; /* slate-200 for better contrast */
          }
          html:not(.dark) .print-preview-content-active table,
          html:not(.dark) .print-preview-content-active th,
          html:not(.dark) .print-preview-content-active td {
             border-color: #334155 !important; /* slate-700 */
          }
        }
        @media print {
          @page {
            size: ${printPaperSize} ${printOrientation};
            margin: ${activeTab === 'layout' ? '5mm !important' : '10mm !important'};
          }
          .print-content-wrapper {
            transform: ${activeTab === 'layout' ? 'none' : `scale(${printScale / 100})`};
            transform-origin: top left;
            width: ${activeTab === 'layout' ? '100% !important' : `${100 / (printScale / 100)}% !important`};
            height: ${activeTab === 'layout' ? '100% !important' : `${100 / (printScale / 100)}% !important`};
          }
          #live-layout-canvas-container {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          #live-layout-canvas-container canvas {
            max-width: 100% !important;
            max-height: 95vh !important;
            object-fit: contain !important;
          }
          .hide-on-actual-print, .print\:hidden {
            display: none !important;
          }
        }
        ${isPrintPreview ? `
          @media screen {
            body.print-preview-active {
              background-color: #94a3b8 !important;
            }
            .print-preview-container {
              padding-top: ${activeTab === 'layout' ? '50px !important' : '100px !important'};
              padding-bottom: ${activeTab === 'layout' ? '20px !important' : '60px !important'};
              background-color: transparent !important;
              overflow: auto !important;
            }
            .print-paper {
              width: ${activeTab === 'layout' ? '100% !important' : 'max-content !important'};
              height: ${activeTab === 'layout' ? '100% !important' : 'max-content !important'};
              min-width: ${activeTab === 'layout' ? '100%' : `${printWidth}mm`};
              min-height: ${activeTab === 'layout' ? '85vh' : `${printHeight}mm`};
              background-color: white !important;
              margin: 0 auto;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
              padding: ${activeTab === 'layout' ? '0 !important' : '10mm !important'};
              position: relative;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            .print-preview-content-active {
              transform: ${activeTab === 'layout' ? 'none' : `scale(${printScale / 100})`};
              transform-origin: top left;
              width: ${activeTab === 'layout' ? '100% !important' : 'max-content !important'};
              height: ${activeTab === 'layout' ? '100% !important' : 'max-content !important'};
              background-color: transparent !important;
              border: none !important;
              box-shadow: none !important;
              border-radius: 0 !important;
              padding: 0 !important;
              flex-grow: 1 !important;
            }
          }
        ` : ""}
      `}</style>
      
      {isPrintPreview && (
        <PrintOptionsPanel
          activeTab={activeTab}
          onClose={() => setIsPrintPreview(false)}
          onExportToExcel={handleExportToExcel}
          onPrintToPDF={handlePrintToPDF}
        />
      )}

      {ganttPrintPages ? (
        <div className="flex flex-col gap-8 w-full items-center bg-slate-300 dark:bg-slate-800 p-8 print:p-0 print:bg-transparent">
          {ganttPrintPages.map((pageData, idx) => (
            <div key={idx} className="print-paper relative flex flex-col shrink-0" style={{ pageBreakAfter: idx < ganttPrintPages.length - 1 ? 'always' : 'auto' }}>
              {printWatermark !== "none" && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[150] overflow-hidden" style={{ opacity: 0.15 }}>
                  <span 
                    className="font-black text-slate-500 uppercase tracking-widest text-center"
                    style={{ 
                      fontSize: printOrientation === 'landscape' ? '12vw' : '15vw',
                      transform: 'rotate(-45deg)'
                    }}
                  >
                    {printWatermark}
                  </span>
                </div>
              )}
              {printDate && (
                <div className="absolute bottom-4 left-4 text-xs font-mono text-slate-500 z-[90]">
                  Printed on: {new Date().toLocaleString()} - Page {idx + 1}
                </div>
              )}
              {printFilterHeader && (
                <div className="w-full px-4 pt-3 pb-1 bg-white dark:bg-[#1e1e20] shrink-0">
                  <PrintFilterHeader
                    context={printFilterContext}
                    pageIndex={idx}
                    totalPages={ganttPrintPages.length}
                  />
                </div>
              )}
              <div className="w-full flex-grow flex flex-col bg-white dark:bg-[#1e1e20] p-0 print-content-wrapper print-preview-content-active relative overflow-hidden">
                                  {isPrintPreview && (
                    <Suspense fallback={null}>
                      <PrintPreviewOverlay
                        printScale={printScale}
                        printPaperSize={printPaperSize}
                        printOrientation={printOrientation}
                        printScaleMode={printScaleMode}
                      />
                    </Suspense>
                  )}
                 <Profiler id={`GanttTab-Page-${idx}`} onRender={onRenderCallback}>
                   <GanttTab
                     
                     printDateRangeOverride={pageData.dateRange}
                     
                     
                     
                     
                     
                     initialFocusTaskId={ganttTabFocusTaskId}
                     onClearFocus={() => setGanttTabFocusTaskId("")}
                     onNavigateToLayout={handleNavigateToLayout}
                     onNavigateToTaskDetail={handleNavigateToTaskDetail}
                   />
                 </Profiler>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={isPrintPreview ? "print-paper relative flex-grow flex flex-col w-full" : "w-full flex-grow flex flex-col"}>
          {isPrintPreview && printWatermark !== "none" && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[150] overflow-hidden" style={{ opacity: 0.15 }}>
              <span 
                className="font-black text-slate-500 uppercase tracking-widest text-center"
                style={{ 
                  fontSize: printOrientation === 'landscape' ? '12vw' : '15vw',
                  transform: 'rotate(-45deg)'
                }}
              >
                {printWatermark}
              </span>
            </div>
          )}
          {printDate && isPrintPreview && (
            <div className="absolute bottom-4 left-4 text-xs font-mono text-slate-500 dark:text-slate-400 z-[90]">
              Printed on: {new Date().toLocaleString()}
            </div>
          )}
          {printFilterHeader && isPrintPreview && activeTab !== 'layout' && (
            <div className="w-full px-4 pt-3 pb-1 bg-white dark:bg-[#1e1e20] shrink-0">
              <PrintFilterHeader context={printFilterContext} />
            </div>
          )}

          <div className={`w-full flex-grow flex flex-col bg-white dark:bg-[#1e1e20] ${
            activeTab === 'layout' 
              ? 'p-0 pb-0 border-none shadow-none rounded-none' 
              : activeTab === 'picture_mapping' 
              ? 'p-1.5 sm:p-2.5 pb-2 sm:pb-2.5 rounded-xl shadow-sm border border-slate-200 dark:border-[#333336]' 
              : 'p-4 lg:p-6 pb-20 lg:pb-6 rounded-xl shadow-sm border border-slate-200 dark:border-[#333336]'
          } transition-colors print:p-0 print:m-0 print:border-none print:shadow-none print:rounded-none print-content-wrapper ${isPrintPreview ? 'print-preview-content-active' : ''}`}>
          {/* Floating Ribbon Display Options button in Full-screen mode */}
          {ribbonDisplayMode === 'fullscreen' && (
            <div className="fixed top-3 right-4 z-[9999] print:hidden">
              <RibbonDisplayMenu variant="floating" />
            </div>
          )}

          {/* Header - Only visible when ribbonDisplayMode is 'always_show' */}
          {ribbonDisplayMode === 'always_show' && (
            <div className="print:hidden relative z-[200]">
              <Header
                cloudStatus={cloudStatus}
                onLoginClick={() => setIsLoginModalOpen(true)}
                onLogoutClick={handleLogout}
                onPrintClick={handlePrintClick}
                onTabChange={handleTabChange}
                activeTab={activeTab}
                notificationCount={unreadCount}
                onUndo={handleDataUndo}
                canUndo={undoStack.length > 0 || tabHistory.length > 0}
                hasDataToUndo={undoStack.length > 0}
                undoDescription={
                  undoStack.length > 0
                    ? `Undo: ${undoStack[undoStack.length - 1].description}`
                    : tabHistory.length > 0
                      ? `Go back to previous page`
                      : undefined
                }
                onToggleTheme={toggleTheme}
                isFocusMode={isFocusMode}
                onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
                isPrintPreview={isPrintPreview}
                onPrintPreviewToggle={() => setIsPrintPreview(!isPrintPreview)}
                onDeepLink={handleDeepLinkString}
                onQuickNavigate={handleQuickNavigate}
              />
            </div>
          )}

        {/* Navigation - Visible in 'always_show' and 'tabs_only' modes */}
        {canSee && !isFocusMode && ribbonDisplayMode !== 'fullscreen' && (
          <div className="print:hidden relative z-[150]">
            <Navigation
              activeTab={activeTab}
              onTabChange={(tab) => {
                if (tab === "cost") {
                                  }
                if (tab === "budget") {
                  setBudgetTabSearchTerm("");
                }
                if (tab === "detail") {
                  setDetailTabFilterCode("");
                  setDetailTabStoreFilter("");
                }
                handleTabChange(tab);
              }}
              
              
            />
          </div>
        )}

        {!canSee ? (
          <div className="flex-grow flex flex-col items-center justify-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-xl m-4 print:hidden">
            <div className="w-16 h-16 text-slate-300 mb-4">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                ></path>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-700">
              Access Restricted
            </h3>
            <p className="text-slate-500 text-sm max-w-xs text-center mt-2">
              Please log in with a valid account to view and manage project
              data.
            </p>
            <button
              title="Button"
              onClick={() => setIsLoginModalOpen(true)}
              className="mt-6 px-8 py-2.5 bg-slate-900 text-white rounded-xl font-bold shadow-lg transition-transform active:scale-95"
            >
              Login Now
            </button>
          </div>
        ) : (
          <div className="flex-grow flex flex-col min-h-0 relative z-[10]">
            <TabErrorBoundary tabKey={activeTab}>
              <Suspense fallback={<div className="flex-1 w-full h-full p-4 md:p-6 lg:p-8 animate-pulse bg-slate-50 dark:bg-[#0e0e11]">  <div className="max-w-7xl mx-auto w-full space-y-6">    <div className="flex items-center justify-between">      <div className="h-8 w-48 bg-slate-200 dark:bg-[#18181a] rounded-lg"></div>      <div className="h-8 w-24 bg-slate-200 dark:bg-[#18181a] rounded-lg"></div>    </div>    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">      {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-200 dark:bg-[#18181a] rounded-xl"></div>)}    </div>    <div className="h-[400px] w-full bg-slate-200 dark:bg-[#18181a] rounded-xl"></div>  </div></div>}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col flex-grow min-h-0"
                >
            {activeTab === "layout" &&
              (currentUser.role === "admin" ||
                permissionMatrix[userRole]?.See?.layout) && (
                <LayoutTab
                  
                  
                  
                  
                  initialStore={layoutTabFilters?.store}
                  initialLocation={layoutTabFilters?.location}
                  initialProjectCode={layoutTabFilters?.projectCode}
                  onClearFocus={() => setLayoutTabFilters(null)}
                  onBackToGantt={() => {
                    if (layoutTabFilters?.sourceTaskId) {
                      setGanttTabFocusTaskId(layoutTabFilters.sourceTaskId);
                    } else {
                      setGanttTabFocusTaskId("");
                    }
                    handleTabChange("gantt");
                  }}
                />
              )}
            {activeTab === "summary" &&
              (currentUser.role === "admin" ||
                permissionMatrix[userRole]?.See?.summary ||
                permissionMatrix[userRole]?.See?.report) && (
                <SummaryTab
                  
                  
                  
                  
                  
                  
                />
              )}
            {activeTab === "general" &&
              (currentUser.role === "admin" ||
                permissionMatrix[userRole]?.See
                  ?.general) && (
                <GeneralTab
                  
                  
                  
                  
                  
                  
                  onProjectClick={(p) => {
                    setQuickNavTarget({ project: p });
                  }}
                />
              )}
            {activeTab === "detail" &&
              (currentUser.role === "admin" ||
                permissionMatrix[userRole]?.See?.detail) && (
                <Profiler id="DetailTab" onRender={onRenderCallback}>
                  <DetailTab
                    
                    
                    
                    
                    
                    
                    
                    initialFilterCode={detailTabFilterCode}
                    initialStoreFilter={globalStoreFilter}
                    initialFocusTaskId={detailTabFocusTaskId}
                    returnScrollId={detailReturnScrollId}
                    onClearFocus={() => {
                      setDetailReturnScrollId(detailTabFocusTaskId);
                      setDetailTabFocusTaskId("");
                    }}
                    onBackToGantt={() => {
                      setDetailReturnScrollId(detailTabFocusTaskId);
                      setDetailTabFocusTaskId("");
                      setDetailTabFilterCode("");
                      handleTabChange("gantt");
                    }}
                    onAddProject={() => {
                      setEditingProject(null);
                      setIsReadOnlyModal(false);
                      setModalInitialTab("details");
                      setIsProjectModalOpen(true);
                    }}
                    onAddTask={(p) => {
                      if (!isAppReadyRef.current) return;
                      const safeP = p || (projects && projects.length > 0 ? projects[0] : null);
                      setPrefillProjectCode(safeP?.code || "");
                      setPrefillProjectYear(safeP?.year || null);
                      setPrefillProjectStore(safeP?.store || null);
                      setEditingTask(null);
                      setIsReadOnlyModal(false);
                      setModalInitialTab("details");
                      setIsTaskModalOpen(true);
                    }}
                    onEditProject={(p, isReadOnly, initialTab) => {
                      setEditingProject(p);
                      setIsReadOnlyModal(isReadOnly || false);
                      setModalInitialTab((initialTab as "details" | "chat") || "details");
                      setIsProjectModalOpen(true);
                    }}
                    onEditTask={(t, isReadOnly, initialTab) => {
                      setEditingTask(t);
                      setIsReadOnlyModal(isReadOnly || false);
                      setModalInitialTab((initialTab as "details" | "chat") || "details");
                      setIsTaskModalOpen(true);
                    }}
                    onNavigateToDelegation={(groupId, sourceTaskId) => {
                      if (sourceTaskId) setDetailReturnScrollId(sourceTaskId);
                      handleTabChange("taskDelegation");
                      setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("taka_open_delegation_group", {
                            detail: { groupId },
                          }),
                        );
                      }, 400);
                    }}
                  />
                </Profiler>
              )}
            {activeTab === "calendar" &&
              (currentUser.role === "admin" ||
                permissionMatrix[userRole]?.See?.calendar ||
                permissionMatrix[userRole]?.See?.report) && (
                <CalendarTab
                  
                  
                  
                  
                  
                  onEditTask={(t, isReadOnly) => {
                    setEditingTask(t);
                    setIsReadOnlyModal(isReadOnly || false);
                    setModalInitialTab("details");
                    setIsTaskModalOpen(true);
                  }}
                  onEditProject={(p, isReadOnly) => {
                    setEditingProject(p);
                    setIsReadOnlyModal(isReadOnly || false);
                    setModalInitialTab("details");
                    setIsProjectModalOpen(true);
                  }}
                />
              )}
            {activeTab === "gantt" &&
              (currentUser.role === "admin" ||
                permissionMatrix[userRole]?.See?.report) && (
                <Profiler id="GanttTab" onRender={onRenderCallback}>
                  <div className="flex flex-col flex-grow min-h-0">
                    <GanttTab
                      
                      
                      
                      
                      
                      
                      initialFocusTaskId={ganttTabFocusTaskId}
                      onClearFocus={() => setGanttTabFocusTaskId("")}
                      onNavigateToLayout={handleNavigateToLayout}
                      onNavigateToTaskDetail={handleNavigateToTaskDetail}
                    />
                  </div>
                </Profiler>
              )}
            {activeTab === "budget" &&
              (currentUser.role === "admin" ||
                permissionMatrix[userRole]?.See?.budget) && (
                <BudgetTab
                  
                  
                  
                  
                  initialSearchTerm={budgetTabSearchTerm}
                  onGoToCost={(code) => {
                    setCostTabSearchTerm(code ? String(code).replace(/["']/g, '').trim() : "");
                    handleTabChange("cost");
                  }}
                />
              )}
            {activeTab === "taskDelegation" &&
              (currentUser.role === "admin" ||
                permissionMatrix[userRole]?.See
                  ?.taskDelegation) && (
                <TaskDelegationTab
                  
                  
                  
                  
                  
                  
                  onBackFromFocus={() => {
                    if (tabHistory.length > 0) {
                      const prev = tabHistory[tabHistory.length - 1];
                      setTabHistory((h) => h.slice(0, -1));
                      setActiveTab(prev);
                    } else {
                      setActiveTab("detail");
                    }
                  }}
                />
              )}
            {activeTab === "taskDelegationCalendar" &&
              (currentUser.role === "admin" ||
                permissionMatrix[userRole]?.See
                  ?.taskDelegation) && (
                <DelegationCalendarTab
                  groups={visibleDelegationGroups}
                  
                  
                  
                  
                  onTabChange={handleTabChange}
                />
              )}
            {activeTab === "cost" &&
              (currentUser.role === "admin" ||
                permissionMatrix[userRole]?.See
                  ?.costDetail) && (
                <CostTab
                  initialSearchTerm={costTabSearchTerm}
                  onGoToBudget={(code) => {
                    setBudgetTabSearchTerm(code);
                    handleTabChange("budget");
                  }}
                />
              )}
            {activeTab === "accControl" && (
              <AccControlTab
                users={appUsers}
                
                
                
                locationVisibility={locationVisibility}
                
                
                onEditUser={(u) => {
                  setEditingUser(u);
                  setIsUserModalOpen(true);
                }}
                onAddUser={() => {
                  setEditingUser(null);
                  setIsUserModalOpen(true);
                }}
              />
            )}
            {activeTab === "notification" &&
              (currentUser.role === "admin" ||
                currentUser.notification !== false) && (
                <NotificationTab
                  activeNotifications={activeNotifications}
                  readNotifs={readNotifs}
                  filterId={notificationFilterId}
                  initialStatusFilter={unreadCount > 0 ? "unread" : "all"}
                  onClearFilter={() => setNotificationFilterId(null)}
                  onRequestPermission={handleRequestPermission}
                  onTogglePushEnabled={notifActions.onTogglePushEnabled}
                  onToggleRead={notifActions.onToggleRead}
                  onMarkAllRead={() => notifActions.onMarkAllRead(activeNotifications)}
                  onActionAgree={notifActions.onActionAgree}
                  onActionReject={notifActions.onActionReject}
                  onNotificationClick={(notif) => {
                    notifActions.onNotificationClick(notif);
                    
                    // Navigate logic
                    if (notif.targetId && notif.targetType) {
                      if (notif.targetType === "notification") {
                        setNotificationFilterId(notif.targetId);
                        handleTabChange("notification");
                        return;
                      }

                      // Check if user has permission to see layout tab
                      const canSeeLayout = currentUser.role === "admin" || !!permissionMatrix[userRole]?.See?.layout;
                      const combinedProjects = (projects && projects.length > 0) ? projects : (useAppStore.getState().allProjectsForNotifs || []);
                      const combinedTasks = (tasks && tasks.length > 0) ? tasks : (useAppStore.getState().allTasksForNotifs || []);
                      const layoutMatch = canSeeLayout ? findProjectLayoutUnit(notif, combinedProjects, combinedTasks) : null;

                      if (canSeeLayout && layoutMatch) {
                        // 1. Synchronize global Year & Store filters if needed
                        const targetYear = layoutMatch.year || (layoutMatch.project?.year ? String(layoutMatch.project.year) : (notif.projectYear ? String(notif.projectYear) : ''));
                        if (targetYear && targetYear !== globalYearFilter && targetYear !== 'all') {
                          setGlobalYearFilter(targetYear);
                        }
                        const targetStore = layoutMatch.store || notif.projectStore || 'HCM';
                        if (targetStore && targetStore !== 'all') {
                          setGlobalStoreFilter(targetStore);
                        }
                        const targetLocation = layoutMatch.location || 'L1';
                        if (targetLocation && targetLocation !== 'ALL') {
                          useAppStore.getState().setGlobalLocationFilter([targetLocation]);
                        }

                        const targetUnitCode = layoutMatch.unitCode || layoutMatch.project?.code || notif.projectCode || (notif.title && notif.title.includes(' - ') ? notif.title.split(' - ')[0].trim() : '');

                        // 2. Set layoutTabFilters to zoom, pan, focus, and open the unit tooltip on Liveview
                        setLayoutTabFilters({
                          store: targetStore,
                          location: targetLocation,
                          projectCode: targetUnitCode,
                          sourceTaskId: layoutMatch.task?.id,
                        });

                        // 3. Switch to layout liveview tab
                        handleTabChange("layout");

                        // 4. If notification is for comments, open comments modal (closing keeps user on liveview)
                        if (layoutMatch.isComment) {
                          if (layoutMatch.isTaskComment && layoutMatch.task) {
                            setEditingTask(layoutMatch.task);
                            setIsReadOnlyModal(false);
                            setModalInitialTab("chat");
                            setIsTaskModalOpen(true);
                          } else if (layoutMatch.project) {
                            setEditingProject(layoutMatch.project);
                            setIsReadOnlyModal(false);
                            setModalInitialTab("chat");
                            setIsProjectModalOpen(true);
                          }
                        }
                        return;
                      }

                      // 5. If project has no unit in layout tab (or delegation without layout unit):
                      // Link to Task Detail tab and open project modal with comment tab
                      if (notif.targetType === "task_delegation") {
                        handleTabChange("detail");
                        const targetProject =
                          layoutMatch?.project ||
                          combinedProjects.find(
                            (p) =>
                              (notif.projectCode && p.code?.toLowerCase() === notif.projectCode.toLowerCase()) ||
                              String(p.id) === String(notif.targetId) ||
                              String(p.no) === String(notif.targetId)
                          );

                        if (targetProject) {
                          setEditingProject(targetProject);
                          setIsReadOnlyModal(false);
                          setModalInitialTab("chat");
                          setIsProjectModalOpen(true);
                        } else if (layoutMatch?.task) {
                          setEditingTask(layoutMatch.task);
                          setIsReadOnlyModal(false);
                          setModalInitialTab("chat");
                          setIsTaskModalOpen(true);
                        } else {
                          executeDeepLinkRef.current?.(
                            notif.targetType,
                            notif.targetId,
                            {
                              store: notif.projectStore,
                              year: String(notif.projectYear),
                              code: notif.projectCode,
                            }
                          );
                        }
                        return;
                      }

                      // 6. Default deep link flow for other types
                      executeDeepLinkRef.current?.(
                        notif.targetType,
                        notif.targetId,
                        {
                          store: notif.projectStore,
                          year: String(notif.projectYear),
                          code: notif.projectCode,
                        }
                      );
                    }
                  }}
                />
              )}
            {activeTab === "setting" && (
              <SettingTab rules={notificationRules} />
            )}
            {activeTab === "manual" && (
              <ManualTab />
            )}
            {activeTab === "audit" && (currentUser.role === "admin" || (permissionMatrix[userRole]?.See as any)?.audit) && (
              <AuditLogTab />
            )}
            {activeTab === "csv_export" && (currentUser.role === "admin" || !!permissionMatrix[userRole]?.See?.importCsv || !!permissionMatrix[userRole]?.Write?.importCsv) && (
              <CsvExportTab />
            )}
            {activeTab === "picture_mapping" && (currentUser.role === "admin" || !!permissionMatrix[userRole]?.See?.pictureMapping || !!permissionMatrix[userRole]?.Write?.pictureMapping) && (
              <PictureMappingTab />
            )}
            </motion.div>
            </AnimatePresence>
            </Suspense>
            </TabErrorBoundary>
          </div>
        )}
      </div>
      </div>
      )}

      <AppModals
        onLogin={handleLogin}
        onTabChange={handleTabChange}
      />

      {quickNavTarget && (
        <ProjectQuickNavModal
          target={quickNavTarget}
          isOpen={!!quickNavTarget}
          onClose={() => setQuickNavTarget(null)}
          onNavigate={handleQuickNavigate}
        />
      )}

      {isCommandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPaletteModal
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
            onTabChange={handleTabChange}
            onToggleTheme={toggleTheme}
            onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
            onPrintPreviewToggle={() => setIsPrintPreview(!isPrintPreview)}
          />
        </Suspense>
      )}

      {toast && (
        <Toast
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      <div className="fixed bottom-1 right-3 text-[10px] text-slate-400 z-50 pointer-events-none">
        copyright by Nam Hung CP
      </div>
          {showTour && (
            <Suspense fallback={null}>
              <AppTour onClose={handleCloseTour} />
            </Suspense>
          )}
      {isExportingPDF && (
        <div className="fixed inset-0 z-[99999] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white print:hidden hide-on-actual-print">
          <svg className="w-12 h-12 animate-spin text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <h2 className="text-xl font-bold tracking-tight">Generating High Quality Document...</h2>
          <p className="text-slate-300 mt-2 text-sm text-center max-w-sm">Please wait while we render your chart. This may take a moment depending on the project size.</p>
        </div>
      )}
    </div>
  );
}
