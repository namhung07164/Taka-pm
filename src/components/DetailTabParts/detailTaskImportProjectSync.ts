import { Project, Task, AppUser, TakaDeltaItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { calculateProjectComputedDates } from '../../lib/projectDatesService';
import { executeMassBatchOperations, MassWriteOp } from '../../lib/massBatchWriteEngine';
import { markProjectTasksHydrated } from '../../lib/utils';

/**
 * Checks whether an imported task row has any meaningful business field change compared
 * to its pre-import state. Prevents re-writing unchanged existing tasks during CSV imports.
 */
export function hasImportedTaskMeaningfullyChanged(
  prev: Task | undefined,
  next: Task,
  isNew: boolean
): boolean {
  if (isNew || !prev) return true;
  const str = (v: any) => (v === undefined || v === null ? '' : String(v).trim());
  if (str(prev.name) !== str(next.name)) return true;
  if (str(prev.start) !== str(next.start)) return true;
  if (str(prev.finish) !== str(next.finish)) return true;
  if (str(prev.duration) !== str(next.duration)) return true;
  if (str(prev.party) !== str(next.party)) return true;
  if (str(prev.predecessor) !== str(next.predecessor)) return true;
  if (str(prev.parentTaskId) !== str(next.parentTaskId)) return true;
  if (Boolean(prev.isModularParent) !== Boolean(next.isModularParent)) return true;
  if (str(prev.taskCodePhu) !== str(next.taskCodePhu)) return true;
  if (Number(prev.orderIndex ?? 0) !== Number(next.orderIndex ?? 0)) return true;
  if (Boolean(prev.delegation) !== Boolean(next.delegation)) return true;
  if (Boolean(prev.realtimeUpdate) !== Boolean(next.realtimeUpdate)) return true;
  if (str(prev.runningStatus) !== str(next.runningStatus)) return true;
  if (str(prev.approval) !== str(next.approval)) return true;
  if (str(prev.projectId) !== str(next.projectId)) return true;
  if (str(prev.projectCode) !== str(next.projectCode)) return true;
  if (str(prev.projectStore) !== str(next.projectStore)) return true;
  if (str(prev.projectYear) !== str(next.projectYear)) return true;
  if (str(prev.baselineStart) !== str(next.baselineStart)) return true;
  if (str(prev.baselineFinish) !== str(next.baselineFinish)) return true;
  const prevComments = Array.isArray(prev.comments) ? prev.comments : [];
  const nextComments = Array.isArray(next.comments) ? next.comments : [];
  if (prevComments.length !== nextComments.length) return true;
  if (prevComments.length > 0 && JSON.stringify(prevComments) !== JSON.stringify(nextComments)) {
    return true;
  }
  return false;
}

/**
 * Updates LoadedMarkers, Hydration flags, Dexie LocalDB, and Zustand Store in the exact order
 * that prevents `useTasksHydration` from firing redundant Firestore listeners or invalidations
 * for newly created task IDs before the Firestore batch commit completes.
 */
export async function commitImportedStateToStoreAndLocal(
  hydratedRealTasks: Task[],
  finalTasksToSave: Task[],
  touchedProjectsForPersistence: Project[],
  finalAffectedProjects: Project[]
): Promise<void> {
  const storeState = useAppStore.getState();

  // 1. Pre-mark affected projects as hydrated in memory and LoadedMarkers BEFORE updating project taskSummaries in Zustand
  try {
    const [{ markLoaded }, { bulkPersistProjects, bulkPersistTasks }] = await Promise.all([
      import('../../lib/loadedMarkers'),
      import('../../lib/localDb'),
    ]);
    await Promise.all([
      ...touchedProjectsForPersistence.map((proj) => {
        if (proj.id) {
          markProjectTasksHydrated(String(proj.id));
          return markLoaded('tasks_proj', String(proj.id)).catch(() => {});
        }
        return Promise.resolve();
      }),
      touchedProjectsForPersistence.length > 0
        ? bulkPersistProjects(touchedProjectsForPersistence).catch(() => {})
        : Promise.resolve(),
      finalTasksToSave.length > 0
        ? bulkPersistTasks(finalTasksToSave).catch(() => {})
        : Promise.resolve(),
    ]);
  } catch {
    touchedProjectsForPersistence.forEach((proj) => {
      if (proj.id) markProjectTasksHydrated(String(proj.id));
    });
  }

  // 2. Update tasks in Zustand first so all 48 real tasks exist in memory before project summaries update
  storeState.optimisticUpdateTasks([...hydratedRealTasks, ...finalTasksToSave]);

  // 3. Update projects & expandedProjectIds in one atomic Zustand state transition
  const storeProjects = useAppStore.getState().projects || [];
  const mergedProjectsMap = new Map<string, Project>(storeProjects.map((p) => [p.id, p]));
  touchedProjectsForPersistence.forEach((p) => mergedProjectsMap.set(p.id, p));
  const curExpanded = useAppStore.getState().expandedProjectIds || [];
  const affKeys = finalAffectedProjects.map((p) => String(p.id || p.code || '')).filter(Boolean);

  useAppStore.setState({
    projects: Array.from(mergedProjectsMap.values()).sort((a, b) => (a.no || 0) - (b.no || 0)),
    expandedProjectIds: Array.from(new Set([...curExpanded, ...affKeys])),
  });
}

/**
 * Builds MassWriteOp and TakaDeltaItem arrays for updated project rollup summaries
 * (taskSummaries, dates, progress) so they can be committed atomically alongside tasks.
 */
export function buildAffectedProjectsSyncOps(
  affectedProjects: Project[],
  computedByProjectId: Map<string, ReturnType<typeof calculateProjectComputedDates>>,
  nowIso: string = new Date().toISOString()
): { writeOps: MassWriteOp[]; projDeltaItems: TakaDeltaItem[] } {
  const writeOps: MassWriteOp[] = [];
  const projDeltaItems: TakaDeltaItem[] = [];

  for (const p of affectedProjects) {
    if (!p?.id) continue;
    const computed = computedByProjectId.get(String(p.id)) || computedByProjectId.get(p.id);
    if (!computed) continue;
    const cleanSummaries = (computed.taskSummaries || []).map((ts: any) => {
      const item: Record<string, any> = {};
      for (const [k, v] of Object.entries(ts)) {
        if (v !== undefined && v !== null && v !== '' && v !== false && k !== '_isVirtualSummary') {
          item[k] = v;
        }
      }
      return item;
    });
    const updatePayload: Record<string, any> = {
      updatedAt: nowIso,
      ...(computed.computedTakStart !== undefined ? { computedTakStart: computed.computedTakStart } : {}),
      ...(computed.computedTakCompl !== undefined ? { computedTakCompl: computed.computedTakCompl } : {}),
      ...(computed.computedOpening !== undefined ? { computedOpening: computed.computedOpening } : {}),
      ...(computed.computedPlanProgress !== undefined ? { computedPlanProgress: computed.computedPlanProgress } : {}),
      ...(computed.computedActProgress !== undefined ? { computedActProgress: computed.computedActProgress } : {}),
      ...(computed.taskCount !== undefined ? { taskCount: computed.taskCount } : {}),
      taskSummaries: cleanSummaries,
    };

    writeOps.push({
      collectionName: 'taka_projects',
      docId: String(p.id),
      action: 'set',
      data: updatePayload,
      merge: true,
    });

    projDeltaItems.push({
      docId: String(p.id),
      collectionName: 'taka_projects' as const,
      action: 'update' as const,
      isPatch: true,
      data: updatePayload,
      year: p.year ? String(p.year) : undefined,
      projectId: String(p.id),
      projectCode: p.code ? String(p.code) : undefined,
      projectStore: p.store ? String(p.store) : undefined,
    });
  }

  return { writeOps, projDeltaItems };
}

/**
 * Commits updated project rollup summaries (taskSummaries, dates, progress) to Firestore & Delta bus
 * with byte-aware chunking, retry backoff, and offline syncQueue fallback.
 */
export async function syncAffectedProjectsSummaries(
  affectedProjects: Project[],
  computedByProjectId: Map<string, ReturnType<typeof calculateProjectComputedDates>>,
  activeUser?: AppUser | null
): Promise<void> {
  if (affectedProjects.length === 0) return;
  const { recordBatchDeltas } = await import('../../lib/deltaSyncService');
  const { writeOps, projDeltaItems } = buildAffectedProjectsSyncOps(
    affectedProjects,
    computedByProjectId
  );

  if (writeOps.length === 0) return;

  await Promise.all([
    executeMassBatchOperations(writeOps, {
      maxOpsPerBatch: 45,
      suppressAutoDelta: true,
      skipLocalMirror: true,
    }),
    recordBatchDeltas(projDeltaItems, activeUser?.username || activeUser?.id),
  ]);
}
