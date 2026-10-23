import { Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { matchProjectCode } from '../projectDatesService';
import { markTasksDeleted, markProjectsDeleted } from '../taskDeletedTracker';
import { isTaskBelongsToProject as isTaskBelongsToProjectCore } from '../utils';

/**
 * Shared State Handler: Xóa Dự Án đồng bộ giữa mọi Tab (DetailTab, ProjectModal, QuickNav, Gantt)
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

  const targetProject =
    projectObj ||
    currentProjects.find((p) => p.id && String(p.id).trim().toLowerCase() === targetKey) ||
    currentProjects.find((p) => p.code && String(p.code).trim().toLowerCase() === targetKey) ||
    currentProjects.find((p) => p.no !== undefined && String(p.no).trim().toLowerCase() === targetKey);

  const pCode = targetProject?.code ? String(targetProject.code).trim().toLowerCase() : targetKey;
  const pId = targetProject?.id
    ? String(targetProject.id)
    : targetProject?.no !== undefined
      ? String(targetProject.no)
      : projectIdOrCode;

  markProjectsDeleted([pId, targetProject?.id ? String(targetProject.id) : undefined]);

  const pStore = targetProject?.store ? String(targetProject.store).trim().toLowerCase() : '';
  const pYear =
    targetProject?.year !== undefined && targetProject?.year !== null
      ? String(targetProject.year).trim()
      : '';

  const relatedTaskMap = new Map<string, Task>();
  currentTasks.forEach((t) => {
    if (!targetProject || !t?.id) return;
    if (isTaskBelongsToProjectCore(t, targetProject)) {
      relatedTaskMap.set(String(t.id), t);
    }
  });

  // Also include task IDs from targetProject.taskSummaries (critical when project is collapsed and store.tasks is empty)
  if (Array.isArray(targetProject?.taskSummaries)) {
    targetProject.taskSummaries.forEach((s: any) => {
      const sId = s?.id ? String(s.id).trim() : '';
      if (sId && !sId.startsWith('ts_') && !relatedTaskMap.has(sId)) {
        relatedTaskMap.set(sId, {
          id: sId,
          name: s.name || '',
          start: s.start || '',
          finish: s.finish || '',
          projectId: pId,
          projectCode: targetProject?.code || '',
          projectStore: targetProject?.store,
          projectYear: targetProject?.year,
          taskCodePhu: s.taskCodePhu,
        } as Task);
      }
    });
  }

  const relatedTaskIds = new Set<string>(relatedTaskMap.keys());

  const relatedCosts = currentCosts.filter((c) => {
    const cStore = (c as any).projectStore ? String((c as any).projectStore).trim().toLowerCase() : '';
    const cYear =
      (c as any).projectYear !== undefined && (c as any).projectYear !== null
        ? String((c as any).projectYear).trim()
        : '';
    const cCode = c.projectCode ? String(c.projectCode).trim().toLowerCase() : '';

    if (pStore && cStore && pStore !== cStore) return false;
    if (pYear && cYear && pYear !== cYear) return false;

    if ((c as any).projectId && String((c as any).projectId) === pId) return true;
    if (cCode && pCode && (cCode === pCode || matchProjectCode(cCode, pCode))) return true;
    return false;
  });
  const relatedCostIds = new Set(relatedCosts.map((c) => String(c.id)));

  const relatedDelegations = currentDelegations.filter((d) => {
    const dStore = (d as any).projectStore ? String((d as any).projectStore).trim().toLowerCase() : '';
    const dYear =
      (d as any).projectYear !== undefined && (d as any).projectYear !== null
        ? String((d as any).projectYear).trim()
        : '';
    const dCode = d.projectCode ? String(d.projectCode).trim().toLowerCase() : '';

    if (pStore && dStore && pStore !== dStore) return false;
    if (pYear && dYear && pYear !== dYear) return false;

    if ((d as any).projectId && String((d as any).projectId) === pId) return true;
    if (dCode && pCode && (dCode === pCode || matchProjectCode(dCode, pCode))) return true;
    if (d.parentTaskId && relatedTaskIds.has(String(d.parentTaskId))) return true;
    return false;
  });
  const relatedDelegationIds = new Set(relatedDelegations.map((d) => String(d.id)));

  const nowIso = new Date().toISOString();

  const updatedProjects = currentProjects.filter((p) => {
    if (pId && String(p.id) === pId) return false;
    const pStrCode = String(p.code || '').trim().toLowerCase();
    const pStrStore = p.store ? String(p.store).trim().toLowerCase() : '';
    const pStrYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';

    if (pStrCode === pCode) {
      if (
        (!pStore || !pStrStore || pStore === pStrStore) &&
        (!pYear || !pStrYear || pYear === pStrYear)
      ) {
        return false;
      }
    }
    return true;
  });
  const updatedTasks = currentTasks.filter((t) => !relatedTaskIds.has(String(t.id)));
  const updatedCosts = currentCosts.filter((c) => !relatedCostIds.has(String(c.id)));
  const updatedDelegations = currentDelegations.filter((d) => !relatedDelegationIds.has(String(d.id)));

  store.setProjects(updatedProjects);
  store.setTasks(updatedTasks);
  store.setCosts(updatedCosts);
  store.setDelegationGroups(updatedDelegations);

  try {
    const { localDb } = await import('../localDb');
    // Also discover any tasks in Dexie belonging to this project that were not in store.tasks or taskSummaries
    if (targetProject) {
      const [dexieById, dexieByCode] = await Promise.all([
        localDb.tasks.where('projectId').equals(pId).toArray().catch(() => []),
        targetProject.code
          ? localDb.tasks.where('projectCode').equals(String(targetProject.code).trim()).toArray().catch(() => [])
          : Promise.resolve([]),
      ]);
      [...dexieById, ...dexieByCode].forEach((dt) => {
        if (dt?.id && isTaskBelongsToProjectCore(dt, targetProject)) {
          relatedTaskIds.add(String(dt.id));
          if (!relatedTaskMap.has(String(dt.id))) {
            relatedTaskMap.set(String(dt.id), dt);
          }
        }
      });
    }
    await localDb.projects.delete(pId);
    if (targetProject?.id) await localDb.projects.delete(targetProject.id);
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

  const allRelatedTasks = Array.from(relatedTaskMap.values());

  try {
    const { extractStorageUrls, deleteStorageFiles } = await import('../storageUtils');
    const urls: string[] = [];
    if (targetProject) urls.push(...extractStorageUrls(targetProject));
    allRelatedTasks.forEach((t) => urls.push(...extractStorageUrls(t)));
    relatedCosts.forEach((c) => urls.push(...extractStorageUrls(c)));
    if (urls.length > 0) {
      deleteStorageFiles(urls).catch(() => {});
    }
  } catch {}

  if (relatedTaskIds.size > 0) {
    markTasksDeleted(Array.from(relatedTaskIds), pId);
  }

  try {
    const { doc } = await import('firebase/firestore');
    const { writeBatch } = await import('../firestoreWrites');
    const { db, APP_ID } = await import('../firebase');
    const { recordBatchDeltas } = await import('../deltaSyncService');
    const { markExplicitDelta } = await import('../autoDeltaQueue');

    const batch = writeBatch(db);

    const projectDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', pId);
    batch.set(
      projectDocRef,
      { id: pId, isDeleted: true, taskSummaries: [], taskCount: 0, updatedAt: nowIso },
      { merge: true }
    );

    allRelatedTasks.forEach((t) => {
      if (!t?.id || String(t.id).startsWith('ts_')) return;
      const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', String(t.id));
      batch.delete(taskRef);
    });

    relatedCosts.forEach((c) => {
      const costRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id);
      batch.set(costRef, { id: c.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
    });

    relatedDelegations.forEach((d) => {
      const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id);
      batch.delete(delRef);
    });

    const currentUser = store.currentUser;
    const deltaItems: any[] = [
      {
        docId: pId,
        collectionName: 'taka_projects',
        action: 'delete',
        isPatch: false,
        data: {
          id: pId,
          isDeleted: true,
          code: targetProject?.code || pCode,
          store: targetProject?.store || pStore,
          ...(pYear ? { year: pYear } : {}),
        },
        ...(pYear ? { year: pYear } : {}),
      },
      ...allRelatedTasks
        .filter((t) => t?.id && !String(t.id).startsWith('ts_'))
        .map((t) => ({
          docId: String(t.id),
          collectionName: 'taka_tasks',
          action: 'delete',
          isPatch: false,
          data: {
            id: String(t.id),
            isDeleted: true,
            projectId: pId,
            projectCode: t.projectCode || targetProject?.code || pCode,
            projectStore: t.projectStore || targetProject?.store || pStore,
            projectYear: t.projectYear ?? targetProject?.year ?? pYear,
          },
          ...(t.projectYear || pYear ? { year: String(t.projectYear || pYear) } : {}),
        })),
      ...relatedCosts.map((c) => ({
        docId: c.id,
        collectionName: 'taka_costs',
        action: 'delete',
        isPatch: false,
        data: { id: c.id, isDeleted: true },
        ...((c as any).projectYear ? { year: String((c as any).projectYear) } : {}),
      })),
      ...relatedDelegations.map((d) => ({
        docId: d.id,
        collectionName: 'taka_delegations',
        action: 'delete',
        isPatch: false,
        data: { id: d.id, isDeleted: true },
        ...((d as any).projectYear ? { year: String((d as any).projectYear) } : {}),
      })),
    ];

    markExplicitDelta(deltaItems);
    await batch.commit();

    recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
  } catch (err) {
    console.error('[taskStateService] deleteProjectStateUnified Firestore batch commit failed:', err);
  }
}

