import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { safeGetItemLocal, safeSetItemLocal } from './storage';

const LAST_PURGE_KEY = 'taka_last_delta_purge_time_v1';
const DELTA_COLLECTION = 'taka_deltas';
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000; // Run at most once every 6 hours
const DEFAULT_RETENTION_HOURS = 48; // Retain deltas for 48 hours

/**
 * Tự động xóa các bản ghi delta cũ hơn 48h trên Firestore (chạy ngầm, không block UI)
 */
export async function purgeOldDeltas(retentionHours = DEFAULT_RETENTION_HOURS): Promise<number> {
  if (typeof window === 'undefined') return 0;

  const now = Date.now();
  const lastPurge = Number(safeGetItemLocal(LAST_PURGE_KEY) || 0);

  // Không chạy lại nếu vừa chạy trong vòng 6 giờ qua
  if (now - lastPurge < PURGE_INTERVAL_MS) {
    return 0;
  }

  const cutoffTime = now - retentionHours * 60 * 60 * 1000;
  const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION);

  try {
    const q = query(
      colRef,
      where('numericTime', '<', cutoffTime),
      limit(300)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      safeSetItemLocal(LAST_PURGE_KEY, String(now));
      return 0;
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => {
      batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION, d.id));
    });

    await batch.commit();
    safeSetItemLocal(LAST_PURGE_KEY, String(now));
    return snapshot.size;
  } catch (err) {
    console.warn('[deltaPurge] Auto-purge old deltas skipped or failed:', err);
    return 0;
  }
}
