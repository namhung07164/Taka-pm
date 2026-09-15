import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import { create } from 'zustand';
import { User } from "firebase/auth";
import { Project, Task, Cost, AppUser, DelegationGroup, PermissionMatrix, TabId } from "../types";
import { UndoAction } from "../lib/undoManager";

interface AppState {
  isFocusMode: boolean;
  setIsFocusMode: (val: boolean) => void;
  isPrintPreview: boolean;
  setIsPrintPreview: (val: boolean) => void;
  printOrientation: "portrait" | "landscape";
  setPrintOrientation: (val: "portrait" | "landscape") => void;
  printPaperSize: "A2" | "A3" | "A4";
  setPrintPaperSize: (val: "A2" | "A3" | "A4") => void;
  printDate: boolean;
  setPrintDate: (val: boolean) => void;
  printFilterHeader: boolean;
  setPrintFilterHeader: (val: boolean) => void;
  printScaleMode: "default" | "fit-cols" | "fit-rows" | "fit-page" | "custom";
  setPrintScaleMode: (val: "default" | "fit-cols" | "fit-rows" | "fit-page" | "custom") => void;
  printScaleCustom: number;
  setPrintScaleCustom: (val: number) => void;
  printDpi: number;
  setPrintDpi: (val: number) => void;
  printWatermark: "none" | "draft" | "confidential";
  setPrintWatermark: (val: "none" | "draft" | "confidential") => void;
  printTarget: "pdf" | "excel";
  setPrintTarget: (val: "pdf" | "excel") => void;
  showTour: boolean;
  setShowTour: (val: boolean) => void;
  isExportingPDF: boolean;
  setIsExportingPDF: (val: boolean) => void;

  // UI State
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  tabHistory: TabId[];
  setTabHistory: (history: TabId[] | ((prev: TabId[]) => TabId[])) => void;

  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  
  printRangeType: "entire" | "custom";
  setPrintRangeType: (type: "entire" | "custom") => void;
  printStartDate: string | null;
  setPrintStartDate: (date: string | null) => void;
  printEndDate: string | null;
  setPrintEndDate: (date: string | null) => void;

  toast: { title: string; message: string; type?: "success" | "error" | "info" | "warning" } | null;
  setToast: (toast: { title: string; message: string; type?: "success" | "error" | "info" | "warning" } | null) => void;

  // Modals
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (isOpen: boolean) => void;
  isProjectModalOpen: boolean;
  setIsProjectModalOpen: (isOpen: boolean) => void;
  isTaskModalOpen: boolean;
  setIsTaskModalOpen: (isOpen: boolean) => void;
  isUserModalOpen: boolean;
  setIsUserModalOpen: (isOpen: boolean) => void;
  isCalendarSyncModalOpen: boolean;
  setIsCalendarSyncModalOpen: (isOpen: boolean) => void;

  editingProject: Project | null;
  setEditingProject: (project: Project | null) => void;
  editingTask: Task | null;
  setEditingTask: (task: Task | null) => void;
  editingUser: AppUser | null;
  setEditingUser: (user: AppUser | null) => void;

  modalInitialTab: "details" | "chat" | "delegation";
  setModalInitialTab: (tab: "details" | "chat" | "delegation") => void;
  focusCommentId: string | null;
  setFocusCommentId: (id: string | null) => void;
  isReadOnlyModal: boolean;
  setIsReadOnlyModal: (isReadOnly: boolean) => void;

  prefillProjectCode: string | null;
  setPrefillProjectCode: (code: string | null) => void;
  prefillProjectYear: number | string | null;
  setPrefillProjectYear: (year: number | string | null) => void;
  prefillProjectStore: string | null;
  setPrefillProjectStore: (store: string | null) => void;

  // Filters & Navigation
  costTabSearchTerm: string;
  setCostTabSearchTerm: (term: string) => void;
  budgetTabSearchTerm: string;
  setBudgetTabSearchTerm: (term: string) => void;
  detailTabFilterCode: string;
  setDetailTabFilterCode: (code: string) => void;
  globalStoreFilter: string;
  setGlobalStoreFilter: (filter: string) => void;
  globalYearFilter: string;
  setGlobalYearFilter: (year: string) => void;
  globalLocationFilter: string[];
  setGlobalLocationFilter: (location: string[]) => void;
  pinnedProjects: string[];
  setPinnedProjects: (pinned: string[]) => void;
  setDetailTabStoreFilter: (store: string) => void;
  detailTabFocusTaskId: string;
  setDetailTabFocusTaskId: (id: string) => void;
  detailReturnScrollId: string;
  setDetailReturnScrollId: (id: string) => void;
  ganttTabFocusTaskId: string;
  setGanttTabFocusTaskId: (id: string) => void;
  ganttTriggerToday: number;
  triggerGanttToday: () => void;
  layoutTabFilters: { store?: string; location?: string; projectCode?: string; sourceTaskId?: string } | null;
  setLayoutTabFilters: (filters: { store?: string; location?: string; projectCode?: string; sourceTaskId?: string } | null) => void;
  notificationFilterId: string | null;
  setNotificationFilterId: (id: string | null) => void;

  // Data State (Firebase)
  user: User | null;
  setUser: (user: User | null) => void;
  currentUser: AppUser;
  setCurrentUser: (user: AppUser) => void;
  
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  isTasksRequested: boolean;
  setIsTasksRequested: (isTasksRequested: boolean) => void;
  isTasksLoading: boolean;
  setIsTasksLoading: (isTasksLoading: boolean) => void;
  allProjectsForNotifs: Project[];
  setAllProjectsForNotifs: (projects: Project[]) => void;
  allTasksForNotifs: Task[];
  setAllTasksForNotifs: (tasks: Task[]) => void;
  costs: Cost[];
  setCosts: (costs: Cost[]) => void;
  isCostsRequested: boolean;
  setIsCostsRequested: (isCostsRequested: boolean) => void;
  isCostsLoading: boolean;
  setIsCostsLoading: (isCostsLoading: boolean) => void;
  appUsers: AppUser[];
  setAppUsers: (users: AppUser[]) => void;
  subAppUsers: any[];
  setSubAppUsers: (users: any[]) => void;
  notificationRules: any[];
  setNotificationRules: (rules: any[]) => void;
  locations: string[];
  setLocations: (locations: string[]) => void;
  locationVisibility: Record<string, boolean>;
  setLocationVisibility: (visibility: Record<string, boolean>) => void;
  parties: string[];
  setParties: (parties: string[]) => void;
  delegationGroups: DelegationGroup[];
  setDelegationGroups: (groups: DelegationGroup[]) => void;
  isDelegationsRequested: boolean;
  setIsDelegationsRequested: (isDelegationsRequested: boolean) => void;
  isDelegationsLoading: boolean;
  setIsDelegationsLoading: (isDelegationsLoading: boolean) => void;
  permissionMatrix: PermissionMatrix;
  setPermissionMatrix: (matrix: PermissionMatrix) => void;
  activeNotifications: any[];
  setActiveNotifications: (notifications: any[]) => void;
  cloudStatus: "online" | "offline" | "syncing";
  setCloudStatus: (status: "online" | "offline" | "syncing") => void;

  undoStack: UndoAction[];
  setUndoStack: (stack: UndoAction[]) => void;

  currency: 'VND' | 'JPY' | 'USD';
  setCurrency: (currency: 'VND' | 'JPY' | 'USD') => void;
  jpyRate: number;
  setJpyRate: (rate: number) => void;
  usdRate: number;
  setUsdRate: (rate: number) => void;

  optimisticUpdateTasks: (updatedTasks: Partial<Task>[]) => void;
  optimisticUpdateCosts: (updatedCosts: Partial<Cost>[]) => void;
  optimisticUpdateProjects: (updatedProjects: Partial<Project>[]) => void;
  optimisticUpdateProjectFinancial: (projectId: string, updates: any) => void;
  rollbackProjectFinancial: (projectId: string, oldFinancial: any) => void;
}

const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {} as PermissionMatrix;

const getInitialActiveTab = (): TabId => {
  // Safe Boot (#2): Always start on 'general' tab to prevent heavy query read storms
  // from Gantt/Detail tabs on initial cold start.
  return "general";
};

export const useAppStore = create<AppState>((set) => ({
  isFocusMode: false,
  setIsFocusMode: (val) => set({ isFocusMode: val }),
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

  user: null,
  setUser: (user) => set({ user }),
  currentUser: (() => {
    try {
      const savedAuth = safeGetItemLocal("taka_auth_v1");
      if (savedAuth) {
        const parsed = JSON.parse(savedAuth);
        if (parsed && typeof parsed === "object" && parsed.id) {
          return parsed;
        }
      }
    } catch {}
    return { id: "guest", username: "Guest", role: "guest", canSee: false, canWrite: false };
  })(),
  setCurrentUser: (currentUser) => set({ currentUser }),

  projects: [],
  setProjects: (projects) => set({ projects }),
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  isTasksRequested: false,
  setIsTasksRequested: (isTasksRequested) => set({ isTasksRequested }),
  isTasksLoading: false,
  setIsTasksLoading: (isTasksLoading) => set({ isTasksLoading }),
  allProjectsForNotifs: [],
  setAllProjectsForNotifs: (allProjectsForNotifs) => set({ allProjectsForNotifs }),
  allTasksForNotifs: [],
  setAllTasksForNotifs: (allTasksForNotifs) => set({ allTasksForNotifs }),
  costs: [],
  setCosts: (costs) => set({ costs }),
  isCostsRequested: false,
  setIsCostsRequested: (isCostsRequested) => set({ isCostsRequested }),
  isCostsLoading: false,
  setIsCostsLoading: (isCostsLoading) => set({ isCostsLoading }),
  appUsers: [],
  setAppUsers: (appUsers) => set({ appUsers }),
  subAppUsers: [],
  setSubAppUsers: (subAppUsers) => set({ subAppUsers }),
  notificationRules: [],
  setNotificationRules: (notificationRules) => set({ notificationRules }),
  locations: [],
  setLocations: (locations) => set({ locations }),
  locationVisibility: {},
  setLocationVisibility: (locationVisibility) => set({ locationVisibility }),
  parties: [],
  setParties: (parties) => set({ parties }),
  delegationGroups: [],
  setDelegationGroups: (delegationGroups) => set({ delegationGroups }),
  isDelegationsRequested: false,
  setIsDelegationsRequested: (isDelegationsRequested) => set({ isDelegationsRequested }),
  isDelegationsLoading: false,
  setIsDelegationsLoading: (isDelegationsLoading) => set({ isDelegationsLoading }),
  permissionMatrix: DEFAULT_PERMISSION_MATRIX,
  setPermissionMatrix: (permissionMatrix) => set({ permissionMatrix }),
  activeNotifications: [],
  setActiveNotifications: (activeNotifications) => set({ activeNotifications }),
  cloudStatus: "offline",
  setCloudStatus: (cloudStatus) => set({ cloudStatus }),

  undoStack: [],
  setUndoStack: (undoStack) => set({ undoStack }),

  currency: 'VND',
  setCurrency: (currency) => set({ currency }),
  jpyRate: 160,
  setJpyRate: (jpyRate) => set({ jpyRate }),
  usdRate: 25000,
  setUsdRate: (usdRate) => set({ usdRate }),

  optimisticUpdateTasks: (updatedTasks) => set((state) => {
    const updatedMap = new Map(updatedTasks.map(t => [t.id, t]));
    return {
      tasks: state.tasks.map(t => {
        const update = updatedMap.get(t.id);
        if (update) {
          return { ...t, ...update } as Task;
        }
        return t;
      })
    };
  }),

  optimisticUpdateCosts: (updatedCosts) => set((state) => {
    const updatedMap = new Map(updatedCosts.map(c => [c.id, c]));
    return {
      costs: state.costs.map(c => {
        const update = updatedMap.get(c.id);
        if (update) {
          return { ...c, ...update } as Cost;
        }
        return c;
      })
    };
  }),

  optimisticUpdateProjects: (updatedProjects) => set((state) => {
    const updatedMap = new Map(updatedProjects.map(p => [p.id, p]));
    return {
      projects: state.projects.map(p => {
        const update = updatedMap.get(p.id);
        if (update) {
          return { ...p, ...update } as Project;
        }
        return p;
      })
    };
  }),

  optimisticUpdateProjectFinancial: (projectId, updates) => set((state) => {
    return {
      projects: state.projects.map(p => {
        if (p.id === projectId) {
          // A very simplified optimistic merge for deep dot-notation paths is complex.
          // Since we just update the whole 'financial' state by merging, let's do a deep merge
          // Or just replace the whole financial obj based on new data. 
          // We can handle deep nested updates here.
          const newFin = JSON.parse(JSON.stringify(p.financial || {}));
          
          for (const [key, value] of Object.entries(updates)) {
            if (key.startsWith('financial.')) {
              const parts = key.split('.');
              parts.shift(); // remove 'financial'
              let current = newFin;
              for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) current[parts[i]] = {};
                current = current[parts[i]];
              }
              const lastPart = parts[parts.length - 1];
              // Assuming value is an increment object or just a number for optimistic.
              // We pass a simple number from the component calling this, rather than the increment object
              current[lastPart] = (current[lastPart] || 0) + (value as number);
            }
          }
          return { ...p, financial: newFin };
        }
        return p;
      })
    };
  }),

  rollbackProjectFinancial: (projectId, oldFinancial) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === projectId ? { ...p, financial: oldFinancial } : p
    )
  })),
}));
