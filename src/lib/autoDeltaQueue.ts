import type { TakaDeltaItem } from '../types';

/**
 * Auto-delta queue (additive, no firebase import to avoid circular deps).
 *
 * Many mutation paths (costs, budget, delegations, chat, project edits...) write to Firestore without
 * calling recordDelta(), so other devices only saw them through full-collection listeners (or never, for
 * past years / collapsed projects). The firebase.ts write wrappers call queueAutoDelta() for every write to
 * the 4 core collections; a coalesced "invalidate" delta is emitted so other devices re-read just that doc.
 * Paths that already record an explicit delta are detected via markExplicitDelta() and skipped (no double cost).
 */

type Logical = TakaDeltaItem['collectionName'];

const FS_TO_LOGICAL: Record<string, Logical> = {
  taka_projects: 'taka_projects',
  taka_tasks: 'taka_tasks',
  taka_costs: 'taka_costs',
  taka_delegation_groups: 'taka_delegations',
};

export const LOGICAL_TO_FS: Record<Logical, string> = {
  taka_projects: 'taka_projects',
  taka_tasks: 'taka_tasks',
  taka_costs: 'taka_costs',
  taka_delegations: 'taka_delegation_groups',
};

const FLUSH_DELAY_MS = 320;
const MAX_ITEMS_PER_DELTA = 300;
const EXPLICIT_BEFORE_MS = 30000;
const EXPLICIT_AFTER_MS = 30000;
const MAX_SAFE_INLINE_BYTES = 25000;

export interface SafeAutoDeltaPayload {
  data: Record<string, any>;
  isPatch: boolean;
}

const explicitMarks = new Map<string, number>();
const pending = new Map<
  string,
  {
    docId: string;
    collectionName: Logical;
    action: 'invalidate' | 'delete';
    queuedAt: number;
    safePayload?: SafeAutoDeltaPayload;
  }
>();
let timer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (c: string, id: string) => `${c}:${id}`;

export function resolveLogicalCollection(docPath: string): Logical | null {
  if (!docPath) return null;
  if (docPath.includes('taka_projects')) return 'taka_projects';
  if (docPath.includes('taka_tasks')) return 'taka_tasks';
  if (docPath.includes('taka_costs')) return 'taka_costs';
  if (docPath.includes('taka_delegation')) return 'taka_delegations';
  return null;
}

export function markExplicitDelta(items: Array<{ docId?: string; collectionName?: string }>): void {
  const now = Date.now();
  for (const it of items) {
    if (it.docId && it.collectionName) {
      const col = it.collectionName === 'taka_delegation_groups' ? 'taka_delegations' : it.collectionName;
      explicitMarks.set(keyOf(col, it.docId), now);
    }
  }
  if (explicitMarks.size > 5000) {
    const cutoff = now - 60000;
    for (const [k, t] of explicitMarks) if (t < cutoff) explicitMarks.delete(k);
  }
}

export function unmarkExplicitDelta(items: Array<{ docId?: string; collectionName?: string }>): void {
  for (const it of items) {
    if (it.docId && it.collectionName) {
      const col = it.collectionName === 'taka_delegation_groups' ? 'taka_delegations' : it.collectionName;
      explicitMarks.delete(keyOf(col, it.docId));
    }
  }
}

export function queueAutoDelta(
  docPath: string,
  docId: string,
  kind: 'write' | 'delete',
  safePayload?: SafeAutoDeltaPayload
): void {
  const collectionName = resolveLogicalCollection(docPath);
  if (!collectionName || !docId) return;

  let effectiveSafePayload: SafeAutoDeltaPayload | undefined;
  if (kind === 'write' && safePayload?.data && typeof safePayload.data === 'object') {
    try {
      const serialized = JSON.stringify(safePayload.data);
      if (serialized.length > 2 && serialized.length <= MAX_SAFE_INLINE_BYTES) {
        effectiveSafePayload = safePayload;
      }
    } catch {}
  }

  const k = keyOf(collectionName, docId);
  const prev = pending.get(k);
  let mergedPayload = effectiveSafePayload;
  if (prev?.safePayload && effectiveSafePayload) {
    mergedPayload = {
      data: { ...prev.safePayload.data, ...effectiveSafePayload.data },
      isPatch: prev.safePayload.isPatch && effectiveSafePayload.isPatch,
    };
  }

  pending.set(k, {
    docId,
    collectionName,
    action: kind === 'delete' ? 'delete' : 'invalidate',
    queuedAt: Date.now(),
    safePayload: kind === 'delete' ? undefined : mergedPayload,
  });
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushAutoDeltas, FLUSH_DELAY_MS);
}

async function flushAutoDeltas(): Promise<void> {
  timer = null;
  const entries = Array.from(pending.values());
  pending.clear();

  const items: TakaDeltaItem[] = [];
  for (const e of entries) {
    const k = keyOf(e.collectionName, e.docId);
    const mark = explicitMarks.get(k);
    // Both write and delete deltas covered by an explicit recordDelta/recordBatchDeltas are skipped.
    if (mark && mark >= e.queuedAt - EXPLICIT_BEFORE_MS && mark <= e.queuedAt + EXPLICIT_AFTER_MS) {
      explicitMarks.delete(k);
      continue;
    }
    if (e.action === 'delete') {
      items.push({ docId: e.docId, collectionName: e.collectionName, action: 'delete', data: {} });
    } else if (e.safePayload) {
      const d = e.safePayload.data;
      const yr = d.year ?? d.projectYear;
      const pId = d.projectId;
      const pCode = d.projectCode ?? d.code;
      const pStore = d.projectStore ?? d.store;
      items.push({
        docId: e.docId,
        collectionName: e.collectionName,
        action: e.safePayload.isPatch ? 'update' : 'create',
        isPatch: e.safePayload.isPatch,
        invalidate: false,
        data: d,
        ...(yr !== undefined && yr !== null && String(yr).trim() !== '' ? { year: String(yr).trim() } : {}),
        ...(pId ? { projectId: String(pId) } : {}),
        ...(pCode ? { projectCode: String(pCode) } : {}),
        ...(pStore ? { projectStore: String(pStore) } : {}),
      });
    } else {
      items.push({
        docId: e.docId,
        collectionName: e.collectionName,
        action: 'update',
        data: {},
        isPatch: true,
        invalidate: true,
      });
    }
  }
  if (items.length === 0) return;

  try {
    const { recordBatchDeltas } = await import('./deltaSyncService');
    for (let i = 0; i < items.length; i += MAX_ITEMS_PER_DELTA) {
      await recordBatchDeltas(items.slice(i, i + MAX_ITEMS_PER_DELTA));
    }
  } catch (err) {
    console.warn('[autoDelta] Failed to record auto deltas:', err);
  }
}
