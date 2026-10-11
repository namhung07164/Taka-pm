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
    const batch = writeBatch(db);
    
    // Gán parentId cho con trực tiếp
    const childDocId = childProject.id || String(childProject.no);
    const childRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', childDocId);
    batch.set(childRef, { parentId: parentCode, updatedAt: now }, { merge: true });

    // Nếu gán vào Cha lớn (parentCode != null), tìm toàn bộ các dự án đang coi childProject là cha để đưa lên cùng cấp con của Cha lớn
    if (parentCode) {
      const childCode = String(childProject.code || '').trim().toUpperCase();
      const allDescendants: Project[] = [];
      const queue = [childCode];
      const visitedCodes = new Set<string>([childCode]);

      while (queue.length > 0) {
        const currParentCode = queue.shift()!;
        const directChildren = projects.filter(p => 
          p.parentId && String(p.parentId).trim().toUpperCase() === currParentCode
        );

        for (const directChild of directChildren) {
          const directChildCode = String(directChild.code || '').trim().toUpperCase();
          if (!visitedCodes.has(directChildCode)) {
            allDescendants.push(directChild);
            visitedCodes.add(directChildCode);
            queue.push(directChildCode);
          }
        }
      }

      // Chuyển toàn bộ các con này sang làm con của parentCode (Cha lớn nhất)
      allDescendants.forEach(desc => {
        const descDocId = desc.id || String(desc.no);
        const descRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', descDocId);
        batch.set(descRef, { parentId: parentCode, updatedAt: now }, { merge: true });
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
