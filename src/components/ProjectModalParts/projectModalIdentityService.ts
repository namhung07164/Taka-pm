import { Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { removeCodeFromLinkCodesString, extractAllProjectCodes } from '../../lib/utils';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { undoManager } from '../../lib/undoManager';
import { getProjectCodeChangePredecessorUpdates } from '../../lib/ganttUtils';
import { recordBatchDeltas } from '../../lib/deltaSyncService';

interface HandleProjectIdentityChangeParams {
  project: Project;
  formData: Partial<Project>;
  dataToSave: any;
  docId: string;
  yearNum: number;
  projects: Project[];
  setToast: (toast: any) => void;
}

export async function handleProjectIdentityChange({
  project,
  formData,
  dataToSave,
  docId,
  yearNum,
  projects,
  setToast
}: HandleProjectIdentityChangeParams) {
  const batch = writeBatch(db);
  const projectRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
  batch.set(projectRef, {
    ...dataToSave,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  let rawTasks = useAppStore.getState().tasks || [];
  const oldPCode = String(project.code || '').trim().toLowerCase();
  const oldPYear = String(project.year || '');
  const oldPStore = String(project.store || '').trim().toLowerCase();

  let relatedTasks = rawTasks.filter(t => {
    const matchesCode = String(t.projectCode || '').trim().toLowerCase() === oldPCode;
    const matchesYear = !t.projectYear || !oldPYear || String(t.projectYear) === oldPYear;
    const matchesStore = !t.projectStore || !oldPStore || String(t.projectStore).trim().toLowerCase() === oldPStore;
    return matchesCode && matchesYear && matchesStore;
  });

  // If memory does not have tasks for this project (e.g. mobile lazy load), check Dexie first, then Firestore only if needed
  if (relatedTasks.length === 0 && project.code && (project.taskCount || (project.taskSummaries && project.taskSummaries.length > 0))) {
    try {
      const { getLocalTasksForProjects, bulkPersistTasks } = await import('../../lib/localDb');
      let loaded: Task[] = (await getLocalTasksForProjects([project.code])).filter(dt => !dt.isDeleted);
      if (loaded.length === 0) {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const q = query(
          collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks'),
          where('projectCode', '==', project.code)
        );
        const snap = await getDocs(q);
        loaded = [];
        snap.forEach(d => {
          const dt = { id: d.id, ...d.data() } as Task;
          if (!dt.isDeleted) loaded.push(dt);
        });
        if (loaded.length > 0) bulkPersistTasks(loaded).catch(() => {});
      }
      if (loaded.length > 0) {
        relatedTasks = loaded.filter(t => {
          const matchesYear = !t.projectYear || !oldPYear || String(t.projectYear) === oldPYear;
          const matchesStore = !t.projectStore || !oldPStore || String(t.projectStore).trim().toLowerCase() === oldPStore;
          return matchesYear && matchesStore;
        });
        const existingIds = new Set(rawTasks.map(t => t.id));
        rawTasks = [...rawTasks, ...loaded.filter(t => !existingIds.has(t.id))];
        useAppStore.getState().setTasks(rawTasks);
      }
    } catch (err) {
      console.warn("Failed to fetch tasks for project identity change from Firestore:", err);
    }
  }

  const { taskUpdates, predecessorUpdates } = getProjectCodeChangePredecessorUpdates(
    project,
    String(formData.code).trim(),
    formData.year,
    formData.store,
    rawTasks,
    projects
  );

  const relatedTaskIds = new Set(relatedTasks.map(t => t.id));

  relatedTasks.forEach(t => {
    const tUpdate = taskUpdates.get(t.id) || {
      projectCode: String(formData.code).trim(),
      projectYear: yearNum,
      projectStore: formData.store
    };
    const pu = predecessorUpdates.find(p => p.id === t.id);
    const payload: any = {
      ...tUpdate,
      updatedAt: new Date().toISOString()
    };
    if (pu && pu.predecessor !== undefined) {
      payload.predecessor = pu.predecessor;
    }
    Object.keys(payload).forEach(k => {
      if (payload[k] === undefined) delete payload[k];
    });
    batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), payload, { merge: true });
  });

  predecessorUpdates.forEach(pu => {
    if (!relatedTaskIds.has(pu.id)) {
      const payload: any = {
        predecessor: pu.predecessor,
        updatedAt: pu.updatedAt || new Date().toISOString()
      };
      Object.keys(payload).forEach(k => {
        if (payload[k] === undefined) delete payload[k];
      });
      batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id), payload, { merge: true });
    }
  });

  const storeCosts = useAppStore.getState().costs || [];
  const relatedCosts = storeCosts.filter(c => {
    const matchesCode = String(c.projectCode || '').trim().toLowerCase() === oldPCode;
    const matchesYear = !c.projectYear || !oldPYear || String(c.projectYear) === oldPYear;
    const matchesStore = !c.projectStore || !oldPStore || String(c.projectStore).trim().toLowerCase() === oldPStore;
    return matchesCode && matchesYear && matchesStore;
  });

  relatedCosts.forEach(c => {
    const payload: any = {
      projectCode: String(formData.code).trim(),
      projectYear: yearNum,
      projectStore: formData.store,
      updatedAt: new Date().toISOString()
    };
    Object.keys(payload).forEach(k => {
      if (payload[k] === undefined) delete payload[k];
    });
    batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), payload, { merge: true });
  });

  const predMap = new Map(predecessorUpdates.map(pu => [pu.id, pu.predecessor]));
  const updatedTasks = rawTasks.map(t => {
    const tUpdate = taskUpdates.get(t.id);
    const newPred = predMap.get(t.id);
    if (tUpdate || newPred !== undefined) {
      return {
        ...t,
        ...(tUpdate || {}),
        ...(newPred !== undefined ? { predecessor: newPred, updatedAt: new Date().toISOString() } : {})
      };
    }
    return t;
  });
  useAppStore.getState().setTasks(updatedTasks);

  const rawProjects = useAppStore.getState().projects || [];
  const savedCode = String(formData.code).trim().toLowerCase();
  const savedYearStr = String(formData.year || '').trim();
  const savedStoreStr = String(formData.store || '').trim().toUpperCase();

  const updatedProjects = rawProjects.map(p => {
    if ((p.id && p.id === project.id) || (p.no !== undefined && project.no !== undefined && p.no === project.no)) {
      return { ...p, ...dataToSave, id: project.id || docId, updatedAt: new Date().toISOString() };
    }
    const pStore = String(p.store || '').trim().toUpperCase();
    const pYear = String(p.year || '').trim();
    if ((!savedStoreStr || !pStore || pStore === savedStoreStr) && (!savedYearStr || !pYear || pYear === savedYearStr)) {
      if (p.linkCodes) {
        const allCodes = extractAllProjectCodes(p);
        if (allCodes.includes(savedCode) && String(p.code || '').trim().toLowerCase() !== savedCode) {
          const cleaned = removeCodeFromLinkCodesString(p.linkCodes, formData.code);
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', p.id || String(p.no)), {
            linkCodes: cleaned,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          return { ...p, linkCodes: cleaned, updatedAt: new Date().toISOString() };
        }
      }
    }
    return p;
  });
  useAppStore.getState().setProjects(updatedProjects);

  const identityDeltaItems = [
    { docId, collectionName: 'taka_projects' as const, action: 'update' as const, data: dataToSave, year: String(yearNum) },
    ...relatedTasks.map(t => ({
      docId: t.id,
      collectionName: 'taka_tasks' as const,
      action: 'update' as const,
      data: { projectCode: String(formData.code).trim(), projectYear: yearNum, projectStore: formData.store },
      year: String(yearNum)
    })),
    ...relatedCosts.map(c => ({
      docId: c.id,
      collectionName: 'taka_costs' as const,
      action: 'update' as const,
      data: { projectCode: String(formData.code).trim(), projectYear: yearNum, projectStore: formData.store },
      year: String(yearNum)
    }))
  ];
  import('../../lib/autoDeltaQueue')
    .then(({ markExplicitDelta }) => markExplicitDelta(identityDeltaItems))
    .catch(() => {});

  batch.commit().then(() => {
    recordBatchDeltas(identityDeltaItems).catch(console.error);
  }).catch(e => {
    console.error("Batch commit failed", e);
    setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
  });

  undoManager.push({
    description: `Update Identity: ${project.code}(${project.year}) -> ${formData.code}(${formData.year})`,
    revert: async () => {
      const revertBatch = writeBatch(db);
      revertBatch.set(projectRef, project, { merge: true });
      relatedTasks.forEach(t => {
        const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
        revertBatch.set(tRef, {
          projectCode: project.code,
          projectYear: project.year,
          projectStore: project.store,
          ...(t.taskCodePhu !== undefined ? { taskCodePhu: t.taskCodePhu } : {}),
          ...(t.predecessor !== undefined ? { predecessor: t.predecessor } : {})
        }, { merge: true });
      });
      predecessorUpdates.forEach(pu => {
        if (!relatedTaskIds.has(pu.id)) {
          const originalTask = rawTasks.find(st => st.id === pu.id);
          revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id), {
            predecessor: originalTask?.predecessor || ''
          }, { merge: true });
        }
      });
      relatedCosts.forEach(c => {
        const cRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id);
        revertBatch.set(cRef, {
          projectCode: project.code,
          projectYear: project.year,
          projectStore: project.store
        }, { merge: true });
      });
      revertBatch.commit().catch(console.error);
    }
  });
}
