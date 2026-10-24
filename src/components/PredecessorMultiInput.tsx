import React, { Component, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Task, Project } from '../types';
import { Search, X, Check, ExternalLink, Sparkles, ArrowRight, Link2, AlertTriangle, Loader2, Plus, Minus } from 'lucide-react';
import { cn } from '../lib/utils';
import { computeAllTaskCodes, splitPredecessors, buildTaskNoMap, parsePredecessors } from '../lib/ganttUtils';
import { useAppStore } from '../store/useAppStore';
import { 
  parsePredecessorToken, 
  rankCandidateTasks, 
  RankedPredecessorMatch, 
  PredecessorContext, 
  buildProjectLookupIndex,
  resolveProjectContext,
  getTaskProjectDiffDetailsWithResolved
} from '../lib/predecessorMatchUtils';
import {
  PredecessorType,
  PredecessorChange,
  LinkItem,
  REL_INFO,
  SLOT_STYLE,
  shortDate,
  externalLabel,
  tokenOf,
  normalize,
  milestoneDate,
  describe,
  persistDefault,
  LagInput,
} from './PredecessorMultiInputParts/predecessorInputHelpers';

export type { PredecessorChange };

interface PredecessorMultiInputProps {
  task?: Task;
  value?: string;
  canWrite?: boolean;
  disabled?: boolean;
  onChange?: ((change: PredecessorChange) => void | Promise<void>) | ((val: string) => void);
  onCommit?: (val: string) => void;
  storeTasks?: Task[];
  tasks?: Task[];
  projects?: Project[];
  currentProjectId?: string;
  currentProjectCode?: string;
  currentProjectYear?: number | string;
  currentProjectStore?: string;
  currentProjectLocation?: string;
  predecessorTaskIds?: string[];
  onPredecessorTaskIdsChange?: (ids: string[]) => void;
}
export function PredecessorMultiInput({
  task,
  value,
  canWrite: canWriteProp,
  disabled,
  onChange,
  onCommit,
  storeTasks,
  tasks: tasksProp,
  projects: projectsProp,
  currentProjectId,
  currentProjectCode,
  currentProjectYear,
  currentProjectStore,
  currentProjectLocation,
  predecessorTaskIds: legacyIds,
  onPredecessorTaskIdsChange
}: PredecessorMultiInputProps) {
  const canWrite = canWriteProp !== undefined ? canWriteProp : !disabled;
  const liveTask = useAppStore((s) => s.tasks.find((t) => t.id === task?.id));
  
  const source: Task = useMemo(() => {
    if (task) return liveTask || task;
    return {
      id: '',
      name: '',
      predecessor: value || '',
      predecessorTaskIds: legacyIds || [],
      projectId: currentProjectId,
      projectCode: currentProjectCode,
      projectYear: currentProjectYear ? String(currentProjectYear) : undefined,
      projectStore: currentProjectStore,
      location: currentProjectLocation,
    } as Task;
  }, [task, liveTask, value, legacyIds, currentProjectId, currentProjectCode, currentProjectYear, currentProjectStore, currentProjectLocation]);
  
  const stateProjects = useAppStore(s => s.projects);
  const activeProjects = projectsProp || stateProjects;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingExternal, setPendingExternal] = useState<RankedPredecessorMatch | null>(null);

  const ctx: PredecessorContext = useMemo(() => ({
    projectId: source?.projectId || currentProjectId,
    projectCode: source?.projectCode || currentProjectCode,
    projectYear: source?.projectYear || currentProjectYear,
    projectStore: source?.projectStore || currentProjectStore,
    projectLocation: source?.location || currentProjectLocation,
  }), [source, currentProjectId, currentProjectCode, currentProjectYear, currentProjectStore, currentProjectLocation]);

  const pool = useMemo(() => {
    const raw = storeTasks || tasksProp || useAppStore.getState().tasks || [];
    return raw.some((t) => !t || t.isDeleted) ? raw.filter((t) => t && !t.isDeleted) : raw;
  }, [storeTasks, tasksProp]);
  const projectIndex = useMemo(() => buildProjectLookupIndex(activeProjects), [activeProjects]);
  const allCodesMap = useMemo(() => computeAllTaskCodes(activeProjects, pool), [activeProjects, pool]);
  const resolvedContext = useMemo(() => resolveProjectContext(ctx, activeProjects, projectIndex), [ctx, activeProjects, projectIndex]);
  const taskNoMap = useMemo(() => buildTaskNoMap(activeProjects, pool), [activeProjects, pool]);

  const items = useMemo<LinkItem[]>(() => {
    const str = String(source?.predecessor || '').trim();
    if (!str) return [];
    const ids = source?.predecessorTaskIds || [];
    const tokens = splitPredecessors(str, taskNoMap).slice(0, 2);

    return tokens.map((tok, i) => {
      let p: any;
      try { p = parsePredecessors(tok, taskNoMap, { ...source, predecessorTaskIds: [ids[i] || ''] } as Task)[0]; } catch {}
      if (p && p.task) {
        const diff = getTaskProjectDiffDetailsWithResolved(resolvedContext, p.task, activeProjects, projectIndex);
        const code = allCodesMap.get(p.task.id) || p.task.taskCodePhu || p.no || tok;
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
        key: `raw-${i}-${tok}`, resolved: false, taskId: '', code: q || tok, type: 'FS', lagSign: '+', lagValue: 0, raw: tok, isExternal: false, externalLabel: '',
      };
    });
  }, [source, taskNoMap, resolvedContext, activeProjects, projectIndex, allCodesMap]);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
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
      return rankCandidateTasks(q, pool, activeProjects, pool, source?.projectCode, ctx, {
        projectIndex,
        allTaskCodesMap: allCodesMap,
      }).filter((m) => !excluded.has(m.task.id)).slice(0, 20);
    }
    let base = pool.filter((t) => !excluded.has(t.id));
    if (source?.projectId) {
      const sameId = base.filter((t) => t.projectId === source.projectId);
      if (sameId.length > 0) base = sameId;
    } else if (source?.projectCode) {
      const sameCode = base.filter((t) => t.projectCode === source.projectCode);
      if (sameCode.length > 0) base = sameCode;
    }
    const withDiff = base.map((t) => ({
      task: t,
      diff: getTaskProjectDiffDetailsWithResolved(resolvedContext, t, activeProjects, projectIndex),
    }));
    const internalOnly = withDiff.filter((item) => !item.diff.isDifferent);
    const chosen = (internalOnly.length > 0 ? internalOnly : withDiff)
      .sort((a, b) => (a.task.orderIndex ?? 0) - (b.task.orderIndex ?? 0))
      .slice(0, 25);
    return chosen.map(({ task: t, diff }) => ({
      task: t,
      score: 0,
      exactTaskCode: allCodesMap.get(t.id) || t.taskCodePhu || t.id,
      isExternal: !!diff.isDifferent,
      diffDetails: diff,
    } as RankedPredecessorMatch));
  }, [open, deferredQuery, pool, activeProjects, excluded, source?.projectId, source?.projectCode, ctx, projectIndex, allCodesMap, resolvedContext]);

  const commit = async (list: LinkItem[]) => {
    const finalList = normalize(list);
    const change: PredecessorChange = {
      predecessor: finalList.map(tokenOf).filter(Boolean).join(', '),
      predecessorTaskIds: finalList.map((i) => i.taskId || ''),
      predecessors: finalList.filter((i) => i.resolved).map((i) => ({ taskId: i.taskId, type: i.type })),
    };
    setSaving(true); setError(null);
    try {
      if (onChange) {
        await (onChange as any)(change);
        if (typeof onChange === 'function') (onChange as any)(change.predecessor);
      }
      if (onCommit) onCommit(change.predecessor);
      if (onPredecessorTaskIdsChange) onPredecessorTaskIdsChange(change.predecessorTaskIds);
      if (!onChange && !onCommit && source.id) {
        await persistDefault(source, change, activeProjects);
      }
    } catch (e: any) { setError(e?.message || 'Không thể lưu liên kết'); } 
    finally { setSaving(false); }
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
      try { parsePredecessors(cur.predecessor, taskNoMap, cur).forEach((p: any) => { if (p?.task) stack.push(p.task as Task); }); } catch {}
    }
    return false;
  };

  const addTask = (m: RankedPredecessorMatch, confirmed = false) => {
    const t = m.task;
    if (items.length >= 2) return;
    if (wouldCreateCycle(t)) { setError(`Lỗi: «${t.name}» sẽ tạo vòng lặp phụ thuộc.`); setPendingExternal(null); return; }
    if (m.isExternal && !confirmed) { setPendingExternal(m); setOpen(false); return; }
    const idx = items.length;
    const next: LinkItem = {
      key: `${t.id}-${idx}`, resolved: true, taskId: t.id, task: t, code: m.exactTaskCode || allCodesMap.get(t.id) || t.taskCodePhu || t.id,
      type: idx === 0 ? 'FS' : 'FF', lagSign: '+', lagValue: 0, raw: '', isExternal: !!m.isExternal, externalLabel: externalLabel(m.diffDetails, t.projectCode),
    };
    setPendingExternal(null); setQuery(''); setOpen(false); inputRef.current?.blur();
    commit([...items, next]);
  };

  const patchItem = (idx: number, patch: Partial<LinkItem>) => commit(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => commit(items.filter((_, i) => i !== idx));

  const stepLag = (idx: number, delta: number) => {
    const it = items[idx];
    const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;
    const n = Math.round((signed + delta) * 100) / 100;
    patchItem(idx, { lagSign: n < 0 ? '-' : '+', lagValue: Math.abs(n) });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setHi((h) => Math.min(h + 1, Math.max(candidates.length - 1, 0))); } 
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); } 
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const m = candidates[hi] || candidates[0]; if (m) addTask(m); } 
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } }
  };

  const canAdd = canWrite && items.length < 2;
  const hasQuery = deferredQuery.trim().length > 0;

  return (
    <div className="flex flex-col gap-2 w-full" ref={wrapperRef}>
      {/* Cảnh báo lỗi */}
      {error && (
        <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 font-semibold">{error}</span>
          <button type="button" onClick={() => setError(null)} className="p-0.5 hover:bg-red-100 rounded dark:hover:bg-red-900/50"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Danh sách thẻ đã chọn */}
      <div className="flex flex-col gap-1.5">
        {items.map((it, idx) => {
          const style = SLOT_STYLE[idx] || SLOT_STYLE[1];
          const allowed: PredecessorType[] = idx === 0 ? ['FS', 'SS', 'FF', 'SF'] : ['FF', 'SF'];
          const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;

          return (
            <div key={it.key} className={cn("flex flex-col p-1.5 rounded-lg border bg-white dark:bg-[#1a1a1c] shadow-xs", style.border, it.resolved ? 'border-slate-200 dark:border-[#333]' : 'border-amber-300 dark:border-amber-700/60')}>
              <div className="flex items-center justify-between gap-2 pl-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-black shrink-0", style.badge)}>#{style.tag}</span>
                  {it.resolved && it.task ? (
                    <div className="flex items-center gap-1.5 min-w-0 truncate text-xs">
                      <span className="font-mono font-bold text-blue-600 dark:text-[#8ab4f8] shrink-0">{it.code}</span>
                      <span className="text-slate-800 dark:text-[#f3f3f3] font-semibold truncate" title={it.task.name}>{it.task.name}</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-amber-600 italic">Not found: {it.raw}</span>
                  )}
                </div>
                {canWrite && (
                  <button type="button" onClick={() => removeItem(idx)} disabled={saving} className="text-slate-400 hover:text-red-500 p-1 shrink-0"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>

              {/* Link Options (TYPE & LAG placed on the SAME ROW) */}
              {it.resolved && canWrite && (
                <div className="flex items-center justify-between gap-1.5 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-[#2e2e32] pl-1 text-xs flex-nowrap overflow-x-auto">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TYPE:</span>
                    <div className="inline-flex rounded bg-slate-100 dark:bg-[#252528] p-0.5 border border-slate-200/60 dark:border-[#38383a]">
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
                              "px-2 py-0.5 rounded text-[10px] font-extrabold transition-colors cursor-pointer active:scale-95",
                              active ? style.active : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-[#e3e3e3]"
                            )}
                          >
                            {rel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LAG:</span>
                    <div className="inline-flex items-center gap-0.5 rounded bg-slate-100 dark:bg-[#252528] px-1 py-0.5 border border-slate-200/60 dark:border-[#38383a]">
                      <button type="button" disabled={saving} onClick={() => stepLag(idx, -1)} className="p-0.5 rounded bg-white dark:bg-[#1a1a1c] text-slate-500 hover:text-slate-800 dark:text-slate-400 active:scale-95 transition-all"><Minus className="w-3 h-3" /></button>
                      <LagInput value={signed} disabled={saving} onCommit={(n) => patchItem(idx, { lagSign: n < 0 ? '-' : '+', lagValue: Math.abs(n) })} />
                      <span className="text-[10px] font-bold text-slate-400 px-0.5">days</span>
                      <button type="button" disabled={saving} onClick={() => stepLag(idx, 1)} className="p-0.5 rounded bg-white dark:bg-[#1a1a1c] text-slate-500 hover:text-slate-800 dark:text-slate-400 active:scale-95 transition-all"><Plus className="w-3 h-3" /></button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cross-Project Confirm Dialog */}
      {pendingExternal && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] dark:border-amber-700/60 dark:bg-amber-950/40">
          <div className="flex items-start gap-1.5 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="font-medium leading-tight">
              «{pendingExternal.task.name}» belongs to another project. This may adjust current task dates. Confirm link?
            </span>
          </div>
          <div className="flex justify-end gap-1.5 mt-1">
            <button type="button" onClick={() => setPendingExternal(null)} className="px-3 py-1 rounded text-slate-600 hover:bg-amber-100 dark:text-slate-300 font-bold">Cancel</button>
            <button type="button" onClick={() => addTask(pendingExternal, true)} className="px-3 py-1 rounded bg-amber-600 text-white font-bold hover:bg-amber-700 shadow-sm">Link</button>
          </div>
        </div>
      )}

      {/* Search Input & Suggestions */}
      {canAdd && !pendingExternal && (
        <div className="relative mt-0.5">
          <div className="relative">
            <Link2 className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              disabled={saving}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Type task name or code..."
              autoComplete="off"
              className="h-8 w-full rounded-lg border border-blue-200 bg-blue-50/50 pl-8 pr-7 text-xs font-semibold text-slate-800 outline-none placeholder:text-slate-400 placeholder:font-normal focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-blue-900/40 dark:bg-[#1a1c23] dark:text-white dark:focus:bg-[#1e1e20]"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700" tabIndex={-1}>
                <X className="w-3 h-3" />
              </button>
            )}
            {saving && <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-blue-500" />}
          </div>

          {open && (
            <ul className="absolute left-0 right-0 top-full z-[300000] mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-[#444446] dark:bg-[#252528] overscroll-contain">
              {!hasQuery && candidates.length > 0 && <li className="px-2.5 pb-1 pt-1.5 text-[9px] font-extrabold uppercase text-slate-400">Suggestions (Same Project)</li>}
              {candidates.length === 0 ? (
                <li className="px-3 py-3 text-center text-[11px] italic text-slate-500">No tasks found</li>
              ) : (
                candidates.map((m, i) => {
                  const t = m.task;
                  return (
                    <li
                      key={t.id}
                      onMouseEnter={() => setHi(i)}
                      onClick={() => addTask(m)}
                      className={cn("flex cursor-pointer flex-col gap-0.5 px-2.5 py-1.5 border-b border-slate-100 dark:border-[#333] last:border-0", i === hi ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-slate-50 dark:hover:bg-[#2a2a2e]')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-800 dark:text-[#f3f3f3] line-clamp-1">{t.name}</span>
                        {m.isExternal && <span className="shrink-0 rounded bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 text-[8px] font-bold text-amber-800 dark:text-amber-300">Cross-Project</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="font-mono font-bold text-blue-600 dark:text-[#8ab4f8]">{m.exactTaskCode}</span>
                        <span className="text-slate-400 dark:text-slate-500">{shortDate(t.start)} → {shortDate(t.finish)}</span>
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
