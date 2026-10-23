import { useAppStore } from '../store/useAppStore';
import { pullAndApplyDeltas } from './deltaPullService';
import { initNetworkRecovery } from './syncResilience';
import { startDeltaRealtimeListener, isDeltaRealtimeConnected } from './deltaRealtimeListener';
import { purgeOldDeltas } from './deltaPurgeService';
import { initBroadcastSyncListener } from './broadcastSyncService';

let syncIntervalTimer: any = null;
let isHibernating = false;
let lastActivityTime = Date.now();
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes inactivity threshold

/**
 * Tự động Dọn dẹp Delta cũ (Delta Retention TTL & Pruning)
 */
export async function pruneExpiredDeltas(retentionDays: number = 7): Promise<number> {
  return purgeOldDeltas(retentionDays * 24);
}

/**
 * Khởi động Background Delta Sync Poller với Adaptive Tab Hibernation & Inactivity Sleep
 * - Kênh chính: startDeltaRealtimeListener (1 onSnapshot duy nhất trên taka_deltas).
 * - Polling chỉ chạy làm safety-net khi listener bị ngắt hoặc sau khi ngủ sâu (> 15 phút).
 */
export function startDeltaSyncService(intervalMs: number = 30 * 60 * 1000): () => void {
  if (typeof window === 'undefined') return () => {};

  const stopRealtime = startDeltaRealtimeListener();
  const stopBroadcast = initBroadcastSyncListener();

  let lastTriggerAt = 0;
  const triggerSync = (force: boolean = false) => {
    // If the real-time onSnapshot listener on taka_deltas is already connected and streaming,
    // skip redundant getDocsFromServer polling unless explicitly forced by deep sleep recovery.
    if (!force && isDeltaRealtimeConnected()) return;
    const now = Date.now();
    if (!force && now - lastTriggerAt < 15000) return;
    lastTriggerAt = now;
    const year = force ? undefined : useAppStore.getState().globalYearFilter;
    pullAndApplyDeltas(year, force).catch(() => {});
  };

  const stopPolling = () => {
    if (syncIntervalTimer) {
      clearInterval(syncIntervalTimer);
      syncIntervalTimer = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    syncIntervalTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        hibernate();
        return;
      }
      if (Date.now() - lastActivityTime > IDLE_TIMEOUT_MS) {
        hibernate();
        return;
      }
      triggerSync(false);
    }, intervalMs);
  };

  const hibernate = () => {
    if (isHibernating) return;
    isHibernating = true;
    stopPolling();
  };

  const wakeAndSync = (forceServerPull: boolean = false) => {
    lastActivityTime = Date.now();
    isHibernating = false;
    if (forceServerPull || !isDeltaRealtimeConnected()) {
      triggerSync(true);
    }
    startPolling();
  };

  // 1. Start safety polling timer (initial delta catch-up is already handled by startDeltaRealtimeListener's onSnapshot)
  startPolling();

  // Khi syncResilience khôi phục xong mạng (sau disableNetwork -> enableNetwork hoặc ngủ qua đêm),發 sự kiện để deltaRealtimeListener gắn lại trên socket mới
  const stopNetworkRecovery = initNetworkRecovery(() => {
    window.dispatchEvent(new CustomEvent('taka_network_recovered'));
  });

  // 2. Tab Visibility Listener (Page Visibility API - Hibernation)
  let hiddenSince = 0;
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const hiddenDuration = hiddenSince ? Date.now() - hiddenSince : 0;
      hiddenSince = 0;
      lastActivityTime = Date.now();
      startPolling();
      // Give deltaRealtimeListener 250ms to re-attach onSnapshot(taka_deltas); fallback to getDocsFromServer if disconnected
      if (hiddenDuration >= 2000) {
        setTimeout(() => {
          if (!isDeltaRealtimeConnected()) {
            wakeAndSync(true);
          }
        }, 250);
      }
    } else {
      hiddenSince = Date.now();
      hibernate();
    }
  };

  // 3. Online network reconnection
  const handleOnline = () => {
    wakeAndSync(!isDeltaRealtimeConnected());
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleOnline);

  return () => {
    stopPolling();
    stopNetworkRecovery();
    stopRealtime();
    stopBroadcast();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
  };
}

export async function triggerImmediateDeltaSync(year?: string): Promise<number> {
  lastActivityTime = Date.now();
  isHibernating = false;
  return pullAndApplyDeltas(year, true);
}
