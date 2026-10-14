import { Project, Task, DelegationGroup } from "../types";
import { useAppStore } from "../store/useAppStore";
import { calculateProjectComputedDates, syncProjectDatesToFirestore } from "./projectDatesService";

export const BOOT_SYNC_GUARD_MS = 15000; // 15 seconds boot sync guard

const bootTime = Date.now();

export function getAppBootAgeMs(): number {
  return Date.now() - bootTime;
}

let isBackfilling = false;

function matchProjectTasks(project: Project, tasks: Task[]): Task[] {
  const pStore = project.store ? String(project.store).trim().toLowerCase() : '';
  const pYear = project.year !== undefined && project.year !== null ? String(project.year).trim() : '';
  const pCode = String(project.code || '').trim().toLowerCase();

  return tasks.filter((t) => {
    if (!t || t.isDeleted) return false;
    const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
    const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';

    if (t.projectId && String(t.projectId) === String(project.id)) {
      if (pStore && tStore && pStore !== tStore) return false;
      if (pYear && tYear && pYear !== tYear) return false;
      return true;
    }

    if (!t.projectCode || !pCode) return false;
    const tCode = String(t.projectCode).trim().toLowerCase();
    if (tCode !== pCode) return false;

    if (pStore && tStore && pStore !== tStore) return false;
    if (pYear && tYear && pYear !== tYear) return false;

    return true;
  });
}

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
      const pTasks = matchProjectTasks(project, tasks);
      const computed = calculateProjectComputedDates(project, pTasks, delegationGroups);
      await syncProjectDatesToFirestore(project.id, computed);
    }
  } catch (err) {
    console.warn("[projectDatesBackfill] Backfill error:", err);
  } finally {
    isBackfilling = false;
  }
}

/**
 * Syncs task counts for all projects to Firestore if discrepancies exist.
 */
export async function syncAllProjectsTaskCountsToFirestore(
  onProgressOrProjects?: ((processed: number, total: number) => void) | Project[],
  tasksArg?: Task[],
  progressCb?: (processed: number, total: number) => void
): Promise<{ updatedCount: number; totalProjects: number }> {
  let projects: Project[];
  let tasks: Task[];
  let onProgress: ((processed: number, total: number) => void) | undefined;

  if (Array.isArray(onProgressOrProjects)) {
    projects = onProgressOrProjects;
    tasks = tasksArg || useAppStore.getState().tasks || [];
    onProgress = progressCb;
  } else {
    projects = useAppStore.getState().projects || [];
    tasks = useAppStore.getState().tasks || [];
    onProgress = typeof onProgressOrProjects === "function" ? onProgressOrProjects : undefined;
  }

  let updatedCount = 0;
  const totalProjects = projects.length;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (onProgress) onProgress(i + 1, totalProjects);
    if (!p || !p.id) continue;

    const pTasks = matchProjectTasks(p, tasks);

    if (p.taskCount !== pTasks.length) {
      updatedCount++;
      const computed = calculateProjectComputedDates(p, pTasks, useAppStore.getState().delegationGroups);
      await syncProjectDatesToFirestore(p.id, computed);
    }
  }

  return { updatedCount, totalProjects };
}
