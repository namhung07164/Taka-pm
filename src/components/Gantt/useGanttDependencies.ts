import React, { useCallback, useMemo, useState } from 'react';
import { Task, Project } from '../../types';
import { DependencyLine, GanttTableRow } from './ganttTypes';
import { computeAllTaskCodes } from '../../lib/ganttUtils';
import { parseDateTime } from '../../lib/utils';

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

  const allCodesMap = useMemo(() => {
    return computeAllTaskCodes(projects, tasks);
  }, [projects, tasks]);

  const taskCodeMap = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach(t => {
      const code = allCodesMap.get(t.id);
      if (code) {
        map.set(code.trim().toUpperCase(), t);
      }
      if (t.taskCodePhu) {
        map.set(t.taskCodePhu.trim().toUpperCase(), t);
      }
    });
    return map;
  }, [tasks, allCodesMap]);

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
    if (!startDate || visibleGanttRows.length === 0) return [];

    const taskPosMap = new Map<string, { xStart: number; xEnd: number; yCenter: number; t: Task }>();
    let currentY = paddingTop;
    const timelineLeft = sideWidth + (showStart ? startColWidth : 0) + (showFinish ? finishColWidth : 0) + (showParty ? partyColWidth : 0) + (showDuration ? durationColWidth : 0) + (showPredecessor ? predecessorColWidth : 0);

    visibleGanttRows.forEach((row) => {
      const rowHeight = row.type === 'project' ? 40 : 36;
      const yCenter = currentY + rowHeight / 2;
      currentY += rowHeight;

      if (row.type === 'task' && row.task) {
        const t = row.task;
        const dStart = t.start ? parseDateTime(t.start) : null;
        const dEnd = t.finish ? parseDateTime(t.finish) : null;
        if (dStart && dEnd) {
          const startDays = (dStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
          const endDays = (dEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) + 1;
          const xStart = timelineLeft + Math.max(0, startDays * dayWidth);
          const xEnd = timelineLeft + Math.max(0, endDays * dayWidth);

          const posObj = { xStart, xEnd, yCenter, t };
          taskPosMap.set(t.id, posObj);
          if (t.taskCodePhu) {
            taskPosMap.set(t.taskCodePhu.trim().toUpperCase(), posObj);
          }
          const computedCode = allCodesMap.get(t.id);
          if (computedCode) {
            taskPosMap.set(computedCode.trim().toUpperCase(), posObj);
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

      const predCodes = String(succTask.predecessor)
        .split(/[,;]/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      predCodes.forEach((code) => {
        const predPos = taskPosMap.get(code);
        if (!predPos) return;

        const x1 = predPos.xEnd;
        const y1 = predPos.yCenter;
        const x2 = succPos.xStart;
        const y2 = succPos.yCenter;

        const d = generateOrthogonalPath(x1, y1, x2, y2);

        lines.push({
          id: `${predPos.t.id}->${succTask.id}`,
          d,
          fromTaskId: predPos.t.id,
          toTaskId: succTask.id,
          fromTaskCode: predPos.t.taskCodePhu || allCodesMap.get(predPos.t.id) || "",
          fromTaskName: predPos.t.name,
          toTaskCode: succTask.taskCodePhu || allCodesMap.get(succTask.id) || "",
          toTaskName: succTask.name,
          color: '#2563eb',
        });
      });
    });

    return lines;
  }, [
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
