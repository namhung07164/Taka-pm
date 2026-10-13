import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import { User } from "firebase/auth";
import { Project, Task, Cost, AppUser, DelegationGroup, PermissionMatrix, TabId } from "../types";
import { UndoAction } from "../lib/undoManager";

export interface QuickNavTarget {
  project: Project;
  task?: Task | null;
  taskCode?: string;
}

export interface UISlice {
  isFocusMode: boolean;
  setIsFocusMode: (val: boolean) => void;
  ribbonDisplayMode: "always_show" | "tabs_only" | "fullscreen";
  setRibbonDisplayMode: (mode: "always_show" | "tabs_only" | "fullscreen") => void;
  showQuickAccessToolbar: boolean;
  setShowQuickAccessToolbar: (show: boolean) => void;
  isPrintPreview: boolean;
  setIsPrintPreview: (val: boolean) => void;
  printOrientation: "portrait" | "landscape";
  setPrintOrientation: (val: "portrait" | "landscape") => void;
  printPaperSize: "A2" | "A3" | "A4";
  setPrintPaperSize: (val: "A2" | "A3" | "A4") => void;
  printDate: boolean;
  setPrintDate: (val: boolean) => void;
  expandedProjectIds: string[];
  toggleProjectExpansion: (projectId: string) => void;
  setExpandedProjectIds: (ids: string[]) => void;
  visibleActiveProjectIds: string[];
  setVisibleActiveProjectIds: (ids: string[]) => void;
  searchActiveProjectIds: string[];
  setSearchActiveProjectIds: (ids: string[]) => void;
  printFilterHeader: boolean;
  setPrintFilterHeader: (val: boolean) => void;
  printScaleMode: "default" | "fit-cols" | "fit-rows" | "fit-page" | "fill-page" | "custom";
  setPrintScaleMode: (val: "default" | "fit-cols" | "fit-rows" | "fit-page" | "fill-page" | "custom") => void;
  printScaleCustom: number;
  setPrintScaleCustom: (val: number) => void;
  printDpi: number;
  setPrintDpi: (val: number) => void;
  printWatermark: "none" | "draft" | "confidential";
  setPrintWatermark: (val: "none" | "draft" | "confidential") => void;
  printTarget: "browser" | "pdf" | "excel";
  setPrintTarget: (val: "browser" | "pdf" | "excel") => void;
  showTour: boolean;
  setShowTour: (val: boolean) => void;
  isExportingPDF: boolean;
  setIsExportingPDF: (val: boolean) => void;

  // Gantt View & Scale Controls
  ganttViewMode: "monthly" | "weekly" | "quarterly";
  setGanttViewMode: (mode: "monthly" | "weekly" | "quarterly") => void;
  ganttDayWidth: number;
  setGanttDayWidth: (width: number) => void;
  ganttScaleInput: string;
  setGanttScaleInput: (val: string) => void;
  isGanttWidthChanged: boolean;
  setIsGanttWidthChanged: (val: boolean) => void;
  saveGanttDayWidth: () => void;
  isGanttSettingsOpen: boolean;
  setIsGanttSettingsOpen: (val: boolean) => void;
  ganttShowDependencies: boolean;
  setGanttShowDependencies: (val: boolean) => void;

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
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (isOpen: boolean) => void;

  quickNavTarget: QuickNavTarget | null;
  setQuickNavTarget: (target: QuickNavTarget | null) => void;

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
  ganttTabFilterProjectId: string;
  setGanttTabFilterProjectId: (id: string) => void;
  ganttTriggerToday: number;
  triggerGanttToday: () => void;
  layoutTabFilters: { store?: string; location?: string; projectCode?: string; sourceTaskId?: string; _ts?: number } | null;
  setLayoutTabFilters: (filters: { store?: string; location?: string; projectCode?: string; sourceTaskId?: string; _ts?: number } | null) => void;
  notificationFilterId: string | null;
  setNotificationFilterId: (id: string | null) => void;

  layoutTooltipVisibility: LayoutTooltipVisibility;
  setLayoutTooltipVisibility: (updater: Partial<LayoutTooltipVisibility> | ((prev: LayoutTooltipVisibility) => LayoutTooltipVisibility)) => void;
  resetLayoutTooltipVisibility: () => void;
  zoomableImageSrc: string | null;
  setZoomableImageSrc: (src: string | null) => void;
}

export interface LayoutTooltipVisibility {
  projectCode: boolean;
  projectName: boolean;
  mdStatus: boolean;
  actStatus: boolean;
  legendColor: boolean;
  floor: boolean;
  startDate: boolean;
  endDate: boolean;
  detail: boolean;
  description: boolean;
  progressBars: boolean;
  area: boolean;
  // Smart Notifications & Alerts Config
  notifications?: boolean;
  alertOverdue?: boolean;
  alertDelay?: boolean;
  alertHandover?: boolean;
  alertOpening?: boolean;
  alertOpeningRisk?: boolean;
}

export interface DataSlice {
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
  redoStack: UndoAction[];
  setRedoStack: (stack: UndoAction[]) => void;

  currency: 'VND' | 'JPY' | 'USD';
  setCurrency: (currency: 'VND' | 'JPY' | 'USD') => void;
  jpyRate: number;
  setJpyRate: (rate: number) => void;
  usdRate: number;
  setUsdRate: (rate: number) => void;

  r2Config: { accountId: string; bucketName: string; accessKeyId: string; secretAccessKey: string } | null;
  setR2Config: (config: { accountId: string; bucketName: string; accessKeyId: string; secretAccessKey: string } | null) => void;
}

export interface OptimisticSlice {
  optimisticUpdateTasks: (updatedTasks: (Partial<Task> & { id: string })[]) => void;
  optimisticDeleteTasks: (taskIds: string[]) => void;
  optimisticUpdateCosts: (updatedCosts: (Partial<Cost> & { id: string })[]) => void;
  optimisticDeleteCosts: (costIds: string[]) => void;
  optimisticUpdateProjects: (updatedProjects: (Partial<Project> & { id: string })[]) => void;
  optimisticDeleteProjects: (projectIds: string[]) => void;
  optimisticUpdateProjectFinancial: (projectId: string, updates: any) => void;
  rollbackProjectFinancial: (projectId: string, oldFinancial: any) => void;
}

export type AppState = UISlice & DataSlice & OptimisticSlice;
