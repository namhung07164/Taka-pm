import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { setDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { useAppStore } from '../../store/useAppStore';
import { TooltipImageItem } from './TooltipParts/tooltipTypes';
import { removeUploadedImageEverywhere } from '../../lib/projectImageSync';

function normalizeStore(store?: string | null): string {
  if (!store) return 'HCM';
  const s = String(store).trim().toUpperCase();
  if (s.includes('HN') || s.includes('HÀ NỘI') || s.includes('HA NOI') || s.includes('HANOI')) return 'HN';
  if (s.includes('HCM') || s.includes('HỒ CHÍ MINH') || s.includes('HO CHI MINH') || s.includes('SAI GON') || s.includes('SG')) return 'HCM';
  return s === 'ALL' ? 'HCM' : s;
}

const legendImagesMemoryCache = new Map<string, Array<{ id: string; url: string; title?: string; createdAt?: string; store?: string }>>();

export function useColorLegendImages(canWrite: boolean = false) {
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);

  const activeStore = useMemo(() => normalizeStore(globalStoreFilter), [globalStoreFilter]);
  const targetLoc = useMemo(() => {
    const loc = String(globalLocationFilter || '').trim();
    return loc && loc.toLowerCase() !== 'all' ? loc.toUpperCase() : 'L1';
  }, [globalLocationFilter]);

  const cleanCode = useMemo(() => `COLOR_LEGEND_${targetLoc}`, [targetLoc]);
  const storageKey = useMemo(() => `taka_unit_images_${activeStore}_${cleanCode}`, [activeStore, cleanCode]);
  const docKey = useMemo(() => `${activeStore}_${cleanCode}`, [activeStore, cleanCode]);

  const [showImagePanel, setShowImagePanel] = useState(false);
  const [showAddLinkInput, setShowAddLinkInput] = useState(false);
  const [newLinkInput, setNewLinkInput] = useState('');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<{ url: string; title?: string; initialScale?: number } | null>(null);
  const [customImages, setCustomImages] = useState<Array<{ id: string; url: string; title?: string; createdAt?: string; store?: string }>>(() => {
    if (legendImagesMemoryCache.has(docKey)) {
      return legendImagesMemoryCache.get(docKey) || [];
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Load from localStorage immediately on store/floor switch, and sync from Firestore
  useEffect(() => {
    let localList: Array<{ id: string; url: string; title?: string; createdAt?: string; store?: string }> = [];
    if (legendImagesMemoryCache.has(docKey)) {
      localList = legendImagesMemoryCache.get(docKey)!;
      setCustomImages(localList);
    } else {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            localList = parsed.filter(item => !item.store || normalizeStore(item.store) === activeStore);
            legendImagesMemoryCache.set(docKey, localList);
            setCustomImages(localList);
          } else {
            setCustomImages([]);
          }
        } else {
          setCustomImages([]);
        }
      } catch {
        setCustomImages([]);
      }
    }

    // Only fetch from Firestore when the user opens the Color Legend image panel and it is not yet cached in memory
    if (!showImagePanel || legendImagesMemoryCache.has(docKey)) {
      return;
    }

    let cancelled = false;
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_unit_images', docKey);
    getDoc(docRef)
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const cloudData = snap.data();
          if (Array.isArray(cloudData?.images)) {
            const cloudImages = cloudData.images.filter(
              (item: any) => !item.store || normalizeStore(item.store) === activeStore
            );
            legendImagesMemoryCache.set(docKey, cloudImages);
            setCustomImages(cloudImages);
            try {
              localStorage.setItem(storageKey, JSON.stringify(cloudImages));
            } catch {}
            return;
          }
        }
        legendImagesMemoryCache.set(docKey, localList);
      })
      .catch((err) => {
        console.warn('[useColorLegendImages] Cloud fetch:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [storageKey, activeStore, cleanCode, docKey, showImagePanel]);

  const handleAddCustomImage = (e?: React.FormEvent, customUrl?: string) => {
    if (e) e.preventDefault();
    if (!canWrite) return;
    const targetUrl = (customUrl || newLinkInput).trim();
    if (!targetUrl) return;

    const newEntry = {
      id: `legend_img_${Date.now()}`,
      url: targetUrl,
      title: `Legend ${targetLoc} #${customImages.length + 1}`,
      createdAt: new Date().toISOString(),
      store: activeStore,
    };
    const updated = [newEntry, ...customImages];
    legendImagesMemoryCache.set(docKey, updated);
    setCustomImages(updated);
    setNewLinkInput('');
    setShowAddLinkInput(false);

    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('taka_unit_images_changed'));
    }

    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_unit_images', docKey);
    setDoc(
      docRef,
      {
        unitCode: cleanCode,
        store: activeStore,
        images: updated,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    ).catch((err) => {
      console.error('[useColorLegendImages] Failed to save legend images to Firestore:', err);
    });
  };

  const handleDeleteCustomImage = (id: string, urlToDelete?: string) => {
    if (!canWrite) return;
    const targetUrl = urlToDelete || customImages.find((item) => item.id === id)?.url;
    const updated = customImages.filter((item) => item.id !== id && (urlToDelete ? item.url !== urlToDelete : true));
    legendImagesMemoryCache.set(docKey, updated);
    setCustomImages(updated);

    try {
      if (updated.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {}

    if (targetUrl) {
      removeUploadedImageEverywhere(targetUrl, undefined, cleanCode).catch((err) => {
        console.warn('[useColorLegendImages] removeUploadedImageEverywhere error:', err);
      });
    }
  };

  const handleCopyLink = (url: string) => {
    try {
      navigator.clipboard?.writeText(url);
      setCopiedLink(url);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {}
  };

  const allLegendImages: TooltipImageItem[] = useMemo(() => {
    return customImages.map((c) => ({
      id: c.id,
      url: c.url,
      title: c.title || `Legend ${targetLoc}`,
      source: `${activeStore} • ${targetLoc}`,
      isCustom: true,
    }));
  }, [customImages, activeStore, targetLoc]);

  return {
    cleanCode,
    showImagePanel,
    setShowImagePanel,
    showAddLinkInput,
    setShowAddLinkInput,
    newLinkInput,
    setNewLinkInput,
    copiedLink,
    enlargedImage,
    setEnlargedImage,
    allLegendImages,
    handleAddCustomImage,
    handleDeleteCustomImage,
    handleCopyLink,
  };
}
