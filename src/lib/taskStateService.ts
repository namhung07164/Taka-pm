import { Task, Project } from "../types";
import { useAppStore } from "../store/useAppStore";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, APP_ID } from "./firebase";
import { 
  getTasksForProject, 
  calculateProjectComputedDates, 
  syncProjectDatesToFirestore,
  matchProjectCode 
} from "./projectDatesService";
import { markTasksDeleted, isTaskDeletedInTracker } from "./taskDeletedTracker";
import { isTaskBelongsToProject as isTaskBelongsToProjectCanonical } from "./utils";

// Cache in-flight requests to avoid duplicate fetches
const pendingProjectFetches = new Map<string, Promise<Task[]>>();

/**
 * Validates whether a task belongs to a specific project by verifying store, year, projectId, and projectCode.
 */
export function isTaskBelongsToProject(t: Partial<Task>, p: Partial<Project>): boolean {
  return isTaskBelongsToProjectCanonical(t as Task, p);
}

/**
 * Ensures tasks for a specific project (by projectCode + optional projectId/year/store) are loaded into Zustand store.
 * Useful when resolving cross-project predecessors or opening modals dynamically.
 */
export async function ensureProjectTasksLoaded(
  projectCode: string,
  projectId?: string | null,
  projectYear?: string | number | null,
  projectStore?: string | null
): Promise<Task[]> {
  if (!projectCode && !projectId) return [];
  const cleanCode = (projectCode || '').trim();
  const cleanId = (projectId || '').trim();
  const normYear = projectYear !== undefined && projectYear !== null && String(projectYear).toLowerCase() !== 'all'
    ? String(projectYear).trim()
    : '';
  const normStore = projectStore && String(projectStore).toLowerCase() !== 'all'
    ? String(projectStore).trim().toUpperCase()
    : '';

  const projects = useAppStore.getState().projects || [];
  const targetProject =
    (cleanId ? projects.find(p => String(p.id).trim() === cleanId) : undefined) ||
    projects.find(p => {
      if (!p || !p.code || String(p.code).trim().toLowerCase() !== cleanCode.toLowerCase()) return false;
      if (normYear && p.year && String(p.year).trim() !== normYear) return false;
      if (normStore && p.store && String(p.store).trim().toUpperCase() !== normStore) return false;
      return true;
    });

  const effectiveYear = normYear || (targetProject?.year ? String(targetProject.year).trim() : '');
  const effectiveStore = normStore || (targetProject?.store ? String(targetProject.store).trim().toUpperCase() : '');
  const effectiveId = cleanId || (targetProject?.id ? String(targetProject.id).trim() : '');

  const matchesTargetTask = (t: Task): boolean => {
    if (!t || t.isDeleted || isTaskDeletedInTracker(t.id)) return false;
    if (targetProject) {
      return isTaskBelongsToProject(t, targetProject);
    }
    if (effectiveId && t.projectId && String(t.projectId).trim() === effectiveId) return true;
    if (effectiveId && t.projectId && String(t.projectId).trim() !== effectiveId) return false;
    if (!cleanCode || !t.projectCode || String(t.projectCode).trim().toLowerCase() !== cleanCode.toLowerCase()) {
      return false;
    }
    if (effectiveYear && t.projectYear && String(t.projectYear).trim() !== effectiveYear) return false;
    if (effectiveStore && t.projectStore && String(t.projectStore).trim().toUpperCase() !== effectiveStore) return false;
    return true;
  };

  const currentTasks = useAppStore.getState().tasks || [];

  // 1. If we already have tasks for this exact project (matching year/store/id/code) in memory, return them (0 Read)
  const existing = currentTasks.filter(matchesTargetTask);
  if (existing.length > 0) return existing;

  const cacheKey = `${cleanCode.toLowerCase()}__${effectiveYear}__${effectiveStore}__${effectiveId}`;
  if (pendingProjectFetches.has(cacheKey)) {
    return pendingProjectFetches.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      // 2. Check Dexie Local-First Database before touching Firestore (0 Read)
      const { getLocalTasksForProjects, bulkPersistTasks } = await import('./localDb');
      const queryKeys = [effectiveId, cleanCode].filter(Boolean);
      const localTasks = await getLocalTasksForProjects(queryKeys, effectiveYear || undefined, effectiveStore || undefined);
      const validLocal = (localTasks || []).filter(matchesTargetTask);
      if (validLocal.length > 0) {
        const latestTasks = useAppStore.getState().tasks || [];
        const currentIds = new Set(latestTasks.map(t => t.id));
        const toAdd = validLocal.filter(t => !currentIds.has(t.id));
        if (toAdd.length > 0) {
          useAppStore.getState().setTasks([...latestTasks, ...toAdd]);
        }
        return validLocal;
      }

      // 3. Check if target project has 0 tasks according to project summary (0 Read)
      const matchingProjs = targetProject
        ? [targetProject]
        : projects.filter(p => {
            if (!p || !p.code || p.code.trim().toLowerCase() !== cleanCode.toLowerCase()) return false;
            if (effectiveYear && p.year && String(p.year).trim() !== effectiveYear) return false;
            if (effectiveStore && p.store && String(p.store).trim().toUpperCase() !== effectiveStore) return false;
            return true;
          });
      if (
        matchingProjs.length > 0 &&
        matchingProjs.every(p => (p.taskCount || 0) === 0 && (!p.taskSummaries || p.taskSummaries.length === 0))
      ) {
        return [];
      }

      // 4. Fallback to Firestore only when Dexie is empty and project expects tasks
      if (!cleanCode) return [];
      const q = query(
        collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
        where("projectCode", "==", cleanCode)
      );
      const snap = await getDocs(q);
      const allLoaded: Task[] = [];
      snap.forEach(docSnap => {
        const d = { id: docSnap.id, ...docSnap.data() } as Task;
        if (!d.isDeleted && !isTaskDeletedInTracker(d.id)) allLoaded.push(d);
      });

      if (allLoaded.length > 0) {
        bulkPersistTasks(allLoaded).catch(() => {});
      }

      const matchingLoaded = allLoaded.filter(matchesTargetTask);
      if (matchingLoaded.length > 0) {
        const latestTasks = useAppStore.getState().tasks || [];
        const currentIds = new Set(latestTasks.map(t => t.id));
        const toAdd = matchingLoaded.filter(t => !currentIds.has(t.id));
        if (toAdd.length > 0) {
          useAppStore.getState().setTasks([...latestTasks, ...toAdd]);
        }
      }
      return matchingLoaded;
    } catch (err) {
      console.warn("Failed to fetch tasks for external project:", cleanCode, err);
      return [];
    } finally {
      pendingProjectFetches.delete(cacheKey);
    }
  })();

  pendingProjectFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Tìm toàn bộ danh sách Projects bị ảnh hưởng bởi danh sách Tasks đưa vào
 */
export function findAffectedProjects(
  tasksToCheck: (Partial<Task>)[],
  allProjects?: Project[]
): Project[] {
  const projects = allProjects || useAppStore.getState().projects;
  if (!tasksToCheck.length || !projects.length) return [];

  const affectedMap = new Map<string, Project>();

  for (const t of tasksToCheck) {
    if (!t) continue;
    const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : "";
    const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : "";
    const tCode = t.projectCode ? String(t.projectCode).trim().toLowerCase() : "";
    const tProjId = t.projectId ? String(t.projectId) : "";

    for (const p of projects) {
      if (!p.id || !p.code) continue;

      const pStore = p.store ? String(p.store).trim().toLowerCase() : "";
      const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : "";

      if (tProjId && String(p.id) === tProjId) {
        if (pStore && tStore && pStore !== tStore) continue;
        if (pYear && tYear && pYear !== tYear) continue;
        affectedMap.set(p.id, p);
        continue;
      }

      if (tProjId && String(p.id) !== tProjId) continue;

      if (!tCode) continue;
      const matchesCode =
        String(p.code).trim().toLowerCase() === tCode ||
        matchProjectCode(p.code, tCode);

      if (!matchesCode) continue;
      if (pStore && tStore && pStore !== tStore) continue;
      if (pYear && tYear && pYear !== tYear) continue;

      affectedMap.set(p.id, p);
    }
  }

  return Array.from(affectedMap.values());
}

/**
 * Đồng bộ tính toán lại mốc thời gian và tiến độ cho các dự án bị ảnh hưởng
 * Cập nhật ngay tức thì vào Zustand store (0ms) và đẩy ngầm Firestore (Dirty-checked).
 */
export async function syncAffectedProjects(
  affectedProjects: Project[],
  allTasks?: Task[]
): Promise<void> {
  if (!affectedProjects.length) return;

  const currentTasks = allTasks || useAppStore.getState().tasks;
  const delegationGroups = useAppStore.getState().delegationGroups;

  for (const project of affectedProjects) {
    if (!project.id) continue;
    const projectTasks = getTasksForProject(project, currentTasks);
    const computedDates = calculateProjectComputedDates(project, projectTasks, delegationGroups);
    await syncProjectDatesToFirestore(project.id, computedDates);
  }
}

/**
 * Shared State Handler: Cập nhật / Thêm mới Tasks đồng bộ giữa mọi Tab (DetailTab <-> GeneralTab)
 * 1. Optimistic update vào Zustand `tasks` (0ms UI lag).
 * 2. Tự động nhận diện Projects liên quan, tính lại Start, Finish/Handover, Opening, Tiến độ.
 * 3. Optimistic update vào Zustand `projects` và đồng bộ ngầm Firestore.
 */
export async function saveTaskStateUnified(
  taskUpdates: (Partial<Task> & { id: string })[],
  options?: { syncProjects?: boolean; allTasksOverride?: Task[] }
): Promise<void> {
  if (!taskUpdates || taskUpdates.length === 0) return;

  // 1. Cập nhật Optimistic tức thì vào State Tasks
  useAppStore.getState().optimisticUpdateTasks(taskUpdates);

  if (options?.syncProjects === false) return;

  // 2. Lấy danh sách Tasks và Projects mới nhất
  const updatedTasks = options?.allTasksOverride || useAppStore.getState().tasks;
  const affectedProjects = findAffectedProjects(taskUpdates);

  // 3. Đồng bộ lại toàn bộ Computed Dates cho các dự án bị ảnh hưởng
  await syncAffectedProjects(affectedProjects, updatedTasks);
}

/**
 * Shared State Handler: Xóa Tasks đồng bộ giữa DetailTab và GeneralTab
 */
export async function deleteTaskStateUnified(
  taskIdsOrTasks: (string | Task)[],
  options?: { syncProjects?: boolean }
): Promise<void> {
  if (!taskIdsOrTasks || taskIdsOrTasks.length === 0) return;

  const rawIds: string[] = [];
  const passedTaskObjs: Task[] = [];

  taskIdsOrTasks.forEach(item => {
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

  const foundInStore = currentTasks.filter(t => idSet.has(String(t.id)));
  const tasksToDelete = [...foundInStore];
  passedTaskObjs.forEach(pt => {
    if (!tasksToDelete.some(t => String(t.id) === String(pt.id))) {
      tasksToDelete.push(pt);
    }
  });

  const affectedProjects = findAffectedProjects(tasksToDelete, currentProjects);
  const affectedProjectIds = new Set<string>();
  affectedProjects.forEach(ap => {
    if (ap.id) affectedProjectIds.add(String(ap.id));
  });
  tasksToDelete.forEach(dt => {
    if (dt.projectId) affectedProjectIds.add(String(dt.projectId));
  });

  const deletedTaskIds = new Set<string>();
  tasksToDelete.forEach(t => {
    if (t.id) {
      const cleanId = String(t.id).trim().toLowerCase();
      deletedTaskIds.add(cleanId);
      markTasksDeleted([cleanId], t.projectId ? String(t.projectId) : undefined);
    }
  });
  rawIds.forEach(id => {
    const cleanId = String(id).trim().toLowerCase();
    deletedTaskIds.add(cleanId);
    markTasksDeleted([cleanId]);
  });

  const now = new Date().toISOString();
  const tasksAfterDeletion = currentTasks.filter(t => !idSet.has(String(t.id)));
  
  const unlinkedChildTasks: Task[] = [];
  const cleanedTasks = tasksAfterDeletion.map(t => {
    let updated = t;

    const rawParent = t.parentTaskId || (t as any).parentId;
    if (rawParent && deletedTaskIds.has(String(rawParent).trim().toLowerCase())) {
      updated = { ...updated, parentTaskId: undefined, updatedAt: now };
      delete (updated as any).parentId;
      unlinkedChildTasks.push(updated);
    }

    if (updated.predecessor && typeof updated.predecessor === 'string') {
      const predParts = updated.predecessor.split(',').map(p => p.trim()).filter(Boolean);
      const filteredParts = predParts.filter(part => {
        const codeOnly = part.replace(/(?:SS|FF|SF|FS)?\s*(?:[+-]\d+[dwmy]?)?$/i, '').trim().toLowerCase();
        const isDeletedPred = tasksToDelete.some(dt => {
          if (!isTaskBelongsToProject(t, { id: dt.projectId, code: dt.projectCode, store: dt.projectStore, year: dt.projectYear })) return false;
          return (dt.taskCodePhu && String(dt.taskCodePhu).trim().toLowerCase() === codeOnly) ||
                 (dt.id && String(dt.id).trim().toLowerCase() === codeOnly);
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
  const updatedProjects = currentProjects.map(p => {
    const pIdStr = p.id ? String(p.id) : '';

    if (affectedProjectIds.size > 0 && !affectedProjectIds.has(pIdStr)) {
      return p;
    }

    let summaryModified = false;
    let newSummaries = p.taskSummaries ? [...p.taskSummaries] : [];

    if (p.taskSummaries && p.taskSummaries.length > 0) {
      newSummaries = p.taskSummaries.filter((ts) => {
        const tsId = ts?.id ? String(ts.id).trim().toLowerCase() : '';
        if (tsId && deletedTaskIds.has(tsId)) {
          summaryModified = true;
          return false;
        }
        const matchedDeleted = tasksToDelete.some(dt => {
          if (dt.projectId && p.id && String(dt.projectId) !== String(p.id)) return false;
          if (!dt.projectId && !isTaskBelongsToProject(dt, p)) return false;
          const dtId = dt.id ? String(dt.id).trim().toLowerCase() : '';
          if (dtId && tsId && dtId === tsId) return true;
          if (!tsId) {
            const tsName = String(ts?.name || '').trim().toLowerCase();
            const dtName = String(dt.name || '').trim().toLowerCase();
            const tsCode = String(ts?.taskCodePhu || '').trim().toLowerCase();
            const dtCode = String(dt.taskCodePhu || '').trim().toLowerCase();
            if (tsName && dtName && tsName === dtName && (!tsCode || !dtCode || tsCode === dtCode)) {
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
    const { localDb } = await import('./localDb');
    await localDb.tasks.bulkDelete(Array.from(idSet));
    if (modifiedProjectsForDexie.length > 0) {
      await localDb.projects.bulkPut(modifiedProjectsForDexie);
    }
    if (unlinkedChildTasks.length > 0) {
      await Promise.all(unlinkedChildTasks.map(c => 
        (localDb.tasks.update as any)(c.id, { parentTaskId: null, parentId: null, updatedAt: now })
      ));
    }
  } catch (e) {
    console.warn('[taskStateService] Dexie bulkDelete tasks error:', e);
  }

  // 4. Xóa tệp đính kèm trên Firebase Storage
  try {
    const { extractStorageUrls, deleteStorageFiles } = await import('./storageUtils');
    const urls: string[] = [];
    tasksToDelete.forEach(t => {
      const extracted = extractStorageUrls(t);
      if (extracted.length > 0) urls.push(...extracted);
    });
    if (urls.length > 0) {
      deleteStorageFiles(urls).catch(() => {});
    }
  } catch (e) {}

  // 5. Đồng bộ xóa Task & cập nhật Project Summaries trong cùng 1 Batch + phát Delta Sync lên Firestore
  try {
    const { doc, deleteField } = await import('firebase/firestore');
    const { writeBatch } = await import('./firestoreWrites');
    const { db, APP_ID } = await import('./firebase');
    const { recordBatchDeltas } = await import('./deltaSyncService');
    const { markExplicitDelta } = await import('./autoDeltaQueue');
    const batch = writeBatch(db);

    const allIdsToDelete = new Set<string>();
    rawIds.forEach(id => { if (id) allIdsToDelete.add(String(id)); });
    tasksToDelete.forEach(t => { if (t?.id) allIdsToDelete.add(String(t.id)); });

    allIdsToDelete.forEach(id => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
      batch.delete(docRef);
    });

    unlinkedChildTasks.forEach(c => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', c.id);
      batch.update(docRef, { parentTaskId: deleteField(), parentId: null, updatedAt: now });
    });

    // Cập nhật Project Summaries ngay trong cùng Batch này
    updatedProjects.forEach(up => {
      const orig = currentProjects.find(op => op.id === up.id);
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
          updatedAt: up.updatedAt || now
        });
      }
    });

    const currentUser = useAppStore.getState().currentUser;
    const deltaItems: any[] = [
      ...Array.from(allIdsToDelete).map(id => {
        const dt = tasksToDelete.find(t => String(t.id) === String(id));
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
            ...(dt?.projectYear !== undefined && dt?.projectYear !== null ? { projectYear: dt.projectYear } : {}),
            ...(dt?.taskCodePhu ? { taskCodePhu: dt.taskCodePhu } : {}),
            ...(dt?.name ? { name: dt.name } : {}),
          },
          ...(dt?.projectYear ? { year: String(dt.projectYear) } : {}),
        };
      }),
      ...unlinkedChildTasks.map(c => ({
        docId: c.id,
        collectionName: 'taka_tasks',
        action: 'update',
        isPatch: true,
        data: { parentTaskId: null, parentId: null, updatedAt: now },
        ...(c.projectYear ? { year: String(c.projectYear) } : {}),
      })),
      ...updatedProjects.filter(up => {
        const orig = currentProjects.find(op => op.id === up.id);
        return orig && orig !== up;
      }).map(up => ({
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
          updatedAt: up.updatedAt || now
        },
        year: String(up.year || '')
      }))
    ];

    markExplicitDelta(deltaItems);
    await batch.commit();
    await recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username);
  } catch (e) {
    console.warn('[taskStateService] Failed to persist task deletion to Firestore:', e);
  }
}

/**
 * Shared State Handler: Xóa Dự Án đồng bộ giữa mọi Tab (DetailTab, ProjectModal, QuickNav)
 * 1. Optimistic update: Xóa Project, Tasks, Costs, Delegations khỏi Zustand store (0ms UI lag).
 * 2. Purge khỏi Dexie (IndexedDB) ngay lập tức để tránh re-hydrate lại project & tasks đã xóa.
 * 3. Batch commit đánh dấu isDeleted = true lên Firestore (projects, tasks, costs) & delete delegations.
 * 4. Xóa tệp đính kèm trên Firebase Storage.
 * 5. Ghi Delta log (taka_deltas) để đồng bộ đa màn hình / đa tab.
 */
export async function deleteProjectStateUnified(
  projectIdOrCode: string,
  projectObj?: Project
): Promise<void> {
  if (!projectIdOrCode) return;

  const store = useAppStore.getState();
  const currentProjects = store.projects;
  const currentTasks = store.tasks;
  const currentCosts = store.costs || [];
  const currentDelegations = store.delegationGroups || [];

  const targetKey = String(projectIdOrCode).trim().toLowerCase();

  // Tìm dự án trong store
  const targetProject = projectObj || currentProjects.find(p => 
    (p.id && String(p.id).trim().toLowerCase() === targetKey) ||
    (p.code && String(p.code).trim().toLowerCase() === targetKey) ||
    (p.no !== undefined && String(p.no).trim().toLowerCase() === targetKey)
  );

  const pCode = targetProject?.code ? String(targetProject.code).trim().toLowerCase() : targetKey;
  const pId = targetProject?.id ? String(targetProject.id) : (targetProject?.no !== undefined ? String(targetProject.no) : projectIdOrCode);

  const pStore = targetProject?.store ? String(targetProject.store).trim().toLowerCase() : '';
  const pYear = targetProject?.year !== undefined && targetProject?.year !== null ? String(targetProject.year).trim() : '';

  // Xác định các tasks liên quan
  const relatedTasks = currentTasks.filter(t => {
    if (!targetProject) return false;
    return isTaskBelongsToProject(t, targetProject);
  });
  const relatedTaskIds = new Set(relatedTasks.map(t => String(t.id)));

  // Xác định các costs liên quan
  const relatedCosts = currentCosts.filter(c => {
    const cStore = (c as any).projectStore ? String((c as any).projectStore).trim().toLowerCase() : '';
    const cYear = (c as any).projectYear !== undefined && (c as any).projectYear !== null ? String((c as any).projectYear).trim() : '';
    const cCode = c.projectCode ? String(c.projectCode).trim().toLowerCase() : '';

    if (pStore && cStore && pStore !== cStore) return false;
    if (pYear && cYear && pYear !== cYear) return false;

    if ((c as any).projectId && String((c as any).projectId) === pId) return true;
    if (cCode && pCode && (cCode === pCode || matchProjectCode(cCode, pCode))) return true;
    return false;
  });
  const relatedCostIds = new Set(relatedCosts.map(c => String(c.id)));

  // Xác định các delegations liên quan
  const relatedDelegations = currentDelegations.filter(d => {
    const dStore = (d as any).projectStore ? String((d as any).projectStore).trim().toLowerCase() : '';
    const dYear = (d as any).projectYear !== undefined && (d as any).projectYear !== null ? String((d as any).projectYear).trim() : '';
    const dCode = d.projectCode ? String(d.projectCode).trim().toLowerCase() : '';

    if (pStore && dStore && pStore !== dStore) return false;
    if (pYear && dYear && pYear !== dYear) return false;

    if ((d as any).projectId && String((d as any).projectId) === pId) return true;
    if (dCode && pCode && (dCode === pCode || matchProjectCode(dCode, pCode))) return true;
    if (d.parentTaskId && relatedTaskIds.has(String(d.parentTaskId))) return true;
    return false;
  });
  const relatedDelegationIds = new Set(relatedDelegations.map(d => String(d.id)));

  const nowIso = new Date().toISOString();

  // 1. Optimistic delete tức thì trong Zustand store
  const updatedProjects = currentProjects.filter(p => {
    if (pId && String(p.id) === pId) return false;
    const pStrCode = String(p.code || '').trim().toLowerCase();
    const pStrStore = p.store ? String(p.store).trim().toLowerCase() : '';
    const pStrYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';

    if (pStrCode === pCode) {
      if ((!pStore || !pStrStore || pStore === pStrStore) && (!pYear || !pStrYear || pYear === pStrYear)) {
        return false;
      }
    }
    return true;
  });
  const updatedTasks = currentTasks.filter(t => !relatedTaskIds.has(String(t.id)));
  const updatedCosts = currentCosts.filter(c => !relatedCostIds.has(String(c.id)));
  const updatedDelegations = currentDelegations.filter(d => !relatedDelegationIds.has(String(d.id)));

  store.setProjects(updatedProjects);
  store.setTasks(updatedTasks);
  store.setCosts(updatedCosts);
  store.setDelegationGroups(updatedDelegations);

  // 2. Clear khỏi Dexie (IndexedDB) lập tức (chỉ xóa đúng dự án cùng year & store, không xóa nhầm dự án năm khác cùng code)
  try {
    const { localDb } = await import('./localDb');
    await localDb.projects.delete(pId);
    if (targetProject?.id) await localDb.projects.delete(targetProject.id);
    if (pCode) {
      const sameCodeProjs = await localDb.projects.where('code').equalsIgnoreCase(pCode).toArray().catch(() => []);
      const idsToDelete = sameCodeProjs
        .filter(sp => {
          if (pId && String(sp.id) === pId) return true;
          const spStore = sp.store ? String(sp.store).trim().toLowerCase() : '';
          const spYear = sp.year !== undefined && sp.year !== null ? String(sp.year).trim() : '';
          if (pStore && spStore && pStore !== spStore) return false;
          if (pYear && spYear && pYear !== spYear) return false;
          return true;
        })
        .map(sp => sp.id)
        .filter(Boolean);
      if (idsToDelete.length > 0) {
        await localDb.projects.bulkDelete(idsToDelete).catch(() => {});
      }
    }
    if (relatedTaskIds.size > 0) {
      await localDb.tasks.bulkDelete(Array.from(relatedTaskIds));
    }
    if (relatedCostIds.size > 0) {
      await localDb.costs.bulkDelete(Array.from(relatedCostIds));
    }
    if (relatedDelegationIds.size > 0) {
      await localDb.delegations.bulkDelete(Array.from(relatedDelegationIds));
    }
  } catch (e) {
    console.warn('[taskStateService] Dexie project delete error:', e);
  }

  // 3. Storage Deep Clean (Rule 4)
  try {
    const { extractStorageUrls, deleteStorageFiles } = await import('./storageUtils');
    const urls: string[] = [];
    if (targetProject) urls.push(...extractStorageUrls(targetProject));
    relatedTasks.forEach(t => urls.push(...extractStorageUrls(t)));
    relatedCosts.forEach(c => urls.push(...extractStorageUrls(c)));
    if (urls.length > 0) {
      deleteStorageFiles(urls).catch(() => {});
    }
  } catch (e) {}

  if (relatedTaskIds.size > 0) {
    markTasksDeleted(Array.from(relatedTaskIds), pId);
  }

  // 4. Batch commit đánh dấu isDeleted = true trên Firestore
  try {
    const { doc } = await import('firebase/firestore');
    const { writeBatch } = await import('./firestoreWrites');
    const { db, APP_ID } = await import('./firebase');
    const { recordBatchDeltas } = await import('./deltaSyncService');
    const { markExplicitDelta } = await import('./autoDeltaQueue');

    const batch = writeBatch(db);

    // Đánh dấu xóa project
    const projectDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', pId);
    batch.set(projectDocRef, { id: pId, isDeleted: true, updatedAt: nowIso }, { merge: true });

    // Đánh dấu xóa related tasks
    relatedTasks.forEach(t => {
      const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
      batch.set(taskRef, { id: t.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
    });

    // Đánh dấu xóa related costs
    relatedCosts.forEach(c => {
      const costRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id);
      batch.set(costRef, { id: c.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
    });

    // Xóa delegation groups
    relatedDelegations.forEach(d => {
      const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id);
      batch.delete(delRef);
    });

    const currentUser = store.currentUser;
    const deltaItems: any[] = [
      { docId: pId, collectionName: 'taka_projects', action: 'delete', isPatch: false, data: { id: pId, isDeleted: true }, ...(pYear ? { year: pYear } : {}) },
      ...relatedTasks.map(t => ({
        docId: t.id, collectionName: 'taka_tasks', action: 'delete', isPatch: false, data: { id: t.id, isDeleted: true, projectId: pId }, ...(t.projectYear ? { year: String(t.projectYear) } : {})
      })),
      ...relatedCosts.map(c => ({
        docId: c.id, collectionName: 'taka_costs', action: 'delete', isPatch: false, data: { id: c.id, isDeleted: true }, ...((c as any).projectYear ? { year: String((c as any).projectYear) } : {})
      })),
      ...relatedDelegations.map(d => ({
        docId: d.id, collectionName: 'taka_delegations', action: 'delete', isPatch: false, data: { id: d.id, isDeleted: true }, ...((d as any).projectYear ? { year: String((d as any).projectYear) } : {})
      }))
    ];

    markExplicitDelta(deltaItems);
    await batch.commit();

    // 5. Ghi Delta Log
    recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
  } catch (err) {
    console.error('[taskStateService] deleteProjectStateUnified Firestore batch commit failed:', err);
  }
}

/**
 * Tự động phát hiện và xử lý các task mồ côi trong bộ nhớ (task con có parentTaskId chỉ đến task mẹ đã bị xóa)
 * Tự động chuyển task con mồ côi thành root task và ghi nhận sửa đổi xuống Dexie & Firestore.
 */
export function cleanOrphanTasks(tasks: Task[]): { cleaned: Task[]; fixedCount: number } {
  if (!tasks || tasks.length === 0) return { cleaned: tasks, fixedCount: 0 };

  const taskMap = new Map<string, Task>();
  const taskScopedCodeMap = new Map<string, Task>();

  const buildScopedParentKey = (t: Task, code: string) =>
    `${String(t.projectCode || '').trim().toLowerCase()}__${String(t.projectYear || '').trim()}__${String(t.projectStore || '').trim().toLowerCase()}__${code.trim().toLowerCase()}`;

  tasks.forEach(t => {
    if (t.id) taskMap.set(String(t.id).toLowerCase(), t);
    if (t.taskCodePhu) {
      taskScopedCodeMap.set(buildScopedParentKey(t, String(t.taskCodePhu)), t);
    }
  });

  const now = new Date().toISOString();
  let fixedCount = 0;
  const orphanTaskUpdates: (Partial<Task> & { id: string })[] = [];

  const cleaned = tasks.map(t => {
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (!rawParent) return t;

    const parentStr = String(rawParent).trim().toLowerCase();
    const parentTask =
      taskMap.get(parentStr) ||
      taskScopedCodeMap.get(buildScopedParentKey(t, parentStr));

    if (!parentTask || parentTask.isDeleted || String(parentTask.id) === String(t.id)) {
      // Parent task deleted or missing -> Promote orphan task to root task
      fixedCount++;
      const updated = { ...t, parentTaskId: undefined, updatedAt: now };
      delete (updated as any).parentId;
      orphanTaskUpdates.push({ id: t.id, parentTaskId: undefined, updatedAt: now });
      return updated;
    }

    return t;
  });

  // NOTE: Do NOT automatically delete parentTaskId in Firestore during partial memory loading!
  // When tasks are loaded in chunks or filtered by project, parent tasks may not be in memory yet.
  // Deleting parentTaskId in Firestore would destroy the task hierarchy across other devices.

  return { cleaned, fixedCount };
}

/**
 * Shared State Handler: Sắp xếp / Đổi toàn bộ danh sách Tasks (Reorder / Batch Sort)
 */
export async function reorderTasksStateUnified(
  allUpdatedTasks: Task[],
  options?: { affectedProjectIds?: string[]; syncProjects?: boolean }
): Promise<void> {
  if (!allUpdatedTasks) return;

  // 1. Cập nhật toàn bộ Tasks vào Zustand
  useAppStore.getState().setTasks(allUpdatedTasks);

  if (options?.syncProjects === false) return;

  const allProjects = useAppStore.getState().projects;
  let targetProjects: Project[] = [];

  if (options?.affectedProjectIds && options.affectedProjectIds.length > 0) {
    const idSet = new Set(options.affectedProjectIds);
    targetProjects = allProjects.filter(p => p.id && idSet.has(p.id));
  } else {
    targetProjects = findAffectedProjects(allUpdatedTasks, allProjects);
  }

  await syncAffectedProjects(targetProjects, allUpdatedTasks);
}
