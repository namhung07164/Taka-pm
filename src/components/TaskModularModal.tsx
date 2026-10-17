import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from "react-dom";
import Draggable from "react-draggable";
import {
  Layers,
  X,
  Search,
  Check,
  Unlink,
  AlertCircle,
  Calendar,
  Clock,
  Briefcase,
  Info,
  GripHorizontal,
} from "lucide-react";
import { Task, Project } from "../types";
import { cn, matchesAdvancedSearch } from "../lib/utils";
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { getZIndexClass, useOverlayStack } from '../lib/zIndexManager';

interface TaskModularModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTaskIds: string[];
  tasks: Task[];
  projects?: Project[];
  onGroupTasks?: (parentTaskId: string, childTaskIds: string[]) => void | Promise<void>;
  onUnlinkTasks?: (childTaskIds: string[]) => void | Promise<void>;
  onGroup?: (parentTaskId: string, childTaskIds: string[]) => void | Promise<void>;
  onUnlink?: (childTaskIds: string[]) => void | Promise<void>;
}

export const TaskModularModal: React.FC<TaskModularModalProps> = ({
  isOpen,
  onClose,
  selectedTaskIds,
  tasks,
  projects = [],
  onGroupTasks,
  onUnlinkTasks,
  onGroup,
  onUnlink,
}) => {
  const [selectedParentTaskId, setSelectedParentTaskId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterScope, setFilterScope] = useState<"same_project" | "all_projects">("same_project");
  const nodeRef = useRef<HTMLDivElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedParentTaskId(null);
      setSearchTerm("");
      setFilterScope("same_project");
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Selected tasks (child candidates)
  const selectedTasks = useMemo(() => {
    const set = new Set(selectedTaskIds.map(String));
    return tasks.filter((t) => set.has(String(t.id)));
  }, [tasks, selectedTaskIds]);

  // Distinct project codes of selected tasks
  const selectedProjectCodes = useMemo(() => {
    return new Set(
      selectedTasks.map((t) => String(t.projectCode || "").trim().toLowerCase()).filter(Boolean)
    );
  }, [selectedTasks]);

  // Map of parentId -> count of existing children
  const childrenCountMap = useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t) => {
      if (t.parentTaskId) {
        const pKey = String(t.parentTaskId);
        map.set(pKey, (map.get(pKey) || 0) + 1);
      }
    });
    return map;
  }, [tasks]);

  // Check if any selected task already has a parent
  const hasAnyLinked = useMemo(() => {
    return selectedTasks.some((t) => !!t.parentTaskId);
  }, [selectedTasks]);

  // Selected parent tasks that currently have children
  const selectedParentsWithChildren = useMemo(() => {
    return selectedTasks.filter((t) => (childrenCountMap.get(String(t.id)) || 0) > 0);
  }, [selectedTasks, childrenCountMap]);

  // All task IDs that will be grouped into the chosen parent
  const allTargetTaskIds = useMemo(() => {
    const parentIdStr = selectedParentTaskId ? String(selectedParentTaskId) : null;
    const targetSet = new Set<string>();

    selectedTaskIds.forEach((id) => {
      const idStr = String(id);
      if (idStr !== parentIdStr) {
        targetSet.add(idStr);
      }
    });

    return Array.from(targetSet);
  }, [selectedTaskIds, selectedParentTaskId]);

  // Candidate parent tasks:
  // Must be a top-level task (no parentTaskId).
  // Can be one of the selected tasks if the user wants to pick a checked task as the parent!
  const candidateParentTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.parentTaskId) return false;
      if (filterScope === "same_project" && selectedProjectCodes.size > 0) {
        const pCode = String(t.projectCode || "").trim().toLowerCase();
        if (!selectedProjectCodes.has(pCode)) return false;
      }
      if (searchTerm.trim()) {
        const isMatch = matchesAdvancedSearch(searchTerm, [t.name, t.projectCode, t.party, t.taskCodePhu]);
        if (!isMatch) return false;
      }
      return true;
    });
  }, [tasks, filterScope, selectedProjectCodes, searchTerm]);

  const zInfo = useOverlayStack({
    layer: 'MODAL_MODULAR',
    isOpen,
    onClose,
    closeOnTabChange: true
  });

  if (!isOpen) return null;

  const chosenParentTask = selectedParentTaskId ? tasks.find((t) => String(t.id) === String(selectedParentTaskId)) : null;

  const handleConfirmGroup = () => {
    if (!selectedParentTaskId || allTargetTaskIds.length === 0) return;
    const groupFn = onGroupTasks || onGroup;
    if (typeof groupFn === 'function') groupFn(String(selectedParentTaskId), allTargetTaskIds);
  };

  const handleConfirmUnlink = () => {
    if (selectedTaskIds.length === 0) return;
    const unlinkFn = onUnlinkTasks || onUnlink;
    if (typeof unlinkFn === 'function') unlinkFn(selectedTaskIds);
  };

  return createPortal(
    <div 
      className={`fixed inset-0 ${zInfo.zClass} flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-hidden pointer-events-auto animate-in fade-in duration-150`} 
      style={{ zIndex: zInfo.zValue || 185000 }}
      onClick={onClose}
    >
      <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button, input, select">
        <div 
          ref={nodeRef}
          className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl w-[96vw] max-w-4xl max-h-[88vh] flex flex-col border border-slate-200 dark:border-[#333336] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal-handle cursor-grab active:cursor-grabbing p-3.5 sm:p-4 border-b border-slate-200 dark:border-[#333336] flex items-center justify-between bg-slate-50/90 dark:bg-[#18181a] select-none shrink-0">
            <div className="flex items-center gap-2.5">
              <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base md:text-lg text-slate-900 dark:text-[#e3e3e3] flex items-center gap-2">
                  Task Modular
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    Gantt Only
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Group selected child tasks into a parent task (toggle collapse/expand on Gantt)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#28282a] transition-colors active:scale-95"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

        {/* Content: 2 Columns on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-4 flex-1 min-h-0 overflow-y-auto bg-slate-100/40 dark:bg-[#121214]">
          {/* Column 1: Selected Tasks (Child tasks) - 5 cols */}
          <div className="lg:col-span-5 flex flex-col h-[280px] lg:h-full min-h-0 bg-white dark:bg-[#1c1c1f] rounded-xl border border-slate-200 dark:border-[#333336] shadow-xs overflow-hidden">
            <div className="p-3 bg-purple-50/60 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900/30 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-extrabold shadow-xs">
                  1
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Selected Child Tasks ({selectedTasks.length})
                </span>
              </div>
              {hasAnyLinked && (
                <button
                  type="button"
                  onClick={handleConfirmUnlink}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 rounded-md border border-red-200 dark:border-red-800 transition-colors active:scale-95 cursor-pointer"
                  title="Unlink parent task for selected tasks"
                >
                  <Unlink className="w-3 h-3" />
                  <span>Unlink Modular</span>
                </button>
              )}
            </div>

            {selectedParentsWithChildren.length > 0 && (
              <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 border-b border-purple-200 dark:border-purple-900/50 flex items-center gap-2 text-[11px] text-purple-900 dark:text-purple-200 shrink-0">
                <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <span>
                  <strong>Single level rule:</strong> {selectedParentsWithChildren.length} parent task(s) selected. All their subtasks will automatically be grouped into the new parent task and unlinked from the old one.
                </span>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
              {selectedTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4 text-slate-400">
                  <AlertCircle className="w-6 h-6 mb-1 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs">No tasks selected.</p>
                </div>
              ) : (
                selectedTasks.map((t) => {
                  const currentParent = t.parentTaskId
                    ? tasks.find((pt) => pt.id === t.parentTaskId)
                    : null;
                  const childCount = childrenCountMap.get(t.id) || 0;
                  return (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-lg border border-slate-200 dark:border-[#38383a] bg-slate-50/50 dark:bg-[#18181a] flex flex-col gap-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-xs text-slate-900 dark:text-[#f3f3f3] leading-snug line-clamp-2">
                          {t.name}
                        </div>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                          {t.projectCode}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 flex-wrap">
                        {t.start && (
                          <span className="flex items-center gap-0.5 font-mono">
                            <Calendar className="w-2.5 h-2.5" />
                            {t.start.slice(0, 10)}
                          </span>
                        )}
                        {t.duration && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {t.duration}d
                          </span>
                        )}
                        {t.delegation && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                            Delegation: ON
                          </span>
                        )}
                        {currentParent && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Current parent: {currentParent.name}
                          </span>
                        )}
                        {childCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            Has {childCount} subtasks (will be moved together)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 2: Choose Parent Task - 7 cols */}
          <div className="lg:col-span-7 flex flex-col h-[380px] lg:h-full min-h-0 bg-white dark:bg-[#1c1c1f] rounded-xl border border-purple-200/80 dark:border-purple-900/30 shadow-xs overflow-hidden">
            <div className="p-3 bg-purple-50/60 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900/30 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-extrabold shadow-xs">
                    2
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Select 1 Parent Task To Group Into
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-[#28282a] p-0.5 rounded-lg text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setFilterScope("same_project")}
                    className={cn(
                      "px-2 py-0.5 rounded transition-colors cursor-pointer",
                      filterScope === "same_project"
                        ? "bg-white dark:bg-[#1e1e20] text-purple-700 dark:text-purple-300 shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    )}
                  >
                    Same Project
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterScope("all_projects")}
                    className={cn(
                      "px-2 py-0.5 rounded transition-colors cursor-pointer",
                      filterScope === "all_projects"
                        ? "bg-white dark:bg-[#1e1e20] text-purple-700 dark:text-purple-300 shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    )}
                  >
                    All Projects
                  </button>
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <DebouncedSearchInput
                  value={searchTerm}
                  onChange={(val) => setSearchTerm(val)}
                  placeholder="Search parent task by name, project code..."
                  className="w-full"
                />
              </div>
            </div>

            {/* Candidate list */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                Candidate List ({candidateParentTasks.length}) — Click to select
              </div>

              {candidateParentTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <p className="text-xs">No matching parent task found.</p>
                  {filterScope === "same_project" && (
                    <button
                      type="button"
                      onClick={() => setFilterScope("all_projects")}
                      className="mt-2 text-xs font-bold text-purple-600 hover:underline cursor-pointer"
                    >
                      Expand search to all projects
                    </button>
                  )}
                </div>
              ) : (
                candidateParentTasks.map((t) => {
                  const tIdStr = String(t.id);
                  const isSelected = selectedParentTaskId !== null && String(selectedParentTaskId) === tIdStr;
                  const childCount = childrenCountMap.get(tIdStr) || childrenCountMap.get(t.id) || 0;

                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedParentTaskId(tIdStr)}
                      className={cn(
                        "p-2.5 rounded-xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3",
                        isSelected
                          ? "border-purple-500 bg-purple-50/80 dark:bg-purple-950/40 shadow-xs ring-1 ring-purple-500"
                          : "border-slate-200 dark:border-[#333336] bg-white dark:bg-[#18181a] hover:border-purple-300 dark:hover:border-purple-800 hover:bg-slate-50 dark:hover:bg-[#202023]"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className={cn(
                            "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                            isSelected
                              ? "border-purple-600 bg-purple-600 text-white"
                              : "border-slate-300 dark:border-slate-600"
                          )}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs text-slate-900 dark:text-[#f3f3f3] truncate">
                              {t.name}
                            </span>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                              {t.projectCode}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                            {t.start && (
                              <span className="font-mono">
                                {t.start.slice(0, 10)} → {t.finish ? t.finish.slice(0, 10) : "?"}
                              </span>
                            )}
                            {t.duration && <span>({t.duration}d)</span>}
                            {t.party && <span>• {t.party}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {childCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            Has {childCount} subtasks
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            Standalone
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#333336] bg-slate-50/90 dark:bg-[#18181a] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5 w-full sm:w-auto">
            {chosenParentTask ? (
              <span className="flex items-center gap-1 font-medium">
                <span className="text-purple-600 dark:text-purple-400 font-bold">Group into:</span>
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[240px] sm:max-w-[340px]">
                  {chosenParentTask.name}
                </span>
                <span className="text-slate-400 font-mono">({chosenParentTask.projectCode})</span>
              </span>
            ) : (
              <span className="text-slate-400 italic">Please select 1 parent task from the list on the right.</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-[#c3c3c3] hover:bg-slate-200 dark:hover:bg-[#28282a] rounded-lg transition-colors active:scale-95 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmGroup}
              disabled={!selectedParentTaskId || allTargetTaskIds.length === 0}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>
                Group into Parent Task ({allTargetTaskIds.length})
                {allTargetTaskIds.length > selectedTaskIds.length && (
                  <span className="ml-1 text-[10px] font-normal opacity-90">
                    (+{allTargetTaskIds.length - selectedTaskIds.length} sub tasks included)
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
      </Draggable>
    </div>,
    document.body
  );
};
