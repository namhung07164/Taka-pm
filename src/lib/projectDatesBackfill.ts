import { doc, collection, getDocs } from "firebase/firestore";
import { writeBatch } from "./firestoreWrites";
import { db, APP_ID } from "./firebase";
import { Project, Task, DelegationGroup } from "../types";
import {
  getTasksForProject,
  calculateProjectComputedDates,
  syncProjectDatesToFirestore,
} from "./projectDatesService";

const APP_BOOT_TIME = Date.now();
export const BOOT_SYNC_GUARD_MS = 15000;

export function getAppBootAgeMs(): number {
  return Date.now() - APP_BOOT_TIME;
}

let hasBackfilledInSession = false;

/**
 * Tự động backfill trường computed dates cho các Project trong Firestore
 * nếu Project đó chưa có computedTakCompl / computedOpening.
 * Chỉ chạy 1 lần duy nhất trong toàn bộ phiên làm việc của user để tiết kiệm write.
 */
export async function backfillMissingProjectDates(
  projects: Project[],
  tasks: Task[],
  delegationGroups: DelegationGroup[] = []
): Promise<number> {
  if (getAppBootAgeMs() < BOOT_SYNC_GUARD_MS) return 0;
  if (hasBackfilledInSession || !projects.length || !tasks.length) return 0;
  hasBackfilledInSession = true;

  let count = 0;
  for (const p of projects) {
    if (!p.id || !p.code) continue;

    const pTasks = getTasksForProject(p, tasks);
    if (pTasks.length === 0) continue;

    if (p.taskCount && pTasks.length < p.taskCount) continue;

    const computed = calculateProjectComputedDates(p, pTasks, delegationGroups);

    const needsUpdate =
      !p.computedTakCompl ||
      (!p.computedTakStart && Boolean(computed.computedTakStart)) ||
      (!p.computedOpening && Boolean(computed.computedOpening)) ||
      p.computedPlanProgress === undefined ||
      p.computedActProgress === undefined;

    if (needsUpdate) {
      count++;
      await syncProjectDatesToFirestore(p.id, computed);
    }
  }

  if (count > 0) {
    console.info(`[projectDatesBackfill] Backfilled computed dates for ${count} projects`);
  }
  return count;
}

/**
 * Đồng bộ toàn bộ taskCount và thông số tiến độ cho toàn bộ Dự án trên Firestore (Chạy 1 lần cho toàn hệ thống).
 */
export async function syncAllProjectsTaskCountsToFirestore(
  onProgress?: (processed: number, total: number) => void
): Promise<{ updatedCount: number; totalProjects: number }> {
  try {
    const projectsCol = collection(db, "artifacts", APP_ID, "public", "data", "taka_projects");
    const tasksCol = collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks");
    const delegationsCol = collection(db, "artifacts", APP_ID, "public", "data", "taka_delegation_groups");

    const [projectsSnap, tasksSnap, delegationsSnap] = await Promise.all([
      getDocs(projectsCol),
      getDocs(tasksCol),
      getDocs(delegationsCol),
    ]);

    const allProjects: Project[] = [];
    projectsSnap.forEach((d) => {
      const data = d.data() as any;
      if (!data.isDeleted) {
        allProjects.push({ id: d.id, ...data });
      }
    });

    const allTasks: Task[] = [];
    tasksSnap.forEach((d) => {
      const data = d.data() as any;
      if (!data.isDeleted) {
        allTasks.push({ id: d.id, ...data });
      }
    });

    const allDelegations: DelegationGroup[] = [];
    delegationsSnap.forEach((d) => {
      const data = d.data() as any;
      if (!data.isDeleted) {
        allDelegations.push({ id: d.id, ...data });
      }
    });

    let updatedCount = 0;
    const batchSize = 400;
    let currentBatch = writeBatch(db);
    let batchOpCount = 0;

    const total = allProjects.length;

    for (let i = 0; i < total; i++) {
      const p = allProjects[i];
      if (!p.id || !p.code) continue;

      const pTasks = getTasksForProject(p, allTasks);
      const computed = calculateProjectComputedDates(p, pTasks, allDelegations);

      const needsUpdate =
        p.taskCount === undefined ||
        p.taskCount !== computed.taskCount ||
        !p.computedTakCompl ||
        p.computedTakCompl !== computed.computedTakCompl ||
        !p.computedTakStart ||
        p.computedTakStart !== computed.computedTakStart ||
        p.computedPlanProgress === undefined ||
        p.computedActProgress === undefined;

      if (needsUpdate) {
        const pRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", p.id);
        currentBatch.update(pRef, {
          updatedAt: new Date().toISOString(),
          taskCount: computed.taskCount ?? 0,
          taskSummaries: computed.taskSummaries || [],
          computedTakStart: computed.computedTakStart || "",
          computedTakCompl: computed.computedTakCompl || "",
          computedOpening: computed.computedOpening || "",
          computedPlanProgress: computed.computedPlanProgress ?? 0,
          computedActProgress: computed.computedActProgress ?? 0,
        });
        batchOpCount++;
        updatedCount++;

        if (batchOpCount >= batchSize) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          batchOpCount = 0;
        }
      }

      if (onProgress && (i % 10 === 0 || i === total - 1)) {
        onProgress(i + 1, total);
      }
    }

    if (batchOpCount > 0) {
      await currentBatch.commit();
    }

    console.info(`[projectDatesBackfill] Successfully synchronized taskCount for ${updatedCount}/${total} projects.`);
    return { updatedCount, totalProjects: total };
  } catch (error) {
    console.error("[projectDatesBackfill] Error syncing all project taskCounts:", error);
    throw error;
  }
}
