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

/**
 * Calculates a match score for a task against a search query.
 * Higher score = closer match.
 * 1000+: Exact match
 * 800 - 999: Very high confidence match (sub-index, code suffix, normalized exact)
 * 500 - 799: Good match (substring, project match, high similarity)
 * 0: No match
 */
export function scoreTaskPredecessorMatch(
  task: Task,
  rawQuery: string,
  projects: Project[],
  allTasks: Task[],
  currentProjectCode?: string
): number {
  if (!rawQuery || !task) return 0;
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 0;

  const fullCode = (computeTaskCode(projects, allTasks, task) || task.taskCodePhu || task.id || '').trim().toLowerCase();
  const codePhu = (task.taskCodePhu || '').trim().toLowerCase();
  const name = (task.name || '').trim().toLowerCase();
  const taskPCode = (task.projectCode || '').trim().toLowerCase();
  const currentPCode = (currentProjectCode || '').trim().toLowerCase();
  const isSameProject = Boolean(taskPCode && currentPCode && taskPCode === currentPCode);

  const qAlphaNum = q.replace(/[^a-z0-9]/g, '');
  const fullCodeAlphaNum = fullCode.replace(/[^a-z0-9]/g, '');
  const codePhuAlphaNum = codePhu.replace(/[^a-z0-9]/g, '');
  const pCodeAlphaNum = taskPCode.replace(/[^a-z0-9]/g, '');

  // 1. Exact match on full code or code phu
  if (fullCode === q || codePhu === q) {
    return 1000 + (isSameProject ? 10 : 0);
  }

  // 2. Alphanumeric exact match (ignoring dashes/dots/spaces)
  if (qAlphaNum && (fullCodeAlphaNum === qAlphaNum || codePhuAlphaNum === qAlphaNum)) {
    return 950 + (isSameProject ? 10 : 0);
  }

  // Numerical Conflict Guard:
  // If the search query explicitly contains a task number (e.g. "-2" in "B2-B208-2" or standalone "2" / "#2"),
  // and the candidate task has a different number (e.g. "-1" or "-3"),
  // they are FUNDAMENTALLY DIFFERENT tasks. They must NEVER match under fuzzy, substring, or name rules!
  const qTaskNum = extractTrailingTaskNumber(q);
  const candidateTaskNum = extractTrailingTaskNumber(fullCode) ?? extractTrailingTaskNumber(codePhu) ?? (task.orderIndex !== undefined ? task.orderIndex + 1 : null);
  if (qTaskNum !== null && candidateTaskNum !== null && qTaskNum !== candidateTaskNum) {
    return 0;
  }

  let score = 0;

  // 3. User typed only digits or #digits (e.g. "85", "2", "#2", "-2")
  const digitMatch = q.match(/^[-#\s]*(\d+)$/);
  if (digitMatch) {
    const num = parseInt(digitMatch[1], 10);
    // Matches the trailing task number (e.g. "CP-01#2" or legacy "CP-01-2")
    const codeNumMatch = fullCode.match(/[-#]0*(\d+)$/);
    if (codeNumMatch && parseInt(codeNumMatch[1], 10) === num) {
      score = isSameProject ? 920 : 780;
    } else if (task.orderIndex !== undefined && (task.orderIndex + 1) === num) {
      score = isSameProject ? 900 : 760;
    }
    if (score > 0) return score;
  }

  // 4. Code ends with query (e.g. query "smz2-85" matches "HN-TKV-SMZ2-85" or "85" matches "P-85")
  if (fullCode.endsWith(q) || (codePhu && codePhu.endsWith(q))) {
    score = Math.max(score, 850 + (isSameProject ? 20 : 0));
  } else if (qAlphaNum.length >= 2 && fullCodeAlphaNum.endsWith(qAlphaNum)) {
    score = Math.max(score, 820 + (isSameProject ? 20 : 0));
  }

  // 5. Code starts with query (e.g. query "smz2" matches "SMZ2-85")
  if (fullCode.startsWith(q) || (codePhu && codePhu.startsWith(q))) {
    score = Math.max(score, 800 + (isSameProject ? 20 : 0));
  } else if (qAlphaNum.length >= 2 && fullCodeAlphaNum.startsWith(qAlphaNum)) {
    score = Math.max(score, 780 + (isSameProject ? 20 : 0));
  }

  // 6. Code contains query
  if (fullCode.includes(q) || (codePhu && codePhu.includes(q))) {
    score = Math.max(score, 750 + (isSameProject ? 20 : 0));
  } else if (qAlphaNum.length >= 2 && fullCodeAlphaNum.includes(qAlphaNum)) {
    score = Math.max(score, 720 + (isSameProject ? 20 : 0));
  }

  // 7. Project Code contains part of query and query contains task number
  // e.g. query "smz2-85" or "smz2#85": "smz2" matches project code "HN-TKV-SMZ2" and "85" matches task number
  const qParts = q.split(/[-_#\s]+/).filter(Boolean);
  if (qParts.length >= 2) {
    const candidatePCodePart = qParts.slice(0, -1).join('');
    const candidateNumPart = qParts[qParts.length - 1];
    if (pCodeAlphaNum.includes(candidatePCodePart.replace(/[^a-z0-9]/g, '')) && fullCode.endsWith(candidateNumPart)) {
      score = Math.max(score, 880);
    }
  }

  // 8. Task Name matching
  if (name === q) {
    score = Math.max(score, 820);
  } else if (name.startsWith(q)) {
    score = Math.max(score, 760);
  } else if (name.includes(q)) {
    score = Math.max(score, 680);
  }

  // 9. Fuzzy string similarity (Bigram Sorensen-Dice)
  if (qAlphaNum.length >= 2) {
    const simFull = stringSimilarity(qAlphaNum, fullCodeAlphaNum);
    const simPhu = codePhuAlphaNum ? stringSimilarity(qAlphaNum, codePhuAlphaNum) : 0;
    const maxSim = Math.max(simFull, simPhu);
    if (maxSim >= 0.5) {
      score = Math.max(score, 500 + Math.round(maxSim * 250));
    }

    // Also check task name similarity for longer queries
    if (q.length >= 4) {
      const simName = stringSimilarity(q, name);
      if (simName >= 0.6) {
        score = Math.max(score, 450 + Math.round(simName * 200));
      }
    }
  }

  // Same project tie-breaker
  if (score > 0 && isSameProject) {
    score += 15;
  }

  return score;
}

export interface RankedPredecessorMatch {
  task: Task;
  score: number;
  exactTaskCode: string;
  isExternal: boolean;
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
  currentProjectCode?: string
): RankedPredecessorMatch[] {
  if (!query || !query.trim()) {
    return candidateTasks.map(t => ({
      task: t,
      score: 0,
      exactTaskCode: computeTaskCode(projects, allTasks, t) || t.taskCodePhu || t.id,
      isExternal: Boolean(t.projectCode && currentProjectCode && t.projectCode !== currentProjectCode)
    }));
  }

  const results: RankedPredecessorMatch[] = [];

  for (const t of candidateTasks) {
    const score = scoreTaskPredecessorMatch(t, query, projects, allTasks, currentProjectCode);
    if (score > 0) {
      const exactCode = computeTaskCode(projects, allTasks, t) || t.taskCodePhu || t.id;
      const isExternal = Boolean(t.projectCode && currentProjectCode && t.projectCode !== currentProjectCode);
      results.push({
        task: t,
        score,
        exactTaskCode: exactCode,
        isExternal
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
  minThreshold: number = 750
): RankedPredecessorMatch | null {
  const ranked = rankCandidateTasks(query, candidateTasks, projects, allTasks, currentProjectCode);
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
  currentProjectCode?: string
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

    // Find the closest matching task with strict threshold (750+)
    const match = findClosestTaskMatch(query, poolTasks, projects, poolTasks, currentProjectCode, 750);
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
