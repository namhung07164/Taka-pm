import { Project, Task, DelegationGroup, DelegationSubTask } from '../../types';

export type MyWorkTabView = 'today' | 'inbox' | 'upcoming' | 'done';

export type MyWorkDisplayMode = 'kanban' | 'list';

export type MyWorkKanbanColumnId = 'todo' | 'in_progress' | 'pending_approval' | 'done';

export type MyWorkTimeFilter =
  | 'all'
  | 'today_focus'
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'overdue'
  | 'upcoming';

export type UnifiedWorkItemType = 'task' | 'delegation_subtask' | 'project_milestone';

export type WorkItemPriority = 'critical' | 'high' | 'medium' | 'low';

export interface UnifiedWorkItem {
  id: string;
  type: UnifiedWorkItemType;
  kanbanColumn: MyWorkKanbanColumnId;
  title: string;
  subtitle?: string;
  projectId?: string;
  projectCode: string;
  projectName: string;
  projectStore: string;
  projectYear: number | string;
  floor?: string;
  dueDateStr: string;
  startDateStr?: string;
  dueDiffDays: number | null;
  friendlyDueLabel: string;
  priority: WorkItemPriority;
  statusLabel: string;
  flowStatusLabel?: string;
  isCompleted: boolean;
  isOverdue: boolean;
  isNeedsRework: boolean;
  isInProgress: boolean;
  isAwaitingMyApproval: boolean;
  isPIC: boolean;
  isCreator: boolean;
  isApprover: boolean;
  canEdit: boolean;
  canAccept: boolean;
  canSubmitApproval: boolean;
  canApproveOrReject: boolean;
  party: string;
  commentCount: number;
  attachmentCount: number;
  reportSnippet?: string;
  milestoneKind?: 'Start' | 'Handover' | 'Opening';
  rawTask?: Task;
  rawProject?: Project;
  rawDelegationGroup?: DelegationGroup;
  rawSubTask?: DelegationSubTask;
  rawSummaryId?: string;
  isSummaryFallback?: boolean;
  isFocusedTarget?: boolean;
}

export interface MyWorkFocusTarget {
  projectId?: string;
  projectCode: string;
  projectName?: string;
  projectStore?: string;
  projectYear?: number | string;
  taskId?: string;
  taskName?: string;
  taskCode?: string;
  ts?: number;
}

export interface MyWorkCounts {
  today: number;
  inbox: number;
  upcoming: number;
  done: number;
  overdue: number;
  todayTodo: number;
  allActive: number;
  todayFocus: number;
  todayOnly: number;
  thisWeek: number;
  thisMonth: number;
  future: number;
}

export interface MyWorkBriefingStats {
  totalActiveTasks: number;
  criticalUrgentCount: number;
  highPriorityCount: number;
  normalActiveCount: number;
  upcomingMilestonesCount: number;
  dueThisWeekCount: number;
  delegationsActiveCount: number;
  delegationsMyPICCount: number;
  pendingMyApprovalCount: number;
  needsReworkCount: number;
}
