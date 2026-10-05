import { useState, useEffect, useMemo } from 'react';
import { Project } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { doc, setDoc, deleteField } from 'firebase/firestore';
import { db, APP_ID } from '../../../lib/firebase';
import { extractAllProjectCodes, projectMatchesUnitCode } from '../../../lib/utils';
import { TooltipImageItem } from './tooltipTypes';
import { deleteR2ImageCleanly } from '../../../lib/r2StorageUtils';

interface UseTooltipImagesParams {
  p?: Project;
  data: any;
  unitCode: string;
  tooltipRef: React.RefObject<HTMLDivElement>;
  positionTooltip: (forceRecalculate?: boolean) => void;
}

export function useTooltipImages({
  p,
  data,
  unitCode,
  tooltipRef,
  positionTooltip,
}: UseTooltipImagesParams) {
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [showAddLinkInput, setShowAddLinkInput] = useState(false);
  const [newLinkInput, setNewLinkInput] = useState('');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<{ url: string; title?: string } | null>(null);
  const [customUnitImages, setCustomUnitImages] = useState<Array<{ id: string; url: string; title?: string; createdAt?: string }>>([]);

  const activeUnitStorageKey = `taka_unit_images_${data.code || unitCode || 'default'}`;

  // Load custom images from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(activeUnitStorageKey);
      if (saved) {
        setCustomUnitImages(JSON.parse(saved));
      } else {
        setCustomUnitImages([]);
      }
    } catch {
      setCustomUnitImages([]);
    }
  }, [activeUnitStorageKey]);

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

    // Persist link without polluting taskSummaries with fake tasks
    try {
      const allProjects = useAppStore.getState().projects;
      const targetProj = p || allProjects.find(item => {
        if (item.id === p?.id) return true;
        const itemCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
        const targetCode = String(data.code || unitCode || '').toLowerCase();
        return itemCodes.includes(targetCode) || projectMatchesUnitCode(itemCodes, targetCode);
      });

      if (targetProj) {
        // Purge any legacy fake "Link / Photo:" tasks from taskSummaries to keep the task list & detail box clean
        const cleanedSummaries = (targetProj.taskSummaries || []).filter(
          ts => !ts.name?.startsWith('Link / Photo:') && !ts.name?.startsWith('http://') && !ts.name?.startsWith('https://')
        );

        const updatedProject: Project = {
          ...targetProj,
          taskSummaries: cleanedSummaries,
          imageUrl: targetProj.imageUrl || trimmed,
          thumbnail: targetProj.thumbnail || trimmed,
        };

        // 1. Instant Zustand 0ms optimistic update
        useAppStore.getState().setProjects(
          allProjects.map(proj => proj.id === targetProj.id ? updatedProject : proj)
        );

        // 2. Cloud Firestore persistence
        if (targetProj.id) {
          setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", targetProj.id), {
            taskSummaries: cleanedSummaries,
            imageUrl: updatedProject.imageUrl,
            thumbnail: updatedProject.thumbnail,
          }, { merge: true }).catch(err => {
            console.error("Failed to sync to Firestore:", err);
          });
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

    // Clean up from project.taskSummaries
    try {
      const targetUrl = urlToDelete || customUnitImages.find(item => item.id === id)?.url;
      if (targetUrl) {
        deleteR2ImageCleanly(targetUrl).catch(err => {
          console.warn("[R2 Purge] Deep clean error:", err);
        });
      }

      const allProjects = useAppStore.getState().projects;
      const targetProj = p || allProjects.find(item => {
        if (item.id === p?.id) return true;
        const itemCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
        const targetCode = String(data.code || unitCode || '').toLowerCase();
        return itemCodes.includes(targetCode) || projectMatchesUnitCode(itemCodes, targetCode);
      });

      if (targetProj) {
        const filteredSummaries = (targetProj.taskSummaries || []).filter(
          ts => ts.link !== urlToDelete && ts.imageUrl !== urlToDelete && !ts.name?.includes(urlToDelete || '') && !ts.name?.startsWith('Link / Photo:')
        );
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
        } as Project;

        useAppStore.getState().setProjects(
          allProjects.map(proj => proj.id === targetProj.id ? updatedProject : proj)
        );

        if (targetProj.id) {
          const firestoreUpdate: Record<string, any> = {
            taskSummaries: filteredSummaries,
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

  // Consolidate all image items (user-added links, taskSummaries, layout image/thumbnail, project attachments)
  const allUnitImages = useMemo(() => {
    const list: TooltipImageItem[] = [];
    const seenUrls = new Set<string>();

    // 1. Project taskSummaries links (Prioritized cloud-backed task summarize)
    if (p?.taskSummaries && Array.isArray(p.taskSummaries)) {
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

    // 2. Custom user-posted links from localStorage
    customUnitImages.forEach((c) => {
      if (c.url && !seenUrls.has(c.url)) {
        seenUrls.add(c.url);
        list.push({
          id: c.id,
          url: c.url,
          title: c.title || 'Attached Link',
          source: 'User Link',
          isCustom: true,
        });
      }
    });

    // 3. Project direct image / thumbnail fields
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

    // 4. Unit image from layout data
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

    // 5. Project comments attachments
    if (p?.comments && Array.isArray(p.comments)) {
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
  }, [customUnitImages, data.imageUrl, data.thumbnail, data.image, p?.comments, p?.taskSummaries, p?.thumbnail, p?.imageUrl, (p as any)?.image, (p as any)?.photo]);

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
