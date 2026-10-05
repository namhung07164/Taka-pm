import { DelegationGroup, DelegationSubTask } from '../../types';

export interface DelegationCalendarTabProps {
  groups: DelegationGroup[];
  onTabChange: (tabId: string) => void;
}

export interface DelegationCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: {
    group: DelegationGroup;
    subTask: DelegationSubTask;
    isStartNode?: boolean;
    isFinishNode?: boolean;
    projectName?: string;
    currentView?: string;
  };
  colorIndex?: number;
}
