import React, { useEffect, useState } from 'react';
import { Task, Project, PredecessorType } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import {
  buildTaskNoMap,
  computeAllTaskCodes,
  isCyclic,
  parsePredecessors,
  splitPredecessors,
} from '../../lib/ganttUtils';
import { executeUnifiedTaskUpdate } from '../../lib/taskInlineUpdateService';

export type GanttAnchorSide = 'start' | 'end';

export interface GanttLinkTargetInfo {
  taskId: string;
  taskCode: string;
  taskName: string;
  anchor: GanttAnchorSide;
  relType: PredecessorType;
  snapX: number;
  snapY: number;
  barRect: { left: number; top: number; width: number; height: number };
  isCyclic: boolean;
}

export interface GanttLinkDragState {
  sourceTaskId: string;
  sourceCode: string;
  sourceName: string;
  sourceAnchor: GanttAnchorSide;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  target: GanttLinkTargetInfo | null;
}

type Listener = (state: GanttLinkDragState | null) => void;

let activeDragState: GanttLinkDragState | null = null;
const listeners = new Set<Listener>();

function notifyListeners(next: GanttLinkDragState | null) {
  activeDragState = next;
  if (typeof document !== 'undefined') {
    if (next) {
      document.body.dataset.ganttLinking = 'true';
    } else {
      delete document.body.dataset.ganttLinking;
    }
  }
  listeners.forEach((fn) => fn(next));
}

export function useGanttLinkDragState(): GanttLinkDragState | null {
  const [state, setState] = useState<GanttLinkDragState | null>(activeDragState);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export function resolveRelType(
  sourceAnchor: GanttAnchorSide,
  targetAnchor: GanttAnchorSide
): PredecessorType {
  if (sourceAnchor === 'end' && targetAnchor === 'start') return 'FS';
  if (sourceAnchor === 'start' && targetAnchor === 'start') return 'SS';
  if (sourceAnchor === 'end' && targetAnchor === 'end') return 'FF';
  return 'SF';
}

function buildUpdatedPredecessorPayload(
  sourceTask: Task,
  sourceCode: string,
  targetTask: Task,
  relType: PredecessorType,
  allTasks: Task[],
  projects: Project[]
): {
  predecessor: string;
  predecessorTaskIds: string[];
  predecessors: { taskId: string; type: PredecessorType }[];
} {
  const taskNoMap = buildTaskNoMap(projects, allTasks);
  const allCodesMap = computeAllTaskCodes(projects, allTasks);
  const cleanSourceCode =
    sourceCode || allCodesMap.get(sourceTask.id) || sourceTask.taskCodePhu || sourceTask.id;

  const existingStr = String(targetTask.predecessor || '').trim();
  const existingIds = targetTask.predecessorTaskIds || [];
  const tokens = existingStr ? splitPredecessors(existingStr, taskNoMap).slice(0, 2) : [];

  interface SlotEntry {
    taskId: string;
    code: string;
    type: PredecessorType;
    lagSuffix: string;
  }

  const parsedSlots: SlotEntry[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    try {
      const parsed = parsePredecessors(tok, taskNoMap, {
        ...targetTask,
        predecessorTaskIds: [existingIds[i] || ''],
      } as Task)[0];
      if (parsed && parsed.task?.id) {
        const c =
          allCodesMap.get(parsed.task.id) ||
          parsed.task.taskCodePhu ||
          parsed.no ||
          tok;
        const lagVal = Number(parsed.lagValue) || 0;
        const lagSuffix = lagVal > 0 ? `${parsed.lagSign === '-' ? '-' : '+'}${lagVal}` : '';
        parsedSlots.push({
          taskId: parsed.task.id,
          code: c,
          type: (parsed.type || 'FS') as PredecessorType,
          lagSuffix,
        });
      }
    } catch {
      // Ignore unparseable token
    }
  }

  const formatSlot = (slot: SlotEntry) => {
    const rel = slot.type === 'FS' && !slot.lagSuffix ? '' : slot.type;
    return `${slot.code}${rel}${slot.lagSuffix}`;
  };

  // Check if sourceTask is already linked on targetTask -> update its relationship type
  const existingIdx = parsedSlots.findIndex((s) => s.taskId === sourceTask.id);
  let nextSlots: SlotEntry[];

  if (existingIdx !== -1) {
    nextSlots = parsedSlots.map((s, idx) =>
      idx === existingIdx ? { ...s, code: cleanSourceCode, type: relType } : s
    );
  } else if (parsedSlots.length === 0) {
    nextSlots = [{ taskId: sourceTask.id, code: cleanSourceCode, type: relType, lagSuffix: '' }];
  } else if (parsedSlots.length === 1 && (relType === 'FF' || relType === 'SF')) {
    // Secondary predecessor slot supports FF / SF alongside primary slot
    nextSlots = [
      parsedSlots[0],
      { taskId: sourceTask.id, code: cleanSourceCode, type: relType, lagSuffix: '' },
    ];
  } else {
    // Replace primary slot (Slot 0) with the newly dragged predecessor
    nextSlots = [
      { taskId: sourceTask.id, code: cleanSourceCode, type: relType, lagSuffix: '' },
      ...parsedSlots.slice(1),
    ].slice(0, 2);
  }

  return {
    predecessor: nextSlots.map(formatSlot).join(', '),
    predecessorTaskIds: nextSlots.map((s) => s.taskId),
    predecessors: nextSlots.map((s) => ({ taskId: s.taskId, type: s.type })),
  };
}

export function startGanttLinkDrag(
  e: React.PointerEvent<HTMLElement>,
  params: {
    taskId: string;
    taskCode?: string;
    taskName: string;
    anchor: GanttAnchorSide;
  }
) {
  e.stopPropagation();
  e.preventDefault();

  const storeState = useAppStore.getState();
  const allTasks = (storeState.tasks || []).filter((t: Task) => t && !t.isDeleted);
  const projects = storeState.projects || [];
  const sourceTask = allTasks.find((t: Task) => t.id === params.taskId);
  if (!sourceTask) return;

  const allCodesMap = computeAllTaskCodes(projects, allTasks);
  const resolvedSourceCode =
    params.taskCode || allCodesMap.get(sourceTask.id) || sourceTask.taskCodePhu || sourceTask.id;

  const anchorRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const startX = anchorRect.left + anchorRect.width / 2;
  const startY = anchorRect.top + anchorRect.height / 2;

  notifyListeners({
    sourceTaskId: sourceTask.id,
    sourceCode: resolvedSourceCode,
    sourceName: params.taskName || sourceTask.name,
    sourceAnchor: params.anchor,
    startX,
    startY,
    currentX: e.clientX,
    currentY: e.clientY,
    target: null,
  });

  let rafId: number | null = null;

  const handlePointerMove = (moveEvent: PointerEvent) => {
    const clientX = moveEvent.clientX;
    const clientY = moveEvent.clientY;

    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (!activeDragState) return;

      const hitEl = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const anchorEl = hitEl?.closest?.('[data-gantt-anchor]') as HTMLElement | null;
      const barEl = (anchorEl?.closest?.('[data-gantt-bar-task-id]') ||
        hitEl?.closest?.('[data-gantt-bar-task-id]')) as HTMLElement | null;

      let targetInfo: GanttLinkTargetInfo | null = null;

      if (barEl) {
        const targetTaskId = barEl.getAttribute('data-gantt-bar-task-id') || '';
        if (targetTaskId && targetTaskId !== sourceTask.id) {
          const latestState = useAppStore.getState();
          const latestTasks = (latestState.tasks || []).filter((t: Task) => t && !t.isDeleted);
          const latestProjects = latestState.projects || [];
          const targetTask = latestTasks.find((t: Task) => t.id === targetTaskId);

          if (targetTask) {
            const barRect = barEl.getBoundingClientRect();
            let targetAnchor: GanttAnchorSide = 'start';

            if (anchorEl) {
              const attrAnchor = anchorEl.getAttribute('data-gantt-anchor');
              if (attrAnchor === 'start' || attrAnchor === 'end') {
                targetAnchor = attrAnchor;
              }
            } else {
              // Default to 'start' (left) unless hovering over the rightmost 30% of the target bar
              const relX = clientX - barRect.left;
              targetAnchor = relX > barRect.width * 0.7 ? 'end' : 'start';
            }

            const targetDotEl = barEl.querySelector(
              `[data-gantt-anchor="${targetAnchor}"]`
            ) as HTMLElement | null;
            const dotRect = targetDotEl ? targetDotEl.getBoundingClientRect() : null;

            const snapX = dotRect
              ? dotRect.left + dotRect.width / 2
              : targetAnchor === 'start'
              ? barRect.left
              : barRect.right;
            const snapY = dotRect
              ? dotRect.top + dotRect.height / 2
              : barRect.top + barRect.height / 2;

            const relType = resolveRelType(params.anchor, targetAnchor);
            const cyclic = isCyclic(targetTask.id, sourceTask, latestTasks, latestProjects);
            const targetCode =
              barEl.getAttribute('data-gantt-bar-task-code') ||
              allCodesMap.get(targetTask.id) ||
              targetTask.taskCodePhu ||
              targetTask.id;

            targetInfo = {
              taskId: targetTask.id,
              taskCode: targetCode,
              taskName: targetTask.name,
              anchor: targetAnchor,
              relType,
              snapX,
              snapY,
              barRect: {
                left: barRect.left,
                top: barRect.top,
                width: barRect.width,
                height: barRect.height,
              },
              isCyclic: cyclic,
            };
          }
        }
      }

      notifyListeners({
        ...activeDragState,
        currentX: clientX,
        currentY: clientY,
        target: targetInfo,
      });
    });
  };

  const handlePointerUp = async () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);

    const finalState = activeDragState;
    notifyListeners(null);

    if (!finalState || !finalState.target) return;

    const { target } = finalState;
    const latestStore = useAppStore.getState();

    if (target.isCyclic) {
      latestStore.setToast?.({
        title: 'Circular Dependency Blocked',
        message: `Cannot link ${finalState.sourceCode} ➔ ${target.taskCode} (${target.relType}) because it creates a dependency loop.`,
        type: 'error',
      });
      return;
    }

    const latestTasks = (latestStore.tasks || []).filter((t: Task) => t && !t.isDeleted);
    const latestProjects = latestStore.projects || [];
    const liveSource = latestTasks.find((t: Task) => t.id === finalState.sourceTaskId);
    const liveTarget = latestTasks.find((t: Task) => t.id === target.taskId);

    if (!liveSource || !liveTarget) return;

    const payload = buildUpdatedPredecessorPayload(
      liveSource,
      finalState.sourceCode,
      liveTarget,
      target.relType,
      latestTasks,
      latestProjects
    );

    await executeUnifiedTaskUpdate(
      liveTarget,
      {
        predecessor: payload.predecessor,
        predecessorTaskIds: payload.predecessorTaskIds,
        predecessors: payload.predecessors,
        realtimeUpdate: true,
      },
      latestStore.currentUser,
      { showPredecessorToast: true }
    );
  };

  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerUp);
}
