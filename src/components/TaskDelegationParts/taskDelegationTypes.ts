import { DelegationGroup, Project, Task } from '../../types';

export interface TaskDelegationTabProps {
  onBackFromFocus?: () => void;
}

export type DelegatableItem = {
  type: 'project' | 'task';
  id: string;
  name: string;
  projectCode: string;
  projectStore?: string;
  projectYear?: number | string;
  projectName?: string;
  party?: string;
};

export const AVAILABLE_COLUMNS = [
  { id: 'expand', label: 'Expand' },
  { id: 'taskName', label: 'Task / Delegation' },
  { id: 'projectCode', label: 'Project Code' },
  { id: 'comments', label: 'Comments' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'party', label: 'PIC' },
  { id: 'actions', label: 'Actions' }
];

export interface DelegationColWidths {
  expand: number;
  taskName: number;
  projectCode: number;
  comments: number;
  status: number;
  startAct: number;
  finishAct: number;
  priority: number;
  party: number;
  actions: number;
}

export const resolveGroupParentProject = (
  group: DelegationGroup,
  projects: any[],
  tasks: any[]
): Project | undefined => {
  const parentTask = group.parentTaskId ? tasks.find((t) => t.id === group.parentTaskId) : null;
  const ps = group.projectStore || parentTask?.projectStore;
  const py = group.projectYear || parentTask?.projectYear;

  return projects.find(
    (p) =>
      ((group.parentTaskId && p.code === group.parentTaskId) ||
        (group.projectCode && p.code === group.projectCode)) &&
      (ps ? String(p.store) === String(ps) : true) &&
      (py ? String(p.year) === String(py) : true)
  );
};

export const computeFallbackYear = (
  yearVal?: number | string | null,
  parentProject?: Project | null,
  globalYearFilter?: string
): number => {
  if (yearVal !== undefined && yearVal !== null && !isNaN(Number(yearVal))) {
    return Number(yearVal);
  }
  if (parentProject?.year && !isNaN(Number(parentProject.year))) {
    return Number(parentProject.year);
  }
  if (globalYearFilter && globalYearFilter !== 'all' && !isNaN(Number(globalYearFilter))) {
    return Number(globalYearFilter);
  }
  return new Date().getFullYear();
};
