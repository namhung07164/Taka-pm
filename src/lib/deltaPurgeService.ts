import {
  collection,
  query,
  where,
  limit,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { safeGetItemLocal, safeSetItemLocal } from './storage';

const LAST_PURGE_KEY = 'taka_last_delta_purge_time_v1';
const DELTA_COLLECTION = 'taka_deltas';
const PURGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // Run at most once every 7 days when invoked
const DEFAULT_RETENTION_HOURS = 168; // Retain deltas for 7 days (168h)

/**
 * Purges expired delta records older than `retentionHours` (default 168h / 7 days).
 * Only executes when explicitly requested (`force = true`) or after 7-day cooldown,
 * preventing automatic 400-read / 400-delete storms on client startup.
 */
export async function purgeOldDeltas(
  retentionHours = DEFAULT_RETENTION_HOURS,
  force = false
): Promise<number> {
  try {
    if (!force) return 0;
    const now = Date.now();
    const lastPurge = Number(safeGetItemLocal(LAST_PURGE_KEY) || 0);
    if (lastPurge > 0 && now - lastPurge < PURGE_INTERVAL_MS) {
      return 0;
    }
    safeSetItemLocal(LAST_PURGE_KEY, String(now));

    const cutoffMs = now - retentionHours * 60 * 60 * 1000;
    const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION);
    const q = query(colRef, where('numericTime', '<', cutoffMs), limit(50));
    const snap = await getDocs(q);
    if (snap.empty) return 0;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.docs.length;
  } catch (err) {
    console.debug('[deltaPurge] Skipped delta purge:', err);
    return 0;
  }
}
