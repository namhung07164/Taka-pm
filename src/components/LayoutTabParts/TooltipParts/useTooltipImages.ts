import React, { useEffect, useMemo, useState } from 'react';
import { Project } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { doc, deleteField } from 'firebase/firestore';
import { setDoc } from '../../../lib/firestoreWrites';
import { db, APP_ID } from '../../../lib/firebase';
import { extractAllProjectCodes, projectMatchesUnitCode, extractProjectMetadata } from '../../../lib/utils';
import { TooltipImageItem } from './tooltipTypes';
import { deleteR2ImageCleanly } from '../../../lib/r2StorageUtils';
import { recordDelta } from '../../../lib/deltaSyncService';

interface UseTooltipImagesParams {
  p?: Project;
  data: any;
  unitCode: string;
  tooltipRef: React.RefObject<HTMLDivElement>;
  positionTooltip: (forceRecalculate?: boolean) => void;
  storeFilter?: string;
}

export function useTooltipImages({
  p,
  data,
  unitCode,
  tooltipRef,
  positionTooltip,
  storeFilter,
}: UseTooltipImagesParams) {
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [showAddLinkInput, setShowAddLinkInput] = useState(false);
  const [newLinkInput, setNewLinkInput] = useState('');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<{ url: string; title?: string; initialScale?: number } | null>(null);
  const [customUnitImages, setCustomUnitImages] = useState<Array<{ id: string; url: string; title?: string; createdAt?: string; store?: string }>>([]);

  const activeStore = (
    p?.store ||
    data?.store ||
    (p ? extractProjectMetadata(p).store : '') ||
    (storeFilter && storeFilter.toUpperCase() !== 'ALL' ? storeFilter : '') ||
    'HCM'
  ).toUpperCase().trim();

  const cleanCode = String(data?.code || unitCode || 'default').trim();
  const activeUnitStorageKey = `taka_unit_images_${activeStore}_${cleanCode}`;

  // Load custom images from localStorage with strict store separation
  useEffect(() => {
    try {
      // 1. Primary: load store-partitioned key
      const saved = localStorage.getItem(activeUnitStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const matching = parsed.filter(item => !item.store || item.store.toUpperCase() === activeStore);
          setCustomUnitImages(matching);
          return;
        }
      }

      // 2. Legacy key check: only migrate to HN if currently in HN (never load into HCM!)
      const legacyKey = `taka_unit_images_${cleanCode}`;
      const legacySaved = localStorage.getItem(legacyKey);
      if (legacySaved) {
        try {
          const parsedLegacy = JSON.parse(legacySaved);
          if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
            if (activeStore === 'HN') {
              const tagged = parsedLegacy.map(item => ({ ...item, store: 'HN' }));
              localStorage.setItem(activeUnitStorageKey, JSON.stringify(tagged));
              localStorage.removeItem(legacyKey);
              setCustomUnitImages(tagged);
              return;
            }
          }
        } catch {}
      }

      setCustomUnitImages([]);
    } catch {
      setCustomUnitImages([]);
    }
  }, [activeUnitStorageKey, activeStore, cleanCode]);

  // Reset panel open state when unit changes
  useEffect(() => {
    setShowImagePanel(false);
    setShowAddLinkInput(false);
  }, [data.code, unitCode]);

  // Re-evaluate position & smoothly scroll tooltip down to reveal image panel expanding below description box when image button is pressed
  useEffect(() => {
    if (tooltipRef.current) {
      if (showImagePanel) {
        positionTooltip(true);
        setTimeout(() => {
          if (tooltipRef.current) {
            tooltipRef.current.scrollTo({
              top: tooltipRef.current.scrollHeight,
              behavior: 'smooth'
            });
          }
        }, 50);
      }
    }
  }, [showImagePanel, positionTooltip, tooltipRef]);

  // Close enlarged image modal with Escape key
  useEffect(() => {
    if (!enlargedImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEnlargedImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enlargedImage]);

  const handleAddCustomImage = (e?: React.FormEvent, customUrl?: string) => {
    if (e) e.preventDefault();
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

    // Persist link to project ONLY IF project strictly belongs to activeStore
    try {
      const allProjects = useAppStore.getState().projects;
      const targetProj = (p && extractProjectMetadata(p).store === activeStore ? p : null) || allProjects.find(item => {
        if (item.id === p?.id && extractProjectMetadata(item).store === activeStore) return true;
        const itemStore = extractProjectMetadata(item).store;
        if (itemStore && itemStore !== activeStore) return false;
        const itemCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
        const targetCode = String(data.code || unitCode || '').toLowerCase();
        return itemCodes.includes(targetCode) || projectMatchesUnitCode(itemCodes, targetCode);
      });

      if (targetProj && extractProjectMetadata(targetProj).store === activeStore) {
        // Purge any legacy fake "Link / Photo:" tasks from taskSummaries to keep the task list & detail box clean
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

        // 1. Instant Zustand 0ms optimistic update
        useAppStore.getState().setProjects(
          allProjects.map(proj => proj.id === targetProj.id ? updatedProject : proj)
        );

        // 2. Cloud Firestore persistence for real-time multi-device sync (iOS <-> Desktop)
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
    const updated = customUnitImages.filter(item => item.id !== id && (urlToDelete ? item.url !== urlToDelete : true));
    setCustomUnitImages(updated);
    try {
      if (updated.length === 0) {
        localStorage.removeItem(activeUnitStorageKey);
        localStorage.removeItem(`taka_unit_images_${activeStore}_${data.code || ''}`);
        localStorage.removeItem(`taka_unit_images_${activeStore}_${unitCode || ''}`);
        if (p?.code) localStorage.removeItem(`taka_unit_images_${activeStore}_${p.code}`);
        // Also remove legacy keys if any
        localStorage.removeItem(`taka_unit_images_${cleanCode}`);
        localStorage.removeItem(`taka_unit_images_${data.code || ''}`);
        localStorage.removeItem(`taka_unit_images_${unitCode || ''}`);
        if (p?.code) localStorage.removeItem(`taka_unit_images_${p.code}`);
      } else {
        localStorage.setItem(activeUnitStorageKey, JSON.stringify(updated));
      }
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('taka_unit_images_changed'));
    }

    // Clean up from project.taskSummaries & project.imageLinks ONLY if project belongs to activeStore
    try {
      const targetUrl = urlToDelete || customUnitImages.find(item => item.id === id)?.url;
      if (targetUrl) {
        deleteR2ImageCleanly(targetUrl).catch(err => {
          console.warn("[R2 Purge] Deep clean error:", err);
        });
      }

      const allProjects = useAppStore.getState().projects;
      const targetProj = (p && extractProjectMetadata(p).store === activeStore ? p : null) || allProjects.find(item => {
        if (item.id === p?.id && extractProjectMetadata(item).store === activeStore) return true;
        const itemStore = extractProjectMetadata(item).store;
        if (itemStore && itemStore !== activeStore) return false;
        const itemCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
        const targetCode = String(data.code || unitCode || '').toLowerCase();
        return itemCodes.includes(targetCode) || projectMatchesUnitCode(itemCodes, targetCode);
      });

      if (targetProj && extractProjectMetadata(targetProj).store === activeStore) {
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
          ...targetProj,
          taskSummaries: filteredSummaries,
          imageUrl: newImageUrl,
          thumbnail: newThumbnail,
          photo: newPhoto,
          image: newImage,
          imageLinks: updatedImageLinks,
        } as Project;

        useAppStore.getState().setProjects(
          allProjects.map(proj => proj.id === targetProj.id ? updatedProject : proj)
        );

        if (targetProj.id) {
          const firestoreUpdate: Record<string, any> = {
            taskSummaries: filteredSummaries,
            imageLinks: updatedImageLinks,
            updatedAt: new Date().toISOString(),
          };
          if (targetProj.imageUrl === urlToDelete) {
            firestoreUpdate.imageUrl = deleteField();
          }
          if (targetProj.thumbnail === urlToDelete) {
            firestoreUpdate.thumbnail = deleteField();
          }
          if ((targetProj as any).photo === urlToDelete) {
            firestoreUpdate.photo = deleteField();
          }
          if ((targetProj as any).image === urlToDelete) {
            firestoreUpdate.image = deleteField();
          }

          setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", targetProj.id), firestoreUpdate, { merge: true }).catch(console.error);
          recordDelta({
            docId: targetProj.id,
            collectionName: 'taka_projects',
            action: 'update',
            data: firestoreUpdate,
            year: String(targetProj.year || '')
          }).catch(console.error);
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

    const projStore = p ? extractProjectMetadata(p).store : '';
    const isProjMatchingStore = !p || !projStore || !activeStore || projStore === activeStore;

    // 1. Cloud-backed project.imageLinks (Realtime synchronized across iOS, Android, and Desktop)
    if (isProjMatchingStore && p?.imageLinks && Array.isArray(p.imageLinks)) {
      p.imageLinks.forEach((imgItem: any, idx: number) => {
        const url = typeof imgItem === 'string' ? imgItem : imgItem?.url;
        const itemStore = typeof imgItem === 'object' ? imgItem?.store : '';
        if (url && typeof url === 'string' && !seenUrls.has(url)) {
          if (!itemStore || itemStore.toUpperCase() === activeStore) {
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

    // 2. Project taskSummaries links (Prioritized cloud-backed task summarize, strictly matching store)
    if (isProjMatchingStore && p?.taskSummaries && Array.isArray(p.taskSummaries)) {
      p.taskSummaries.forEach((ts, tsIdx) => {
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

    // 3. Custom user-posted links from localStorage (fallback for offline/local cache, strictly filtered by activeStore)
    customUnitImages.forEach((c) => {
      if (c.url && !seenUrls.has(c.url)) {
        if (!c.store || c.store.toUpperCase() === activeStore) {
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

    // 3. Project direct image / thumbnail fields (strictly matching activeStore)
    if (isProjMatchingStore) {
      if (p?.thumbnail && typeof p.thumbnail === 'string' && !seenUrls.has(p.thumbnail)) {
        seenUrls.add(p.thumbnail);
        list.push({
          id: 'proj_thumb',
          url: p.thumbnail,
          title: 'Project Thumbnail',
          source: 'Project Data',
          isCustom: true,
        });
      }
      if (p?.imageUrl && typeof p.imageUrl === 'string' && !seenUrls.has(p.imageUrl)) {
        seenUrls.add(p.imageUrl);
        list.push({
          id: 'proj_image',
          url: p.imageUrl,
          title: 'Project Image',
          source: 'Project Data',
          isCustom: true,
        });
      }
      if ((p as any)?.image && typeof (p as any).image === 'string' && !seenUrls.has((p as any).image)) {
        seenUrls.add((p as any).image);
        list.push({
          id: 'proj_img',
          url: (p as any).image,
          title: 'Project Image',
          source: 'Project Data',
          isCustom: true,
        });
      }
      if ((p as any)?.photo && typeof (p as any).photo === 'string' && !seenUrls.has((p as any).photo)) {
        seenUrls.add((p as any).photo);
        list.push({
          id: 'proj_photo',
          url: (p as any).photo,
          title: 'Project Photo',
          source: 'Project Data',
          isCustom: true,
        });
      }
    }

    // 4. Unit image from layout data (strictly matching activeStore)
    const dataStore = (data.store || '').toUpperCase().trim();
    const isDataMatchingStore = !dataStore || !activeStore || dataStore === activeStore;
    if (isDataMatchingStore) {
      if (data.imageUrl && typeof data.imageUrl === 'string' && !seenUrls.has(data.imageUrl)) {
        seenUrls.add(data.imageUrl);
        list.push({
          id: 'data_image',
          url: data.imageUrl,
          title: 'Unit Layout Image',
          source: 'Layout Data',
        });
      }
      if (data.thumbnail && typeof data.thumbnail === 'string' && !seenUrls.has(data.thumbnail)) {
        seenUrls.add(data.thumbnail);
        list.push({
          id: 'data_thumb',
          url: data.thumbnail,
          title: 'Unit Thumbnail',
          source: 'Layout Data',
        });
      }
      if (data.image && typeof data.image === 'string' && !seenUrls.has(data.image)) {
        seenUrls.add(data.image);
        list.push({
          id: 'data_img',
          url: data.image,
          title: 'Floor Image',
          source: 'Layout Data',
        });
      }
    }

    // 5. Project comments attachments (strictly matching activeStore)
    if (isProjMatchingStore && p?.comments && Array.isArray(p.comments)) {
      p.comments.forEach((c, cIdx) => {
        if (c.attachments && Array.isArray(c.attachments)) {
          c.attachments.forEach((att, aIdx) => {
            if (att.url && !seenUrls.has(att.url)) {
              seenUrls.add(att.url);
              list.push({
                id: `comm_${cIdx}_${aIdx}`,
                url: att.url,
                title: att.name || `Attachment ${list.length + 1}`,
                source: `Comment by ${c.userName || 'User'}`,
              });
            }
          });
        }
      });
    }

    return list;
  }, [customUnitImages, activeStore, data.store, data.imageUrl, data.thumbnail, data.image, p, p?.comments, p?.taskSummaries, p?.thumbnail, p?.imageUrl, (p as any)?.image, (p as any)?.photo]);

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
