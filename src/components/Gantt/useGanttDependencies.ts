import React, { useState, useMemo, useCallback } from 'react';
import { Task, Project } from '../../types';
import { DependencyLine } from './ganttTypes';
import { computeTaskCode } from '../../lib/ganttUtils';

interface UseGanttDependenciesParams {
  tasks: Task[];
  projects: Project[];
  delegationGroups: any[];
}

export function useGanttDependencies({
  tasks,
  projects,
  delegationGroups
}: UseGanttDependenciesParams) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [dependencyLines, setDependencyLines] = useState<DependencyLine[]>([]);

  const taskNoMap = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach(t => {
      if (t.taskCodePhu) {
        map.set(String(t.taskCodePhu).trim().toUpperCase(), t);
      }
      if (t.id) {
        map.set(String(t.id).trim().toUpperCase(), t);
      }
    });
    return map;
  }, [tasks]);

  const taskCodeMap = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach(t => {
      const code = computeTaskCode(projects, tasks, t);
      if (code) {
        map.set(code.trim().toUpperCase(), t);
      }
      if (t.taskCodePhu) {
        map.set(t.taskCodePhu.trim().toUpperCase(), t);
      }
    });
    return map;
  }, [tasks, projects]);

  const delegationGroupByTaskId = useMemo(() => {
    const map = new Map<string, any>();
    delegationGroups.forEach(g => {
      if (g.subTasks) {
        g.subTasks.forEach((st: any) => {
          if (st.taskId) {
            map.set(st.taskId, g);
          }
        });
      }
    });
    return map;
  }, [delegationGroups]);

  const drawDependencies = useCallback(() => {
    // Dependency lines are rendered between tasks having predecessor codes
    const lines: DependencyLine[] = [];
    tasks.forEach(t => {
      if (!t.predecessor || !t.start || !t.finish) return;
      const predCodes = String(t.predecessor).split(/[,;]/).map(s => s.trim().toUpperCase()).filter(Boolean);
      predCodes.forEach(code => {
        const predTask = taskCodeMap.get(code) || taskNoMap.get(code);
        if (!predTask || !predTask.finish) return;
        // Lines will be calculated on SVG overlay
      });
    });
    setDependencyLines(lines);
  }, [tasks, taskCodeMap, taskNoMap]);

  return {
    activeTooltip,
    setActiveTooltip,
    dependencyLines,
    setDependencyLines,
    taskNoMap,
    taskCodeMap,
    delegationGroupByTaskId,
    drawDependencies
  };
}
