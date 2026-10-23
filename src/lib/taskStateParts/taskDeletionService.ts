import { Task, Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import {
  getTasksForProject,
  calculateProjectComputedDates,
  matchProjectCode,
} from '../projectDatesService';
import { markTasksDeleted } from '../taskDeletedTracker';
import { isTaskBelongsToProject as isTaskBelongsToProjectCore } from '../utils';
import { findAffectedProjects } from '../taskStateService';

/**
 * Shared State Handler: Xóa Tasks đồng bộ giữa DetailTab và GeneralTab
 */
export async function deleteTaskStateUnified(
  taskIdsOrTasks: (string | Task)[],
  _options?: { syncProjects?: boolean }
): Promise<void> {
  if (!taskIdsOrTasks || taskIdsOrTasks.length === 0) return;

  const rawIds: string[] = [];
  const passedTaskObjs: Task[] = [];

  taskIdsOrTasks.forEach((item) => {
    if (typeof item === 'string') {
      rawIds.push(item);
    } else if (item && typeof item === 'object') {
      if (item.id) rawIds.push(String(item.id));
      passedTaskObjs.push(item);
    }
  });

  const idSet = new Set(rawIds.map(String));
  const currentTasks = useAppStore.getState().tasks || [];
  const currentProjects = useAppStore.getState().projects || [];

  const foundInStore = currentTasks.filter((t) => idSet.has(String(t.id)));
  const tasksToDelete = [...foundInStore];
  const seenDeleteIds = new Set(tasksToDelete.map((t) => String(t.id)));
  passedTaskObjs.forEach((pt) => {
    if (pt.id && !seenDeleteIds.has(String(pt.id))) {
      seenDeleteIds.add(String(pt.id));
      tasksToDelete.push(pt);
    }
  });

  const affectedProjects = findAffectedProjects(tasksToDelete, currentProjects);
  const affectedProjectIds = new Set<string>();
  affectedProjects.forEach((ap) => {
    if (ap.id) affectedProjectIds.add(String(ap.id));
  });
  tasksToDelete.forEach((dt) => {
    if (dt.projectId) affectedProjectIds.add(String(dt.projectId));
  });

  const deletedTaskIds = new Set<string>();
  const deletedTaskCodes = new Set<string>();
  tasksToDelete.forEach((t) => {
    if (t.id) {
      const cleanId = String(t.id).trim().toLowerCase();
      deletedTaskIds.add(cleanId);
      markTasksDeleted([cleanId], t.projectId ? String(t.projectId) : undefined);
    }
    if (t.taskCodePhu) {
      deletedTaskCodes.add(String(t.taskCodePhu).trim().toLowerCase());
    }
  });
  rawIds.forEach((id) => {
    const cleanId = String(id).trim().toLowerCase();
    deletedTaskIds.add(cleanId);
    markTasksDeleted([cleanId]);
  });

  const isParentMatchedByDeleted = (rawParentVal: any, childTaskOrProj?: any): boolean => {
    if (!rawParentVal) return false;
    const cleanParent = String(rawParentVal).trim().toLowerCase();
    if (deletedTaskIds.has(cleanParent)) return true;
    if (deletedTaskCodes.has(cleanParent)) {
      return tasksToDelete.some((dt) => {
        if (!dt.taskCodePhu || String(dt.taskCodePhu).trim().toLowerCase() !== cleanParent) {
          return false;
        }
        if (!childTaskOrProj) return true;
        return isTaskBelongsToProjectCore(childTaskOrProj, {
          id: dt.projectId,
          code: dt.projectCode,
          store: dt.projectStore,
          year: dt.projectYear,
        });
      });
    }
    return false;
  };

  const now = new Date().toISOString();
  const tasksAfterDeletion = currentTasks.filter((t) => !idSet.has(String(t.id)));

  const unlinkedChildTasks: Task[] = [];
  const unlinkedChildIdSet = new Set<string>();
  const cleanedTasks = tasksAfterDeletion.map((t) => {
    let updated = t;

    const rawParent = t.parentTaskId || (t as any).parentId;
    if (rawParent && isParentMatchedByDeleted(rawParent, t)) {
      updated = { ...updated, parentTaskId: undefined, updatedAt: now };
      delete (updated as any).parentId;
      unlinkedChildTasks.push(updated);
      unlinkedChildIdSet.add(String(updated.id));
    }

    if (updated.predecessor && typeof updated.predecessor === 'string') {
      const predParts = updated.predecessor
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const filteredParts = predParts.filter((part) => {
        const codeOnly = part
          .replace(/(?:SS|FF|SF|FS)?\s*(?:[+-]\d+[dwmy]?)?$/i, '')
          .trim()
          .toLowerCase();
        const isDeletedPred = tasksToDelete.some((dt) => {
          if (
            !isTaskBelongsToProjectCore(t, {
              id: dt.projectId,
              code: dt.projectCode,
              store: dt.projectStore,
              year: dt.projectYear,
            })
          )
            return false;
          return (
            (dt.taskCodePhu && String(dt.taskCodePhu).trim().toLowerCase() === codeOnly) ||
            (dt.id && String(dt.id).trim().toLowerCase() === codeOnly)
          );
        });
        return !isDeletedPred;
      });
      const newPred = filteredParts.join(', ');
      if (newPred !== updated.predecessor) {
        updated = { ...updated, predecessor: newPred, updatedAt: now };
      }
    }

    return updated;
  });

  useAppStore.getState().setTasks(cleanedTasks);

  // 2. Clear matching summary items from p.taskSummaries and recalculate project computed dates
  const modifiedProjectsForDexie: Project[] = [];
  const delegationGroups = useAppStore.getState().delegationGroups || [];
  const origProjectsById = new Map<string, Project>();
  currentProjects.forEach((op) => {
    if (op.id) origProjectsById.set(op.id, op);
  });

  const updatedProjects = currentProjects.map((p) => {
    const pIdStr = p.id ? String(p.id) : '';

    if (affectedProjectIds.size > 0 && !affectedProjectIds.has(pIdStr)) {
      return p;
    }

    let summaryModified = false;
    let newSummaries = p.taskSummaries ? [...p.taskSummaries] : [];

    if (p.taskSummaries && p.taskSummaries.length > 0) {
      newSummaries = p.taskSummaries
        .filter((ts) => {
          const tsId = ts?.id ? String(ts.id).trim().toLowerCase() : '';
          if (tsId && deletedTaskIds.has(tsId)) {
            summaryModified = true;
            return false;
          }
          const matchedDeleted = tasksToDelete.some((dt) => {
            if (dt.projectId && p.id && String(dt.projectId) !== String(p.id)) return false;
            if (!dt.projectId && !isTaskBelongsToProjectCore(dt, p)) return false;
            const dtId = dt.id ? String(dt.id).trim().toLowerCase() : '';
            if (dtId && tsId && dtId === tsId) return true;
            const tsName = String(ts?.name || '').trim().toLowerCase();
            const dtName = String(dt.name || '').trim().toLowerCase();
            const tsCode = String(ts?.taskCodePhu || '').trim().toLowerCase();
            const dtCode = String(dt.taskCodePhu || '').trim().toLowerCase();
            if (tsName && dtName && tsName === dtName && (!tsCode || !dtCode || tsCode === dtCode)) {
              if (!tsId || tsId.startsWith('ts_') || dtId.startsWith('ts_')) {
                if (tsId && !tsId.startsWith('ts_')) {
                  idSet.add(String(ts.id));
                  deletedTaskIds.add(tsId);
                  markTasksDeleted([tsId], pIdStr);
                }
                return true;
              }
            }
            return false;
          });

          if (matchedDeleted) {
            summaryModified = true;
            return false;
          }
          return true;
        })
        .map((ts: any) => {
          const rawP = ts?.parentTaskId || ts?.parentId;
          if (rawP && (deletedTaskIds.has(String(rawP).trim().toLowerCase()) || deletedTaskCodes.has(String(rawP).trim().toLowerCase()))) {
            summaryModified = true;
            const copy = { ...ts };
            delete copy.parentTaskId;
            delete copy.parentId;
            return copy;
          }
          return ts;
        });
    }

    const isProjectAffected = summaryModified || affectedProjectIds.has(pIdStr);

    if (isProjectAffected) {
      const pForCalc = { ...p, taskSummaries: newSummaries, taskCount: newSummaries.length };
      const remainingProjTasks = getTasksForProject(pForCalc, cleanedTasks);
      const computed = calculateProjectComputedDates(pForCalc, remainingProjTasks, delegationGroups);
      const nextProj: Project = {
        ...p,
        ...computed,
        taskCount: computed.taskCount !== undefined ? computed.taskCount : remainingProjTasks.length,
        taskSummaries: computed.taskSummaries || newSummaries,
        updatedAt: now,
      };
      modifiedProjectsForDexie.push(nextProj);
      return nextProj;
    }
    return p;
  });

  useAppStore.getState().setProjects(updatedProjects);

  // 3. Xóa tức thì khỏi Dexie (IndexedDB) & lưu Projects mới xuống Dexie
  try {
    const { localDb } = await import('../localDb');
    // Also check Dexie for any virtual ts_ tasks or unloaded child tasks of deleted parents
    if (affectedProjects.length > 0) {
      for (const ap of affectedProjects) {
        if (!ap?.id) continue;
        const dexieTasks = await localDb.tasks.where('projectId').equals(String(ap.id)).toArray().catch(() => []);
        for (const dt of dexieTasks) {
          if (!dt?.id) continue;
          const dtIdStr = String(dt.id);
          const dtIdLower = dtIdStr.trim().toLowerCase();
          if (idSet.has(dtIdStr)) continue;
          // Resolve virtual ts_ task to real Dexie task if name/code matches
          const matchedVirtual = tasksToDelete.some(
            (v) =>
              String(v.id || '').startsWith('ts_') &&
              isTaskBelongsToProjectCore(dt, ap) &&
              String(v.name || '').trim().toLowerCase() === String(dt.name || '').trim().toLowerCase()
          );
          if (matchedVirtual) {
            idSet.add(dtIdStr);
            deletedTaskIds.add(dtIdLower);
            markTasksDeleted([dtIdStr], String(ap.id));
            tasksToDelete.push(dt);
            continue;
          }
          const rawP = dt.parentTaskId || (dt as any).parentId;
          if (rawP && !unlinkedChildIdSet.has(dtIdStr) && isParentMatchedByDeleted(rawP, dt)) {
            unlinkedChildIdSet.add(dtIdStr);
            unlinkedChildTasks.push({ ...dt, parentTaskId: undefined, updatedAt: now });
          }
        }
      }
    }
    await localDb.tasks.bulkDelete(Array.from(idSet));
    if (modifiedProjectsForDexie.length > 0) {
      await localDb.projects.bulkPut(modifiedProjectsForDexie);
    }
    if (unlinkedChildTasks.length > 0) {
      await Promise.all(
        unlinkedChildTasks.map((c) =>
          (localDb.tasks.update as any)(c.id, { parentTaskId: null, parentId: null, updatedAt: now })
        )
      );
    }
  } catch (e) {
    console.warn('[taskStateService] Dexie bulkDelete tasks error:', e);
  }

  // 4. Xóa tệp đính kèm trên Firebase Storage
  try {
    const { extractStorageUrls, deleteStorageFiles } = await import('../storageUtils');
    const urls: string[] = [];
    tasksToDelete.forEach((t) => {
      const extracted = extractStorageUrls(t);
      if (extracted.length > 0) urls.push(...extracted);
    });
    if (urls.length > 0) {
      deleteStorageFiles(urls).catch(() => {});
    }
  } catch {}

  // 5. Đồng bộ xóa Task & cập nhật Project Summaries trong cùng 1 Batch + phát Delta Sync lên Firestore
  try {
    const { doc, deleteField } = await import('firebase/firestore');
    const { writeBatch } = await import('../firestoreWrites');
    const { db, APP_ID } = await import('../firebase');
    const { recordBatchDeltas } = await import('../deltaSyncService');
    const { markExplicitDelta } = await import('../autoDeltaQueue');
    const batch = writeBatch(db);

    const allIdsToDelete = new Set<string>();
    rawIds.forEach((id) => {
      if (id) allIdsToDelete.add(String(id));
    });
    tasksToDelete.forEach((t) => {
      if (t?.id) allIdsToDelete.add(String(t.id));
    });

    const deletedByIdMap = new Map<string, Task>();
    tasksToDelete.forEach((t) => {
      if (t?.id) deletedByIdMap.set(String(t.id), t);
    });

    allIdsToDelete.forEach((id) => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
      batch.delete(docRef);
    });

    unlinkedChildTasks.forEach((c) => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', c.id);
      batch.update(docRef, { parentTaskId: deleteField(), parentId: null, updatedAt: now });
    });

    updatedProjects.forEach((up) => {
      const orig = origProjectsById.get(up.id);
      if (orig && orig !== up) {
        const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', up.id);
        batch.update(pRef, {
          taskSummaries: up.taskSummaries || [],
          taskCount: up.taskCount || 0,
          computedTakStart: up.computedTakStart || '',
          computedTakCompl: up.computedTakCompl || '',
          computedOpening: up.computedOpening || '',
          computedPlanProgress: up.computedPlanProgress ?? 0,
          computedActProgress: up.computedActProgress ?? 0,
          updatedAt: up.updatedAt || now,
        });
      }
    });

    const currentUser = useAppStore.getState().currentUser;
    const deltaItems: any[] = [
      ...Array.from(allIdsToDelete).map((id) => {
        const dt = deletedByIdMap.get(String(id));
        return {
          docId: id,
          collectionName: 'taka_tasks',
          action: 'delete',
          isPatch: false,
          data: {
            id,
            isDeleted: true,
            ...(dt?.projectId ? { projectId: dt.projectId } : {}),
            ...(dt?.projectCode ? { projectCode: dt.projectCode } : {}),
            ...(dt?.projectStore ? { projectStore: dt.projectStore } : {}),
            ...(dt?.projectYear !== undefined && dt?.projectYear !== null
              ? { projectYear: dt.projectYear }
              : {}),
            ...(dt?.taskCodePhu ? { taskCodePhu: dt.taskCodePhu } : {}),
            ...(dt?.name ? { name: dt.name } : {}),
          },
          ...(dt?.projectYear ? { year: String(dt.projectYear) } : {}),
        };
      }),
      ...unlinkedChildTasks.map((c) => ({
        docId: c.id,
        collectionName: 'taka_tasks',
        action: 'update',
        isPatch: true,
        data: { parentTaskId: null, parentId: null, updatedAt: now },
        ...(c.projectYear ? { year: String(c.projectYear) } : {}),
      })),
      ...updatedProjects
        .filter((up) => {
          const orig = origProjectsById.get(up.id);
          return orig && orig !== up;
        })
        .map((up) => ({
          docId: up.id,
          collectionName: 'taka_projects',
          action: 'update',
          isPatch: true,
          data: {
            taskSummaries: up.taskSummaries || [],
            taskCount: up.taskCount || 0,
            computedTakStart: up.computedTakStart || '',
            computedTakCompl: up.computedTakCompl || '',
            computedOpening: up.computedOpening || '',
            computedPlanProgress: up.computedPlanProgress ?? 0,
            computedActProgress: up.computedActProgress ?? 0,
            updatedAt: up.updatedAt || now,
          },
          year: String(up.year || ''),
        })),
    ];

    markExplicitDelta(deltaItems);
    await batch.commit();
    await recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username);
  } catch (e) {
    console.warn('[taskStateService] Failed to persist task deletion to Firestore:', e);
  }
}

export { deleteProjectStateUnified } from './projectDeletionService';

