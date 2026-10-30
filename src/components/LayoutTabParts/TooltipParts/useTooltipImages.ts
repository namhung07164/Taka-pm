import React, { useEffect, useMemo, useState } from 'react';
import { Project } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { doc, deleteField, onSnapshot } from 'firebase/firestore';
import { setDoc } from '../../../lib/firestoreWrites';
import { db, APP_ID } from '../../../lib/firebase';
import { extractAllProjectCodes, projectMatchesUnitCode, extractProjectMetadata } from '../../../lib/utils';
import { TooltipImageItem } from './tooltipTypes';
import { deleteR2ImageCleanly } from '../../../lib/r2StorageUtils';
import { recordDelta } from '../../../lib/deltaSyncService';

function normalizeStore(store?: string | null): string {
  if (!store) return '';
  const s = String(store).trim().toUpperCase();
  if (s.includes('HN') || s.includes('HÀ NỘI') || s.includes('HA NOI') || s.includes('HANOI')) return 'HN';
  if (s.includes('HCM') || s.includes('HỒ CHÍ MINH') || s.includes('HO CHI MINH') || s.includes('SAI GON') || s.includes('SG')) return 'HCM';
  return s;
}

interface UseTooltipImagesParams {
  p?: Project;
  data: any;
  unitCode: string;
  tooltipRef: React.RefObject<HTMLDivElement>;
  positionTooltip: (forceRecalculate?: boolean) => void;
  storeFilter?: string;
  quickImageMode?: boolean;
  canWrite?: boolean;
}

export function useTooltipImages({
  p, data, unitCode, tooltipRef, positionTooltip, storeFilter, quickImageMode = false, canWrite = false,
}: UseTooltipImagesParams) {
  const [showImagePanel, setShowImagePanel] = useState<boolean>(Boolean(quickImageMode));
  const [showAddLinkInput, setShowAddLinkInput] = useState(false);
  const [newLinkInput, setNewLinkInput] = useState('');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<{ url: string; title?: string; initialScale?: number } | null>(null);
  const [customUnitImages, setCustomUnitImages] = useState<Array<{ id: string; url: string; title?: string; createdAt?: string; store?: string }>>([]);

  const rawStore = (
    p?.store ||
    data?.store ||
    (p ? extractProjectMetadata(p).store : '') ||
    (storeFilter && storeFilter.toUpperCase() !== 'ALL' ? storeFilter : '') ||
    'HCM'
  );
  const activeStore = normalizeStore(rawStore) || 'HCM';

  const cleanCode = String(data?.code || data?.unit || data?.name || unitCode || 'default').trim();
  const activeUnitStorageKey = `taka_unit_images_${activeStore}_${cleanCode}`;
  const unitImagesDocKey = `${activeStore}_${cleanCode}`;

  // 1. Instant 0ms load from localStorage
  // 2. Real-time Firestore sync on taka_unit_images for cross-device sync (Desktop <-> iOS <-> Android)
  useEffect(() => {
    let localImages: any[] = [];
    try {
      const saved = localStorage.getItem(activeUnitStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          localImages = parsed.filter(item => !item.store || normalizeStore(item.store) === activeStore);
          setCustomUnitImages(localImages);
        }
      }
    } catch {
      setCustomUnitImages([]);
    }

    const docRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_unit_images", unitImagesDocKey);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const cloudData = snap.data();
        if (Array.isArray(cloudData?.images)) {
          const cloudImages = cloudData.images.filter((item: any) => !item.store || normalizeStore(item.store) === activeStore);
          setCustomUnitImages(cloudImages);
          try {
            localStorage.setItem(activeUnitStorageKey, JSON.stringify(cloudImages));
          } catch {}
          return;
        }
      } else if (localImages.length > 0 && canWrite) {
        // Auto-heal: If images existed in desktop's localStorage, sync them up to Firestore so iOS receives them
        setDoc(docRef, {
          unitCode: cleanCode,
          store: activeStore,
          images: localImages,
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }
    }, (err) => {
      console.warn("[useTooltipImages] Cloud sync listener:", err);
    });

    return () => unsub();
  }, [activeUnitStorageKey, activeStore, cleanCode, unitImagesDocKey, canWrite]);

  useEffect(() => {
    setShowImagePanel(Boolean(quickImageMode));
    setShowAddLinkInput(false);
  }, [data.code, data.unit, unitCode, quickImageMode]);

  useEffect(() => {
    if (!tooltipRef.current) return;
    positionTooltip(true);
    if (!showImagePanel) return;
    const timer1 = setTimeout(() => {
      if (tooltipRef.current) {
        positionTooltip(true);
        if (!quickImageMode) {
          tooltipRef.current.scrollTo({ top: tooltipRef.current.scrollHeight, behavior: 'smooth' });
        }
      }
    }, 50);
    return () => clearTimeout(timer1);
  }, [showImagePanel, quickImageMode, positionTooltip, tooltipRef]);

  useEffect(() => {
    if (!enlargedImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEnlargedImage(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enlargedImage]);

  const handleAddCustomImage = (e?: React.FormEvent, customUrl?: string) => {
    if (e) e.preventDefault();
    if (!canWrite) return;
    const targetUrl = customUrl || newLinkInput;
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    const newEntry = {
      id: `img_${Date.now()}`,
      url: trimmed,
      title: `Link ${customUnitImages.length + 1}`,
      createdAt: new Date().toISOString(),
      store: activeStore,
    };
    const updated = [newEntry, ...customUnitImages];
    setCustomUnitImages(updated);
    setNewLinkInput('');
    setShowAddLinkInput(false);

    try {
      localStorage.setItem(activeUnitStorageKey, JSON.stringify(updated));
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('taka_unit_images_changed'));
    }

    // 1. Direct Cloud Firestore persistence for taka_unit_images (Multi-device sync iOS <-> Desktop)
    const unitImagesDocRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_unit_images", unitImagesDocKey);
    setDoc(unitImagesDocRef, {
      unitCode: cleanCode,
      store: activeStore,
      images: updated,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(err => {
      console.error("[useTooltipImages] Failed to save unit images to Firestore:", err);
    });

    // 2. Also persist link to matched project document
    try {
      const allProjects = useAppStore.getState().projects;
      const targetProj = (p && normalizeStore(extractProjectMetadata(p).store) === activeStore ? p : null) || allProjects.find(item => {
        if (item.id === p?.id && normalizeStore(extractProjectMetadata(item).store) === activeStore) return true;
        const itemStore = normalizeStore(extractProjectMetadata(item).store);
        if (itemStore && itemStore !== activeStore) return false;
        const itemCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
        const targetCode = String(data?.code || data?.unit || data?.name || unitCode || '').toLowerCase();
        return itemCodes.includes(targetCode) || projectMatchesUnitCode(itemCodes, targetCode);
      });

      if (targetProj && normalizeStore(extractProjectMetadata(targetProj).store) === activeStore) {
        const cleanedSummaries = (targetProj.taskSummaries || []).filter(
          ts => !ts.name?.startsWith('Link / Photo:') && !ts.name?.startsWith('http://') && !ts.name?.startsWith('https://')
        );

        const existingLinks: any[] = Array.isArray(targetProj.imageLinks) ? targetProj.imageLinks : [];
        const hasLinkAlready = existingLinks.some(l => (typeof l === 'string' ? l === trimmed : l?.url === trimmed));
        const newLinkObj = {
          id: newEntry.id,
          url: trimmed,
          title: newEntry.title,
          createdAt: newEntry.createdAt,
          store: activeStore,
        };
        const updatedImageLinks = hasLinkAlready ? existingLinks : [newLinkObj, ...existingLinks];

        const updatedProject: Project = {
          ...targetProj,
          taskSummaries: cleanedSummaries,
          imageUrl: targetProj.imageUrl || trimmed,
          thumbnail: targetProj.thumbnail || trimmed,
          imageLinks: updatedImageLinks,
        };

        useAppStore.getState().setProjects(
          allProjects.map(proj => proj.id === targetProj.id ? updatedProject : proj)
        );

        if (targetProj.id) {
          const updateData = {
            taskSummaries: cleanedSummaries,
            imageUrl: updatedProject.imageUrl,
            thumbnail: updatedProject.thumbnail,
            imageLinks: updatedImageLinks,
            updatedAt: new Date().toISOString(),
          };
          setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", targetProj.id), updateData, { merge: true }).catch(err => {
            console.error("Failed to sync to Firestore:", err);
          });
          recordDelta({
            docId: targetProj.id,
            collectionName: 'taka_projects',
            action: 'update',
            data: updateData,
            year: String(targetProj.year || '')
          }).catch(console.error);
        }
      }
    } catch (err) {
      console.error("Error updating project image link:", err);
    }
  };

  const handleDeleteCustomImage = (id: string, urlToDelete?: string) => {
    if (!canWrite) return;
    const updated = customUnitImages.filter(item => item.id !== id && (urlToDelete ? item.url !== urlToDelete : true));
    setCustomUnitImages(updated);
    try {
      if (updated.length === 0) {
        localStorage.removeItem(activeUnitStorageKey);
      } else {
        localStorage.setItem(activeUnitStorageKey, JSON.stringify(updated));
      }
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('taka_unit_images_changed'));
    }

    // 1. Update Firestore taka_unit_images doc
    const unitImagesDocRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_unit_images", unitImagesDocKey);
    setDoc(unitImagesDocRef, {
      unitCode: cleanCode,
      store: activeStore,
      images: updated,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(console.error);

    // 2. Clean up from project.taskSummaries & project.imageLinks
    try {
      const targetUrl = urlToDelete || customUnitImages.find(item => item.id === id)?.url;
      if (targetUrl) {
        deleteR2ImageCleanly(targetUrl).catch(err => {
          console.warn("[R2 Purge] Deep clean error:", err);
        });
      }

      const allProjects = useAppStore.getState().projects;
      const targetProj = (p && normalizeStore(extractProjectMetadata(p).store) === activeStore ? p : null) || allProjects.find(item => {
        if (item.id === p?.id && normalizeStore(extractProjectMetadata(item).store) === activeStore) return true;
        const itemStore = normalizeStore(extractProjectMetadata(item).store);
        if (itemStore && itemStore !== activeStore) return false;
        const itemCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
        const targetCode = String(data?.code || data?.unit || data?.name || unitCode || '').toLowerCase();
        return itemCodes.includes(targetCode) || projectMatchesUnitCode(itemCodes, targetCode);
      });

      if (targetProj && normalizeStore(extractProjectMetadata(targetProj).store) === activeStore) {
        const filteredSummaries = (targetProj.taskSummaries || []).filter(
          ts => ts.link !== urlToDelete && ts.imageUrl !== urlToDelete && !ts.name?.includes(urlToDelete || '') && !ts.name?.startsWith('Link / Photo:')
        );
        const existingLinks: any[] = Array.isArray(targetProj.imageLinks) ? targetProj.imageLinks : [];
        const updatedImageLinks = existingLinks.filter(l => {
          const lUrl = typeof l === 'string' ? l : l?.url;
          const lId = typeof l === 'object' ? l?.id : null;
          if (id && lId === id) return false;
          if (urlToDelete && lUrl === urlToDelete) return false;
          return true;
        });

        const newImageUrl = targetProj.imageUrl === urlToDelete ? '' : targetProj.imageUrl;
        const newThumbnail = targetProj.thumbnail === urlToDelete ? '' : targetProj.thumbnail;
        const newPhoto = (targetProj as any).photo === urlToDelete ? '' : (targetProj as any).photo;
        const newImage = (targetProj as any).image === urlToDelete ? '' : (targetProj as any).image;

        const updatedProject: Project = {
          ...targetProj, taskSummaries: filteredSummaries,
          imageUrl: newImageUrl, thumbnail: newThumbnail, photo: newPhoto, image: newImage, imageLinks: updatedImageLinks,
        } as Project;

        useAppStore.getState().setProjects(allProjects.map(proj => proj.id === targetProj.id ? updatedProject : proj));

        if (targetProj.id) {
          const firestoreUpdate: Record<string, any> = { taskSummaries: filteredSummaries, imageLinks: updatedImageLinks, updatedAt: new Date().toISOString() };
          if (targetProj.imageUrl === urlToDelete) firestoreUpdate.imageUrl = deleteField();
          if (targetProj.thumbnail === urlToDelete) firestoreUpdate.thumbnail = deleteField();
          if ((targetProj as any).photo === urlToDelete) firestoreUpdate.photo = deleteField();
          if ((targetProj as any).image === urlToDelete) firestoreUpdate.image = deleteField();

          setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", targetProj.id), firestoreUpdate, { merge: true }).catch(console.error);
          recordDelta({ docId: targetProj.id, collectionName: 'taka_projects', action: 'update', data: firestoreUpdate, year: String(targetProj.year || '') }).catch(console.error);
        }
      }
    } catch (err) {
      console.error("Error removing from project taskSummaries:", err);
    }
  };

  const handleCopyLink = (url: string) => {
    try {
      navigator.clipboard?.writeText(url);
      setCopiedLink(url);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {}
  };

  // Consolidate all image items (user-added cloud links, taskSummaries, layout image/thumbnail, project attachments)
  const allUnitImages = useMemo(() => {
    const list: TooltipImageItem[] = [];
    const seenUrls = new Set<string>();

    const allProjects = useAppStore.getState().projects;
    const resolvedProj = (p && normalizeStore(extractProjectMetadata(p).store) === activeStore ? p : null) || allProjects.find(item => {
      const itemStore = normalizeStore(extractProjectMetadata(item).store);
      if (itemStore && itemStore !== activeStore) return false;
      const itemCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
      const targetCode = String(data?.code || data?.unit || data?.name || unitCode || '').toLowerCase();
      return itemCodes.includes(targetCode) || projectMatchesUnitCode(itemCodes, targetCode);
    });

    const targetP = resolvedProj || p;
    const projStore = targetP ? normalizeStore(extractProjectMetadata(targetP).store) : '';
    const isProjMatchingStore = !targetP || !projStore || !activeStore || projStore === activeStore;

    // 1. Cloud-backed project.imageLinks
    if (isProjMatchingStore && targetP?.imageLinks && Array.isArray(targetP.imageLinks)) {
      targetP.imageLinks.forEach((imgItem: any, idx: number) => {
        const url = typeof imgItem === 'string' ? imgItem : imgItem?.url;
        const itemStore = typeof imgItem === 'object' ? normalizeStore(imgItem?.store) : '';
        if (url && typeof url === 'string' && !seenUrls.has(url)) {
          if (!itemStore || itemStore === activeStore) {
            seenUrls.add(url);
            list.push({
              id: typeof imgItem === 'object' && imgItem.id ? imgItem.id : `img_cloud_${idx}`,
              url: url,
              title: (typeof imgItem === 'object' && imgItem.title) || `Link ${list.length + 1}`,
              source: `${activeStore} Link`,
              isCustom: true,
            });
          }
        }
      });
    }

    // 2. Project taskSummaries links
    if (isProjMatchingStore && targetP?.taskSummaries && Array.isArray(targetP.taskSummaries)) {
      targetP.taskSummaries.forEach((ts, tsIdx) => {
        const url = ts.link || ts.imageUrl || ts.thumbnail || (typeof ts.name === 'string' ? ts.name.match(/https?:\/\/[^\s]+/)?.[0] : null);
        if (url && typeof url === 'string' && !seenUrls.has(url)) {
          seenUrls.add(url);
          list.push({
            id: `ts_${ts.id || tsIdx}_${url.slice(-8)}`,
            url: url,
            title: ts.name || `Task Summary Link ${list.length + 1}`,
            source: 'Task Summarize',
            isCustom: true,
          });
        }
      });
    }

    // 3. Custom user-posted links (real-time Firestore sync & localStorage fallback)
    customUnitImages.forEach((c) => {
      if (c.url && !seenUrls.has(c.url)) {
        if (!c.store || normalizeStore(c.store) === activeStore) {
          seenUrls.add(c.url);
          list.push({
            id: c.id,
            url: c.url,
            title: c.title || 'Attached Link',
            source: `${activeStore} Link`,
            isCustom: true,
          });
        }
      }
    });

    // 4. Project direct image / thumbnail fields
    if (isProjMatchingStore && targetP) {
      ['thumbnail', 'imageUrl', 'image', 'photo'].forEach((key) => {
        const val = (targetP as any)[key];
        if (val && typeof val === 'string' && !seenUrls.has(val)) {
          seenUrls.add(val);
          list.push({
            id: `proj_${key}`,
            url: val,
            title: key === 'thumbnail' ? 'Project Thumbnail' : 'Project Image',
            source: 'Project Data',
            isCustom: true,
          });
        }
      });
    }

    // 5. Unit image from layout data
    const dataStore = normalizeStore(data?.store || '');
    const isDataMatchingStore = !dataStore || !activeStore || dataStore === activeStore;
    if (isDataMatchingStore) {
      ['imageUrl', 'thumbnail', 'image'].forEach((key) => {
        const val = data[key];
        if (val && typeof val === 'string' && !seenUrls.has(val)) {
          seenUrls.add(val);
          list.push({
            id: `data_${key}`,
            url: val,
            title: key === 'thumbnail' ? 'Unit Thumbnail' : 'Unit Layout Image',
            source: 'Layout Data',
          });
        }
      });
    }

    // 6. Project comments attachments & image URLs in comment text
    if (isProjMatchingStore && targetP?.comments && Array.isArray(targetP.comments)) {
      targetP.comments.forEach((c, cIdx) => {
        if (c.attachments && Array.isArray(c.attachments)) {
          c.attachments.forEach((att, aIdx) => {
            if (att.url && !seenUrls.has(att.url)) {
              seenUrls.add(att.url);
              list.push({ id: `comm_${cIdx}_${aIdx}`, url: att.url, title: att.name || `Attachment ${list.length + 1}`, source: `Comment by ${c.userName || 'User'}` });
            }
          });
        }
        if (c.text && typeof c.text === 'string') {
          const matchedUrls = c.text.match(/(https?:\/\/[^\s]+)/g) || [];
          matchedUrls.forEach((rawUrl, uIdx) => {
            const url = rawUrl.trim();
            const isImg = url.match(/\.(jpe?g|png|webp|gif|svg|bmp)(\?.*)?$/i) ||
              url.includes('hcm.taka-pm.org') ||
              url.includes('drive.google.com/file') ||
              url.includes('firebasestorage.googleapis.com');
            if (isImg && !seenUrls.has(url)) {
              seenUrls.add(url);
              list.push({ id: `comm_txt_${c.id || cIdx}_${uIdx}`, url, title: `Comment Photo (${c.userName || 'User'})`, source: `Comment by ${c.userName || 'User'}` });
            }
          });
        }
      });
    }

    return list;
  }, [customUnitImages, activeStore, data, p, unitCode]);

  return {
    showImagePanel,
    setShowImagePanel,
    showAddLinkInput,
    setShowAddLinkInput,
    newLinkInput,
    setNewLinkInput,
    copiedLink,
    enlargedImage,
    setEnlargedImage,
    allUnitImages,
    handleAddCustomImage,
    handleDeleteCustomImage,
    handleCopyLink,
  };
}
