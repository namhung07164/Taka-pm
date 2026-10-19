import { Task, Project } from '../../types';

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
    return s1.includes(s2) || s2.includes(s1) ? 0.75 : 0;
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

  const totalBigrams = s1.length - 1 + (s2.length - 1);
  return (2 * intersection) / totalBigrams;
}

/**
 * Regex for predecessor relationship and lag suffix:
 * Matches trailing combinations like:
 * - FF, SS, SF, FS (e.g. "SS", "FF+2", "SF-1")
 * - Explicit plus lag: +1, +0.5, +2d
 * - Explicit space-separated minus lag: " - 2", " - 1d" (distinguishes from code hyphens like "SMZ2-85")
 */
const REL_LAG_REGEX =
  /(?:\s*(FS|SS|FF|SF)\s*(?:[+-]\s*\d+(?:\.\d+)?)?|\s*\+\s*\d+(?:\.\d+)?(?:d)?|\s+-\s*\d+(?:\.\d+)?(?:d)?)$/i;

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

export interface ResolvedProjectContext {
  projectId: string;
  code: string;
  year: string;
  store: string;
  location: string;
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

export interface ProjectLookupIndex {
  byId: Map<string, Project>;
  byCodeLower: Map<string, Project[]>;
}

let _lastProjectsForIndexRef: Project[] | null = null;
let _cachedProjectLookupIndex: ProjectLookupIndex | null = null;

/**
 * Builds an O(1) lookup index for projects by ID and lowercase code (with reference memoization).
 */
export function buildProjectLookupIndex(projects: Project[]): ProjectLookupIndex {
  if (_lastProjectsForIndexRef === projects && _cachedProjectLookupIndex !== null) {
    return _cachedProjectLookupIndex;
  }

  const byId = new Map<string, Project>();
  const byCodeLower = new Map<string, Project[]>();

  if (Array.isArray(projects)) {
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      if (!p) continue;
      if (p.id !== undefined && p.id !== null) {
        const idKey = String(p.id).trim();
        if (idKey) byId.set(idKey, p);
      }
      if (p.code) {
        const codeKey = String(p.code).trim().toLowerCase();
        if (codeKey) {
          let list = byCodeLower.get(codeKey);
          if (!list) {
            list = [];
            byCodeLower.set(codeKey, list);
          }
          list.push(p);
        }
      }
    }
  }

  const index: ProjectLookupIndex = { byId, byCodeLower };
  _lastProjectsForIndexRef = projects;
  _cachedProjectLookupIndex = index;
  return index;
}

function findParentProjectFromIndex(
  projId: string,
  code: string,
  year: string,
  store: string,
  index: ProjectLookupIndex
): Project | undefined {
  if (projId) {
    const byIdMatch = index.byId.get(projId);
    if (byIdMatch) return byIdMatch;
  }
  if (code) {
    const candidates = index.byCodeLower.get(code.toLowerCase());
    if (candidates && candidates.length > 0) {
      const storeUpper = store ? store.toUpperCase() : '';
      for (let i = 0; i < candidates.length; i++) {
        const p = candidates[i];
        if (year && p.year && String(p.year).trim() !== year) continue;
        if (storeUpper && p.store && String(p.store).trim().toUpperCase() !== storeUpper) continue;
        return p;
      }
    }
  }
  return undefined;
}

export function resolveProjectContext(
  context: PredecessorContext | undefined,
  projects: Project[],
  projectIndex?: ProjectLookupIndex
): ResolvedProjectContext {
  const ctxProjId = (context?.projectId || '').trim();
  let ctxCode = (context?.projectCode || '').trim();
  let ctxYear =
    context?.projectYear !== undefined && context?.projectYear !== null
      ? String(context.projectYear).trim()
      : '';
  let ctxStore = (context?.projectStore || '').trim();
  let ctxLoc = (context?.projectLocation || context?.location || '').trim();

  if ((!ctxYear || !ctxStore || !ctxLoc || !ctxCode) && (ctxProjId || ctxCode)) {
    const idx = projectIndex || buildProjectLookupIndex(projects);
    const parent = findParentProjectFromIndex(ctxProjId, ctxCode, ctxYear, ctxStore, idx);
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
    location: ctxLoc,
  };
}

export function resolveTaskProjectContext(
  task: Task,
  projects: Project[],
  projectIndex?: ProjectLookupIndex
): ResolvedProjectContext {
  const taskProjId = (task.projectId || '').trim();
  let taskCode = (task.projectCode || '').trim();
  let taskYear =
    task.projectYear !== undefined && task.projectYear !== null
      ? String(task.projectYear).trim()
      : '';
  let taskStore = (task.projectStore || '').trim();
  let taskLoc = (task.location || (task as any).projectLocation || '').trim();

  if ((!taskYear || !taskStore || !taskLoc || !taskCode) && (taskProjId || taskCode)) {
    const idx = projectIndex || buildProjectLookupIndex(projects);
    const parent = findParentProjectFromIndex(taskProjId, taskCode, taskYear, taskStore, idx);
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
    location: taskLoc,
  };
}

/**
 * Computes diff details using pre-resolved context and optional pre-resolved task context (O(1)).
 */
export function getTaskProjectDiffDetailsWithResolved(
  ctx: ResolvedProjectContext,
  task: Task | undefined,
  projects: Project[],
  projectIndex?: ProjectLookupIndex,
  resolvedTaskInfo?: ResolvedProjectContext
): ProjectDiffDetails {
  if (!task) {
    return {
      isDifferent: false,
      diffFactors: [],
      reasons: [],
      contextInfo: {},
      taskInfo: {},
    };
  }

  const tInfo = resolvedTaskInfo || resolveTaskProjectContext(task, projects, projectIndex);
  const diffFactors: ('year' | 'store' | 'location' | 'code' | 'id')[] = [];
  const reasons: string[] = [];

  if (ctx.year && tInfo.year && ctx.year.toLowerCase() !== tInfo.year.toLowerCase()) {
    diffFactors.push('year');
    reasons.push(`Năm: ${tInfo.year} (hiện tại: ${ctx.year})`);
  }

  if (ctx.store && tInfo.store && ctx.store.toLowerCase() !== tInfo.store.toLowerCase()) {
    diffFactors.push('store');
    reasons.push(`Chi nhánh: ${tInfo.store} (hiện tại: ${ctx.store})`);
  }

  if (ctx.location && tInfo.location && ctx.location.toLowerCase() !== tInfo.location.toLowerCase()) {
    diffFactors.push('location');
    reasons.push(`Vị trí/Tầng: ${tInfo.location} (hiện tại: ${ctx.location})`);
  }

  if (ctx.code && tInfo.code && ctx.code.toLowerCase() !== tInfo.code.toLowerCase()) {
    diffFactors.push('code');
    reasons.push(`Mã dự án: ${tInfo.code} (hiện tại: ${ctx.code})`);
  }

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
    taskInfo: tInfo,
  };
}

export function getTaskProjectDiffDetails(
  context: PredecessorContext | undefined,
  task: Task | undefined,
  projects: Project[],
  projectIndex?: ProjectLookupIndex
): ProjectDiffDetails {
  if (!task) {
    return {
      isDifferent: false,
      diffFactors: [],
      reasons: [],
      contextInfo: {},
      taskInfo: {},
    };
  }
  const idx = projectIndex || buildProjectLookupIndex(projects);
  const ctx = resolveProjectContext(context, projects, idx);
  return getTaskProjectDiffDetailsWithResolved(ctx, task, projects, idx);
}

export function isTaskDifferentProject(
  context: PredecessorContext | undefined,
  task: Task | undefined,
  projects: Project[]
): boolean {
  return getTaskProjectDiffDetails(context, task, projects).isDifferent;
}
