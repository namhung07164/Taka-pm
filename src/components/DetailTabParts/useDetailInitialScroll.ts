import { useEffect, useRef } from 'react';
import { Project, Task, DelegationGroup } from '../../types';
import { scrollToElement } from '../../lib/utils';
import { backfillMissingProjectDates } from '../../lib/projectDatesService';

interface UseDetailInitialScrollParams {
  projects: Project[];
  tasks: Task[];
  delegationGroups: DelegationGroup[];
  initialFilterCode?: string;
  initialFocusTaskId?: string;
  setSearchTerm: (term: string) => void;
  setStatusFilter: (status: string) => void;
}

export function useDetailInitialScroll({
  projects,
  tasks,
  delegationGroups,
  initialFilterCode,
  initialFocusTaskId,
  setSearchTerm,
  setStatusFilter,
}: UseDetailInitialScrollParams) {
  // Backfill dates once loaded (deferred to background microtask to prevent UI freeze during tab navigation)
  useEffect(() => {
    if (projects.length > 0 && tasks.length > 0) {
      const timer = setTimeout(() => {
        backfillMissingProjectDates(projects, tasks, delegationGroups);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [projects.length, tasks.length, delegationGroups.length]);

  // Initial Filter Code Scrolling & Tri-Gate Lazy Loading Target
  const lastProcessedFilterCodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      initialFilterCode &&
      initialFilterCode !== lastProcessedFilterCodeRef.current
    ) {
      lastProcessedFilterCodeRef.current = initialFilterCode;
      setSearchTerm(initialFilterCode);
      setStatusFilter('all');

      const filterUpper = String(initialFilterCode).trim().toUpperCase();
      const matchedProj =
        projects.find(
          (p) => String(p.code || '').trim().toUpperCase() === filterUpper
        ) ||
        projects.find(
          (p) =>
            p.code &&
            filterUpper.startsWith(String(p.code).trim().toUpperCase() + '-')
        ) ||
        projects.find(
          (p) =>
            p.code && filterUpper.includes(String(p.code).trim().toUpperCase())
        );

      // Keep parent row collapsed by default (Tri-Gate Lazy Loading rule).
      // If initialFocusTaskId is present, useDetailFocusTracking will scroll directly to the task.
      if (!initialFocusTaskId) {
        setTimeout(() => {
          const el =
            (matchedProj
              ? document.getElementById(
                  `detail-project-${matchedProj.no ?? matchedProj.code}`
                )
              : null) ||
            document.querySelector(`[data-project-code="${initialFilterCode}"]`);
          if (el && el instanceof HTMLElement) {
            scrollToElement(el);
          }
        }, 300);
      }
    } else if (
      !initialFilterCode &&
      lastProcessedFilterCodeRef.current !== null
    ) {
      lastProcessedFilterCodeRef.current = null;
      if (!initialFocusTaskId) setSearchTerm('');
    }
  }, [
    initialFilterCode,
    initialFocusTaskId,
    projects,
    setSearchTerm,
    setStatusFilter,
  ]);
}
