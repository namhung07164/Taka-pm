/**
 * TAKASHIMAYA PROJECT MANAGEMENT (TAKA-PM)
 * GLOBAL DATA DICTIONARY & API CONTRACTS
 * 
 * This file serves as the canonical, complete schema dictionary for all data entities,
 * Zustand stores, and backend service signatures across the application.
 */

// ============================================================================
// === SOURCE: src/types.ts ===
// ============================================================================

export interface FinancialMetric {
  totalBudget: number;
  totalApproved: number;
  totalActualPaid: number;
  totalForecastPaid: number;
  totalBalance: number;
}

export interface ProjectFinancialSummary extends FinancialMetric {
  byStore: {
    HCM: FinancialMetric;
    HN: FinancialMetric;
    [storeKey: string]: FinancialMetric;
  };
  byYear: {
    [year: string]: FinancialMetric;
  };
}

export interface TaskSummaryItem {
  id?: string;
  name: string;
  start: string;
  finish: string;
  orderIndex?: number;
  duration?: string | number;
  parentTaskId?: string;
  isModularParent?: boolean;
  taskCodePhu?: string;
  runningStatus?: 'On process' | 'Delayed' | 'Completed' | 'Upcoming' | string;
  approval?: 'Approved' | 'Rejected' | 'Pending' | string;
  party?: string;
  delegation?: boolean;
  predecessor?: string;
  predecessorTaskIds?: string[];
  baselineStart?: string;
  baselineFinish?: string;
  link?: string;
  imageUrl?: string;
  thumbnail?: string;
  attachments?: any[];
  [key: string]: any;
}

export interface Project {
  id?: string;
  no: number;
  store: string;
  year: number | string;
  code: string;
  linkCodes?: string;
  name: string;
  detail?: string;
  party?: string;
  start?: string;
  baselineStart?: string;
  baselineFinish?: string;
  handover?: string;
  opening?: string;
  startMode?: 'auto' | 'manual';
  handoverMode?: 'auto' | 'manual';
  openingMode?: 'auto' | 'manual';
  budget?: number;
  actual?: number;
  shopType?: ShopType | string;
  sizeM2?: number;
  location?: string;
  type?: string;
  note?: string;
  supportingFee?: number;
  computedTakStart?: string;
  computedTakCompl?: string;
  computedOpening?: string;
  computedStatus?: string;
  computedPlanProgress?: number;
  computedActProgress?: number;
  computedActStatus?: string;
  taskCount?: number;
  taskSummaries?: TaskSummaryItem[];
  realtimeUpdate?: boolean;
  delegation?: boolean;
  updatedAt?: string;
  textColor?: string;
  bgColor?: string;
  comments?: TaskComment[];
  mdStatus?: MdStatusType | string;
  isPinned?: boolean;
  pinnedOrder?: number;
  parentId?: string;
  financial?: ProjectFinancialSummary;
  isDeleted?: boolean;
  imageUrl?: string;
  thumbnail?: string;
  imageLinks?: any[];
}

export const SHOP_TYPE_OPTIONS = [
  'Open Counter',
  'Semi-A',
  'Semi-B',
  'Semi-C',
  'Skeleton',
] as const;

export type ShopType = typeof SHOP_TYPE_OPTIONS[number];

export const MD_STATUS_OPTIONS = [
  'approached',
  'negotiation',
  'Verbally agreed',
  'MOU signed',
  'Signed agreement',
  'Rejected',
] as const;

export type MdStatusType = typeof MD_STATUS_OPTIONS[number];

export interface TaskNote {
  id: string;
  content: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  text: string;
  createdAt: string;
  userId: string;
  userName?: string;
  mentions?: string[];
  attachments?: { name: string; url: string; fullPath: string; type?: string }[];
}

export type PredecessorType = 'FS' | 'SS' | 'FF' | 'SF';

export interface TaskPredecessor {
  taskId: string;
  type: PredecessorType;
  lagDays?: number;
}

export interface Task {
  id: string;
  projectId?: string;
  projectCode: string;
  projectYear?: number | string;
  projectStore?: string;
  location?: string;
  name: string;
  start: string;
  baselineStart?: string;
  baselineFinish?: string;
  finish: string;
  duration: string;
  durationManual: boolean;
  finishManual: boolean;
  approval?: 'Approved' | 'Rejected' | 'Pending' | string;
  approvedAt?: string | null;
  realtimeUpdate?: boolean;
  startManual?: boolean;
  party?: string;
  delegation?: boolean;
  predecessor?: string;
  notes?: TaskNote[];
  runningStatus?: 'On process' | 'Delayed' | 'Completed' | 'Upcoming';
  isShared?: boolean;
  updatedAt?: string;
  orderIndex?: number;
  comments?: TaskComment[];
  textColor?: string;
  taskCodePhu?: string;
  parentTaskId?: string;
  isModularParent?: boolean;
  isDeleted?: boolean;
  predecessors?: TaskPredecessor[];
  predecessorTaskIds?: string[];
}

export interface Cost {
  id: string;
  projectId?: string;
  projectCode: string;
  projectYear?: number | string;
  projectStore?: string;
  amount?: number;
  approvedAmount?: number;
  actual: number;
  costType?: 'act' | 'forc';
  firstPaid?: number;
  firstPaidAt?: string;
  firstStatus?: 'Actual' | 'Forecast' | string;
  secondPaid?: number;
  secondPaidAt?: string;
  secondStatus?: 'Actual' | 'Forecast' | string;
  thirdPaid?: number;
  thirdPaidAt?: string;
  thirdStatus?: 'Actual' | 'Forecast' | string;
  advanceAmount?: number;
  advancePaid?: number;
  advanceStatus?: 'Actual' | 'Forecast' | string;
  interimAmount?: number;
  interimPaid?: number;
  interimStatus?: 'Actual' | 'Forecast' | string;
  balanceAmount?: number;
  balancePaid?: number;
  balanceStatus?: 'Actual' | 'Forecast' | string;
  supportingFee: number;
  description: string;
  vendor: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

export type AppRole = 'Manager' | 'Staff' | 'CP' | 'External';
export type PermissionAction = 'See' | 'Write';
export type PermissionModule = 'general' | 'detail' | 'calendar' | 'budget' | 'costDetail' | 'report' | 'summary' | 'taskDelegation' | 'layout' | 'pictureMapping' | 'importCsv';

export type PermissionMatrix = Record<AppRole, Record<PermissionAction, Record<PermissionModule, boolean>>>;

export interface AppUser {
  id: string;
  username: string;
  password?: string;
  name?: string;
  email?: string;
  role: 'Manager' | 'Staff' | 'CP' | 'External' | 'admin' | 'user' | 'guest';
  canSee: boolean;
  canWrite: boolean;
  notification?: boolean;
  storePermissions?: {
    hcm?: boolean;
    hn?: boolean;
  };
  locationPermissions?: Record<string, boolean>;
  byPartyAccess?: boolean;
  partyPermissions?: Record<string, boolean>;
  readNotifs?: string[];
  preferences?: {
    defaultStore?: string;
    defaultYear?: string;
    currency?: 'VND' | 'JPY' | 'USD';
    language?: string;
    firstPage?: TabId;
  };
}

export interface NotificationRule {
  id: string;
  target: 'project' | 'task' | 'task_delegation';
  field: string;
  daysBefore: number;
  hoursBefore: number;
  customMessage?: string;
  color?: string;
  icon?: string;
}

export type NotificationPriority = 'critical' | 'urgent' | 'action_required' | 'info';
export type NotificationCategory = 'overdue' | 'due_soon' | 'mention' | 'delegation' | 'rollover' | 'milestone';

export interface ActiveNotification {
  id: string;
  title: string;
  subtitle: string;
  message: string;
  dateStr: string;
  diffMs: number;
  generatedAt: number;
  targetType: 'project' | 'task' | 'task_delegation';
  targetId: string | number;
  count?: number;
  projectId?: string;
  projectCode?: string;
  projectName?: string;
  taskName?: string;
  projectStore?: string;
  projectYear?: string | number;
  location?: string;
  category?: NotificationCategory;
  ruleId?: string;
  ruleField?: string;
  action?: 'cross_year_rollover' | 'complete_task' | 'approve_delegation';
  actionData?: any;
  priority?: NotificationPriority;
  isAssignedToMe?: boolean;
  party?: string;
  subItems?: ActiveNotification[];
}

export interface DelegationSubTask {
  id: string;
  name?: string;
  comments: string;
  status: string;
  approvalStatus?: string;
  approvedAt?: string | null;
  party: string;
  priority?: 'High' | 'Mid-high' | 'Mid' | 'Low';
  start?: string;
  finish?: string;
  startAct?: string;
  finishAct?: string;
  childReport?: string;
  childFileUrl?: string;
  childFileName?: string;
  delegationStatus?: string;
  report?: string;
  fileUrl?: string;
  fileName?: string;
  updatedAt: string;
  createdBy?: string;
  involvedUsers?: string[];
  attachments?: { type?: string; name?: string; url?: string }[];
}

export interface DelegationGroup {
  id: string;
  projectId?: string;
  parentTaskId?: string;
  name: string;
  projectCode?: string;
  projectStore?: string;
  projectYear?: number | string;
  subTasks: DelegationSubTask[];
  updatedAt: string;
  createdBy?: string;
  actStatus?: string;
  plStatus?: string;
  isDeleted?: boolean;
}

export type TabId = 'general' | 'detail' | 'budget' | 'cost' | 'accControl' | 'notification' | 'notificationRule' | 'calendar' | 'gantt' | 'summary' | 'taskDelegation' | 'taskDelegationCalendar' | 'setting' | 'layout' | 'manual' | 'csv_export' | 'picture_mapping' | 'audit';

export interface AuditLog {
  id: string;
  timestamp: number;
  userId: string;
  userEmail: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType?: string;
  docPath: string;
  docId: string;
  data: any;
  previousData?: any;
}

export interface TakaDeltaItem {
  docId: string;
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations';
  action: 'create' | 'update' | 'delete';
  year?: string;
  projectId?: string;
  projectCode?: string;
  projectStore?: string;
  data?: Record<string, any>;
  isPatch?: boolean;
  invalidate?: boolean;
}

export interface TakaDelta {
  id: string;
  docId?: string;
  collectionName?: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations';
  action: 'create' | 'update' | 'delete' | 'batch_update';
  year?: string;
  projectId?: string;
  projectCode?: string;
  projectStore?: string;
  data?: Record<string, any>;
  isPatch?: boolean;
  batchItems?: TakaDeltaItem[];
  updatedBy?: string;
  sessionId?: string;
  timestamp: string;
  numericTime: number;
  serverTime?: any;
  expireAt?: any;
}


// ============================================================================
// === SOURCE: src/components/PictureMapping/components/DataMapping/types.ts ===
// ============================================================================

export type ShapeType = 'rect' | 'circle' | 'polygon';

export interface Point {
  x: number;
  y: number;
}

export interface UnitShape {
  id: string;
  name: string;
  type: ShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: number[];
  fill?: string;
  opacity?: number;
  rotation?: number;
  visible: boolean;
  locked?: boolean;
  store?: string;
  location?: string;
  size?: number;
  sizeM2?: number;
}

export type HatchPatternType = 
  | 'none' 
  | 'diagonal-right' 
  | 'diagonal-left' 
  | 'cross' 
  | 'dots' 
  | 'horizontal' 
  | 'vertical';

export interface GroupRule {
  field: string;
  operator: string;
  value: string;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  opacity?: number;
  hatchPattern?: HatchPatternType;
  symbol?: string;
  category?: string;
  paintCategory?: string;
  rules?: GroupRule[];
}

export interface MapVersion {
  id: string;
  name: string;
  backgroundUrl: string | null;
  backgroundScale: number;
  backgroundPos: { x: number; y: number };
  backgroundRotation?: number;
  imagePos?: { x: number; y: number };
  imageScale?: number;
  groups: Group[];
  groupMappings: Record<string, string[]>;
  isDynamicActive?: boolean;
  store?: string;
  location?: string;
  year?: string;
  mapUnits?: UnitShape[];
  unitSizes?: Record<string, number>;
}


// ============================================================================
// === SOURCE: src/store/storeTypes.ts ===
// ============================================================================

export interface QuickNavTarget {
  project: Project;
  task?: Task | null;
  taskCode?: string;
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
  shopType?: boolean;
  area: boolean;
  notifications?: boolean;
  alertOverdue?: boolean;
  alertDelay?: boolean;
  alertHandover?: boolean;
  alertOpening?: boolean;
  alertOpeningRisk?: boolean;
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
  printShowColorLegend: boolean;
  setPrintShowColorLegend: (val: boolean) => void;
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
  prefillProjectId: string | null;
  setPrefillProjectId: (id: string | null) => void;

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
  fixedProjectCode: string;
  setFixedProjectCode: (code: string) => void;
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
  layoutPaintCategory: string;
  setLayoutPaintCategory: (cat: string) => void;
  zoomableImageSrc: string | null;
  setZoomableImageSrc: (src: string | null) => void;
  isDetailEditMode: boolean;
  setIsDetailEditMode: (v: boolean) => void;
}

export interface DataSlice {
  user: any | null;
  setUser: (user: any | null) => void;
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

  undoStack: any[];
  setUndoStack: (stack: any[]) => void;
  redoStack: any[];
  setRedoStack: (stack: any[]) => void;

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


// ============================================================================
// === SOURCE: src/components/PictureMapping/DataContext.ts ===
// ============================================================================

export interface StoreLocationRecord {
  mapUnits: UnitShape[];
  mapVersions: MapVersion[];
  activeMapVersionId: string | null;
}

export interface LoadedCloudDataPayload {
  storeLocationData: Record<string, StoreLocationRecord>;
  store?: 'HCM' | 'HN';
  location?: string;
  mapUnits?: UnitShape[];
  mapVersions?: MapVersion[];
  activeMapVersionId?: string | null;
  reviewSelectedLabels?: string[];
  reviewLabelColors?: Record<string, string>;
  unitInfo?: any[];
  classInfo?: any[];
  actualClassInfo?: any[];
  sales?: any[];
  profits?: any[];
  subFees?: any[];
  mdStatus?: any[];
  projectStatus?: any[];
  projectLink?: any[];
  basePlan?: any[];
  units?: any[];
}

export interface DataStoreState {
  store: 'HCM' | 'HN';
  setStore: (store: 'HCM' | 'HN') => void;
  location: string;
  setLocation: (location: string) => void;
  setStoreAndLocation: (store: 'HCM' | 'HN', location: string) => void;
  storeLocationData: Record<string, StoreLocationRecord>;
  setStoreLocationData: (data: Record<string, StoreLocationRecord>) => void;
  setLoadedCloudData: (payload: LoadedCloudDataPayload) => void;
  getConsolidatedSaveData: () => {
    storeLocationData: Record<string, StoreLocationRecord>;
    store: 'HCM' | 'HN';
    location: string;
    mapUnits: UnitShape[];
    mapVersions: MapVersion[];
    activeMapVersionId: string | null;
    reviewSelectedLabels: string[];
    reviewLabelColors: Record<string, string>;
    unitInfo: any[];
    classInfo: any[];
    actualClassInfo: any[];
    sales: any[];
    profits: any[];
    subFees: any[];
    mdStatus: any[];
    projectStatus: any[];
    projectLink: any[];
    basePlan: any[];
    units: any[];
  };
  mapUnits: UnitShape[];
  setMapUnits: (units: UnitShape[]) => void;
  mapVersions: MapVersion[];
  setMapVersions: (versions: MapVersion[]) => void;
  activeMapVersionId: string | null;
  setActiveMapVersionId: (id: string | null) => void;
  reviewSelectedLabels: string[];
  setReviewSelectedLabels: (labels: string[]) => void;
  reviewLabelColors: Record<string, string>;
  setReviewLabelColors: (colors: Record<string, string>) => void;
  getAllStoreUnits: (store?: 'HCM' | 'HN') => UnitShape[];
  getAllStoreVersions: (store?: 'HCM' | 'HN') => MapVersion[];
  updateStoreUnitsAcrossLocations: (units: UnitShape[], store?: 'HCM' | 'HN') => void;
  updateStoreVersionsAcrossLocations: (versions: MapVersion[], store?: 'HCM' | 'HN') => void;
  syncGroupsToAllStoreLocations: (groups: MapVersion['groups'], store?: 'HCM' | 'HN') => void;
  isCloudLoaded: boolean;
  setIsCloudLoaded: (isCloudLoaded: boolean) => void;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  unitInfo: any[];
  setUnitInfo: (info: any[]) => void;
  projectStatus: any[];
  setProjectStatus: (status: any[]) => void;
  classInfo: any[];
  setClassInfo: (info: any[]) => void;
  actualClassInfo: any[];
  setActualClassInfo: (info: any[]) => void;
  sales: any[];
  setSales: (sales: any[]) => void;
  profits: any[];
  setProfits: (profits: any[]) => void;
  subFees: any[];
  setSubFees: (fees: any[]) => void;
  mdStatus: any[];
  setMdStatus: (status: any[]) => void;
  projectLink: any[];
  setProjectLink: (link: any[]) => void;
  basePlan: any[];
  setBasePlan: (plan: any[]) => void;
  units: any[];
  setUnits: (units: any[]) => void;
  loadFullCloudData: (payload: {
    storeLocationData: Record<string, StoreLocationRecord>;
    store?: 'HCM' | 'HN';
    location?: string;
    activeMapVersionId?: string | null;
    reviewSelectedLabels?: string[];
    reviewLabelColors?: Record<string, string>;
    unitInfo?: any[];
    classInfo?: any[];
    actualClassInfo?: any[];
    sales?: any[];
    profits?: any[];
    subFees?: any[];
    mdStatus?: any[];
    projectStatus?: any[];
    projectLink?: any[];
    basePlan?: any[];
    units?: any[];
  }) => void;
}


// ============================================================================
// === SOURCE: CORE API & SERVICES FUNCTION SIGNATURES ===
// ============================================================================

// --- SOURCE: src/lib/firestoreWrites.ts ---
export declare function setDoc(ref: any, data: any, ...rest: any[]): Promise<void>;
export declare function updateDoc(ref: any, data: any, ...rest: any[]): Promise<void>;
export declare function deleteDoc(ref: any): Promise<void>;
export declare function writeBatch(dbInstance: any): any;

// --- SOURCE: src/lib/taskStateService.ts ---
export declare function isTaskBelongsToProject(t: Partial<Task>, p: Partial<Project>): boolean;

export interface EnsureProjectTasksContext {
  projectId?: string;
  store?: string;
  year?: string | number;
}
export declare function ensureProjectTasksLoaded(
  projectCode: string,
  context?: EnsureProjectTasksContext
): Promise<Task[]>;

export declare function findAffectedProjects(
  tasksToCheck: Partial<Task>[],
  allProjects?: Project[]
): Project[];

export declare function syncAffectedProjects(
  affectedProjects: Project[],
  allTasks?: Task[]
): Promise<void>;

export declare function saveTaskStateUnified(
  taskUpdates: (Partial<Task> & { id: string })[],
  options?: { syncProjects?: boolean; allTasksOverride?: Task[] }
): Promise<void>;

export declare function cleanOrphanTasks(tasks: Task[]): { cleaned: Task[]; fixedCount: number };

export declare function reorderTasksStateUnified(
  allUpdatedTasks: Task[],
  options?: { affectedProjectIds?: string[]; syncProjects?: boolean }
): Promise<void>;

export declare function deleteTaskStateUnified(
  taskId: string,
  options?: { projectId?: string; syncProjects?: boolean }
): Promise<void>;

export declare function deleteProjectStateUnified(projectId: string): Promise<void>;

// --- SOURCE: src/lib/financialAtomicService.ts ---
export declare function saveCostWithAtomicSummary(
  projectId: string, 
  newCostData: Cost, 
  oldCostData: Cost | null, 
  budgetHierarchy?: { level3Id?: string; level2Id?: string; level1Id?: string }
): Promise<void>;

export declare function deleteCostWithAtomicSummary(
  projectId: string, 
  costToDelete: Cost, 
  budgetHierarchy?: { level3Id?: string; level2Id?: string; level1Id?: string }
): Promise<void>;

// --- SOURCE: src/lib/deltaSyncService.ts ---
export declare function getRestoreCutoffTimestamp(): number;
export declare function markRestoreVersionCompleted(cutoffMs?: number, isRemoteSignal?: boolean): void;
export declare function serverDeltaTime(d: TakaDelta): number;
export declare function deltaTime(d: TakaDelta): number;
export declare function getLastDeltaSyncTime(): number;
export declare function filterUnappliedDeltas(items: TakaDelta[]): TakaDelta[];
export declare function recordDelta(delta: Partial<TakaDelta>): Promise<void>;
export declare function recordBatchDeltas(deltas: TakaDeltaItem[]): Promise<void>;
export declare function applyIncomingDeltas(deltas: TakaDelta[]): Promise<void>;
export declare function pullAndApplyDeltas(customTime?: number, forceAll?: boolean): Promise<number>;

// --- SOURCE: src/lib/projectDatesService.ts ---
export interface ComputedProjectDates {
  computedTakStart?: string;
  computedTakCompl?: string;
  computedOpening?: string;
  computedPlanProgress?: number;
  computedActProgress?: number;
  taskCount?: number;
  taskSummaries?: { name: string; start: string; finish: string; }[];
}

export declare function matchProjectCode(codeA?: string, codeB?: string): boolean;
export declare function getTasksForProject(
  project: Partial<Project>,
  allTasks: Task[],
  options?: { realTasksOnly?: boolean }
): Task[];

export declare function calculateProjectComputedDates(
  project: Partial<Project>,
  projectTasks: Task[],
  delegationGroups?: DelegationGroup[]
): ComputedProjectDates;

export declare function syncProjectDatesToFirestore(
  projectId: string,
  dates: ComputedProjectDates
): Promise<void>;

export declare function syncProjectDatesByCode(
  projectCode: string,
  projectStore?: string,
  projectYear?: string | number,
  overrideTasks?: Task[],
  targetProjectId?: string
): Promise<void>;

// --- SOURCE: src/lib/auditLogService.ts ---
export declare function recordAuditLog(log: {
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType?: string;
  docPath: string;
  docId: string;
  data: any;
  previousData?: any;
}): Promise<void>;

// --- SOURCE: src/lib/r2StorageUtils.ts ---
export declare function extractR2ImageKeys(data: any): string[];
export declare function deleteR2StorageFiles(
  keysOrUrls: string[],
  customCreds?: any
): Promise<{ deletedCount: number; deletedKeys: string[] }>;

export declare function cleanOrphanR2Files(
  activeData: any,
  options?: {
    customCreds?: any;
    onProgress?: (status: string) => void;
  }
): Promise<{ scannedCount: number; deletedCount: number; deletedKeys: string[] }>;

export declare function uploadPictureToTakaFolder(
  file: File,
  unitCode?: string,
  store?: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }>;

export declare function deleteR2ImageCleanly(
  urlOrKey: string,
  customCreds?: any
): Promise<{ success: boolean; deletedKeys: string[] }>;
