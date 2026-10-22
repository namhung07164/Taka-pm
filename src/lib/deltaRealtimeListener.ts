import { collection, onSnapshot, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, APP_ID } from './firebase';
import {
  applyIncomingDeltas,
  filterUnappliedDeltas,
  getLastDeltaSyncTime,
  deltaTime,
  LAST_SYNC_KEY,
} from './deltaSyncService';
import { waitForInFlightDeltaPull } from './deltaPullService';
import { waitForNetworkRecovery } from './syncResilience';
import { safeSetItemLocal } from './storage';
import type { TakaDelta } from '../types';

/**
 * Real-time delta channel.
 *
 * One onSnapshot listener on taka_deltas replaces 25s polling:
 *  - idle cost = 0 reads (previously >= 1 read per poll, ~1100+/user/day)
 *  - changes arrive in ~1s instead of 25s - 3 min
 *  - billed once per delta doc; cached deltas (persistent cache) are free
 * The listener is detached when the tab has been hidden > 15 min and re-attached (since = lastSyncTime) on return.
 */

const OVERLAP_MS = 3 * 1000; // 3s serverTime jitter buffer (duplicates filtered by delta id)
const DETACH_AFTER_HIDDEN_MS = 15 * 60 * 1000; // Keep listener alive for up to 15 min when tab hidden (matches pool TTL)
const RETRY_MS = 30 * 1000;
const RECONNECT_COOLDOWN_MS = 2000;

let activeRealtimeUnsub: (() => void) | null = null;

export function isDeltaRealtimeConnected(): boolean {
  return activeRealtimeUnsub !== null;
}

export function startDeltaRealtimeListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  let unsub: (() => void) | null = null;
  let buffer: TakaDelta[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let detachTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastReconnectAt = 0;
  let signedIn = !!auth.currentUser;
  let stopped = false;

  const flush = () => {
    flushTimer = null;
    const batch = filterUnappliedDeltas(buffer);
    buffer = [];
    if (batch.length === 0) return;
    batch.sort((a, b) => deltaTime(a) - deltaTime(b));
    try {
      applyIncomingDeltas(batch);
    } catch (err) {
      console.warn('[deltaRealtime] apply failed:', err);
    }
  };

  const detach = () => {
    if (unsub) {
      try { unsub(); } catch {}
      unsub = null;
    }
    activeRealtimeUnsub = null;
  };

  const attach = () => {
    if (stopped || unsub || !signedIn) return;
    lastReconnectAt = Date.now();
    const since = getLastDeltaSyncTime() - OVERLAP_MS;
    const q = query(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_deltas'),
      where('serverTime', '>', Timestamp.fromMillis(since)),
      orderBy('serverTime', 'asc')
    );
    unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        let maxSeenMs = 0;
        snap.docChanges().forEach((c) => {
          if (c.type === 'added' || c.type === 'modified') {
            const raw = c.doc.data({ serverTimestamps: 'estimate' }) as TakaDelta;
            const dMs = deltaTime(raw);
            if (dMs > maxSeenMs) maxSeenMs = dMs;
            buffer.push({ ...raw, id: raw.id || c.doc.id });
          }
        });
        if (!snap.metadata.fromCache) {
          // Advance sync cursor even when 0 deltas occurred during 30m-1h idle window so next reconnect doesn't re-query old window
          const safeNow = Math.max(getLastDeltaSyncTime(), maxSeenMs, Date.now() - 5000);
          safeSetItemLocal(LAST_SYNC_KEY, String(safeNow));
        }
        if (buffer.length > 0 && !flushTimer) flushTimer = setTimeout(flush, 20);
      },
      (err) => {
        console.warn('[deltaRealtime] listener error, retrying:', err);
        detach();
        if (!stopped && !retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            attach();
          }, RETRY_MS);
        }
      }
    );
    activeRealtimeUnsub = unsub;
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      if (stopped || document.visibilityState !== 'visible') return;
      if (unsub && Date.now() - lastReconnectAt < RECONNECT_COOLDOWN_MS) return;
      await waitForNetworkRecovery();
      await waitForInFlightDeltaPull();
      if (stopped || document.visibilityState !== 'visible') return;
      detach();
      attach();
    }, 120);
  };

  if (signedIn) attach();

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (detachTimer) clearTimeout(detachTimer);
      detachTimer = setTimeout(detach, DETACH_AFTER_HIDDEN_MS);
    } else {
      if (detachTimer) { clearTimeout(detachTimer); detachTimer = null; }
      // If listener is still attached (hidden < 15 minutes), keep existing WebChannel socket (0 extra reads)
      if (unsub) return;
      scheduleReconnect();
    }
  };

  const onNetworkRecovered = () => {
    scheduleReconnect();
  };

  const onSleepWake = () => {
    scheduleReconnect();
  };

  const handlePageShow = (e: PageTransitionEvent) => {
    if (e.persisted) {
      scheduleReconnect();
    }
  };

  const handleOnline = () => {
    if (!unsub) {
      attach();
    }
  };

  const handleFocus = () => {
    if (!unsub) {
      attach();
    }
  };

  const unsubAuth = onAuthStateChanged(auth, (user) => {
    signedIn = !!user;
    if (user) attach();
    else detach();
  });

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('taka_network_recovered', onNetworkRecovered);
  window.addEventListener('taka_sleep_wake_recovery', onSleepWake);
  window.addEventListener('pageshow', handlePageShow as any);
  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleFocus);

  return () => {
    stopped = true;
    unsubAuth();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('taka_network_recovered', onNetworkRecovered);
    window.removeEventListener('taka_sleep_wake_recovery', onSleepWake);
    window.removeEventListener('pageshow', handlePageShow as any);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('focus', handleFocus);
    if (flushTimer) clearTimeout(flushTimer);
    if (detachTimer) clearTimeout(detachTimer);
    if (retryTimer) clearTimeout(retryTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    detach();
  };
}
