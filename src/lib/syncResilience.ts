import { enableNetwork, disableNetwork } from 'firebase/firestore';
import { db } from './firebase';
import { localDb } from './localDb';
import { processPendingSync, getConnectionStatus } from './syncQueue';

/**
 * Sync resilience helpers (additive module).
 *
 * 1. initNetworkRecovery: recovers sync state after the app was backgrounded or slept.
 *    Flushes offline writes and performs a light delta catch-up without resetting Firestore's
 *    connection channels or stream tokens (which avoids 1.2K+ full collection re-read spikes).
 * 2. resyncIfStale: delta documents are purged after 7 days. A device that has not synced for longer
 *    than that can never catch up through deltas, so wipe the local cache and reload once.
 * 3. resetStalledFirestoreConnection: tears down a half-open / zombie WebKit Long-Polling XHR stream
 *    (e.g. after iPadOS native <input type="file"> sheet closes) ONLY when an active RPC/commit stalls.
 */

const HIDDEN_THRESHOLD_MS = 60 * 1000; // 60 seconds hidden/idle before delta catch-up per Rule 16.2
const WALL_CLOCK_CHECK_INTERVAL_MS = 20 * 1000;
const WALL_CLOCK_JUMP_THRESHOLD_MS = 60 * 1000; // 60s OS sleep jump per Rule 16.2
const STALE_RESYNC_MS = 6 * 24 * 60 * 60 * 1000; // < 7-day delta retention
const RESYNC_GUARD_KEY = 'taka_full_resync_guard_v1';

let activeRecoveryPromise: Promise<void> | null = null;
let activeSocketResetPromise: Promise<void> | null = null;
let lastSocketResetAt = 0;

/**
 * If recovery is in progress or browser is temporarily offline after native file picker closes,
 * wait for it before issuing subsequent Firestore operations.
 */
export async function waitForNetworkRecovery(maxWaitMs = 5000): Promise<void> {
  if (activeRecoveryPromise) {
    try {
      await activeRecoveryPromise;
    } catch {}
  }
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener('online', onOnline);
        resolve();
      }, maxWaitMs);
      const onOnline = () => {
        clearTimeout(timer);
        window.removeEventListener('online', onOnline);
        resolve();
      };
      window.addEventListener('online', onOnline, { once: true });
    });
  }
  try {
    await enableNetwork(db);
  } catch {}
}

/**
 * Gently cycles Firestore's network transport when an active commit or server read stalls on
 * iPadOS/iOS WebKit HTTP Long-Polling (e.g. after UIDocumentPickerViewController suspends sockets).
 * Automatically flushes pending IndexedDB MutationBatches upon reconnect.
 */
export async function resetStalledFirestoreConnection(): Promise<void> {
  if (activeSocketResetPromise) return activeSocketResetPromise;
  const now = Date.now();
  if (now - lastSocketResetAt < 2500) return;
  lastSocketResetAt = now;

  activeSocketResetPromise = (async () => {
    try {
      await disableNetwork(db);
    } catch {}
    await new Promise((r) => setTimeout(r, 60));
    try {
      await enableNetwork(db);
    } catch {}
    await new Promise((r) => setTimeout(r, 80));
  })().finally(() => {
    activeSocketResetPromise = null;
  });

  return activeSocketResetPromise;
}

export function initNetworkRecovery(onRecovered?: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let hiddenAt = 0;
  let blurredAt = 0;
  let lastWallClockTick = Date.now();
  let lastRecoveredAt = 0;
  let busy = false;

  const recover = async (elapsedSleepMs: number = 0) => {
    const now = Date.now();
    if (busy || now - lastRecoveredAt < 5000) return;
    busy = true;
    lastRecoveredAt = now;
    const p = (async () => {
      try {
        await processPendingSync();
        const { pullAndApplyDeltas } = await import('./deltaPullService');
        await pullAndApplyDeltas(undefined, true);
      } catch (err) {
        console.warn('[syncResilience] Network recovery failed:', err);
      } finally {
        busy = false;
        activeRecoveryPromise = null;
        lastWallClockTick = Date.now();
        try {
          window.dispatchEvent(
            new CustomEvent('taka_sleep_wake_recovery', { detail: { elapsedSleepMs } })
          );
        } catch {}
        try { onRecovered?.(); } catch {}
      }
    })();
    activeRecoveryPromise = p;
    return p;
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const now = Date.now();
    const hiddenDuration = hiddenAt ? now - hiddenAt : 0;
    hiddenAt = 0;
    if (hiddenDuration > HIDDEN_THRESHOLD_MS) {
      recover(hiddenDuration);
    }
  };

  const handleBlur = () => {
    blurredAt = Date.now();
  };

  const handleFocus = () => {
    const now = Date.now();
    const blurDuration = blurredAt ? now - blurredAt : 0;
    const wallElapsed = now - lastWallClockTick;
    blurredAt = 0;
    const maxInactive = Math.max(blurDuration, wallElapsed);
    if (maxInactive > HIDDEN_THRESHOLD_MS) {
      recover(maxInactive);
    }
  };

  // Page restored from the iOS/Desktop back/forward cache: sockets are certainly dead.
  const handlePageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) recover(HIDDEN_THRESHOLD_MS + 1000);
  };

  // Network came back: flush queued offline writes and pull deltas
  const handleOnline = () => {
    recover(HIDDEN_THRESHOLD_MS + 1000);
  };

  // Wall-clock sleep detector: catches OS sleep/wake even when tab stayed visible and focused (Rule 16.2: >60s gap)
  const wallClockTimer = setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastWallClockTick;
    lastWallClockTick = now;
    if (elapsed > WALL_CLOCK_JUMP_THRESHOLD_MS && document.visibilityState === 'visible') {
      recover(elapsed);
    }
  }, WALL_CLOCK_CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('online', handleOnline);

  return () => {
    clearInterval(wallClockTimer);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('pageshow', handlePageShow);
    window.removeEventListener('online', handleOnline);
  };
}

/**
 * If lastSyncTime is older than the delta retention window, clear local caches and reload once
 * so every listener re-reads fresh data from Firestore. Returns true when a resync was triggered.
 */
export async function resyncIfStale(lastSyncTime: number, lastSyncKey: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!lastSyncTime || Date.now() - lastSyncTime < STALE_RESYNC_MS) return false;

  // Loop guard: never trigger twice within 10 minutes.
  try {
    const last = Number(window.sessionStorage.getItem(RESYNC_GUARD_KEY) || 0);
    if (last && Date.now() - last < 10 * 60 * 1000) return false;
    window.sessionStorage.setItem(RESYNC_GUARD_KEY, String(Date.now()));
  } catch {}

  console.warn('[syncResilience] Local data older than delta retention. Running full resync.');
  try {
    await Promise.all([
      localDb.projects.clear(),
      localDb.tasks.clear(),
      localDb.costs.clear(),
      localDb.delegations.clear(),
      localDb.syncMeta.clear(),
    ]);
  } catch (err) {
    console.warn('[syncResilience] Failed to clear Dexie:', err);
  }

  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith('taka_year_data_v1_') || k === 'taka_years_meta_fingerprint_v1')) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
    window.localStorage.setItem(lastSyncKey, String(Date.now() - 30 * 60 * 1000));
  } catch {}

  window.location.reload();
  return true;
}

export const connectionMonitor = {
  onOnline: (callback: () => void) => {
    if (typeof window === 'undefined') return () => {};
    const handler = () => {
      processPendingSync().catch(() => {});
      callback();
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  },

  onOffline: (callback: () => void) => {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('offline', callback);
    return () => window.removeEventListener('offline', callback);
  },

  destroy: () => {
    // Cleanup monitor handlers
  },
};

export const listenerManager = {
  getStatus: () => {
    const isOnline = getConnectionStatus() === 'online';
    return {
      totalListeners: 4,
      activeListeners: isOnline ? 4 : 0,
      listeners: [
        { id: 'projects-listener', isActive: isOnline, collection: 'taka_projects' },
        { id: 'tasks-listener', isActive: isOnline, collection: 'taka_tasks' },
        { id: 'costs-listener', isActive: isOnline, collection: 'taka_costs' },
        { id: 'delegations-listener', isActive: isOnline, collection: 'taka_delegations' },
      ],
      isOnline,
    };
  },
};
