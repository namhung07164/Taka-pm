import { Cost, Project } from '../../types';
import {
  normalizeCompactSearchCode,
  extractAllProjectCodes,
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
 * Rule 16 Matching Engine: Verifies whether a Cost record belongs to a Project.
 * Priority order:
 * 1. Exclude deleted
 * 2. Match Project ID (Priority #1): If both have IDs, must be equal or belong to a child project.
 * 3. Store match (Priority #2): Must match store (HCM vs HN).
 * 4. Year match (Priority #3): Must match financial year.
 * 5. Code match: Checks compact normalized code, raw code, linkCodes, child codes, and sub-code prefixes.
 */
export function isCostBelongsToProject(
  c: Partial<Cost> | undefined | null,
  p: Partial<Project> | undefined | null,
  childProjectIds?: Set<string>,
  childProjectCodes?: Set<string>,
  knownOtherProjectIds?: Set<string>
): boolean {
  if (!c || !p || c.isDeleted || (p as any).isDeleted) return false;

  const cProjId = c.projectId ? String(c.projectId).trim() : '';
  const pId = p.id ? String(p.id).trim() : '';

  // 1. Both have IDs: Priority #1 rule
  if (cProjId && pId) {
    if (cProjId === pId) return true;
    if (childProjectIds && childProjectIds.has(cProjId)) return true;
    if (knownOtherProjectIds && knownOtherProjectIds.has(cProjId)) return false;
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

  // 4. Code matching
  const cRawCode = String(c.projectCode || (c as any).code || '').trim();
  if (!cRawCode) return false;

  const cCompact = normalizeCompactSearchCode(cRawCode);
  const pRawCode = String(p.code || '').trim();
  const pCompact = normalizeCompactSearchCode(pRawCode);

  if (cCompact && pCompact && cCompact === pCompact) return true;
  if (pRawCode && matchProjectCode(cRawCode, pRawCode)) return true;

  // Check child project codes
  if (
    childProjectCodes &&
    (childProjectCodes.has(cCompact) || childProjectCodes.has(cRawCode.toUpperCase()))
  ) {
    return true;
  }

  // Check sub-code prefix match: e.g. L3-CORRIDOR-1, L3-CORRIDOR-01, L3-CORRIDOR-A
  if (pCompact && cCompact.startsWith(pCompact)) {
    return true;
  }

  // Check linkCodes
  const allPCodes = extractAllProjectCodes(p);
  for (let i = 0; i < allPCodes.length; i++) {
    const codeItem = allPCodes[i];
    if (normalizeCompactSearchCode(codeItem) === cCompact) return true;
    if (matchProjectCode(cRawCode, codeItem)) return true;
  }

  return false;
}

/**
 * Builds an O(1) multi-indexed cache for costs against projects with referential stability.
 * Solves unicode dash/en-dash variations (e.g. "L3 - CORRIDOR" vs "L3-CORRIDOR"),
 * linkCodes expansion, child project rollups, and Rule 16 Project ID priority.
 */
export function buildProjectCostsIndex(
  projects: Project[],
  costs: Cost[],
  prevCache?: Map<string, Cost[]>
): Map<string, Cost[]> {
  const byProjId = new Map<string, Cost[]>();
  const byCompactCode = new Map<string, Cost[]>();
  const allValidCosts: Cost[] = [];

  for (let i = 0; i < costs.length; i++) {
    const c = costs[i];
    if (!c || c.isDeleted) continue;
    allValidCosts.push(c);

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

  // Pre-index child projects for parent projects
  const childProjectsByParent = new Map<string, Project[]>();
  const allProjectIds = new Set<string>();

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (!p || p.isDeleted) continue;
    if (p.id) allProjectIds.add(String(p.id).trim());

    if (p.parentId && String(p.parentId).trim()) {
      const pKey = String(p.parentId).trim().toLowerCase();
      const pCompact = normalizeCompactSearchCode(pKey);
      let list = childProjectsByParent.get(pKey);
      if (!list) {
        list = [];
        childProjectsByParent.set(pKey, list);
      }
      list.push(p);

      if (pCompact && pCompact !== pKey) {
        let cList = childProjectsByParent.get(pCompact);
        if (!cList) {
          cList = [];
          childProjectsByParent.set(pCompact, cList);
        }
        cList.push(p);
      }
    }
  }

  const nextCache = new Map<string, Cost[]>();

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const key = getProjectCompositeKey(p);
    const pId = p.id ? String(p.id).trim() : '';
    const pCompact = normalizeCompactSearchCode(p.code);

    // Gather child projects for p
    const childIds = new Set<string>();
    const childCodes = new Set<string>();
    const pLowerCode = String(p.code || '').trim().toLowerCase();

    const addChildren = (children?: Project[]) => {
      if (!children) return;
      for (let cIdx = 0; cIdx < children.length; cIdx++) {
        const ch = children[cIdx];
        if (ch.id) childIds.add(String(ch.id).trim());
        if (ch.code) {
          childCodes.add(String(ch.code).trim().toUpperCase());
          const chCompact = normalizeCompactSearchCode(ch.code);
          if (chCompact) childCodes.add(chCompact);
        }
      }
    };

    if (pId) addChildren(childProjectsByParent.get(pId.toLowerCase()));
    if (pLowerCode) addChildren(childProjectsByParent.get(pLowerCode));
    if (pCompact) addChildren(childProjectsByParent.get(pCompact));

    // Known other projects (excluding self and own children)
    const knownOtherIds = new Set<string>();
    allProjectIds.forEach((id) => {
      if (id !== pId && !childIds.has(id)) knownOtherIds.add(id);
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

    // 2. Costs bound to any child project ID
    childIds.forEach((cId) => {
      const childList = byProjId.get(cId);
      if (childList) {
        for (let j = 0; j < childList.length; j++) {
          candidateCosts.add(childList[j]);
        }
      }
    });

    // 3. Costs matching project's compact code
    if (pCompact) {
      const byCodeList = byCompactCode.get(pCompact);
      if (byCodeList) {
        for (let j = 0; j < byCodeList.length; j++) {
          candidateCosts.add(byCodeList[j]);
        }
      }
    }

    // 4. Costs matching child project codes
    childCodes.forEach((cCode) => {
      const byChildList = byCompactCode.get(cCode);
      if (byChildList) {
        for (let j = 0; j < byChildList.length; j++) {
          candidateCosts.add(byChildList[j]);
        }
      }
    });

    // 5. Costs matching any code in project's linkCodes
    const pAllCodes = extractAllProjectCodes(p);
    for (let k = 0; k < pAllCodes.length; k++) {
      const compactK = normalizeCompactSearchCode(pAllCodes[k]);
      if (compactK && compactK !== pCompact) {
        const byLinkList = byCompactCode.get(compactK);
        if (byLinkList) {
          for (let j = 0; j < byLinkList.length; j++) {
            candidateCosts.add(byLinkList[j]);
          }
        }
      }
    }

    // 6. Sub-code prefix candidates (e.g. L3-CORRIDOR-1, L3-CORRIDOR-01)
    if (pCompact) {
      byCompactCode.forEach((list, codeKey) => {
        if (codeKey.startsWith(pCompact) && codeKey !== pCompact) {
          for (let j = 0; j < list.length; j++) {
            candidateCosts.add(list[j]);
          }
        }
      });
    }

    // Fallback: Check allValidCosts if candidate set is empty
    if (candidateCosts.size === 0 && (!pId || allValidCosts.length < 100)) {
      for (let m = 0; m < allValidCosts.length; m++) {
        if (isCostBelongsToProject(allValidCosts[m], p, childIds, childCodes, knownOtherIds)) {
          candidateCosts.add(allValidCosts[m]);
        }
      }
    }

    // Validate candidates through Rule 16
    const matched: Cost[] = [];
    candidateCosts.forEach((c) => {
      if (isCostBelongsToProject(c, p, childIds, childCodes, knownOtherIds)) {
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
