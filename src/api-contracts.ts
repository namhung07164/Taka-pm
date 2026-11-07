/**
 * TAKA-PM GLOBAL DATA DICTIONARY & API CONTRACTS (SSoT)
 * Rule: Keep < 500 lines. Preserve 100% type/signature fidelity in compact single-line declarations.
 */

// === 1. CORE ENTITIES (`src/types.ts`) ===
export interface FinancialMetric { totalBudget: number; totalApproved: number; totalActualPaid: number; totalForecastPaid: number; totalBalance: number; }
export interface ProjectFinancialSummary extends FinancialMetric { byStore: { HCM: FinancialMetric; HN: FinancialMetric; [storeKey: string]: FinancialMetric }; byYear: { [year: string]: FinancialMetric }; }

export interface TaskSummaryItem {
  id?: string; name: string; start: string; finish: string; orderIndex?: number; duration?: string | number;
  parentTaskId?: string; isModularParent?: boolean; taskCodePhu?: string;
  runningStatus?: 'On process' | 'Delayed' | 'Completed' | 'Upcoming' | string;
  approval?: 'Approved' | 'Rejected' | 'Pending' | string; party?: string; delegation?: boolean;
  predecessor?: string; predecessorTaskIds?: string[]; baselineStart?: string; baselineFinish?: string;
  link?: string; imageUrl?: string; thumbnail?: string; attachments?: any[]; [key: string]: any;
}

export const SHOP_TYPE_OPTIONS = ['Open Counter', 'Semi-A', 'Semi-B', 'Semi-C', 'Skeleton'] as const;
export type ShopType = typeof SHOP_TYPE_OPTIONS[number];
export const MD_STATUS_OPTIONS = ['approached', 'negotiation', 'Verbally agreed', 'MOU signed', 'Signed agreement', 'Rejected'] as const;
export type MdStatusType = typeof MD_STATUS_OPTIONS[number];

export interface Project {
  id?: string; no: number; store: string; year: number | string; code: string; linkCodes?: string; name: string;
  detail?: string; party?: string; start?: string; baselineStart?: string; baselineFinish?: string;
  handover?: string; opening?: string; startMode?: 'auto' | 'manual'; handoverMode?: 'auto' | 'manual'; openingMode?: 'auto' | 'manual';
  budget?: number; actual?: number; shopType?: ShopType | string; sizeM2?: number; location?: string; type?: string; note?: string;
  supportingFee?: number; computedTakStart?: string; computedTakCompl?: string; computedOpening?: string; computedStatus?: string;
  computedPlanProgress?: number; computedActProgress?: number; computedActStatus?: string;
  taskCount?: number; taskSummaries?: TaskSummaryItem[]; realtimeUpdate?: boolean; delegation?: boolean; updatedAt?: string;
  textColor?: string; bgColor?: string; comments?: TaskComment[]; mdStatus?: MdStatusType | string;
  isPinned?: boolean; pinnedOrder?: number; parentId?: string; financial?: ProjectFinancialSummary;
  isDeleted?: boolean; imageUrl?: string; thumbnail?: string; imageLinks?: any[];
}

export interface TaskNote { id: string; content: string; updatedAt: string; }
export interface TaskComment { id: string; text: string; createdAt: string; userId: string; userName?: string; mentions?: string[]; attachments?: { name: string; url: string; fullPath: string; type?: string }[]; }
export type PredecessorType = 'FS' | 'SS' | 'FF' | 'SF';
export interface TaskPredecessor { taskId: string; type: PredecessorType; lagDays?: number; }

export interface Task {
  id: string; projectId?: string; projectCode: string; projectYear?: number | string; projectStore?: string;
  location?: string; name: string; start: string; baselineStart?: string; baselineFinish?: string; finish: string;
  duration: string; durationManual: boolean; finishManual: boolean;
  approval?: 'Approved' | 'Rejected' | 'Pending' | string; approvedAt?: string | null;
  realtimeUpdate?: boolean; startManual?: boolean; party?: string; delegation?: boolean; predecessor?: string;
  notes?: TaskNote[]; runningStatus?: 'On process' | 'Delayed' | 'Completed' | 'Upcoming';
  isShared?: boolean; updatedAt?: string; orderIndex?: number; comments?: TaskComment[]; textColor?: string;
  taskCodePhu?: string; parentTaskId?: string; isModularParent?: boolean; isDeleted?: boolean;
  predecessors?: TaskPredecessor[]; predecessorTaskIds?: string[];
}

export interface Cost {
  id: string; projectId?: string; projectCode: string; projectYear?: number | string; projectStore?: string;
  amount?: number; approvedAmount?: number; actual: number; costType?: 'act' | 'forc';
  firstPaid?: number; firstPaidAt?: string; firstStatus?: 'Actual' | 'Forecast' | string;
  secondPaid?: number; secondPaidAt?: string; secondStatus?: 'Actual' | 'Forecast' | string;
  thirdPaid?: number; thirdPaidAt?: string; thirdStatus?: 'Actual' | 'Forecast' | string;
  advanceAmount?: number; advancePaid?: number; advanceStatus?: 'Actual' | 'Forecast' | string;
  interimAmount?: number; interimPaid?: number; interimStatus?: 'Actual' | 'Forecast' | string;
  balanceAmount?: number; balancePaid?: number; balanceStatus?: 'Actual' | 'Forecast' | string;
  supportingFee: number; description: string; vendor: string; updatedAt?: string; isDeleted?: boolean;
}

export type AppRole = 'Manager' | 'Staff' | 'CP' | 'External';
export type PermissionAction = 'See' | 'Write';
export type PermissionModule = 'general' | 'detail' | 'calendar' | 'budget' | 'costDetail' | 'report' | 'summary' | 'taskDelegation' | 'layout' | 'pictureMapping' | 'importCsv';
export type PermissionMatrix = Record<AppRole, Record<PermissionAction, Record<PermissionModule, boolean>>>;
export type TabId = 'general' | 'myWork' | 'detail' | 'budget' | 'cost' | 'accControl' | 'notification' | 'notificationRule' | 'calendar' | 'gantt' | 'summary' | 'taskDelegation' | 'taskDelegationCalendar' | 'setting' | 'layout' | 'manual' | 'csv_export' | 'picture_mapping' | 'audit';

export interface AppUser {
  id: string; username: string; password?: string; name?: string; email?: string;
  role: 'Manager' | 'Staff' | 'CP' | 'External' | 'admin' | 'user' | 'guest';
  canSee: boolean; canWrite: boolean; notification?: boolean;
  storePermissions?: { hcm?: boolean; hn?: boolean }; locationPermissions?: Record<string, boolean>;
  byPartyAccess?: boolean; partyPermissions?: Record<string, boolean>; readNotifs?: string[];
  myWorkStates?: Record<string, string>; myWorkUpdatedAt?: string;
  preferences?: { defaultStore?: string; defaultYear?: string; currency?: 'VND' | 'JPY' | 'USD'; language?: string; firstPage?: TabId };
}

export interface NotificationRule { id: string; target: 'project' | 'task' | 'task_delegation'; field: string; daysBefore: number; hoursBefore: number; customMessage?: string; color?: string; icon?: string; }
export type NotificationPriority = 'critical' | 'urgent' | 'action_required' | 'info';
export type NotificationCategory = 'overdue' | 'due_soon' | 'mention' | 'delegation' | 'rollover' | 'milestone';

export interface ActiveNotification {
  id: string; title: string; subtitle: string; message: string; dateStr: string; diffMs: number; generatedAt: number;
  targetType: 'project' | 'task' | 'task_delegation'; targetId: string | number; count?: number;
  projectId?: string; projectCode?: string; projectName?: string; taskName?: string; projectStore?: string; projectYear?: string | number; location?: string;
  category?: NotificationCategory; ruleId?: string; ruleField?: string;
  action?: 'cross_year_rollover' | 'complete_task' | 'approve_delegation'; actionData?: any;
  priority?: NotificationPriority; isAssignedToMe?: boolean; party?: string; subItems?: ActiveNotification[];
}

export interface DelegationSubTask {
  id: string; name?: string; comments: string; status: string; approvalStatus?: string; approvedAt?: string | null;
  party: string; priority?: 'High' | 'Mid-high' | 'Mid' | 'Low'; start?: string; finish?: string; startAct?: string; finishAct?: string;
  childReport?: string; childFileUrl?: string; childFileName?: string; delegationStatus?: string; report?: string; fileUrl?: string; fileName?: string;
  updatedAt: string; createdBy?: string; involvedUsers?: string[]; attachments?: { type?: string; name?: string; url?: string }[];
}

export interface DelegationGroup {
  id: string; projectId?: string; parentTaskId?: string; name: string; projectCode?: string; projectStore?: string; projectYear?: number | string;
  subTasks: DelegationSubTask[]; updatedAt: string; createdBy?: string; actStatus?: string; plStatus?: string; isDeleted?: boolean;
}

export interface AuditLog { id: string; timestamp: number; userId: string; userEmail: string; action: 'CREATE' | 'UPDATE' | 'DELETE'; entityType?: string; docPath: string; docId: string; data: any; previousData?: any; }

export interface TakaDeltaItem {
  docId: string; collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations';
  action: 'create' | 'update' | 'delete'; year?: string; projectId?: string; projectCode?: string; projectStore?: string;
  data?: Record<string, any>; isPatch?: boolean; invalidate?: boolean;
}

export interface TakaDelta {
  id: string; docId?: string; collectionName?: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations';
  action: 'create' | 'update' | 'delete' | 'batch_update'; year?: string; projectId?: string; projectCode?: string; projectStore?: string;
  data?: Record<string, any>; isPatch?: boolean; batchItems?: TakaDeltaItem[]; updatedBy?: string; sessionId?: string;
  timestamp: string; numericTime: number; serverTime?: any; expireAt?: any;
}

// === 2. PICTURE MAPPING TYPES (`src/components/PictureMapping/...`) ===
export type ShapeType = 'rect' | 'circle' | 'polygon';
export interface Point { x: number; y: number; }
export interface UnitShape { id: string; name: string; type: ShapeType; x: number; y: number; width?: number; height?: number; radius?: number; points?: number[]; fill?: string; opacity?: number; rotation?: number; visible: boolean; locked?: boolean; store?: string; location?: string; size?: number; sizeM2?: number; }
export type HatchPatternType = 'none' | 'diagonal-right' | 'diagonal-left' | 'cross' | 'dots' | 'horizontal' | 'vertical';
export interface GroupRule { field: string; operator: string; value: string; }
export interface Group { id: string; name: string; color: string; opacity?: number; hatchPattern?: HatchPatternType; symbol?: string; category?: string; paintCategory?: string; rules?: GroupRule[]; }
export interface MapVersion { id: string; name: string; backgroundUrl: string | null; backgroundScale: number; backgroundPos: { x: number; y: number }; backgroundRotation?: number; imagePos?: { x: number; y: number }; imageScale?: number; groups: Group[]; groupMappings: Record<string, string[]>; isDynamicActive?: boolean; store?: string; location?: string; year?: string; mapUnits?: UnitShape[]; unitSizes?: Record<string, number>; }
export interface StoreLocationRecord { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId: string | null; }
export interface LoadedCloudDataPayload { storeLocationData: Record<string, StoreLocationRecord>; store?: 'HCM' | 'HN'; location?: string; mapUnits?: UnitShape[]; mapVersions?: MapVersion[]; activeMapVersionId?: string | null; reviewSelectedLabels?: string[]; reviewLabelColors?: Record<string, string>; unitInfo?: any[]; classInfo?: any[]; actualClassInfo?: any[]; sales?: any[]; profits?: any[]; subFees?: any[]; mdStatus?: any[]; projectStatus?: any[]; projectLink?: any[]; basePlan?: any[]; units?: any[]; }

type S<T> = (v: T) => void;

export interface DataStoreState {
  store: 'HCM' | 'HN'; setStore: S<'HCM' | 'HN'>; location: string; setLocation: S<string>;
  setStoreAndLocation: (store: 'HCM' | 'HN', location: string) => void;
  storeLocationData: Record<string, StoreLocationRecord>; setStoreLocationData: S<Record<string, StoreLocationRecord>>;
  setLoadedCloudData: S<LoadedCloudDataPayload>;
  getConsolidatedSaveData: () => Required<Omit<LoadedCloudDataPayload, 'store' | 'location'>> & { store: 'HCM' | 'HN'; location: string };
  mapUnits: UnitShape[]; setMapUnits: S<UnitShape[]>; mapVersions: MapVersion[]; setMapVersions: S<MapVersion[]>;
  activeMapVersionId: string | null; setActiveMapVersionId: S<string | null>;
  reviewSelectedLabels: string[]; setReviewSelectedLabels: S<string[]>;
  reviewLabelColors: Record<string, string>; setReviewLabelColors: S<Record<string, string>>;
  getAllStoreUnits: (store?: 'HCM' | 'HN') => UnitShape[]; getAllStoreVersions: (store?: 'HCM' | 'HN') => MapVersion[];
  updateStoreUnitsAcrossLocations: (units: UnitShape[], store?: 'HCM' | 'HN') => void;
  updateStoreVersionsAcrossLocations: (versions: MapVersion[], store?: 'HCM' | 'HN') => void;
  syncGroupsToAllStoreLocations: (groups: MapVersion['groups'], store?: 'HCM' | 'HN') => void;
  isCloudLoaded: boolean; setIsCloudLoaded: S<boolean>; isLoading: boolean; setIsLoading: S<boolean>;
  unitInfo: any[]; setUnitInfo: S<any[]>; projectStatus: any[]; setProjectStatus: S<any[]>;
  classInfo: any[]; setClassInfo: S<any[]>; actualClassInfo: any[]; setActualClassInfo: S<any[]>;
  sales: any[]; setSales: S<any[]>; profits: any[]; setProfits: S<any[]>;
  subFees: any[]; setSubFees: S<any[]>; mdStatus: any[]; setMdStatus: S<any[]>;
  projectLink: any[]; setProjectLink: S<any[]>; basePlan: any[]; setBasePlan: S<any[]>;
  units: any[]; setUnits: S<any[]>; loadFullCloudData: S<LoadedCloudDataPayload>;
}

// === 3. ZUSTAND STORE SLICES (`src/store/storeTypes.ts`) ===
export interface QuickNavTarget { project: Project; task?: Task | null; taskCode?: string; }
export interface LayoutTooltipVisibility { projectCode: boolean; projectName: boolean; mdStatus: boolean; actStatus: boolean; legendColor: boolean; floor: boolean; startDate: boolean; endDate: boolean; detail: boolean; description: boolean; progressBars: boolean; shopType?: boolean; area: boolean; notifications?: boolean; alertOverdue?: boolean; alertDelay?: boolean; alertHandover?: boolean; alertOpening?: boolean; alertOpeningRisk?: boolean; }
type ToastMsg = { title: string; message: string; type?: 'success' | 'error' | 'info' | 'warning' } | null;
type LayoutFilterState = { store?: string; location?: string; projectCode?: string; sourceTaskId?: string; _ts?: number } | null;
type R2Creds = { accountId: string; bucketName: string; accessKeyId: string; secretAccessKey: string } | null;

export interface UISlice {
  isFocusMode: boolean; setIsFocusMode: S<boolean>;
  ribbonDisplayMode: 'always_show' | 'tabs_only' | 'fullscreen'; setRibbonDisplayMode: S<'always_show' | 'tabs_only' | 'fullscreen'>;
  showQuickAccessToolbar: boolean; setShowQuickAccessToolbar: S<boolean>;
  isPrintPreview: boolean; setIsPrintPreview: S<boolean>;
  printOrientation: 'portrait' | 'landscape'; setPrintOrientation: S<'portrait' | 'landscape'>;
  printPaperSize: 'A2' | 'A3' | 'A4'; setPrintPaperSize: S<'A2' | 'A3' | 'A4'>;
  printDate: boolean; setPrintDate: S<boolean>;
  expandedProjectIds: string[]; toggleProjectExpansion: S<string>; setExpandedProjectIds: S<string[]>;
  visibleActiveProjectIds: string[]; setVisibleActiveProjectIds: S<string[]>;
  searchActiveProjectIds: string[]; setSearchActiveProjectIds: S<string[]>;
  printFilterHeader: boolean; setPrintFilterHeader: S<boolean>;
  printShowColorLegend: boolean; setPrintShowColorLegend: S<boolean>;
  printScaleMode: 'default' | 'fit-cols' | 'fit-rows' | 'fit-page' | 'fill-page' | 'custom'; setPrintScaleMode: S<UISlice['printScaleMode']>;
  printScaleCustom: number; setPrintScaleCustom: S<number>; printDpi: number; setPrintDpi: S<number>;
  printWatermark: 'none' | 'draft' | 'confidential'; setPrintWatermark: S<'none' | 'draft' | 'confidential'>;
  printTarget: 'browser' | 'pdf' | 'excel'; setPrintTarget: S<'browser' | 'pdf' | 'excel'>;
  showTour: boolean; setShowTour: S<boolean>; isExportingPDF: boolean; setIsExportingPDF: S<boolean>;
  ganttViewMode: 'monthly' | 'weekly' | 'quarterly'; setGanttViewMode: S<'monthly' | 'weekly' | 'quarterly'>;
  ganttDayWidth: number; setGanttDayWidth: S<number>; ganttScaleInput: string; setGanttScaleInput: S<string>;
  isGanttWidthChanged: boolean; setIsGanttWidthChanged: S<boolean>; saveGanttDayWidth: () => void;
  isGanttSettingsOpen: boolean; setIsGanttSettingsOpen: S<boolean>;
  ganttShowDependencies: boolean; setGanttShowDependencies: S<boolean>;
  activeTab: TabId; setActiveTab: S<TabId>; tabHistory: TabId[]; setTabHistory: S<TabId[] | ((prev: TabId[]) => TabId[])>;
  theme: 'light' | 'dark'; setTheme: S<'light' | 'dark'>;
  printRangeType: 'entire' | 'custom'; setPrintRangeType: S<'entire' | 'custom'>;
  printStartDate: string | null; setPrintStartDate: S<string | null>;
  printEndDate: string | null; setPrintEndDate: S<string | null>;
  toast: ToastMsg; setToast: S<ToastMsg>;
  isLoginModalOpen: boolean; setIsLoginModalOpen: S<boolean>;
  isProjectModalOpen: boolean; setIsProjectModalOpen: S<boolean>;
  isTaskModalOpen: boolean; setIsTaskModalOpen: S<boolean>;
  isUserModalOpen: boolean; setIsUserModalOpen: S<boolean>;
  isCalendarSyncModalOpen: boolean; setIsCalendarSyncModalOpen: S<boolean>;
  isCommandPaletteOpen: boolean; setIsCommandPaletteOpen: S<boolean>;
  quickNavTarget: QuickNavTarget | null; setQuickNavTarget: S<QuickNavTarget | null>;
  editingProject: Project | null; setEditingProject: S<Project | null>;
  editingTask: Task | null; setEditingTask: S<Task | null>;
  editingUser: AppUser | null; setEditingUser: S<AppUser | null>;
  modalInitialTab: 'details' | 'chat' | 'delegation'; setModalInitialTab: S<'details' | 'chat' | 'delegation'>;
  focusCommentId: string | null; setFocusCommentId: S<string | null>;
  isReadOnlyModal: boolean; setIsReadOnlyModal: S<boolean>;
  prefillProjectCode: string | null; setPrefillProjectCode: S<string | null>;
  prefillProjectYear: number | string | null; setPrefillProjectYear: S<number | string | null>;
  prefillProjectStore: string | null; setPrefillProjectStore: S<string | null>;
  prefillProjectId: string | null; setPrefillProjectId: S<string | null>;
  costTabSearchTerm: string; setCostTabSearchTerm: S<string>;
  budgetTabSearchTerm: string; setBudgetTabSearchTerm: S<string>;
  detailTabFilterCode: string; setDetailTabFilterCode: S<string>;
  globalStoreFilter: string; setGlobalStoreFilter: S<string>;
  globalYearFilter: string; setGlobalYearFilter: S<string>;
  globalLocationFilter: string[]; setGlobalLocationFilter: S<string[]>;
  pinnedProjects: string[]; setPinnedProjects: S<string[]>;
  fixedProjectCode: string; setFixedProjectCode: S<string>;
  setDetailTabStoreFilter: S<string>;
  detailTabFocusTaskId: string; setDetailTabFocusTaskId: S<string>;
  detailReturnScrollId: string; setDetailReturnScrollId: S<string>;
  ganttTabFocusTaskId: string; setGanttTabFocusTaskId: S<string>;
  ganttTabFilterProjectId: string; setGanttTabFilterProjectId: S<string>;
  ganttTriggerToday: number; triggerGanttToday: () => void;
  layoutTabFilters: LayoutFilterState; setLayoutTabFilters: S<LayoutFilterState>;
  notificationFilterId: string | null; setNotificationFilterId: S<string | null>;
  layoutTooltipVisibility: LayoutTooltipVisibility; setLayoutTooltipVisibility: S<Partial<LayoutTooltipVisibility> | ((prev: LayoutTooltipVisibility) => LayoutTooltipVisibility)>;
  resetLayoutTooltipVisibility: () => void; layoutPaintCategory: string; setLayoutPaintCategory: S<string>;
  zoomableImageSrc: string | null; setZoomableImageSrc: S<string | null>;
  isDetailEditMode: boolean; setIsDetailEditMode: S<boolean>;
}

export interface DataSlice {
  user: any | null; setUser: S<any | null>; currentUser: AppUser; setCurrentUser: S<AppUser>;
  projects: Project[]; setProjects: S<Project[]>; tasks: Task[]; setTasks: S<Task[]>;
  isTasksRequested: boolean; setIsTasksRequested: S<boolean>; isTasksLoading: boolean; setIsTasksLoading: S<boolean>;
  allProjectsForNotifs: Project[]; setAllProjectsForNotifs: S<Project[]>;
  allTasksForNotifs: Task[]; setAllTasksForNotifs: S<Task[]>;
  costs: Cost[]; setCosts: S<Cost[]>;
  isCostsRequested: boolean; setIsCostsRequested: S<boolean>; isCostsLoading: boolean; setIsCostsLoading: S<boolean>;
  appUsers: AppUser[]; setAppUsers: S<AppUser[]>; subAppUsers: any[]; setSubAppUsers: S<any[]>;
  notificationRules: any[]; setNotificationRules: S<any[]>;
  locations: string[]; setLocations: S<string[]>;
  locationVisibility: Record<string, boolean>; setLocationVisibility: S<Record<string, boolean>>;
  parties: string[]; setParties: S<string[]>;
  delegationGroups: DelegationGroup[]; setDelegationGroups: S<DelegationGroup[]>;
  isDelegationsRequested: boolean; setIsDelegationsRequested: S<boolean>;
  isDelegationsLoading: boolean; setIsDelegationsLoading: S<boolean>;
  permissionMatrix: PermissionMatrix; setPermissionMatrix: S<PermissionMatrix>;
  activeNotifications: any[]; setActiveNotifications: S<any[]>;
  cloudStatus: 'online' | 'offline' | 'syncing'; setCloudStatus: S<'online' | 'offline' | 'syncing'>;
  undoStack: any[]; setUndoStack: S<any[]>; redoStack: any[]; setRedoStack: S<any[]>;
  currency: 'VND' | 'JPY' | 'USD'; setCurrency: S<'VND' | 'JPY' | 'USD'>;
  jpyRate: number; setJpyRate: S<number>; usdRate: number; setUsdRate: S<number>;
  r2Config: R2Creds; setR2Config: S<R2Creds>;
}

export interface OptimisticSlice {
  optimisticUpdateTasks: S<(Partial<Task> & { id: string })[]>;
  optimisticDeleteTasks: S<string[]>;
  optimisticUpdateCosts: S<(Partial<Cost> & { id: string })[]>;
  optimisticDeleteCosts: S<string[]>;
  optimisticUpdateProjects: S<(Partial<Project> & { id: string })[]>;
  optimisticDeleteProjects: S<string[]>;
  optimisticUpdateProjectFinancial: (projectId: string, updates: any) => void;
  rollbackProjectFinancial: (projectId: string, oldFinancial: any) => void;
}

export type AppState = UISlice & DataSlice & OptimisticSlice;

// === 4. CORE API & SERVICE SIGNATURES ===
// src/lib/firestoreWrites.ts
export declare function setDoc(ref: any, data: any, ...rest: any[]): Promise<void>;
export declare function updateDoc(ref: any, data: any, ...rest: any[]): Promise<void>;
export declare function deleteDoc(ref: any): Promise<void>;
export declare function writeBatch(dbInstance: any): any;

// src/lib/taskStateService.ts
export declare function isTaskBelongsToProject(t: Partial<Task>, p: Partial<Project>): boolean;
export interface EnsureProjectTasksContext { projectId?: string; store?: string; year?: string | number; }
export declare function ensureProjectTasksLoaded(projectCode: string, context?: EnsureProjectTasksContext): Promise<Task[]>;
export declare function findAffectedProjects(tasksToCheck: Partial<Task>[], allProjects?: Project[]): Project[];
export declare function syncAffectedProjects(affectedProjects: Project[], allTasks?: Task[]): Promise<void>;
export declare function saveTaskStateUnified(taskUpdates: (Partial<Task> & { id: string })[], options?: { syncProjects?: boolean; allTasksOverride?: Task[] }): Promise<void>;
export declare function cleanOrphanTasks(tasks: Task[]): { cleaned: Task[]; fixedCount: number };
export declare function reorderTasksStateUnified(allUpdatedTasks: Task[], options?: { affectedProjectIds?: string[]; syncProjects?: boolean }): Promise<void>;
export declare function deleteTaskStateUnified(taskIdsOrTasks: (string | Task)[], options?: { syncProjects?: boolean; skipUndo?: boolean }): Promise<void>;
export declare function deleteProjectStateUnified(projectIdOrCode: string, projectObj?: Project, options?: { skipUndo?: boolean }): Promise<void>;

// src/lib/undoStateHelpers.ts & src/lib/undoManager.ts
export interface UndoAction { description: string; revert: () => Promise<void>; redo?: () => Promise<void>; timestamp?: number; }
export declare const undoManager: { startBatch: (description: string) => void; commitBatch: (skipLog?: boolean) => void; cancelBatch: () => void; push: (action: UndoAction, skipLog?: boolean) => void; undo: () => Promise<void>; redo: () => Promise<void>; clear: () => void; };
export declare function restoreTasksSnapshot(params: { tasksToRestore?: Task[]; taskIdsToDelete?: string[]; delegationsToRestore?: DelegationGroup[]; delegationIdsToDelete?: string[] }): Promise<void>;
export declare function restoreProjectsSnapshot(params: { projectsToRestore?: Project[]; projectIdsToDelete?: string[]; tasksToRestore?: Task[]; costsToRestore?: Cost[]; delegationsToRestore?: DelegationGroup[] }): Promise<void>;
export declare function restoreCostsSnapshot(params: { costsToRestore?: Cost[]; costIdsToDelete?: string[]; projectBudgetMap?: Map<string, number | undefined> }): Promise<void>;

// src/lib/financialAtomicService.ts
export declare function saveCostWithAtomicSummary(projectId: string, newCostData: Cost, oldCostData: Cost | null, budgetHierarchy?: { level3Id?: string; level2Id?: string; level1Id?: string }): Promise<void>;
export declare function deleteCostWithAtomicSummary(projectId: string, costToDelete: Cost, budgetHierarchy?: { level3Id?: string; level2Id?: string; level1Id?: string }): Promise<void>;

// src/lib/deltaSyncService.ts
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

// src/lib/projectDatesService.ts
export interface ComputedProjectDates { computedTakStart?: string; computedTakCompl?: string; computedOpening?: string; computedPlanProgress?: number; computedActProgress?: number; taskCount?: number; taskSummaries?: TaskSummaryItem[]; }
export declare function matchProjectCode(codeA?: string, codeB?: string): boolean;
export declare function getTasksForProject(project: Partial<Project>, allTasks: Task[], options?: { realTasksOnly?: boolean }): Task[];
export declare function calculateProjectComputedDates(project: Partial<Project>, projectTasks: Task[], delegationGroups?: DelegationGroup[]): ComputedProjectDates;
export declare function syncProjectDatesToFirestore(projectId: string, dates: ComputedProjectDates): Promise<void>;
export declare function syncProjectDatesByCode(projectCode: string, projectStore?: string, projectYear?: string | number, overrideTasks?: Task[], targetProjectId?: string): Promise<void>;

// src/lib/auditLogService.ts, storageUtils.ts & r2StorageUtils.ts
export declare function recordAuditLog(log: { action: 'CREATE' | 'UPDATE' | 'DELETE'; entityType?: string; docPath: string; docId: string; data: any; previousData?: any }): Promise<void>;
export declare function extractStorageUrls(item: any): string[];
export declare function deleteStorageFiles(urls: string[]): Promise<void>;
export declare function extractR2ImageKeys(data: any): string[];
export declare function deleteR2StorageFiles(keysOrUrls: string[], customCreds?: any): Promise<{ deletedCount: number; deletedKeys: string[] }>;
export declare function cleanOrphanR2Files(activeData: any, options?: { customCreds?: any; onProgress?: (status: string) => void }): Promise<{ scannedCount: number; deletedCount: number; deletedKeys: string[] }>;
export declare function uploadPictureToTakaFolder(file: File, unitCode?: string, store?: string): Promise<{ success: boolean; publicUrl?: string; error?: string }>;
export declare function deleteR2ImageCleanly(urlOrKey: string, customCreds?: any): Promise<{ success: boolean; deletedKeys: string[] }>;

// src/store/useAppStore.ts & src/store/storeSelectors.ts
export declare const useAppStore: {
  <T>(selector: (state: AppState) => T): T;
  getState: () => AppState;
  setState: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>), replace?: boolean) => void;
  subscribe: (listener: (state: AppState, prevState: AppState) => void) => () => void;
};
export declare function useUISlice<T>(selector: (state: UISlice) => T): T;
export declare function useDataSlice<T>(selector: (state: DataSlice) => T): T;
export declare function useOptimisticSlice<T>(selector: (state: OptimisticSlice) => T): T;
export declare function useStoreShallow<T>(selector: (state: AppState) => T): T;

// src/lib/localDb.ts & src/lib/syncQueue.ts
export interface LocalSyncMeta { key: string; value: string; updatedAt: number; }
export declare function bulkPersistProjects(projects: Project[]): Promise<void>;
export declare function bulkPersistTasks(tasks: Task[]): Promise<void>;
export declare function bulkPersistCosts(costs: Cost[]): Promise<void>;
export declare function bulkPersistDelegations(groups: DelegationGroup[]): Promise<void>;
export declare function upsertLocalRecord(collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations', item: any): Promise<void>;
export declare function patchLocalRecord(collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations', id: string, patch: Record<string, any>): Promise<void>;
export declare function deleteLocalRecord(collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations', id: string): Promise<void>;
export declare function getLocalProjects(year?: string, store?: string): Promise<Project[]>;
export declare function getLocalTasksForProjects(projectIdsOrCodes: string[], year?: string | number | null, store?: string | null): Promise<Task[]>;
export declare function getLocalTasks(year?: string): Promise<Task[]>;
export declare function getLocalCosts(year?: string): Promise<Cost[]>;
export declare function getLocalDelegations(year?: string): Promise<DelegationGroup[]>;
export declare function getLocalDelegationsForProjects(projectIdsOrCodes: string[], year?: string | number | null, store?: string | null): Promise<DelegationGroup[]>;
export declare function getLocalDelegationsForTasks(taskIds: string[]): Promise<DelegationGroup[]>;
export declare function clearDexieDatabase(): Promise<void>;

export interface PendingUpdate { id: string; collectionPath: string; action: 'set' | 'update' | 'delete'; docId: string; data: any; timestamp: number; retryCount?: number; }
export declare function addPendingUpdate(update: Omit<PendingUpdate, 'id' | 'timestamp'>): Promise<any>;
export declare function getPendingUpdates(): Promise<PendingUpdate[]>;
export declare function removePendingUpdate(id: string): Promise<any>;
export declare function clearPendingUpdates(): Promise<any>;
export declare function processPendingSync(): Promise<{ synced: number; failed: number }>;
export declare const syncQueueManager: {
  addToQueue: (collectionName: string, docId: string, action: 'set' | 'update' | 'delete', data: any) => Promise<void>;
  bulkAddToQueue: (items: Array<{ collectionName: string; docId: string; action: 'set' | 'update' | 'delete'; data: any }>) => Promise<void>;
  getQueueStatus: () => Promise<{ totalPending: number; unsynced: number; lastSyncTime: number; isProcessing: boolean; pendingUpdates: Array<{ docId: string; action: string; retryCount: number; collection: string }> }>;
  clearQueue: () => Promise<void>;
  processPendingSync: () => Promise<{ synced: number; failed: number }>;
};

// src/lib/taskInlineUpdateService.ts, commonAndDateUtils.ts, csvExportHabitService.ts, detailTaskImportProjectSync.ts, StemLibrary, Gantt
export interface ExecuteUnifiedTaskUpdateOptions { skipPredecessorRecalc?: boolean; skipProjectRollup?: boolean; showPredecessorToast?: boolean; }
export declare function executeUnifiedTaskUpdate(t: Task, updates: Partial<Task>, currentUser?: AppUser | null, options?: ExecuteUnifiedTaskUpdateOptions): Promise<void>;
export declare function getEffectiveTaskDuration(t?: { duration?: string | number | null; start?: string; finish?: string } | null): string;

export interface CsvMappingPreset { id: string; name: string; tabId: string; mapping: Record<string, string>; keepOriginal: Record<string, boolean>; constantMapping: Record<string, string>; explicitEmptyCols?: Record<string, boolean>; isDefault?: boolean; updatedAt: number; }
export interface CsvTabHabitState { mapping: Record<string, string>; keepOriginal: Record<string, boolean>; constantMapping: Record<string, string>; explicitEmptyCols: Record<string, boolean>; preferredHeaders: Record<string, string[]>; isLocked: boolean; activePresetId: string; }
export declare function loadLocalTabHabit(tabId: string): CsvTabHabitState;
export declare function saveLocalTabHabit(tabId: string, partial: Partial<CsvTabHabitState>): CsvTabHabitState;
export declare function resolveSmartColumnMappingForFile(params: { tabId: string; headers: string[]; currentMapping: Record<string, string>; preferredHeaders: Record<string, string[]>; explicitEmptyCols: Record<string, boolean>; constantMapping: Record<string, string> }): Record<string, string>;

export declare function synchronizeImportedProjectRollups(projectMap: Map<string, Project>, nextTasks: Task[], tasksToUpsert: Task[], deletedIdsSet: Set<string>, tasksToHardDelete: Task[]): Promise<void>;

export type StemConnectorType = 'FS' | 'SS' | 'FF' | 'NONE';
export type StemDepartmentId = 'prep_bql' | 'mep_pccc' | 'interior_hoarding' | 'it_pos_handover';
export type StemAnchorMode = 'forward' | 'backward';
export interface StemWorkbenchBlock { instanceId: string; templateId: string; name: string; duration: number; department: StemDepartmentId; party: string; delegation: boolean; connectorToPrev: StemConnectorType; lagDays: number; customStart?: string; computedStart?: string; computedFinish?: string; previewCode?: string; }
export declare function computeWorkbenchSchedule(blocks: StemWorkbenchBlock[], project: Project | null, allTasks: Task[], anchorMode: StemAnchorMode, customAnchorDate?: string): any;
export declare function applyStemWorkbenchToProject(params: { project: Project; computedBlocks: StemWorkbenchBlock[]; userEmail?: string }): Promise<{ createdTasks: Task[]; createdDelegationCount: number }>;

export declare function isCyclic(targetTaskId: string, candidatePredecessor: Task, allTasks: Task[], projects: Project[]): boolean;
export type GanttAnchorSide = 'start' | 'end';
export declare function startGanttLinkDrag(e: any, params: { taskId: string; taskCode?: string; taskName: string; anchor: GanttAnchorSide }): void;




