import { localDb } from './localDb';
import { Cost } from '../types';

/**
 * Retrieves cached costs for specific projects from Dexie IndexedDB.
 * Supports composite key lookup: projectId, projectCode, and legacy code.
 */
export async function getLocalCostsForProjects(
  projectIdsOrCodes: string[],
  year?: string | number | null,
  store?: string | null
): Promise<Cost[]> {
  if (!projectIdsOrCodes || projectIdsOrCodes.length === 0) return [];
  try {
    const rawIds = Array.from(
      new Set(
        projectIdsOrCodes
          .flatMap((id) => {
            const s = String(id).trim();
            const norm = s.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
            return norm !== s ? [s, norm] : [s];
          })
          .filter(Boolean)
      )
    );
    if (rawIds.length === 0) return [];

    const [byProjId, byProjCode, byCode] = await Promise.all([
      localDb.costs.where('projectId').anyOf(rawIds).toArray().catch(() => []),
      localDb.costs.where('projectCode').anyOf(rawIds).toArray().catch(() => []),
      localDb.costs.where('code').anyOf(rawIds).toArray().catch(() => []),
    ]);

    const strYear =
      year !== undefined && year !== null && String(year).toLowerCase() !== 'all'
        ? String(year).trim()
        : '';
    const strStore =
      store && String(store).toLowerCase() !== 'all' ? String(store).trim().toUpperCase() : '';

    const matchesScope = (c: Cost) => {
      if (!c || c.isDeleted) return false;
      const cYear = String(
        c.projectYear !== undefined && c.projectYear !== null ? c.projectYear : (c as any).year || ''
      ).trim();
      if (strYear && cYear && cYear !== strYear) return false;
      const cStore = String(c.projectStore || (c as any).store || '').trim().toUpperCase();
      if (strStore && cStore && cStore !== strStore) return false;
      return true;
    };

    const merged = new Map<string, Cost>();
    for (const c of byProjId) if (matchesScope(c)) merged.set(c.id, c);
    for (const c of byProjCode) if (matchesScope(c)) merged.set(c.id, c);
    for (const c of byCode) if (matchesScope(c)) merged.set(c.id, c);

    // Fallback: If no costs found with indexed query, do a quick scan of all costs in Dexie
    if (merged.size === 0) {
      const allCosts = await localDb.costs.toArray().catch(() => []);
      const lowerRawIds = new Set(rawIds.map((r) => r.toLowerCase()));
      const compactRawIds = new Set(rawIds.map((r) => r.toLowerCase().replace(/[^a-z0-9]/g, '')));
      for (const c of allCosts) {
        if (!c || c.isDeleted || !matchesScope(c)) continue;
        const cProjId = String(c.projectId || '').trim().toLowerCase();
        const cProjCode = String(c.projectCode || (c as any).code || '').trim().toLowerCase();
        const cCompact = cProjCode.replace(/[^a-z0-9]/g, '');
        if (
          lowerRawIds.has(cProjId) ||
          lowerRawIds.has(cProjCode) ||
          compactRawIds.has(cCompact)
        ) {
          merged.set(c.id, c);
        }
      }
    }
    return Array.from(merged.values());
  } catch (err) {
    console.warn('[localDbCosts] getLocalCostsForProjects error:', err);
    return [];
  }
}
