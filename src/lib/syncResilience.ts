import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from './firebase';
import { localDb } from './localDb';
import { processPendingSync, getConnectionStatus } from './syncQueue';

/**
 * Sync resilience helpers (additive module).
 *
 * 1. initNetworkRecovery: restarts the Firestore network layer after the app was in background.
 *    iOS Safari / PWA suspends WebChannel connections; the listener can stay "connected" but silently stop
 *    receiving updates. disableNetwork -> enableNetwork forces a clean reconnect (pending writes are preserved).
 * 2. resyncIfStale: delta documents are purged after 7 days. A device that has not synced for longer
 *    than that can never catch up through deltas, so wipe the local cache and reload once.
 */

const HIDDEN_THRESHOLD_MS = 45 * 1000;
const WALL_CLOCK_CHECK_INTERVAL_MS = 15 * 1000;
const WALL_CLOCK_JUMP_THRESHOLD_MS = 45 * 1000;
const IDLE_FOCUS_THRESHOLD_MS = 3 * 60 * 1000;
const STALE_RESYNC_MS = 6 * 24 * 60 * 60 * 1000; // < 7-day delta retention
const RESYNC_GUARD_KEY = 'taka_full_resync_guard_v1';

let activeRecoveryPromise: Promise<void> | null = null;

/**
 * If Firestore network is currently cycling (disableNetwork -> enableNetwork),
 * wait for it to finish before issuing getDocsFromServer queries.
 */
export async function waitForNetworkRecovery(): Promise<void> {
  if (activeRecoveryPromise) {
    try {
      await activeRecoveryPromise;
    } catch {}
  }
}

export function initNetworkRecovery(onRecovered?: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let hiddenAt = 0;
  let lastActiveAt = Date.now();
  let lastWallClockTick = Date.now();
  let lastRecoveredAt = 0;
  let busy = false;

  const recover = async () => {
    const now = Date.now();
    if (busy || now - lastRecoveredAt < 5000) return;
    busy = true;
    lastRecoveredAt = now;
    const p = (async () => {
      try {
        await disableNetwork(db);
        await enableNetwork(db);
        await processPendingSync();
      } catch (err) {
        console.warn('[syncResilience] Network recovery failed:', err);
      } finally {
        busy = false;
        activeRecoveryPromise = null;
        lastActiveAt = Date.now();
        lastWallClockTick = Date.now();
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
    const idleDuration = now - lastActiveAt;
    hiddenAt = 0;
    lastActiveAt = now;
    if (hiddenDuration > HIDDEN_THRESHOLD_MS || idleDuration > IDLE_FOCUS_THRESHOLD_MS) {
      recover();
    }
  };

  // Page restored from the iOS back/forward cache: sockets are certainly dead.
  const handlePageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) recover();
  };

  // Network came back (e.g. iPhone/Desktop was offline): force a clean reconnect so queued offline writes flush now
  const handleOnline = () => { recover(); };

  // Desktop overnight wake: tab may have stayed "visible" all night while monitor/OS slept or sat idle
  const handleFocusOrSleepWake = () => {
    const now = Date.now();
    if (now - lastActiveAt > IDLE_FOCUS_THRESHOLD_MS) {
      lastActiveAt = now;
      recover();
    }
  };

  const handleUserActivity = () => {
    const now = Date.now();
    if (now - lastActiveAt > IDLE_FOCUS_THRESHOLD_MS) {
      lastActiveAt = now;
      recover();
    } else {
      lastActiveAt = now;
    }
  };

  // Wall-clock sleep detector: catches OS sleep/wake even when tab stayed visible and focused
  const wallClockTimer = setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastWallClockTick;
    lastWallClockTick = now;
    if (elapsed > WALL_CLOCK_JUMP_THRESHOLD_MS && document.visibilityState === 'visible') {
      recover();
    }
  }, WALL_CLOCK_CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleFocusOrSleepWake);
  window.addEventListener('taka_sleep_wake_recovery', recover);
  window.addEventListener('pointerdown', handleUserActivity, { passive: true });
  window.addEventListener('keydown', handleUserActivity, { passive: true });

  return () => {
    clearInterval(wallClockTimer);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('pageshow', handlePageShow);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('focus', handleFocusOrSleepWake);
    window.removeEventListener('taka_sleep_wake_recovery', recover);
    window.removeEventListener('pointerdown', handleUserActivity);
    window.removeEventListener('keydown', handleUserActivity);
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
