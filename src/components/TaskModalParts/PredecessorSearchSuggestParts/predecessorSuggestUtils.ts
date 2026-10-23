import { Task, Project, PredecessorType } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import {
  buildTaskNoMap,
  parsePredecessors,
  splitPredecessors,
  calculateTaskDatesFromPredecessors,
  scheduleDependentTasks,
  addDays,
} from '../../../lib/ganttUtils';
import { ProjectDiffDetails } from '../../../lib/predecessorMatchUtils';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../../lib/firestoreWrites';
import { db, APP_ID } from '../../../lib/firebase';

export interface PredecessorChange {
  /** Chuỗi predecessor chuẩn của hệ thống, ví dụ: "A01#2SS+1, A01#3FF" */
  predecessor: string;
  /** ID task tương ứng theo đúng thứ tự trong chuỗi (hard-link, tránh nhầm task trùng mã) */
  predecessorTaskIds: string[];
  /** Mảng object (giữ tương thích với dữ liệu cũ) */
  predecessors: { taskId: string; type: PredecessorType }[];
}

export interface LinkItem {
  key: string;
  resolved: boolean;
  taskId: string;
  task?: Task;
  code: string;
  type: PredecessorType;
  lagSign: '+' | '-';
  lagValue: number;
  raw: string;
  isExternal: boolean;
  externalLabel: string;
}

export const REL_INFO: Record<PredecessorType, { hint: string }> = {
  FS: { hint: 'Finish → Start' },
  SS: { hint: 'Start → Start' },
  FF: { hint: 'Finish → Finish' },
  SF: { hint: 'Start → Finish' },
};

export const SLOT_STYLE = [
  {
    tag: '①',
    title: 'Primary Predecessor',
    border: 'border-l-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    active: 'bg-blue-600 text-white border-blue-600 shadow-sm',
    caption: 'text-blue-700 dark:text-blue-300',
  },
  {
    tag: '②',
    title: 'Secondary Predecessor · FF / SF only',
    border: 'border-l-rose-500',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    active: 'bg-rose-600 text-white border-rose-600 shadow-sm',
    caption: 'text-rose-700 dark:text-rose-300',
  },
];

const FACTOR_LABEL: Record<string, string> = {
  year: 'Different year',
  store: 'Different store',
  location: 'Different floor/location',
  code: 'Different project',
};

export function externalLabel(diff?: ProjectDiffDetails, fallbackCode?: string): string {
  const factors = (diff as any)?.diffFactors as string[] | undefined;
  if (factors && factors.length > 0) {
    return factors.map((f) => FACTOR_LABEL[f] || f).join(' · ');
  }
  return fallbackCode ? `Project ${fallbackCode}` : 'Cross-Project';
}

export function shortDate(s?: string): string {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : String(s);
}

export function lagToText(sign: string, v: number): string {
  return v ? `${sign}${v}` : '';
}

export function tokenOf(it: LinkItem): string {
  if (!it.resolved) return it.raw;
  const lag = lagToText(it.lagSign, it.lagValue);
  const rel = it.type === 'FS' && !lag ? '' : it.type;
  return `${it.code}${rel}${lag}`;
}

/** Secondary predecessor must be FF or SF */
export function normalize(list: LinkItem[]): LinkItem[] {
  return list.slice(0, 2).map((it, i) =>
    i === 1 && it.resolved && it.type !== 'FF' && it.type !== 'SF' ? { ...it, type: 'FF' as PredecessorType } : it
  );
}

export function describe(it: LinkItem): string {
  if (!it.task) return '';
  const name = `«${it.task.name}»`;
  const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;
  const lag = signed === 0 ? '' : signed > 0 ? `, +${signed} days` : `, -${Math.abs(signed)} days`;
  switch (it.type) {
    case 'FS':
      return `Start after ${name} finishes${lag}`;
    case 'SS':
      return `Start when ${name} starts${lag}`;
    case 'FF':
      return `Finish when ${name} finishes${lag}`;
    case 'SF':
      return `Finish when ${name} starts${lag}`;
  }
  return '';
}

export function milestoneDate(it: LinkItem): string {
  if (!it.task) return '';
  const ref = it.type === 'FS' || it.type === 'FF' ? it.task.finish : it.task.start;
  if (!ref) return '';
  const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;
  try {
    return shortDate(addDays(ref, signed));
  } catch {
    return shortDate(ref);
  }
}

export async function persistDefault(
  source: Task,
  change: PredecessorChange,
  projects: Project[]
): Promise<void> {
  if (!source?.id) {
    throw new Error('Please save the task before linking a predecessor.');
  }
  const store = useAppStore.getState() as any;
  let currentTasks: Task[] = store.tasks || [];
  const now = new Date().toISOString();

  const updatedTask: Task = {
    ...source,
    predecessor: change.predecessor,
    predecessorTaskIds: change.predecessorTaskIds,
    predecessors: change.predecessors,
    realtimeUpdate: Boolean(change.predecessor.trim()),
    updatedAt: now,
  } as Task;

  let taskNoMap = buildTaskNoMap(projects, currentTasks);
  let parsed = parsePredecessors(change.predecessor, taskNoMap, updatedTask);

  if (change.predecessor.trim() && (!parsed.length || parsed.some((p) => !p.task))) {
    const parts = splitPredecessors(change.predecessor, Array.from(taskNoMap.keys()));
    const { normalizeDashes } = await import('../../../lib/utils');
    const { ensureProjectTasksLoaded } = await import('../../../lib/taskStateService');
    for (const token of parts) {
      const cleanToken = normalizeDashes(token).replace(/(fs|ss|ff|sf|[+-]\s*\d+|\s+\d+)$/i, '').trim();
      const matchedProj = projects.find(
        (p) =>
          p.code &&
          cleanToken.toLowerCase().startsWith(normalizeDashes(p.code).toLowerCase())
      );
      if (matchedProj && (matchedProj.id !== source.projectId || matchedProj.code !== source.projectCode)) {
        const loaded = await ensureProjectTasksLoaded(matchedProj.code, {
          projectId: matchedProj.id,
          store: matchedProj.store,
          year: matchedProj.year,
        });
        if (loaded.length > 0) {
          currentTasks = (useAppStore.getState() as any).tasks || currentTasks;
          taskNoMap = buildTaskNoMap(projects, currentTasks);
          parsed = parsePredecessors(change.predecessor, taskNoMap, updatedTask);
        }
      }
    }
  }

  if (parsed.length >= 2) updatedTask.durationManual = false;

  const calc = calculateTaskDatesFromPredecessors(updatedTask, parsed as any);
  if (calc) {
    updatedTask.start = calc.start;
    updatedTask.finish = calc.finish;
    updatedTask.duration = calc.duration;
    updatedTask.durationManual = calc.durationManual;
  }

  const dependents = scheduleDependentTasks(updatedTask, currentTasks, projects);

  const map = new Map<string, Task>(currentTasks.map((t) => [t.id, t]));
  map.set(updatedTask.id, updatedTask);
  dependents.forEach((u: any) => {
    const t = map.get(u.id);
    if (t) {
      map.set(u.id, { ...t, start: u.start, finish: u.finish, duration: u.duration, updatedAt: u.updatedAt });
    }
  });
  store.setTasks(Array.from(map.values()));

  const editing = store.editingTask;
  if (editing && editing.id === updatedTask.id && typeof store.setEditingTask === 'function') {
    store.setEditingTask({ ...editing, ...updatedTask });
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', updatedTask.id), updatedTask as any, { merge: true });
  dependents.forEach((u: any) => {
    batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', u.id), u, { merge: true });
  });
  batch.commit().catch((err: any) => {
    console.error('Failed to persist predecessor update:', err);
    store.setToast?.({ title: 'Save failed', message: err?.message || 'Could not save predecessor', type: 'error' });
  });

  store.setToast?.({
    title: 'Predecessor Updated',
    message: change.predecessor ? `Link: ${change.predecessor}` : 'Predecessor removed',
    type: 'success',
  });
}
