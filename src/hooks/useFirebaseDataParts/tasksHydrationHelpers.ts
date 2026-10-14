import { Task, Project } from "../../types";

/**
 * Checks if incoming doc from Firestore/cache is staler than existing local doc in memory.
 */
export function isStaleCacheDoc(existingDoc: Task | undefined, newDoc: Task): boolean {
  if (!existingDoc) return false;
  if (!existingDoc.updatedAt || !newDoc.updatedAt) return false;
  try {
    const existingTime = new Date(existingDoc.updatedAt).getTime();
    const newTime = new Date(newDoc.updatedAt).getTime();
    if (isNaN(existingTime) || isNaN(newTime)) return false;
    return existingTime > newTime;
  } catch {
    return false;
  }
}

/**
 * Extracts set of project keys/codes to hydrate from active project IDs.
 */
export function extractKeysToHydrate(activeProjectIds: string[], projects: Project[]): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(activeProjectIds) || activeProjectIds.length === 0) return keys;

  const idSet = new Set(activeProjectIds.map(id => String(id)));

  (projects || []).forEach((p) => {
    if (!p) return;
    const pId = String(p.id || '');
    const pCode = String(p.code || '').trim();
    if (idSet.has(pId) || idSet.has(pCode)) {
      if (pCode) keys.add(pCode);
      if (p.linkCodes) {
        p.linkCodes.split(/[,;/]+/).forEach(c => {
          const trimmed = c.trim();
          if (trimmed) keys.add(trimmed);
        });
      }
    }
  });

  // Also include raw IDs if no project matched
  activeProjectIds.forEach(id => keys.add(String(id)));

  return keys;
}

/**
 * Groups active projects by year string.
 */
export function groupActiveProjectsByYear(
  activeProjectIds: string[],
  projects: Project[],
  globalYearFilter?: string
): Map<string, Project[]> {
  const map = new Map<string, Project[]>();
  if (!Array.isArray(projects)) return map;

  const activeIdSet = new Set(activeProjectIds.map(id => String(id)));

  projects.forEach((p) => {
    if (!p) return;
    const pId = String(p.id || '');
    const pCode = String(p.code || '').trim();

    if (activeIdSet.has(pId) || activeIdSet.has(pCode)) {
      const year = p.year ? String(p.year).trim() : (globalYearFilter || '2026');
      const list = map.get(year) || [];
      list.push(p);
      map.set(year, list);
    }
  });

  return map;
}
