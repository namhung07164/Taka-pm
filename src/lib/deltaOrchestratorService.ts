import { useAppStore } from '../store/useAppStore';
import { pullAndApplyDeltas } from './deltaPullService';
import { initNetworkRecovery } from './syncResilience';
import { startDeltaRealtimeListener } from './deltaRealtimeListener';
import { purgeOldDeltas } from './deltaPurgeService';

let syncIntervalTimer: any = null;
let isHibernating = false;
let lastActivityTime = Date.now();
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes inactivity threshold

/**
 * Tự động Dọn dẹp Delta cũ (Delta Retention TTL & Pruning)
 */
export async function pruneExpiredDeltas(retentionDays: number = 7): Promise<number> {
  return purgeOldDeltas(retentionDays * 24);
}

/**
 * Khởi động Background Delta Sync Poller với Adaptive Tab Hibernation & Inactivity Sleep
 * - Khi ẩn tab hoặc người dùng không hoạt động > 5 phút: Tạm dừng định thời hoàn toàn (0 Idle Read).
 * - Khi quay lại tab hoặc tương tác: Lập tức sync tức thì (0ms) và kích hoạt lại interval.
 */
export function startDeltaSyncService(intervalMs: number = 30 * 60 * 1000): () => void {
  if (typeof window === 'undefined') return () => {};

  const stopRealtime = startDeltaRealtimeListener();

  let lastTriggerAt = 0;
  const triggerSync = (force: boolean = false) => {
    const now = Date.now();
    if (!force && now - lastTriggerAt < 10000) return;
    lastTriggerAt = now;
    const year = useAppStore.getState().globalYearFilter;
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

  const wakeAndSync = () => {
    lastActivityTime = Date.now();
    isHibernating = false;
    triggerSync(true); // Ép đồng bộ ngay khi thức giấc (bỏ qua throttle)
    startPolling();
  };

  // 1. Initial boot sync & start timer
  triggerSync(true);
  startPolling();
  // Khi syncResilience khôi phục xong mạng (sau disableNetwork -> enableNetwork), ép pull delta ngay lập tức với force=true!
  const stopNetworkRecovery = initNetworkRecovery(() => {
    triggerSync(true);
    // Phát sự kiện để deltaRealtimeListener gắn lại (re-attach) trên socket mới
    window.dispatchEvent(new CustomEvent('taka_network_recovered'));
  });

  // 2. Tab Visibility Listener (Page Visibility API - Hibernation)
  let hiddenSince = 0;
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const hiddenDuration = hiddenSince ? Date.now() - hiddenSince : 0;
      hiddenSince = 0;
      lastActivityTime = Date.now();
      if (isHibernating || hiddenDuration >= 15000) {
        wakeAndSync();
      } else {
        startPolling();
      }
    } else {
      hiddenSince = Date.now();
      hibernate();
    }
  };

  // 3. Online network reconnection, Window Focus & User Activity (Desktop overnight idle / iPad Split-View)
  const handleOnline = () => {
    wakeAndSync();
  };
  const handleFocus = () => {
    lastActivityTime = Date.now();
    // Force a server pull on focus if the poller had entered hibernation (>5 min idle)
    if (document.visibilityState === 'visible' && isHibernating) {
      wakeAndSync();
    }
  };
  const handleUserInteraction = () => {
    const now = Date.now();
    const wasIdleLong = now - lastActivityTime > IDLE_TIMEOUT_MS;
    lastActivityTime = now;
    if (document.visibilityState === 'visible' && (isHibernating || wasIdleLong)) {
      wakeAndSync();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
  window.addEventListener('keydown', handleUserInteraction, { passive: true });

  return () => {
    stopPolling();
    stopNetworkRecovery();
    stopRealtime();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('pointerdown', handleUserInteraction);
    window.removeEventListener('keydown', handleUserInteraction);
  };
}

export async function triggerImmediateDeltaSync(year?: string): Promise<number> {
  lastActivityTime = Date.now();
  isHibernating = false;
  return pullAndApplyDeltas(year || useAppStore.getState().globalYearFilter, true);
}
