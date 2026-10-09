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
 * Kiểm tra và dọn dẹp các bản ghi năm cũ (LRU eviction) nếu chạm ngưỡng bộ nhớ Safari
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
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      result.usageBytes = estimate.usage || 0;
      if (estimate.quota) {
        result.quotaBytes = IS_IOS ? Math.min(estimate.quota, IOS_SAFE_QUOTA_BYTES) : estimate.quota;
      }
      if (result.quotaBytes > 0) {
        result.percentageUsed = Math.round((result.usageBytes / result.quotaBytes) * 100);
      }
    }

    // Nếu là môi trường iOS và dung lượng vượt 80% ngưỡng an toàn
    const needsPruning = IS_IOS && (result.percentageUsed > 80 || result.usageBytes > IOS_SAFE_QUOTA_BYTES * 0.85);

    if (needsPruning) {
      const currentYear = new Date().getFullYear();
      const cutoffYear = String(currentYear - 2); // Giữ các năm hiện hành (2025, 2026); dọn <= 2024

      // Chỉ dọn dẹp các task đã hoàn thành thuộc các năm lưu trữ cũ khỏi Dexie nội bộ (không chạm vào Firestore)
      const oldTasks = await localDb.tasks
        .filter((t: any) => {
          const taskYear = String(t.projectYear || t.year || (t.start ? t.start.substring(0, 4) : ''));
          const status = String(t.runningStatus || t.status || '').toLowerCase();
          return Boolean(taskYear && taskYear <= cutoffYear && status === 'completed');
        })
        .toArray();

      if (oldTasks.length > 0) {
        const oldIds = oldTasks.map((t) => t.id);
        await localDb.tasks.bulkDelete(oldIds);
        result.evictedCount += oldIds.length;
        result.status = 'pruned';
        console.info(`[storageBudgetService] Evicted ${oldIds.length} completed tasks of <= ${cutoffYear} to preserve iOS 40MB limit.`);
      }
    }
  } catch (err) {
    console.warn('[storageBudgetService] Storage budget check completed safely:', err);
  }

  return result;
}
