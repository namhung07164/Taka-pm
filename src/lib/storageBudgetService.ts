import { localDb } from './localDb';

/**
 * Storage Budget Service
 * Giám sát và quản trị trần bộ nhớ IndexedDB cho iOS Safari (40MB limit theo chuẩn AGENTS.md)
 * Ngăn ngừa WebKit kích hoạt Emergency Wipe khi iPhone ngủ 2-4-8 tiếng
 */

const IS_IOS = typeof window !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

const IS_LOW_RAM_DEVICE =
  IS_IOS ||
  (typeof navigator !== 'undefined' &&
    typeof (navigator as any).deviceMemory === 'number' &&
    (navigator as any).deviceMemory <= 4);

// Ngưỡng an toàn tối đa cho iOS (35MB để không chạm trần 40MB của WebKit)
const IOS_SAFE_QUOTA_BYTES = 35 * 1024 * 1024;

export interface StorageBudgetReport {
  usageBytes: number;
  quotaBytes: number;
  percentageUsed: number;
  isIOS: boolean;
  evictedCount: number;
  status: 'safe' | 'warning' | 'pruned';
}

/**
 * Kiểm tra và dọn dẹp rác (soft-deleted, virtual summary) trên mọi thiết bị
 * đồng thời áp dụng LRU eviction cho các bản ghi năm cũ nếu chạm ngưỡng bộ nhớ Safari / máy đời cũ
 */
export async function enforceStorageBudget(): Promise<StorageBudgetReport> {
  const result: StorageBudgetReport = {
    usageBytes: 0,
    quotaBytes: IOS_SAFE_QUOTA_BYTES,
    percentageUsed: 0,
    isIOS: IS_IOS,
    evictedCount: 0,
    status: 'safe',
  };

  try {
    // 1. Universal Hygiene: Purge any soft-deleted or virtual summary ghost rows from local IndexedDB
    const [delProjects, delTasks, delCosts, delDelegations] = await Promise.all([
      localDb.projects.filter((p: any) => Boolean(p?.isDeleted)).primaryKeys().catch(() => [] as string[]),
      localDb.tasks
        .filter((t: any) => Boolean(t?.isDeleted || t?._isVirtualSummary || String(t?.id || '').startsWith('ts_')))
        .primaryKeys()
        .catch(() => [] as string[]),
      localDb.costs.filter((c: any) => Boolean(c?.isDeleted)).primaryKeys().catch(() => [] as string[]),
      localDb.delegations.filter((d: any) => Boolean(d?.isDeleted)).primaryKeys().catch(() => [] as string[]),
    ]);

    if (delProjects.length > 0) await localDb.projects.bulkDelete(delProjects);
    if (delTasks.length > 0) await localDb.tasks.bulkDelete(delTasks);
    if (delCosts.length > 0) await localDb.costs.bulkDelete(delCosts);
    if (delDelegations.length > 0) await localDb.delegations.bulkDelete(delDelegations);

    const deadCount = delProjects.length + delTasks.length + delCosts.length + delDelegations.length;
    if (deadCount > 0) {
      result.evictedCount += deadCount;
    }

    // 2. Check Browser Storage Quota
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      result.usageBytes = estimate.usage || 0;
      if (estimate.quota) {
        result.quotaBytes = IS_LOW_RAM_DEVICE ? Math.min(estimate.quota, IOS_SAFE_QUOTA_BYTES) : estimate.quota;
      }
      if (result.quotaBytes > 0) {
        result.percentageUsed = Math.round((result.usageBytes / result.quotaBytes) * 100);
      }
    }

    // Nếu là môi trường iOS / máy RAM thấp và dung lượng vượt 80% ngưỡng an toàn
    const needsPruning =
      IS_LOW_RAM_DEVICE && (result.percentageUsed > 80 || result.usageBytes > IOS_SAFE_QUOTA_BYTES * 0.85);

    if (needsPruning) {
      const currentYear = new Date().getFullYear();
      const cutoffYear = String(currentYear - 2); // Giữ các năm hiện hành; dọn <= cutoffYear

      // Chỉ dọn dẹp các task đã hoàn thành thuộc các năm lưu trữ cũ khỏi Dexie nội bộ (không chạm vào Firestore)
      const oldTaskKeys = await localDb.tasks
        .filter((t: any) => {
          const taskYear = String(t.projectYear || t.year || '');
          const status = String(t.runningStatus || t.status || '').toLowerCase();
          return Boolean(taskYear && taskYear <= cutoffYear && status === 'completed');
        })
        .primaryKeys();

      if (oldTaskKeys.length > 0) {
        await localDb.tasks.bulkDelete(oldTaskKeys);
        result.evictedCount += oldTaskKeys.length;
        result.status = 'pruned';
        console.info(`[storageBudgetService] Evicted ${oldTaskKeys.length} archived completed tasks (<= ${cutoffYear}) to preserve 40MB budget.`);
      }
    }
  } catch (err) {
    console.warn('[storageBudgetService] Storage budget check completed safely:', err);
  }

  return result;
}
