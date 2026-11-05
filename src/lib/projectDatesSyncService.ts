import { setDoc } from "./firestoreWrites";
import { db, APP_ID } from "./firebase";
import { doc } from "firebase/firestore";
import { Project, Task } from "../types";
import { useAppStore } from "../store/useAppStore";
import {
  ComputedProjectDates,
  matchProjectCode,
  getTasksForProject,
  calculateProjectComputedDates,
} from "./projectDatesService";

/**
 * Cập nhật các trường computed dates lên document taka_projects trong Firestore
 * và cập nhật nhanh vào Zustand Store để giao diện phản hồi tức thời.
 * Đã tích hợp Dirty Check: Chỉ ghi vào Firestore khi có sự thay đổi thực sự
 * về mốc thời gian (start, finish/compl, opening), tiến độ hoặc số lượng task.
 */
interface PendingProjectSyncEntry {
  payload: Record<string, any>;
  year?: string;
  projectCode?: string;
  store?: string;
}

const pendingProjectSyncPayloads = new Map<string, PendingProjectSyncEntry>();
const inFlightProjectSyncSet = new Set<string>();

async function flushProjectSummarySync(projectId: string): Promise<void> {
  if (inFlightProjectSyncSet.has(projectId)) return;
  inFlightProjectSyncSet.add(projectId);
  try {
    const [{ markExplicitDelta }, { recordDelta }] = await Promise.all([
      import("./autoDeltaQueue"),
      import("./deltaSyncService"),
    ]);
    while (pendingProjectSyncPayloads.has(projectId)) {
      const next = pendingProjectSyncPayloads.get(projectId)!;
      pendingProjectSyncPayloads.delete(projectId);
      const projectRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", projectId);
      markExplicitDelta([{ docId: projectId, collectionName: "taka_projects" }]);
      await Promise.all([
        setDoc(projectRef, next.payload, { merge: true }),
        recordDelta({
          docId: projectId,
          collectionName: "taka_projects",
          action: "update",
          isPatch: true,
          data: next.payload,
          year: next.year,
          projectId,
          projectCode: next.projectCode,
          store: next.store,
        }).catch(() => {}),
      ]);
    }
  } catch (error) {
    console.error(`Error syncing computed dates for project ${projectId}:`, error);
  } finally {
    inFlightProjectSyncSet.delete(projectId);
    if (pendingProjectSyncPayloads.has(projectId)) {
      flushProjectSummarySync(projectId).catch(() => {});
    }
  }
}

export async function syncProjectDatesToFirestore(
  projectId: string,
  dates: ComputedProjectDates
): Promise<void> {
  if (!projectId) return;

  try {
    const { projects, setProjects } = useAppStore.getState();
    const existingProject = projects.find((p) => p.id === projectId);
    const existingCount = existingProject?.taskCount || existingProject?.taskSummaries?.length || 0;
    const existingSummaries = existingProject?.taskSummaries || [];

    const safeTaskSummaries = dates.taskSummaries !== undefined ? dates.taskSummaries : existingSummaries;
    const safeTaskCount = dates.taskCount !== undefined ? dates.taskCount : existingCount;

    const toSummariesSig = (list: any[]) =>
      (list || [])
        .map(
          (s: any, idx: number) =>
            `${s?.id || ""}:${s?.name || ""}:${s?.start || ""}:${s?.finish || ""}:${s?.duration ?? ""}:${s?.parentTaskId || ""}:${s?.isModularParent ? "1" : "0"}:${s?.taskCodePhu || ""}:${s?.runningStatus || ""}:${s?.approval || ""}:${s?.party || ""}:${s?.delegation ? "1" : ""}:${s?.predecessor || ""}:${s?.orderIndex ?? idx}`
        )
        .join("|");

    const hasChanged =
      !existingProject ||
      (existingProject.computedTakStart || "") !== (dates.computedTakStart || "") ||
      (existingProject.computedTakCompl || "") !== (dates.computedTakCompl || "") ||
      (existingProject.computedOpening || "") !== (dates.computedOpening || "") ||
      Number(existingProject.computedActProgress ?? 0) !== Number(dates.computedActProgress ?? 0) ||
      Number(existingProject.taskCount ?? 0) !== Number(safeTaskCount ?? dates.taskCount ?? 0) ||
      toSummariesSig(existingProject.taskSummaries || []) !== toSummariesSig(safeTaskSummaries || dates.taskSummaries || []);

    let updatedProjectObj: Project | null = null;
    if (existingProject) {
      const updated = projects.map((p) => {
        if (p.id === projectId) {
          updatedProjectObj = {
            ...p,
            ...dates,
            taskCount: safeTaskCount !== undefined ? safeTaskCount : dates.taskCount,
            taskSummaries: safeTaskSummaries !== undefined ? safeTaskSummaries : dates.taskSummaries,
          };
          return updatedProjectObj;
        }
        return p;
      });
      setProjects(updated);
      if (updatedProjectObj && hasChanged) {
        import("./localDb")
          .then(({ bulkPersistProjects }) => bulkPersistProjects([updatedProjectObj!]))
          .catch(() => {});
      }
    }

    if (!hasChanged) return;

    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (dates.computedTakStart !== undefined) updatePayload.computedTakStart = dates.computedTakStart;
    if (dates.computedTakCompl !== undefined) updatePayload.computedTakCompl = dates.computedTakCompl;
    if (dates.computedOpening !== undefined) updatePayload.computedOpening = dates.computedOpening;
    if (dates.computedPlanProgress !== undefined) updatePayload.computedPlanProgress = dates.computedPlanProgress;
    if (dates.computedActProgress !== undefined) updatePayload.computedActProgress = dates.computedActProgress;
    if (safeTaskCount !== undefined) updatePayload.taskCount = safeTaskCount;
    if (safeTaskSummaries !== undefined) {
      updatePayload.taskSummaries = safeTaskSummaries.map((ts: any) => {
        const item: Record<string, any> = {};
        for (const [k, v] of Object.entries(ts)) {
          if (v !== undefined && v !== null && v !== "" && v !== false && k !== "_isVirtualSummary") {
            item[k] = v;
          }
        }
        return item;
      });
    }

    pendingProjectSyncPayloads.set(projectId, {
      payload: updatePayload,
      year: existingProject?.year ? String(existingProject.year) : undefined,
      projectCode: existingProject?.code ? String(existingProject.code) : undefined,
      store: existingProject?.store ? String(existingProject.store) : undefined,
    });
    await flushProjectSummarySync(projectId);
  } catch (error) {
    console.error(`Error syncing computed dates for project ${projectId}:`, error);
  }
}

/**
 * Đồng bộ computed dates cho một dự án dựa trên projectCode, store, year và danh sách task hiện có.
 */
export async function syncProjectDatesByCode(
  projectCode: string,
  projectStore?: string,
  projectYear?: string | number,
  overrideTasks?: Task[],
  targetProjectId?: string
): Promise<void> {
  if (!projectCode && !targetProjectId) return;

  const { projects, tasks, delegationGroups } = useAppStore.getState();
  const project = projects.find((p) => {
    if (targetProjectId && String(p.id) === String(targetProjectId)) return true;
    if (targetProjectId && String(p.id) !== String(targetProjectId)) return false;
    return (
      (p.code === projectCode || matchProjectCode(p.code, projectCode)) &&
      (!projectStore || !p.store || String(p.store).trim().toLowerCase() === String(projectStore).trim().toLowerCase()) &&
      (!projectYear || !p.year || String(p.year).trim() === String(projectYear).trim())
    );
  });

  if (!project || !project.id) return;

  const currentTasks = overrideTasks || tasks;
  const projectTasks = getTasksForProject(project, currentTasks);

  const dates = calculateProjectComputedDates(project, projectTasks, delegationGroups);
  await syncProjectDatesToFirestore(project.id, dates);
}
