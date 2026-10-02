import { useState, useEffect, useRef } from 'react';
import { Project, Task } from '../types';
import { scrollToElement } from '../lib/utils';

interface UseDetailViewportTrackingParams {
  projects: Project[];
  tasks: Task[];
  initialFilterCode?: string;
  initialFocusTaskId?: string;
  returnScrollId?: string;
  expandedCodes: string[];
  setExpandedCodes: (codes: string[]) => void;
  setDetailTabFilterCode: (code: string) => void;
  onClearFocus?: () => void;
  setSearchTerm: (term: string) => void;
  setStatusFilter: (status: string) => void;
}

export function useDetailViewportTracking({
  projects,
  tasks,
  initialFilterCode,
  initialFocusTaskId,
  returnScrollId,
  expandedCodes,
  setExpandedCodes,
  setDetailTabFilterCode,
  onClearFocus,
  setSearchTerm,
  setStatusFilter,
}: UseDetailViewportTrackingParams) {
  const [activeProjectInView, setActiveProjectInView] = useState<Project | null>(null);
  const lastFocusedTaskIdRef = useRef<string | null>(null);
  const lastProcessedFilterCodeRef = useRef<string | null>(null);

  // Viewport tracking with IntersectionObserver
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visibleEntriesMap = new Map<Element, IntersectionObserverEntry>();
    let rafId: number | null = null;

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
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateActiveProject);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibleEntriesMap.set(entry.target, entry);
        });
        scheduleUpdate();
      },
      { threshold: [0, 0.1, 0.5, 1.0] }
    );

    const projectEls = document.querySelectorAll('.detail-project-row');
    projectEls.forEach((el) => observer.observe(el));

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      visibleEntriesMap.clear();
    };
  }, [projects]);

  // Focus Task effect
  useEffect(() => {
    if (!initialFocusTaskId) return;
    if (lastFocusedTaskIdRef.current === initialFocusTaskId) return;

    const targetTask = tasks.find(t => t.id === initialFocusTaskId);
    if (!targetTask) return;

    lastFocusedTaskIdRef.current = initialFocusTaskId;
    const parentProjectCode = targetTask.projectCode;
    const matchedProj = projects.find(p => p.code === parentProjectCode);

    if (matchedProj && matchedProj.id) {
      setExpandedCodes([...new Set([...expandedCodes, matchedProj.id])]);
    }

    setTimeout(() => {
      const taskEl = document.getElementById(`detail-task-${initialFocusTaskId}`);
      if (taskEl) {
        scrollToElement(taskEl);
      }
    }, 350);

    setDetailTabFilterCode(parentProjectCode);
    lastFocusedTaskIdRef.current = null;
    onClearFocus?.();
  }, [initialFocusTaskId, tasks, projects, onClearFocus, setDetailTabFilterCode, expandedCodes, setExpandedCodes]);

  // Initial Filter Code effect
  useEffect(() => {
    if (initialFilterCode && initialFilterCode !== lastProcessedFilterCodeRef.current) {
      lastProcessedFilterCodeRef.current = initialFilterCode;
      setSearchTerm(initialFilterCode);
      setStatusFilter('all');
      const matchedProj = projects.find(
        (p) => String(p.code || "").trim().toUpperCase() === String(initialFilterCode).trim().toUpperCase()
      ) || projects.find(
        (p) => p.code && String(initialFilterCode).trim().toUpperCase().startsWith(String(p.code).trim().toUpperCase() + '-')
      );
      if (matchedProj && matchedProj.id) {
        setExpandedCodes([...new Set([...expandedCodes, matchedProj.id])]);
      }
      setTimeout(() => {
        const el = (matchedProj ? document.getElementById(`detail-project-${matchedProj.no ?? matchedProj.code}`) : null);
        if (el) scrollToElement(el);
      }, 350);
    }
  }, [initialFilterCode, projects, expandedCodes, setExpandedCodes, setSearchTerm, setStatusFilter]);

  // Return Scroll ID effect
  useEffect(() => {
    if (returnScrollId) {
      setTimeout(() => {
        const el = document.getElementById(returnScrollId);
        if (el) scrollToElement(el);
      }, 300);
    }
  }, [returnScrollId]);

  return {
    activeProjectInView,
  };
}
