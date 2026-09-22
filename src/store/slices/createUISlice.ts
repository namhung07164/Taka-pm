import { StateCreator } from "zustand";
import { safeGetItemLocal, safeSetItemLocal } from "../../lib/storage";
import { TabId } from "../../types";
import { AppState, UISlice } from "../storeTypes";

const getInitialActiveTab = (): TabId => {
  // Safe Boot (#2): Always start on 'general' tab to prevent heavy query read storms
  // from Gantt/Detail tabs on initial cold start.
  return "general";
};

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set) => ({
  isFocusMode: false,
  setIsFocusMode: (val) => set({ isFocusMode: val }),
  ribbonDisplayMode: (safeGetItemLocal("taka_ribbon_display_mode") as "always_show" | "tabs_only" | "fullscreen") || "always_show",
  setRibbonDisplayMode: (mode) => {
    safeSetItemLocal("taka_ribbon_display_mode", mode);
    set({ ribbonDisplayMode: mode });
  },
  showQuickAccessToolbar: safeGetItemLocal("taka_show_quick_access_toolbar") !== "false",
  setShowQuickAccessToolbar: (show) => {
    safeSetItemLocal("taka_show_quick_access_toolbar", String(show));
    set({ showQuickAccessToolbar: show });
  },
  isPrintPreview: false,
  setIsPrintPreview: (val) => set({ isPrintPreview: val }),
  printOrientation: "landscape",
  setPrintOrientation: (val) => set({ printOrientation: val }),
  
  printPaperSize: (safeGetItemLocal("taka_print_paper_size") as "A2" | "A3" | "A4") || "A4",
  setPrintPaperSize: (val) => {
    safeSetItemLocal("taka_print_paper_size", val);
    set({ printPaperSize: val });
  },
  
  printDate: safeGetItemLocal("taka_print_date") === "true",
  setPrintDate: (val) => {
    safeSetItemLocal("taka_print_date", String(val));
    set({ printDate: val });
  },

  expandedProjectIds: (() => {
    try {
      const saved = safeGetItemLocal("taka_expanded_projects");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  })(),
  toggleProjectExpansion: (projectId) => set((state) => {
    const next = state.expandedProjectIds.includes(projectId)
      ? state.expandedProjectIds.filter(id => id !== projectId)
      : [...state.expandedProjectIds, projectId];
    safeSetItemLocal("taka_expanded_projects", JSON.stringify(next));
    return { expandedProjectIds: next };
  }),
  setExpandedProjectIds: (ids) => {
    safeSetItemLocal("taka_expanded_projects", JSON.stringify(ids));
    set({ expandedProjectIds: ids });
  },

  visibleActiveProjectIds: [],
  setVisibleActiveProjectIds: (ids) => {
    set((state) => {
      if (
        state.visibleActiveProjectIds.length === ids.length &&
        state.visibleActiveProjectIds.every((id, idx) => id === ids[idx])
      ) {
        return state;
      }
      return { visibleActiveProjectIds: ids };
    });
  },

  searchActiveProjectIds: [],
  setSearchActiveProjectIds: (ids) => {
    set((state) => {
      if (
        state.searchActiveProjectIds.length === ids.length &&
        state.searchActiveProjectIds.every((id, idx) => id === ids[idx])
      ) {
        return state;
      }
      return { searchActiveProjectIds: ids };
    });
  },

  printFilterHeader: safeGetItemLocal("taka_print_filter_header") !== "false",
  setPrintFilterHeader: (val) => {
    safeSetItemLocal("taka_print_filter_header", String(val));
    set({ printFilterHeader: val });
  },
  
  printScaleMode: (safeGetItemLocal("taka_print_scale_mode") as any) || "default",
  setPrintScaleMode: (val) => {
    safeSetItemLocal("taka_print_scale_mode", val);
    set({ printScaleMode: val });
  },
  
  printScaleCustom: safeGetItemLocal("taka_print_scale_custom") ? parseInt(safeGetItemLocal("taka_print_scale_custom")!, 10) : 100,
  setPrintScaleCustom: (val) => {
    safeSetItemLocal("taka_print_scale_custom", String(val));
    set({ printScaleCustom: val });
  },
  
  printDpi: safeGetItemLocal("taka_print_dpi") ? parseInt(safeGetItemLocal("taka_print_dpi")!, 10) : 300,
  setPrintDpi: (val) => {
    safeSetItemLocal("taka_print_dpi", String(val));
    set({ printDpi: val });
  },
  
  printWatermark: (safeGetItemLocal("taka_print_watermark") as any) || "none",
  setPrintWatermark: (val) => {
    safeSetItemLocal("taka_print_watermark", val);
    set({ printWatermark: val });
  },
  
  printTarget: "pdf",
  setPrintTarget: (val) => set({ printTarget: val }),
  
  showTour: false,
  setShowTour: (val) => set({ showTour: val }),
  
  isExportingPDF: false,
  setIsExportingPDF: (val) => set({ isExportingPDF: val }),

  activeTab: getInitialActiveTab(),
  setActiveTab: (activeTab) => set({ activeTab }),
  tabHistory: [],
  setTabHistory: (updater) => set((state) => ({ 
    tabHistory: typeof updater === 'function' ? updater(state.tabHistory) : updater 
  })),

  theme: "light",
  setTheme: (theme) => set({ theme }),

  printRangeType: "entire",
  setPrintRangeType: (printRangeType) => set({ printRangeType }),
  printStartDate: null,
  setPrintStartDate: (printStartDate) => set({ printStartDate }),
  printEndDate: null,
  setPrintEndDate: (printEndDate) => set({ printEndDate }),

  toast: null,
  setToast: (toast) => set({ toast }),

  isLoginModalOpen: false,
  setIsLoginModalOpen: (isLoginModalOpen) => set({ isLoginModalOpen }),
  isProjectModalOpen: false,
  setIsProjectModalOpen: (isProjectModalOpen) => set({ isProjectModalOpen }),
  isTaskModalOpen: false,
  setIsTaskModalOpen: (isTaskModalOpen) => set({ isTaskModalOpen }),
  isUserModalOpen: false,
  setIsUserModalOpen: (isUserModalOpen) => set({ isUserModalOpen }),
  isCalendarSyncModalOpen: false,
  setIsCalendarSyncModalOpen: (isCalendarSyncModalOpen) => set({ isCalendarSyncModalOpen }),

  quickNavTarget: null,
  setQuickNavTarget: (quickNavTarget) => set({ quickNavTarget }),

  editingProject: null,
  setEditingProject: (editingProject) => set({ editingProject }),
  editingTask: null,
  setEditingTask: (editingTask) => set({ editingTask }),
  editingUser: null,
  setEditingUser: (editingUser) => set({ editingUser }),

  modalInitialTab: "details",
  setModalInitialTab: (modalInitialTab) => set({ modalInitialTab }),
  focusCommentId: null,
  setFocusCommentId: (focusCommentId) => set({ focusCommentId }),
  isReadOnlyModal: false,
  setIsReadOnlyModal: (isReadOnlyModal) => set({ isReadOnlyModal }),

  prefillProjectCode: null,
  setPrefillProjectCode: (prefillProjectCode) => set({ prefillProjectCode }),
  prefillProjectYear: null,
  setPrefillProjectYear: (prefillProjectYear) => set({ prefillProjectYear }),
  prefillProjectStore: null,
  setPrefillProjectStore: (prefillProjectStore) => set({ prefillProjectStore }),

  costTabSearchTerm: "",
  setCostTabSearchTerm: (costTabSearchTerm) => set({ costTabSearchTerm }),
  budgetTabSearchTerm: "",
  setBudgetTabSearchTerm: (budgetTabSearchTerm) => set({ budgetTabSearchTerm }),
  detailTabFilterCode: "",
  setDetailTabFilterCode: (detailTabFilterCode) => set({ detailTabFilterCode }),
  globalStoreFilter: (() => {
    const direct = safeGetItemLocal("taka_store_filter") || safeGetItemLocal("taka_store_filter_guest");
    if (direct && String(direct).toLowerCase() !== 'all') return direct;
    
    let isOnlyHN = false;
    try {
      const savedAuth = safeGetItemLocal("taka_auth_v1");
      if (savedAuth) {
        const u = JSON.parse(savedAuth);
        const isAdmin = u.role === 'admin';
        const hasHCM = !!u?.storePermissions?.hcm;
        const hasHN = !!u?.storePermissions?.hn;
        isOnlyHN = !isAdmin && !hasHCM && hasHN;
        
        if (u?.preferences?.defaultStore && String(u.preferences.defaultStore).toLowerCase() !== 'all') {
            return u.preferences.defaultStore;
        }
      }
    } catch {}
    
    return isOnlyHN ? "HN" : "HCM";
  })(),
  setGlobalStoreFilter: (filter) => {
    safeSetItemLocal("taka_store_filter", filter);
    set({ globalStoreFilter: filter });
  },
  globalYearFilter: (() => {
    const direct = safeGetItemLocal("taka_year_filter");
    if (direct && String(direct).toLowerCase() !== 'all') return direct;
    
    let isOnlyHN = false;
    try {
      const savedAuth = safeGetItemLocal("taka_auth_v1");
      if (savedAuth) {
        const u = JSON.parse(savedAuth);
        const isAdmin = u.role === 'admin';
        const hasHCM = !!u?.storePermissions?.hcm;
        const hasHN = !!u?.storePermissions?.hn;
        isOnlyHN = !isAdmin && !hasHCM && hasHN;

        if (u?.preferences?.defaultYear && String(u.preferences.defaultYear).toLowerCase() !== 'all') {
           return String(u.preferences.defaultYear);
        }
      }
    } catch {}
    
    return isOnlyHN ? "2027" : new Date().getFullYear().toString();
  })(),
  setGlobalYearFilter: (globalYearFilter) => {
    safeSetItemLocal("taka_year_filter", globalYearFilter);
    set({ globalYearFilter });
  },
  globalLocationFilter: (() => {
    try {
      const LAST_ACT_KEY = "taka_last_activity_time";
      const FIFTEEN_MINS_MS = 15 * 60 * 1000;
      const lastAct = safeGetItemLocal(LAST_ACT_KEY);
      const now = Date.now();

      // If first launch or inactivity > 15 minutes: default to [] ("All Locations")
      if (!lastAct || (now - Number(lastAct) > FIFTEEN_MINS_MS)) {
        safeSetItemLocal(LAST_ACT_KEY, String(now));
        safeSetItemLocal("taka_location_filter", JSON.stringify([]));
        return [];
      }

      const stored = safeGetItemLocal("taka_location_filter");
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        if (typeof parsed === 'string' && parsed !== 'all') return [parsed];
        return [];
      }
      return parsed.filter((l: string) => l !== 'all');
    } catch {
      return [];
    }
  })(),
  setGlobalLocationFilter: (globalLocationFilter) => {
    try {
      safeSetItemLocal("taka_last_activity_time", String(Date.now()));
    } catch {}
    const cleaned = Array.isArray(globalLocationFilter) ? globalLocationFilter.filter(l => l !== 'all') : [];
    safeSetItemLocal("taka_location_filter", JSON.stringify(cleaned));
    set({ globalLocationFilter: cleaned });
  },
  pinnedProjects: (() => {
    try {
      const stored = safeGetItemLocal("taka_pinned_projects");
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  })(),
  setPinnedProjects: (pinned) => {
    safeSetItemLocal("taka_pinned_projects", JSON.stringify(pinned));
    set({ pinnedProjects: pinned });
  },
  setDetailTabStoreFilter: (globalStoreFilter) => set({ globalStoreFilter }),
  detailTabFocusTaskId: "",
  setDetailTabFocusTaskId: (detailTabFocusTaskId) => set({ detailTabFocusTaskId }),
  detailReturnScrollId: "",
  setDetailReturnScrollId: (detailReturnScrollId) => set({ detailReturnScrollId }),
  ganttTabFocusTaskId: "",
  setGanttTabFocusTaskId: (ganttTabFocusTaskId) => set({ ganttTabFocusTaskId }),
  ganttTriggerToday: 0,
  triggerGanttToday: () => set({ ganttTriggerToday: Date.now() }),
  layoutTabFilters: null,
  setLayoutTabFilters: (layoutTabFilters) => set({ layoutTabFilters }),
  notificationFilterId: null,
  setNotificationFilterId: (notificationFilterId) => set({ notificationFilterId }),

  layoutTooltipVisibility: (() => {
    const defaultVal = {
      projectCode: true,
      projectName: true,
      mdStatus: true,
      actStatus: true,
      legendColor: true,
      floor: true,
      startDate: true,
      endDate: true,
      detail: true,
      description: true,
      progressBars: true,
      area: true,
      notifications: true,
      alertOverdue: true,
      alertDelay: true,
      alertHandover: true,
      alertOpening: true,
    };
    try {
      const stored = safeGetItemLocal("taka_layout_tooltip_visibility");
      if (stored) {
        return { ...defaultVal, ...JSON.parse(stored) };
      }
    } catch {}
    return defaultVal;
  })(),
  setLayoutTooltipVisibility: (updater) => set((state) => {
    const next = typeof updater === 'function' ? updater(state.layoutTooltipVisibility) : { ...state.layoutTooltipVisibility, ...updater };
    safeSetItemLocal("taka_layout_tooltip_visibility", JSON.stringify(next));
    return { layoutTooltipVisibility: next };
  }),
  resetLayoutTooltipVisibility: () => set(() => {
    const defaultVal = {
      projectCode: true,
      projectName: true,
      mdStatus: true,
      actStatus: true,
      legendColor: true,
      floor: true,
      startDate: true,
      endDate: true,
      detail: true,
      description: true,
      progressBars: true,
      area: true,
      notifications: true,
      alertOverdue: true,
      alertDelay: true,
      alertHandover: true,
      alertOpening: true,
    };
    safeSetItemLocal("taka_layout_tooltip_visibility", JSON.stringify(defaultVal));
    return { layoutTooltipVisibility: defaultVal };
  }),
});
