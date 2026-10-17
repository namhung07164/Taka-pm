import {
  serverTimestamp,
  Timestamp,
  doc,
  setDoc,
} from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { TakaDelta, TakaDeltaItem } from '../types';
import { touchYearMeta } from './yearsFingerprintService';
import { broadcastAppliedDeltas } from './broadcastSyncService';
import { markExplicitDelta } from './autoDeltaQueue';
import { CLIENT_SESSION_ID, DELTA_COLLECTION } from './deltaConstants';
import { removeUndefinedDeep } from './firestoreSanitizer';

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
    await setDoc(docRef, cleanPayload);

    // Kích hoạt cập nhật fingerprint năm tương ứng
    if (delta.year) {
      touchYearMeta(delta.year).catch(() => {});
    }

    // Phát tín hiệu tức thì sang các máy trạm khác trong cùng trình duyệt (0 Read)
    broadcastAppliedDeltas([deltaPayload]);
  } catch (err) {
    console.warn('[deltaSync] Failed to record delta to Firestore:', err);
  }
}

/**
 * Giai đoạn 2: Ghi gom hàng loạt mutation vào 1 Document Delta duy nhất (Giảm 90% Firestore Write)
 */
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
      isPatch: item.isPatch,
      updatedBy,
    });
  }

  const now = Date.now();
  const deltaId = `delta_batch_${now}_${Math.random().toString(36).substring(2, 8)}`;
  const nowIso = new Date(now).toISOString();

  const deltaPayload: TakaDelta = {
    id: deltaId,
    action: 'batch_update',
    batchItems: items,
    updatedBy: updatedBy || useAppStore.getState().currentUser?.email || 'system',
    sessionId: CLIENT_SESSION_ID,
    timestamp: nowIso,
    numericTime: now,
    serverTime: serverTimestamp() as any,
    expireAt: Timestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000),
  };

  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION, deltaId);
    const cleanPayload = removeUndefinedDeep(deltaPayload);
    await setDoc(docRef, cleanPayload);

    // Kích hoạt cập nhật fingerprint các năm bị ảnh hưởng
    const affectedYears = new Set(items.map((i) => i.year).filter(Boolean));
    affectedYears.forEach((yr) => touchYearMeta(yr!).catch(() => {}));

    // Phát tín hiệu tức thì sang các máy trạm khác (0 Read)
    broadcastAppliedDeltas([deltaPayload]);
  } catch (err) {
    console.warn('[deltaSync] Failed to record batch deltas to Firestore:', err);
  }
}
