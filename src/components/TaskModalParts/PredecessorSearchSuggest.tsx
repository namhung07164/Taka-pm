import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Task, Project, PredecessorType } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../lib/utils';
import {
  buildTaskNoMap,
  computeTaskCode,
  parsePredecessors,
  splitPredecessors,
} from '../../lib/ganttUtils';
import {
  rankCandidateTasks,
  getTaskProjectDiffDetails,
  parsePredecessorToken,
  PredecessorContext,
  RankedPredecessorMatch,
} from '../../lib/predecessorMatchUtils';
import {
  Search,
  X,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  PredecessorChange,
  LinkItem,
  externalLabel,
  shortDate,
  tokenOf,
  normalize,
  persistDefault,
} from './PredecessorSearchSuggestParts/predecessorSuggestUtils';
import { PredecessorLinkCardList } from './PredecessorSearchSuggestParts/PredecessorLinkCardList';

export type { PredecessorChange };

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

    const commit = useCallback(
      async (list: LinkItem[]) => {
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
      },
      [onChange, source, projects]
    );

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

    const patchItem = useCallback(
      (idx: number, patch: Partial<LinkItem>) => {
        commit(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
      },
      [commit, items]
    );

    const removeItem = useCallback(
      (idx: number) => {
        commit(items.filter((_, i) => i !== idx));
      },
      [commit, items]
    );

    const stepLag = useCallback(
      (idx: number, delta: number) => {
        const it = items[idx];
        const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;
        const n = Math.round((signed + delta) * 100) / 100;
        patchItem(idx, { lagSign: n < 0 ? '-' : '+', lagValue: Math.abs(n) });
      },
      [items, patchItem]
    );

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

        <PredecessorLinkCardList
          items={items}
          canWrite={canWrite}
          saving={saving}
          onPatchItem={patchItem}
          onRemoveItem={removeItem}
          onStepLag={stepLag}
        />

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
                className="mt-2 w-full max-h-48 sm:max-h-56 md:max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-slate-200/90 bg-slate-50/90 dark:border-[#444446] dark:bg-[#252528] p-1.5 shadow-inner backdrop-blur-md transition-all custom-scrollbar"
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
