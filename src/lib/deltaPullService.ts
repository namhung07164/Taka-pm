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
import { resyncIfStale, waitForNetworkRecovery } from './syncResilience';
import { 
  deltaTime, 
  serverDeltaTime,
  getLastDeltaSyncTime, 
  getRestoreCutoffTimestamp, 
  appliedDeltaIds,
} from './deltaSyncService';
import { DELTA_COLLECTION, CLOCK_SKEW_OVERLAP_MS, MAX_APPLIED_IDS, LAST_SYNC_KEY } from './deltaConstants';
import { applyIncomingDeltas } from './deltaApplyService';
import { safeSetItemLocal } from './storage';

let inFlightPullPromise: Promise<number> | null = null;
let inFlightStartedAt = 0;
let lastPullCompletedAt = 0;
let pendingForcedFollowUp = false;

/**
 * If a delta pull is currently in-flight, wait for it to finish advancing LAST_SYNC_KEY
 * before attaching or re-attaching the real-time delta listener.
 */
export async function waitForInFlightDeltaPull(): Promise<void> {
  if (inFlightPullPromise) {
    try {
      await inFlightPullPromise;
    } catch {}
  }
}

/**
 * Kéo các delta thay đổi từ server về client kể từ lastSyncTime và áp dụng vào Zustand
 * Tiết kiệm hơn 80% Read so với việc onSnapshot cả collection
 * B4: In-flight deduplication prevents concurrent identical queries across tabs/effects
 */
export async function pullAndApplyDeltas(yearFilter?: string, force: boolean = false): Promise<number> {
  const now = Date.now();
  if (inFlightPullPromise) {
    // Only queue a follow-up if the current in-flight pull started >800ms ago; otherwise it is already fetching the latest state
    if (force && now - inFlightStartedAt > 800) {
      pendingForcedFollowUp = true;
    }
    return inFlightPullPromise;
  }
  // Prevent duplicate back-to-back server pulls across multiple wake/hydration callers
  const minCooldownMs = force ? 1500 : 5000;
  if (now - lastPullCompletedAt < minCooldownMs) {
    return 0;
  }

  let pullSucceeded = false;
  inFlightStartedAt = now;
  inFlightPullPromise = (async () => {
    await waitForNetworkRecovery();

    const lastSyncTime = getLastDeltaSyncTime();
    const restoreCutoff = getRestoreCutoffTimestamp();

    // Device offline longer than delta retention -> deltas are gone, do a full resync.
    if (await resyncIfStale(lastSyncTime, LAST_SYNC_KEY)) return 0;

    const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', DELTA_COLLECTION);

    try {
      const deltas: TakaDelta[] = [];
      let currentSince = Math.max(lastSyncTime - CLOCK_SKEW_OVERLAP_MS, restoreCutoff);
      let latestSeenServerMs = lastSyncTime;
      let iteration = 0;
      const MAX_PAGES = 5;

      while (iteration < MAX_PAGES) {
        iteration++;
        await waitForNetworkRecovery();
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
          // Nếu mạng đang reconnect lúc iOS/Desktop mới thức dậy, KHÔNG đánh dấu pullSucceeded để lần gọi ngay sau đó chạy được ngay
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
          const srvMs = serverDeltaTime(item);
          const itemMs = srvMs > 0 ? srvMs : deltaTime(item);
          if (srvMs > latestSeenServerMs) latestSeenServerMs = srvMs;
          if (appliedDeltaIds.has(itemId)) {
            if (itemMs > pageMaxTime) pageMaxTime = itemMs;
            return;
          }
          appliedDeltaIds.add(itemId);
          if (appliedDeltaIds.size > MAX_APPLIED_IDS) {
            const oldest = appliedDeltaIds.values().next().value;
            if (oldest !== undefined) appliedDeltaIds.delete(oldest);
          }
          deltas.push(item);
          if (itemMs > pageMaxTime) {
            pageMaxTime = itemMs;
          }
        });

        currentSince = pageMaxTime;
        if (snapshot.size < 500) {
          break;
        }
      }

      pullSucceeded = true;

      if (deltas.length === 0) {
        if (latestSeenServerMs > lastSyncTime) {
          safeSetItemLocal(LAST_SYNC_KEY, String(latestSeenServerMs));
        }
        return 0;
      }

      const appliedCount = applyIncomingDeltas(deltas);
      if (latestSeenServerMs > 0) {
        const advancedCursor = Math.max(getLastDeltaSyncTime(), latestSeenServerMs);
        safeSetItemLocal(LAST_SYNC_KEY, String(advancedCursor));
      }
      return appliedCount;
    } catch (err) {
      console.warn('[deltaSync] Error pulling deltas:', err);
      return 0;
    } finally {
      if (pullSucceeded) {
        lastPullCompletedAt = Date.now();
      }
      inFlightPullPromise = null;
      if (pendingForcedFollowUp) {
        pendingForcedFollowUp = false;
        setTimeout(() => {
          pullAndApplyDeltas(yearFilter, true).catch(() => {});
        }, 200);
      }
    }
  })();

  return inFlightPullPromise;
}
