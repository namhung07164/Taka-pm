import {
  serverTimestamp,
  Timestamp,
  doc,
  setDoc,
} from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { TakaDelta, TakaDeltaItem } from '../types';
import { broadcastAppliedDeltas } from './broadcastSyncService';
import { markExplicitDelta } from './autoDeltaQueue';
import { CLIENT_SESSION_ID, DELTA_COLLECTION } from './deltaConstants';
import { removeUndefinedDeep } from './firestoreSanitizer';
import { resetStalledFirestoreConnection } from './syncResilience';

/**
 * Ghi lại 1 delta change log khi có mutation phát sinh
 * Cho phép các máy trạm khác chỉ cần pull delta này thay vì tải lại toàn bộ collection
 */
export async function recordDelta(delta: {
  docId: string;
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations';
  action: 'create' | 'update' | 'delete';
  data: Record<string, any> | null;
  year?: string;
  projectId?: string;
  projectCode?: string;
  store?: string;
  updatedBy?: string;
  isPatch?: boolean;
}): Promise<void> {
  markExplicitDelta([{ docId: delta.docId, collectionName: delta.collectionName }]);
  const now = Date.now();
  const deltaId = `delta_${now}_${Math.random().toString(36).substring(2, 8)}`;
  const nowIso = new Date(now).toISOString();

  const deltaPayload: TakaDelta = {
    id: deltaId,
    docId: delta.docId,
    collectionName: delta.collectionName,
    action: delta.action,
    ...(delta.year ? { year: String(delta.year) } : {}),
    ...(delta.projectId ? { projectId: String(delta.projectId) } : {}),
    ...(delta.projectCode ? { projectCode: String(delta.projectCode) } : {}),
    ...(delta.store ? { projectStore: String(delta.store) } : {}),
    data: delta.data || {},
    ...(delta.isPatch !== undefined ? { isPatch: delta.isPatch } : {}),
    updatedBy: delta.updatedBy || useAppStore.getState().currentUser?.email || 'system',
    sessionId: CLIENT_SESSION_ID,
    timestamp: nowIso,
    numericTime: now,
    serverTime: serverTimestamp() as any,
    expireAt: Timestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000),
  };

  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION, deltaId);
    const cleanPayload = removeUndefinedDeep(deltaPayload);
    await setDeltaDocWithRetry(docRef, cleanPayload);

    // Phát tín hiệu tức thì sang các máy trạm khác trong cùng trình duyệt (0 Read)
    broadcastAppliedDeltas([deltaPayload]);
  } catch (err) {
    console.warn('[deltaSync] Failed to record delta to Firestore:', err);
  }
}

/**
 * Giai đoạn 2: Ghi gom hàng loạt mutation vào Document Delta theo lô an toàn
 * Kẹp kép: tối đa 45 items/doc VÀ tối đa ~240KB/doc để tuyệt đối không vượt trần HTTP Long-Polling của iPadOS/iOS và 1MB của Firestore
 */
const MAX_ITEMS_PER_DELTA_DOC = 45;
const MAX_BYTES_PER_DELTA_DOC = 240_000;
const DELTA_WRITE_CONCURRENCY = 2;

function estimateDeltaItemBytes(item: TakaDeltaItem): number {
  try {
    return JSON.stringify(item).length * 2 + 128;
  } catch {
    return 2048;
  }
}

async function setDeltaDocWithRetry(docRef: any, payload: any, maxAttempts = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let wakeTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      wakeTimer = null;
      resetStalledFirestoreConnection().catch(() => {});
    }, 3500);
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        setDoc(docRef, payload),
        new Promise<never>((_, reject) => {
          hardTimer = setTimeout(() => reject(new Error('DELTA_WRITE_TIMEOUT')), 10000);
        }),
      ]);
      return;
    } catch (err: any) {
      if (String(err?.message || '').includes('DELTA_WRITE_TIMEOUT')) {
        // setDoc is already buffered in Firestore's persistent IndexedDB queue and flushing after socket reset
        await resetStalledFirestoreConnection().catch(() => {});
        return;
      }
      if (attempt >= maxAttempts) throw err;
      const delayMs = 350 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, delayMs));
    } finally {
      if (wakeTimer) clearTimeout(wakeTimer);
      if (hardTimer) clearTimeout(hardTimer);
    }
  }
}

export async function recordBatchDeltas(
  items: TakaDeltaItem[],
  updatedBy?: string
): Promise<void> {
  if (!items || items.length === 0) return;
  markExplicitDelta(items.filter((i) => !i.invalidate));
  if (items.length === 1 && !items[0].invalidate) {
    const item = items[0];
    return recordDelta({
      docId: item.docId,
      collectionName: item.collectionName,
      action: item.action,
      data: item.data || {},
      year: item.year,
      projectId: item.projectId,
      projectCode: item.projectCode,
      store: item.projectStore,
      isPatch: item.isPatch,
      updatedBy,
    });
  }

  const effectiveUpdatedBy =
    updatedBy || useAppStore.getState().currentUser?.email || 'system';
  const chunks: TakaDeltaItem[][] = [];
  let currentChunk: TakaDeltaItem[] = [];
  let currentBytes = 0;

  for (const item of items) {
    const itemBytes = estimateDeltaItemBytes(item);
    if (
      currentChunk.length > 0 &&
      (currentChunk.length >= MAX_ITEMS_PER_DELTA_DOC ||
        currentBytes + itemBytes > MAX_BYTES_PER_DELTA_DOC)
    ) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBytes = 0;
    }
    currentChunk.push(item);
    currentBytes += itemBytes;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  const createdPayloads: TakaDelta[] = [];

  try {
    for (let i = 0; i < chunks.length; i += DELTA_WRITE_CONCURRENCY) {
      const wave = chunks.slice(i, i + DELTA_WRITE_CONCURRENCY);
      await Promise.all(
        wave.map(async (chunkItems, waveIdx) => {
          const chunkIdx = i + waveIdx;
          const now = Date.now() + chunkIdx;
          const deltaId = `delta_batch_${now}_${Math.random().toString(36).substring(2, 8)}`;
          const nowIso = new Date(now).toISOString();

          const deltaPayload: TakaDelta = {
            id: deltaId,
            action: 'batch_update',
            batchItems: chunkItems,
            updatedBy: effectiveUpdatedBy,
            sessionId: CLIENT_SESSION_ID,
            timestamp: nowIso,
            numericTime: now,
            serverTime: serverTimestamp() as any,
            expireAt: Timestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000),
          };

          const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION, deltaId);
          const cleanPayload = removeUndefinedDeep(deltaPayload);
          await setDeltaDocWithRetry(docRef, cleanPayload);
          createdPayloads.push(deltaPayload);
        })
      );
    }

    // Phát tín hiệu tức thì sang các máy trạm khác (0 Read)
    if (createdPayloads.length > 0) {
      broadcastAppliedDeltas(createdPayloads);
    }
  } catch (err) {
    console.warn('[deltaSync] Failed to record batch deltas to Firestore:', err);
  }
}

