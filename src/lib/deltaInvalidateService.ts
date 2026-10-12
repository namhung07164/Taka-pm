import { collection, documentId, getDocsFromServer, query, where } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { localDb } from './localDb';
import { LOGICAL_TO_FS } from './autoDeltaQueue';
import type { TakaDelta, TakaDeltaItem } from '../types';

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

async function filterRelevant(coll: Logical, ids: string[]): Promise<string[]> {
  if (coll === 'taka_projects') return ids;
  const s = useAppStore.getState();
  const requested =
    coll === 'taka_tasks' ? s.isTasksRequested : coll === 'taka_costs' ? s.isCostsRequested : s.isDelegationsRequested;
  if (requested) return ids;

  const inStore = new Set<string>(
    (coll === 'taka_tasks' ? s.tasks : coll === 'taka_costs' ? s.costs : s.delegationGroups || []).map((x: any) => x.id)
  );
  const rest = ids.filter((id) => !inStore.has(id));
  let inDexie = new Set<string>();
  try {
    const table: any =
      coll === 'taka_tasks' ? localDb.tasks : coll === 'taka_costs' ? localDb.costs : localDb.delegations;
    const rows = await table.bulkGet(rest);
    inDexie = new Set<string>(rows.filter(Boolean).map((r: any) => r.id));
  } catch {}
  return ids.filter((id) => inStore.has(id) || inDexie.has(id));
}

async function fetchChunk(coll: Logical, ids: string[]) {
  const col = collection(db, 'artifacts', APP_ID, 'public', 'data', LOGICAL_TO_FS[coll]);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await getDocsFromServer(query(col, where(documentId(), 'in', ids)));
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
