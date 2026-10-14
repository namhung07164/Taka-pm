export interface FinancialMetric {
  totalBudget: number;
  totalApproved: number;
  totalActualPaid: number;     // Lũy kế các đợt có status === 'Actual'
  totalForecastPaid: number;   // Lũy kế các đợt có status === 'Forecast'
  totalBalance: number;        // Còn lại = totalApproved - (totalActualPaid + totalForecastPaid)
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
  isDeleted?: boolean;
  predecessors?: TaskPredecessor[]; // Lưu trữ danh sách Hard Link dưới dạng mảng Object
  predecessorTaskIds?: string[]; // IDs of tasks mentioned in the predecessor string
}

export type PredecessorType = 'FS' | 'SS' | 'FF' | 'SF';

export interface TaskPredecessor {
  taskId: string;
  type: PredecessorType;
}

export interface Cost {
  id: string;
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

export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
  Manager: {
    See: { general: false, detail: false, calendar: true, budget: false, costDetail: false, report: true, summary: true, taskDelegation: false, layout: true, pictureMapping: false, importCsv: false },
    Write: { general: true, detail: true, calendar: false, budget: false, costDetail: false, report: false, summary: false, taskDelegation: false, layout: false, pictureMapping: false, importCsv: false }
  },
  Staff: {
    See: { general: true, detail: true, calendar: false, budget: false, costDetail: false, report: true, summary: true, taskDelegation: false, layout: true, pictureMapping: false, importCsv: false },
    Write: { general: false, detail: false, calendar: true, budget: false, costDetail: false, report: false, summary: false, taskDelegation: false, layout: false, pictureMapping: false, importCsv: false }
  },
  External: {
    See: { general: false, detail: false, calendar: false, budget: false, costDetail: false, report: false, summary: false, taskDelegation: false, layout: false, pictureMapping: false, importCsv: false },
    Write: { general: false, detail: false, calendar: false, budget: false, costDetail: false, report: false, summary: false, taskDelegation: false, layout: false, pictureMapping: false, importCsv: false }
  },
  CP: {
    See: { general: false, detail: false, calendar: true, budget: false, costDetail: false, report: true, summary: true, taskDelegation: false, layout: true, pictureMapping: false, importCsv: false },
    Write: { general: true, detail: true, calendar: false, budget: true, costDetail: true, report: false, summary: false, taskDelegation: false, layout: false, pictureMapping: false, importCsv: false }
  }
};

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
  projectCode?: string;
  projectStore?: string;
  projectYear?: string | number;
  action?: 'cross_year_rollover' | 'complete_task' | 'approve_delegation';
  actionData?: any;
  priority?: NotificationPriority;
  isAssignedToMe?: boolean;
  party?: string;
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
  parentTaskId?: string; // ID of the taka_task if linked
  name: string; // Custom name if not linked, or task name if linked
  projectCode?: string; // If linked
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
  data?: Record<string, any>;
  isPatch?: boolean;
  /** Signal-only item: receivers re-read this doc from the server (used for writes that carry no patch). */
  invalidate?: boolean;
}

export interface TakaDelta {
  id: string;
  docId?: string;
  collectionName?: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations';
  action: 'create' | 'update' | 'delete' | 'batch_update';
  year?: string;
  data?: Record<string, any>;
  isPatch?: boolean;
  batchItems?: TakaDeltaItem[];
  updatedBy?: string;
  sessionId?: string;
  timestamp: string;
  numericTime: number;
  /** Server arrival time (Firestore serverTimestamp). Sync cursor: immune to device clocks and offline delays. */
  serverTime?: any;
  /** Firestore TTL policy timestamp: documents expire automatically without client-side reads */
  expireAt?: any;
}

