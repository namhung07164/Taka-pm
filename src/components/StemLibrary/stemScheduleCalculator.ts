import { Project, Task } from '../../types';
import { parseDateTime, formatToDatetimeLocal } from '../../lib/utils';
import {
  addDays,
  calculateTaskDatesFromPredecessors,
} from '../../lib/ganttUtilsParts/scheduleAndReorderEngine';
import { extractExplicitSubtaskNumber } from '../../lib/ganttUtilsParts/taskSortingAndCodes';
import { getTasksForProject } from '../../lib/projectDatesService';
import { StemAnchorMode, StemWorkbenchBlock } from './stemLibraryTypes';

export interface OpeningRiskAnalysis {
  hasRisk: boolean;
  level: 'warning' | 'critical';
  daysLate: number;
  targetMilestoneLabel: string;
  targetDateStr: string;
  latestFinishStr: string;
  hoardingStartStr?: string;
  reasons: string[];
}

export interface ComputedWorkbenchSchedule {
  blocks: StemWorkbenchBlock[];
  earliestStart: string;
  latestFinish: string;
  totalSpanDays: number;
  hoardingStartDate: string | null;
  nextStartIndex: number;
  risk: OpeningRiskAnalysis;
}

export function normalizeAnchorIso(rawDate?: string | null): string {
  if (rawDate) {
    const parsed = parseDateTime(rawDate);
    if (parsed && !isNaN(parsed.getTime())) {
      return formatToDatetimeLocal(parsed);
    }
  }
  const now = new Date();
  now.setHours(9, 0, 0, 0);
  return formatToDatetimeLocal(now);
}

/**
 * Determines the starting 1-based subtask index for a project so generated tasks
 * strictly follow [ProjectCode]#[Index] without colliding with existing tasks.
 */
export function getNextSubtaskStartIndex(project: Project | null, allTasks: Task[]): number {
  if (!project) return 1;
  const projectTasks = getTasksForProject(project, allTasks).filter((t) => !t.isDeleted);
  let maxIndex = projectTasks.length;

  for (const t of projectTasks) {
    const explicitNum = extractExplicitSubtaskNumber(t.taskCodePhu, project.code);
    if (explicitNum !== null && explicitNum > maxIndex) {
      maxIndex = explicitNum;
    }
    if (typeof t.orderIndex === 'number' && !isNaN(t.orderIndex) && t.orderIndex + 1 > maxIndex) {
      maxIndex = t.orderIndex + 1;
    }
  }
  return maxIndex + 1;
}

function runForwardPass(
  blocks: StemWorkbenchBlock[],
  startAnchorIso: string,
  projectCode: string,
  baseIndex: number
): {
  computedBlocks: StemWorkbenchBlock[];
  minStartMs: number;
  maxFinishMs: number;
  minStartStr: string;
  maxFinishStr: string;
} {
  const computedBlocks: StemWorkbenchBlock[] = [];
  const startBaseDate = parseDateTime(startAnchorIso) || new Date();
  const baseIso = formatToDatetimeLocal(startBaseDate);

  let minStartMs = Infinity;
  let maxFinishMs = -Infinity;
  let minStartStr = baseIso;
  let maxFinishStr = baseIso;

  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    const safeDur = Math.max(0.5, Number(blk.duration) || 1);
    const previewCode = `${projectCode || 'PROJ'}#${baseIndex + i}`;

    let computedStart = baseIso;
    let computedFinish = addDays(baseIso, safeDur);

    if (i === 0 || blk.connectorToPrev === 'NONE') {
      const startCandidate = blk.customStart
        ? normalizeAnchorIso(blk.customStart)
        : i === 0
          ? baseIso
          : computedBlocks[i - 1].computedFinish || baseIso;
      computedStart = startCandidate;
      computedFinish = addDays(computedStart, safeDur);
    } else {
      const prevBlk = computedBlocks[i - 1];
      const calc = calculateTaskDatesFromPredecessors(
        {
          id: blk.instanceId,
          duration: String(safeDur),
          durationManual: true,
        },
        [
          {
            type: blk.connectorToPrev,
            lagSign: (blk.lagDays || 0) < 0 ? '-' : '+',
            lagValue: Math.abs(blk.lagDays || 0),
            task: {
              id: prevBlk.instanceId,
              start: prevBlk.computedStart,
              finish: prevBlk.computedFinish,
            },
          },
        ]
      );
      if (calc) {
        computedStart = calc.start;
        computedFinish = calc.finish;
      } else {
        computedStart = prevBlk.computedFinish || baseIso;
        computedFinish = addDays(computedStart, safeDur);
      }
    }

    const sMs = parseDateTime(computedStart)?.getTime() ?? startBaseDate.getTime();
    const fMs = parseDateTime(computedFinish)?.getTime() ?? sMs;

    if (sMs < minStartMs) {
      minStartMs = sMs;
      minStartStr = computedStart;
    }
    if (fMs > maxFinishMs) {
      maxFinishMs = fMs;
      maxFinishStr = computedFinish;
    }

    computedBlocks.push({
      ...blk,
      duration: safeDur,
      computedStart,
      computedFinish,
      previewCode,
    });
  }

  return {
    computedBlocks,
    minStartMs: minStartMs === Infinity ? startBaseDate.getTime() : minStartMs,
    maxFinishMs: maxFinishMs === -Infinity ? startBaseDate.getTime() : maxFinishMs,
    minStartStr,
    maxFinishStr,
  };
}

/**
 * Computes live start/finish dates for all blocks in the Visual Flow Canvas
 * supporting both Forward Mode (from Project Start) and Backward Retail Mode (anchored to Opening/Handover).
 */
export function computeWorkbenchSchedule(
  blocks: StemWorkbenchBlock[],
  project: Project | null,
  allTasks: Task[],
  anchorMode: StemAnchorMode,
  customAnchorDate?: string
): ComputedWorkbenchSchedule {
  const nextStartIndex = getNextSubtaskStartIndex(project, allTasks);
  const projectCode = String(project?.code || 'PROJECT').trim();

  if (!blocks || blocks.length === 0) {
    return {
      blocks: [],
      earliestStart: '',
      latestFinish: '',
      totalSpanDays: 0,
      hoardingStartDate: null,
      nextStartIndex,
      risk: {
        hasRisk: false,
        level: 'warning',
        daysLate: 0,
        targetMilestoneLabel: 'Opening',
        targetDateStr: '',
        latestFinishStr: '',
        reasons: [],
      },
    };
  }

  let effectiveStartIso: string;

  if (anchorMode === 'backward') {
    const targetEndRaw =
      customAnchorDate ||
      project?.opening ||
      project?.handover ||
      project?.computedTakCompl ||
      addDays(formatToDatetimeLocal(new Date()), 30);
    const targetEndIso = normalizeAnchorIso(targetEndRaw);

    const probePass = runForwardPass(blocks, targetEndIso, projectCode, nextStartIndex);
    const totalSpanMs = Math.max(0, probePass.maxFinishMs - probePass.minStartMs);
    const totalSpanDays = Number((totalSpanMs / (1000 * 60 * 60 * 24)).toFixed(1));

    effectiveStartIso = addDays(targetEndIso, -totalSpanDays);
  } else {
    const startRaw =
      customAnchorDate ||
      project?.computedTakStart ||
      project?.handover ||
      formatToDatetimeLocal(new Date());
    effectiveStartIso = normalizeAnchorIso(startRaw);
  }

  const finalPass = runForwardPass(blocks, effectiveStartIso, projectCode, nextStartIndex);
  const totalSpanDays = Math.max(
    0,
    Number(((finalPass.maxFinishMs - finalPass.minStartMs) / (1000 * 60 * 60 * 24)).toFixed(1))
  );

  const hoardingBlock =
    finalPass.computedBlocks.find((b) => /hoarding|dựng rào/i.test(b.name)) ||
    finalPass.computedBlocks[0];
  const hoardingStartDate = hoardingBlock?.computedStart || null;

  const milestoneRaw = project?.opening || project?.handover || '';
  const milestoneLabel = project?.opening
    ? 'Opening (Khai trương)'
    : project?.handover
      ? 'Handover (Bàn giao)'
      : '';
  const reasons: string[] = [];
  let hasRisk = false;
  let daysLate = 0;
  let level: 'warning' | 'critical' = 'warning';

  if (milestoneRaw) {
    const milestoneDate = parseDateTime(milestoneRaw);
    if (milestoneDate && !isNaN(milestoneDate.getTime())) {
      const diffMs = finalPass.maxFinishMs - milestoneDate.getTime();
      const diffDays = Number((diffMs / (1000 * 60 * 60 * 24)).toFixed(1));
      if (diffDays > 0.2) {
        hasRisk = true;
        daysLate = Math.ceil(diffDays);
        level = daysLate > 5 ? 'critical' : 'warning';
        reasons.push(
          `Ngày hoàn thành dự kiến (${finalPass.maxFinishStr.slice(0, 10)}) vượt quá mốc ${milestoneLabel} (${milestoneRaw.slice(0, 10)}) ${daysLate} ngày.`
        );
        reasons.push(
          `Gợi ý: Rút ngắn Duration hoặc bấm đổi khớp nối từ 🔗 FS sang ⚡ SS (Làm song song) để kịp ngày Khai trương.`
        );
      }
    }
  }

  if (anchorMode === 'backward') {
    const todayMs = new Date().setHours(0, 0, 0, 0);
    if (finalPass.minStartMs < todayMs) {
      const pastDays = Math.ceil((todayMs - finalPass.minStartMs) / (1000 * 60 * 60 * 24));
      hasRisk = true;
      daysLate = Math.max(daysLate, pastDays);
      level = 'critical';
      reasons.push(
        `Lùi ngày từ mốc Khai trương yêu cầu phải bắt đầu từ ${finalPass.minStartStr.slice(0, 10)} (đã trễ ${pastDays} ngày so với hôm nay).`
      );
    }
  }

  return {
    blocks: finalPass.computedBlocks,
    earliestStart: finalPass.minStartStr,
    latestFinish: finalPass.maxFinishStr,
    totalSpanDays,
    hoardingStartDate,
    nextStartIndex,
    risk: {
      hasRisk,
      level,
      daysLate,
      targetMilestoneLabel: milestoneLabel || 'Opening',
      targetDateStr: milestoneRaw ? milestoneRaw.slice(0, 10) : '',
      latestFinishStr: finalPass.maxFinishStr ? finalPass.maxFinishStr.slice(0, 10) : '',
      hoardingStartStr: hoardingStartDate ? hoardingStartDate.slice(0, 10) : undefined,
      reasons,
    },
  };
}

/**
 * Validates that a set of tasks has no directed dependency cycle (Circular Guard - Rule 9).
 */
export function hasDirectedDependencyCycle(tasks: Task[]): boolean {
  const adj = new Map<string, string[]>();
  tasks.forEach((t) => {
    const preds = t.predecessorTaskIds || [];
    adj.set(t.id, preds.filter(Boolean));
  });

  const visited = new Set<string>();
  const inStack = new Set<string>();

  const dfs = (nodeId: string): boolean => {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    inStack.add(nodeId);
    const neighbors = adj.get(nodeId) || [];
    for (const nextId of neighbors) {
      if (dfs(nextId)) return true;
    }
    inStack.delete(nodeId);
    return false;
  };

  for (const t of tasks) {
    if (dfs(t.id)) return true;
  }
  return false;
}
