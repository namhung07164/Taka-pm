import { Project, AppUser } from '../../types';
import { calculateProjectComputedDates } from '../../lib/projectDatesService';
import { executeMassBatchOperations, MassWriteOp } from '../../lib/massBatchWriteEngine';

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
  const nowIso = new Date().toISOString();

  const writeOps: MassWriteOp[] = [];
  const projDeltaItems: any[] = [];

  for (const p of affectedProjects) {
    if (!p?.id) continue;
    const computed = computedByProjectId.get(p.id);
    if (!computed) continue;
    const cleanSummaries = (computed.taskSummaries || []).map((ts: any) => {
      const item: Record<string, any> = {};
      for (const [k, v] of Object.entries(ts)) {
        if (v !== undefined) item[k] = v;
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

  if (writeOps.length === 0) return;

  await executeMassBatchOperations(writeOps, {
    maxOpsPerBatch: 80,
    suppressAutoDelta: true,
  });

  await recordBatchDeltas(projDeltaItems, activeUser?.username || activeUser?.id);
}

