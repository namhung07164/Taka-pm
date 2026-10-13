import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { safeGetItemLocal, safeSetItemLocal } from './storage';

const LAST_PURGE_KEY = 'taka_last_delta_purge_time_v1';
const DELTA_COLLECTION = 'taka_deltas';
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000; // Run at most once every 6 hours
const DEFAULT_RETENTION_HOURS = 48; // Retain deltas for 48 hours

/**
 * B7: Firestore TTL Policy on field `expireAt` automatically deletes expired deltas at 0 read cost.
 * Client-side getDocs purge queries are eliminated to prevent read waste.
 */
export async function purgeOldDeltas(_retentionHours = DEFAULT_RETENTION_HOURS): Promise<number> {
  // Managed server-side via Firestore TTL policy on `expireAt`.
  return 0;
}
