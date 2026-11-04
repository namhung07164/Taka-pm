import { Cost, Project } from '../../types';
import {
  normalizeCompactSearchCode,
  matchProjectCode,
} from '../../lib/utils';

export const EMPTY_COST_ARRAY: Cost[] = [];

/**
 * Returns a composite key uniquely identifying a project for cost caching.
 */
export function getProjectCompositeKey(p: Project): string {
  const pCode = String(p.code || '').trim().toLowerCase();
  const pYr = String(
    p.year ? p.year : p.start ? String(p.start).substring(0, 4) : ''
  ).trim();
  const pStore = String(p.store || '').trim().toLowerCase();
  return `${p.id || p.no || ''}|${pCode}|${pYr}|${pStore}`;
}

/**
 * Rule 16 Matching Engine: Verifies whether a Cost record belongs to a Project (Self only).
 * Priority order:
 * 1. Exclude deleted
 * 2. Match Project ID (Priority #1): If both have IDs, must be equal.
 * 3. Store match (Priority #2): Must match store (HCM vs HN).
 * 4. Year match (Priority #3): Must match financial year.
 * 5. Code match: Checks compact normalized code and raw code of the project itself (excludes budget-linked child projects).
 */
export function isCostBelongsToProject(
  c: Partial<Cost> | undefined | null,
  p: Partial<Project> | undefined | null,
  knownOtherProjectIds?: Set<string>
): boolean {
  if (!c || !p || c.isDeleted || (p as any).isDeleted) return false;

  const cProjId = c.projectId ? String(c.projectId).trim() : '';
  const pId = p.id ? String(p.id).trim() : '';

  // 1. Both have IDs: Priority #1 rule (strict self match)
  if (cProjId && pId) {
    return cProjId === pId;
  }
  if (cProjId && knownOtherProjectIds && knownOtherProjectIds.has(cProjId)) {
    return false;
  }

  // 2. Store matching
  const cStore = String(c.projectStore || (c as any).store || '').trim().toUpperCase();
  const pStore = String(p.store || (p as any).projectStore || '').trim().toUpperCase();
  if (cStore && pStore && cStore !== pStore) return false;

  // 3. Year matching
  const cYr = String(
    c.projectYear !== undefined && c.projectYear !== null
      ? c.projectYear
      : (c as any).year || ''
  ).trim();
  const pYr = String(
    p.year !== undefined && p.year !== null
      ? p.year
      : p.start
      ? String(p.start).substring(0, 4)
      : ''
  ).trim();
  if (cYr && pYr && cYr.toLowerCase() !== 'all' && pYr.toLowerCase() !== 'all' && cYr !== pYr) {
    return false;
  }

  // 4. Code matching (Self only - do NOT include budget-linked child projects)
  const cRawCode = String(c.projectCode || (c as any).code || '').trim();
  if (!cRawCode) return false;

  const cCompact = normalizeCompactSearchCode(cRawCode);
  const pRawCode = String(p.code || '').trim();
  const pCompact = normalizeCompactSearchCode(pRawCode);

  if (cCompact && pCompact && cCompact === pCompact) return true;
  if (pRawCode && matchProjectCode(cRawCode, pRawCode)) return true;

  return false;
}

/**
 * Builds an O(1) multi-indexed cache for costs against projects with referential stability.
 * Matches only each project's own (self) costs, excluding budget-linked child projects.
 */
export function buildProjectCostsIndex(
  projects: Project[],
  costs: Cost[],
  prevCache?: Map<string, Cost[]>
): Map<string, Cost[]> {
  const byProjId = new Map<string, Cost[]>();
  const byCompactCode = new Map<string, Cost[]>();

  for (let i = 0; i < costs.length; i++) {
    const c = costs[i];
    if (!c || c.isDeleted) continue;

    // Index by projectId
    const cProjId = c.projectId ? String(c.projectId).trim() : '';
    if (cProjId) {
      let list = byProjId.get(cProjId);
      if (!list) {
        list = [];
        byProjId.set(cProjId, list);
      }
      list.push(c);
    }

    // Index by compact normalized code (handles en-dash, spaces, hyphens)
    const rawCode = String(c.projectCode || (c as any).code || '').trim();
    const compact = normalizeCompactSearchCode(rawCode);
    if (compact) {
      let list = byCompactCode.get(compact);
      if (!list) {
        list = [];
        byCompactCode.set(compact, list);
      }
      list.push(c);
    }
  }

  const allProjectIds = new Set<string>();
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (!p || p.isDeleted) continue;
    if (p.id) allProjectIds.add(String(p.id).trim());
  }

  const nextCache = new Map<string, Cost[]>();

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const key = getProjectCompositeKey(p);
    const pId = p.id ? String(p.id).trim() : '';
    const pCompact = normalizeCompactSearchCode(p.code);

    const knownOtherIds = new Set<string>();
    allProjectIds.forEach((id) => {
      if (id !== pId) knownOtherIds.add(id);
    });

    const candidateCosts = new Set<Cost>();

    // 1. Priority #1: Costs explicitly bound to this project ID
    if (pId) {
      const byIdList = byProjId.get(pId);
      if (byIdList) {
        for (let j = 0; j < byIdList.length; j++) {
          candidateCosts.add(byIdList[j]);
        }
      }
    }

    // 2. Costs matching this project's own compact code
    if (pCompact) {
      const byCodeList = byCompactCode.get(pCompact);
      if (byCodeList) {
        for (let j = 0; j < byCodeList.length; j++) {
          candidateCosts.add(byCodeList[j]);
        }
      }
    }

    // Validate candidates through Rule 16 (Self only)
    const matched: Cost[] = [];
    candidateCosts.forEach((c) => {
      if (isCostBelongsToProject(c, p, knownOtherIds)) {
        matched.push(c);
      }
    });

    if (matched.length === 0) {
      nextCache.set(key, EMPTY_COST_ARRAY);
    } else {
      if (prevCache) {
        const prevArr = prevCache.get(key);
        if (
          prevArr &&
          prevArr.length === matched.length &&
          prevArr.every((item, idx) => item === matched[idx])
        ) {
          nextCache.set(key, prevArr);
          continue;
        }
      }
      nextCache.set(key, matched);
    }
  }

  return nextCache;
}
