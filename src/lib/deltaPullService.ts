import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocsFromServer,
  Timestamp,
} from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { TakaDelta } from '../types';
import { resyncIfStale } from './syncResilience';
import { 
  deltaTime, 
  getLastDeltaSyncTime, 
  getRestoreCutoffTimestamp, 
  appliedDeltaIds,
} from './deltaSyncService';
import { DELTA_COLLECTION, CLOCK_SKEW_OVERLAP_MS, MAX_APPLIED_IDS, LAST_SYNC_KEY } from './deltaConstants';
import { applyIncomingDeltas } from './deltaApplyService';
import { safeSetItemLocal } from './storage';

let inFlightPullPromise: Promise<number> | null = null;
let lastPullCompletedAt = 0;

/**
 * Kéo các delta thay đổi từ server về client kể từ lastSyncTime và áp dụng vào Zustand
 * Tiết kiệm hơn 80% Read so với việc onSnapshot cả collection
 * B4: In-flight deduplication prevents concurrent identical queries across tabs/effects
 */
export async function pullAndApplyDeltas(yearFilter?: string, force: boolean = false): Promise<number> {
  if (inFlightPullPromise) {
    return inFlightPullPromise;
  }
  const now = Date.now();
  if (!force && now - lastPullCompletedAt < 2000) {
    return 0;
  }

  let pullSucceeded = false;
  inFlightPullPromise = (async () => {
    const lastSyncTime = getLastDeltaSyncTime();
    const restoreCutoff = getRestoreCutoffTimestamp();

    // Device offline longer than delta retention -> deltas are gone, do a full resync.
    if (await resyncIfStale(lastSyncTime, LAST_SYNC_KEY)) return 0;

    const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION);

    try {
      const deltas: TakaDelta[] = [];
      let currentSince = Math.max(lastSyncTime - CLOCK_SKEW_OVERLAP_MS, restoreCutoff);
      let iteration = 0;
      const MAX_PAGES = 5;

      while (iteration < MAX_PAGES) {
        iteration++;
        const q = query(
          colRef,
          where('serverTime', '>', Timestamp.fromMillis(currentSince)),
          orderBy('serverTime', 'asc'),
          limit(500)
        );

        let snapshot: any;
        try {
          snapshot = await getDocsFromServer(q);
        } catch (serverErr) {
          // Nếu mạng đang reconnect lúc iOS mới thức dậy, KHÔNG đánh dấu pullSucceeded để lần gọi ngay sau đó chạy được ngay
          console.warn('[deltaSync] getDocsFromServer not reachable yet (device offline or reconnecting):', serverErr);
          return 0;
        }

        if (!snapshot || snapshot.empty) {
          break;
        }

        let pageMaxTime = currentSince;
        snapshot.forEach((d: any) => {
          const item = d.data() as TakaDelta;
          const itemId = item.id || d.id;
          if (appliedDeltaIds.has(itemId)) {
            if (deltaTime(item) > pageMaxTime) pageMaxTime = deltaTime(item);
            return;
          }
          appliedDeltaIds.add(itemId);
          if (appliedDeltaIds.size > MAX_APPLIED_IDS) {
            const oldest = appliedDeltaIds.values().next().value;
            if (oldest !== undefined) appliedDeltaIds.delete(oldest);
          }
          deltas.push(item);
          if (deltaTime(item) > pageMaxTime) {
            pageMaxTime = deltaTime(item);
          }
        });

        currentSince = pageMaxTime;
        if (snapshot.size < 500) {
          break;
        }
      }

      pullSucceeded = true;

      if (deltas.length === 0) {
        // Server confirmed 0 new deltas: advance sync cursor safely
        const safeRecentTime = Math.max(lastSyncTime, Date.now() - 60000);
        safeSetItemLocal(LAST_SYNC_KEY, String(safeRecentTime));
        return 0;
      }

      return applyIncomingDeltas(deltas);
    } catch (err) {
      console.warn('[deltaSync] Error pulling deltas:', err);
      return 0;
    } finally {
      if (pullSucceeded) {
        lastPullCompletedAt = Date.now();
      }
      inFlightPullPromise = null;
    }
  })();

  return inFlightPullPromise;
}
