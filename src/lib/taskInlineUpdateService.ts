import { doc } from 'firebase/firestore';
import { Project, Task, DelegationGroup, AppUser, TakaDeltaItem } from '../types';
import { useAppStore } from '../store/useAppStore';
import { writeBatch } from './firestoreWrites';
import { db, APP_ID } from './firebase';
import { undoManager } from './undoManager';
import {
  buildTaskNoMap,
  splitPredecessors,
  parsePredecessors,
  computeTaskCode,
  updatePredecessorsStrings,
  calculateTaskDatesFromPredecessors,
  scheduleDependentTasks,
} from './ganttUtils';
import {
  parseDateTime,
  formatToDatetimeLocal,
  generateId,
  isTaskBelongsToProject,
  getEffectiveTaskDuration,
  normalizeDashes,
} from './utils';
import {
  cleanDurationString,
  rollupParentTaskDates,
  prepareMissingDelegationsForTasks,
} from './taskImportService';
import { normalizeTaskNameForComparison } from './taskDeduplicationService';
import { ensureProjectTasksLoaded } from './taskStateService';
import { offloadTaskInlineBatchCommit } from './taskStateParts/taskInlineCommitHelper';

export interface ExecuteUnifiedTaskUpdateOptions {
  skipPredecessorRecalc?: boolean;
  skipProjectRollup?: boolean;
  showPredecessorToast?: boolean;
}

/**
 * Unified Task Inline & Schedule Update Service
 * Shared across DetailTab, GanttTab, PredecessorSearchSuggest, and GanttBar drag/resize
 * to guarantee 100% consistent duration, start date, finish date, party, and predecessor calculations,
 * dependent task cascading, parent modular task rollup, 0ms Optimistic UI, and Delta Sync.
 */
export async function executeUnifiedTaskUpdate(
  t: Task,
  updates: Partial<Task>,
  currentUser?: AppUser | null,
  options?: ExecuteUnifiedTaskUpdateOptions
): Promise<void> {
  try {
    const liveState = useAppStore.getState();
    const activeTasks = liveState.tasks || [];
    const activeProjects = liveState.projects || [];
    const effectiveUser = currentUser || liveState.currentUser;

    const currentProject = activeProjects.find(
      (p) =>
        (t.projectId && p.id === t.projectId) ||
        (p.code === t.projectCode &&
          (String(p.year || '') === String(t.projectYear || '') || (!p.year && !t.projectYear)) &&
          (String(p.store || '') === String(t.projectStore || '') || (!p.store && !t.projectStore)))
    );

    // 1. Validate duplicate task name within the same project
    if (updates.name && updates.name !== t.name && currentProject) {
      const normUpdateName = normalizeTaskNameForComparison(updates.name);
      const isDuplicate = activeTasks.some((tsk) => {
        if (tsk.id === t.id || tsk.isDeleted) return false;
        if (!isTaskBelongsToProject(tsk, currentProject, activeProjects)) return false;
        if (tsk.name && (tsk.name || '').trim().toLowerCase() === (updates.name || '').trim().toLowerCase()) {
          return true;
        }
        const tNorm = normalizeTaskNameForComparison(tsk.name);
        return !!(normUpdateName && tNorm && normUpdateName === tNorm);
      });
      if (isDuplicate) {
        useAppStore.getState().setToast({
          title: 'Notice',
          message: `Task name "${updates.name}" already exists in project ${currentProject.code} (${currentProject.year} - ${currentProject.store}). Please enter a different name.`,
        });
        return;
      }
    }

    // 2. Normalize predecessor tokens (up to 2 predecessors; 2nd defaults to FF/SF)
    if (updates.predecessor !== undefined && updates.predecessor !== t.predecessor) {
      const val = updates.predecessor;
      const taskNoMap = buildTaskNoMap(activeProjects, activeTasks);
      let parts = splitPredecessors(val, taskNoMap);
      if (parts.length > 2) parts = parts.slice(0, 2);

      if (parts.length >= 2) {
        updates.durationManual = false;
        if (!/FF|SF/i.test(parts[1])) {
          if (!/SS|FS/i.test(parts[1])) parts[1] += 'FF';
          else parts[1] = parts[1].replace(/SS|FS/gi, 'FF');
        }
        updates.predecessor = parts.join(', ');
      }
      parsePredecessors(updates.predecessor, taskNoMap, t);
    }

    // 3. Propagate taskCodePhu changes to dependent predecessor strings
    let predecessorUpdates: { id: string; predecessor: string; updatedAt: string }[] = [];
    if (updates.taskCodePhu !== undefined && updates.taskCodePhu !== t.taskCodePhu) {
      const oldCode = (t.taskCodePhu || computeTaskCode(activeProjects, activeTasks, t)).trim();
      const newCode = (
        updates.taskCodePhu ||
        computeTaskCode(
          activeProjects,
          activeTasks.map((item) => (item.id === t.id ? { ...item, ...updates } : item)),
          { ...t, ...updates }
        )
      ).trim();
      if (oldCode && newCode && oldCode.toLowerCase() !== newCode.toLowerCase()) {
        const map = new Map<string, string>();
        map.set(oldCode.toLowerCase(), newCode);
        predecessorUpdates = updatePredecessorsStrings(map, activeTasks, activeProjects);
      }
    }

    // 4. Resolve virtual summary task ID (ts_*) to real task ID if needed
    let targetTaskId = t.id;
    if (targetTaskId && targetTaskId.startsWith('ts_')) {
      const sameProjectIdentity = (x: Partial<Task>) =>
        String(x.projectStore || '').trim().toLowerCase() === String(t.projectStore || '').trim().toLowerCase() &&
        String(x.projectYear ?? '').trim() === String(t.projectYear ?? '').trim();

      let realTask = activeTasks.find(
        (tsk) =>
          !tsk.id.startsWith('ts_') &&
          tsk.projectCode === t.projectCode &&
          sameProjectIdentity(tsk) &&
          ((t.taskCodePhu && tsk.taskCodePhu === t.taskCodePhu) ||
            (t.name && tsk.name && tsk.name.trim().toLowerCase() === t.name.trim().toLowerCase()))
      );
      if (!realTask && t.projectCode) {
        try {
          const loaded = await ensureProjectTasksLoaded(t.projectCode, {
            projectId: t.projectId,
            store: t.projectStore,
            year: t.projectYear,
          });
          const loadedSame = loaded.filter(sameProjectIdentity);
          if (loadedSame.length > 0) {
            realTask = loadedSame.find(
              (tsk) =>
                (t.taskCodePhu && tsk.taskCodePhu === t.taskCodePhu) ||
                (t.name && tsk.name && tsk.name.trim().toLowerCase() === t.name.trim().toLowerCase())
            );
          }
        } catch (err) {
          console.warn('Failed to resolve ts_ task from local/cache:', err);
        }
      }
      if (realTask) {
        targetTaskId = realTask.id;
      } else {
        targetTaskId = `t_${Date.now()}_${generateId().substring(0, 8)}`;
      }
    }

    const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', targetTaskId);
    const nowIso = new Date().toISOString();

    let newT: Task = {
      ...t,
      id: targetTaskId,
      projectId: updates.projectId || t.projectId || currentProject?.id,
      projectCode: updates.projectCode || t.projectCode || currentProject?.code || '',
      projectStore: updates.projectStore || t.projectStore || currentProject?.store,
      projectYear: updates.projectYear ?? t.projectYear ?? currentProject?.year,
      ...updates,
      updatedAt: nowIso,
    };
    delete (newT as any)._isVirtualSummary;

    // 5. Recalculate dates from Predecessors when predecessor is updated
    if (updates.predecessor !== undefined && !options?.skipPredecessorRecalc) {
      let currentTasks = useAppStore.getState().tasks || activeTasks;
      let taskNoMap = buildTaskNoMap(activeProjects, currentTasks);
      const parts = splitPredecessors(updates.predecessor, taskNoMap);
      if (parts.length >= 2) {
        newT.durationManual = false;
      }
      newT.realtimeUpdate = Boolean(updates.predecessor.trim());
      let parsed = parsePredecessors(updates.predecessor, taskNoMap, newT);

      if (updates.predecessor.trim() && (!parsed.length || parsed.some((p) => !p.task))) {
        for (const token of parts) {
          const cleanToken = normalizeDashes(token).replace(/(fs|ss|ff|sf|[+-]\s*\d+|\s+\d+)$/i, '').trim();
          const matchedProj =
            activeProjects.find(
              (p) =>
                p.code &&
                cleanToken.toLowerCase().startsWith(normalizeDashes(p.code).toLowerCase()) &&
                (!t.projectStore || !p.store || p.store.trim().toLowerCase() === t.projectStore.trim().toLowerCase()) &&
                (!t.projectYear || !p.year || String(p.year).trim() === String(t.projectYear).trim())
            ) ||
            activeProjects.find((p) => p.code && cleanToken.toLowerCase().startsWith(normalizeDashes(p.code).toLowerCase()));

          if (matchedProj && (matchedProj.id !== t.projectId || matchedProj.code !== t.projectCode)) {
            const loaded = await ensureProjectTasksLoaded(matchedProj.code, {
              projectId: matchedProj.id,
              store: matchedProj.store,
              year: matchedProj.year,
            });
            if (loaded.length > 0) {
              currentTasks = useAppStore.getState().tasks || currentTasks;
              taskNoMap = buildTaskNoMap(activeProjects, currentTasks);
              parsed = parsePredecessors(updates.predecessor, taskNoMap, newT);
            }
          }
        }
      }
      const calcResult = calculateTaskDatesFromPredecessors(newT, parsed);
      if (calcResult) {
        newT.start = calcResult.start;
        newT.finish = calcResult.finish;
        newT.duration = calcResult.duration;
        newT.durationManual = calcResult.durationManual;
      }
    } else if (newT.predecessor) {
      newT.realtimeUpdate = Boolean(newT.predecessor.trim());
    }

    // 6. Synchronize Duration <-> Start Date <-> Finish Date bi-directionally
    if (updates.start !== undefined && updates.finish !== undefined) {
      // Both start and finish updated together (e.g. Gantt bar drag or resize)
      const s = parseDateTime(newT.start);
      const f = parseDateTime(newT.finish);
      if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
        const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
        newT.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
      }
    } else if (updates.duration !== undefined) {
      newT.duration = cleanDurationString(updates.duration);
      newT.durationManual = true;
      if (newT.duration !== '') {
        const days = parseFloat(newT.duration);
        if (!isNaN(days) && days >= 0) {
          const s = newT.start ? parseDateTime(newT.start) : null;
          const f = newT.finish ? parseDateTime(newT.finish) : null;
          if (s && !isNaN(s.getTime())) {
            const nextFinish = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
            newT.finish = formatToDatetimeLocal(nextFinish);
          } else if (f && !isNaN(f.getTime())) {
            const nextStart = new Date(f.getTime() - days * 24 * 60 * 60 * 1000);
            newT.start = formatToDatetimeLocal(nextStart);
          }
        }
      }
    } else if (updates.finish !== undefined) {
      const f = newT.finish ? parseDateTime(newT.finish) : null;
      const s = newT.start ? parseDateTime(newT.start) : null;
      if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
        if (f.getTime() < s.getTime()) {
          newT.start = newT.finish;
          newT.duration = '0';
        } else {
          const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
          newT.duration = String(Number(diffDays.toFixed(2)));
        }
      } else if (!s && f && !isNaN(f.getTime())) {
        const effDur = getEffectiveTaskDuration(t);
        const days = effDur !== '' ? parseFloat(effDur) : NaN;
        if (!isNaN(days) && days >= 0) {
          const nextStart = new Date(f.getTime() - days * 24 * 60 * 60 * 1000);
          newT.start = formatToDatetimeLocal(nextStart);
          newT.duration = String(Number(days.toFixed(2)));
        }
      }
    } else if (updates.start !== undefined) {
      const s = newT.start ? parseDateTime(newT.start) : null;
      const f = newT.finish ? parseDateTime(newT.finish) : null;
      const rawDurStr =
        newT.duration !== undefined && newT.duration !== null && String(newT.duration).trim() !== ''
          ? String(newT.duration).trim()
          : getEffectiveTaskDuration(t);
      const days = rawDurStr !== '' ? parseFloat(rawDurStr) : NaN;

      if (s && !isNaN(s.getTime())) {
        if (newT.durationManual || !f || isNaN(f.getTime()) || s.getTime() > f.getTime()) {
          if (!isNaN(days) && days >= 0) {
            const nextFinish = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
            newT.finish = formatToDatetimeLocal(nextFinish);
            newT.duration = String(Number(days.toFixed(2)));
          } else if (f && !isNaN(f.getTime()) && s.getTime() > f.getTime()) {
            newT.finish = newT.start;
            newT.duration = '0';
          }
        } else {
          const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
          newT.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
        }
      }
    } else if (updates.predecessor === undefined) {
      if (newT.durationManual) {
        if (newT.start && newT.duration !== undefined && newT.duration !== '') {
          const s = parseDateTime(newT.start);
          if (s && !isNaN(s.getTime())) {
            const days = parseFloat(String(newT.duration));
            if (!isNaN(days) && days >= 0) {
              const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
              newT.finish = formatToDatetimeLocal(f);
            }
          }
        }
      } else if (newT.start && newT.finish) {
        const s = parseDateTime(newT.start);
        const f = parseDateTime(newT.finish);
        if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
          const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
          newT.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
        }
      }
    }

    // 7. Cascade dependent tasks & rollup modular parent tasks
    const latestTasks = useAppStore.getState().tasks || activeTasks;
    const updatesToDependents = scheduleDependentTasks(newT, latestTasks, activeProjects);
    const batch = writeBatch(db);

    const scheduledUpdatedTask = updatesToDependents.find((d) => d.id === newT.id);
    if (scheduledUpdatedTask) {
      newT = { ...(scheduledUpdatedTask as Task) };
      delete (newT as any)._isVirtualSummary;
    }
    if (!newT.baselineStart && newT.start) newT.baselineStart = t.baselineStart || newT.start;
    if (!newT.baselineFinish && newT.finish) newT.baselineFinish = t.baselineFinish || newT.finish;

    const depUpdateMap = new Map<string, Task>();
    updatesToDependents.forEach((d) => {
      const cleanDep = { ...d };
      delete (cleanDep as any)._isVirtualSummary;
      depUpdateMap.set(cleanDep.id, cleanDep);
    });

    const affectedProjIds = new Set<string>();
    const affectedProjCodes = new Set<string>();
    const registerScope = (item: Partial<Task>) => {
      if (item.projectId) affectedProjIds.add(String(item.projectId).trim());
      if (item.projectCode) affectedProjCodes.add(String(item.projectCode).trim().toLowerCase());
    };
    registerScope(newT);
    updatesToDependents.forEach(registerScope);

    const scopedTasksForRollup: Task[] = [];
    let foundNewT = false;
    for (let i = 0; i < latestTasks.length; i++) {
      const tsk = latestTasks[i];
      if (!tsk || tsk.isDeleted) continue;
      const matchesScope =
        (tsk.projectId && affectedProjIds.has(String(tsk.projectId).trim())) ||
        (tsk.projectCode && affectedProjCodes.has(String(tsk.projectCode).trim().toLowerCase()));
      if (!matchesScope) continue;
      if (tsk.id === newT.id) {
        scopedTasksForRollup.push(newT);
        foundNewT = true;
      } else {
        scopedTasksForRollup.push(depUpdateMap.get(tsk.id) || tsk);
      }
    }
    if (!foundNewT) {
      scopedTasksForRollup.push(newT);
    }

    const { updatedParents: rawUpdatedParents } = rollupParentTaskDates(scopedTasksForRollup);
    const updatedParents = rawUpdatedParents.map((pt) => {
      const cleanPt = { ...pt };
      delete (cleanPt as any)._isVirtualSummary;
      return cleanPt;
    });

    batch.set(tRef, newT, { merge: true });

    const { newDelegations } =
      newT.delegation && effectiveUser
        ? prepareMissingDelegationsForTasks([newT], effectiveUser)
        : { newDelegations: [] as DelegationGroup[] };
    newDelegations.forEach((delGroup) => {
      const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', delGroup.id);
      batch.set(delRef, delGroup, { merge: true });
    });

    const depUpdates = Array.from(depUpdateMap.values()).filter((d) => d.id !== newT.id);
    depUpdates.forEach((depTask) => {
      const depRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id);
      batch.set(depRef, { ...depTask, updatedAt: nowIso }, { merge: true });
    });

    updatedParents.forEach((pt) => {
      if (pt.id !== newT.id && !depUpdateMap.has(pt.id)) {
        const ptRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pt.id);
        batch.set(ptRef, { ...pt, updatedAt: nowIso }, { merge: true });
      }
    });

    predecessorUpdates.forEach((pu) => {
      if (pu.id !== t.id && !depUpdateMap.has(pu.id)) {
        const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id);
        batch.set(pRef, { predecessor: pu.predecessor, updatedAt: pu.updatedAt }, { merge: true });
      }
    });

    const allUpdatesToSave = [
      newT,
      ...depUpdates,
      ...updatedParents.filter((pt) => pt.id !== newT.id && !depUpdateMap.has(pt.id)),
      ...predecessorUpdates.filter((pu) => pu.id !== t.id && !depUpdateMap.has(pu.id)),
    ];

    // 8. Zero-Delay 0ms Optimistic UI Update in Zustand
    const store = useAppStore.getState();
    store.optimisticUpdateTasks(allUpdatesToSave);

    if (store.editingTask && store.editingTask.id === newT.id && typeof store.setEditingTask === 'function') {
      store.setEditingTask({ ...store.editingTask, ...newT });
    }

    if (options?.showPredecessorToast && updates.predecessor !== undefined) {
      store.setToast?.({
        title: 'Predecessor Updated',
        message: updates.predecessor ? `Link: ${updates.predecessor}` : 'Predecessor removed',
        type: 'success',
      });
    }

    // 9. Offload Firestore Batch Commit, LocalDB Mirror, Project Rollup & Delta Sync to microtask
    offloadTaskInlineBatchCommit({
      t,
      newT,
      batch,
      allUpdatesToSave,
      depUpdates,
      updatesToDependents,
      newDelegations,
      latestTasks,
      effectiveUser,
      skipProjectRollup: options?.skipProjectRollup,
    });
  } catch (e) {
    console.error(e);
  }
}
