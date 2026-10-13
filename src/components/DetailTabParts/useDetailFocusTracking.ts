import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { scrollToElement } from '../../lib/utils';

interface UseDetailFocusTrackingParams {
  projects: Project[];
  tasks: Task[];
  initialFilterCode?: string;
  initialFocusTaskId?: string;
  onClearFocus?: () => void;
  onBackToGantt?: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  globalYearFilter: string;
  setGlobalYearFilter: (year: string) => void;
  globalStoreFilter: string;
  setGlobalStoreFilter: (store: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  expandedCodes: string[];
  setExpandedCodes: (codes: string[]) => void;
}

export function useDetailFocusTracking({
  projects,
  tasks,
  initialFilterCode,
  initialFocusTaskId,
  onClearFocus,
  onBackToGantt,
  searchTerm,
  setSearchTerm,
  globalYearFilter,
  setGlobalYearFilter,
  globalStoreFilter,
  setGlobalStoreFilter,
  statusFilter,
  setStatusFilter,
  expandedCodes,
  setExpandedCodes,
}: UseDetailFocusTrackingParams) {
  const setDetailTabFilterCode = useAppStore(state => state.setDetailTabFilterCode);
  const [activeProjectInView, setActiveProjectInView] = useState<Project | null>(null);
  const lastFocusedTaskIdRef = useRef<string | null>(null);

  // Smart Viewport Project Tracking using IntersectionObserver (Debounced to protect 60fps scrolling)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visibleEntriesMap = new Map<Element, IntersectionObserverEntry>();
    let debounceTimer: NodeJS.Timeout | null = null;

    const updateActiveProject = () => {
      let topProjectEl: Element | null = null;
      let minTop = Infinity;

      visibleEntriesMap.forEach((entry, el) => {
        if (entry.isIntersecting) {
          const top = entry.boundingClientRect.top;
          if (top >= 0 && top < minTop) {
            minTop = top;
            topProjectEl = el;
          } else if (topProjectEl === null) {
            topProjectEl = el;
          }
        }
      });

      if (topProjectEl) {
        const code = (topProjectEl as HTMLElement).getAttribute('data-project-code');
        const year = (topProjectEl as HTMLElement).getAttribute('data-project-year');
        const store = (topProjectEl as HTMLElement).getAttribute('data-project-store');
        if (code) {
          const found = projects.find(
            (p) =>
              p.code === code &&
              (String(p.year || '') === String(year || '') || (!p.year && !year)) &&
              (String(p.store || '') === String(store || '') || (!p.store && !store))
          );
          if (found) {
            setActiveProjectInView((prev) => {
              if (
                prev &&
                prev.code === found.code &&
                String(prev.year || '') === String(found.year || '') &&
                String(prev.store || '') === String(found.store || '')
              ) {
                return prev;
              }
              return found;
            });
          }
        }
      }
    };

    const scheduleUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateActiveProject, 200);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleEntriesMap.set(entry.target, entry);
          } else {
            visibleEntriesMap.delete(entry.target);
          }
        });
        scheduleUpdate();
      },
      {
        root: null,
        rootMargin: '-60px 0px -40% 0px',
        threshold: [0, 0.5, 1.0],
      }
    );

    const observeVisibleElements = () => {
      const projectElements = document.querySelectorAll<HTMLElement>('[data-project-item="true"]');
      projectElements.forEach((el) => observer.observe(el));
    };

    const frameId = requestAnimationFrame(observeVisibleElements);

    return () => {
      cancelAnimationFrame(frameId);
      if (debounceTimer) clearTimeout(debounceTimer);
      observer.disconnect();
      visibleEntriesMap.clear();
    };
  }, [projects]);

  const handleClearFocus = useCallback(() => {
    let parentProjectCode = '';
    if (initialFocusTaskId) {
      const focusedTask = tasks.find(t => t.id === initialFocusTaskId);
      if (focusedTask) {
        parentProjectCode = focusedTask.projectCode || '';
      }
    }
    if (!parentProjectCode && initialFilterCode) {
      const matched = projects.find(p => p.code && (initialFilterCode === p.code || initialFilterCode.startsWith(p.code + '-')));
      parentProjectCode = matched?.code || initialFilterCode;
    }
    setSearchTerm(parentProjectCode);
    setDetailTabFilterCode(parentProjectCode);
    lastFocusedTaskIdRef.current = null;
    onClearFocus?.();
  }, [initialFocusTaskId, initialFilterCode, tasks, projects, onClearFocus, setDetailTabFilterCode, setSearchTerm]);

  // Escape key triggers Clear Search / Clear Focus when not in modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const state = useAppStore.getState();
        const hasOpenModal =
          state.isProjectModalOpen ||
          state.isTaskModalOpen ||
          state.isUserModalOpen ||
          state.isLoginModalOpen ||
          state.isCalendarSyncModalOpen;
        if (hasOpenModal) return;

        if (searchTerm) {
          e.preventDefault();
          const activeElement = document.activeElement;
          if (activeElement && typeof (activeElement as HTMLElement).blur === "function") {
            (activeElement as HTMLElement).blur();
          }
          setSearchTerm("");
          setDetailTabFilterCode("");
          onClearFocus?.();
        } else if (initialFocusTaskId) {
          e.preventDefault();
          const activeElement = document.activeElement;
          if (activeElement && typeof (activeElement as HTMLElement).blur === "function") {
            (activeElement as HTMLElement).blur();
          }
          handleClearFocus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchTerm, initialFocusTaskId, handleClearFocus, setDetailTabFilterCode, onClearFocus, setSearchTerm]);

  const handleBackToGantt = () => {
    if (onBackToGantt) {
      onBackToGantt();
    } else {
      if (onClearFocus) onClearFocus();
      useAppStore.getState().setActiveTab('gantt');
    }
  };

  useEffect(() => {
    if (initialFocusTaskId && initialFocusTaskId !== lastFocusedTaskIdRef.current) {
      const task = tasks.find((t) => t.id === initialFocusTaskId);
      if (task) {
        const p = projects.find(
          (proj) =>
            String(proj.code || "").trim().toLowerCase() === String(task.projectCode || "").trim().toLowerCase() &&
            (!task.projectStore || !proj.store || String(proj.store).trim().toLowerCase() === String(task.projectStore).trim().toLowerCase()) &&
            (!task.projectYear || !proj.year || String(proj.year).trim() === String(task.projectYear).trim())
        ) || projects.find(
          (proj) => String(proj.code || "").trim().toLowerCase() === String(task.projectCode || "").trim().toLowerCase()
        );
        lastFocusedTaskIdRef.current = initialFocusTaskId;
        const subTaskCode = task.taskCodePhu || (p ? `${p.code}#${(task.orderIndex !== undefined ? task.orderIndex : 0) + 1}` : '') || task.projectCode;
        if (subTaskCode) {
          setSearchTerm(subTaskCode);
          setDetailTabFilterCode(subTaskCode);
        }
        if (p) {
          if (p.year && globalYearFilter !== 'all' && String(p.year) !== String(globalYearFilter)) {
            setGlobalYearFilter(String(p.year));
          }
          if (p.store && globalStoreFilter !== 'all' && String(p.store) !== String(globalStoreFilter)) {
            setGlobalStoreFilter(p.store);
          }
          if (statusFilter !== 'all') {
            setStatusFilter('all');
          }
          const newCodes = new Set(expandedCodes);
          if (p.id) newCodes.add(String(p.id));
          if (p.code) newCodes.add(p.code);
          if (p.no !== undefined && p.no !== null) newCodes.add(String(p.no));
          if (newCodes.size !== expandedCodes.length) {
            setExpandedCodes(Array.from(newCodes));
          }
          const tryScroll = (attempts = 0) => {
            const el = document.getElementById(`detail-task-${initialFocusTaskId}`);
            if (el) {
              scrollToElement(el);
            } else if (attempts < 15) {
              setTimeout(() => tryScroll(attempts + 1), 80);
            }
          };
          requestAnimationFrame(() => tryScroll(0));
        } else if (task.projectCode) {
          if (statusFilter !== 'all') {
            setStatusFilter('all');
          }
        }
      }
    } else if (!initialFocusTaskId && lastFocusedTaskIdRef.current) {
      lastFocusedTaskIdRef.current = null;
    }
  }, [initialFocusTaskId, tasks, projects, globalYearFilter, globalStoreFilter, statusFilter, setGlobalYearFilter, setGlobalStoreFilter, expandedCodes, setExpandedCodes, setDetailTabFilterCode, setSearchTerm, setStatusFilter]);

  return {
    activeProjectInView,
    handleClearFocus,
    handleBackToGantt,
  };
}
