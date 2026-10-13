import React, { useEffect, useRef } from 'react';
import { Project, Task, DelegationGroup } from '../../types';
import { scrollToElement } from '../../lib/utils';
import {
  backfillMissingProjectDates,
  getAppBootAgeMs,
  BOOT_SYNC_GUARD_MS,
} from '../../lib/projectDatesService';

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
        const tryScrollToProject = (attempts = 0) => {
          let el: HTMLElement | null = null;
          if (filterUpper.includes('#')) {
            const matchedTask = tasks.find((t) => 
              (t.taskCodePhu && String(t.taskCodePhu).trim().toUpperCase() === filterUpper) ||
              (matchedProj && matchedProj.code && `${matchedProj.code}#${(t.orderIndex !== undefined ? t.orderIndex : 0) + 1}`.toUpperCase() === filterUpper)
            );
            if (matchedTask) {
              el = document.getElementById(`detail-task-${matchedTask.id}`);
            }
          }
          if (!el) {
            const pCode = matchedProj?.code || initialFilterCode;
            const pId = matchedProj?.id;
            el =
              (matchedProj
                ? document.getElementById(
                    `detail-project-${matchedProj.no ?? matchedProj.code}`
                  )
                : null) ||
              (pCode ? document.querySelector(`[data-project-code="${pCode}"]`) : null) ||
              (pCode ? document.querySelector(`[data-project-code="${pCode.toUpperCase()}"]`) : null) ||
              (pId ? document.querySelector(`[data-project-id="${pId}"]`) : null);
          }
          if (el && el instanceof HTMLElement) {
            scrollToElement(el);
          } else if (attempts < 12) {
            setTimeout(() => tryScrollToProject(attempts + 1), 80);
          }
        };
        requestAnimationFrame(() => tryScrollToProject(0));
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
