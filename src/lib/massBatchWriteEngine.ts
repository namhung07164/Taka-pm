import { doc } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { writeBatch } from './firestoreWrites';
import { markExplicitDelta, resolveLogicalCollection } from './autoDeltaQueue';
import { syncQueueManager, isPermanentWriteError } from './syncQueue';

export interface MassWriteOp {
  collectionName: string;
  docId: string;
  action: 'set' | 'update' | 'delete';
  data?: Record<string, any>;
  merge?: boolean;
}

export interface ExecuteMassBatchOptions {
  maxOpsPerBatch?: number;
  maxBytesPerBatch?: number;
  concurrency?: number;
  suppressAutoDelta?: boolean;
  onProgress?: (completedOps: number, totalOps: number) => void;
}

export interface ExecuteMassBatchResult {
  totalOps: number;
  committedOps: number;
  queuedOfflineOps: number;
}

const DEFAULT_MAX_OPS_PER_BATCH = 180;
const DEFAULT_MAX_BYTES_PER_BATCH = 1_500_000;
const DEFAULT_CONCURRENCY = 2;
const MAX_RETRY_ATTEMPTS = 4;

let activeMassWriteSessions = 0;

function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (activeMassWriteSessions > 0) {
    e.preventDefault();
    e.returnValue = 'Data import is still syncing to the cloud. Are you sure you want to leave?';
    return e.returnValue;
  }
}

function acquireInFlightGuard(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (activeMassWriteSessions === 0) {
    window.addEventListener('beforeunload', handleBeforeUnload);
  }
  activeMassWriteSessions++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeMassWriteSessions = Math.max(0, activeMassWriteSessions - 1);
    if (activeMassWriteSessions === 0) {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  };
}

function estimateOpBytes(op: MassWriteOp): number {
  if (op.action === 'delete' || !op.data) return 160;
  try {
    return JSON.stringify(op.data).length * 2 + 200;
  } catch {
    return 2048;
  }
}

/**
 * Coalesces duplicate operations targeting the exact same (collectionName, docId)
 * in order of appearance so a single Firestore writeBatch never touches the same docRef twice
 * and redundant writes are eliminated.
 */
export function coalesceMassWriteOps(ops: MassWriteOp[]): MassWriteOp[] {
  const map = new Map<string, MassWriteOp>();
  for (const op of ops) {
    if (!op.docId || !op.collectionName) continue;
    const key = `${op.collectionName}:::${op.docId}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, op);
      continue;
    }
    if (op.action === 'delete') {
      map.set(key, op);
    } else if (existing.action === 'set' && op.action === 'update') {
      map.set(key, {
        ...existing,
        data: { ...(existing.data || {}), ...(op.data || {}) },
      });
    } else if (existing.action === 'update' && op.action === 'update') {
      map.set(key, {
        ...existing,
        data: { ...(existing.data || {}), ...(op.data || {}) },
      });
    } else {
      map.set(key, {
        ...op,
        data:
          existing.data && op.data && op.merge !== false
            ? { ...existing.data, ...op.data }
            : op.data,
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Splits coalesced operations into chunks that strictly respect BOTH operation count
 * and serialized byte payload limits.
 */
export function buildSafeBatchChunks(
  ops: MassWriteOp[],
  maxOps = DEFAULT_MAX_OPS_PER_BATCH,
  maxBytes = DEFAULT_MAX_BYTES_PER_BATCH
): MassWriteOp[][] {
  const coalesced = coalesceMassWriteOps(ops);
  const chunks: MassWriteOp[][] = [];
  let currentChunk: MassWriteOp[] = [];
  let currentBytes = 0;

  for (const op of coalesced) {
    const opBytes = estimateOpBytes(op);
    if (
      currentChunk.length > 0 &&
      (currentChunk.length >= maxOps || currentBytes + opBytes > maxBytes)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBytes = 0;
    }
    currentChunk.push(op);
    currentBytes += opBytes;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

function executeSingleBatchCommit(
  chunk: MassWriteOp[],
  suppressAutoDelta: boolean
): Promise<void> {
  const batch = writeBatch(db);
  const explicitMarks: Array<{ docId: string; collectionName: string }> = [];

  for (const op of chunk) {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', op.collectionName, op.docId);
    if (suppressAutoDelta && op.action !== 'delete') {
      const logical = resolveLogicalCollection(op.collectionName);
      if (logical) {
        explicitMarks.push({ docId: op.docId, collectionName: logical });
      }
    }
    if (op.action === 'delete') {
      batch.delete(docRef);
    } else if (op.action === 'update') {
      batch.update(docRef, op.data || {});
    } else {
      batch.set(docRef, op.data || {}, { merge: op.merge !== false });
    }
  }

  if (explicitMarks.length > 0) {
    markExplicitDelta(explicitMarks);
  }

  return batch.commit();
}

/**
 * Commits a chunk with exponential backoff + jitter.
 * If a chunk fails after retries and contains multiple operations, bisects the chunk
 * recursively to isolate any problematic document, and queues any remaining failed ops
 * into the persistent IndexedDB Offline SyncQueue.
 */
async function commitChunkResilient(
  chunk: MassWriteOp[],
  suppressAutoDelta: boolean
): Promise<{ committed: number; queuedOffline: number }> {
  if (chunk.length === 0) return { committed: 0, queuedOffline: 0 };

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      await executeSingleBatchCommit(chunk, suppressAutoDelta);
      return { committed: chunk.length, queuedOffline: 0 };
    } catch (err: any) {
      const code = String(err?.code || '').toLowerCase();
      // If payload size or invalid-argument on a multi-item batch, bisect immediately without waiting
      if (
        chunk.length > 1 &&
        (code.includes('invalid-argument') ||
          code.includes('out-of-range') ||
          String(err?.message || '').toLowerCase().includes('size'))
      ) {
        break;
      }
      if (attempt >= MAX_RETRY_ATTEMPTS) {
        break;
      }
      const baseDelay = 350 * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, baseDelay + jitter));
    }
  }

  // Adaptive Binary Bisection when chunk size > 4 to isolate transient or single-doc failures
  if (chunk.length > 4) {
    const mid = Math.floor(chunk.length / 2);
    const left = await commitChunkResilient(chunk.slice(0, mid), suppressAutoDelta);
    const right = await commitChunkResilient(chunk.slice(mid), suppressAutoDelta);
    return {
      committed: left.committed + right.committed,
      queuedOffline: left.queuedOffline + right.queuedOffline,
    };
  }

  // Fallback to persistent IndexedDB SyncQueue so zero records are ever lost
  const queueItems = chunk
    .filter((op) => !isPermanentWriteError(op))
    .map((op) => ({
      collectionName: op.collectionName,
      docId: op.docId,
      action: op.action,
      data: op.data || null,
    }));

  if (queueItems.length > 0) {
    await syncQueueManager.bulkAddToQueue(queueItems);
  }

  return { committed: 0, queuedOffline: queueItems.length };
}

/**
 * Executes a large array of Firestore write/update/delete operations reliably using:
 * - Operation & payload byte-size dual chunking
 * - Duplicate docId coalescing
 * - Bounded concurrency with backpressure pacing
 * - Exponential backoff retry + recursive binary bisection
 * - Automatic IndexedDB SyncQueue fallback
 * - Browser beforeunload guard while writes are in flight
 */
export async function executeMassBatchOperations(
  ops: MassWriteOp[],
  options: ExecuteMassBatchOptions = {}
): Promise<ExecuteMassBatchResult> {
  if (!ops || ops.length === 0) {
    return { totalOps: 0, committedOps: 0, queuedOfflineOps: 0 };
  }

  const maxOps = options.maxOpsPerBatch ?? DEFAULT_MAX_OPS_PER_BATCH;
  const maxBytes = options.maxBytesPerBatch ?? DEFAULT_MAX_BYTES_PER_BATCH;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const suppressAutoDelta = options.suppressAutoDelta ?? false;

  const chunks = buildSafeBatchChunks(ops, maxOps, maxBytes);
  const totalOps = chunks.reduce((acc, c) => acc + c.length, 0);
  let committedOps = 0;
  let queuedOfflineOps = 0;
  let completedOps = 0;

  const releaseGuard = acquireInFlightGuard();

  try {
    for (let i = 0; i < chunks.length; i += concurrency) {
      const wave = chunks.slice(i, i + concurrency);
      const results = await Promise.all(
        wave.map(async (chunk) => {
          const res = await commitChunkResilient(chunk, suppressAutoDelta);
          completedOps += chunk.length;
          if (options.onProgress) {
            try {
              options.onProgress(completedOps, totalOps);
            } catch {
              // ignore progress callback error
            }
          }
          return res;
        })
      );

      for (const r of results) {
        committedOps += r.committed;
        queuedOfflineOps += r.queuedOffline;
      }

      // Brief backpressure yield between waves on large imports to prevent Firestore write throttling
      if (i + concurrency < chunks.length && chunks.length > 4) {
        await new Promise((r) => setTimeout(r, 20));
      }
    }
  } finally {
    releaseGuard();
  }

  return { totalOps, committedOps, queuedOfflineOps };
}
