import { Project, Task, TakaDeltaItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { db, APP_ID, writeBatch } from '../../lib/firebase';
import { doc } from 'firebase/firestore';
import { recordBatchDeltas } from '../../lib/deltaSyncService';
import { 
  sortTasksByPredecessorsAndDates, 
  updatePredecessorsStrings, 
  healAllTasksPredecessors, 
  buildTaskNoMap,
  getPredecessorCodeUpdates
} from '../../lib/ganttUtils';
import { reorderTasksStateUnified } from '../../lib/taskStateService';

export async function executeSortSubTasks(
  p: Project,
  groupTasks: Task[],
  realTasks: Task[],
  projects: Project[]
): Promise<void> {
  try {
    const realGroupTasks = groupTasks.filter(
      (gt) => gt && !(gt as any)._isVirtualSummary && !String(gt.id || '').startsWith('ts_')
    );
    if (realGroupTasks.length === 0) return;

    const pCodeLower = String(p.code || '').trim().toLowerCase();
    const isTaskInScope = (t: Task) => {
      if (!t || t.isDeleted) return false;
      if (p.id && t.projectId === p.id) return true;
      if (String(t.projectCode || '').trim().toLowerCase() === pCodeLower) return true;
      if (pCodeLower && t.predecessor && t.predecessor.toLowerCase().includes(pCodeLower)) return true;
      return false;
    };

    const scopedOldTasks = realTasks.filter(isTaskInScope);
    const scopedProjects = [p];
    const oldTaskNoMap = buildTaskNoMap(scopedProjects, scopedOldTasks);
    const sorted = sortTasksByPredecessorsAndDates(realGroupTasks, scopedProjects, scopedOldTasks);

    const batch = writeBatch(db);
    const updatesPerTask = new Map<string, any>();
    const now = new Date().toISOString();
    const groupTaskById = new Map(realGroupTasks.map(gt => [gt.id, gt]));

    sorted.forEach((t, index) => {
      const newCode = `${p.code}#${index + 1}`;
      const origTask = groupTaskById.get(t.id) || t;
      const parentChanged = t.parentTaskId !== origTask.parentTaskId;
      if (t.orderIndex !== index || t.taskCodePhu !== newCode || parentChanged) {
        updatesPerTask.set(t.id, { 
          orderIndex: index, 
          taskCodePhu: newCode,
          ...(t.parentTaskId ? { parentTaskId: t.parentTaskId } : {}),
          updatedAt: now 
        });
      }
    });

    const scopedUpdatedTasks = scopedOldTasks.map(t => {
      const up = updatesPerTask.get(t.id);
      return up ? { ...t, ...up } : t;
    });

    const newTaskNoMap = buildTaskNoMap(scopedProjects, scopedUpdatedTasks);
    const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, scopedProjects, scopedUpdatedTasks);

    const predUpdates = updatePredecessorsStrings(oldCodeToNewCode, scopedUpdatedTasks, scopedProjects, oldTaskNoMap);
    let scopedFinalTasks = scopedUpdatedTasks;
    if (predUpdates.length > 0) {
      const predMap = new Map(predUpdates.map(pu => [pu.id, pu]));
      predUpdates.forEach(pu => {
        const existingUpdates = updatesPerTask.get(pu.id) || {};
        updatesPerTask.set(pu.id, { ...existingUpdates, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
      });
      scopedFinalTasks = scopedUpdatedTasks.map(t => {
        const pu = predMap.get(t.id);
        return pu ? { ...t, predecessor: pu.predecessor, updatedAt: pu.updatedAt } : t;
      });
    }

    const healed = healAllTasksPredecessors(scopedFinalTasks, projects);
    if (healed.changedCount > 0) {
      scopedFinalTasks = healed.updatedTasks;
      healed.updatesToSave.forEach(u => {
        const existingUpdates = updatesPerTask.get(u.id) || {};
        updatesPerTask.set(u.id, {
          ...existingUpdates,
          ...(u.predecessor !== undefined ? { predecessor: u.predecessor } : {}),
          ...(u.taskCodePhu !== undefined ? { taskCodePhu: u.taskCodePhu } : {}),
          updatedAt: u.updatedAt,
        });
      });
    }

    const scopedFinalById = new Map(scopedFinalTasks.map(t => [t.id, t]));
    const allUpdatedTasks = realTasks.map(t => scopedFinalById.get(t.id) || t);

    // 0ms Optimistic UI update in Zustand
    reorderTasksStateUnified(allUpdatedTasks, { affectedProjectIds: [p.id] });

    setTimeout(() => {
      try {
        updatesPerTask.forEach((updates, taskId) => {
          const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
          batch.set(tRef, updates, { merge: true });
        });
        batch.commit().catch(e => console.error("Batch commit failed", e));
        const deltaItems: TakaDeltaItem[] = Array.from(updatesPerTask.entries()).map(([taskId, patch]) => ({
          docId: taskId,
          collectionName: 'taka_tasks',
          action: 'update',
          isPatch: true,
          data: patch,
          year: p.year ? String(p.year) : undefined,
        }));
        recordBatchDeltas(deltaItems, useAppStore.getState().currentUser?.email || 'reorder_tasks').catch(() => {});
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
      }
    }, 0);

    useAppStore.getState().setToast({
      title: "Sorted Successfully",
      message: "Subtasks sorted and predecessors re-indexed.",
      type: "success"
    });
  } catch (error) {
    console.error(error);
  }
}

export async function executeMoveTask(
  p: Project,
  groupTasks: Task[],
  index: number,
  direction: 'up' | 'down',
  realTasks: Task[],
  projects: Project[]
): Promise<void> {
  if ((direction === 'up' && index === 0) || (direction === 'down' && index === groupTasks.length - 1)) return;

  try {
    const realGroupTasks = groupTasks.filter(
      (gt) => gt && !(gt as any)._isVirtualSummary && !String(gt.id || '').startsWith('ts_')
    );
    if (realGroupTasks.length === 0) return;

    const pCodeLower = String(p.code || '').trim().toLowerCase();
    const isTaskInScope = (t: Task) => {
      if (!t || t.isDeleted) return false;
      if (p.id && t.projectId === p.id) return true;
      if (String(t.projectCode || '').trim().toLowerCase() === pCodeLower) return true;
      if (pCodeLower && t.predecessor && t.predecessor.toLowerCase().includes(pCodeLower)) return true;
      return false;
    };

    const scopedOldTasks = realTasks.filter(isTaskInScope);
    const scopedProjects = [p];
    const oldTaskNoMap = buildTaskNoMap(scopedProjects, scopedOldTasks);
    const sorted = [...realGroupTasks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const [movedTask] = sorted.splice(index, 1);
    sorted.splice(targetIndex, 0, movedTask);

    const batch = writeBatch(db);
    const updatesPerTask = new Map<string, any>();
    const now = new Date().toISOString();

    sorted.forEach((t, newIdx) => {
      const newCode = `${p.code}#${newIdx + 1}`;
      if (t.orderIndex !== newIdx || t.taskCodePhu !== newCode) {
        updatesPerTask.set(t.id, { 
          orderIndex: newIdx, 
          taskCodePhu: newCode, 
          updatedAt: now 
        });
      }
    });

    const scopedUpdatedTasks = scopedOldTasks.map(t => {
      const up = updatesPerTask.get(t.id);
      return up ? { ...t, ...up } : t;
    });

    const newTaskNoMap = buildTaskNoMap(scopedProjects, scopedUpdatedTasks);
    const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, scopedProjects, scopedUpdatedTasks);

    const predUpdates = updatePredecessorsStrings(oldCodeToNewCode, scopedUpdatedTasks, scopedProjects, oldTaskNoMap);
    let scopedFinalTasks = scopedUpdatedTasks;
    if (predUpdates.length > 0) {
      const predMap = new Map(predUpdates.map(pu => [pu.id, pu]));
      predUpdates.forEach(pu => {
        const existingUpdates = updatesPerTask.get(pu.id) || {};
        updatesPerTask.set(pu.id, { ...existingUpdates, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
      });
      scopedFinalTasks = scopedUpdatedTasks.map(t => {
        const pu = predMap.get(t.id);
        return pu ? { ...t, predecessor: pu.predecessor, updatedAt: pu.updatedAt } : t;
      });
    }

    const healed = healAllTasksPredecessors(scopedFinalTasks, projects);
    if (healed.changedCount > 0) {
      scopedFinalTasks = healed.updatedTasks;
      healed.updatesToSave.forEach(u => {
        const existingUpdates = updatesPerTask.get(u.id) || {};
        updatesPerTask.set(u.id, {
          ...existingUpdates,
          ...(u.predecessor !== undefined ? { predecessor: u.predecessor } : {}),
          ...(u.taskCodePhu !== undefined ? { taskCodePhu: u.taskCodePhu } : {}),
          updatedAt: u.updatedAt,
        });
      });
    }

    const scopedFinalById = new Map(scopedFinalTasks.map(t => [t.id, t]));
    const allUpdatedTasks = realTasks.map(t => scopedFinalById.get(t.id) || t);

    // 0ms Optimistic UI update in Zustand
    reorderTasksStateUnified(allUpdatedTasks, { affectedProjectIds: [p.id] });

    setTimeout(() => {
      try {
        updatesPerTask.forEach((updates, taskId) => {
          const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
          batch.set(tRef, updates, { merge: true });
        });
        batch.commit().catch(e => console.error("Batch commit failed", e));
        const deltaItems: TakaDeltaItem[] = Array.from(updatesPerTask.entries()).map(([taskId, patch]) => ({
          docId: taskId,
          collectionName: 'taka_tasks',
          action: 'update',
          isPatch: true,
          data: patch,
          year: p.year ? String(p.year) : undefined,
        }));
        recordBatchDeltas(deltaItems, useAppStore.getState().currentUser?.email || 'move_task').catch(() => {});
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
      }
    }, 0);
  } catch (error) {
    console.error(error);
  }
}
