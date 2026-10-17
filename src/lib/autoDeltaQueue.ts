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

const FLUSH_DELAY_MS = 1200;
const MAX_ITEMS_PER_DELTA = 300;
const EXPLICIT_BEFORE_MS = 5000;
const EXPLICIT_AFTER_MS = 15000;

const explicitMarks = new Map<string, number>();
const pending = new Map<string, { docId: string; collectionName: Logical; action: 'invalidate' | 'delete'; queuedAt: number }>();
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
    if (it.docId && it.collectionName) explicitMarks.set(keyOf(it.collectionName, it.docId), now);
  }
  if (explicitMarks.size > 5000) {
    const cutoff = now - 60000;
    for (const [k, t] of explicitMarks) if (t < cutoff) explicitMarks.delete(k);
  }
}

export function unmarkExplicitDelta(items: Array<{ docId?: string; collectionName?: string }>): void {
  for (const it of items) {
    if (it.docId && it.collectionName) explicitMarks.delete(keyOf(it.collectionName, it.docId));
  }
}

export function queueAutoDelta(docPath: string, docId: string, kind: 'write' | 'delete'): void {
  const collectionName = resolveLogicalCollection(docPath);
  if (!collectionName || !docId) return;
  pending.set(keyOf(collectionName, docId), {
    docId,
    collectionName,
    action: kind === 'delete' ? 'delete' : 'invalidate',
    queuedAt: Date.now(),
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
    const mark = explicitMarks.get(keyOf(e.collectionName, e.docId));
    // Delete deltas are cheap and authoritative: always emit. Writes covered by an explicit delta are skipped.
    if (e.action === 'invalidate' && mark && mark >= e.queuedAt - EXPLICIT_BEFORE_MS && mark <= e.queuedAt + EXPLICIT_AFTER_MS) {
      continue;
    }
    items.push(
      e.action === 'delete'
        ? { docId: e.docId, collectionName: e.collectionName, action: 'delete', data: {} }
        : { docId: e.docId, collectionName: e.collectionName, action: 'update', data: {}, isPatch: true, invalidate: true }
    );
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
