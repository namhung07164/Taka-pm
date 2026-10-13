import React, { Component, FC, memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Task, Project, PredecessorType } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../lib/utils';
import {
  buildTaskNoMap,
  computeTaskCode,
  parsePredecessors,
  splitPredecessors,
  calculateTaskDatesFromPredecessors,
  scheduleDependentTasks,
  addDays,
} from '../../lib/ganttUtils';
import {
  rankCandidateTasks,
  getTaskProjectDiffDetails,
  parsePredecessorToken,
  PredecessorContext,
  ProjectDiffDetails,
  RankedPredecessorMatch,
} from '../../lib/predecessorMatchUtils';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import {
  Search,
  X,
  Plus,
  Minus,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  Loader2,
  ArrowRight,
  Link2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PredecessorChange {
  /** Chuỗi predecessor chuẩn của hệ thống, ví dụ: "A01#2SS+1, A01#3FF" */
  predecessor: string;
  /** ID task tương ứng theo đúng thứ tự trong chuỗi (hard-link, tránh nhầm task trùng mã) */
  predecessorTaskIds: string[];
  /** Mảng object (giữ tương thích với dữ liệu cũ) */
  predecessors: { taskId: string; type: PredecessorType }[];
}

interface PredecessorSearchSuggestProps {
  /** Task đang sửa (hoặc bản nháp của task mới – id có thể rỗng) */
  task: Task;
  canWrite: boolean;
  /**
   * Nếu truyền vào: component KHÔNG tự lưu, mà trả kết quả cho nơi gọi xử lý
   * (dùng cho Task Modal – lưu khi bấm Save, và cho bảng Detail – đi qua onUpdateTask).
   * Nếu không truyền: tự tính lại ngày, kéo theo task phụ thuộc và lưu Firestore.
   */
  onChange?: (change: PredecessorChange) => void | Promise<void>;
}

interface LinkItem {
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

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const REL_INFO: Record<PredecessorType, { hint: string }> = {
  FS: { hint: 'Finish → Start' },
  SS: { hint: 'Start → Start' },
  FF: { hint: 'Finish → Finish' },
  SF: { hint: 'Start → Finish' },
};

const SLOT_STYLE = [
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

function externalLabel(diff?: ProjectDiffDetails, fallbackCode?: string): string {
  const factors = (diff as any)?.diffFactors as string[] | undefined;
  if (factors && factors.length > 0) {
    return factors.map((f) => FACTOR_LABEL[f] || f).join(' · ');
  }
  return fallbackCode ? `Project ${fallbackCode}` : 'Cross-Project';
}

function shortDate(s?: string): string {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : String(s);
}

function lagToText(sign: string, v: number): string {
  return v ? `${sign}${v}` : '';
}

function tokenOf(it: LinkItem): string {
  if (!it.resolved) return it.raw;
  const lag = lagToText(it.lagSign, it.lagValue);
  const rel = it.type === 'FS' && !lag ? '' : it.type;
  return `${it.code}${rel}${lag}`;
}

/** Secondary predecessor must be FF or SF */
function normalize(list: LinkItem[]): LinkItem[] {
  return list.slice(0, 2).map((it, i) =>
    i === 1 && it.resolved && it.type !== 'FF' && it.type !== 'SF' ? { ...it, type: 'FF' as PredecessorType } : it
  );
}

function describe(it: LinkItem): string {
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

function milestoneDate(it: LinkItem): string {
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

/* ------------------------------------------------------------------ */
/* Persist default predecessor changes                                 */
/* ------------------------------------------------------------------ */

async function persistDefault(
  source: Task,
  change: PredecessorChange,
  projects: Project[]
): Promise<void> {
  if (!source?.id) {
    throw new Error('Please save the task before linking a predecessor.');
  }
  const store = useAppStore.getState() as any;
  const currentTasks: Task[] = store.tasks || [];
  const now = new Date().toISOString();

  const updatedTask: Task = {
    ...source,
    predecessor: change.predecessor,
    predecessorTaskIds: change.predecessorTaskIds,
    predecessors: change.predecessors,
    realtimeUpdate: Boolean(change.predecessor.trim()),
    updatedAt: now,
  } as Task;

  const taskNoMap = buildTaskNoMap(projects, currentTasks);
  const parsed = parsePredecessors(change.predecessor, taskNoMap, updatedTask);
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

function LagInput({ value, disabled, onCommit }: { value: number; disabled?: boolean; onCommit: (n: number) => void }) {
  const fmt = (n: number) => (n > 0 ? `+${n}` : String(n));
  const [txt, setTxt] = useState(fmt(value));
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (!isTypingRef.current) {
      setTxt(fmt(value));
    }
  }, [value]);

  const commit = () => {
    isTypingRef.current = false;
    const n = parseFloat(txt.replace(',', '.').replace('−', '-'));
    if (isNaN(n)) {
      setTxt(fmt(value));
      return;
    }
    const r = Math.round(n * 100) / 100;
    if (r !== value) onCommit(r);
    else setTxt(fmt(value));
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      value={txt}
      disabled={disabled}
      onFocus={(e: any) => {
        isTypingRef.current = true;
        e.target.select?.();
      }}
      onChange={(e: any) => setTxt(e.target.value.replace(/[^0-9+\-−.,]/g, ''))}
      onBlur={commit}
      onKeyDown={(e: any) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          commit();
          e.target.blur?.();
        }
      }}
      title="Enter lag days, e.g. +2 or -1"
      className={cn(
        'h-6 w-12 rounded-md border border-slate-200/80 bg-white dark:border-[#38383a] dark:bg-[#18181a] text-center font-mono text-xs font-bold outline-none focus:border-blue-500 transition-colors shadow-2xs',
        value === 0 ? 'text-slate-500 dark:text-slate-400' : value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const PredecessorSearchSuggest: React.FC<PredecessorSearchSuggestProps> = memo(
  ({ task, canWrite, onChange }) => {
    const storeTasks = useAppStore((s: any) => s.tasks) as Task[];
    const projects = (useAppStore((s: any) => s.projects) || []) as Project[];
    const liveTask = useAppStore((s: any) =>
      task?.id ? (s.tasks as Task[]).find((t) => t.id === task.id) : undefined
    ) as Task | undefined;

    const source: Task = onChange ? task : liveTask || task;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingExternal, setPendingExternal] = useState<RankedPredecessorMatch | null>(null);

    useEffect(() => {
      if (open && listRef.current && listRef.current.children[hi]) {
        const activeEl = listRef.current.children[hi] as HTMLElement;
        if (activeEl) {
          activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }, [hi, open]);

    const ctx: PredecessorContext = useMemo(
      () => ({
        projectId: source?.projectId,
        projectCode: source?.projectCode,
        projectYear: source?.projectYear,
        projectStore: source?.projectStore,
        projectLocation: source?.location,
      }),
      [source?.projectId, source?.projectCode, source?.projectYear, source?.projectStore, source?.location]
    );

    const pool = useMemo(() => (storeTasks || []).filter((t) => t && !t.isDeleted), [storeTasks]);
    const taskNoMap = useMemo(() => buildTaskNoMap(projects, storeTasks || []), [projects, storeTasks]);

    const items = useMemo<LinkItem[]>(() => {
      const str = String(source?.predecessor || '').trim();
      if (!str) return [];
      const ids = source?.predecessorTaskIds || [];
      const tokens = splitPredecessors(str, taskNoMap).slice(0, 2);

      return tokens.map((tok, i) => {
        let p: any;
        try {
          p = parsePredecessors(tok, taskNoMap, { ...source, predecessorTaskIds: [ids[i] || ''] } as Task)[0];
        } catch {
          p = undefined;
        }
        if (p && p.task) {
          const diff = getTaskProjectDiffDetails(ctx, p.task, projects);
          const code = computeTaskCode(projects, storeTasks || [], p.task) || p.task.taskCodePhu || p.no || tok;
          return {
            key: `${p.task.id}-${i}`,
            resolved: true,
            taskId: p.task.id,
            task: p.task as Task,
            code,
            type: (p.type || 'FS') as PredecessorType,
            lagSign: (p.lagSign === '-' ? '-' : '+') as '+' | '-',
            lagValue: Number(p.lagValue) || 0,
            raw: tok,
            isExternal: !!diff.isDifferent,
            externalLabel: externalLabel(diff, p.task.projectCode),
          };
        }
        const { query: q } = parsePredecessorToken(tok);
        return {
          key: `raw-${i}-${tok}`,
          resolved: false,
          taskId: '',
          code: q || tok,
          type: 'FS' as PredecessorType,
          lagSign: '+' as const,
          lagValue: 0,
          raw: tok,
          isExternal: false,
          externalLabel: '',
        };
      });
    }, [
      source?.predecessor,
      source?.predecessorTaskIds,
      source?.projectId,
      source?.projectCode,
      source?.projectYear,
      source?.projectStore,
      source?.location,
      taskNoMap,
      ctx,
      projects,
      storeTasks,
    ]);

    useEffect(() => {
      const handler = (e: MouseEvent | TouchEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler, { passive: true });
      return () => {
        document.removeEventListener('mousedown', handler);
        document.removeEventListener('touchstart', handler);
      };
    }, []);

    useEffect(() => setHi(0), [deferredQuery]);

    const excluded = useMemo(() => {
      const s = new Set<string>();
      if (source?.id) s.add(source.id);
      items.forEach((i) => i.taskId && s.add(i.taskId));
      return s;
    }, [source?.id, items]);

    const candidates = useMemo<RankedPredecessorMatch[]>(() => {
      if (!open) return [];
      const q = deferredQuery.trim();

      if (q) {
        return rankCandidateTasks(q, pool, projects, pool, source?.projectCode, ctx)
          .filter((m) => !excluded.has(m.task.id))
          .slice(0, 20);
      }

      let base = pool.filter((t) => !excluded.has(t.id));
      const sameCode = base.filter((t) => t.projectCode === source?.projectCode);
      if (sameCode.length > 0) base = sameCode;
      base = base
        .filter((t) => !getTaskProjectDiffDetails(ctx, t, projects).isDifferent)
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
        .slice(0, 25);

      return base.map((t) => {
        const diff = getTaskProjectDiffDetails(ctx, t, projects);
        return {
          task: t,
          score: 0,
          exactTaskCode: computeTaskCode(projects, pool, t) || t.taskCodePhu || t.id,
          isExternal: !!diff.isDifferent,
          diffDetails: diff,
        } as RankedPredecessorMatch;
      });
    }, [open, deferredQuery, pool, projects, excluded, source?.projectCode, ctx]);

    const commit = async (list: LinkItem[]) => {
      const finalList = normalize(list);
      const change: PredecessorChange = {
        predecessor: finalList.map(tokenOf).filter(Boolean).join(', '),
        predecessorTaskIds: finalList.map((i) => i.taskId || ''),
        predecessors: finalList.filter((i) => i.resolved).map((i) => ({ taskId: i.taskId, type: i.type })),
      };
      setSaving(true);
      setError(null);
      try {
        if (onChange) await onChange(change);
        else await persistDefault(source, change, projects);
      } catch (e: any) {
        setError(e?.message || 'Could not save predecessor link');
      } finally {
        setSaving(false);
      }
    };

    const wouldCreateCycle = (candidate: Task): boolean => {
      if (!source?.id) return false;
      const visited = new Set<string>();
      const stack: Task[] = [candidate];
      while (stack.length > 0 && visited.size < 500) {
        const cur = stack.pop() as Task;
        if (cur.id === source.id) return true;
        if (visited.has(cur.id)) continue;
        visited.add(cur.id);
        if (!cur.predecessor) continue;
        try {
          parsePredecessors(cur.predecessor, taskNoMap, cur).forEach((p: any) => {
            if (p?.task) stack.push(p.task as Task);
          });
        } catch {}
      }
      return false;
    };

    const addTask = (m: RankedPredecessorMatch, confirmed = false) => {
      const t = m.task;
      if (items.length >= 2) return;
      if (wouldCreateCycle(t)) {
        setError(
          `Cannot link: «${t.name}» depends on this task (directly or indirectly), causing a circular dependency.`
        );
        setPendingExternal(null);
        return;
      }
      if (m.isExternal && !confirmed) {
        setPendingExternal(m);
        setOpen(false);
        return;
      }
      const idx = items.length;
      const next: LinkItem = {
        key: `${t.id}-${idx}`,
        resolved: true,
        taskId: t.id,
        task: t,
        code: m.exactTaskCode || computeTaskCode(projects, pool, t) || t.taskCodePhu || t.id,
        type: idx === 0 ? 'FS' : 'FF',
        lagSign: '+',
        lagValue: 0,
        raw: '',
        isExternal: !!m.isExternal,
        externalLabel: externalLabel(m.diffDetails, t.projectCode),
      };
      setPendingExternal(null);
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
      commit([...items, next]);
    };

    const patchItem = (idx: number, patch: Partial<LinkItem>) => {
      commit(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    };

    const removeItem = (idx: number) => {
      commit(items.filter((_, i) => i !== idx));
    };

    const stepLag = (idx: number, delta: number) => {
      const it = items[idx];
      const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;
      const n = Math.round((signed + delta) * 100) / 100;
      patchItem(idx, { lagSign: n < 0 ? '-' : '+', lagValue: Math.abs(n) });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open) setOpen(true);
        else setHi((h) => Math.min(h + 1, Math.max(candidates.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHi((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const m = candidates[hi] || candidates[0];
        if (m) addTask(m);
      } else if (e.key === 'Escape') {
        if (open) {
          e.stopPropagation();
          setOpen(false);
        }
      }
    };

    const canAdd = canWrite && items.length < 2;
    const hasQuery = deferredQuery.trim().length > 0;

    return (
      <div className="flex flex-col gap-2.5 w-full" ref={wrapperRef} onClick={(e) => e.stopPropagation()}>
        {saving && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating...
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-[12px] font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {items.map((it, idx) => {
          const allowed: PredecessorType[] = idx === 0 ? ['FS', 'SS', 'FF', 'SF'] : ['FF', 'SF'];
          const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;

          return (
            <div
              key={it.key}
              className={cn(
                'group flex flex-col gap-1.5 rounded-xl border bg-white dark:bg-[#1c1c1f] p-2 shadow-2xs transition-all hover:border-blue-300 dark:hover:border-blue-700',
                it.resolved ? 'border-slate-200 dark:border-[#38383a]' : 'border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20'
              )}
            >
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded px-1 text-[11px] font-black mt-0.5',
                      idx === 0
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                    )}
                  >
                    {idx === 0 ? '①' : '②'}
                  </span>

                  {it.resolved && it.task ? (
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-black text-blue-600 dark:text-[#8ab4f8] shrink-0">
                          {it.code}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-[#f3f3f3] leading-snug break-words">
                          {it.task.name}
                        </span>
                      </div>
                      {it.isExternal && (
                        <span className="mt-1 inline-flex shrink-0 items-center gap-1 w-fit rounded border border-amber-300 bg-amber-100/70 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          <ExternalLink className="h-3 w-3" />
                          {it.externalLabel}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Not found «{it.raw}»
                    </span>
                  )}
                </div>

                {canWrite && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={saving}
                    title="Remove link"
                    className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 active:scale-95 transition-all touch-manipulation disabled:opacity-50 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Row 2: Type Segmented Pills + Lag Controls placed on the SAME ROW */}
              {it.resolved && canWrite && (
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-[#2a2a2d] text-xs flex-nowrap overflow-x-auto">
                  {/* Type Segmented Control */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TYPE:</span>
                    <div className="inline-flex rounded-lg bg-slate-100 dark:bg-[#252528] p-0.5 border border-slate-200/60 dark:border-[#38383a]">
                      {allowed.map((rel) => {
                        const active = it.type === rel;
                        return (
                          <button
                            key={rel}
                            type="button"
                            disabled={saving}
                            onClick={() => !active && patchItem(idx, { type: rel })}
                            className={cn(
                              'px-2 py-0.5 text-[11px] font-black rounded-md transition-all active:scale-95 touch-manipulation disabled:opacity-60 cursor-pointer',
                              active
                                ? 'bg-blue-600 text-white shadow-2xs dark:bg-blue-600'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            )}
                          >
                            {rel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Lag Control Inline */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LAG:</span>
                    <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 dark:bg-[#252528] px-1 py-0.5 border border-slate-200/60 dark:border-[#38383a]">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => stepLag(idx, -1)}
                        className="flex h-5 w-5 items-center justify-center rounded bg-white dark:bg-[#1c1c1f] text-slate-600 dark:text-slate-300 shadow-2xs hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all touch-manipulation cursor-pointer"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <LagInput value={signed} disabled={saving} onCommit={(n) => patchItem(idx, { lagSign: n < 0 ? '-' : '+', lagValue: Math.abs(n) })} />
                      <span className="text-[10px] font-bold text-slate-400 px-0.5">days</span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => stepLag(idx, 1)}
                        className="flex h-5 w-5 items-center justify-center rounded bg-white dark:bg-[#1c1c1f] text-slate-600 dark:text-slate-300 shadow-2xs hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all touch-manipulation cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Confirm cross project link */}
        {pendingExternal && (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs dark:border-amber-700 dark:bg-amber-950/60">
            <div className="flex items-start gap-1.5 font-medium text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                «<b>{pendingExternal.task.name}</b>» belongs to another project (
                <b>{externalLabel(pendingExternal.diffDetails, pendingExternal.task.projectCode)}</b>). Confirm cross-project link?
              </p>
            </div>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setPendingExternal(null)}
                className="rounded-lg px-3 py-1 text-xs font-bold text-slate-600 hover:bg-amber-100 dark:text-slate-300 dark:hover:bg-amber-900/50 touch-manipulation cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => addTask(pendingExternal, true)}
                className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 active:scale-95 touch-manipulation cursor-pointer"
              >
                Link
              </button>
            </div>
          </div>
        )}

        {/* Search input */}
        {canAdd && !pendingExternal && (
          <div className="relative w-full">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                disabled={saving}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder="Type task name or code..."
                autoComplete="off"
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-8 pr-7 text-xs font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white dark:border-[#38383a] dark:bg-[#1a1a1c] dark:text-white dark:focus:bg-[#202023] transition-all shadow-2xs"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 touch-manipulation cursor-pointer"
                  tabIndex={-1}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {open && (
              <ul
                ref={listRef}
                role="listbox"
                className="absolute left-0 right-0 top-full z-[200] mt-1 max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white dark:border-[#444446] dark:bg-[#252528] p-1 shadow-2xl backdrop-blur-md transition-all"
              >
                {!hasQuery && candidates.length > 0 && (
                  <li className="px-2.5 pb-1 pt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                    Suggestions (Same Project)
                  </li>
                )}
                {candidates.length === 0 ? (
                  <li className="px-3 py-2.5 text-center text-xs italic text-slate-400">
                    {hasQuery ? 'No tasks found' : 'No matching tasks'}
                  </li>
                ) : (
                  candidates.map((m, i) => {
                    const t = m.task;
                    const best = hasQuery && i === 0 && m.score >= 450;
                    return (
                      <li
                        key={t.id}
                        role="option"
                        aria-selected={i === hi}
                        onMouseEnter={() => setHi(i)}
                        onClick={() => addTask(m)}
                        className={cn(
                          'flex min-h-[38px] cursor-pointer flex-col gap-0.5 rounded-lg border-b border-slate-100/60 dark:border-slate-800/60 px-2.5 py-1.5 last:border-0 transition-colors',
                          i === hi ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-[#2e2e32]'
                        )}
                      >
                        <div className="flex items-center justify-between gap-1.5 min-w-0">
                          <span className="truncate text-xs font-bold text-slate-800 dark:text-[#f3f3f3]">{t.name}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {best && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.2 text-[9px] font-extrabold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                                <Sparkles className="h-2.5 w-2.5" /> Best Match
                              </span>
                            )}
                            {m.isExternal && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.2 text-[9px] font-extrabold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                <ExternalLink className="h-2.5 w-2.5" /> {externalLabel(m.diffDetails, t.projectCode)}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="font-mono font-black text-blue-600 dark:text-[#8ab4f8]">{m.exactTaskCode}</span>
                          <span className="font-mono text-slate-400 dark:text-slate-500">
                            {shortDate(t.start)} → {shortDate(t.finish)}
                          </span>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }
);

PredecessorSearchSuggest.displayName = 'PredecessorSearchSuggest';
