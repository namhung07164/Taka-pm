import { Task } from '../types';
import { normalizeDashes } from './utils';

export function extractNumericSuffix(codeOrPhu?: string | null): number | null {
  if (!codeOrPhu) return null;
  const str = normalizeDashes(String(codeOrPhu)).trim();
  const m = str.match(/#\s*(\d+)/) || str.match(/[-_.:/\s]+(\d+)\s*$/) || str.match(/^(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export function getTaskProjectScopeKeys(t: Partial<Task>): string[] {
  const keys: string[] = [];
  if (t.projectId && String(t.projectId).trim()) {
    keys.push(`pid:${String(t.projectId).trim().toLowerCase()}`);
  }
  const code = String(t.projectCode || '').trim().toLowerCase();
  const year = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
  const store = String(t.projectStore || '').trim().toLowerCase();
  if (code || year || store) {
    keys.push(`key:${code}|${year}|${store}`);
    if (code && store) keys.push(`key:${code}|*|${store}`);
    if (code && year) keys.push(`key:${code}|${year}|*`);
  }
  if (keys.length === 0) keys.push('key:||');
  return keys;
}

export function getPrimaryTaskScopeKey(t: Partial<Task>): string {
  const code = String(t.projectCode || '').trim().toLowerCase();
  const year = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
  const store = String(t.projectStore || '').trim().toLowerCase();
  if (code) return `key:${code}|${year}|${store}`;
  if (t.projectId && String(t.projectId).trim()) return `pid:${String(t.projectId).trim().toLowerCase()}`;
  return 'key:||';
}

export function compareTasksForCanonicalCode(a: Task, b: Task): number {
  const ordA = a.orderIndex !== undefined && a.orderIndex !== null ? Number(a.orderIndex) : null;
  const ordB = b.orderIndex !== undefined && b.orderIndex !== null ? Number(b.orderIndex) : null;
  if (ordA !== null && ordB !== null && ordA !== ordB) return ordA - ordB;
  if (ordA !== null && ordB === null) return -1;
  if (ordA === null && ordB !== null) return 1;
  const codeA = a.taskCodePhu || (a.projectCode && ordA !== null ? `${a.projectCode}#${ordA + 1}` : a.name || '');
  const codeB = b.taskCodePhu || (b.projectCode && ordB !== null ? `${b.projectCode}#${ordB + 1}` : b.name || '');
  const numA = extractNumericSuffix(codeA);
  const numB = extractNumericSuffix(codeB);
  if (numA !== null && numB !== null && numA !== numB) return numA - numB;
  if (numA !== null && numB === null) return -1;
  if (numA === null && numB !== null) return 1;
  if (a.start && b.start && a.start !== b.start) return a.start.localeCompare(b.start);
  if (a.finish && b.finish && a.finish !== b.finish) return a.finish.localeCompare(b.finish);
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function calcInclusiveDays(startStr: string, finishStr: string): string {
  if (!startStr || !finishStr) return '0';
  const s = new Date(startStr);
  const f = new Date(finishStr);
  if (isNaN(s.getTime()) || isNaN(f.getTime())) return '0';
  const diff = Math.round((f.getTime() - s.getTime()) / 86400000);
  return String(diff >= 0 ? diff + 1 : 0);
}

/**
 * Deduplicates task summary entries within a single project:
 * - Removes duplicate summary IDs
 * - Collapses duplicate summaries that share the same normalized name + start + finish
 *   (unless both point to two distinct valid parent summaries in the project),
 *   preferring the summary that has a valid existing parentTaskId and real task ID.
 */
export function deduplicateTaskSummaries(summaries: any[]): any[] {
  if (!Array.isArray(summaries) || summaries.length <= 1) return summaries || [];

  const validList = summaries.filter((s) => s && (s.name || s.start || s.finish || s.taskCodePhu));
  if (validList.length <= 1) return validList;

  const byIdLower = new Map<string, any>();
  const byCodeLower = new Map<string, any>();
  const byIndexNum = new Map<number, any>();
  const byNameLower = new Map<string, any>();

  for (let i = 0; i < validList.length; i++) {
    const s = validList[i];
    if (s.id) byIdLower.set(String(s.id).trim().toLowerCase(), s);
    if (s.taskCodePhu) {
      const cNorm = normalizeDashes(String(s.taskCodePhu)).trim().toLowerCase();
      byCodeLower.set(cNorm, s);
      const num = extractNumericSuffix(cNorm);
      if (num !== null && !byIndexNum.has(num)) byIndexNum.set(num, s);
    }
    const ord = s.orderIndex !== undefined && s.orderIndex !== null ? Number(s.orderIndex) + 1 : i + 1;
    if (!byIndexNum.has(ord)) byIndexNum.set(ord, s);
    if (s.name) {
      const nLower = String(s.name).trim().toLowerCase().replace(/\s+/g, ' ');
      if (nLower && (!byNameLower.has(nLower) || s.isModularParent)) byNameLower.set(nLower, s);
    }
  }

  const validParentByItem = new Map<any, any>();
  const activeParents = new Set<any>();

  for (let i = 0; i < validList.length; i++) {
    const s = validList[i];
    const rawP = s.parentTaskId || s.parentId;
    if (!rawP) continue;
    const pNorm = normalizeDashes(String(rawP)).trim();
    const pLower = pNorm.toLowerCase();
    let par = byIdLower.get(pLower) || byCodeLower.get(pLower);
    if (!par) {
      const mIdx = pNorm.match(/#\s*(\d+)$/) || pNorm.match(/^(\d+)$/);
      if (mIdx) par = byIndexNum.get(parseInt(mIdx[1], 10));
    }
    if (!par) par = byNameLower.get(pLower.replace(/\s+/g, ' '));
    if (par && par !== s && (!s.id || !par.id || String(par.id).trim().toLowerCase() !== String(s.id).trim().toLowerCase())) {
      validParentByItem.set(s, par);
      activeParents.add(par);
    }
  }

  const sorted = [...validList].sort((a, b) => {
    const aRealId = Boolean(a.id && !String(a.id).startsWith('ts_'));
    const bRealId = Boolean(b.id && !String(b.id).startsWith('ts_'));
    if (aRealId !== bRealId) return aRealId ? -1 : 1;
    const aIsPar = activeParents.has(a);
    const bIsPar = activeParents.has(b);
    if (aIsPar !== bIsPar) return aIsPar ? -1 : 1;
    const aHasPar = validParentByItem.has(a);
    const bHasPar = validParentByItem.has(b);
    if (aHasPar !== bHasPar) return aHasPar ? -1 : 1;
    const aOrd = a.orderIndex !== undefined ? Number(a.orderIndex) : 999999;
    const bOrd = b.orderIndex !== undefined ? Number(b.orderIndex) : 999999;
    if (aOrd !== bOrd) return aOrd - bOrd;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  const seenIds = new Set<string>();
  const seenNameDates = new Map<string, any>();
  const idRedirect = new Map<string, string>();
  const keptSet = new Set<any>();

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const sIdLower = s.id ? String(s.id).trim().toLowerCase() : '';
    if (sIdLower && seenIds.has(sIdLower)) continue;

    const normName = String(s.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const startStr = String(s.start || '').trim();
    const finishStr = String(s.finish || '').trim();
    const sig = normName ? `${normName}__${startStr}__${finishStr}` : '';

    const existing = sig ? seenNameDates.get(sig) : undefined;
    if (existing) {
      const sPar = validParentByItem.get(s);
      const ePar = validParentByItem.get(existing);
      const sParId = sPar?.id ? (idRedirect.get(String(sPar.id).trim().toLowerCase()) || String(sPar.id).trim().toLowerCase()) : '';
      const eParId = ePar?.id ? (idRedirect.get(String(ePar.id).trim().toLowerCase()) || String(ePar.id).trim().toLowerCase()) : '';
      const sParName = sPar?.name ? String(sPar.name).trim().toLowerCase().replace(/\s+/g, ' ') : '';
      const eParName = ePar?.name ? String(ePar.name).trim().toLowerCase().replace(/\s+/g, ' ') : '';
      const existingIdLower = existing.id ? String(existing.id).trim().toLowerCase() : '';

      const isChildOfExisting =
        (sParId && existingIdLower && sParId === existingIdLower) ||
        (eParId && sIdLower && eParId === sIdLower);
      const hasDistinctValidParents =
        Boolean(sPar && ePar) &&
        sParId !== eParId &&
        (!sParName || !eParName || sParName !== eParName);

      if (!isChildOfExisting && !hasDistinctValidParents && !activeParents.has(s)) {
        if (sIdLower && existingIdLower) idRedirect.set(sIdLower, existingIdLower);
        if (!existing.parentTaskId && s.parentTaskId && sPar) existing.parentTaskId = s.parentTaskId;
        if (!existing.taskCodePhu && s.taskCodePhu) existing.taskCodePhu = s.taskCodePhu;
        if (!existing.party && s.party) existing.party = s.party;
        if (!existing.predecessor && s.predecessor) existing.predecessor = s.predecessor;
        if (!existing.delegation && s.delegation) existing.delegation = s.delegation;
        continue;
      }
    }

    if (sIdLower) seenIds.add(sIdLower);
    if (sig) seenNameDates.set(sig, s);
    keptSet.add(s);
  }

  return validList.filter((s) => keptSet.has(s));
}

/**
 * Rolls up task summaries for project computed summaries in O(N), including
 * parent dates, duration, runningStatus, isModularParent, and predecessor links.
 */
export function rollupTaskSummaries(summaries: any[]): any[] {
  if (!Array.isArray(summaries) || summaries.length === 0) return summaries || [];

  const dedupedInput = deduplicateTaskSummaries(summaries);
  const summaryByIdLower = new Map<string, any>();
  const summaryByCodeLower = new Map<string, any>();
  const summaryByIndexNum = new Map<number, any>();
  const summaryByNameLower = new Map<string, any>();

  for (let i = 0; i < dedupedInput.length; i++) {
    const s = dedupedInput[i];
    if (!s) continue;
    if (s.id) summaryByIdLower.set(String(s.id).trim().toLowerCase(), s);
    if (s.taskCodePhu) {
      const codeNorm = normalizeDashes(String(s.taskCodePhu)).trim().toLowerCase();
      summaryByCodeLower.set(codeNorm, s);
      const num = extractNumericSuffix(codeNorm);
      if (num !== null && !summaryByIndexNum.has(num)) summaryByIndexNum.set(num, s);
    }
    const ord = s.orderIndex !== undefined && s.orderIndex !== null ? Number(s.orderIndex) + 1 : i + 1;
    if (!summaryByIndexNum.has(ord)) summaryByIndexNum.set(ord, s);
    if (s.name) {
      const nLower = String(s.name).trim().toLowerCase();
      if (nLower && !summaryByNameLower.has(nLower)) summaryByNameLower.set(nLower, s);
    }
  }

  // First pass: resolve canonical parent IDs
  const resolvedParentByIdx = new Map<number, string>();
  const parentSet = new Set<string>();
  const result = dedupedInput.map((s) => (s ? { ...s } : s));

  for (let i = 0; i < result.length; i++) {
    const s = result[i];
    if (!s) continue;
    const rawP = s.parentTaskId || s.parentId;
    if (!rawP) continue;
    const pNorm = normalizeDashes(String(rawP)).trim();
    const pLower = pNorm.toLowerCase();
    let matchedParent = summaryByIdLower.get(pLower) || summaryByCodeLower.get(pLower);
    if (!matchedParent) {
      const mIdx = pNorm.match(/#\s*(\d+)$/) || pNorm.match(/^(\d+)$/);
      if (mIdx) matchedParent = summaryByIndexNum.get(parseInt(mIdx[1], 10));
    }
    if (!matchedParent) matchedParent = summaryByNameLower.get(pLower);

    if (!matchedParent || !matchedParent.id) {
      // Orphan parent reference: clean up
      delete s.parentTaskId;
      delete s.parentId;
      continue;
    }
    const canonicalParentId = String(matchedParent.id);
    if (s.id && canonicalParentId.toLowerCase() === String(s.id).trim().toLowerCase()) {
      delete s.parentTaskId;
      delete s.parentId;
      continue;
    }
    resolvedParentByIdx.set(i, canonicalParentId);
    parentSet.add(canonicalParentId.toLowerCase());
  }

  // Second pass: enforce Single-Level WBS (a parent with children cannot itself be a child)
  const childrenMap = new Map<string, any[]>();
  for (let i = 0; i < result.length; i++) {
    const s = result[i];
    if (!s) continue;
    const sIdLower = s.id ? String(s.id).trim().toLowerCase() : '';
    const canonicalParentId = resolvedParentByIdx.get(i);
    if (canonicalParentId && (!sIdLower || !parentSet.has(sIdLower))) {
      s.parentTaskId = canonicalParentId;
      delete s.parentId;
      const pKey = canonicalParentId.toLowerCase();
      let list = childrenMap.get(pKey);
      if (!list) {
        list = [];
        childrenMap.set(pKey, list);
      }
      list.push(s);
    } else {
      delete s.parentTaskId;
      delete s.parentId;
    }
  }

  // Clean stale isModularParent on non-parent summaries
  for (let i = 0; i < result.length; i++) {
    const s = result[i];
    if (!s) continue;
    const sIdLower = s.id ? String(s.id).trim().toLowerCase() : '';
    if (!sIdLower || !childrenMap.has(sIdLower)) {
      if (s.isModularParent) {
        s.isModularParent = false;
        if (typeof s.predecessor === 'string' && /SS\s*,\s*.*FF/i.test(s.predecessor)) {
          delete s.predecessor;
          delete s.predecessorTaskIds;
        }
      }
    }
  }

  if (childrenMap.size === 0) return result;

  interface RollupInfo {
    start: string;
    finish: string;
    duration: string;
    runningStatus?: string;
    predecessor?: string;
    predecessorTaskIds?: string[];
  }

  const memoSummary = new Map<string, RollupInfo | null>();
  const visiting = new Set<string>();

  function getSummaryRollup(parentKeyLower: string): RollupInfo | null {
    if (memoSummary.has(parentKeyLower)) return memoSummary.get(parentKeyLower)!;
    if (visiting.has(parentKeyLower)) return null;

    const children = childrenMap.get(parentKeyLower);
    if (!children || children.length === 0) {
      memoSummary.set(parentKeyLower, null);
      return null;
    }

    visiting.add(parentKeyLower);
    let minStart = '';
    let maxFinish = '';
    let earliestChild: any = null;
    let latestChild: any = null;
    let allCompleted = true;
    let anyActive = false;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const cIdLower = child.id ? String(child.id).trim().toLowerCase() : '';
      const sub = cIdLower ? getSummaryRollup(cIdLower) : null;
      const cStart = sub ? sub.start : (child.start || '');
      const cFinish = sub ? sub.finish : (child.finish || '');
      const cStatus = sub?.runningStatus || child.runningStatus || '';

      if (cStart && (!minStart || cStart < minStart)) {
        minStart = cStart;
        earliestChild = child;
      }
      if (cFinish && (!maxFinish || cFinish > maxFinish)) {
        maxFinish = cFinish;
        latestChild = child;
      }
      if (cStatus !== 'Completed') allCompleted = false;
      if (cStatus === 'On process' || cStatus === 'Completed' || cStatus === 'Delayed') {
        anyActive = true;
      }
    }

    visiting.delete(parentKeyLower);

    const earCode = earliestChild?.taskCodePhu || (earliestChild?.orderIndex !== undefined ? `#${Number(earliestChild.orderIndex) + 1}` : '');
    const latCode = latestChild?.taskCodePhu || (latestChild?.orderIndex !== undefined ? `#${Number(latestChild.orderIndex) + 1}` : '');
    const predStr = earCode && latCode ? `${earCode}SS, ${latCode}FF` : undefined;
    const predIds = Array.from(
      new Set([earliestChild?.id, latestChild?.id].filter(Boolean).map(String))
    );

    const out: RollupInfo = {
      start: minStart,
      finish: maxFinish,
      duration: minStart && maxFinish ? calcInclusiveDays(minStart, maxFinish) : '0',
      runningStatus: allCompleted ? 'Completed' : (anyActive ? 'On process' : undefined),
      predecessor: predStr,
      predecessorTaskIds: predIds.length > 0 ? predIds : undefined,
    };
    memoSummary.set(parentKeyLower, out);
    return out;
  }

  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    const itemIdLower = item?.id ? String(item.id).trim().toLowerCase() : '';
    if (item && itemIdLower && childrenMap.has(itemIdLower)) {
      const rolled = getSummaryRollup(itemIdLower);
      if (rolled) {
        result[i] = {
          ...item,
          start: rolled.start || item.start || '',
          finish: rolled.finish || item.finish || '',
          duration: rolled.duration || item.duration || '0',
          isModularParent: true,
          ...(rolled.runningStatus ? { runningStatus: rolled.runningStatus } : {}),
          ...(rolled.predecessor ? { predecessor: rolled.predecessor } : {}),
          ...(rolled.predecessorTaskIds ? { predecessorTaskIds: rolled.predecessorTaskIds } : {}),
        };
      }
    }
  }

  return result;
}
