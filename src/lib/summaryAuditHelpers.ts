import { Project, Task } from '../types';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { matchProjectCode } from './projectDatesService';
import { normalizeStoreCode, normalizeYearString, normalizeTaskNameForComparison } from './taskDeduplicationService';
import { bulkPersistTasks, bulkPersistProjects, deleteLocalRecord } from './localDb';
import { markTasksDeleted } from './taskDeletedTracker';

export const RECENT_EDIT_GUARD_MS = 10 * 60 * 1000;

export const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

export const identityKey = (code: unknown, store: unknown, year: unknown): string =>
  `${norm(code)}__${normalizeStoreCode(store as any)}__${normalizeYearString(year as any)}`;

export interface AuditRow {
  projectId: string;
  code: string;
  store: string;
  year: string;
  serverTaskCount: number;
  summaryTaskCount: number;
  summaryEntryCount: number;
  missingInSummary: string[];
  ghostInSummary: string[];
  noIdEntries: number;
  countMismatch: boolean;
  summaryIssue: boolean;
  loadedLocally: boolean;
  missingLocal: string[];
  ghostLocal: string[];
  localProjectStale: boolean;
  deviceIssue: boolean;
}

export interface AuditReport {
  generatedAt: number;
  projectCount: number;
  taskCount: number;
  orphanCount: number;
  ambiguousCount: number;
  issues: AuditRow[];
  internal: {
    projects: Map<string, Project>;
    ownerTasks: Map<string, Task[]>;
    serverTasksById: Map<string, Task>;
  };
}

export type OwnerResult = { owner?: Project; status: 'ok' | 'ambiguous' | 'orphan' };

export function buildOwnerResolver(projects: Project[]) {
  const byId = new Map<string, Project>();
  const byIdentity = new Map<string, Project[]>();
  projects.forEach((p) => {
    if (p.id) byId.set(String(p.id), p);
    const k = identityKey(p.code, p.store, p.year);
    const arr = byIdentity.get(k);
    if (arr) arr.push(p);
    else byIdentity.set(k, [p]);
  });

  return (t: Task): OwnerResult => {
    if (t.projectId) {
      const p = byId.get(String(t.projectId));
      return p ? { owner: p, status: 'ok' } : { status: 'orphan' };
    }
    const exact = byIdentity.get(identityKey(t.projectCode, t.projectStore, t.projectYear));
    if (exact && exact.length === 1) return { owner: exact[0], status: 'ok' };
    if (exact && exact.length > 1) return { status: 'ambiguous' };

    const sameStore = (p: Project) =>
      !t.projectStore || normalizeStoreCode(p.store) === normalizeStoreCode(t.projectStore as any);
    const sameYear = (p: Project) =>
      t.projectYear === undefined ||
      t.projectYear === null ||
      t.projectYear === '' ||
      normalizeYearString(p.year as any) === normalizeYearString(t.projectYear as any);
    const candidates = projects.filter(
      (p) =>
        sameStore(p) &&
        sameYear(p) &&
        (matchProjectCode(p.code, t.projectCode) || matchProjectCode((p as any).linkCodes, t.projectCode))
    );
    if (candidates.length === 1) return { owner: candidates[0], status: 'ok' };
    if (candidates.length > 1) return { status: 'ambiguous' };
    return { status: 'orphan' };
  };
}

export const isRecent = (t: Task): boolean => {
  const ts = t.updatedAt ? new Date(t.updatedAt as any).getTime() : 0;
  return ts > 0 && Date.now() - ts < RECENT_EDIT_GUARD_MS;
};

/**
 * Matches Firestore tasks (`owned`) and `project.taskSummaries` entries (`summaries`) that have
 * drifted IDs (e.g. `t_...` IDs that differ between `taka_tasks` and `p.taskSummaries` for the exact same task).
 */
export function matchDriftedSummaryAndServerTasks(
  owned: Task[],
  summaries: any[]
): {
  driftedOwnedIds: Set<string>;
  driftedSummaryIds: Set<string>;
  summaryIdToOwnedTask: Map<string, Task>;
} {
  const ownedIds = new Set(owned.map((t) => String(t.id)));
  const summaryIds = new Set(
    summaries.map((s) => (s && s.id ? String(s.id) : '')).filter(Boolean)
  );

  const unmatchedOwned = owned.filter((t) => t?.id && !summaryIds.has(String(t.id)));
  const unmatchedSummaries = summaries.filter((s) => s && (!s.id || !ownedIds.has(String(s.id))));

  const driftedOwnedIds = new Set<string>();
  const driftedSummaryIds = new Set<string>();
  const summaryIdToOwnedTask = new Map<string, Task>();

  if (unmatchedOwned.length === 0 || unmatchedSummaries.length === 0) {
    return { driftedOwnedIds, driftedSummaryIds, summaryIdToOwnedTask };
  }

  const usedOwnedIds = new Set<string>();

  for (const s of unmatchedSummaries) {
    const sId = s?.id ? String(s.id) : '';
    const sName = normalizeTaskNameForComparison(s?.name);
    const sStart = String(s?.start || '').trim();
    const sFinish = String(s?.finish || '').trim();
    const sCode = String(s?.taskCodePhu || '').trim().toLowerCase();

    // Pass 1: Match by exact normalized name + start + finish
    let matched = unmatchedOwned.find((t) => {
      if (usedOwnedIds.has(t.id)) return false;
      const tName = normalizeTaskNameForComparison(t.name);
      return (
        Boolean(sName) &&
        tName === sName &&
        String(t.start || '').trim() === sStart &&
        String(t.finish || '').trim() === sFinish
      );
    });

    // Pass 2: Match by exact normalized name + start (or taskCodePhu)
    if (!matched) {
      matched = unmatchedOwned.find((t) => {
        if (usedOwnedIds.has(t.id)) return false;
        const tName = normalizeTaskNameForComparison(t.name);
        const tCode = String(t.taskCodePhu || '').trim().toLowerCase();
        if (sName && tName === sName && String(t.start || '').trim() === sStart) return true;
        if (sCode && tCode && sCode === tCode && (!sName || !tName || sName === tName)) return true;
        return false;
      });
    }

    // Pass 3: Match by exact normalized name when name matches
    if (!matched && sName) {
      matched = unmatchedOwned.find((t) => {
        if (usedOwnedIds.has(t.id)) return false;
        return normalizeTaskNameForComparison(t.name) === sName;
      });
    }

    if (matched) {
      usedOwnedIds.add(matched.id);
      driftedOwnedIds.add(matched.id);
      if (sId) {
        driftedSummaryIds.add(sId);
        summaryIdToOwnedTask.set(sId, matched);
      }
    }
  }

  return { driftedOwnedIds, driftedSummaryIds, summaryIdToOwnedTask };
}

export async function repairLocalDevice(
  report: AuditReport
): Promise<{ added: number; removed: number; projectsRefreshed: number }> {
  if (Date.now() - report.generatedAt > 10 * 60 * 1000) {
    throw new Error('Báo cáo đã cũ hơn 10 phút. Hãy chạy kiểm tra lại trước khi sửa.');
  }
  const st = useAppStore.getState();
  const toDelete = new Set<string>();
  const toAddMap = new Map<string, Task>();
  const staleProjectIds = new Set<string>();

  report.issues
    .filter((r) => r.deviceIssue)
    .forEach((r) => {
      r.ghostLocal.forEach((id) => {
        toDelete.add(id);
        markTasksDeleted([id], r.projectId);
      });
      r.missingLocal.forEach((id) => {
        const t = report.internal.serverTasksById.get(id);
        if (t) toAddMap.set(id, t);
      });
      if (r.localProjectStale) staleProjectIds.add(r.projectId);
    });

  const currentTasks = st.tasks || [];
  const kept = currentTasks.filter((t) => !toDelete.has(t.id) && !(t as any)._isVirtualSummary);
  const existingIds = new Set(kept.map((t) => t.id));
  const added = [...toAddMap.values()].filter((t) => !existingIds.has(t.id));
  st.setTasks([...kept, ...added]);

  if (added.length > 0) await bulkPersistTasks(added);
  for (const id of toDelete) {
    await deleteLocalRecord('taka_tasks', id).catch(() => {});
  }

  let projectsRefreshed = 0;
  if (staleProjectIds.size > 0) {
    const refreshed: Project[] = [];
    const nextProjects = (st.projects || []).map((p) => {
      if (p.id && staleProjectIds.has(String(p.id))) {
        const sp = report.internal.projects.get(String(p.id));
        if (sp) {
          const merged = { ...p, ...sp } as Project;
          refreshed.push(merged);
          projectsRefreshed++;
          return merged;
        }
      }
      return p;
    });
    useAppStore.getState().setProjects(nextProjects);
    if (refreshed.length > 0) await bulkPersistProjects(refreshed);
  }

  return { added: added.length, removed: toDelete.size, projectsRefreshed };
}

export async function purgeExcessFirestoreTasks(
  report: AuditReport,
  targetProjectIds?: string[],
  onProgress?: (done: number, total: number) => void
): Promise<{ purgedTasks: number; updatedProjects: number }> {
  if (Date.now() - report.generatedAt > 10 * 60 * 1000) {
    throw new Error('Báo cáo đã cũ hơn 10 phút. Hãy chạy kiểm tra lại trước khi xóa.');
  }
  const targets = report.issues.filter((r) =>
    targetProjectIds && targetProjectIds.length > 0
      ? targetProjectIds.includes(r.projectId) && r.missingInSummary.length > 0
      : r.missingInSummary.length > 0
  );
  if (targets.length === 0) return { purgedTasks: 0, updatedProjects: 0 };

  const { doc } = await import('firebase/firestore');
  const { writeBatch } = await import('./firestoreWrites');
  const st = useAppStore.getState();

  const allTaskIdsToDelete: string[] = [];
  targets.forEach((row) => {
    markTasksDeleted(row.missingInSummary, row.projectId);
    row.missingInSummary.forEach((id) => allTaskIdsToDelete.push(id));
  });

  const BATCH_SIZE = 400;
  for (let i = 0; i < allTaskIdsToDelete.length; i += BATCH_SIZE) {
    const chunk = allTaskIdsToDelete.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((id) =>
      batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id))
    );
    await batch.commit();
    onProgress?.(Math.min(i + BATCH_SIZE, allTaskIdsToDelete.length), allTaskIdsToDelete.length);
  }

  const deletedSet = new Set(allTaskIdsToDelete);
  for (const id of allTaskIdsToDelete) {
    await deleteLocalRecord('taka_tasks', id).catch(() => {});
  }
  st.setTasks((st.tasks || []).filter((t) => !deletedSet.has(t.id)));
  return { purgedTasks: allTaskIdsToDelete.length, updatedProjects: targets.length };
}
