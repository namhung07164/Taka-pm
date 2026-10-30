import { doc, deleteField } from 'firebase/firestore';
import { setDoc } from './firestoreWrites';
import { db, APP_ID, storage } from './firebase';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { useAppStore } from '../store/useAppStore';
import { Project } from '../types';
import { recordDelta } from './deltaSyncService';
import { deleteR2ImageCleanly } from './r2StorageUtils';

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

/**
 * Permanently removes an image everywhere:
 * 1. Cloudflare R2 bucket deletion (via deleteR2ImageCleanly)
 * 2. Firebase Storage deletion if applicable
 * 3. Removes from taka_unit_images across all associated units (LocalStorage + Firestore)
 * 4. Removes from project.imageLinks, project.imageUrl/thumbnail/photo/image
 * 5. Removes the image link from project.comments (both c.attachments and stripping URL from c.text, or deleting empty comments)
 * 6. Dispatches 'taka_unit_images_changed' event so open tooltips/galleries refresh immediately in 0ms
 */
export async function removeUploadedImageEverywhere(
  url: string,
  project?: Project | null,
  unitCodeParam?: string
): Promise<void> {
  if (!url || !url.trim()) return;
  const trimmedUrl = url.trim();

  // 1. Purge from Cloudflare R2 in background
  try {
    deleteR2ImageCleanly(trimmedUrl).catch((err) => {
      console.warn('[removeUploadedImageEverywhere] R2 purge error:', err);
    });
  } catch (e) {
    console.warn('[removeUploadedImageEverywhere] R2 error:', e);
  }

  // 2. Purge from Firebase Storage if it's a storage URL
  if (trimmedUrl.includes('firebasestorage.googleapis.com')) {
    try {
      const fileRef = storageRef(storage, trimmedUrl);
      deleteObject(fileRef).catch((e) => console.warn('Storage delete error:', e));
    } catch {}
  }

  const store = normalizeStore(project?.store);
  const primaryCode = String(project?.code || unitCodeParam || '').trim();

  // 3. Purge from taka_unit_images (for primary code and linkCodes)
  const codesToUpdate = new Set<string>();
  if (primaryCode) codesToUpdate.add(primaryCode);
  if (unitCodeParam) codesToUpdate.add(unitCodeParam);

  if (project?.linkCodes) {
    String(project.linkCodes)
      .split(/[,;\s]+/)
      .map((c) => c.trim())
      .filter(Boolean)
      .forEach((c) => codesToUpdate.add(c));
  }

  for (const uCode of Array.from(codesToUpdate)) {
    const activeUnitStorageKey = `taka_unit_images_${store}_${uCode}`;
    const unitImagesDocKey = `${store}_${uCode}`;

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

    const updatedImages = currentList.filter((item) => {
      const iUrl = typeof item === 'string' ? item : item?.url;
      return iUrl !== trimmedUrl;
    });

    try {
      if (updatedImages.length === 0) {
        localStorage.removeItem(activeUnitStorageKey);
      } else {
        localStorage.setItem(activeUnitStorageKey, JSON.stringify(updatedImages));
      }
    } catch {}

    try {
      const unitImagesDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_unit_images', unitImagesDocKey);
      setDoc(
        unitImagesDocRef,
        {
          unitCode: uCode,
          store,
          images: updatedImages,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      ).catch(console.error);
    } catch {}
  }

  // 4. Dispatch event so Layout Unit Tooltip updates immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('taka_unit_images_changed'));
  }

  // 5. Update Project document (imageLinks, comments, thumbnails)
  const allProjects = useAppStore.getState().projects;
  const targetProj = (project && project.id ? allProjects.find((p) => p.id === project.id) : null) ||
    allProjects.find((p) => {
      if (primaryCode && p.code === primaryCode && normalizeStore(p.store) === store) return true;
      return false;
    });

  if (targetProj && targetProj.id) {
    try {
      // 5a. Clean imageLinks
      const existingLinks: any[] = Array.isArray(targetProj.imageLinks) ? targetProj.imageLinks : [];
      const updatedImageLinks = existingLinks.filter((l) => {
        const lUrl = typeof l === 'string' ? l : l?.url;
        return lUrl !== trimmedUrl;
      });

      // 5b. Clean comments: remove trimmedUrl from comment text & attachments
      const existingComments: any[] = Array.isArray(targetProj.comments) ? targetProj.comments : [];
      const updatedComments = existingComments
        .map((c) => {
          let updatedText = c.text || '';
          if (typeof updatedText === 'string' && updatedText.includes(trimmedUrl)) {
            // Strip markdown image/link if present: ![title](url) or [title](url)
            const escapedUrl = trimmedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const mdRegex = new RegExp(`!?\\[[^\\]]*\\]\\(${escapedUrl}\\)`, 'g');
            updatedText = updatedText.replace(mdRegex, '');
            // Also strip raw URL
            updatedText = updatedText.replace(new RegExp(escapedUrl, 'g'), '');
            updatedText = updatedText.replace(/\s+/g, ' ').trim();
          }

          let updatedAttachments = c.attachments;
          if (Array.isArray(updatedAttachments)) {
            updatedAttachments = updatedAttachments.filter((att: any) => att.url !== trimmedUrl);
          }

          return {
            ...c,
            text: updatedText,
            attachments: updatedAttachments,
          };
        })
        .filter((c) => {
          const hasText = typeof c.text === 'string' && c.text.trim().length > 0;
          const hasAttachments = Array.isArray(c.attachments) && c.attachments.length > 0;
          return hasText || hasAttachments;
        });

      // 5c. Clean thumbnail / imageUrl / photo / image
      const newImageUrl = targetProj.imageUrl === trimmedUrl ? '' : targetProj.imageUrl;
      const newThumbnail = targetProj.thumbnail === trimmedUrl ? '' : targetProj.thumbnail;
      const newPhoto = (targetProj as any).photo === trimmedUrl ? '' : (targetProj as any).photo;
      const newImage = (targetProj as any).image === trimmedUrl ? '' : (targetProj as any).image;

      // 5d. Clean taskSummaries
      const filteredSummaries = (targetProj.taskSummaries || []).filter(
        (ts) => ts.link !== trimmedUrl && ts.imageUrl !== trimmedUrl && !ts.name?.includes(trimmedUrl)
      );

      const nowIso = new Date().toISOString();
      const updatedProject: Project = {
        ...targetProj,
        comments: updatedComments,
        imageLinks: updatedImageLinks,
        imageUrl: newImageUrl,
        thumbnail: newThumbnail,
        photo: newPhoto,
        image: newImage,
        taskSummaries: filteredSummaries,
        updatedAt: nowIso,
      } as Project;

      // Optimistic update in Zustand (0ms)
      useAppStore
        .getState()
        .setProjects(allProjects.map((p) => (p.id === targetProj.id ? updatedProject : p)));

      // Firestore Update
      const projDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', targetProj.id);
      const firestoreUpdate: Record<string, any> = {
        comments: updatedComments,
        imageLinks: updatedImageLinks,
        taskSummaries: filteredSummaries,
        updatedAt: nowIso,
      };
      if (targetProj.imageUrl === trimmedUrl) firestoreUpdate.imageUrl = deleteField();
      if (targetProj.thumbnail === trimmedUrl) firestoreUpdate.thumbnail = deleteField();
      if ((targetProj as any).photo === trimmedUrl) firestoreUpdate.photo = deleteField();
      if ((targetProj as any).image === trimmedUrl) firestoreUpdate.image = deleteField();

      await setDoc(projDocRef, firestoreUpdate, { merge: true });

      // Record Delta
      await recordDelta({
        docId: targetProj.id,
        collectionName: 'taka_projects',
        action: 'update',
        data: firestoreUpdate,
        year: String(targetProj.year || ''),
      }).catch(console.error);
    } catch (err) {
      console.error('[removeUploadedImageEverywhere] Error updating project:', err);
    }
  }
}
