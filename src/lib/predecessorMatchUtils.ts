import { Task, Project } from '../types';
import { computeTaskCode, computeAllTaskCodes, splitPredecessors } from './ganttUtils';
import { useAppStore } from '../store/useAppStore';
import {
  extractTrailingTaskNumber,
  stringSimilarity,
  parsePredecessorToken,
  PredecessorContext,
  ResolvedProjectContext,
  ProjectDiffDetails,
  ProjectLookupIndex,
  buildProjectLookupIndex,
  resolveProjectContext,
  resolveTaskProjectContext,
  getTaskProjectDiffDetailsWithResolved,
  getTaskProjectDiffDetails,
  isTaskDifferentProject,
} from './predecessorMatchParts/predecessorContextUtils';

export {
  extractTrailingTaskNumber,
  stringSimilarity,
  parsePredecessorToken,
  buildProjectLookupIndex,
  resolveProjectContext,
  resolveTaskProjectContext,
  getTaskProjectDiffDetailsWithResolved,
  getTaskProjectDiffDetails,
  isTaskDifferentProject,
};

export type {
  PredecessorContext,
  ResolvedProjectContext,
  ProjectDiffDetails,
  ProjectLookupIndex,
};

export interface PrecomputedMatchOptions {
  precomputedTaskCode?: string;
  resolvedContext?: ResolvedProjectContext;
  resolvedTaskInfo?: ResolvedProjectContext;
  projectIndex?: ProjectLookupIndex;
  allTaskCodesMap?: Map<string, string>;
}

/**
 * Finds a task by full code, secondary code, id or closest match query.
 * Pre-computes ProjectLookupIndex and computeAllTaskCodes once in O(P + T).
 */
export function findTaskByQueryOrCode(
  tokenOrCode: string,
  tasks: Task[],
  projects: Project[],
  context?: PredecessorContext
): Task | null {
  if (!tokenOrCode) return null;
  const { query } = parsePredecessorToken(tokenOrCode);
  if (!query) return null;

  const qLower = query.toLowerCase();
  const projectIndex = buildProjectLookupIndex(projects);
  const allCodesMap = computeAllTaskCodes(projects, tasks);

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!t) continue;
    if (t.id && t.id.toLowerCase() === qLower) return t;
    if (t.taskCodePhu && t.taskCodePhu.trim().toLowerCase() === qLower) return t;
    const code = allCodesMap.get(t.id) || computeTaskCode(projects, tasks, t);
    if (code && code.toLowerCase() === qLower) return t;
  }

  const resolvedContext = resolveProjectContext(context, projects, projectIndex);
  const match = findClosestTaskMatch(
    query,
    tasks,
    projects,
    tasks,
    context?.projectCode,
    650,
    context,
    tokenOrCode,
    { projectIndex, allTaskCodesMap: allCodesMap, resolvedContext }
  );
  return match?.task || null;
}

/**
 * Calculates a match score for a task against a search query.
 * Higher score = closer match.
 * Strongly prioritizes tasks belonging to the exact same parent project (same year, location, store, project code).
 */
export function scoreTaskPredecessorMatch(
  task: Task,
  rawQuery: string,
  projects: Project[],
  allTasks: Task[],
  currentProjectCode?: string,
  context?: PredecessorContext,
  options?: PrecomputedMatchOptions
): number {
  if (!rawQuery || !task) return 0;
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 0;

  const computedCode =
    options?.precomputedTaskCode ??
    options?.allTaskCodesMap?.get(task.id) ??
    computeTaskCode(projects, allTasks, task);

  const fullCode = (computedCode || task.taskCodePhu || task.id || '').trim().toLowerCase();
  const codePhu = (task.taskCodePhu || '').trim().toLowerCase();
  const name = (task.name || '').trim().toLowerCase();
  const taskPCode = (task.projectCode || '').trim().toLowerCase();
  const currentPCode = (context?.projectCode || currentProjectCode || '').trim().toLowerCase();

  const projectIndex = options?.projectIndex || buildProjectLookupIndex(projects);
  const ctx = options?.resolvedContext || resolveProjectContext(context, projects, projectIndex);
  const tInfo = options?.resolvedTaskInfo || resolveTaskProjectContext(task, projects, projectIndex);

  const contextYear = ctx.year.toLowerCase();
  const contextStore = ctx.store.toLowerCase();
  const contextLocation = ctx.location.toLowerCase();
  const contextProjectId = ctx.projectId;

  const taskYear = tInfo.year.toLowerCase();
  const taskStore = tInfo.store.toLowerCase();
  const taskLocation = tInfo.location.toLowerCase();
  const taskProjectId = tInfo.projectId;

  const isSameCode = Boolean(taskPCode && currentPCode && taskPCode === currentPCode);
  const isSameProjectId = Boolean(contextProjectId && taskProjectId && contextProjectId === taskProjectId);
  const isSameYear = Boolean(contextYear && taskYear && contextYear === taskYear);
  const isDiffYear = Boolean(contextYear && taskYear && contextYear !== taskYear);
  const isSameStore = Boolean(contextStore && taskStore && contextStore === taskStore);
  const isDiffStore = Boolean(contextStore && taskStore && contextStore !== taskStore);
  const isSameLocation = Boolean(contextLocation && taskLocation && contextLocation === taskLocation);
  const isDiffLocation = Boolean(contextLocation && taskLocation && contextLocation !== taskLocation);

  const isExactSameParentProject =
    isSameProjectId || (isSameCode && !isDiffYear && !isDiffStore && !isDiffLocation);

  const qAlphaNum = q.replace(/[^a-z0-9]/g, '');
  const fullCodeAlphaNum = fullCode.replace(/[^a-z0-9]/g, '');
  const codePhuAlphaNum = codePhu.replace(/[^a-z0-9]/g, '');
  const pCodeAlphaNum = taskPCode.replace(/[^a-z0-9]/g, '');

  // Numerical Conflict Guard:
  // If the search query explicitly contains a task number (e.g. "-2" in "B2-B208-2" or standalone "2" / "#2"),
  // and the candidate task has a different number (e.g. "-1" or "-3"),
  // they are FUNDAMENTALLY DIFFERENT tasks. They must NEVER match!
  const qTaskNum = extractTrailingTaskNumber(q);
  const fullCodeNum = extractTrailingTaskNumber(fullCode);
  const codePhuNum = extractTrailingTaskNumber(codePhu);
  const orderNum = task.orderIndex !== undefined ? task.orderIndex + 1 : null;
  const hasAnyCandidateNum = fullCodeNum !== null || codePhuNum !== null || orderNum !== null;
  const matchesAnyCandidateNum =
    qTaskNum !== null &&
    (qTaskNum === fullCodeNum || qTaskNum === codePhuNum || qTaskNum === orderNum);
  if (qTaskNum !== null && hasAnyCandidateNum && !matchesAnyCandidateNum) {
    return 0;
  }

  let baseScore = 0;

  // 1. Exact match on full code or code phu
  if (fullCode === q || codePhu === q) {
    baseScore = 1000;
  } else if (qAlphaNum && (fullCodeAlphaNum === qAlphaNum || codePhuAlphaNum === qAlphaNum)) {
    // 2. Alphanumeric exact match (ignoring dashes/dots/spaces)
    baseScore = 950;
  } else {
    // 3. User typed only digits or #digits (e.g. "85", "2", "#2", "-2")
    const digitMatch = q.match(/^[-#\s]*(\d+)$/);
    if (digitMatch) {
      const num = parseInt(digitMatch[1], 10);
      const isNumMatch = fullCodeNum === num || codePhuNum === num || orderNum === num;

      if (isNumMatch) {
        if (isExactSameParentProject) {
          baseScore = 920;
        } else if (isSameCode) {
          baseScore = 860;
        } else {
          baseScore = 760;
        }
      }
    } else if (fullCode.endsWith(q) || (codePhu && codePhu.endsWith(q))) {
      // 4. Code ends with query
      baseScore = 850;
    } else if (
      qAlphaNum.length >= 2 &&
      (fullCodeAlphaNum.endsWith(qAlphaNum) || (codePhuAlphaNum && codePhuAlphaNum.endsWith(qAlphaNum)))
    ) {
      baseScore = 820;
    } else if (fullCode.startsWith(q) || (codePhu && codePhu.startsWith(q))) {
      // 5. Code starts with query
      baseScore = 800;
    } else if (
      qAlphaNum.length >= 2 &&
      (fullCodeAlphaNum.startsWith(qAlphaNum) || (codePhuAlphaNum && codePhuAlphaNum.startsWith(qAlphaNum)))
    ) {
      baseScore = 780;
    } else if (fullCode.includes(q) || (codePhu && codePhu.includes(q))) {
      // 6. Code contains query
      baseScore = 750;
    } else if (
      qAlphaNum.length >= 2 &&
      (fullCodeAlphaNum.includes(qAlphaNum) || (codePhuAlphaNum && codePhuAlphaNum.includes(qAlphaNum)))
    ) {
      baseScore = 720;
    } else {
      // 7. Project Code contains part of query and query contains task number
      const qParts = q.split(/[-_#\s]+/).filter(Boolean);
      if (qParts.length >= 2) {
        const candidatePCodePart = qParts.slice(0, -1).join('');
        const candidateNumPart = qParts[qParts.length - 1];
        if (
          pCodeAlphaNum.includes(candidatePCodePart.replace(/[^a-z0-9]/g, '')) &&
          (fullCode.endsWith(candidateNumPart) || (codePhu && codePhu.endsWith(candidateNumPart)))
        ) {
          baseScore = 880;
        }
      }

      // 8. Task Name matching
      if (!baseScore) {
        if (name === q) {
          baseScore = 820;
        } else if (name.startsWith(q)) {
          baseScore = 760;
        } else if (name.includes(q)) {
          baseScore = 680;
        }
      }

      // 9. Fuzzy string similarity
      if (!baseScore && qAlphaNum.length >= 2) {
        const simFull = stringSimilarity(qAlphaNum, fullCodeAlphaNum);
        const simPhu = codePhuAlphaNum ? stringSimilarity(qAlphaNum, codePhuAlphaNum) : 0;
        const maxSim = Math.max(simFull, simPhu);
        if (maxSim >= 0.5) {
          baseScore = 500 + Math.round(maxSim * 250);
        } else if (q.length >= 4) {
          const simName = stringSimilarity(q, name);
          if (simName >= 0.6) {
            baseScore = 450 + Math.round(simName * 200);
          }
        }
      }
    }
  }

  if (baseScore === 0) return 0;

  let score = baseScore;

  if (isExactSameParentProject) {
    score += 600;
    if (isSameLocation) score += 50;
  } else if (isSameCode) {
    if (isDiffYear) score -= 400;
    if (isDiffStore) score -= 200;
    if (isDiffLocation) score -= 100;
    if (isSameYear) score += 150;
    if (isSameStore) score += 80;
    if (isSameLocation) score += 40;
  } else {
    if (isSameYear) score += 150;
    if (isDiffYear) score -= 300;
    if (isSameStore) score += 80;
    if (isDiffStore) score -= 150;
    if (isSameLocation) score += 40;
  }

  return Math.max(1, score);
}

export interface RankedPredecessorMatch {
  task: Task;
  score: number;
  exactTaskCode: string;
  isExternal: boolean;
  diffDetails?: ProjectDiffDetails;
}

/**
 * Ranks all candidate tasks according to their match score for a given query.
 * Pre-indexes ProjectLookupIndex, computeAllTaskCodes, and resolveProjectContext once before loop (O(1) per candidate).
 */
export function rankCandidateTasks(
  query: string,
  candidateTasks: Task[],
  projects: Project[],
  allTasks: Task[],
  currentProjectCode?: string,
  context?: PredecessorContext,
  options?: PrecomputedMatchOptions
): RankedPredecessorMatch[] {
  const effectiveContext: PredecessorContext = context || { projectCode: currentProjectCode };
  const projectIndex = options?.projectIndex || buildProjectLookupIndex(projects);
  const allCodesMap = options?.allTaskCodesMap || computeAllTaskCodes(projects, allTasks);
  const resolvedContext =
    options?.resolvedContext || resolveProjectContext(effectiveContext, projects, projectIndex);

  if (!query || !query.trim()) {
    return candidateTasks.map((t) => {
      const tInfo = resolveTaskProjectContext(t, projects, projectIndex);
      const diff = getTaskProjectDiffDetailsWithResolved(resolvedContext, t, projects, projectIndex, tInfo);
      const precomputedCode = allCodesMap.get(t.id) || computeTaskCode(projects, allTasks, t);
      return {
        task: t,
        score: 0,
        exactTaskCode: precomputedCode || t.taskCodePhu || t.id,
        isExternal: diff.isDifferent,
        diffDetails: diff,
      };
    });
  }

  const results: RankedPredecessorMatch[] = [];

  for (let i = 0; i < candidateTasks.length; i++) {
    const t = candidateTasks[i];
    if (!t) continue;
    const precomputedCode = allCodesMap.get(t.id) || computeTaskCode(projects, allTasks, t);
    const tInfo = resolveTaskProjectContext(t, projects, projectIndex);
    const score = scoreTaskPredecessorMatch(t, query, projects, allTasks, currentProjectCode, effectiveContext, {
      precomputedTaskCode: precomputedCode,
      resolvedContext,
      resolvedTaskInfo: tInfo,
      projectIndex,
      allTaskCodesMap: allCodesMap,
    });
    if (score > 0) {
      const exactCode = precomputedCode || t.taskCodePhu || t.id;
      const diff = getTaskProjectDiffDetailsWithResolved(resolvedContext, t, projects, projectIndex, tInfo);
      results.push({
        task: t,
        score,
        exactTaskCode: exactCode,
        isExternal: diff.isDifferent,
        diffDetails: diff,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Finds the single closest matching task for a given query string.
 * Returns null if no candidate reaches the threshold score.
 */
export function findClosestTaskMatch(
  query: string,
  candidateTasks: Task[],
  projects: Project[],
  allTasks: Task[],
  currentProjectCode?: string,
  minThreshold: number = 750,
  context?: PredecessorContext,
  predecessorTaskId?: string,
  options?: PrecomputedMatchOptions
): RankedPredecessorMatch | null {
  const projectIndex = options?.projectIndex || buildProjectLookupIndex(projects);
  const allCodesMap = options?.allTaskCodesMap || computeAllTaskCodes(projects, allTasks);
  const effectiveContext: PredecessorContext = context || { projectCode: currentProjectCode };
  const resolvedContext =
    options?.resolvedContext || resolveProjectContext(effectiveContext, projects, projectIndex);

  if (predecessorTaskId) {
    const exact = candidateTasks.find((t) => t.id === predecessorTaskId);
    if (exact && !exact.isDeleted) {
      const tInfo = resolveTaskProjectContext(exact, projects, projectIndex);
      const diff = getTaskProjectDiffDetailsWithResolved(resolvedContext, exact, projects, projectIndex, tInfo);
      const precomputedCode = allCodesMap.get(exact.id) || computeTaskCode(projects, allTasks, exact);
      return {
        task: exact,
        score: 1000000,
        exactTaskCode: precomputedCode || exact.taskCodePhu || exact.id,
        isExternal: diff.isDifferent,
        diffDetails: diff,
      };
    }
  }

  const ranked = rankCandidateTasks(query, candidateTasks, projects, allTasks, currentProjectCode, context, {
    projectIndex,
    allTaskCodesMap: allCodesMap,
    resolvedContext,
  });
  if (ranked.length > 0 && ranked[0].score >= minThreshold) {
    return ranked[0];
  }
  return null;
}

/**
 * Automatically resolves a raw predecessor string (e.g. "smz2-85, 2FF" or "85")
 * by finding the closest matching task codes and replacing the query part with
 * the exact task codes, preserving all relationships and lags.
 */
export function resolvePredecessorString(
  rawValue: string,
  tasks: Task[],
  projects: Project[],
  currentProjectCode?: string,
  context?: PredecessorContext,
  predecessorTaskIds?: string[]
): string {
  if (!rawValue || typeof rawValue !== 'string') return '';
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  const storeTasks = typeof window !== 'undefined' ? useAppStore.getState?.()?.tasks || [] : [];
  const taskMap = new Map<string, Task>();
  for (let i = 0; i < storeTasks.length; i++) {
    const t = storeTasks[i];
    if (t && t.id) taskMap.set(t.id, t);
  }
  for (let i = 0; i < (tasks || []).length; i++) {
    const t = tasks[i];
    if (t && t.id) taskMap.set(t.id, t);
  }
  const poolTasks = taskMap.size > 0 ? Array.from(taskMap.values()) : tasks;

  // Pre-compute ProjectLookupIndex, computeAllTaskCodes, and resolveProjectContext once
  const projectIndex = buildProjectLookupIndex(projects);
  const allCodesMap = computeAllTaskCodes(projects, poolTasks);
  const effectiveContext: PredecessorContext = context || { projectCode: currentProjectCode };
  const resolvedContext = resolveProjectContext(effectiveContext, projects, projectIndex);

  const knownCodes = new Set<string>();
  for (let i = 0; i < poolTasks.length; i++) {
    const t = poolTasks[i];
    if (!t) continue;
    if (t.taskCodePhu) knownCodes.add(t.taskCodePhu.trim().toLowerCase());
    const c = allCodesMap.get(t.id) || computeTaskCode(projects, poolTasks, t);
    if (c) knownCodes.add(c.trim().toLowerCase());
  }

  const parts = splitPredecessors(trimmed, knownCodes);
  if (parts.length === 0) return trimmed;

  const resolvedParts = parts.slice(0, 2).map((part, index) => {
    const { query, suffix } = parsePredecessorToken(part);
    if (!query) return part;

    const isAlreadyExact = knownCodes.has(query.toLowerCase());
    if (isAlreadyExact) {
      return query + suffix;
    }

    const match = findClosestTaskMatch(
      query,
      poolTasks,
      projects,
      poolTasks,
      currentProjectCode,
      650,
      context,
      predecessorTaskIds && predecessorTaskIds[index] ? predecessorTaskIds[index] : undefined,
      { projectIndex, allTaskCodesMap: allCodesMap, resolvedContext }
    );
    if (match) {
      let finalSuffix = suffix;
      if (index === 1 && !/FF|SF/i.test(finalSuffix)) {
        if (/SS|FS/i.test(finalSuffix)) {
          finalSuffix = finalSuffix.replace(/SS|FS/gi, 'FF');
        } else {
          finalSuffix = 'FF' + finalSuffix;
        }
      }
      return match.exactTaskCode + finalSuffix;
    }

    return part;
  });

  return resolvedParts.join(', ');
}
