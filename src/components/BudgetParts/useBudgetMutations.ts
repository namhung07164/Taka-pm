import { Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { undoManager } from '../../lib/undoManager';

interface UseBudgetMutationsParams {
  projects: Project[];
}

export function useBudgetMutations({ projects }: UseBudgetMutationsParams) {
  const handleUpdateProject = async (p: Project, field: keyof Project, value: any) => {
    if (!p) return;
    const docId = p.id || String(p.no);
    const prevValue = p[field];
    if (prevValue === value) return;

    // Optimistic store update
    const currentProjects = useAppStore.getState().projects;
    useAppStore.getState().setProjects(
      currentProjects.map(item => item.id === p.id ? { ...item, [field]: value } : item)
    );

    // Register undo
    undoManager.push({
      description: `Update ${field} on project ${p.code}`,
      revert: async () => {
        const projs = useAppStore.getState().projects;
        useAppStore.getState().setProjects(
          projs.map(item => item.id === p.id ? { ...item, [field]: prevValue } : item)
        );
        try {
          const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
          await writeBatch(db).update(docRef, { [field]: prevValue, updatedAt: new Date().toISOString() }).commit();
        } catch (err) {
          console.error('Failed to revert project update', err);
        }
      }
    });

    try {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
      const batch = writeBatch(db);
      batch.update(docRef, { [field]: value, updatedAt: new Date().toISOString() });
      await batch.commit();
    } catch (e: any) {
      console.error('Error updating project:', e);
      useAppStore.getState().setToast({
        title: "Save Failed",
        message: "Network error or permission denied. Data was not saved.",
        type: "error"
      });
    }
  };

  const handleLinkParent = async (childProject: Project, parentCode: string | null) => {
    if (!childProject) return;
    const now = new Date().toISOString();
    const childId = childProject.id;
    const childCode = String(childProject.code || '').trim().toUpperCase();
    const prevParentId = childProject.parentId || null;

    // 1. Gather all descendants if attaching to a parentCode
    const allDescendantCodes = new Set<string>();
    if (parentCode) {
      const queue = [childCode];
      allDescendantCodes.add(childCode);
      const currentProjects = useAppStore.getState().projects;
      while (queue.length > 0) {
        const currParentCode = queue.shift()!;
        const directChildren = currentProjects.filter(p =>
          p.parentId && String(p.parentId).trim().toUpperCase() === currParentCode
        );
        for (const dc of directChildren) {
          const dcCode = String(dc.code || '').trim().toUpperCase();
          if (!allDescendantCodes.has(dcCode)) {
            allDescendantCodes.add(dcCode);
            queue.push(dcCode);
          }
        }
      }
    }

    // 2. Zero-Delay Optimistic update in Zustand store (0ms UI response)
    const storeProjects = useAppStore.getState().projects;
    const updatedStoreProjects = storeProjects.map(p => {
      const pCode = String(p.code || '').trim().toUpperCase();
      const isTargetChild = (childId && p.id === childId) || pCode === childCode;
      const isDescendant = parentCode && allDescendantCodes.has(pCode);
      if (isTargetChild || isDescendant) {
        return { ...p, parentId: parentCode, updatedAt: now };
      }
      return p;
    });
    useAppStore.getState().setProjects(updatedStoreProjects);

    // 3. User feedback
    useAppStore.getState().setToast({
      title: parentCode ? "Project Linked" : "Project Unlinked",
      message: parentCode
        ? `Successfully linked ${childProject.code} to ${parentCode}.`
        : `Unlinked ${childProject.code}.`,
      type: "success"
    });

    // 4. Register Undo action
    undoManager.push({
      description: parentCode ? `Link ${childProject.code} to ${parentCode}` : `Unlink ${childProject.code}`,
      revert: async () => {
        const revertingProjects = useAppStore.getState().projects.map(p => {
          const isTargetChild = (childId && p.id === childId) || String(p.code || '').trim().toUpperCase() === childCode;
          if (isTargetChild) {
            return { ...p, parentId: prevParentId, updatedAt: new Date().toISOString() };
          }
          return p;
        });
        useAppStore.getState().setProjects(revertingProjects);
        try {
          const cDocId = childProject.id || String(childProject.no);
          const cRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', cDocId);
          await writeBatch(db).set(cRef, { parentId: prevParentId, updatedAt: new Date().toISOString() }, { merge: true }).commit();
        } catch (err) {
          console.error("Revert link failed", err);
        }
      }
    });

    // 5. Background Firestore batch write
    const batch = writeBatch(db);
    const childDocId = childProject.id || String(childProject.no);
    const childRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', childDocId);
    batch.set(childRef, { parentId: parentCode, updatedAt: now }, { merge: true });

    if (parentCode && allDescendantCodes.size > 1) {
      storeProjects.forEach(p => {
        const pCode = String(p.code || '').trim().toUpperCase();
        if (pCode !== childCode && allDescendantCodes.has(pCode)) {
          const descDocId = p.id || String(p.no);
          const descRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', descDocId);
          batch.set(descRef, { parentId: parentCode, updatedAt: now }, { merge: true });
        }
      });
    }

    try {
      await batch.commit();
    } catch (error: any) {
      console.error("Batch commit failed", error);
      useAppStore.getState().setToast({
        title: "Save Failed",
        message: "Network error or permission denied. Data was not saved.",
        type: "error"
      });
    }
  };

  return {
    handleUpdateProject,
    handleLinkParent
  };
}
