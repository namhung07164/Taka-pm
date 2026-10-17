import { collection, documentId, getDocsFromServer, query, where } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { localDb } from './localDb';
import { LOGICAL_TO_FS } from './autoDeltaQueue';
import type { TakaDelta, TakaDeltaItem } from '../types';
import { usePerformanceStore } from '../store/usePerformanceStore';

/**
 * Resolves "invalidate" delta items: re-reads only the changed docs from the server (1 read per doc,
 * in chunks of 30 ids) and returns synthetic deltas (create/delete) that the normal apply pipeline understands.
 *
 * Read-saving relevance filter: for tasks/costs/delegations a doc is re-read only if this device already holds it
 * (Zustand or Dexie) or the collection is currently requested (Tri-Gate). Projects are always re-read.
 */

type Logical = TakaDeltaItem['collectionName'];
const CHUNK = 30;
const MAX_DOCS = 1500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}


/**
 * B2: Checks if a document is already covered by a live active onSnapshot listener.
 * If so, the real-time listener will receive the update natively, so invalidate re-read is skipped.
 */
function isCoveredByLiveListener(coll: Logical, docId: string): boolean {
  try {
    const stats = usePerformanceStore.getState().collectionStats;
    const store = useAppStore.getState();
    const currentYear = store.globalYearFilter || '2026';

    if (coll === 'taka_projects') {
      const proj = store.projects?.find((p) => p.id === docId);
      const year = proj?.year ? String(proj.year) : (currentYear !== 'all' ? currentYear : null);
      if (year && (stats[`taka_projects_${year}`]?.activeListeners || 0) > 0) return true;
      if (currentYear !== 'all' && (stats[`taka_projects_${currentYear}`]?.activeListeners || 0) > 0) {
        if (!proj || String(proj.year) === String(currentYear)) return true;
      }
      return false;
    }

    if (coll === 'taka_tasks') {
      const task = store.tasks?.find((t) => t.id === docId);
      const year = task?.projectYear ? String(task.projectYear) : (currentYear !== 'all' ? currentYear : null);
      if (year && (stats[`taka_tasks_year_${year}`]?.activeListeners || 0) > 0) return true;
      if (task?.projectId && (stats[`taka_tasks_proj_${task.projectId}`]?.activeListeners || 0) > 0) return true;
      return false;
    }

    if (coll === 'taka_costs') {
      const cost = store.costs?.find((c) => c.id === docId);
      const year = cost?.projectYear ? String(cost.projectYear) : (currentYear !== 'all' ? currentYear : null);
      if (year && (stats[`taka_costs_${year}`]?.activeListeners || 0) > 0) return true;
      return false;
    }

    if (coll === 'taka_delegations') {
      const group = store.delegationGroups?.find((g) => g.id === docId);
      const year = group?.projectYear ? String(group.projectYear) : (currentYear !== 'all' ? currentYear : null);
      if (year && (stats[`taka_delegation_groups_${year}`]?.activeListeners || 0) > 0) return true;
      return false;
    }
  } catch (err) {
    console.warn('[deltaInvalidate] isCoveredByLiveListener error:', err);
  }
  return false;
}

/**
 * B1 & B2: Relevance filter:
 * 1. Filter out documents already covered by active onSnapshot listeners (B2: 0 redundant read).
 * 2. For tasks/costs/delegations, only re-read if Tri-Gate is currently requested on this device
 *    or the document is already held locally in Zustand/Dexie (B1: stop wasted reads on unrequested slices).
 */
async function filterRelevant(coll: Logical, ids: string[]): Promise<string[]> {
  if (!ids || ids.length === 0) return [];

  // Always re-read invalidated project docs to guarantee cross-device sync
  if (coll === 'taka_projects') return ids;

  const store = useAppStore.getState();

  if (coll === 'taka_tasks') {
    if (store.isTasksRequested) return ids;
    const storeTaskIds = new Set((store.tasks || []).map((t) => t.id));
    const relevant: string[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      if (storeTaskIds.has(id)) relevant.push(id);
      else missing.push(id);
    }
    if (missing.length > 0) {
      try {
        const dexieDocs = await localDb.tasks.where('id').anyOf(missing).toArray();
        dexieDocs.forEach((d) => relevant.push(d.id));
      } catch {}
    }
    return relevant;
  }

  if (coll === 'taka_costs') {
    if (store.isCostsRequested) return ids;
    const storeCostIds = new Set((store.costs || []).map((c) => c.id));
    const relevant: string[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      if (storeCostIds.has(id)) relevant.push(id);
      else missing.push(id);
    }
    if (missing.length > 0) {
      try {
        const dexieDocs = await localDb.costs.where('id').anyOf(missing).toArray();
        dexieDocs.forEach((d) => relevant.push(d.id));
      } catch {}
    }
    return relevant;
  }

  if (coll === 'taka_delegations') {
    if (store.isDelegationsRequested) return ids;
    const storeGroupIds = new Set((store.delegationGroups || []).map((g) => g.id));
    const relevant: string[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      if (storeGroupIds.has(id)) relevant.push(id);
      else missing.push(id);
    }
    if (missing.length > 0) {
      try {
        const dexieDocs = await localDb.delegations.where('id').anyOf(missing).toArray();
        dexieDocs.forEach((d) => relevant.push(d.id));
      } catch {}
    }
    return relevant;
  }

  return ids;
}

async function fetchChunk(coll: Logical, ids: string[]) {
  const fsColl = LOGICAL_TO_FS[coll];
  const col = collection(db, 'artifacts', APP_ID, 'public', 'data', fsColl);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const snap = await getDocsFromServer(query(col, where(documentId(), 'in', ids)));
      usePerformanceStore
        .getState()
        .trackGetDoc(
          `${fsColl}_invalidate`,
          false,
          snap.size || 1,
          `Delta invalidate fetch (${ids.length} id)`
        );
      return snap;
    } catch (err) {
      if (attempt === 1) console.warn('[deltaInvalidate] fetch failed:', err);
      else await sleep(2000);
    }
  }
  return null;
}

export async function resolveInvalidations(items: TakaDeltaItem[]): Promise<TakaDelta[]> {
  if (!items || items.length === 0) return [];

  const byColl = new Map<Logical, Set<string>>();
  for (const it of items) {
    if (!it.docId) continue;
    if (!byColl.has(it.collectionName)) byColl.set(it.collectionName, new Set());
    byColl.get(it.collectionName)!.add(it.docId);
  }

  const out: TakaDeltaItem[] = [];
  let budget = MAX_DOCS;

  for (const [coll, idSet] of byColl) {
    let ids = await filterRelevant(coll, Array.from(idSet));
    if (ids.length > budget) ids = ids.slice(0, budget);
    budget -= ids.length;

    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      chunks.push(ids.slice(i, i + CHUNK));
    }

    const snaps = await Promise.all(chunks.map((chunk) => fetchChunk(coll, chunk)));
    snaps.forEach((snap, idx) => {
      if (!snap) return;
      const chunk = chunks[idx];
      const found = new Set<string>();
      snap.forEach((d) => {
        found.add(d.id);
        const data = d.data() as Record<string, any>;
        if (data?.isDeleted) {
          out.push({ docId: d.id, collectionName: coll, action: 'delete', data: {} });
        } else {
          const y = data?.year ?? data?.projectYear;
          out.push({ docId: d.id, collectionName: coll, action: 'create', data, year: y ? String(y) : undefined });
        }
      });
      // Docs that no longer exist on the server were hard-deleted
      chunk.forEach((id) => {
        if (!found.has(id)) out.push({ docId: id, collectionName: coll, action: 'delete', data: {} });
      });
    });
  }

  if (out.length === 0) return [];
  const now = Date.now();
  return [
    {
      id: `invalidate_resolved_${now}_${Math.random().toString(36).slice(2, 8)}`,
      action: 'batch_update',
      batchItems: out,
      updatedBy: 'invalidate',
      sessionId: 'invalidate_resolved',
      timestamp: new Date(now).toISOString(),
      // 0 so resolving never advances lastSyncTime
      numericTime: 0,
    },
  ];
}
