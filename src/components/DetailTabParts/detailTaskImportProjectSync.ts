import { Project, AppUser } from '../../types';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { calculateProjectComputedDates } from '../../lib/projectDatesService';

/**
 * Commits updated project rollup summaries (taskSummaries, dates, progress) to Firestore & Delta bus.
 */
export async function syncAffectedProjectsSummaries(
  affectedProjects: Project[],
  computedByProjectId: Map<string, ReturnType<typeof calculateProjectComputedDates>>,
  activeUser?: AppUser | null
): Promise<void> {
  if (affectedProjects.length === 0) return;
  const { recordBatchDeltas } = await import('../../lib/deltaSyncService');
  const { markExplicitDelta } = await import('../../lib/autoDeltaQueue');
  const nowIso = new Date().toISOString();
  const PROJ_BATCH_LIMIT = 100;

  for (let i = 0; i < affectedProjects.length; i += PROJ_BATCH_LIMIT) {
    const projChunk = affectedProjects.slice(i, i + PROJ_BATCH_LIMIT).filter(p => Boolean(p?.id));
    if (projChunk.length === 0) continue;

    markExplicitDelta(projChunk.map(p => ({ docId: p.id, collectionName: 'taka_projects' as const })));
    const pBatch = writeBatch(db);
    const projDeltaItems: any[] = [];

    projChunk.forEach(p => {
      const computed = computedByProjectId.get(p.id);
      if (!computed) return;
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

      const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', p.id);
      pBatch.set(pRef, updatePayload, { merge: true });
      projDeltaItems.push({
        docId: p.id,
        collectionName: 'taka_projects' as const,
        action: 'update' as const,
        isPatch: true,
        data: updatePayload,
        year: p.year ? String(p.year) : undefined,
      });
    });

    try {
      await pBatch.commit();
      await recordBatchDeltas(projDeltaItems, activeUser?.username || activeUser?.id);
    } catch (err) {
      console.warn('[detailTaskImportProjectSync] Project summary batch commit failed:', err);
    }
  }
}
