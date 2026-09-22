import { useState, useEffect } from 'react';
import {
  getMemoryCachedImage,
  setMemoryCachedImage,
  getCachedBlobFromIDB,
  setCachedBlobToIDB,
} from '../lib/imageDBCache';

/**
 * Custom hook to load & decode images off the Main Thread using createImageBitmap() or img.decode().
 * Features IndexedDB & In-Memory LRU Caching for 0ms floor switching and zero network delay.
 */
export function useOffscreenImage(url: string | undefined | null, crossOrigin?: string) {
  const [image, setImage] = useState<HTMLImageElement | ImageBitmap | null>(() => {
    if (url) {
      const cached = getMemoryCachedImage(url);
      if (cached) return cached;
    }
    return null;
  });

  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>(() => {
    if (url && getMemoryCachedImage(url)) return 'loaded';
    return url ? 'loading' : 'failed';
  });

  useEffect(() => {
    if (!url) {
      setImage(null);
      setStatus('failed');
      return;
    }

    // 1. Instant Memory Cache Hit
    const memCached = getMemoryCachedImage(url);
    if (memCached) {
      setImage(memCached);
      setStatus('loaded');
      return;
    }

    let isMounted = true;
    setStatus('loading');

    // 2. IndexedDB & Network Strategy
    async function loadWithCache() {
      try {
        // Step A: Check IndexedDB
        let blob = await getCachedBlobFromIDB(url!);

        // Step B: If missing from IDB, fetch from network and save to IDB
        if (!blob) {
          const res = await fetch(url!);
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          blob = await res.blob();
          setCachedBlobToIDB(url!, blob); // Save in background
        }

        // Step C: Decode Blob off Main Thread
        const bitmap = await createImageBitmap(blob);
        if (isMounted) {
          setMemoryCachedImage(url!, bitmap);
          setImage(bitmap);
          setStatus('loaded');
        }
      } catch (_err) {
        // Step D: Fallback to HTMLImageElement
        if (!isMounted) return;
        const img: HTMLImageElement = new Image();
        if (crossOrigin) img.crossOrigin = crossOrigin;
        img.src = url!;

        const onDone = () => {
          if (isMounted) {
            setMemoryCachedImage(url!, img);
            setImage(img);
            setStatus('loaded');
          }
        };

        if (typeof img.decode === 'function') {
          img.decode().then(onDone).catch(onDone);
        } else {
          img.onload = onDone;
          img.onerror = () => {
            if (isMounted) setStatus('failed');
          };
        }
      }
    }

    loadWithCache();

    return () => {
      isMounted = false;
    };
  }, [url, crossOrigin]);

  return [image, status] as const;
}
