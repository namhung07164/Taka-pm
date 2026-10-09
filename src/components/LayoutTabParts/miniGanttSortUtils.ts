import { Task } from '../../types';
import { extractSubtaskIndex } from '../../lib/ganttUtils';

/**
 * Natural comparison for subtask codes (taskCodePhu).
 * Sorts tasks strictly by task code phụ:
 * - Numerical: #1, #2, #3 ... #10, #11
 * - Plain numbers: 1, 2, 3 ... 10, 11
 * - Prefixed codes: CP-01-1, CP-01-2 ... CP-01-10
 * - Dot codes: 1.1, 1.2 ... 2.1
 * - Falls back to orderIndex, then start date, then name.
 */
export function compareTasksBySubtaskCode(a: Task, b: Task): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const rawCodeA = String(a.taskCodePhu || '').trim();
  const rawCodeB = String(b.taskCodePhu || '').trim();

  // 1. If both tasks have explicit taskCodePhu
  if (rawCodeA && rawCodeB) {
    if (rawCodeA === rawCodeB) {
      const ordA = a.orderIndex !== undefined && a.orderIndex !== null ? a.orderIndex : 0;
      const ordB = b.orderIndex !== undefined && b.orderIndex !== null ? b.orderIndex : 0;
      if (ordA !== ordB) return ordA - ordB;
      return String(a.start || '').localeCompare(String(b.start || ''));
    }

    // Direct check for pure hash / numbers: e.g. "#1" vs "#2" or "1" vs "2"
    const hashOrNumA = rawCodeA.match(/^[#]?\s*(\d+)$/);
    const hashOrNumB = rawCodeB.match(/^[#]?\s*(\d+)$/);
    if (hashOrNumA && hashOrNumB) {
      const nA = parseInt(hashOrNumA[1], 10);
      const nB = parseInt(hashOrNumB[1], 10);
      if (nA !== nB) return nA - nB;
    }

    // Check for common prefix followed by delimiter and number: e.g. "CP-01-1" vs "CP-01-2"
    const prefixMatchA = rawCodeA.match(/^(.*?)(?:[-_.:#\s]+)(\d+)$/);
    const prefixMatchB = rawCodeB.match(/^(.*?)(?:[-_.:#\s]+)(\d+)$/);
    if (prefixMatchA && prefixMatchB) {
      const pfxA = prefixMatchA[1].trim().toLowerCase();
      const pfxB = prefixMatchB[1].trim().toLowerCase();
      if (pfxA === pfxB) {
        const numA = parseInt(prefixMatchA[2], 10);
        const numB = parseInt(prefixMatchB[2], 10);
        if (numA !== numB) return numA - numB;
      } else {
        const pfxCmp = pfxA.localeCompare(pfxB, undefined, { numeric: true, sensitivity: 'base' });
        if (pfxCmp !== 0) return pfxCmp;
      }
    }

    // Check numerical subtask index extracted from end (e.g. #1 vs #2, -1 vs -2)
    const subIdxA = extractSubtaskIndex(rawCodeA);
    const subIdxB = extractSubtaskIndex(rawCodeB);
    if (subIdxA !== null && subIdxB !== null && subIdxA !== subIdxB) {
      return subIdxA - subIdxB;
    }

    // Natural alphanumeric comparison
    const cmp = rawCodeA.localeCompare(rawCodeB, undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
  } else if (rawCodeA && !rawCodeB) {
    return -1;
  } else if (!rawCodeA && rawCodeB) {
    return 1;
  }

  // 2. Prioritize orderIndex if explicitly assigned
  const orderA = a.orderIndex !== undefined && a.orderIndex !== null ? a.orderIndex : null;
  const orderB = b.orderIndex !== undefined && b.orderIndex !== null ? b.orderIndex : null;
  if (orderA !== null && orderB !== null && orderA !== orderB) {
    return orderA - orderB;
  }
  if (orderA !== null && orderB === null) return -1;
  if (orderA === null && orderB !== null) return 1;

  // 3. Chronological by Start Date
  const startA = a.start || '';
  const startB = b.start || '';
  if (startA && startB && startA !== startB) {
    return startA.localeCompare(startB);
  }

  // 4. Stable sort using Name and then ID
  const nameA = a.name || '';
  const nameB = b.name || '';
  if (nameA && nameB && nameA !== nameB) {
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  }

  return String(a.id || '').localeCompare(String(b.id || ''));
}
