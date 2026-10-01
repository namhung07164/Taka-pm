import { Project, Task } from '../../types';

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
    };
