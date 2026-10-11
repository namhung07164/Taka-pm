import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Task, Project } from '../types';
import { Search, X, Check, ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLanguage } from '../lib/LanguageContext';
import { computeTaskCode, splitPredecessors } from '../lib/ganttUtils';
import { ensureProjectTasksLoaded } from '../lib/taskStateService';
import { useAppStore } from '../store/useAppStore';
import { ConfirmModal } from './ConfirmModal';
import { PredecessorDropdownList } from './PredecessorDropdownList';
import {
  parsePredecessorToken,
  rankCandidateTasks,
  findClosestTaskMatch,
  resolvePredecessorString,
  RankedPredecessorMatch,
  PredecessorContext,
  getTaskProjectDiffDetails,
  ProjectDiffDetails,
  findTaskByQueryOrCode
} from '../lib/predecessorMatchUtils';

export function PredecessorMultiInput({
  value,
  onChange,
  onCommit,
  tasks,
  projects,
  currentProjectId,
  currentProjectCode,
  currentProjectYear,
  currentProjectStore,
  currentProjectLocation,
  disabled
}: {
  value: string;
  onChange: (val: string) => void;
  onCommit?: (val: string) => void;
  tasks: Task[];
  projects: Project[];
  currentProjectId?: string;
  currentProjectCode?: string;
  currentProjectYear?: number | string;
  currentProjectStore?: string;
  currentProjectLocation?: string;
  disabled?: boolean;
}) {
  const { t: translate } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialValueOnFocus = useRef<string>('');
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  React.useLayoutEffect(() => {
    if (selectionRef.current && inputRef.current && document.activeElement === inputRef.current) {
      const { start, end } = selectionRef.current;
      inputRef.current.setSelectionRange(start, end);
      selectionRef.current = null;
    }
  });

  const [confirmExternalModal, setConfirmExternalModal] = useState<{
    isOpen: boolean;
    task?: Task;
    relationship?: string;
    diffDetails?: ProjectDiffDetails;
    pendingValue?: string;
  }>({ isOpen: false });

  const currentContext: PredecessorContext = useMemo(() => ({
    projectId: currentProjectId,
    projectCode: currentProjectCode,
    projectYear: currentProjectYear,
    projectStore: currentProjectStore,
    projectLocation: currentProjectLocation
  }), [currentProjectId, currentProjectCode, currentProjectYear, currentProjectStore, currentProjectLocation]);

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

  const handleResolveAndClose = (triggerCommit: boolean = false) => {
    setIsOpen(false);
    if (!value) {
      if (triggerCommit) onCommit?.('');
      return;
    }
    const resolved = resolvePredecessorString(value, tasks, projects, currentProjectCode, currentContext);
    const merged = enforceRules(resolved, true);
    if (merged !== value) {
      // Check if newly introduced predecessor tokens are from a different project
      const oldTokens = splitPredecessors(initialValueOnFocus.current || '', knownCodes)
        .map(t => parsePredecessorToken(t).query.toLowerCase());
      const newTokens = splitPredecessors(merged, knownCodes);

      let diffItem: { task: Task; diff: ProjectDiffDetails; merged: string } | null = null;
      for (const tok of newTokens) {
        const { query } = parsePredecessorToken(tok);
        if (!query || oldTokens.includes(query.toLowerCase())) continue;

        const matchedTask = findTaskByQueryOrCode(query, tasks, projects, currentContext);
        if (matchedTask) {
          const diff = getTaskProjectDiffDetails(currentContext, matchedTask, projects);
          if (diff.isDifferent) {
            diffItem = { task: matchedTask, diff, merged };
            break;
          }
        }
      }

      if (diffItem) {
        setConfirmExternalModal({
          isOpen: true,
          task: diffItem.task,
          diffDetails: diffItem.diff,
          pendingValue: diffItem.merged
        });
        return;
      }

      onChange(merged);
      if (triggerCommit) {
        onCommit?.(merged);
      }
    } else {
      if (triggerCommit) {
        onCommit?.(merged);
      }
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (isOpen) {
          handleResolveAndClose();
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen, value, onChange, knownCodes, tasks, projects, currentProjectCode, currentContext]);

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
    if (!activeQuery || activeQuery.trim().length < 3) return;
    const clean = activeQuery.toLowerCase().trim();
    if (!clean) return;

    const currentPCodeLower = (currentProjectCode || '').toLowerCase().trim();
    const cleanPrefix = clean.split(/[-_#\s]+/)[0] || clean;

    const timer = setTimeout(() => {
      const matchedProjects = (projects || []).filter(p => {
        if (!p.code) return false;
        const pCodeLower = p.code.toLowerCase().trim();
        if (pCodeLower === currentPCodeLower) return false;

        // Exact match or project code followed by subtask separator (# or -)
        return (
          pCodeLower === clean ||
          pCodeLower === cleanPrefix ||
          clean.startsWith(pCodeLower + '#') ||
          clean.startsWith(pCodeLower + '-')
        );
      });

      matchedProjects.forEach(p => {
        ensureProjectTasksLoaded(p.code);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [activeQuery, projects, currentProjectCode]);

  // Ranked candidate tasks: closest match first, strongly scoped to current project/year/store/location
  const rankedCandidateList = useMemo(() => {
    // Pool all tasks from store to ensure candidates are not missed due to table filters
    const storeTasks = typeof window !== 'undefined' ? (useAppStore.getState?.()?.tasks || []) : [];
    const taskMap = new Map<string, Task>();
    (storeTasks || []).forEach(t => { if (t && t.id) taskMap.set(t.id, t); });
    (tasks || []).forEach(t => { if (t && t.id) taskMap.set(t.id, t); });
    const allCandidatePool = taskMap.size > 0 ? Array.from(taskMap.values()) : tasks;

    const searchClean = activeQuery.trim();
    if (!searchClean) {
      // In-scope tasks (same parent project, year, store, location)
      const inScopeTasks = allCandidatePool.filter(t => {
        const diff = getTaskProjectDiffDetails(currentContext, t, projects);
        return !diff.isDifferent;
      });
      const list = inScopeTasks.length > 0 ? inScopeTasks : allCandidatePool;
      return list.slice(0, 15).map(t => {
        const diff = getTaskProjectDiffDetails(currentContext, t, projects);
        return {
          task: t,
          score: 0,
          exactTaskCode: computeTaskCode(projects, allCandidatePool, t) || t.taskCodePhu || t.id,
          isExternal: diff.isDifferent,
          diffDetails: diff
        };
      });
    }

    return rankCandidateTasks(searchClean, allCandidatePool, projects, allCandidatePool, currentProjectCode, currentContext).slice(0, 25);
  }, [activeQuery, tasks, projects, currentProjectId, currentProjectCode, currentProjectYear, currentProjectStore, currentProjectLocation, currentContext]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [activeQuery]);

  const executeSelect = (task: Task, relationship?: string, triggerCommit: boolean = true) => {
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
    
    // Cleanly merge without forcing unwanted trailing commas or spaces
    const merged = newSegments.slice(0, 2).join(', ');
    
    onChange(merged);
    setIsOpen(false);
    setHighlightedIndex(-1);

    if (inputRef.current) {
      inputRef.current.blur();
    }

    if (triggerCommit) {
      onCommit?.(merged);
    }
  };

  const handleSelect = (task: Task, relationship?: string, forceConfirmed: boolean = false, triggerCommit: boolean = true) => {
    const diff = getTaskProjectDiffDetails(currentContext, task, projects);
    if (diff.isDifferent && !forceConfirmed) {
      setConfirmExternalModal({
        isOpen: true,
        task,
        relationship,
        diffDetails: diff
      });
      return;
    }
    executeSelect(task, relationship, triggerCommit);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const rawStart = e.target.selectionStart ?? rawVal.length;
    const rawEnd = e.target.selectionEnd ?? rawVal.length;

    let upper = rawVal.toUpperCase();
    let cleaned = '';
    let newStart = rawStart;
    let newEnd = rawEnd;

    for (let i = 0; i < upper.length; i++) {
      const char = upper[i];
      if (/[A-Z0-9\-\+\.,\s#]/.test(char)) {
        cleaned += char;
      } else {
        if (i < rawStart) newStart--;
        if (i < rawEnd) newEnd--;
      }
    }

    // Limit to max 2 predecessors (at most 1 comma separating tokens)
    let finalVal = cleaned;
    const firstCommaIdx = cleaned.indexOf(',');
    if (firstCommaIdx !== -1) {
      const secondCommaIdx = cleaned.indexOf(',', firstCommaIdx + 1);
      if (secondCommaIdx !== -1) {
        finalVal = cleaned.substring(0, secondCommaIdx) + cleaned.substring(secondCommaIdx + 1);
        if (newStart > secondCommaIdx) newStart--;
        if (newEnd > secondCommaIdx) newEnd--;
      }
    }

    selectionRef.current = { start: Math.max(0, newStart), end: Math.max(0, newEnd) };
    onChange(finalVal);
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
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && rankedCandidateList[highlightedIndex]) {
        e.stopPropagation();
        const selected = rankedCandidateList[highlightedIndex];
        const isSecondPredecessor = segments.length >= 2 || (segments.length === 1 && isTrailingDelimiter);
        handleSelect(selected.task, activeSuffix || (isSecondPredecessor ? 'FF' : undefined), false, true);
      } else if (isOpen && rankedCandidateList.length > 0 && activeQuery && rankedCandidateList[0].score >= 450) {
        e.stopPropagation();
        const selected = rankedCandidateList[0];
        const isSecondPredecessor = segments.length >= 2 || (segments.length === 1 && isTrailingDelimiter);
        handleSelect(selected.task, activeSuffix || (isSecondPredecessor ? 'FF' : undefined), false, true);
      } else {
        handleResolveAndClose(true);
      }
    } else if (e.key === 'Tab') {
      if (isOpen && rankedCandidateList.length > 0 && activeQuery) {
        e.preventDefault();
        e.stopPropagation();
        const selected = highlightedIndex >= 0 ? rankedCandidateList[highlightedIndex] : rankedCandidateList[0];
        const isSecondPredecessor = segments.length >= 2 || (segments.length === 1 && isTrailingDelimiter);
        handleSelect(selected.task, activeSuffix || (isSecondPredecessor ? 'FF' : undefined), false, true);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const getBadgeLabel = (item: RankedPredecessorMatch) => {
    const diff = item.diffDetails;
    if (!diff || !diff.diffFactors || diff.diffFactors.length === 0) {
      return item.task.projectCode || translate("External") || "External";
    }
    const factors = diff.diffFactors;
    if (factors.length === 1) {
      if (factors[0] === 'year') return `${translate("Diff Year") || "Khác Năm"}: ${diff.taskInfo.year}`;
      if (factors[0] === 'store') return `${translate("Diff Store") || "Khác Chi nhánh"}: ${diff.taskInfo.store}`;
      if (factors[0] === 'location') return `${translate("Diff Location") || "Khác Vị trí/Tầng"}: ${diff.taskInfo.location}`;
      if (factors[0] === 'code') return `${translate("Diff Project") || "Khác Dự án"}: ${diff.taskInfo.code}`;
    }
    const factorLabels = factors.map(f => {
      if (f === 'year') return translate("Year") || 'Năm';
      if (f === 'store') return translate("Store") || 'Chi nhánh';
      if (f === 'location') return translate("Location") || 'Vị trí';
      return translate("Project") || 'Dự án';
    });
    return `${translate("Cross-Project") || "Khác Dự án"} (${factorLabels.join(', ')})`;
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        className={cn(
          "w-full relative rounded-lg bg-white dark:bg-[#18181a] border overflow-hidden flex items-center transition-colors",
          disabled ? "bg-slate-50 dark:bg-[#18181a] border-slate-200 dark:border-[#444446] opacity-60" : "border-slate-200 dark:border-[#444446] focus-within:ring-2 focus-within:ring-blue-500 dark:focus-within:ring-blue-400 focus-within:border-transparent"
        )}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          value={value || ''}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            initialValueOnFocus.current = value || '';
            setIsOpen(true);
          }}
          disabled={disabled}
          placeholder={value ? "" : "e.g. A01-1SS, A02-2FF"}
          className={cn(
            "w-full px-3 py-2 bg-transparent outline-none border-none focus:ring-0 shadow-none m-0 font-mono font-bold text-sm tracking-normal leading-normal text-blue-600 dark:text-[#8ab4f8] placeholder:text-slate-400 dark:placeholder:text-slate-500 caret-blue-600 dark:caret-[#8ab4f8]",
            value && !disabled ? "pr-8" : ""
          )}
        />

        {value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange('');
              setIsOpen(false);
              if (inputRef.current) {
                inputRef.current.focus();
                selectionRef.current = { start: 0, end: 0 };
              }
            }}
            className="absolute right-2 z-10 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={translate("Clear") || "Clear"}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      
      <PredecessorDropdownList
        isOpen={isOpen}
        activeSegment={activeSegment}
        rankedCandidateList={rankedCandidateList}
        disabled={disabled}
        highlightedIndex={highlightedIndex}
        setHighlightedIndex={setHighlightedIndex}
        segments={segments}
        isTrailingDelimiter={isTrailingDelimiter}
        activeQuery={activeQuery}
        activeSuffix={activeSuffix}
        handleSelect={handleSelect}
        getBadgeLabel={getBadgeLabel}
      />

      <ConfirmModal
        isOpen={confirmExternalModal.isOpen}
        title={translate("Confirm Cross-Project Predecessor") || "Xác nhận liên kết khác dự án"}
        message={
          confirmExternalModal.task 
            ? (
                confirmExternalModal.diffDetails?.reasons?.length
                  ? `Công việc "${confirmExternalModal.task.name}" (${computeTaskCode(projects, tasks, confirmExternalModal.task) || confirmExternalModal.task.taskCodePhu || confirmExternalModal.task.id}) thuộc dự án khác do khác yếu tố: [${confirmExternalModal.diffDetails.reasons.join(', ')}]. Bạn có đồng ý liên kết phụ thuộc (Predecessor) khác dự án không? Hệ thống sẽ tự động đồng bộ ngày theo logic Predecessor.`
                  : `Công việc "${confirmExternalModal.task.name}" (${computeTaskCode(projects, tasks, confirmExternalModal.task) || confirmExternalModal.task.taskCodePhu || confirmExternalModal.task.id}) thuộc dự án khác [${confirmExternalModal.task.projectCode}]. Bạn có đồng ý liên kết phụ thuộc (Predecessor) ngoài dự án không? Hệ thống sẽ tự động đồng bộ ngày theo logic Predecessor.`
              )
            : "Bạn có chắc chắn muốn tạo liên kết phụ thuộc ngoài dự án này không?"
        }
        confirmText={translate("Agree & Link") || "Đồng ý liên kết"}
        confirmStyle="primary"
        onConfirm={() => {
          if (confirmExternalModal.task) {
            handleSelect(confirmExternalModal.task, confirmExternalModal.relationship, true);
          } else if (confirmExternalModal.pendingValue) {
            onChange(confirmExternalModal.pendingValue);
          }
          setConfirmExternalModal({ isOpen: false });
        }}
        onCancel={() => {
          if (confirmExternalModal.pendingValue) {
            onChange(initialValueOnFocus.current || '');
          }
          setConfirmExternalModal({ isOpen: false });
        }}
      />
    </div>
  );
}


