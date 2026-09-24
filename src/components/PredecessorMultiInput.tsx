import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Task, Project } from '../types';
import { Search, X, Check, ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLanguage } from '../lib/LanguageContext';
import { computeTaskCode, splitPredecessors } from '../lib/ganttUtils';
import { ensureProjectTasksLoaded } from '../lib/taskStateService';
import { useAppStore } from '../store/useAppStore';
import { ConfirmModal } from './ConfirmModal';
import {
  parsePredecessorToken,
  rankCandidateTasks,
  findClosestTaskMatch,
  resolvePredecessorString,
  RankedPredecessorMatch
} from '../lib/predecessorMatchUtils';

export function PredecessorMultiInput({
  value,
  onChange,
  tasks,
  projects,
  currentProjectCode,
  currentProjectYear,
  currentProjectStore,
  disabled
}: {
  value: string;
  onChange: (val: string) => void;
  tasks: Task[];
  projects: Project[];
  currentProjectCode?: string;
  currentProjectYear?: number | string;
  currentProjectStore?: string;
  disabled?: boolean;
}) {
  const { t: translate } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [confirmExternalModal, setConfirmExternalModal] = useState<{
    isOpen: boolean;
    task?: Task;
    relationship?: string;
  }>({ isOpen: false });

  const knownCodes = useMemo(() => {
    const codes = new Set<string>();
    tasks.forEach(t => {
      if (t.taskCodePhu) codes.add(t.taskCodePhu.trim().toLowerCase());
      const c = computeTaskCode(projects, tasks, t);
      if (c) codes.add(c.trim().toLowerCase());
    });
    return Array.from(codes);
  }, [tasks, projects]);

  const enforceRules = (val: string, isFinal: boolean = false) => {
    let parts = splitPredecessors(val, knownCodes);
    if (parts.length > 2) {
      parts = parts.slice(0, 2); 
    }
    
    if (isFinal && parts.length >= 2) {
      if (!/FF|SF/i.test(parts[1])) {
        if (!/SS|FS/i.test(parts[1])) {
          parts[1] += "FF";
        } else {
          parts[1] = parts[1].replace(/SS|FS/ig, "FF");
        }
      }
    }
    
    return parts.join(', ');
  };

  const handleResolveAndClose = () => {
    setIsOpen(false);
    if (!value) return;
    const resolved = resolvePredecessorString(value, tasks, projects, currentProjectCode);
    const merged = enforceRules(resolved, true);
    if (merged !== value) {
      onChange(merged);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (isOpen) {
          handleResolveAndClose();
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, value, onChange, knownCodes, tasks, projects, currentProjectCode]);

  const segments = useMemo(() => {
    return splitPredecessors(value || '', knownCodes);
  }, [value, knownCodes]);

  const isTrailingDelimiter = /,\s*$/.test(value || '');
  const activeSegment = isTrailingDelimiter ? '' : (segments.length > 0 ? segments[segments.length - 1] : '');

  const { query: activeQuery, suffix: activeSuffix } = useMemo(() => {
    return parsePredecessorToken(activeSegment);
  }, [activeSegment]);

  // Dynamic loading of external project tasks when typing external project code
  useEffect(() => {
    if (!activeQuery || activeQuery.trim().length < 2) return;
    const clean = activeQuery.toLowerCase().trim();
    if (!clean) return;

    const cleanAlpha = clean.replace(/[^a-z0-9]/g, '');
    const cleanPrefix = clean.split(/[-_#\s]+/)[0] || clean;

    const matchedProjects = (projects || []).filter(p => {
      if (!p.code || p.code === currentProjectCode) return false;
      const pCodeLower = p.code.toLowerCase();
      const pCodeAlpha = pCodeLower.replace(/[^a-z0-9]/g, '');
      return (
        pCodeLower.includes(clean) ||
        clean.includes(pCodeLower) ||
        pCodeAlpha.includes(cleanAlpha) ||
        cleanAlpha.includes(pCodeAlpha) ||
        (cleanPrefix.length >= 2 && pCodeLower.includes(cleanPrefix))
      );
    });

    matchedProjects.forEach(p => {
      ensureProjectTasksLoaded(p.code);
    });
  }, [activeQuery, projects, currentProjectCode]);

  // Ranked candidate tasks: closest match first
  const rankedCandidateList = useMemo(() => {
    // Pool all tasks from store to ensure candidates are not missed due to table filters
    const storeTasks = typeof window !== 'undefined' ? (useAppStore.getState?.()?.tasks || []) : [];
    const taskMap = new Map<string, Task>();
    (storeTasks || []).forEach(t => { if (t && t.id) taskMap.set(t.id, t); });
    (tasks || []).forEach(t => { if (t && t.id) taskMap.set(t.id, t); });
    const allCandidatePool = taskMap.size > 0 ? Array.from(taskMap.values()) : tasks;

    const searchClean = activeQuery.trim();
    if (!searchClean) {
      // In-scope tasks (same project, year, store)
      const inScopeTasks = allCandidatePool.filter(t => 
        t.projectCode === currentProjectCode &&
        (!currentProjectYear || String(t.projectYear) === String(currentProjectYear)) &&
        (!currentProjectStore || String(t.projectStore) === String(currentProjectStore))
      );
      const list = inScopeTasks.length > 0 ? inScopeTasks : allCandidatePool;
      return list.slice(0, 15).map(t => ({
        task: t,
        score: 0,
        exactTaskCode: computeTaskCode(projects, allCandidatePool, t) || t.taskCodePhu || t.id,
        isExternal: Boolean(t.projectCode && currentProjectCode && t.projectCode !== currentProjectCode)
      }));
    }

    return rankCandidateTasks(searchClean, allCandidatePool, projects, allCandidatePool, currentProjectCode).slice(0, 25);
  }, [activeQuery, tasks, projects, currentProjectCode, currentProjectYear, currentProjectStore]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [activeQuery]);

  const executeSelect = (task: Task, relationship?: string) => {
    const code = computeTaskCode(projects, tasks, task) || task.taskCodePhu || task.id;
    const itemToAdd = code + (relationship || '');
    let newSegments = [...segments];

    if (isTrailingDelimiter) {
      newSegments.push(itemToAdd);
    } else if (newSegments.length === 0) {
      newSegments = [itemToAdd];
    } else {
      newSegments[newSegments.length - 1] = itemToAdd;
    }
    
    const merged = enforceRules(newSegments.join(', '), false);
    
    if (newSegments.length >= 2) {
      onChange(merged);
      setIsOpen(false);
    } else {
      onChange(merged + ', ');
      setIsOpen(true);
    }
    inputRef.current?.focus();
  };

  const handleSelect = (task: Task, relationship?: string, forceConfirmed: boolean = false) => {
    const isExternal = task.projectCode && task.projectCode !== currentProjectCode;
    if (isExternal && !forceConfirmed) {
      setConfirmExternalModal({
        isOpen: true,
        task,
        relationship
      });
      return;
    }
    executeSelect(task, relationship);
  };

  const renderColoredText = (val: string) => {
    if (!val) return null;
    const parts = splitPredecessors(val, knownCodes);
    if (parts.length === 0) {
      return <span>{val}</span>;
    }
    if (parts.length === 1) {
      const p0 = parts[0];
      const idx0 = val.indexOf(p0);
      if (idx0 === -1) return <span className="text-blue-600 dark:text-blue-400">{val}</span>;
      const before0 = val.substring(0, idx0);
      const after0 = val.substring(idx0 + p0.length);
      return (
        <>
          {before0}
          <span className="text-blue-600 dark:text-blue-400">{p0}</span>
          <span className="text-slate-800 dark:text-slate-200">{after0}</span>
        </>
      );
    }

    const p0 = parts[0];
    const p1 = parts[1];
    const idx0 = val.indexOf(p0);
    if (idx0 === -1) {
      return <span className="text-blue-600 dark:text-blue-400">{val}</span>;
    }
    const before0 = val.substring(0, idx0);
    const after0 = val.substring(idx0 + p0.length);
    const idx1 = after0.indexOf(p1);

    if (idx1 === -1) {
      return (
        <>
          {before0}
          <span className="text-blue-600 dark:text-blue-400">{p0}</span>
          <span className="text-slate-800 dark:text-slate-200">{after0}</span>
        </>
      );
    }

    const delimiter = after0.substring(0, idx1);
    const remainder = after0.substring(idx1 + p1.length);

    return (
      <>
        {before0}
        <span className="text-blue-600 dark:text-blue-400">{p0}</span>
        <span className="text-slate-800 dark:text-slate-200">{delimiter}</span>
        <span className="text-rose-600 dark:text-rose-400">{p1}</span>
        <span className="text-slate-800 dark:text-slate-200">{remainder}</span>
      </>
    );
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase();
    val = val.replace(/[^A-Z0-9\-\+\.,\s#]/g, '');
    
    // Auto-resolve preceding token when typing comma
    if (val.endsWith(',')) {
      const beforeComma = val.slice(0, -1).trim();
      const resolvedBefore = resolvePredecessorString(beforeComma, tasks, projects, currentProjectCode);
      const merged = enforceRules(resolvedBefore, false);
      onChange(merged + ', ');
      setIsOpen(true);
      return;
    }

    const parts = splitPredecessors(val, knownCodes);
    if (parts.length > 2) {
      val = parts.slice(0, 2).join(', '); // Prevent typing a third predecessor
    }
    
    onChange(val);
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (!isOpen) {
        setIsOpen(true);
      } else {
        e.preventDefault();
        setHighlightedIndex(prev => Math.min(prev + 1, rankedCandidateList.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      if (isOpen) {
        e.preventDefault();
        setHighlightedIndex(prev => Math.max(prev - 1, -1));
      }
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && rankedCandidateList[highlightedIndex]) {
        e.preventDefault();
        e.stopPropagation();
        const selected = rankedCandidateList[highlightedIndex];
        const isSecondPredecessor = segments.length >= 2 || (segments.length === 1 && isTrailingDelimiter);
        handleSelect(selected.task, activeSuffix || (isSecondPredecessor ? 'FF' : undefined));
      } else {
        handleResolveAndClose();
      }
    } else if (e.key === 'Tab') {
      if (isOpen && rankedCandidateList.length > 0 && activeQuery) {
        e.preventDefault();
        e.stopPropagation();
        const selected = highlightedIndex >= 0 ? rankedCandidateList[highlightedIndex] : rankedCandidateList[0];
        const isSecondPredecessor = segments.length >= 2 || (segments.length === 1 && isTrailingDelimiter);
        handleSelect(selected.task, activeSuffix || (isSecondPredecessor ? 'FF' : undefined));
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Exact same text formatting to ensure perfect 1:1 overlay alignment
  const commonTextClasses = "text-sm font-sans leading-normal tracking-normal whitespace-pre";

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        className={cn(
          "w-full relative rounded-lg bg-white dark:bg-[#18181a] border overflow-hidden",
          disabled ? "bg-slate-50 dark:bg-[#18181a] border-slate-200 dark:border-[#444446] opacity-60" : "border-slate-200 dark:border-[#444446] focus-within:ring-2 focus-within:ring-purple-500"
        )}
      >
        <div 
          ref={overlayRef} 
          className={cn(
            "absolute inset-0 px-3 py-2 pointer-events-none overflow-hidden z-10 flex items-center",
            commonTextClasses
          )} 
          aria-hidden="true"
        >
          {renderColoredText(value || "")}
        </div>
        
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          value={value || ''}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={(e) => { if (overlayRef.current) overlayRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          placeholder={value ? "" : "e.g. A01-1SS, A02-2FF"}
          className={cn(
            "w-full px-3 py-2 relative z-20 bg-transparent outline-none border-none focus:ring-0 shadow-none m-0 caret-slate-800 dark:caret-slate-200",
            commonTextClasses
          )}
          style={{ 
            color: value ? "transparent" : "inherit",
            WebkitTextFillColor: value ? "transparent" : "inherit"
          }}
        />
      </div>
      
      {isOpen && activeSegment && rankedCandidateList.length > 0 && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#1c1c1f] border border-slate-200 dark:border-[#333336] rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {rankedCandidateList.map((item, idx) => {
            const t = item.task;
            const isSecondPredecessor = segments.length >= 2 || (segments.length === 1 && isTrailingDelimiter);
            const isExternal = item.isExternal;
            const taskCode = item.exactTaskCode;
            const isHighlighted = idx === highlightedIndex;
            const isBestMatch = activeQuery && idx === 0 && item.score >= 450;

            return (
              <div
                key={t.id}
                onClick={() => !isSecondPredecessor && handleSelect(t, activeSuffix || undefined)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={cn(
                  "p-2.5 border-b border-slate-100 dark:border-[#28282a] last:border-0 transition-colors",
                  isHighlighted ? "bg-purple-50/80 dark:bg-purple-900/30" : "",
                  !isSecondPredecessor ? "hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer flex flex-col" : "flex flex-col bg-slate-50/50 dark:bg-[#18181a]/50"
                )}
              >
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate flex-1">
                      {t.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isBestMatch && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 inline-flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                          {translate("Best Match") || "Best Match"}
                        </span>
                      )}
                      {isExternal && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800 inline-flex items-center gap-1">
                          <ExternalLink className="w-2.5 h-2.5" />
                          {translate("External Link") || "External Link"}: {t.projectCode}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-blue-600 dark:text-[#8ab4f8] font-mono font-bold">
                      {taskCode}
                    </span>
                    {(t.start || t.finish) && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        {t.start ? t.start.substring(5, 10) : ''} {t.start && t.finish ? '→' : ''} {t.finish ? t.finish.substring(5, 10) : ''}
                      </span>
                    )}
                  </div>
                </div>
                
                {isSecondPredecessor && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-[#333336]">
                    <button 
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSelect(t, 'FF'); }}
                      className="flex-1 py-1.5 px-2 text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded transition-colors border border-blue-200 dark:border-blue-800/50"
                    >
                      + FF (Finish-to-Finish)
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSelect(t, 'SF'); }}
                      className="flex-1 py-1.5 px-2 text-[10px] font-bold bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-400 rounded transition-colors border border-rose-200 dark:border-rose-800/50"
                    >
                      + SF (Start-to-Finish)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmExternalModal.isOpen}
        title={translate("Confirm External Predecessor") || "Confirm External Predecessor"}
        message={
          confirmExternalModal.task 
            ? `Công việc "${confirmExternalModal.task.name}" (${computeTaskCode(projects, tasks, confirmExternalModal.task) || confirmExternalModal.task.taskCodePhu || confirmExternalModal.task.id}) thuộc dự án khác [${confirmExternalModal.task.projectCode}]. Bạn có chắc chắn muốn liên kết phụ thuộc (Predecessor) ngoài dự án không? Hệ thống sẽ tự động đồng bộ ngày theo logic Predecessor.`
            : "Bạn có chắc chắn muốn tạo liên kết phụ thuộc ngoài dự án này không?"
        }
        confirmText={translate("Link Predecessor") || "Link Predecessor"}
        confirmStyle="primary"
        onConfirm={() => {
          if (confirmExternalModal.task) {
            handleSelect(confirmExternalModal.task, confirmExternalModal.relationship, true);
          }
          setConfirmExternalModal({ isOpen: false });
        }}
        onCancel={() => {
          setConfirmExternalModal({ isOpen: false });
        }}
      />
    </div>
  );
}


