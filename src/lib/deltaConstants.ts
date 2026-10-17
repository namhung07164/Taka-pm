export const LAST_SYNC_KEY = 'taka_last_delta_sync_time_v1';
export const RESTORE_CUTOFF_KEY = 'taka_restore_cutoff_time_v1';
export const DELTA_COLLECTION = 'taka_deltas';
export const CLOCK_SKEW_OVERLAP_MS = 10 * 1000;
export const MAX_APPLIED_IDS = 3000;

export const CLIENT_SESSION_ID = typeof window !== 'undefined'
  ? `sess_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`
  : 'server_sess';
