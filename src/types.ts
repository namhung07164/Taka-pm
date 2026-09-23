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
  taskSummaries?: { name: string; start: string; finish: string; }[];
  realtimeUpdate?: boolean;
  delegation?: boolean;
  updatedAt?: string;
  textColor?: string;
  comments?: TaskComment[];
  mdStatus?: string;
  isPinned?: boolean;
  pinnedOrder?: number;
  parentId?: string;
  financial?: ProjectFinancialSummary;
  isDeleted?: boolean;
}

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
  projectCode: string;
  projectYear?: number | string;
  projectStore?: string;
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
  action?: 'cross_year_rollover';
  actionData?: any;
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
