import { Project, Task, DelegationGroup, DelegationSubTask } from '../../types';

export type MyWorkTabView = 'today' | 'inbox' | 'upcoming' | 'done';

export type UnifiedWorkItemType = 'task' | 'delegation_subtask' | 'project_milestone';

export type WorkItemPriority = 'critical' | 'high' | 'medium' | 'low';

export interface UnifiedWorkItem {
  id: string;
  type: UnifiedWorkItemType;
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
  isCompleted: boolean;
  isOverdue: boolean;
  isNeedsRework: boolean;
  isAwaitingMyApproval: boolean;
  isPIC: boolean;
  isApprover: boolean;
  party: string;
  milestoneKind?: 'Start' | 'Handover' | 'Opening';
  rawTask?: Task;
  rawProject?: Project;
  rawDelegationGroup?: DelegationGroup;
  rawSubTask?: DelegationSubTask;
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
}

export interface MyWorkScopeMode {
  onlyMine: boolean;
}
