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

// Cache in-flight requests to avoid duplicate fetches
const pendingProjectFetches = new Map<string, Promise<Task[]>>();

/**
 * Ensures tasks for a specific projectCode are loaded into Zustand store.
 * Useful when resolving cross-project predecessors dynamically.
 */
export async function ensureProjectTasksLoaded(projectCode: string): Promise<Task[]> {
  if (!projectCode) return [];
  const cleanCode = projectCode.trim();
  const currentTasks = useAppStore.getState().tasks || [];
  
  // If we already have tasks for this project in memory, return them
  const existing = currentTasks.filter(t => 
    t.projectCode && t.projectCode.trim().toLowerCase() === cleanCode.toLowerCase()
  );
  if (existing.length > 0) return existing;

  // If already fetching, return existing promise
  if (pendingProjectFetches.has(cleanCode.toLowerCase())) {
    return pendingProjectFetches.get(cleanCode.toLowerCase())!;
  }

  const fetchPromise = (async () => {
    try {
      const q = query(
        collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
        where("projectCode", "==", cleanCode)
      );
      const snap = await getDocs(q);
      const loaded: Task[] = [];
      snap.forEach(docSnap => {
        const d = { id: docSnap.id, ...docSnap.data() } as Task;
        if (!d.isDeleted) loaded.push(d);
      });

      if (loaded.length > 0) {
        const latestTasks = useAppStore.getState().tasks || [];
        const currentIds = new Set(latestTasks.map(t => t.id));
        const toAdd = loaded.filter(t => !currentIds.has(t.id));
        if (toAdd.length > 0) {
          useAppStore.getState().setTasks([...latestTasks, ...toAdd]);
        }
      }
      return loaded;
    } catch (err) {
      console.warn("Failed to fetch tasks for external project:", cleanCode, err);
      return [];
    } finally {
      pendingProjectFetches.delete(cleanCode.toLowerCase());
    }
  })();

  pendingProjectFetches.set(cleanCode.toLowerCase(), fetchPromise);
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
    if (!t.projectCode) continue;
    const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : "";
    const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : "";

    for (const p of projects) {
      if (!p.id || !p.code) continue;

      const pStore = p.store ? String(p.store).trim().toLowerCase() : "";
      const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : "";

      const matchesCode =
        String(p.code).trim().toLowerCase() === String(t.projectCode).trim().toLowerCase() ||
        matchProjectCode(p.code, t.projectCode);

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
  taskIds: string[],
  options?: { syncProjects?: boolean }
): Promise<void> {
  if (!taskIds || taskIds.length === 0) return;

  const idSet = new Set(taskIds.map(String));
  const currentTasks = useAppStore.getState().tasks;
  const tasksToDelete = currentTasks.filter(t => idSet.has(String(t.id)));
  const affectedProjects = findAffectedProjects(tasksToDelete);

  // Collect codes and IDs of deleted tasks for unlinking and predecessor cleanup
  const deletedCodesAndIds = new Set<string>();
  tasksToDelete.forEach(t => {
    if (t.id) deletedCodesAndIds.add(String(t.id).trim().toLowerCase());
    if (t.taskCodePhu) deletedCodesAndIds.add(String(t.taskCodePhu).trim().toLowerCase());
  });

  // 1. Unlink child tasks if a parent task was deleted, and clean stale predecessor strings
  const now = new Date().toISOString();
  const tasksAfterDeletion = useAppStore.getState().tasks.filter(t => !idSet.has(String(t.id)));
  
  const unlinkedChildTasks: Task[] = [];
  const cleanedTasks = tasksAfterDeletion.map(t => {
    let updated = t;

    // Check if child task lost its parent
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (rawParent && deletedCodesAndIds.has(String(rawParent).trim().toLowerCase())) {
      updated = { ...updated, parentTaskId: undefined, updatedAt: now };
      delete (updated as any).parentId;
      unlinkedChildTasks.push(updated);
    }

    // Clean deleted task codes/IDs from predecessor string
    if (updated.predecessor && typeof updated.predecessor === 'string') {
      const predParts = updated.predecessor.split(',').map(p => p.trim()).filter(Boolean);
      const filteredParts = predParts.filter(part => {
        // Strip relationship suffixes like SS, FF, SF, FS or lag +2d to extract task code
        const codeOnly = part.replace(/(?:SS|FF|SF|FS)?\s*(?:[+-]\d+[dwmy]?)?$/i, '').trim().toLowerCase();
        return !deletedCodesAndIds.has(codeOnly);
      });
      const newPred = filteredParts.join(', ');
      if (newPred !== updated.predecessor) {
        updated = { ...updated, predecessor: newPred, updatedAt: now };
      }
    }

    return updated;
  });

  useAppStore.getState().setTasks(cleanedTasks);

  // 2. Xóa tức thì khỏi Dexie (IndexedDB) & lưu cập nhật các task con bị gỡ link
  try {
    const { localDb } = await import('./localDb');
    await localDb.tasks.bulkDelete(Array.from(idSet));
    await localDb.tasks.bulkDelete(taskIds as any);

    if (unlinkedChildTasks.length > 0) {
      await Promise.all(unlinkedChildTasks.map(c => 
        (localDb.tasks.update as any)(c.id, { parentTaskId: null, parentId: null, updatedAt: now })
      ));
    }
  } catch (e) {
    console.warn('[taskStateService] Dexie bulkDelete tasks error:', e);
  }

  // 3. Xóa tệp đính kèm trên Firebase Storage (Storage Deep Clean - Rule 4)
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

  // 4. Đồng bộ đánh dấu isDeleted = true & Delta Sync lên Firestore cho các task bị xóa
  setTimeout(async () => {
    try {
      const { doc, writeBatch, deleteField } = await import('firebase/firestore');
      const { db, APP_ID } = await import('./firebase');
      const { recordBatchDeltas } = await import('./deltaSyncService');
      const batch = writeBatch(db);

      // Đánh dấu isDeleted = true cho các task bị xóa
      tasksToDelete.forEach(t => {
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
        batch.set(docRef, { id: t.id, isDeleted: true, updatedAt: now }, { merge: true });
      });

      // Gỡ link parentTaskId cho các task con bị mồ côi
      unlinkedChildTasks.forEach(c => {
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', c.id);
        batch.update(docRef, { parentTaskId: deleteField(), parentId: null, updatedAt: now });
      });

      await batch.commit();

      const currentUser = useAppStore.getState().currentUser;
      const deltaItems: any[] = [
        ...tasksToDelete.map(t => ({
          docId: t.id, collectionName: 'taka_tasks', action: 'delete', isPatch: false, data: null
        })),
        ...unlinkedChildTasks.map(c => ({
          docId: c.id, collectionName: 'taka_tasks', action: 'update', isPatch: true,
          data: { parentTaskId: null, parentId: null, updatedAt: now }
        }))
      ];
      recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
    } catch (e) {
      console.warn('[taskStateService] Failed to persist task deletion to Firestore:', e);
    }
  }, 50);

  if (options?.syncProjects === false) return;

  // 5. Tính lại tiến độ & mốc ngày cho các dự án với danh sách tasks còn lại
  const remainingTasks = useAppStore.getState().tasks;
  await syncAffectedProjects(affectedProjects, remainingTasks);
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

  // Xác định các tasks liên quan
  const relatedTasks = currentTasks.filter(t => {
    if (t.projectId && String(t.projectId) === pId) return true;
    if (t.projectCode && String(t.projectCode).trim().toLowerCase() === pCode) return true;
    return false;
  });
  const relatedTaskIds = new Set(relatedTasks.map(t => String(t.id)));

  // Xác định các costs liên quan
  const relatedCosts = currentCosts.filter(c => {
    if ((c as any).projectId && String((c as any).projectId) === pId) return true;
    if (c.projectCode && String(c.projectCode).trim().toLowerCase() === pCode) return true;
    return false;
  });
  const relatedCostIds = new Set(relatedCosts.map(c => String(c.id)));

  // Xác định các delegations liên quan
  const relatedDelegations = currentDelegations.filter(d => {
    if ((d as any).projectId && String((d as any).projectId) === pId) return true;
    if (d.projectCode && String(d.projectCode).trim().toLowerCase() === pCode) return true;
    if (d.parentTaskId && relatedTaskIds.has(String(d.parentTaskId))) return true;
    return false;
  });
  const relatedDelegationIds = new Set(relatedDelegations.map(d => String(d.id)));

  const nowIso = new Date().toISOString();

  // 1. Optimistic delete tức thì trong Zustand store
  const updatedProjects = currentProjects.filter(p => 
    String(p.id) !== pId && 
    String(p.code || '').trim().toLowerCase() !== pCode &&
    String(p.no ?? '') !== pId
  );
  const updatedTasks = currentTasks.filter(t => !relatedTaskIds.has(String(t.id)));
  const updatedCosts = currentCosts.filter(c => !relatedCostIds.has(String(c.id)));
  const updatedDelegations = currentDelegations.filter(d => !relatedDelegationIds.has(String(d.id)));

  store.setProjects(updatedProjects);
  store.setTasks(updatedTasks);
  store.setCosts(updatedCosts);
  store.setDelegationGroups(updatedDelegations);

  // 2. Clear khỏi Dexie (IndexedDB) lập tức
  try {
    const { localDb } = await import('./localDb');
    await localDb.projects.delete(pId);
    if (targetProject?.id) await localDb.projects.delete(targetProject.id);
    if (pCode) {
      await localDb.projects.where('code').equalsIgnoreCase(pCode).delete().catch(() => {});
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

  // 4. Batch commit đánh dấu isDeleted = true trên Firestore
  try {
    const { doc, writeBatch } = await import('firebase/firestore');
    const { db, APP_ID } = await import('./firebase');
    const { recordBatchDeltas } = await import('./deltaSyncService');

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

    await batch.commit();

    // 5. Ghi Delta Log
    const currentUser = store.currentUser;
    const deltaItems: any[] = [
      { docId: pId, collectionName: 'taka_projects', action: 'delete', isPatch: false, data: null },
      ...relatedTasks.map(t => ({
        docId: t.id, collectionName: 'taka_tasks', action: 'delete', isPatch: false, data: null
      })),
      ...relatedCosts.map(c => ({
        docId: c.id, collectionName: 'taka_costs', action: 'delete', isPatch: false, data: null
      })),
      ...relatedDelegations.map(d => ({
        docId: d.id, collectionName: 'taka_delegation_groups', action: 'delete', isPatch: false, data: null
      }))
    ];
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
  const taskCodeMap = new Map<string, Task>();

  tasks.forEach(t => {
    if (t.id) taskMap.set(String(t.id).toLowerCase(), t);
    if (t.taskCodePhu) taskCodeMap.set(String(t.taskCodePhu).trim().toLowerCase(), t);
  });

  const now = new Date().toISOString();
  let fixedCount = 0;
  const orphanTaskUpdates: (Partial<Task> & { id: string })[] = [];

  const cleaned = tasks.map(t => {
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (!rawParent) return t;

    const parentStr = String(rawParent).trim().toLowerCase();
    const parentTask = taskMap.get(parentStr) || taskCodeMap.get(parentStr);

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

  if (orphanTaskUpdates.length > 0) {
    setTimeout(async () => {
      try {
        const { localDb } = await import('./localDb');
        const { doc, writeBatch, deleteField } = await import('firebase/firestore');
        const { db, APP_ID } = await import('./firebase');
        const batch = writeBatch(db);

        await Promise.all(orphanTaskUpdates.map(u => 
          (localDb.tasks.update as any)(u.id, { parentTaskId: null, parentId: null, updatedAt: now })
        ));

        orphanTaskUpdates.forEach(u => {
          const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', u.id);
          batch.update(docRef, { parentTaskId: deleteField(), parentId: null, updatedAt: now });
        });
        await batch.commit();
      } catch (e) {
        console.warn('[taskStateService] Failed to persist orphan task cleanup:', e);
      }
    }, 100);
  }

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
