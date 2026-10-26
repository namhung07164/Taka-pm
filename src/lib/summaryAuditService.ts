/**
 * summaryAuditService.ts - Kiểm tra chéo 3 lớp dữ liệu: (1) Task Firestore, (2) Summary dự án, (3) Local (Zustand + Dexie).
 */
import { collection, getDocsFromServer } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { Project, Task } from '../types';
import { calculateProjectComputedDates } from './projectDatesService';
import { bulkPersistTasks, bulkPersistProjects, deleteLocalRecord, localDb } from './localDb';
import { markTasksDeleted } from './taskDeletedTracker';
import {
  AuditRow,
  AuditReport,
  buildOwnerResolver,
  isRecent,
  matchDriftedSummaryAndServerTasks,
  repairLocalDevice,
  purgeExcessFirestoreTasks,
} from './summaryAuditHelpers';

export type { AuditRow, AuditReport };
export { repairLocalDevice, purgeExcessFirestoreTasks };

export async function runSummaryAudit(onProgress?: (msg: string) => void): Promise<AuditReport> {
  onProgress?.('Đang đọc dự án từ Firestore (server)...');
  const projSnap = await getDocsFromServer(
    collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects')
  );
  const projects = projSnap.docs
    .map((d) => ({ ...(d.data() as any), id: d.id }) as Project)
    .filter((p) => !p.isDeleted);

  onProgress?.(`Đã đọc ${projects.length} dự án. Đang đọc task từ Firestore (server)...`);
  const taskSnap = await getDocsFromServer(
    collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks')
  );
  const serverTasks = taskSnap.docs
    .map((d) => ({ ...(d.data() as any), id: d.id }) as Task)
    .filter((t) => !t.isDeleted);

  onProgress?.(`Đã đọc ${serverTasks.length} task. Đang đối chiếu...`);

  const resolve = buildOwnerResolver(projects);
  const projectsById = new Map<string, Project>();
  projects.forEach((p) => p.id && projectsById.set(String(p.id), p));

  const serverTasksById = new Map<string, Task>();
  const ownerTasks = new Map<string, Task[]>();
  let orphanCount = 0;
  let ambiguousCount = 0;
  serverTasks.forEach((t) => {
    serverTasksById.set(t.id, t);
    const r = resolve(t);
    if (r.status === 'ok' && r.owner?.id) {
      const k = String(r.owner.id);
      const arr = ownerTasks.get(k);
      if (arr) arr.push(t);
      else ownerTasks.set(k, [t]);
    } else if (r.status === 'ambiguous') ambiguousCount++;
    else orphanCount++;
  });

  // Dữ liệu trên thiết bị này (kết hợp cả Zustand RAM + Dexie IndexedDB để phát hiện mọi zombie task ẩn trong cache)
  const st = useAppStore.getState();
  const dexieTasks = await localDb.tasks.toArray().catch(() => [] as Task[]);
  const combinedLocalMap = new Map<string, Task>();
  dexieTasks.forEach((t) => {
    if (t && t.id && !t.isDeleted && !(t as any)._isVirtualSummary && !String(t.id).startsWith('ts_')) {
      combinedLocalMap.set(String(t.id), t);
    }
  });
  (st.tasks || []).forEach((t) => {
    if (t && t.id && !t.isDeleted && !(t as any)._isVirtualSummary && !String(t.id).startsWith('ts_')) {
      combinedLocalMap.set(String(t.id), t);
    }
  });
  const localTasks: Task[] = Array.from(combinedLocalMap.values());
  const localProjects: Project[] = st.projects || [];
  const localProjectsById = new Map<string, Project>();
  localProjects.forEach((p) => p.id && localProjectsById.set(String(p.id), p));
  const localOwner = new Map<string, Task[]>();
  localTasks.forEach((t) => {
    const r = resolve(t);
    if (r.status === 'ok' && r.owner?.id) {
      const k = String(r.owner.id);
      const arr = localOwner.get(k);
      if (arr) arr.push(t);
      else localOwner.set(k, [t]);
    }
  });

  const issues: AuditRow[] = [];
  projects.forEach((p) => {
    const pid = String(p.id);
    const owned = ownerTasks.get(pid) || [];
    const ownedIds = new Set(owned.map((t) => t.id));
    const expectedSummaryIds = new Set(
      owned.filter((t) => t.name || t.start || t.finish).map((t) => t.id)
    );

    const summaries: any[] = Array.isArray(p.taskSummaries) ? (p.taskSummaries as any[]) : [];
    const summaryIds = new Set<string>();
    const summaryById = new Map<string, any>();
    let noIdEntries = 0;
    summaries.forEach((s) => {
      if (s && s.id) {
        const sid = String(s.id);
        summaryIds.add(sid);
        summaryById.set(sid, s);
      } else {
        noIdEntries++;
      }
    });

    const { driftedOwnedIds, driftedSummaryIds } = matchDriftedSummaryAndServerTasks(
      owned,
      summaries
    );

    const computedForAudit =
      owned.length > 0
        ? calculateProjectComputedDates({ ...p, taskSummaries: [] }, owned, st.delegationGroups || [])
        : null;
    const expectedSummaries = computedForAudit?.taskSummaries || [];
    const hasParentOrRollupDrift = expectedSummaries.some((es: any) => {
      if (!es?.id) return false;
      const cur = summaryById.get(String(es.id));
      if (!cur) return true;
      return (
        (cur.parentTaskId || '') !== (es.parentTaskId || '') ||
        Boolean(cur.isModularParent) !== Boolean(es.isModularParent) ||
        (cur.start || '') !== (es.start || '') ||
        (cur.finish || '') !== (es.finish || '')
      );
    });

    // Tasks on Firestore that are neither in summaryIds nor matched as ID-drifted pairs are true excess tasks
    const missingInSummary = [...expectedSummaryIds].filter(
      (id) => !summaryIds.has(id) && !driftedOwnedIds.has(id)
    );
    // Summaries whose ID is not on Firestore AND not merely an ID-drifted entry of an existing Firestore task
    const ghostInSummary = [...summaryIds].filter(
      (id) => !ownedIds.has(id) && !driftedSummaryIds.has(id)
    );
    const hasIdDrift = driftedOwnedIds.size > 0 || driftedSummaryIds.size > 0;
    const countMismatch = Number(p.taskCount ?? 0) !== owned.length || summaries.length !== owned.length;
    const summaryIssue =
      missingInSummary.length > 0 ||
      ghostInSummary.length > 0 ||
      hasIdDrift ||
      noIdEntries > 0 ||
      countMismatch ||
      hasParentOrRollupDrift;

    const localOwned = localOwner.get(pid) || [];
    const localIds = new Set(localOwned.map((t) => t.id));
    const loadedLocally = localOwned.length > 0;
    const missingLocal = loadedLocally ? [...ownedIds].filter((id) => !localIds.has(id)) : [];
    const ghostLocal = loadedLocally
      ? localOwned.filter((t) => !serverTasksById.has(t.id) && !isRecent(t)).map((t) => t.id)
      : [];
    const lp = localProjectsById.get(pid);
    const localProjectStale = lp
      ? Number(lp.taskCount ?? 0) !== Number(p.taskCount ?? 0) ||
        (lp.taskSummaries?.length ?? 0) !== summaries.length
      : false;
    const deviceIssue = missingLocal.length > 0 || ghostLocal.length > 0 || localProjectStale;

    if (summaryIssue || deviceIssue) {
      issues.push({
        projectId: pid,
        code: String(p.code || ''),
        store: String(p.store || ''),
        year: String(p.year ?? ''),
        serverTaskCount: owned.length,
        summaryTaskCount: Number(p.taskCount ?? 0),
        summaryEntryCount: summaries.length,
        missingInSummary,
        ghostInSummary,
        noIdEntries,
        countMismatch,
        summaryIssue,
        loadedLocally,
        missingLocal,
        ghostLocal,
        localProjectStale,
        deviceIssue,
      });
    }
  });

  issues.sort((a, b) => a.code.localeCompare(b.code));
  return {
    generatedAt: Date.now(),
    projectCount: projects.length,
    taskCount: serverTasks.length,
    orphanCount,
    ambiguousCount,
    issues,
    internal: { projects: projectsById, ownerTasks, serverTasksById },
  };
}

/**
 * Đồng bộ hai chiều Summary ⇄ Firestore (taka_tasks & taka_projects):
 * Khôi phục task thực sự thiếu trên Firestore từ Summary, tự động hàn gắn ID drift mà không tạo task trùng,
 * chuẩn hóa rollup cha-con & ghi Mass Batch song song.
 */
export async function repairServerSummaries(
  report: AuditReport,
  onProgress?: (done: number, total: number) => void
): Promise<{ fixed: number; skippedEmpty: number; backfilledTasks?: number }> {
  if (Date.now() - report.generatedAt > 10 * 60 * 1000) {
    throw new Error('Báo cáo đã cũ hơn 10 phút. Hãy chạy kiểm tra lại trước khi sửa.');
  }
  const targets = report.issues.filter((r) => r.summaryIssue);
  if (targets.length === 0) return { fixed: 0, skippedEmpty: 0, backfilledTasks: 0 };

  const { doc } = await import('firebase/firestore');
  const { writeBatch } = await import('./firestoreWrites');
  const { recordBatchDeltas } = await import('./deltaSyncService');
  const { isTaskDeletedInTracker } = await import('./taskDeletedTracker');
  const { markExplicitDelta } = await import('./autoDeltaQueue');

  let fixed = 0,
    skippedEmpty = 0,
    backfilledTasks = 0;
  const nowIso = new Date().toISOString();
  const batchOps: { ref: any; data: any }[] = [];
  const deltaItems: any[] = [];
  const localTasksToUpsert: Task[] = [];
  const staleDriftedTaskIdsToRemove = new Set<string>();
  const updatedServerProjects = new Map<string, Project>();
  const delegationGroups = useAppStore.getState().delegationGroups || [];

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const serverProject = report.internal.projects.get(row.projectId);
    if (!serverProject) continue;

    const owned = [...(report.internal.ownerTasks.get(row.projectId) || [])];
    const ownedById = new Map<string, Task>(owned.map((t) => [String(t.id), t]));
    const rawSummaries: any[] = Array.isArray(serverProject.taskSummaries)
      ? (serverProject.taskSummaries as any[])
      : [];

    const { driftedSummaryIds, summaryIdToOwnedTask } = matchDriftedSummaryAndServerTasks(
      owned,
      rawSummaries
    );

    // Record drifted summary IDs so any local ghost copy under the old ID is purged
    driftedSummaryIds.forEach((staleId) => {
      staleDriftedTaskIdsToRemove.add(staleId);
      markTasksDeleted([staleId], row.projectId);
    });

    rawSummaries.forEach((s, idx) => {
      if (!s || !s.id) return;
      const sid = String(s.id);
      if (ownedById.has(sid) || isTaskDeletedInTracker(sid, row.projectId)) return;
      // Never backfill a summary entry if it is merely a drifted ID of an existing Firestore task!
      if (driftedSummaryIds.has(sid) || summaryIdToOwnedTask.has(sid)) return;
      if (!s.name && !s.start && !s.finish && !s.taskCodePhu) return;

      const taskId = sid.startsWith('ts_')
        ? `t_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        : sid;
      const numYear = Number(serverProject.year);
      const restoredTask: Task = {
        id: taskId,
        projectId: String(serverProject.id),
        projectCode: String(serverProject.code || ''),
        projectStore: serverProject.store,
        projectYear: !isNaN(numYear) && numYear > 0 ? numYear : (serverProject.year as any),
        name: String(s.name || ''),
        start: String(s.start || ''),
        finish: String(s.finish || s.start || ''),
        baselineStart: String(s.baselineStart || s.start || ''),
        baselineFinish: String(s.baselineFinish || s.finish || s.start || ''),
        duration: s.duration !== undefined && s.duration !== null ? String(s.duration) : '0',
        durationManual: Boolean(s.durationManual),
        finishManual: Boolean(s.finishManual),
        runningStatus: s.runningStatus || 'Not Started',
        approval: s.approval || 'Not Approved',
        party: String(s.party || serverProject.party || 'Takashimaya'),
        predecessor: String(s.predecessor || ''),
        taskCodePhu: String(s.taskCodePhu || ''),
        orderIndex: typeof s.orderIndex === 'number' ? s.orderIndex : idx,
        ...(s.parentTaskId ? { parentTaskId: String(s.parentTaskId) } : {}),
        ...(s.isModularParent !== undefined ? { isModularParent: Boolean(s.isModularParent) } : {}),
        ...(s.delegation !== undefined ? { delegation: Boolean(s.delegation) } : {}),
        ...(s.realtimeUpdate !== undefined ? { realtimeUpdate: Boolean(s.realtimeUpdate) } : {}),
        updatedAt: s.updatedAt || nowIso,
      };
      owned.push(restoredTask);
      ownedById.set(taskId, restoredTask);
      localTasksToUpsert.push(restoredTask);
      backfilledTasks++;

      batchOps.push({
        ref: doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId),
        data: restoredTask,
      });
      deltaItems.push({
        docId: taskId,
        collectionName: 'taka_tasks',
        action: 'create',
        data: restoredTask,
        year: serverProject.year ? String(serverProject.year) : undefined,
      });
    });

    const computed = calculateProjectComputedDates(
      { ...serverProject, taskSummaries: [] } as Project,
      owned,
      delegationGroups
    );

    (computed.taskSummaries || []).forEach((es: any) => {
      if (!es?.id) return;
      const existingTask = ownedById.get(String(es.id));
      if (!existingTask) return;
      const parentChanged =
        Boolean(existingTask.isModularParent) !== Boolean(es.isModularParent) ||
        (Boolean(es.isModularParent) &&
          ((existingTask.start || '') !== (es.start || '') ||
            (existingTask.finish || '') !== (es.finish || '')));
      if (parentChanged) {
        const patchedParent: Task = {
          ...existingTask,
          start: es.start || existingTask.start,
          finish: es.finish || existingTask.finish,
          duration: es.duration ?? existingTask.duration,
          isModularParent: Boolean(es.isModularParent),
          updatedAt: nowIso,
        };
        localTasksToUpsert.push(patchedParent);
        batchOps.push({
          ref: doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', patchedParent.id),
          data: {
            start: patchedParent.start,
            finish: patchedParent.finish,
            duration: patchedParent.duration,
            isModularParent: patchedParent.isModularParent,
            updatedAt: nowIso,
          },
        });
      }
    });

    const cleanSummaries = (computed.taskSummaries || []).map((ts: any) => {
      const item: Record<string, any> = {};
      for (const [k, v] of Object.entries(ts)) {
        if (v !== undefined && v !== null && v !== '' && v !== false && k !== '_isVirtualSummary')
          item[k] = v;
      }
      return item;
    });

    const projPayload: Record<string, any> = {
      computedTakStart: computed.computedTakStart,
      computedTakCompl: computed.computedTakCompl,
      computedOpening: computed.computedOpening,
      computedPlanProgress: computed.computedPlanProgress,
      computedActProgress: computed.computedActProgress,
      taskCount: computed.taskCount ?? cleanSummaries.length,
      taskSummaries: cleanSummaries,
      updatedAt: nowIso,
    };

    batchOps.push({
      ref: doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', row.projectId),
      data: projPayload,
    });
    deltaItems.push({
      docId: row.projectId,
      collectionName: 'taka_projects',
      action: 'update',
      isPatch: true,
      data: projPayload,
      year: serverProject.year ? String(serverProject.year) : undefined,
    });
    updatedServerProjects.set(row.projectId, { ...serverProject, ...projPayload } as Project);
    fixed++;
  }

  if (batchOps.length > 0) {
    if (deltaItems.length > 0) markExplicitDelta(deltaItems);
    const CHUNK = 400;
    const commits: Promise<any>[] = [];
    for (let i = 0; i < batchOps.length; i += CHUNK) {
      const b = writeBatch(db);
      batchOps.slice(i, i + CHUNK).forEach((op) => b.set(op.ref, op.data, { merge: true }));
      commits.push(b.commit());
    }
    await Promise.all(commits);
    onProgress?.(targets.length, targets.length);
    if (deltaItems.length > 0) {
      const user = useAppStore.getState().currentUser;
      recordBatchDeltas(deltaItems, user?.email || user?.username || 'summary_audit').catch(() => {});
    }
  }

  const st = useAppStore.getState();
  if (staleDriftedTaskIdsToRemove.size > 0) {
    for (const staleId of staleDriftedTaskIdsToRemove) {
      await deleteLocalRecord('taka_tasks', staleId).catch(() => {});
    }
    st.setTasks((st.tasks || []).filter((t) => !staleDriftedTaskIdsToRemove.has(t.id)));
  }
  if (localTasksToUpsert.length > 0) {
    st.optimisticUpdateTasks(localTasksToUpsert);
    await bulkPersistTasks(localTasksToUpsert).catch(() => {});
  }
  if (updatedServerProjects.size > 0) {
    st.setProjects(
      (st.projects || []).map((p) =>
        p.id && updatedServerProjects.has(String(p.id))
          ? ({ ...p, ...updatedServerProjects.get(String(p.id)) } as Project)
          : p
      )
    );
    await bulkPersistProjects(Array.from(updatedServerProjects.values())).catch(() => {});
  }

  return { fixed, skippedEmpty, backfilledTasks };
}


