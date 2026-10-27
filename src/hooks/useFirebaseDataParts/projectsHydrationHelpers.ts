import { Project, Task, TakaDeltaItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { localDb, patchLocalRecord } from '../../lib/localDb';
import { isTaskBelongsToProject } from '../../lib/taskStateService';
import { unmarkProjectTasksHydrated } from '../../lib/utils';
import { unmarkLoaded } from '../../lib/loadedMarkers';
import { resolveInvalidations } from '../../lib/deltaInvalidateService';
import { applyIncomingDeltas } from '../../lib/deltaSyncService';
import { rollupTaskSummaries } from '../../lib/taskRollupHelpers';

// Chuyển updatedAt (ISO string / Firestore Timestamp / plain {seconds} / number) về ms
export const tsOf = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'string') { const n = Date.parse(v); return Number.isFinite(n) ? n : 0; }
  if (typeof v?.toMillis === 'function') { const n = v.toMillis(); return Number.isFinite(n) ? n : 0; }
  if (typeof v?.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const isStaleCacheDoc = (existing: any, incoming: any): boolean => {
  if (!existing) return false;
  const e = tsOf(existing.updatedAt), i = tsOf(incoming?.updatedAt);
  return e > 0 && i > 0 && i < e;
};

export interface ProjectTasksLookupIndex {
  byProjectId: Map<string, Task[]>;
  byCodePart: Map<string, Task[]>;
}

export function buildProjectTasksLookupIndex(currentTasks: Task[]): ProjectTasksLookupIndex {
  const byProjectId = new Map<string, Task[]>();
  const byCodePart = new Map<string, Task[]>();
  if (!Array.isArray(currentTasks) || currentTasks.length === 0) return { byProjectId, byCodePart };

  for (let i = 0; i < currentTasks.length; i++) {
    const t = currentTasks[i];
    if (!t) continue;
    if (t.projectId) {
      const pid = String(t.projectId).trim();
      if (pid) {
        let list = byProjectId.get(pid);
        if (!list) { list = []; byProjectId.set(pid, list); }
        list.push(t);
      }
    }
    if (t.projectCode) {
      const rawCode = String(t.projectCode).trim().toLowerCase();
      const parts = rawCode.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
      const codes = parts.length > 0 ? parts : [rawCode];
      for (let j = 0; j < codes.length; j++) {
        const c = codes[j];
        if (!c) continue;
        let list = byCodePart.get(c);
        if (!list) { list = []; byCodePart.set(c, list); }
        list.push(t);
      }
    }
  }
  return { byProjectId, byCodePart };
}

export function getLocalProjectTasksFromIndex(
  project: Project,
  index: ProjectTasksLookupIndex
): Task[] {
  const result: Task[] = [];
  const seenTaskIds = new Set<string>();

  const pId = project.id ? String(project.id).trim() : '';
  if (pId) {
    const byIdCandidates = index.byProjectId.get(pId);
    if (byIdCandidates) {
      for (let i = 0; i < byIdCandidates.length; i++) {
        const t = byIdCandidates[i];
        if (isTaskBelongsToProject(t, project)) {
          if (t.id) seenTaskIds.add(String(t.id));
          result.push(t);
        }
      }
    }
  }

  const rawCodes = project.linkCodes
    ? `${project.code || ''}, ${project.linkCodes}`
    : String(project.code || '');
  const codeParts = rawCodes
    .toLowerCase()
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = 0; i < codeParts.length; i++) {
    const byCodeCandidates = index.byCodePart.get(codeParts[i]);
    if (!byCodeCandidates) continue;
    for (let j = 0; j < byCodeCandidates.length; j++) {
      const t = byCodeCandidates[j];
      const tIdStr = t.id ? String(t.id) : '';
      if (tIdStr && seenTaskIds.has(tIdStr)) continue;
      if (isTaskBelongsToProject(t, project)) {
        if (tIdStr) seenTaskIds.add(tIdStr);
        result.push(t);
      }
    }
  }

  return result;
}

/**
 * Server-to-Device Task Summary Reconciliation for a single project docChange.
 * Verifies missing/extra tasks via Firestore `resolveInvalidations` rather than blindly deleting valid tasks.
 */
export function reconcileProjectSummaryWithLocalTasks(params: {
  id: string;
  data: Project;
  existing: Project | undefined;
  resolvedData: Project;
  tasksIndex: ProjectTasksLookupIndex;
  expandedSet: Set<string>;
  nowMs: number;
  pendingDeletedTaskIds: Set<string>;
  pendingInvalidatedTaskIds: Map<string, string>;
}): void {
  const {
    id,
    data,
    existing,
    resolvedData,
    tasksIndex,
    expandedSet,
    nowMs,
    pendingInvalidatedTaskIds,
  } = params;

  if (!Array.isArray(data.taskSummaries)) return;
  const authoritativeSummaries =
    data.taskSummaries.length > 0 ? rollupTaskSummaries(data.taskSummaries) : data.taskSummaries;

  const serverSummaryIds = new Set(
    authoritativeSummaries.map((s: any) => String(s?.id || '').trim().toLowerCase()).filter(Boolean)
  );
  const isZeroTaskServer = authoritativeSummaries.length === 0 && (data.taskCount ?? 0) === 0;
  const allSummariesHaveIds =
    isZeroTaskServer ||
    (authoritativeSummaries.length > 0 &&
      authoritativeSummaries.every((s: any) => Boolean(s?.id && !String(s.id).startsWith('ts_'))));

  if (serverSummaryIds.size === 0 && !isZeroTaskServer) return;

  const projYearStr = String(resolvedData.year || data.year || '');
  const serverSummaryNameStarts = new Set(
    authoritativeSummaries
      .map((s: any) => `${String(s?.name || '').trim().toLowerCase()}|${String(s?.start || '').trim()}`)
      .filter((k) => k !== '|')
  );
  if (allSummariesHaveIds && existing && Array.isArray(existing.taskSummaries)) {
    existing.taskSummaries.forEach((oldS: any) => {
      const oldId = String(oldS?.id || '').trim();
      const oldNameStart = `${String(oldS?.name || '').trim().toLowerCase()}|${String(oldS?.start || '').trim()}`;
      if (
        oldId &&
        !oldId.startsWith('ts_') &&
        !serverSummaryIds.has(oldId.toLowerCase()) &&
        !serverSummaryNameStarts.has(oldNameStart)
      ) {
        pendingInvalidatedTaskIds.set(oldId, projYearStr);
      }
    });
  }

  const localProjTasks = getLocalProjectTasksFromIndex(resolvedData, tasksIndex);
  const localProjTasksById = new Map<string, any>();
  localProjTasks.forEach((t) => {
    if (!t?.id || String(t.id).startsWith('ts_')) return;
    localProjTasksById.set(String(t.id).trim().toLowerCase(), t);
  });

  const isProjectExpandedOrLoaded =
    localProjTasksById.size > 0 ||
    expandedSet.has(String(id)) ||
    (Boolean(data.code) && expandedSet.has(String(data.code).trim()));

  let hasMissingLocalTasks = false;
  const unmatchedSummaryNameStarts = new Set<string>();
  authoritativeSummaries.forEach((s: any) => {
    const sId = String(s?.id || '').trim();
    const sIdLower = sId.toLowerCase();
    if (!sIdLower || !localProjTasksById.has(sIdLower)) {
      if (sId && !sId.startsWith('ts_')) {
        hasMissingLocalTasks = true;
        if (isProjectExpandedOrLoaded) {
          pendingInvalidatedTaskIds.set(sId, projYearStr);
        }
      }
      const sName = String(s?.name || '').trim().toLowerCase();
      const sStart = String(s?.start || '').trim();
      if (sName) unmatchedSummaryNameStarts.add(`${sName}|${sStart}`);
    }
  });

  if (hasMissingLocalTasks) {
    unmarkProjectTasksHydrated(id);
    unmarkLoaded('tasks_proj', id).catch(() => {});
  }

  localProjTasks.forEach((t) => {
    if (!t?.id || String(t.id).startsWith('ts_')) return;
    const tIdLower = String(t.id).trim().toLowerCase();
    if (allSummariesHaveIds && !serverSummaryIds.has(tIdLower)) {
      const tNameStart = `${String(t.name || '').trim().toLowerCase()}|${String(t.start || '').trim()}`;
      if (!isZeroTaskServer && t.name && unmatchedSummaryNameStarts.has(tNameStart)) {
        unmatchedSummaryNameStarts.delete(tNameStart);
        return;
      }
      const updatedMs = tsOf(t.updatedAt);
      if (!updatedMs || nowMs - updatedMs > 60000) {
        pendingInvalidatedTaskIds.set(t.id, projYearStr);
      }
    }
  });

  if (serverSummaryIds.size > 0 && isProjectExpandedOrLoaded) {
    authoritativeSummaries.forEach((s: any) => {
      const sId = String(s?.id || '').trim();
      if (!sId || sId.startsWith('ts_')) return;
      const localT = localProjTasksById.get(sId.toLowerCase());
      if (localT) {
        const localUpdatedMs = tsOf(localT.updatedAt);
        if (!(localUpdatedMs > 0 && nowMs - localUpdatedMs <= 60000)) {
          const localParent = localT.parentTaskId || undefined;
          const localParentLower = localParent ? String(localParent).trim().toLowerCase() : '';
          const isModernSummary =
            s.orderIndex !== undefined ||
            s.runningStatus !== undefined ||
            s.isModularParent !== undefined ||
            'parentTaskId' in s;
          const sParent =
            s.parentTaskId !== undefined && s.parentTaskId !== null && String(s.parentTaskId).trim() !== ''
              ? s.parentTaskId
              : isModernSummary
                ? undefined
                : localParentLower && serverSummaryIds.has(localParentLower)
                  ? localParent
                  : undefined;
          const summaryDiffers =
            (s.name !== undefined && s.name !== localT.name) ||
            (s.start !== undefined && s.start !== localT.start) ||
            (s.finish !== undefined && s.finish !== localT.finish) ||
            (s.runningStatus !== undefined && s.runningStatus !== localT.runningStatus) ||
            (s.approval !== undefined && s.approval !== localT.approval) ||
            (s.party !== undefined && s.party !== localT.party) ||
            (s.isModularParent !== undefined && Boolean(s.isModularParent) !== Boolean(localT.isModularParent)) ||
            (s.predecessor !== undefined && s.predecessor !== localT.predecessor) ||
            sParent !== localParent;
          if (summaryDiffers) {
            if (s.name !== undefined) localT.name = s.name;
            if (s.start !== undefined) localT.start = s.start;
            if (s.finish !== undefined) localT.finish = s.finish;
            if (s.runningStatus !== undefined) localT.runningStatus = s.runningStatus;
            if (s.approval !== undefined) localT.approval = s.approval;
            if (s.party !== undefined) localT.party = s.party;
            if (s.duration !== undefined) localT.duration = String(s.duration);
            if (s.isModularParent !== undefined) localT.isModularParent = Boolean(s.isModularParent);
            if (s.predecessor !== undefined) localT.predecessor = s.predecessor;
            if (s.predecessorTaskIds !== undefined) localT.predecessorTaskIds = s.predecessorTaskIds;
            localT.parentTaskId = sParent;
            if (!sParent) delete (localT as any).parentId;
          }
        }
      }
    });
  }
}

/**
 * Background Dexie Task Reconciliation: reconciles localDb.tasks with server project.taskSummaries,
 * fetching missing summary tasks and verifying candidate deletions against Firestore taka_tasks.
 */
export function runBackgroundDexieProjectTaskReconciliation(changed: Project[]): void {
  setTimeout(async () => {
    try {
      const nowBg = Date.now();
      const itemsToVerify: TakaDeltaItem[] = [];

      for (const p of changed) {
        if (!p?.id || !Array.isArray(p.taskSummaries)) continue;
        const summaries =
          p.taskSummaries.length > 0 ? rollupTaskSummaries(p.taskSummaries) : p.taskSummaries;
        const summaryIds = new Set(
          summaries.map((s: any) => String(s?.id || '').trim().toLowerCase()).filter(Boolean)
        );
        const isZeroTask = summaries.length === 0 && (p.taskCount ?? 0) === 0;
        const allSummariesHaveIds =
          isZeroTask ||
          (summaries.length > 0 &&
            summaries.every((s: any) => Boolean(s?.id && !String(s.id).startsWith('ts_'))));
        if (summaryIds.size === 0 && !isZeroTask) continue;

        const summaryById = new Map<string, any>();
        summaries.forEach((s: any) => {
          if (s?.id) summaryById.set(String(s.id).trim().toLowerCase(), s);
        });

        const keys = [String(p.id)];
        if (p.code) keys.push(String(p.code).trim());
        if (p.linkCodes) {
          String(p.linkCodes)
            .split(/[,;/]+/)
            .forEach((c) => {
              if (c.trim()) keys.push(c.trim());
            });
        }
        const [byId, byCode] = await Promise.all([
          localDb.tasks.where('projectId').equals(String(p.id)).toArray().catch(() => []),
          localDb.tasks.where('projectCode').anyOf(keys).toArray().catch(() => []),
        ]);
        const candidateMap = new Map<string, any>();
        byId.forEach((t) => {
          if (t?.id) candidateMap.set(t.id, t);
        });
        byCode.forEach((t) => {
          if (t?.id && isTaskBelongsToProject(t, p)) candidateMap.set(t.id, t);
        });

        const candidateIdsLower = new Set(
          Array.from(candidateMap.keys()).map((k) => String(k).trim().toLowerCase())
        );
        let missingInDexie = false;
        const unmatchedSummaryNameStarts = new Set<string>();
        summaries.forEach((s: any) => {
          const sId = String(s?.id || '').trim();
          const sIdLower = sId.toLowerCase();
          if (!sIdLower || !candidateIdsLower.has(sIdLower)) {
            if (sId && !sId.startsWith('ts_')) {
              missingInDexie = true;
              if (candidateMap.size > 0) {
                itemsToVerify.push({
                  docId: sId,
                  collectionName: 'taka_tasks',
                  action: 'update',
                  data: {},
                  isPatch: true,
                  invalidate: true,
                  year: String(p.year || ''),
                  projectId: String(p.id),
                  projectCode: p.code,
                  projectStore: p.store,
                  forceResolve: true,
                } as any);
              }
            }
            const sName = String(s?.name || '').trim().toLowerCase();
            const sStart = String(s?.start || '').trim();
            if (sName) unmatchedSummaryNameStarts.add(`${sName}|${sStart}`);
          }
        });

        if (missingInDexie) {
          unmarkProjectTasksHydrated(p.id);
          unmarkLoaded('tasks_proj', p.id).catch(() => {});
        }

        for (const [tid, t] of candidateMap.entries()) {
          const tidLower = String(tid).trim().toLowerCase();
          const tUpdatedMs = tsOf(t.updatedAt);
          if (tUpdatedMs > 0 && nowBg - tUpdatedMs <= 60000) continue;

          if (!summaryIds.has(tidLower)) {
            const tNameStart = `${String(t.name || '').trim().toLowerCase()}|${String(t.start || '').trim()}`;
            if (!isZeroTask && t.name && unmatchedSummaryNameStarts.has(tNameStart)) {
              unmatchedSummaryNameStarts.delete(tNameStart);
              continue;
            }
            if (isZeroTask || allSummariesHaveIds) {
              itemsToVerify.push({
                docId: tid,
                collectionName: 'taka_tasks',
                action: 'update',
                data: {},
                isPatch: true,
                invalidate: true,
                year: String(p.year || t.projectYear || ''),
                projectId: String(p.id),
                projectCode: p.code || t.projectCode,
                projectStore: p.store || t.projectStore,
                forceResolve: true,
              } as any);
            }
          } else {
            const s = summaryById.get(tidLower);
            if (s) {
              const tParent = t.parentTaskId || undefined;
              const tParentLower = tParent ? String(tParent).trim().toLowerCase() : '';
              const isModernSummary =
                s.orderIndex !== undefined ||
                s.runningStatus !== undefined ||
                s.isModularParent !== undefined ||
                'parentTaskId' in s;
              const sParent =
                s.parentTaskId !== undefined && s.parentTaskId !== null && String(s.parentTaskId).trim() !== ''
                  ? s.parentTaskId
                  : isModernSummary
                    ? undefined
                    : tParentLower && summaryIds.has(localParentOrSelf(tParentLower))
                      ? tParent
                      : undefined;
              const needsPatch =
                (s.name !== undefined && s.name !== t.name) ||
                (s.start !== undefined && s.start !== t.start) ||
                (s.finish !== undefined && s.finish !== t.finish) ||
                (s.runningStatus !== undefined && s.runningStatus !== t.runningStatus) ||
                (s.isModularParent !== undefined && Boolean(s.isModularParent) !== Boolean(t.isModularParent)) ||
                (s.predecessor !== undefined && s.predecessor !== t.predecessor) ||
                sParent !== tParent;
              if (needsPatch) {
                await patchLocalRecord('taka_tasks', tid, {
                  name: s.name ?? t.name,
                  start: s.start ?? t.start,
                  finish: s.finish ?? t.finish,
                  ...(s.runningStatus !== undefined ? { runningStatus: s.runningStatus } : {}),
                  ...(s.duration !== undefined ? { duration: s.duration } : {}),
                  ...(s.orderIndex !== undefined ? { orderIndex: s.orderIndex } : {}),
                  ...(s.isModularParent !== undefined ? { isModularParent: Boolean(s.isModularParent) } : {}),
                  ...(s.predecessor !== undefined ? { predecessor: s.predecessor } : {}),
                  ...(s.predecessorTaskIds !== undefined ? { predecessorTaskIds: s.predecessorTaskIds } : {}),
                  parentTaskId: sParent ?? null,
                  parentId: sParent ?? null,
                });
              }
            }
          }
        }
      }

      if (itemsToVerify.length > 0) {
        const resolved = await resolveInvalidations(itemsToVerify);
        if (resolved.length > 0) {
          applyIncomingDeltas(resolved);
        }
      }
    } catch {}
  }, 60);
}

function localParentOrSelf(pLower: string): string {
  return pLower;
}

/**
 * Builds synthetic "removed" docChanges for any local project in `year` that no longer exists in a server snapshot.
 */
export function buildZombieProjectRemovalsForYear(
  snapshotDocs: any[],
  currentProjectsNow: Project[],
  year: string | number,
  userRole: string | undefined,
  allowedStores: string[]
): any[] {
  const serverIds = new Set<string>();
  snapshotDocs.forEach((d) => serverIds.add(d.id));
  const nowMs = Date.now();
  const allowedLower = allowedStores.map((s) => s.toLowerCase());
  const isStoreRestricted =
    userRole !== 'admin' && allowedLower.length > 0 && !allowedLower.includes('all');
  const zombieRemovals: any[] = [];

  currentProjectsNow.forEach((p) => {
    if (
      p?.id &&
      String(p.year ?? '').trim() === String(year).trim() &&
      !serverIds.has(p.id)
    ) {
      if (
        isStoreRestricted &&
        p.store &&
        !allowedLower.includes(String(p.store).trim().toLowerCase())
      ) {
        return;
      }
      const updatedMs = tsOf(p.updatedAt);
      if (!updatedMs || nowMs - updatedMs > 30000) {
        zombieRemovals.push({
          type: 'removed',
          doc: { id: p.id, data: () => ({ ...p, isDeleted: true }) },
        });
      }
    }
  });

  return zombieRemovals;
}
