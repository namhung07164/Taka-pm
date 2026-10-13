import React, { useState, useMemo } from 'react';
import { Task, Project } from '../../types';
import { DependencyLine, GanttTableRow } from './ganttTypes';
import { computeTaskCode, buildTaskNoMap, parsePredecessors } from '../../lib/ganttUtils';
import { parsePredecessorToken } from '../../lib/predecessorMatchUtils';
import { parseDateTime } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';

interface UseGanttDependenciesParams {
  tasks: Task[];
  projects: Project[];
  delegationGroups: any[];
  visibleGanttRows?: GanttTableRow[];
  startDate?: Date;
  dayWidth?: number;
  sideWidth?: number;
  paddingTop?: number;
  showStart?: boolean;
  startColWidth?: number;
  showFinish?: boolean;
  finishColWidth?: number;
  showParty?: boolean;
  partyColWidth?: number;
  showDuration?: boolean;
  durationColWidth?: number;
  showPredecessor?: boolean;
  predecessorColWidth?: number;
}

function generateOrthogonalPath(x1: number, y1: number, x2: number, y2: number): string {
  const r = 5;
  const minGap = 20;

  if (Math.abs(y1 - y2) < 1) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const isDown = y2 > y1;
  const dy = isDown ? r : -r;

  if (x2 >= x1 + minGap) {
    const xMid = Math.round(x1 + Math.min(24, (x2 - x1) / 2));
    return [
      `M ${x1} ${y1}`,
      `L ${xMid - r} ${y1}`,
      `Q ${xMid} ${y1} ${xMid} ${y1 + dy}`,
      `L ${xMid} ${y2 - dy}`,
      `Q ${xMid} ${y2} ${xMid + r} ${y2}`,
      `L ${x2} ${y2}`,
    ].join(' ');
  }

  const marginOut = 14;
  const marginIn = 14;
  const yMid = Math.round(y1 + (y2 - y1) / 2);

  return [
    `M ${x1} ${y1}`,
    `L ${x1 + marginOut - r} ${y1}`,
    `Q ${x1 + marginOut} ${y1} ${x1 + marginOut} ${y1 + dy}`,
    `L ${x1 + marginOut} ${yMid - dy}`,
    `Q ${x1 + marginOut} ${yMid} ${x1 + marginOut - r} ${yMid}`,
    `L ${x2 - marginIn + r} ${yMid}`,
    `Q ${x2 - marginIn} ${yMid} ${x2 - marginIn} ${yMid + dy}`,
    `L ${x2 - marginIn} ${y2 - dy}`,
    `Q ${x2 - marginIn} ${y2} ${x2 - marginIn + r} ${y2}`,
    `L ${x2} ${y2}`,
  ].join(' ');
}

export function useGanttDependencies({
  tasks,
  projects,
  delegationGroups,
  visibleGanttRows = [],
  startDate,
  dayWidth = 24,
  sideWidth = 220,
  paddingTop = 0,
  showStart = false,
  startColWidth = 80,
  showFinish = false,
  finishColWidth = 80,
  showParty = false,
  partyColWidth = 70,
  showDuration = false,
  durationColWidth = 50,
  showPredecessor = false,
  predecessorColWidth = 90,
}: UseGanttDependenciesParams) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const ganttShowDependencies = useAppStore((state) => state.ganttShowDependencies);

  const fullTaskNoMap = useMemo(() => {
    return buildTaskNoMap(tasks, projects);
  }, [tasks, projects]);

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

  const dependencyLines = useMemo(() => {
    if (!ganttShowDependencies || !startDate || visibleGanttRows.length === 0) return [];

    const taskPosMap = new Map<string, { xStart: number; xEnd: number; yCenter: number; t: Task }>();
    let currentY = paddingTop;
    const timelineLeft = sideWidth + (showStart ? startColWidth : 0) + (showFinish ? finishColWidth : 0) + (showParty ? partyColWidth : 0) + (showDuration ? durationColWidth : 0) + (showPredecessor ? predecessorColWidth : 0);

    visibleGanttRows.forEach((row) => {
      const rowHeight = row.type === 'project' ? 40 : 36;
      const yCenter = currentY + rowHeight / 2;
      currentY += rowHeight;

      if (row.type === 'task' && row.task) {
        const t = row.task;
        const dStart = t.start ? parseDateTime(t.start) : (t.computedTakStart ? parseDateTime(t.computedTakStart) : null);
        const dEnd = t.finish ? parseDateTime(t.finish) : (t.computedTakCompl ? parseDateTime(t.computedTakCompl) : null);
        if (dStart && dEnd) {
          const startDays = (dStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
          const endDays = (dEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) + 1;
          const xStart = timelineLeft + Math.max(0, startDays * dayWidth);
          const xEnd = timelineLeft + Math.max(0, endDays * dayWidth);

          const posObj = { xStart, xEnd, yCenter, t };
          taskPosMap.set(t.id, posObj);
          if (t.taskCodePhu) {
            taskPosMap.set(String(t.taskCodePhu).trim().toUpperCase(), posObj);
          }
          const computedCode = computeTaskCode(projects, tasks, t);
          if (computedCode) {
            taskPosMap.set(computedCode.trim().toUpperCase(), posObj);
          }
          if (row.no !== undefined && row.no !== null) {
            const rowNoStr = String(row.no).trim().toUpperCase();
            taskPosMap.set(rowNoStr, posObj);
            taskPosMap.set(`#${rowNoStr}`, posObj);
          }
        }
      }
    });

    const lines: DependencyLine[] = [];

    visibleGanttRows.forEach((row) => {
      if (row.type !== 'task' || !row.task) return;
      const succTask = row.task;
      if (!succTask.predecessor) return;

      const succPos = taskPosMap.get(succTask.id);
      if (!succPos) return;

      const parsedPreds = parsePredecessors(succTask.predecessor, fullTaskNoMap, succTask);

      parsedPreds.forEach((predObj) => {
        let predPos = predObj.task ? taskPosMap.get(predObj.task.id) : null;
        if (!predPos && predObj.no) {
          const { query } = parsePredecessorToken(predObj.no);
          const cleanQuery = query.trim().toUpperCase();
          predPos = taskPosMap.get(cleanQuery);
        }
        if (!predPos) return;

        const type = (predObj.type || 'FS').toUpperCase();
        let x1 = predPos.xEnd;
        if (type === 'SS' || type === 'SF') {
          x1 = predPos.xStart;
        }
        let x2 = succPos.xStart;
        if (type === 'FF' || type === 'SF') {
          x2 = succPos.xEnd;
        }

        const y1 = predPos.yCenter;
        const y2 = succPos.yCenter;

        const d = generateOrthogonalPath(x1, y1, x2, y2);

        lines.push({
          id: `${predPos.t.id}->${succTask.id}-${type}`,
          d,
          fromTaskId: predPos.t.id,
          toTaskId: succTask.id,
          fromTaskCode: predPos.t.taskCodePhu || computeTaskCode(projects, tasks, predPos.t),
          fromTaskName: predPos.t.name,
          toTaskCode: succTask.taskCodePhu || computeTaskCode(projects, tasks, succTask),
          toTaskName: succTask.name,
          color: '#2563eb',
        });
      });
    });

    return lines;
  }, [
    ganttShowDependencies,
    visibleGanttRows,
    startDate,
    dayWidth,
    sideWidth,
    paddingTop,
    showStart,
    startColWidth,
    showFinish,
    finishColWidth,
    showParty,
    partyColWidth,
    showDuration,
    durationColWidth,
    showPredecessor,
    predecessorColWidth,
    projects,
    tasks,
    fullTaskNoMap,
  ]);

  return {
    activeTooltip,
    setActiveTooltip,
    dependencyLines,
    taskNoMap,
    taskCodeMap,
    delegationGroupByTaskId,
  };
}
