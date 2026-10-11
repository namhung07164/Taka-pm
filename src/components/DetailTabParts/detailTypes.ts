import { Project, Task } from '../../types';

// Enterprise Table Virtualization (Virtual Windowing)
export type DetailTableRow = 
  | {
      type: 'project';
      key: string;
      project: Project;
      projectIndex: number;
      effectiveTaskCount: number;
      isExpanded: boolean;
      groupTasks: Task[];
      isProjDelegationOn: boolean;
      planProgressPercent: number;
      actProgressPercent: number;
    }
  | {
      type: 'task';
      key: string;
      task: Task;
      taskIndex: number;
      project: Project;
      projectIndex: number;
      groupTasks: Task[];
      isProjDelegationOn?: boolean;
    };

export interface DetailTabProps {
  initialFilterCode?: string;
  initialStoreFilter?: string;
  initialFocusTaskId?: string;
  returnScrollId?: string;
  onClearFocus?: () => void;
  onBackToGantt?: () => void;
  onAddProject: () => void;
  onAddTask: (p?: Project | null) => void;
  onEditTask: (t: Task, isReadOnly?: boolean, initialTab?: string) => void;
  onEditProject?: (p: Project, isReadOnly?: boolean, initialTab?: string) => void;
  onNavigateToDelegation?: (groupId: string, sourceTaskId?: string) => void;
}

export const AVAILABLE_COLUMNS = [
  { id: 'no', label: 'No' },
  { id: 'year', label: 'Year' },
  { id: 'store', label: 'Store' },
  { id: 'location', label: 'Location' },
  { id: 'code', label: 'Code' },
  { id: 'projectName', label: 'Project Name' },
  { id: 'taskName', label: 'Task Name' },
  { id: 'duration', label: 'Duration' },
  { id: 'start', label: 'Start' },
  { id: 'finish', label: 'Finish' },
  { id: 'predecessor', label: 'Predecessor' },
  { id: 'party', label: 'Party' },
  { id: 'action', label: 'Action' }
];

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DraggingTaskState {
  draggingTaskIds: string[];
  draggingTaskNames: string;
  dragOverTaskId: string | null;
  dropPosition: 'before' | 'after' | null;
}
