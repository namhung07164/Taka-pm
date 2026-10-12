import React, { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
  FS: { hint: 'Xong → Bắt đầu' },
  SS: { hint: 'Cùng bắt đầu' },
  FF: { hint: 'Cùng kết thúc' },
  SF: { hint: 'Bắt đầu → Kết thúc' },
};

const SLOT_STYLE = [
  {
    tag: '①',
    title: 'Tiên quyết chính',
    border: 'border-l-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    active: 'bg-blue-600 text-white border-blue-600 shadow-sm',
    caption: 'text-blue-700 dark:text-blue-300',
  },
  {
    tag: '②',
    title: 'Tiên quyết phụ · chỉ FF / SF',
    border: 'border-l-rose-500',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    active: 'bg-rose-600 text-white border-rose-600 shadow-sm',
    caption: 'text-rose-700 dark:text-rose-300',
  },
];

const FACTOR_LABEL: Record<string, string> = {
  year: 'Khác năm',
  store: 'Khác chi nhánh',
  location: 'Khác vị trí/tầng',
  code: 'Khác dự án',
};

function externalLabel(diff?: ProjectDiffDetails, fallbackCode?: string): string {
  const factors = (diff as any)?.diffFactors as string[] | undefined;
  if (factors && factors.length > 0) {
    return factors.map((f) => FACTOR_LABEL[f] || f).join(' · ');
  }
  return fallbackCode ? `Dự án ${fallbackCode}` : 'Khác dự án';
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

/** Công việc thứ 2 bắt buộc là FF hoặc SF (đúng luật của Gantt) */
function normalize(list: LinkItem[]): LinkItem[] {
  return list.slice(0, 2).map((it, i) =>
    i === 1 && it.resolved && it.type !== 'FF' && it.type !== 'SF' ? { ...it, type: 'FF' as PredecessorType } : it
  );
}

function describe(it: LinkItem): string {
  if (!it.task) return '';
  const name = `«${it.task.name}»`;
  const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;
  const lag = signed === 0 ? '' : signed > 0 ? `, cộng ${signed} ngày` : `, sớm ${Math.abs(signed)} ngày`;
  switch (it.type) {
    case 'FS':
      return `Bắt đầu sau khi ${name} kết thúc${lag}`;
    case 'SS':
      return `Bắt đầu cùng lúc ${name} bắt đầu${lag}`;
    case 'FF':
      return `Kết thúc cùng lúc ${name} kết thúc${lag}`;
    case 'SF':
      return `Kết thúc khi ${name} bắt đầu${lag}`;
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
/*  Lưu mặc định (khi không truyền onChange): giống pipeline của Gantt */
/* ------------------------------------------------------------------ */

async function persistDefault(
  source: Task,
  change: PredecessorChange,
  projects: Project[]
): Promise<void> {
  if (!source?.id) {
    throw new Error('Hãy lưu công việc trước khi liên kết predecessor.');
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
    store.setToast?.({ title: 'Lưu thất bại', message: err?.message || 'Không thể lưu predecessor', type: 'error' });
  });

  store.setToast?.({
    title: 'Đã cập nhật Predecessor',
    message: change.predecessor ? `Liên kết: ${change.predecessor}` : 'Đã gỡ predecessor',
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
      title="Nhập số ngày lệch, ví dụ +2 hoặc -1"
      className={cn(
        'h-9 w-16 rounded-lg border border-slate-200 bg-white text-center font-mono text-[13px] font-bold outline-none focus:ring-2 focus:ring-blue-500 dark:border-[#444446] dark:bg-[#18181a]',
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

    // Khi tự lưu: luôn lấy bản mới nhất trong store. Khi có onChange: tin vào task do nơi gọi truyền xuống.
    const source: Task = onChange ? task : liveTask || task;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingExternal, setPendingExternal] = useState<RankedPredecessorMatch | null>(null);

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

    /* ---------- Danh sách predecessor hiện tại (đọc từ chuỗi chuẩn) ---------- */
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

    /* ---------- Đóng dropdown khi bấm ra ngoài (chuột + cảm ứng) ---------- */
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

    /* ---------- Gợi ý ---------- */
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

      // Chưa gõ gì: gợi ý các công việc cùng dự án, theo thứ tự trong dự án
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

    /* ---------- Hành động ---------- */
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
        setError(e?.message || 'Không thể lưu liên kết predecessor');
      } finally {
        setSaving(false);
      }
    };

    /** Công việc `candidate` có (trực tiếp/gián tiếp) phụ thuộc vào task hiện tại không? */
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
        } catch {
          /* bỏ qua token lỗi */
        }
      }
      return false;
    };

    const addTask = (m: RankedPredecessorMatch, confirmed = false) => {
      const t = m.task;
      if (items.length >= 2) return;
      if (wouldCreateCycle(t)) {
        setError(
          `Không thể liên kết: «${t.name}» đang phụ thuộc (trực tiếp hoặc gián tiếp) vào công việc này, sẽ tạo vòng lặp.`
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

    /* ---------- Giao diện ---------- */
    const canAdd = canWrite && items.length < 2;
    const hasQuery = deferredQuery.trim().length > 0;

    return (
      <div className="flex flex-col gap-2.5 w-full" ref={wrapperRef} onClick={(e) => e.stopPropagation()}>
        {saving && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang cập nhật...
          </div>
        )}

        {/* Lỗi */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-[12px] font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Trạng thái rỗng */}
        {items.length === 0 && !canWrite && (
          <p className="text-[12px] italic text-slate-400">Chưa có công việc tiên quyết.</p>
        )}
        {items.length === 0 && canWrite && (
          <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            Chọn công việc phải <b>xong (hoặc bắt đầu) trước</b> công việc này. Ngày bắt đầu/kết thúc sẽ tự động được tính theo.
          </p>
        )}

        {/* Danh sách đã liên kết */}
        {items.map((it, idx) => {
          const style = SLOT_STYLE[idx] || SLOT_STYLE[1];
          const allowed: PredecessorType[] = idx === 0 ? ['FS', 'SS', 'FF', 'SF'] : ['FF', 'SF'];
          const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;
          const milestone = milestoneDate(it);

          return (
            <div
              key={it.key}
              className={cn(
                'rounded-xl border border-l-4 bg-white dark:bg-[#1e1e20] shadow-sm',
                it.resolved ? 'border-slate-200 dark:border-[#444446]' : 'border-amber-300 dark:border-amber-700/60',
                it.resolved ? style.border : 'border-l-amber-500'
              )}
            >
              <div className="flex items-start gap-2 p-2.5 pb-2">
                <div className="min-w-0 flex-1">
                  <div className={cn('mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide', style.caption)}>
                    <span className={cn('inline-flex items-center justify-center rounded px-1.5 py-0.5', style.badge)}>{style.tag}</span>
                    {style.title}
                  </div>

                  {it.resolved && it.task ? (
                    <>
                      <div className="break-words text-[13px] font-bold leading-snug text-slate-800 dark:text-[#f3f3f3]">
                        {it.task.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                        <span className="font-mono font-bold text-blue-600 dark:text-[#8ab4f8]">{it.code}</span>
                        <span className="inline-flex items-center gap-1 font-mono text-slate-400 dark:text-slate-500">
                          {shortDate(it.task.start)} <ArrowRight className="w-3 h-3" /> {shortDate(it.task.finish)}
                        </span>
                        {it.isExternal && (
                          <span className="inline-flex items-center gap-1 rounded border border-amber-300 dark:border-amber-700/60 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                            <ExternalLink className="w-2.5 h-2.5" /> {it.externalLabel}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                      Không tìm thấy công việc «{it.raw}». Hãy gỡ và chọn lại từ danh sách gợi ý.
                    </div>
                  )}
                </div>

                {canWrite && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={saving}
                    title="Gỡ liên kết"
                    className="shrink-0 -mt-0.5 -mr-0.5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 active:scale-95 transition-colors touch-manipulation disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {it.resolved && (
                <div className="flex flex-col gap-2 px-2.5 pb-2.5">
                  {/* Chọn kiểu liên kết */}
                  {canWrite ? (
                    <div className={cn('grid gap-1.5', allowed.length === 4 ? 'grid-cols-4' : 'grid-cols-2')}>
                      {allowed.map((rel) => {
                        const active = it.type === rel;
                        return (
                          <button
                            key={rel}
                            type="button"
                            disabled={saving}
                            onClick={() => !active && patchItem(idx, { type: rel })}
                            title={REL_INFO[rel].hint}
                            className={cn(
                              'flex min-h-[44px] flex-col items-center justify-center rounded-lg border px-1 py-1 transition-colors active:scale-95 touch-manipulation disabled:opacity-60',
                              active
                                ? style.active
                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-[#444446] dark:bg-[#252528] dark:text-slate-300 dark:hover:bg-[#2c2c30]'
                            )}
                          >
                            <span className="text-[12px] font-extrabold leading-none">{rel}</span>
                            <span className={cn('mt-0.5 text-[9px] leading-tight', active ? 'text-white/85' : 'text-slate-400 dark:text-slate-500')}>
                              {REL_INFO[rel].hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className={cn('rounded px-1.5 py-0.5 font-extrabold', style.badge)}>{it.type}</span>
                      <span className="text-slate-500 dark:text-slate-400">{REL_INFO[it.type].hint}</span>
                    </div>
                  )}

                  {/* Độ trễ / vượt trước (lag) */}
                  {canWrite && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Độ lệch ngày (+ trễ / − sớm)</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => stepLag(idx, -1)}
                          title="Sớm hơn 1 ngày"
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-[#444446] dark:bg-[#252528] dark:text-slate-300 active:scale-95 touch-manipulation disabled:opacity-60"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <LagInput value={signed} disabled={saving} onCommit={(n) => patchItem(idx, { lagSign: n < 0 ? '-' : '+', lagValue: Math.abs(n) })} />
                        <span className="text-[11px] text-slate-400">ngày</span>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => stepLag(idx, 1)}
                          title="Trễ hơn 1 ngày"
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-[#444446] dark:bg-[#252528] dark:text-slate-300 active:scale-95 touch-manipulation disabled:opacity-60"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Diễn giải bằng lời */}
                  <div className="rounded-lg bg-slate-50 dark:bg-[#18181a] px-2.5 py-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {describe(it)}
                    {milestone && (
                      <>
                        {' '}
                        → <b className="font-mono text-slate-800 dark:text-slate-100">{milestone}</b>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Xác nhận liên kết khác dự án */}
        {pendingExternal && (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/60">
            <div className="flex items-start gap-2 text-[12px] font-medium text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                «<b>{pendingExternal.task.name}</b>» thuộc dự án khác (
                <b>{externalLabel(pendingExternal.diffDetails, pendingExternal.task.projectCode)}</b>). Liên kết chéo dự án sẽ làm
                ngày của công việc này thay đổi theo công việc kia. Bạn có chắc chắn?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingExternal(null)}
                className="min-h-[40px] rounded-lg px-4 text-[12px] font-bold text-slate-600 hover:bg-amber-100 dark:text-slate-300 dark:hover:bg-amber-900/50 touch-manipulation"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => addTask(pendingExternal, true)}
                className="min-h-[40px] rounded-lg bg-amber-600 px-4 text-[12px] font-bold text-white shadow-sm hover:bg-amber-700 active:scale-95 touch-manipulation"
              >
                Đồng ý liên kết
              </button>
            </div>
          </div>
        )}

        {/* Ô tìm & thêm */}
        {canAdd && !pendingExternal && (
          <div className="relative">
            <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              <Link2 className="w-3.5 h-3.5" />
              {items.length === 0 ? 'Thêm công việc tiên quyết' : 'Thêm công việc tiên quyết thứ 2 (FF / SF)'}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                placeholder="Gõ tên hoặc mã công việc (vd: A01#2)"
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-9 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-[#555] dark:bg-[#1e1e20] dark:text-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 touch-manipulation"
                  tabIndex={-1}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {open && (
              <ul
                role="listbox"
                className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-[#444446] dark:bg-[#252528]"
              >
                {!hasQuery && candidates.length > 0 && (
                  <li className="px-3 pb-1 pt-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                    Gợi ý cùng dự án
                  </li>
                )}
                {candidates.length === 0 ? (
                  <li className="px-3 py-3 text-center text-[12px] italic text-slate-500">
                    {hasQuery ? 'Không tìm thấy công việc phù hợp' : 'Chưa có công việc nào để gợi ý'}
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
                          'flex min-h-[48px] cursor-pointer flex-col gap-0.5 border-b border-slate-100 px-3 py-2 last:border-0 dark:border-[#333]',
                          i === hi ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-[#2a2a2e]'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="break-words text-[13px] font-bold leading-snug text-slate-800 dark:text-[#f3f3f3]">{t.name}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {best && (
                              <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">
                                <Sparkles className="w-2.5 h-2.5" /> Gợi ý nhất
                              </span>
                            )}
                            {m.isExternal && (
                              <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-300">
                                <ExternalLink className="w-2.5 h-2.5" /> {externalLabel(m.diffDetails, t.projectCode)}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono font-bold text-blue-600 dark:text-[#8ab4f8]">{m.exactTaskCode}</span>
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

        {canWrite && items.length >= 2 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Đã đủ 2 công việc tiên quyết (tối đa). Gỡ một công việc nếu muốn chọn công việc khác.
          </p>
        )}
      </div>
    );
  }
);

PredecessorSearchSuggest.displayName = 'PredecessorSearchSuggest';
