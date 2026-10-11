import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { Task, Project, DelegationSubTask } from '../../types';
import { db, APP_ID } from '../../lib/firebase';
import { getTaskStatus, resolveActualStatus, getSuggestedCompletionTime, parseDateTime } from '../../lib/utils';
import { scheduleDependentTasks } from '../../lib/ganttUtils';
import { syncProjectDatesByCode } from '../../lib/projectDatesService';
import { useAppStore } from '../../store/useAppStore';

export async function checkAndSyncRealtimeSubTaskCompletion(
  parentTask: Task,
  parentProject: Project | undefined,
  oldSubTasks: DelegationSubTask[],
  newSubTasks: DelegationSubTask[],
  tasks: Task[],
  projects: Project[]
) {
  const isRealtime = parentTask?.realtimeUpdate || parentProject?.realtimeUpdate;
  if (!isRealtime) return;

  const computedPlStatus = getTaskStatus(parentTask.start, parentTask.finish);
  const oldActStatusLabel = resolveActualStatus(computedPlStatus, oldSubTasks).label;
  const newActStatusLabel = resolveActualStatus(computedPlStatus, newSubTasks).label;

  if (newActStatusLabel === 'Completed' && oldActStatusLabel !== 'Completed') {
    const nowStr =
      parentTask.approval === 'Approved' && parentTask.approvedAt
        ? getSuggestedCompletionTime(parentTask.approvedAt)
        : getSuggestedCompletionTime();
    const taskUpdates: Partial<Task> = { finish: nowStr, durationManual: true };

    if (parentTask.start) {
      const finishDate = parseDateTime(nowStr);
      const startDate = parseDateTime(parentTask.start);
      if (finishDate && startDate) {
        const diffTime = finishDate.getTime() - startDate.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        if (diffDays < 0) {
          taskUpdates.duration = '0';
          taskUpdates.finish = taskUpdates.start || parentTask.start;
        } else {
          taskUpdates.duration = String(parseFloat(diffDays.toFixed(1)));
        }
      }
    }

    const newT = {
      ...parentTask,
      ...taskUpdates,
      _isAutoActualized: true,
      updatedAt: new Date().toISOString(),
    };
    const updatesToDependents = scheduleDependentTasks(newT, tasks, projects);
    delete (newT as any)._isAutoActualized;
    const batch = writeBatch(db);
    batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', newT.id), newT);
    for (const u of updatesToDependents) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', u.id), u as any);
    }
    try {
      await batch.commit();
      syncProjectDatesByCode(parentTask.projectCode, parentTask.projectStore, parentTask.projectYear);
    } catch (error: any) {
      console.error('Batch commit failed', error);
      useAppStore
        .getState()
        .setToast({ title: 'Save Failed', message: 'Network error or permission denied.', type: 'error' });
    }
  }
}
