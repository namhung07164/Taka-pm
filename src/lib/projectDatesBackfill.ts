import { Project, Task, DelegationGroup } from "../types";
import { useAppStore } from "../store/useAppStore";
import { calculateProjectComputedDates, syncProjectDatesToFirestore, getTasksForProject } from "./projectDatesService";

export const BOOT_SYNC_GUARD_MS = 15000; // 15 seconds boot sync guard

const bootTime = Date.now();

export function getAppBootAgeMs(): number {
  return Date.now() - bootTime;
}

let isBackfilling = false;

/**
 * Backfills missing project computed dates for projects that don't have them pre-computed.
 */
export async function backfillMissingProjectDates(
  projects: Project[],
  tasks: Task[],
  delegationGroups: DelegationGroup[] = []
): Promise<void> {
  if (isBackfilling || !Array.isArray(projects) || projects.length === 0) return;
  isBackfilling = true;

  try {
    const uncomputed = projects.filter(
      (p) => p && p.id && (!p.computedTakStart || !p.computedTakCompl)
    );

    for (const project of uncomputed) {
      if (!project.id) continue;
      const pTasks = getTasksForProject(project, tasks);
      const computed = calculateProjectComputedDates(project, pTasks, delegationGroups);
      await syncProjectDatesToFirestore(project.id, computed);
    }
  } catch (err) {
    console.warn("[projectDatesBackfill] Backfill error:", err);
  } finally {
    isBackfilling = false;
  }
}
