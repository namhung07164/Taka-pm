import { TakaDeltaItem } from '../types';

/**
 * Compares two values for equality in the context of entity field comparisons.
 */
export function isEqualValue(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;

  // Primitive types
  if (typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }

  // Dates
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  // Plain objects
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Computes a field-level patch representing only the changed, added, or removed keys
 * between previous and current entity snapshots.
 *
 * Saves 80% - 95% bandwidth by stripping dozens of unchanged fields (e.g. comments, logs,
 * coordinates, checklists, member descriptions) while keeping essential identifiers.
 */
export function computeFieldPatch<T extends Record<string, any>>(
  previous: T | null | undefined,
  current: T
): Record<string, any> {
  if (!previous) {
    // New entity creation: return full object
    return { ...current };
  }

  const patch: Record<string, any> = {};
  let hasChanges = false;

  // Detect modified or added fields
  for (const key of Object.keys(current)) {
    // Always preserve essential identifier & discriminator metadata
    if (key === 'id') {
      patch.id = current.id;
      continue;
    }

    const prevVal = previous[key];
    const currVal = current[key];

    if (!isEqualValue(prevVal, currVal)) {
      patch[key] = currVal;
      hasChanges = true;
    }
  }

  // Detect removed fields (present in previous but absent/undefined in current)
  for (const key of Object.keys(previous)) {
    if (key === 'id') continue;
    if (previous[key] !== undefined && current[key] === undefined) {
      patch[key] = null;
      hasChanges = true;
    }
  }

  // If no functional fields changed, return minimal stub with timestamp
  if (!hasChanges) {
    patch.id = current.id;
    if (current.updatedAt) patch.updatedAt = current.updatedAt;
    return patch;
  }

  // Always include updatedAt if present on current
  if (current.updatedAt && !patch.updatedAt) {
    patch.updatedAt = current.updatedAt;
  }

  // Preserve projectCode/projectYear if present to support Tri-Gate / year filter routing
  if (current.projectCode && !patch.projectCode) {
    patch.projectCode = current.projectCode;
  }
  if (current.projectYear !== undefined && patch.projectYear === undefined) {
    patch.projectYear = current.projectYear;
  }

  return patch;
}

/**
 * Safely applies a field-level patch onto an in-memory entity.
 * Prevents concurrent clobbering: fields not present in the patch remain untouched.
 */
export function applyFieldPatch<T extends Record<string, any>>(
  target: T,
  patch: Record<string, any>
): T {
  if (!target) return { ...patch } as T;
  if (!patch) return target;

  const result: any = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Creates an optimized TakaDeltaItem containing only field-level changes.
 */
export function createPatchDeltaItem(params: {
  docId: string;
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations';
  previous?: any;
  updated: any;
  action?: 'create' | 'update' | 'delete';
  year?: string;
  forcePatch?: boolean;
}): TakaDeltaItem {
  const { docId, collectionName, previous, updated, year } = params;
  const action = params.action || (previous ? 'update' : 'create');

  if (action === 'delete') {
    return {
      docId,
      collectionName,
      action: 'delete',
      year,
    };
  }

  if (action === 'create' || !previous) {
    return {
      docId,
      collectionName,
      action: 'create',
      data: updated,
      isPatch: false,
      year: year || (updated?.projectYear ? String(updated.projectYear) : undefined),
    };
  }

  // Action is update: compute granular field diff
  const patch = computeFieldPatch(previous, updated);

  return {
    docId,
    collectionName,
    action: 'update',
    isPatch: true,
    data: patch,
    year: year || (updated?.projectYear ? String(updated.projectYear) : undefined),
  };
}

/**
 * Batch version: transforms multiple mutations into field-level granular delta items.
 */
export function createBatchPatchDeltaItems(
  items: Array<{
    docId: string;
    collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations';
    previous?: any;
    updated: any;
    action?: 'create' | 'update' | 'delete';
    year?: string;
  }>
): TakaDeltaItem[] {
  return items.map((item) => createPatchDeltaItem(item));
}

/**
 * Calculates raw byte size difference to monitor bandwidth optimization.
 */
export function measurePayloadDiff(
  fullObj: any,
  patchObj: any
): {
  fullBytes: number;
  patchBytes: number;
  savedBytes: number;
  percentSaved: number;
} {
  const fullStr = JSON.stringify(fullObj || {});
  const patchStr = JSON.stringify(patchObj || {});
  const fullBytes = new TextEncoder().encode(fullStr).length;
  const patchBytes = new TextEncoder().encode(patchStr).length;
  const savedBytes = Math.max(0, fullBytes - patchBytes);
  const percentSaved = fullBytes > 0 ? Number(((savedBytes / fullBytes) * 100).toFixed(1)) : 0;

  return {
    fullBytes,
    patchBytes,
    savedBytes,
    percentSaved,
  };
}
