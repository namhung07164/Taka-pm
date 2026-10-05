import { AuditLog } from '../../types';

export interface AuditLogTabProps {}

export type AuditActionFilter = 'ALL' | 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditEntityFilter = 'ALL' | 'project' | 'task' | 'cost' | 'delegation' | 'user';

export const PAGE_SIZE = 20;

export const getActionColor = (action: string) => {
  switch (action) {
    case 'CREATE':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300';
    case 'UPDATE':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300';
    case 'DELETE':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-300';
  }
};

export const getEntityBadgeColor = (entity?: string) => {
  switch (entity) {
    case 'project':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300';
    case 'task':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300';
    case 'cost':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300';
    case 'user':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300';
    case 'delegation':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300';
  }
};
