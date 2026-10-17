import { collection, onSnapshot, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, APP_ID } from './firebase';
import { applyIncomingDeltas, filterUnappliedDeltas, getLastDeltaSyncTime, deltaTime, pullAndApplyDeltas } from './deltaSyncService';
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

const OVERLAP_MS = 10 * 1000; // serverTime overlap window, duplicates filtered by delta id
const DETACH_AFTER_HIDDEN_MS = 2 * 60 * 1000;
const RETRY_MS = 30 * 1000;

export function startDeltaRealtimeListener(): () => void {
  if (typeof window === 'undefined') return () => {};

  let unsub: (() => void) | null = null;
  let buffer: TakaDelta[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let detachTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
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
  };

  const attach = () => {
    if (stopped || unsub || !signedIn) return;
    const since = getLastDeltaSyncTime() - OVERLAP_MS;
    const q = query(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_deltas'),
      where('serverTime', '>', Timestamp.fromMillis(since)),
      orderBy('serverTime', 'asc')
    );
    unsub = onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach((c) => {
          if (c.type === 'added' || c.type === 'modified') {
            const raw = c.doc.data({ serverTimestamps: 'estimate' }) as TakaDelta;
            buffer.push({ ...raw, id: raw.id || c.doc.id });
          }
        });
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
  };

  if (signedIn) attach();

  let hiddenAt = 0;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if (detachTimer) clearTimeout(detachTimer);
      detachTimer = setTimeout(detach, DETACH_AFTER_HIDDEN_MS);
    } else {
      if (detachTimer) { clearTimeout(detachTimer); detachTimer = null; }
      const hiddenFor = hiddenAt ? Date.now() - hiddenAt : Infinity;
      hiddenAt = 0;
      // Ẩn ngắn (dưới 15 giây, ví dụ chuyển tab): kết nối vẫn sống và listener vẫn nhận delta realtime,
      // không cần tạo lại listener hay kéo delta (tránh đọc lại cửa sổ 3 phút).
      if (unsub && hiddenFor < 15000) return;
      // Ẩn lâu: ép tạo lại socket để phục hồi kết nối WebChannel bị iOS/Safari treo
      detach();
      attach();
      pullAndApplyDeltas(undefined, true).catch(() => {});
    }
  };

  const onNetworkRecovered = () => {
    if (document.visibilityState === 'visible') {
      detach();
      attach();
      pullAndApplyDeltas(undefined, true).catch(() => {});
    }
  };

  const handlePageShow = (e: PageTransitionEvent) => {
    if (e.persisted) {
      detach();
      attach();
      pullAndApplyDeltas(undefined, true).catch(() => {});
    }
  };

  const handleOnline = () => {
    detach();
    attach();
    pullAndApplyDeltas(undefined, true).catch(() => {});
  };

  const handleFocus = () => {
    // Listener còn sống thì đã nhận delta realtime (Firestore SDK tự nối lại và bù delta bị lỡ)
    if (unsub) return;
    pullAndApplyDeltas(undefined, true).catch(() => {});
  };

  const unsubAuth = onAuthStateChanged(auth, (user) => {
    signedIn = !!user;
    if (user) attach();
    else detach();
  });

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('taka_network_recovered', onNetworkRecovered);
  window.addEventListener('pageshow', handlePageShow as any);
  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleFocus);

  return () => {
    stopped = true;
    unsubAuth();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('taka_network_recovered', onNetworkRecovered);
    window.removeEventListener('pageshow', handlePageShow as any);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('focus', handleFocus);
    if (flushTimer) clearTimeout(flushTimer);
    if (detachTimer) clearTimeout(detachTimer);
    if (retryTimer) clearTimeout(retryTimer);
    detach();
  };
}
