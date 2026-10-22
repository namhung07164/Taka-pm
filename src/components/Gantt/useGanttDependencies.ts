import React, { useCallback, useMemo, useState } from 'react';
import { Task, Project } from '../../types';
import { DependencyLine, GanttTableRow } from './ganttTypes';
import { computeAllTaskCodes } from '../../lib/ganttUtils';
import { parseDateTime } from '../../lib/utils';
import { findClosestTaskMatch, buildProjectLookupIndex, resolveProjectContext } from '../../lib/predecessorMatchUtils';

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

interface Point {
  x: number;
  y: number;
}

function buildRoundedOrthogonalPath(points: Point[], cornerRadius = 5): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const pPrev = points[i - 1];
    const pCurr = points[i];
    const pNext = points[i + 1];

    const dx1 = pCurr.x - pPrev.x;
    const dy1 = pCurr.y - pPrev.y;
    const len1 = Math.hypot(dx1, dy1);

    const dx2 = pNext.x - pCurr.x;
    const dy2 = pNext.y - pCurr.y;
    const len2 = Math.hypot(dx2, dy2);

    const r = Math.min(cornerRadius, len1 / 2, len2 / 2);

    if (r < 1 || len1 === 0 || len2 === 0) {
      path += ` L ${pCurr.x} ${pCurr.y}`;
    } else {
      const startX = pCurr.x - (dx1 / len1) * r;
      const startY = pCurr.y - (dy1 / len1) * r;
      const endX = pCurr.x + (dx2 / len2) * r;
      const endY = pCurr.y + (dy2 / len2) * r;

      path += ` L ${startX} ${startY} Q ${pCurr.x} ${pCurr.y} ${endX} ${endY}`;
    }
  }

  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;

  return path;
}

export function generateGanttPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  relType: string = 'FS',
  laneIndex: number = 0
): { d: string; arrowDir: 'left' | 'right' } {
  const laneOffset = (laneIndex % 5 - 2) * 4;

  if (Math.abs(y1 - y2) < 2) {
    if (relType === 'FS' || relType === 'SS') {
      return { d: `M ${x1} ${y1} L ${x2} ${y2}`, arrowDir: 'right' };
    }
    return { d: `M ${x1} ${y1} L ${x2} ${y2}`, arrowDir: 'left' };
  }

  if (relType === 'FS') {
    const arrowDir = 'right';
    if (x2 >= x1 + 16) {
      const xMid = Math.round(x1 + Math.min(18 + Math.abs(laneOffset), (x2 - x1) / 2));
      const points: Point[] = [
        { x: x1, y: y1 },
        { x: xMid, y: y1 },
        { x: xMid, y: y2 },
        { x: x2, y: y2 },
      ];
      return { d: buildRoundedOrthogonalPath(points, 5), arrowDir };
    } else {
      const xExit = Math.round(x1 + 12 + Math.max(0, laneOffset));
      const xEntry = Math.round(x2 - 12 - Math.max(0, -laneOffset));
      const yMid = Math.round(y1 + (y2 - y1) / 2);

      const points: Point[] = [
        { x: x1, y: y1 },
        { x: xExit, y: y1 },
        { x: xExit, y: yMid },
        { x: xEntry, y: yMid },
        { x: xEntry, y: y2 },
        { x: x2, y: y2 },
      ];
      return { d: buildRoundedOrthogonalPath(points, 5), arrowDir };
    }
  }

  if (relType === 'SS') {
    const arrowDir = 'right';
    const xExit = Math.round(Math.min(x1, x2) - 14 - Math.abs(laneOffset));
    const points: Point[] = [
      { x: x1, y: y1 },
      { x: xExit, y: y1 },
      { x: xExit, y: y2 },
      { x: x2, y: y2 },
    ];
    return { d: buildRoundedOrthogonalPath(points, 5), arrowDir };
  }

  if (relType === 'FF') {
    const arrowDir = 'left';
    const xExit = Math.round(Math.max(x1, x2) + 14 + Math.abs(laneOffset));
    const points: Point[] = [
      { x: x1, y: y1 },
      { x: xExit, y: y1 },
      { x: xExit, y: y2 },
      { x: x2, y: y2 },
    ];
    return { d: buildRoundedOrthogonalPath(points, 5), arrowDir };
  }

  // SF (Start-to-Finish)
  const arrowDir = 'left';
  const xExit = Math.round(x1 - 12 - Math.abs(laneOffset));
  const xEntry = Math.round(x2 + 12 + Math.abs(laneOffset));
  const yMid = Math.round(y1 + (y2 - y1) / 2);

  const points: Point[] = [
    { x: x1, y: y1 },
    { x: xExit, y: y1 },
    { x: xExit, y: yMid },
    { x: xEntry, y: yMid },
    { x: xEntry, y: y2 },
    { x: x2, y: y2 },
  ];
  return { d: buildRoundedOrthogonalPath(points, 5), arrowDir };
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

  const projectIndex = useMemo(() => {
    return buildProjectLookupIndex(projects);
  }, [projects]);

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
      // GanttProjectRow is 48px, GanttTaskRow is 40px
      const rowHeight = row.type === 'project' ? 48 : 40;
      const yCenter = currentY + rowHeight / 2;
      currentY += rowHeight;

      if (row.type === 'task' && row.task) {
        const t = row.task;
        const dStart = t.start ? parseDateTime(t.start) : null;
        const dEnd = t.finish ? parseDateTime(t.finish) : null;
        if (dStart && dEnd) {
          const isMilestone = Number(t.duration) === 0 || Math.abs(dStart.getTime() - dEnd.getTime()) < 3600000;
          const offsetDays = (dStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
          const durationDays = Math.max((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24) + 1, 1);
          const barLeft = offsetDays * dayWidth;
          const barWidth = isMilestone ? 16 : Math.max(durationDays * dayWidth, 8);

          const xStart = timelineLeft + barLeft;
          const xEnd = timelineLeft + barLeft + barWidth;

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
    let laneCounter = 0;

    visibleGanttRows.forEach((row) => {
      if (row.type !== 'task' || !row.task) return;
      const succTask = row.task;
      if (!succTask.predecessor) return;

      const succPos = taskPosMap.get(succTask.id);
      if (!succPos) return;

      const predCodes = String(succTask.predecessor)
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);

      predCodes.forEach((token) => {
        const typeMatch = token.match(/^(.*?)(FS|SS|FF|SF)(\s*[+-]\s*\d+(?:\.\d+)?)?$/i);
        const cleanQuery = typeMatch ? typeMatch[1].trim() : token.replace(/(\s*[+-]\s*\d+(?:\.\d+)?)?$/, '').trim();
        const relType = typeMatch ? typeMatch[2].toUpperCase() : 'FS';

        let predPos = taskPosMap.get(cleanQuery.toUpperCase()) || taskPosMap.get(token.toUpperCase());
        if (!predPos) {
          const match = findClosestTaskMatch(
            cleanQuery,
            tasks,
            projects,
            tasks,
            succTask.projectCode,
            650,
            { projectCode: succTask.projectCode, projectYear: succTask.projectYear, projectStore: succTask.projectStore },
            undefined,
            { projectIndex, allTaskCodesMap: allCodesMap }
          );
          if (match && match.task) {
            predPos = taskPosMap.get(match.task.id);
          }
        }
        if (!predPos) return;

        let x1 = predPos.xEnd;
        let x2 = succPos.xStart;
        if (relType === 'SS') {
          x1 = predPos.xStart;
          x2 = succPos.xStart;
        } else if (relType === 'FF') {
          x1 = predPos.xEnd;
          x2 = succPos.xEnd;
        } else if (relType === 'SF') {
          x1 = predPos.xStart;
          x2 = succPos.xEnd;
        }

        const y1 = predPos.yCenter;
        const y2 = succPos.yCenter;

        const pathResult = generateGanttPath(x1, y1, x2, y2, relType, laneCounter++);

        lines.push({
          id: `${predPos.t.id}->${succTask.id}-${relType}-${laneCounter}`,
          d: pathResult.d,
          arrowDir: pathResult.arrowDir,
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
    allCodesMap,
    projectIndex,
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
