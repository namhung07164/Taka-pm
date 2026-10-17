import { Task, Project } from '../types';
import { computeTaskCode, splitPredecessors } from './ganttUtils';
import { useAppStore } from '../store/useAppStore';

/**
 * Extracts a trailing task number from a code or query string.
 * Examples:
 * - "B2-B208-2" -> 2
 * - "CP-01-05" -> 5
 * - "2" -> 2
 * - "-2" -> 2
 * - "#2" -> 2
 * - "smz2-85" -> 85
 * - "Handover" -> null
 */
export function extractTrailingTaskNumber(str: string): number | null {
  if (!str) return null;
  const m = str.trim().match(/(?:^|[-_#\s])0*(\d+)\s*$/);
  if (m) {
    return parseInt(m[1], 10);
  }
  return null;
}

/**
 * Bigram / Sorensen-Dice string similarity calculation (0 to 1).
 * Highly efficient O(N + M) implementation resilient to typos, transposed chars, and omitted characters.
 */
export function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();
  if (s1 === s2) return 1;
  
  if (s1.length < 2 || s2.length < 2) {
    return (s1.includes(s2) || s2.includes(s1)) ? 0.75 : 0;
  }
  
  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.substring(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }
  
  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substring(i, i + 2);
    const count = bigrams1.get(bg) || 0;
    if (count > 0) {
      bigrams1.set(bg, count - 1);
      intersection++;
    }
  }
  
  const totalBigrams = (s1.length - 1) + (s2.length - 1);
  return (2 * intersection) / totalBigrams;
}

/**
 * Regex for predecessor relationship and lag suffix:
 * Matches trailing combinations like:
 * - FF, SS, SF, FS (e.g. "SS", "FF+2", "SF-1")
 * - Explicit plus lag: +1, +0.5, +2d
 * - Explicit space-separated minus lag: " - 2", " - 1d" (distinguishes from code hyphens like "SMZ2-85")
 */
const REL_LAG_REGEX = /(?:\s*(FS|SS|FF|SF)\s*(?:[+-]\s*\d+(?:\.\d+)?)?|\s*\+\s*\d+(?:\.\d+)?(?:d)?|\s+-\s*\d+(?:\.\d+)?(?:d)?)$/i;

/**
 * Parses a single predecessor token into query (the task code/name search part)
 * and suffix (the relationship and lag part, e.g. "SS", "FF", "+1", "FF+2").
 */
export function parsePredecessorToken(token: string): { query: string; suffix: string } {
  if (!token) return { query: '', suffix: '' };
  const trimmed = token.trim();
  if (!trimmed) return { query: '', suffix: '' };

  const match = trimmed.match(REL_LAG_REGEX);
  if (match && match.index !== undefined && match.index > 0) {
    const query = trimmed.substring(0, match.index).trim();
    const suffix = match[0].trim().toUpperCase().replace(/\s+/g, '');
    return { query, suffix };
  }

  return { query: trimmed, suffix: '' };
}

export interface PredecessorContext {
  projectId?: string;
  projectCode?: string;
  projectYear?: number | string;
  projectStore?: string;
  projectLocation?: string;
  location?: string;
}

export interface ProjectDiffDetails {
  isDifferent: boolean;
  diffFactors: ('year' | 'store' | 'location' | 'code' | 'id')[];
  reasons: string[];
  contextInfo: {
    projectId?: string;
    code?: string;
    year?: string;
    store?: string;
    location?: string;
  };
  taskInfo: {
    projectId?: string;
    code?: string;
    year?: string;
    store?: string;
    location?: string;
  };
}

export function resolveProjectContext(
  context: PredecessorContext | undefined,
  projects: Project[]
): {
  projectId: string;
  code: string;
  year: string;
  store: string;
  location: string;
} {
  const ctxProjId = (context?.projectId || '').trim();
  let ctxCode = (context?.projectCode || '').trim();
  let ctxYear = context?.projectYear !== undefined && context?.projectYear !== null ? String(context.projectYear).trim() : '';
  let ctxStore = (context?.projectStore || '').trim();
  let ctxLoc = (context?.projectLocation || context?.location || '').trim();

  if ((!ctxYear || !ctxStore || !ctxLoc || !ctxCode) && (ctxProjId || ctxCode)) {
    const parent =
      (ctxProjId ? projects.find(p => String(p.id).trim() === ctxProjId) : undefined) ||
      projects.find(p => {
        if (!ctxCode || !p.code || p.code.trim().toLowerCase() !== ctxCode.toLowerCase()) return false;
        if (ctxYear && p.year && String(p.year).trim() !== ctxYear) return false;
        if (ctxStore && p.store && String(p.store).trim().toUpperCase() !== ctxStore.toUpperCase()) return false;
        return true;
      });
    if (parent) {
      if (!ctxCode && parent.code) ctxCode = parent.code;
      if (!ctxYear && parent.year) ctxYear = String(parent.year);
      if (!ctxStore && parent.store) ctxStore = parent.store;
      if (!ctxLoc && parent.location) ctxLoc = parent.location;
    }
  }

  return {
    projectId: ctxProjId,
    code: ctxCode,
    year: ctxYear,
    store: ctxStore,
    location: ctxLoc
  };
}

export function resolveTaskProjectContext(
  task: Task,
  projects: Project[]
): {
  projectId: string;
  code: string;
  year: string;
  store: string;
  location: string;
} {
  const taskProjId = (task.projectId || '').trim();
  let taskCode = (task.projectCode || '').trim();
  let taskYear = task.projectYear !== undefined && task.projectYear !== null ? String(task.projectYear).trim() : '';
  let taskStore = (task.projectStore || '').trim();
  let taskLoc = (task.location || (task as any).projectLocation || '').trim();

  if ((!taskYear || !taskStore || !taskLoc || !taskCode) && (taskProjId || taskCode)) {
    const parent =
      (taskProjId ? projects.find(p => String(p.id).trim() === taskProjId) : undefined) ||
      projects.find(p => {
        if (!taskCode || !p.code || p.code.trim().toLowerCase() !== taskCode.toLowerCase()) return false;
        if (taskYear && p.year && String(p.year).trim() !== taskYear) return false;
        if (taskStore && p.store && String(p.store).trim().toUpperCase() !== taskStore.toUpperCase()) return false;
        return true;
      });
    if (parent) {
      if (!taskCode && parent.code) taskCode = parent.code;
      if (!taskYear && parent.year) taskYear = String(parent.year);
      if (!taskStore && parent.store) taskStore = parent.store;
      if (!taskLoc && parent.location) taskLoc = parent.location;
    }
  }

  return {
    projectId: taskProjId,
    code: taskCode,
    year: taskYear,
    store: taskStore,
    location: taskLoc
  };
}

/**
 * Checks whether a candidate task differs from the current context in:
 * - year
 * - store
 * - location
 * - projectCode
 * - projectId
 * Returns detailed diff factors and human-readable explanation reasons.
 */
export function getTaskProjectDiffDetails(
  context: PredecessorContext | undefined,
  task: Task | undefined,
  projects: Project[]
): ProjectDiffDetails {
  if (!task) {
    return {
      isDifferent: false,
      diffFactors: [],
      reasons: [],
      contextInfo: {},
      taskInfo: {}
    };
  }

  const ctx = resolveProjectContext(context, projects);
  const tInfo = resolveTaskProjectContext(task, projects);

  const diffFactors: ('year' | 'store' | 'location' | 'code' | 'id')[] = [];
  const reasons: string[] = [];

  // 1. Year check (Khác Năm)
  if (ctx.year && tInfo.year && ctx.year.toLowerCase() !== tInfo.year.toLowerCase()) {
    diffFactors.push('year');
    reasons.push(`Năm: ${tInfo.year} (hiện tại: ${ctx.year})`);
  }

  // 2. Store check (Khác Chi nhánh: HCM vs HN)
  if (ctx.store && tInfo.store && ctx.store.toLowerCase() !== tInfo.store.toLowerCase()) {
    diffFactors.push('store');
    reasons.push(`Chi nhánh: ${tInfo.store} (hiện tại: ${ctx.store})`);
  }

  // 3. Location check (Khác Tầng / Khu vực: B2 vs 1F)
  if (ctx.location && tInfo.location && ctx.location.toLowerCase() !== tInfo.location.toLowerCase()) {
    diffFactors.push('location');
    reasons.push(`Vị trí/Tầng: ${tInfo.location} (hiện tại: ${ctx.location})`);
  }

  // 4. Project code check (Khác Mã dự án)
  if (ctx.code && tInfo.code && ctx.code.toLowerCase() !== tInfo.code.toLowerCase()) {
    diffFactors.push('code');
    reasons.push(`Mã dự án: ${tInfo.code} (hiện tại: ${ctx.code})`);
  }

  // 5. Project ID check
  if (ctx.projectId && tInfo.projectId && ctx.projectId !== tInfo.projectId) {
    if (!diffFactors.includes('code')) {
      diffFactors.push('id');
    }
  }

  return {
    isDifferent: diffFactors.length > 0,
    diffFactors,
    reasons,
    contextInfo: ctx,
    taskInfo: tInfo
  };
}

export function isTaskDifferentProject(
  context: PredecessorContext | undefined,
  task: Task | undefined,
  projects: Project[]
): boolean {
  return getTaskProjectDiffDetails(context, task, projects).isDifferent;
}

/**
 * Finds a task by full code, secondary code, id or closest match query.
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

  for (const t of tasks) {
    if (t.id && t.id.toLowerCase() === qLower) return t;
    if (t.taskCodePhu && t.taskCodePhu.trim().toLowerCase() === qLower) return t;
    const code = computeTaskCode(projects, tasks, t);
    if (code && code.toLowerCase() === qLower) return t;
  }

  const match = findClosestTaskMatch(query, tasks, projects, tasks, context?.projectCode, 650, context, tokenOrCode);
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
  context?: PredecessorContext
): number {
  if (!rawQuery || !task) return 0;
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 0;

  const fullCode = (computeTaskCode(projects, allTasks, task) || task.taskCodePhu || task.id || '').trim().toLowerCase();
  const codePhu = (task.taskCodePhu || '').trim().toLowerCase();
  const name = (task.name || '').trim().toLowerCase();
  const taskPCode = (task.projectCode || '').trim().toLowerCase();
  const currentPCode = (context?.projectCode || currentProjectCode || '').trim().toLowerCase();

  // Resolve contexts
  const ctx = resolveProjectContext(context, projects);
  const tInfo = resolveTaskProjectContext(task, projects);

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

  const isExactSameParentProject = isSameProjectId || (isSameCode && !isDiffYear && !isDiffStore && !isDiffLocation);

  const qAlphaNum = q.replace(/[^a-z0-9]/g, '');
  const fullCodeAlphaNum = fullCode.replace(/[^a-z0-9]/g, '');
  const codePhuAlphaNum = codePhu.replace(/[^a-z0-9]/g, '');
  const pCodeAlphaNum = taskPCode.replace(/[^a-z0-9]/g, '');

  // Numerical Conflict Guard:
  // If the search query explicitly contains a task number (e.g. "-2" in "B2-B208-2" or standalone "2" / "#2"),
  // and the candidate task has a different number (e.g. "-1" or "-3"),
  // they are FUNDAMENTALLY DIFFERENT tasks. They must NEVER match!
  const qTaskNum = extractTrailingTaskNumber(q);
  const candidateTaskNum = extractTrailingTaskNumber(fullCode) ?? extractTrailingTaskNumber(codePhu) ?? (task.orderIndex !== undefined ? task.orderIndex + 1 : null);
  if (qTaskNum !== null && candidateTaskNum !== null && qTaskNum !== candidateTaskNum) {
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
      const codeNumMatch = fullCode.match(/[-#]0*(\d+)$/);
      const isNumMatch = (codeNumMatch && parseInt(codeNumMatch[1], 10) === num) ||
                         (task.orderIndex !== undefined && (task.orderIndex + 1) === num);

      if (isNumMatch) {
        if (isExactSameParentProject) {
          baseScore = 920;
        } else if (isSameCode) {
          baseScore = 860;
        } else {
          // Cross-project match for task number (in-scope projects will heavily outscore this via contextual weighting)
          baseScore = 760;
        }
      }
    } else if (fullCode.endsWith(q) || (codePhu && codePhu.endsWith(q))) {
      // 4. Code ends with query
      baseScore = 850;
    } else if (qAlphaNum.length >= 2 && fullCodeAlphaNum.endsWith(qAlphaNum)) {
      baseScore = 820;
    } else if (fullCode.startsWith(q) || (codePhu && codePhu.startsWith(q))) {
      // 5. Code starts with query
      baseScore = 800;
    } else if (qAlphaNum.length >= 2 && fullCodeAlphaNum.startsWith(qAlphaNum)) {
      baseScore = 780;
    } else if (fullCode.includes(q) || (codePhu && codePhu.includes(q))) {
      // 6. Code contains query
      baseScore = 750;
    } else if (qAlphaNum.length >= 2 && fullCodeAlphaNum.includes(qAlphaNum)) {
      baseScore = 720;
    } else {
      // 7. Project Code contains part of query and query contains task number
      const qParts = q.split(/[-_#\s]+/).filter(Boolean);
      if (qParts.length >= 2) {
        const candidatePCodePart = qParts.slice(0, -1).join('');
        const candidateNumPart = qParts[qParts.length - 1];
        if (pCodeAlphaNum.includes(candidatePCodePart.replace(/[^a-z0-9]/g, '')) && fullCode.endsWith(candidateNumPart)) {
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

  // Contextual priority weighting:
  // "nếu trong cùng task mẹ thì ưu tiên cùng year, cùng location, cùng project code"
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
    // Cross-project match:
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
 * Sorted descending by score.
 */
export function rankCandidateTasks(
  query: string,
  candidateTasks: Task[],
  projects: Project[],
  allTasks: Task[],
  currentProjectCode?: string,
  context?: PredecessorContext
): RankedPredecessorMatch[] {
  const effectiveContext: PredecessorContext = context || { projectCode: currentProjectCode };

  if (!query || !query.trim()) {
    return candidateTasks.map(t => {
      const diff = getTaskProjectDiffDetails(effectiveContext, t, projects);
      return {
        task: t,
        score: 0,
        exactTaskCode: computeTaskCode(projects, allTasks, t) || t.taskCodePhu || t.id,
        isExternal: diff.isDifferent,
        diffDetails: diff
      };
    });
  }

  const results: RankedPredecessorMatch[] = [];

  for (const t of candidateTasks) {
    const score = scoreTaskPredecessorMatch(t, query, projects, allTasks, currentProjectCode, effectiveContext);
    if (score > 0) {
      const exactCode = computeTaskCode(projects, allTasks, t) || t.taskCodePhu || t.id;
      const diff = getTaskProjectDiffDetails(effectiveContext, t, projects);
      results.push({
        task: t,
        score,
        exactTaskCode: exactCode,
        isExternal: diff.isDifferent,
        diffDetails: diff
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
  predecessorTaskId?: string
): RankedPredecessorMatch | null {
  if (predecessorTaskId) {
    const exact = candidateTasks.find(t => t.id === predecessorTaskId);
    if (exact && !exact.isDeleted) {
      const diff = getTaskProjectDiffDetails(context, exact, projects);
      return {
        task: exact,
        score: 1000000, // Absolute priority for hard-linked ID
        exactTaskCode: computeTaskCode(projects, allTasks, exact) || exact.taskCodePhu || exact.id,
        isExternal: diff.isDifferent,
        diffDetails: diff
      };
    }
  }

  const ranked = rankCandidateTasks(query, candidateTasks, projects, allTasks, currentProjectCode, context);
  if (ranked.length > 0 && ranked[0].score >= minThreshold) {
    return ranked[0];
  }
  return null;
}

/**
 * Automatically resolves a raw predecessor string (e.g. "smz2-85, 2FF" or "85")
 * by finding the closest matching task codes and replacing the query part with
 * the exact task codes, preserving all relationships and lags.
 * If the user enters an explicit code with no high-confidence match (e.g. "B2-B208-2"),
 * the user's input is strictly preserved and NEVER forced to a different task number.
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

  // Pool all available tasks including those in global store to ensure complete visibility across filters
  const storeTasks = typeof window !== 'undefined' ? (useAppStore.getState?.()?.tasks || []) : [];
  const taskMap = new Map<string, Task>();
  (storeTasks || []).forEach(t => { if (t && t.id) taskMap.set(t.id, t); });
  (tasks || []).forEach(t => { if (t && t.id) taskMap.set(t.id, t); });
  const poolTasks = taskMap.size > 0 ? Array.from(taskMap.values()) : tasks;

  const knownCodes = new Set<string>();
  poolTasks.forEach(t => {
    if (t.taskCodePhu) knownCodes.add(t.taskCodePhu.trim().toLowerCase());
    const c = computeTaskCode(projects, poolTasks, t);
    if (c) knownCodes.add(c.trim().toLowerCase());
  });

  const parts = splitPredecessors(trimmed, knownCodes);
  if (parts.length === 0) return trimmed;

  const resolvedParts = parts.slice(0, 2).map((part, index) => {
    const { query, suffix } = parsePredecessorToken(part);
    if (!query) return part;

    // Check if query is already an exact known code
    const isAlreadyExact = knownCodes.has(query.toLowerCase());
    if (isAlreadyExact) {
      return query + suffix;
    }

    // Find the closest matching task with threshold (650+)
    const match = findClosestTaskMatch(
      query, 
      poolTasks, 
      projects, 
      poolTasks, 
      currentProjectCode, 
      650, 
      context, 
      predecessorTaskIds && predecessorTaskIds[index] ? predecessorTaskIds[index] : undefined
    );
    if (match) {
      let finalSuffix = suffix;
      // If it's the second predecessor and has no relationship, default to FF per Gantt rules
      if (index === 1 && !/FF|SF/i.test(finalSuffix)) {
        if (/SS|FS/i.test(finalSuffix)) {
          finalSuffix = finalSuffix.replace(/SS|FS/ig, 'FF');
        } else {
          finalSuffix = 'FF' + finalSuffix;
        }
      }
      return match.exactTaskCode + finalSuffix;
    }

    // Preserve the user's typed input if no high-confidence match is found
    return part;
  });

  return resolvedParts.join(', ');
}
