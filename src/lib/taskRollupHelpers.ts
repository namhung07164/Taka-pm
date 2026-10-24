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

/**
 * Rolls up task summaries for project computed summaries in O(N).
 */
export function rollupTaskSummaries(summaries: any[]): any[] {
  if (!Array.isArray(summaries) || summaries.length === 0) return summaries || [];

  const summaryByIdLower = new Map<string, any>();
  const summaryByCodeLower = new Map<string, any>();
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    if (!s) continue;
    if (s.id) summaryByIdLower.set(String(s.id).trim().toLowerCase(), s);
    if (s.taskCodePhu) summaryByCodeLower.set(String(s.taskCodePhu).trim().toLowerCase(), s);
  }

  const childrenMap = new Map<string, any[]>();
  const result = [...summaries];

  for (let i = 0; i < result.length; i++) {
    const s = result[i];
    const rawP = s?.parentTaskId || s?.parentId;
    if (s && s.id && rawP) {
      const pLower = String(rawP).trim().toLowerCase();
      const matchedParent = summaryByIdLower.get(pLower) || summaryByCodeLower.get(pLower);
      const canonicalParentId = matchedParent?.id ? String(matchedParent.id) : String(rawP);
      if (canonicalParentId === String(s.id)) continue;
      if (s.parentTaskId !== canonicalParentId) {
        result[i] = { ...s, parentTaskId: canonicalParentId };
      }
      let list = childrenMap.get(canonicalParentId);
      if (!list) {
        list = [];
        childrenMap.set(canonicalParentId, list);
      }
      list.push(result[i]);
    }
  }

  if (childrenMap.size === 0) return summaries;

  const memoSummary = new Map<string, { start: string; finish: string } | null>();
  const visiting = new Set<string>();

  function getSummaryRollup(parentId: string): { start: string; finish: string } | null {
    if (memoSummary.has(parentId)) return memoSummary.get(parentId)!;
    if (visiting.has(parentId)) return null;

    const children = childrenMap.get(parentId);
    if (!children || children.length === 0) {
      memoSummary.set(parentId, null);
      return null;
    }

    visiting.add(parentId);
    let minStart = '';
    let maxFinish = '';

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const sub = child.id ? getSummaryRollup(child.id) : null;
      const cStart = sub ? sub.start : (child.start || '');
      const cFinish = sub ? sub.finish : (child.finish || '');

      if (cStart && (!minStart || cStart < minStart)) minStart = cStart;
      if (cFinish && (!maxFinish || cFinish > maxFinish)) maxFinish = cFinish;
    }

    visiting.delete(parentId);
    const out = { start: minStart, finish: maxFinish };
    memoSummary.set(parentId, out);
    return out;
  }

  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (item && item.id && childrenMap.has(item.id)) {
      const rolled = getSummaryRollup(item.id);
      if (rolled) {
        result[i] = {
          ...item,
          start: rolled.start || '',
          finish: rolled.finish || '',
        };
      }
    }
  }

  return result;
}
