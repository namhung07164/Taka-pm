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

  // Real-time channel (onSnapshot). The interval below is only a slow safety-net poll (B5).
  const stopRealtime = startDeltaRealtimeListener();

  let lastTriggerAt = 0;
  const triggerSync = () => {
    const now = Date.now();
    if (now - lastTriggerAt < 15000) return;
    lastTriggerAt = now;
    const year = useAppStore.getState().globalYearFilter;
    pullAndApplyDeltas(year).catch(() => {});
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
      // Check for hidden tab or inactivity sleep
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        hibernate();
        return;
      }
      if (Date.now() - lastActivityTime > IDLE_TIMEOUT_MS) {
        hibernate();
        return;
      }
      triggerSync();
    }, intervalMs);
  };

  const hibernate = () => {
    if (isHibernating) return;
    isHibernating = true;
    stopPolling();
  };

  const wakeAndSync = () => {
    lastActivityTime = Date.now();
    if (isHibernating || !syncIntervalTimer) {
      isHibernating = false;
      triggerSync(); // Sync immediately on wake
      startPolling();
    }
  };

  // 1. Initial boot sync & start timer
  triggerSync();
  startPolling();
  const stopNetworkRecovery = initNetworkRecovery(() => triggerSync());

  // 2. Tab Visibility Listener (Page Visibility API - Hibernation)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      wakeAndSync();
    } else {
      hibernate();
    }
  };

  // 3. Online network reconnection
  const handleOnline = () => {
    wakeAndSync();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', handleOnline);

  return () => {
    stopPolling();
    stopNetworkRecovery();
    stopRealtime();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
  };
}

/**
 * Kích hoạt đồng bộ Delta ngay lập tức khi ứng dụng thức giấc từ trạng thái ngủ sâu (iOS Sleep/Wake Guard)
 */
export async function triggerImmediateDeltaSync(year?: string): Promise<number> {
  lastActivityTime = Date.now();
  isHibernating = false;
  return pullAndApplyDeltas(year || useAppStore.getState().globalYearFilter);
}
