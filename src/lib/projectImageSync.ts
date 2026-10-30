import { doc } from 'firebase/firestore';
import { setDoc } from './firestoreWrites';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { Project } from '../types';
import { recordDelta } from './deltaSyncService';

function normalizeStore(store?: string | null): string {
  if (!store) return 'HCM';
  const s = String(store).trim().toUpperCase();
  if (s.includes('HN') || s.includes('HÀ NỘI') || s.includes('HA NOI') || s.includes('HANOI')) return 'HN';
  if (s.includes('HCM') || s.includes('HỒ CHÍ MINH') || s.includes('HO CHI MINH') || s.includes('SAI GON') || s.includes('SG')) return 'HCM';
  return s;
}

/**
 * Registers an uploaded image (from Project Comments or Project Modal) into:
 * 1. project.imageLinks and project.imageUrl / thumbnail
 * 2. taka_unit_images collection (for cross-device real-time sync with Layout Tab Tooltip)
 * 3. LocalStorage cache for instant 0ms display
 * 4. CustomEvent 'taka_unit_images_changed' to notify open tooltips immediately
 */
export async function syncUploadedImageToProjectAndUnit(
  url: string,
  fileName: string,
  project?: Project | null
): Promise<void> {
  if (!url || !url.trim()) return;
  const trimmedUrl = url.trim();

  const store = normalizeStore(project?.store);
  const primaryCode = String(project?.code || '').trim();

  const newImgEntry = {
    id: `img_${Date.now()}`,
    url: trimmedUrl,
    title: fileName || (primaryCode ? `${primaryCode} Photo` : 'Project Photo'),
    createdAt: new Date().toISOString(),
    store,
  };

  // 1. Gather all unit codes associated with this project (including linkCodes)
  const codesToUpdate = new Set<string>();
  if (primaryCode) codesToUpdate.add(primaryCode);

  if (project?.linkCodes) {
    String(project.linkCodes)
      .split(/[,;\s]+/)
      .map((c) => c.trim())
      .filter(Boolean)
      .forEach((c) => codesToUpdate.add(c));
  }

  // 2. Update taka_unit_images for each unit code (LocalStorage + Firestore)
  for (const unitCode of Array.from(codesToUpdate)) {
    const activeUnitStorageKey = `taka_unit_images_${store}_${unitCode}`;
    const unitImagesDocKey = `${store}_${unitCode}`;

    let currentList: any[] = [];
    try {
      const saved = localStorage.getItem(activeUnitStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) currentList = parsed;
      }
    } catch {
      currentList = [];
    }

    const alreadyHas = currentList.some((item) =>
      typeof item === 'string' ? item === trimmedUrl : item?.url === trimmedUrl
    );
    const updatedImages = alreadyHas ? currentList : [newImgEntry, ...currentList];

    try {
      localStorage.setItem(activeUnitStorageKey, JSON.stringify(updatedImages));
    } catch {}

    try {
      const unitImagesDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_unit_images', unitImagesDocKey);
      setDoc(
        unitImagesDocRef,
        {
          unitCode,
          store,
          images: updatedImages,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      ).catch((err) => console.warn('[projectImageSync] Error saving unit images doc:', err));
    } catch (e) {
      console.warn('[projectImageSync] Failed to push to taka_unit_images:', e);
    }
  }

  // 3. Dispatch UI event so Layout Unit Tooltip immediately updates in 0ms
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('taka_unit_images_changed'));
  }

  // 4. Update the Project document in Zustand + Firestore + Delta
  if (project && project.id) {
    try {
      const allProjects = useAppStore.getState().projects;
      const targetProj = allProjects.find((p) => p.id === project.id) || project;

      const existingLinks: any[] = Array.isArray(targetProj.imageLinks) ? targetProj.imageLinks : [];
      const hasLink = existingLinks.some((l) =>
        typeof l === 'string' ? l === trimmedUrl : l?.url === trimmedUrl
      );
      const updatedImageLinks = hasLink ? existingLinks : [newImgEntry, ...existingLinks];

      const nowIso = new Date().toISOString();
      const updatedProject: Project = {
        ...targetProj,
        imageUrl: targetProj.imageUrl || trimmedUrl,
        thumbnail: targetProj.thumbnail || trimmedUrl,
        imageLinks: updatedImageLinks,
        updatedAt: nowIso,
      };

      // Zustand Optimistic Update (0ms)
      useAppStore
        .getState()
        .setProjects(allProjects.map((p) => (p.id === project.id ? updatedProject : p)));

      // Firestore Update
      const projDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', project.id);
      const updateData = {
        imageUrl: updatedProject.imageUrl,
        thumbnail: updatedProject.thumbnail,
        imageLinks: updatedImageLinks,
        updatedAt: nowIso,
      };

      await setDoc(projDocRef, updateData, { merge: true });

      // Record Delta for multi-device sync
      await recordDelta({
        docId: project.id,
        collectionName: 'taka_projects',
        action: 'update',
        data: updateData,
        year: String(project.year || ''),
      }).catch(console.error);
    } catch (err) {
      console.error('[projectImageSync] Failed to update project imageLinks:', err);
    }
  }
}
