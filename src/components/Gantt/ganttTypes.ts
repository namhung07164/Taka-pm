import { Project, Task, AppUser } from '../../types';

export interface GanttTabProps {
  onNavigateToTaskDetail?: (taskId: string) => void;
  onNavigateToLayout?: (
    store: string,
    location: string,
    projectCode?: string,
    sourceTaskId?: string,
  ) => void;
  initialFocusTaskId?: string;
  printDateRangeOverride?: { start: Date; end: Date };
  onClearFocus?: () => void;
}

export type ViewMode = 'weekly' | 'monthly' | 'quarterly';

export interface TimeUnit {
  date: Date;
  label: string;
  labelPrimary?: string;
  labelSecondary?: string;
  days: number;
}

export interface DependencyLine {
  id?: string;
  d: string;
  arrowDir?: string;
  color?: string;
  isAnimated?: boolean;
  fromTaskId?: string;
  toTaskId?: string;
  fromTaskCode?: string;
  fromTaskName?: string;
  toTaskCode?: string;
  toTaskName?: string;
}

export type GanttTableRow = 
  | {
      type: 'project';
      key: string;
      project: Project;
      projectIndex: number;
      isExpanded: boolean;
      isHidden: boolean;
    }
  | {
      type: 'task';
      key: string;
      task: Task;
      taskIndex?: number;
      project: Project;
      parentTask?: Task;
      isChild: boolean;
      hasChildren: boolean;
      childCount: number;
      childTasks?: Task[];
      isModularExpanded: boolean;
      isHidden: boolean;
    };
