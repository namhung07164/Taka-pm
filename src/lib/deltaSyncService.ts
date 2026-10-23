import { TakaDelta } from '../types';
import { safeGetItemLocal, safeSetItemLocal } from './storage';
import { 
  LAST_SYNC_KEY, 
  RESTORE_CUTOFF_KEY, 
  DELTA_COLLECTION, 
  CLIENT_SESSION_ID 
} from './deltaConstants';

export { 
  LAST_SYNC_KEY, 
  RESTORE_CUTOFF_KEY, 
  DELTA_COLLECTION, 
  CLOCK_SKEW_OVERLAP_MS, 
  MAX_APPLIED_IDS, 
  CLIENT_SESSION_ID 
} from './deltaConstants';

/**
 * Returns the timestamp cutoff after which version restore was executed.
 * Deltas generated before this timestamp are faulty historical changes and MUST NOT be re-applied.
 */
export function getRestoreCutoffTimestamp(): number {
  const raw = safeGetItemLocal(RESTORE_CUTOFF_KEY);
  if (raw) {
    const num = Number(raw);
    if (!isNaN(num) && num > 0) return num;
  }
  return 0;
}

/**
 * Prevents auto-reading / re-applying faulty historical changes generated before a version restore.
 * Call this function immediately when a version restore or full replace operation is executed.
 */
export function markRestoreVersionCompleted(cutoffMs?: number, isRemoteSignal?: boolean): void {
  const now = cutoffMs || Date.now();
  safeSetItemLocal(RESTORE_CUTOFF_KEY, String(now));
  safeSetItemLocal(LAST_SYNC_KEY, String(now));
  appliedDeltaIds.clear();
  console.log(`[deltaSync] Restore cutoff set to ${now} (${new Date(now).toISOString()}). Past deltas strictly blocked.`);

  if (!isRemoteSignal) {
    import('./deltaWriteService').then(({ recordDelta }) => {
      recordDelta({
        docId: 'sys_restore_signal',
        collectionName: 'taka_projects',
        action: 'update',
        data: { restoreCutoff: now, type: 'VERSION_RESTORE' },
        updatedBy: 'system_restore',
      }).catch(() => {});
    }).catch(() => {});
  }
}

export const appliedDeltaIds = new Set<string>();

/** Extracts true Firestore server timestamp (ms) when present; returns 0 for local-only payloads so client clocks never poison LAST_SYNC_KEY. */
export function serverDeltaTime(d: TakaDelta): number {
  const ms = (d as any)?.serverTime?.toMillis?.();
  if (typeof ms === 'number' && ms > 0) return ms;
  const sec = (d as any)?.serverTime?.seconds;
  if (typeof sec === 'number' && sec > 0) {
    return sec * 1000 + Math.floor(((d as any)?.serverTime?.nanoseconds || 0) / 1e6);
  }
  return 0;
}

/** Sync cursor time of a delta in ms: server arrival time when known, else the client time (for sorting). */
export function deltaTime(d: TakaDelta): number {
  const srv = serverDeltaTime(d);
  return srv > 0 ? srv : d.numericTime || 0;
}

/**
 * Đọc mốc thời gian đã đồng bộ delta lần cuối từ LocalStorage.
 * Tự động kẹp trần (clamp) nếu đồng hồ cục bộ của thiết bị từng chạy nhanh hơn giờ server Firestore.
 */
export function getLastDeltaSyncTime(): number {
  const restoreCutoff = getRestoreCutoffTimestamp();
  const raw = safeGetItemLocal(LAST_SYNC_KEY);
  let lastSync = 0;
  const now = Date.now();
  if (raw) {
    const num = Number(raw);
    if (!isNaN(num) && num > 0) {
      // Guard against client clock drift that previously wrote a future timestamp into LAST_SYNC_KEY
      lastSync = Math.min(num, now);
    }
  }
  if (lastSync === 0) {
    lastSync = now - 5 * 60 * 1000;
  }
  return Math.max(lastSync, restoreCutoff);
}

/**
 * Drops deltas that were already applied on this device (shared across poll + listener).
 */
export function filterUnappliedDeltas(items: TakaDelta[]): TakaDelta[] {
  const restoreCutoff = getRestoreCutoffTimestamp();
  const fresh: TakaDelta[] = [];

  for (const item of items) {
    const id = item.id;
    const itemMs = deltaTime(item);

    if (restoreCutoff > 0 && itemMs <= restoreCutoff) {
      if (id) appliedDeltaIds.add(id);
      continue;
    }

    if (!id) { fresh.push(item); continue; }
    if (appliedDeltaIds.has(id)) continue;
    appliedDeltaIds.add(id);
    if (appliedDeltaIds.size > 3000) {
      const oldest = appliedDeltaIds.values().next().value;
      if (oldest !== undefined) appliedDeltaIds.delete(oldest);
    }
    fresh.push(item);
  }
  return fresh;
}

// Re-exports for backward compatibility
export { recordDelta, recordBatchDeltas } from './deltaWriteService';
export { applyIncomingDeltas } from './deltaApplyService';
export { pullAndApplyDeltas } from './deltaPullService';
export { startDeltaSyncService, triggerImmediateDeltaSync, pruneExpiredDeltas } from './deltaOrchestratorService';
