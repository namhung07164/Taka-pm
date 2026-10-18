import { Project, Task, DelegationGroup } from "../types";
import { useAppStore } from "../store/useAppStore";
import { getStatus, resolveActualStatus } from "./utils";
import { calculateProjectComputedDates, syncProjectDatesToFirestore, getTasksForProject, matchProjectCode } from "./projectDatesService";

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

export function isDelegationGroupBelongsToProject(
  g: DelegationGroup | undefined | null,
  p: Partial<Project> | undefined | null,
  matchedTaskIds?: Set<string>
): boolean {
  if (!g || !p || g.isDeleted || (p as any).isDeleted) return false;

  if (g.parentTaskId && matchedTaskIds && matchedTaskIds.has(g.parentTaskId)) {
    return true;
  }

  const gProjId = g.projectId ? String(g.projectId).trim() : '';
  const pId = p.id ? String(p.id).trim() : '';
  if (gProjId && pId && gProjId !== pId) return false;

  const gStore = g.projectStore ? String(g.projectStore).trim().toUpperCase() : '';
  const pStore = p.store ? String(p.store).trim().toUpperCase() : '';
  if (gStore && pStore && gStore !== pStore) return false;

  const gYear = g.projectYear !== undefined && g.projectYear !== null ? String(g.projectYear).trim() : '';
  const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';
  if (gYear && pYear && gYear !== pYear) return false;

  if (gProjId && pId && gProjId === pId) return true;

  if (!g.projectCode || !p.code) return false;
  const gCode = String(g.projectCode).trim().toLowerCase();
  return gCode === String(p.code).trim().toLowerCase() || matchProjectCode(g.projectCode, p.code);
}

/**
 * Tính toán trạng thái thực tế (Actual Status) của Dự án dựa trên các Delegation Groups và Tasks.
 * Ưu tiên: Rejected > Completed > Pending Completed > In Progress > Planned.
 */
export function computeProjectActStatus(
  p: Project,
  delegationGroups: DelegationGroup[] = [],
  matchedTasks: Task[] = []
): string {
  const pAny = p as any;
  if (pAny.actStatus) return String(pAny.actStatus);
  if (pAny.actualStatus) return String(pAny.actualStatus);

  if (delegationGroups && delegationGroups.length > 0) {
    const matchedTaskIds = new Set(matchedTasks.map(t => t.id).filter(Boolean));
    const pGroups = delegationGroups.filter(g => isDelegationGroupBelongsToProject(g, p, matchedTaskIds));

    if (pGroups.length > 0) {
      const statuses = pGroups.map(g => {
        if (g.actStatus) return g.actStatus;
        return resolveActualStatus(p.computedStatus || 'On process', g.subTasks || []).label;
      });
      if (statuses.some(s => s === 'Rejected' || s === 'Correction Needed')) return 'Rejected';
      if (statuses.every(s => s === 'Completed')) return 'Completed';
      if (statuses.some(s => s === 'Pending Completed' || s === 'Pending Approval' || s === 'Review Late')) return 'Pending Completed';
      if (statuses.some(s => s === 'In Progress' || s === 'On Process' || s === 'Delayed' || s === 'Accepted')) return 'In Progress';
      return statuses[0] || 'Planned';
    }
  }

  if (p.computedActProgress === 100) return 'Completed';
  const plStatus = p.computedStatus || getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
  if (plStatus === 'Completed') return 'Completed';
  if (plStatus === 'Canceled') return 'Cancel';
  if (p.computedActProgress && p.computedActProgress > 0) return 'In Progress';
  if (plStatus === 'On process' || plStatus === 'Handover') return 'In Progress';
  return 'Planned';
}

/**
 * Lệnh cưỡng bức đồng bộ lại Task Count từ Firestore cho toàn bộ dự án
 * (Dùng để sửa lỗi iPad/iPhone lệch count khi snapshot cache bị cũ)
 */
export async function syncAllProjectsTaskCountFromFirestore(): Promise<{ updatedCount: number; totalProjects: number }> {
  try {
    const { projects, tasks, delegationGroups } = useAppStore.getState();
    const totalProjects = projects.length;
    let updatedCount = 0;

    for (const p of projects) {
      if (!p.id || p.isDeleted) continue;

      const pTasks = getTasksForProject(p, tasks);
      const computed = calculateProjectComputedDates(p, pTasks, delegationGroups);

      // Do not wipe out projects whose tasks have not been loaded into memory yet
      if (pTasks.length === 0 && ((p.taskCount || 0) > 0 || (p.taskSummaries?.length || 0) > 0)) {
        continue;
      }

      const hasDiscrepancy =
        p.taskCount !== computed.taskCount ||
        (p.taskSummaries?.length || 0) !== (computed.taskSummaries?.length || 0);

      if (hasDiscrepancy) {
        await syncProjectDatesToFirestore(p.id, computed);
        updatedCount++;
      }
    }

    return { updatedCount, totalProjects };
  } catch (err: any) {
    console.error("[syncAllProjectsTaskCountFromFirestore] Sync Failed", err);
    useAppStore.getState().setToast({ title: "Sync Failed", message: err.message || "Error syncing task counts", type: "error" });
    return { updatedCount: 0, totalProjects: 0 };
  }
}

