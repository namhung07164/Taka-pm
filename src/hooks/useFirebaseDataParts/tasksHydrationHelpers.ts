import { Task, Project } from "../../types";
import { isTaskBelongsToProject } from "../../lib/utils";

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
export function extractKeysToHydrate(
  activeProjectIds: string[],
  projects: Project[],
  globalYearFilter?: string
): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(activeProjectIds) || activeProjectIds.length === 0) return keys;

  const idSet = new Set(activeProjectIds.map(id => String(id)));

  (projects || []).forEach((p) => {
    if (!p) return;
    const pId = String(p.id || '');
    const pCode = String(p.code || '').trim();
    const matchesById = pId && idSet.has(pId);
    const matchesByCode = pCode && idSet.has(pCode) && (
      !globalYearFilter ||
      globalYearFilter === 'all' ||
      !p.year ||
      String(p.year).trim() === String(globalYearFilter).trim()
    );
    if (matchesById || matchesByCode) {
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
    const matchesById = pId && activeIdSet.has(pId);
    const matchesByCode = pCode && activeIdSet.has(pCode) && (
      !globalYearFilter ||
      globalYearFilter === 'all' ||
      !p.year ||
      String(p.year).trim() === String(globalYearFilter).trim()
    );

    if (matchesById || matchesByCode) {
      const year = p.year ? String(p.year).trim() : (globalYearFilter || '2026');
      const list = map.get(year) || [];
      list.push(p);
      map.set(year, list);
    }
  });

  return map;
}

/**
 * Checks if a task belongs to a specific project by ID or (code + store + year).
 */
export function doesTaskBelongToProject(t: Task, p: Project): boolean {
  return isTaskBelongsToProject(t, p);
}

/**
 * Filters snapshot.docChanges() from a projectCode query so only tasks belonging to project `p` are applied.
 */
export function filterCompatibleProjectChanges(docChanges: any[], p: Project): any[] {
  return docChanges.filter((ch) => {
    const dt: any = ch.doc.data();
    if (ch.type === "removed") {
      if (dt && dt.projectId && p.id && String(dt.projectId) !== String(p.id)) return false;
      if (
        dt &&
        dt.projectStore &&
        p.store &&
        String(dt.projectStore).trim().toLowerCase() !== String(p.store).trim().toLowerCase()
      ) {
        return false;
      }
      if (
        dt &&
        dt.projectYear !== undefined &&
        dt.projectYear !== null &&
        dt.projectYear !== "" &&
        p.year &&
        String(dt.projectYear).trim() !== String(p.year).trim()
      ) {
        return false;
      }
      return true;
    }
    if (dt.projectId && String(dt.projectId) !== String(p.id)) return false;
    if (
      dt.projectStore &&
      p.store &&
      String(dt.projectStore).trim().toLowerCase() !== String(p.store).trim().toLowerCase()
    ) {
      return false;
    }
    const dy = dt.projectYear;
    if (
      dy !== undefined &&
      dy !== null &&
      dy !== "" &&
      p.year &&
      String(dy).trim() !== String(p.year).trim()
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Builds synthetic "removed" docChanges for any local task in `year` that no longer exists in a server snapshot.
 */
export function buildZombieTaskRemovalsForYear(
  snapshotDocs: any[],
  currentTasks: Task[],
  year: string | number,
  userRole: string | undefined,
  allowedStores: string[]
): any[] {
  const serverIds = new Set<string>();
  snapshotDocs.forEach((d) => serverIds.add(d.id));
  const nowMs = Date.now();
  const allowedLower = allowedStores.map((s) => s.toLowerCase());
  const isStoreRestricted = userRole !== "admin" && allowedLower.length > 0 && !allowedLower.includes("all");
  const zombieRemovals: any[] = [];

  currentTasks.forEach((t) => {
    if (
      t?.id &&
      !t.id.startsWith("ts_") &&
      String(t.projectYear ?? "").trim() === String(year).trim() &&
      !serverIds.has(t.id)
    ) {
      if (isStoreRestricted && t.projectStore && !allowedLower.includes(String(t.projectStore).trim().toLowerCase())) {
        return;
      }
      const updatedMs = t.updatedAt ? Date.parse(String(t.updatedAt)) : 0;
      if (!updatedMs || nowMs - updatedMs > 30000) {
        zombieRemovals.push({
          type: "removed",
          doc: { id: t.id, data: () => ({ ...t, isDeleted: true }) },
        });
      }
    }
  });

  return zombieRemovals;
}

/**
 * Builds synthetic "removed" docChanges for any local task of project `p` that no longer exists in a server snapshot.
 */
export function buildZombieTaskRemovalsForProject(
  snapshotDocs: any[],
  currentTasks: Task[],
  p: Project
): any[] {
  const serverIds = new Set<string>();
  snapshotDocs.forEach((d) => serverIds.add(d.id));
  const nowMs = Date.now();
  const zombieRemovals: any[] = [];

  currentTasks.forEach((t) => {
    if (t?.id && !t.id.startsWith("ts_") && doesTaskBelongToProject(t, p) && !serverIds.has(t.id)) {
      const updatedMs = t.updatedAt ? Date.parse(String(t.updatedAt)) : 0;
      if (!updatedMs || nowMs - updatedMs > 30000) {
        zombieRemovals.push({
          type: "removed",
          doc: { id: t.id, data: () => ({ ...t, isDeleted: true }) },
        });
      }
    }
  });

  return zombieRemovals;
}
