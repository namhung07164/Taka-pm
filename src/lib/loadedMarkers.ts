import { localDb } from './localDb';

const PREFIX = 'loaded_v2:';
// Default warm window: 24 hours. Opening or resuming the app within 24h skips full-collection re-reads
// and relies on Dexie Local-First + taka_deltas real-time stream (7-day retention).
export const DEFAULT_MARKER_TTL_MS = 24 * 60 * 60 * 1000;

export type MarkerKind =
  | 'projects_year'
  | 'tasks_proj'
  | 'tasks_year'
  | 'costs_year'
  | 'delegations_year';

let cache: Set<string> | null = null;
let timestampCache: Map<string, number> = new Map();
let loading: Promise<Set<string>> | null = null;

export const markerKey = (kind: MarkerKind, id: string | number) =>
  `${PREFIX}${kind}:${String(id).trim().toLowerCase()}`;

export async function getLoadedMarkers(): Promise<Set<string>> {
  if (cache) return cache;
  if (!loading) {
    loading = (async () => {
      try {
        const rows = await localDb.syncMeta.where('key').startsWith(PREFIX).toArray();
        cache = new Set();
        timestampCache = new Map();
        rows.forEach((r) => {
          cache!.add(r.key);
          const ts = Number(r.updatedAt || r.value || 0);
          if (Number.isFinite(ts) && ts > 0) {
            timestampCache.set(r.key, ts);
          }
        });
      } catch {
        cache = new Set();
        timestampCache = new Map();
      }
      return cache as Set<string>;
    })();
  }
  return loading;
}

export function hasMarker(set: Set<string>, kind: MarkerKind, id: string | number): boolean {
  return set.has(markerKey(kind, id));
}

/**
 * Checks if a collection/year/project marker exists AND was verified within `maxAgeMs` (default 24 hours).
 * Prevents full-collection Firestore re-reads when reopening the app within the warm window.
 */
export function hasFreshMarker(
  set: Set<string>,
  kind: MarkerKind,
  id: string | number,
  maxAgeMs: number = DEFAULT_MARKER_TTL_MS
): boolean {
  const key = markerKey(kind, id);
  if (!set.has(key)) return false;
  const ts = timestampCache.get(key) || 0;
  if (!ts) return false;
  return Date.now() - ts <= maxAgeMs;
}

export async function markLoaded(kind: MarkerKind, id: string | number): Promise<void> {
  const key = markerKey(kind, id);
  const now = Date.now();
  const currentCache = await getLoadedMarkers();
  currentCache.add(key);
  timestampCache.set(key, now);
  try {
    await localDb.syncMeta.put({ key, value: String(now), updatedAt: now });
  } catch {}
}

export async function unmarkLoaded(kind: MarkerKind, id: string | number): Promise<void> {
  const key = markerKey(kind, id);
  if (cache) cache.delete(key);
  timestampCache.delete(key);
  try {
    await localDb.syncMeta.delete(key);
  } catch {}
}

export async function clearLoadedMarkers(): Promise<void> {
  cache = new Set();
  timestampCache = new Map();
  loading = null;
  try {
    await localDb.syncMeta.where('key').startsWith(PREFIX).delete();
  } catch {}
}

export async function clearAllLoadedMarkers(): Promise<void> {
  return clearLoadedMarkers();
}

