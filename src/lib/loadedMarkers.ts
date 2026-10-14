import { localDb } from './localDb';

const PREFIX = 'loaded:';
export type MarkerKind =
  | 'projects_year'
  | 'tasks_proj'
  | 'tasks_year'
  | 'costs_year'
  | 'delegations_year';

let cache: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;

export const markerKey = (kind: MarkerKind, id: string | number) =>
  `${PREFIX}${kind}:${String(id).trim().toLowerCase()}`;

export async function getLoadedMarkers(): Promise<Set<string>> {
  if (cache) return cache;
  if (!loading) {
    loading = (async () => {
      try {
        const rows = await localDb.syncMeta.where('key').startsWith(PREFIX).toArray();
        cache = new Set(rows.map((r) => r.key));
      } catch {
        cache = new Set();
      }
      return cache as Set<string>;
    })();
  }
  return loading;
}

export function hasMarker(set: Set<string>, kind: MarkerKind, id: string | number): boolean {
  return set.has(markerKey(kind, id));
}

export async function markLoaded(kind: MarkerKind, id: string | number): Promise<void> {
  const key = markerKey(kind, id);
  const currentCache = await getLoadedMarkers();
  currentCache.add(key);
  try {
    await localDb.syncMeta.put({ key, value: String(Date.now()), updatedAt: Date.now() });
  } catch {}
}

export async function clearLoadedMarkers(): Promise<void> {
  cache = new Set();
  loading = null;
  try {
    await localDb.syncMeta.where('key').startsWith(PREFIX).delete();
  } catch {}
}
