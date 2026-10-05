import { Project, Task } from '../../types';

export interface CalendarTabProps {
  onEditTask: (t: Task, isReadOnly?: boolean) => void;
  onEditProject: (p: Project, isReadOnly?: boolean) => void;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: any;
  type: 'project' | 'task';
  subType?: 'start' | 'finish';
  colorIndex?: number;
  color?: string;
}
