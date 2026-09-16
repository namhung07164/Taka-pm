import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Project, Task, AppUser, DelegationGroup, NotificationRule, ActiveNotification } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ACTIVE_YEARS = ['2023', '2024', '2025', '2026', '2027', '2028'];
export const ARCHIVED_YEARS = ['2021', '2022'];

export function parseDateTime(d?: string | Date | null): Date {
  if (!d) return new Date();
  if (d instanceof Date) return d;
  const str = String(d).trim();
  if (!str) return new Date();
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;
  return new Date();
}

export function formatToDatetimeLocal(d?: Date | string | null): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!date || isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatDisplayDateTime(d?: string | null): string {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDisplayDateMain(d?: string | null): string {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function getDefaultDatetimeLocal(): string {
  return formatToDatetimeLocal(new Date());
}

export function calculateDays(start?: string | null, finish?: string | null): number {
  if (!start || !finish) return 1;
  const s = new Date(start).getTime();
  const f = new Date(finish).getTime();
  if (isNaN(s) || isNaN(f)) return 1;
  const diff = Math.ceil((f - s) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 1;
}

export function getStatus(
  arg1?: any,
  arg2?: any,
  arg3?: any,
  arg4?: any,
  ..._rest: any[]
): string {
  let start: string | undefined;
  let finish: string | undefined;
  let isCompleted: boolean | undefined;
  let actFinish: string | undefined;
  let approval: string | undefined;

  if (arg1 && typeof arg1 === 'object') {
    start = arg1.start;
    finish = arg1.finish;
    isCompleted = arg1.isCompleted || arg1.status === 'Completed';
    actFinish = arg1.actFinish;
    approval = arg1.approval;
  } else {
    start = arg1;
    finish = arg2 ?? undefined;
    if (typeof arg3 === 'boolean') {
      isCompleted = arg3;
    } else if (typeof arg3 === 'string') {
      if (arg3 === 'Approved' || arg3 === 'Completed') isCompleted = true;
      else approval = arg3;
    }
    actFinish = typeof arg4 === 'string' ? arg4 : undefined;
  }

  if (isCompleted || actFinish || approval === 'Approved') return 'COMPLETED';
  const now = new Date();
  if (finish) {
    const fDate = new Date(finish);
    if (!isNaN(fDate.getTime()) && fDate < now) return 'OVERDUE';
  }
  if (start) {
    const sDate = new Date(start);
    if (!isNaN(sDate.getTime()) && sDate <= now) return 'IN_PROGRESS';
  }
  return 'NOT_STARTED';
}

export function getTaskStatus(
  arg1?: any,
  arg2?: any,
  arg3?: any,
  arg4?: any,
  ..._rest: any[]
): string {
  const st = getStatus(arg1, arg2, arg3, arg4);
  if (st === 'COMPLETED') return 'Completed';
  if (st === 'IN_PROGRESS') return 'On process';
  if (st === 'OVERDUE') return 'Delayed';
  return 'Upcoming';
}

export interface StatusInfo {
  label: string;
  color: string;
  toString: () => string;
}

export function resolveActualStatus(taskOrPlStatus?: any, subTasks?: any[], ..._rest: any[]): StatusInfo & string {
  let label = 'Not Started';
  let color = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';

  if (Array.isArray(subTasks) && subTasks.length > 0) {
    const allDone = subTasks.every(st => st.status === 'Completed' || st.delegationStatus === 'Completed');
    const anyProgress = subTasks.some(st => st.status === 'In Progress' || st.delegationStatus === 'In Progress' || st.status === 'Completed' || st.delegationStatus === 'Completed');
    if (allDone) {
      label = 'Completed';
      color = 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800';
    } else if (anyProgress) {
      label = 'In Progress';
      color = 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800';
    } else {
      label = 'Upcoming';
      color = 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800';
    }
  } else if (typeof taskOrPlStatus === 'string') {
    label = taskOrPlStatus;
    if (label === 'Completed') color = 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800';
    else if (label === 'In Progress' || label === 'On process') color = 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800';
    else if (label === 'Delayed' || label === 'OVERDUE') color = 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800';
    else color = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  } else if (taskOrPlStatus && typeof taskOrPlStatus === 'object') {
    if (taskOrPlStatus.isCompleted || taskOrPlStatus.actFinish || taskOrPlStatus.approval === 'Approved') {
      label = 'Completed';
      color = 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800';
    } else if (taskOrPlStatus.runningStatus) {
      label = taskOrPlStatus.runningStatus;
      if (label === 'Completed') color = 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800';
      else if (label === 'On process' || label === 'In Progress') color = 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800';
      else if (label === 'Delayed') color = 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800';
      else color = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    } else {
      const st = getStatus(taskOrPlStatus);
      if (st === 'COMPLETED') {
        label = 'Completed';
        color = 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800';
      } else if (st === 'IN_PROGRESS') {
        label = 'In Progress';
        color = 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-800';
      } else if (st === 'OVERDUE') {
        label = 'Delayed';
        color = 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800';
      } else {
        label = 'Upcoming';
        color = 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800';
      }
    }
  }

  const res: any = new String(label);
  res.label = label;
  res.color = color;
  res.toString = () => label;
  return res;
}

export function computeActProgressPercent(task?: any, ..._rest: any[]): number {
  if (!task) return 0;
  if (task.isCompleted || task.actFinish) return 100;
  if (task.computedActProgress !== undefined && typeof task.computedActProgress === 'number') return task.computedActProgress;
  return 0;
}

export function computePlanProgressPercent(task?: any, ..._rest: any[]): number {
  if (!task) return 0;
  if (task.computedPlanProgress !== undefined && typeof task.computedPlanProgress === 'number') return task.computedPlanProgress;
  return 0;
}

export function ensureUrlProtocol(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getSuggestedCompletionTime(start?: string | null, finish?: string | null): string {
  if (finish) return formatDisplayDateTime(finish);
  if (start) return formatDisplayDateTime(start);
  return '-';
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export function getUserAllowedStores(currentUser: any): string[] {
  if (!currentUser) return ['HCM', 'HN'];
  if (currentUser.role === 'admin') return ['HCM', 'HN'];
  const stores: string[] = [];
  if (currentUser.storePermissions?.hcm) stores.push('HCM');
  if (currentUser.storePermissions?.hn) stores.push('HN');
  return stores.length > 0 ? stores : ['HCM', 'HN'];
}

export function getEffectiveStoreFilter(userFilter: string, _currentUser: any): string {
  if (!userFilter) return 'All';
  return userFilter;
}

export function getDefaultStoreFilter(currentUser: any): string {
  if (!currentUser) return 'All';
  if (currentUser.preferences?.defaultStore) return currentUser.preferences.defaultStore;
  const allowed = getUserAllowedStores(currentUser);
  if (allowed.length === 1) return allowed[0];
  return 'All';
}

export function matchesAdvancedSearch(item?: any, searchQuery?: any, ..._rest: any[]): boolean {
  if (!searchQuery) return true;
  const qStr = typeof searchQuery === 'string' ? searchQuery.toLowerCase().trim() : '';
  if (!qStr) return true;
  if (!item) return false;
  const searchInObj = (obj: any): boolean => {
    if (!obj) return false;
    if (typeof obj === 'string' || typeof obj === 'number') {
      return String(obj).toLowerCase().includes(qStr);
    }
    if (Array.isArray(obj)) {
      return obj.some(el => searchInObj(el));
    }
    if (typeof obj === 'object') {
      return Object.values(obj).some(val => searchInObj(val));
    }
    return false;
  };
  return searchInObj(item);
}

export function getUserDelegationRoleForTask(_task?: any, user?: any, ..._rest: any[]): string {
  if (!user) return '';
  if (user.role === 'admin') return 'Admin';
  return 'Member';
}

export function enrichProjects(projects?: any[], tasks?: any[], ..._rest: any[]): Project[] {
  if (!projects) return [];
  const tasksByProject = new Map<string, Task[]>();
  (tasks || []).forEach((t) => {
    const key = `${String(t.projectCode || "").trim().toLowerCase()}-${String(t.projectYear || "").trim()}-${String(t.projectStore || "").trim().toLowerCase()}`;
    if (!tasksByProject.has(key)) tasksByProject.set(key, []);
    tasksByProject.get(key)!.push(t);
  });

  return projects.map((p) => {
    const key = `${String(p.code || "").trim().toLowerCase()}-${String(p.year || "").trim()}-${String(p.store || "").trim().toLowerCase()}`;
    const pTasks = tasksByProject.get(key) || [];
    const taskCount = pTasks.length;
    const computedTakStart = pTasks.length > 0 ? pTasks.map(t => t.start).filter(Boolean).sort()[0] || p.start : p.start;
    const computedTakCompl = pTasks.length > 0 ? pTasks.map(t => t.finish).filter(Boolean).sort((a,b) => (b||'').localeCompare(a||''))[0] || p.handover : p.handover;
    
    return {
      ...p,
      taskCount,
      computedTakStart,
      computedTakCompl,
    };
  });
}

export function calculateActiveNotifications(..._args: any[]): ActiveNotification[] {
  return [];
}

export function scrollToElement(target?: any): void {
  if (!target) return;
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export function formatCurrencyValue(
  val?: number | string | null,
  currency: string = 'VND',
  jpyRate: number = 1,
  usdRate: number = 1,
  ..._rest: any[]
): string {
  if (val === null || val === undefined || val === '') return '0';
  let num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
  if (isNaN(num)) return '0';

  if (currency === 'JPY' && jpyRate > 0) {
    num = num / jpyRate;
  } else if (currency === 'USD' && usdRate > 0) {
    num = num / usdRate;
  }

  return num.toLocaleString('en-US', { maximumFractionDigits: currency === 'VND' ? 0 : 2 });
}

export function autoFormatRow(row: any): any {
  if (!row || typeof row !== 'object') return row;

  const newRow = { ...row };
  for (const key in newRow) {
    if (Object.prototype.hasOwnProperty.call(newRow, key)) {
      const val = newRow[key];
      if (typeof val === 'string') {
        const lowerKey = key.toLowerCase();
        
        // Auto-format dates
        if (lowerKey.includes('date') || lowerKey.includes('ngày') || lowerKey.includes('ngay') || lowerKey.includes('time') || lowerKey.includes('update')) {
          newRow[key] = standardizeDateToMMDDYYYY(val);
        }
        
        // Auto-format phone numbers
        if (lowerKey.includes('phone') || lowerKey.includes('điện thoại') || lowerKey.includes('sđt') || lowerKey.includes('sdt') || lowerKey.includes('tel')) {
          let cleaned = val.replace(/\D/g, '');
          if (cleaned.startsWith('84') && cleaned.length >= 10) {
            cleaned = '0' + cleaned.substring(2);
          } else if (cleaned.length >= 9 && !cleaned.startsWith('0')) {
             if (cleaned.length === 9) cleaned = '0' + cleaned;
          }
          if (cleaned) {
             newRow[key] = cleaned;
          }
        }
      }
    }
  }
  return newRow;
}

export function standardizeDateToMMDDYYYY(dateStr: string): string {
  if (!dateStr) return '';
  const str = String(dateStr).trim();

  // YYYY-MM-DD matches
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = str.split('-');
    return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
  }

  // Slash or dash combinations
  if (str.includes('/') || str.includes('-')) {
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      let m, d, y;

      if (parts[2].length === 4) {
        // Always enforce incoming as MM/DD/YYYY if year is last
        m = parts[0];
        d = parts[1];
        y = parts[2];
      } else if (parts[0].length === 4) {
        // YYYY/MM/DD
        y = parts[0];
        m = parts[1];
        d = parts[2];
      }
      
      if (m && d && y) {
        return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
      }
    }
  }

  return str;
}

