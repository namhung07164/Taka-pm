import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, APP_ID } from './firebase';
import { applyIncomingDeltas, filterUnappliedDeltas, getLastDeltaSyncTime } from './deltaSyncService';
import type { TakaDelta } from '../types';

/**
 * Real-time delta channel.
 *
 * One onSnapshot listener on taka_deltas replaces 25s polling:
 *  - idle cost = 0 reads (previously >= 1 read per poll, ~1100+/user/day)
 *  - changes arrive in ~1s instead of 25s - 3 min
 *  - billed once per delta doc; cached deltas (persistent cache) are free
 * The listener is detached when the tab has been hidden > 2 min and re-attached (since = lastSyncTime) on return.
 */

const OVERLAP_MS = 2 * 60 * 1000; // clock-skew window, duplicates filtered by delta id
const DETACH_AFTER_HIDDEN_MS = 2 * 60 * 1000;
const RETRY_MS = 30 * 1000;

export function startDeltaRealtimeListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  let unsub: (() => void) | null = null;
  let buffer: TakaDelta[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let detachTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let signedIn = false;
  let stopped = false;

  const flush = () => {
    flushTimer = null;
    const batch = filterUnappliedDeltas(buffer);
    buffer = [];
    if (batch.length === 0) return;
    batch.sort((a, b) => (a.numericTime || 0) - (b.numericTime || 0));
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
  };

  const attach = () => {
    if (stopped || unsub || !signedIn) return;
    const since = getLastDeltaSyncTime() - OVERLAP_MS;
    const q = query(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_deltas'),
      where('numericTime', '>', since),
      orderBy('numericTime', 'asc')
    );
    unsub = onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach((c) => {
          if (c.type === 'added') buffer.push(c.doc.data() as TakaDelta);
        });
        if (buffer.length > 0 && !flushTimer) flushTimer = setTimeout(flush, 60);
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
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (detachTimer) clearTimeout(detachTimer);
      detachTimer = setTimeout(detach, DETACH_AFTER_HIDDEN_MS);
    } else {
      if (detachTimer) { clearTimeout(detachTimer); detachTimer = null; }
      attach();
    }
  };

  const unsubAuth = onAuthStateChanged(auth, (user) => {
    signedIn = !!user;
    if (user) attach();
    else detach();
  });
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopped = true;
    unsubAuth();
    document.removeEventListener('visibilitychange', onVisibility);
    if (flushTimer) clearTimeout(flushTimer);
    if (detachTimer) clearTimeout(detachTimer);
    if (retryTimer) clearTimeout(retryTimer);
    detach();
  };
}
