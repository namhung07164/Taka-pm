import { useEffect, useRef, useState } from 'react';
import {
  getMemoryCachedImage,
  setMemoryCachedImage,
  getCachedBlobFromIDB,
  fetchAndCacheImageBlob,
  normalizeImageCacheKey,
} from '../lib/imageDBCache';
import { extractR2Key, resolveR2UrlToHttp } from '../components/PictureMapping/lib/r2Upload';

/**
 * Custom hook to load & decode floorplan images with Persistent Disk Cache (CacheStorage + IndexedDB)
 * and zero main-thread blocking.
 *
 * Flow:
 * 1. 0ms In-Memory LRU Cache Hit
 * 2. <10ms Local Disk Cache Hit (CacheStorage / IndexedDB Blob -> async Image decode)
 * 3. Immediate Native Browser C++ Image Stream (does not block on CORS fetch/proxy)
 * 4. Quiet background persistence of the binary Blob to Disk Cache after the image renders
 */
export function useOffscreenImage(url: string | undefined | null, crossOrigin: string = 'anonymous') {
  const normalizedKey = normalizeImageCacheKey(url);
  const loadedKeyRef = useRef<string>('');

  const [image, setImage] = useState<HTMLImageElement | ImageBitmap | null>(() => {
    if (url) {
      const cached = getMemoryCachedImage(url);
      if (cached) {
        loadedKeyRef.current = normalizeImageCacheKey(url);
        return cached;
      }
    }
    return null;
  });

  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>(() => {
    if (url && getMemoryCachedImage(url)) return 'loaded';
    return url ? 'loading' : 'failed';
  });

  useEffect(() => {
    if (!url || typeof url !== 'string' || !url.trim() || !normalizedKey) {
      loadedKeyRef.current = '';
      setImage(null);
      setStatus('failed');
      return;
    }

    // 1. Instant In-Memory Cache Hit (0ms)
    const memCached = getMemoryCachedImage(url);
    if (memCached) {
      loadedKeyRef.current = normalizedKey;
      setImage((prev) => (prev === memCached ? prev : memCached));
      setStatus('loaded');
      return;
    }

    let isMounted = true;
    let bgCacheTimer: any = null;
    setStatus('loading');

    async function loadFloorplanImage() {
      try {
        // 2. Fast Local Disk Cache Check (CacheStorage API + IndexedDB)
        const diskBlob = await getCachedBlobFromIDB(url!);
        if (!isMounted) return;

        if (diskBlob && diskBlob.size > 0) {
          const blobUrl = URL.createObjectURL(diskBlob);
          const diskImg = new Image();
          diskImg.decoding = 'async';

          const onDiskImgLoaded = () => {
            if (!isMounted) return;
            loadedKeyRef.current = normalizedKey;
            setMemoryCachedImage(url!, diskImg, blobUrl);
            setImage(diskImg);
            setStatus('loaded');
          };

          diskImg.onload = onDiskImgLoaded;
          diskImg.onerror = () => {
            try { URL.revokeObjectURL(blobUrl); } catch (_) {}
            if (isMounted) loadFromNetwork();
          };
          diskImg.src = blobUrl;
          return;
        }

        // 3. Not on disk yet -> Load immediately via native browser image loader (non-blocking)
        await loadFromNetwork();
      } catch (_err) {
        if (isMounted) setStatus('failed');
      }
    }

    async function loadFromNetwork() {
      let targetSrc = url!.trim();

      if (
        targetSrc.startsWith('r2://') ||
        (!targetSrc.startsWith('http://') &&
          !targetSrc.startsWith('https://') &&
          !targetSrc.startsWith('blob:') &&
          !targetSrc.startsWith('data:'))
      ) {
        const resolved = await resolveR2UrlToHttp(targetSrc);
        if (!isMounted) return;
        if (resolved) {
          targetSrc = resolved;
        } else {
          setStatus('failed');
          return;
        }
      }

      const isR2Direct = targetSrc.includes('.r2.cloudflarestorage.com');
      const netImg = new Image();
      netImg.decoding = 'async';

      // R2 storage endpoints do not include CORS headers by default; omit crossOrigin so browser loads directly
      if (crossOrigin && !isR2Direct && !targetSrc.startsWith('data:') && !targetSrc.startsWith('blob:')) {
        netImg.crossOrigin = crossOrigin;
      }

      const onNetworkSuccess = (loadedEl: HTMLImageElement, finalResolvedUrl: string) => {
        if (!isMounted) return;
        loadedKeyRef.current = normalizedKey;
        setMemoryCachedImage(url!, loadedEl);
        setImage(loadedEl);
        setStatus('loaded');

        // 4. Quietly persist binary Blob to Disk Cache in background after floorplan is already on screen
        if (!finalResolvedUrl.startsWith('data:') && !finalResolvedUrl.startsWith('blob:')) {
          bgCacheTimer = setTimeout(() => {
            fetchAndCacheImageBlob(finalResolvedUrl).catch(() => {});
          }, 600);
        }
      };

      const tryServerProxyFallback = async (sourceUrl: string) => {
        if (!isMounted) return;
        let freshUrl = sourceUrl;
        const r2Key = extractR2Key(url!) || extractR2Key(sourceUrl);
        if (r2Key) {
          const reSigned = await resolveR2UrlToHttp(`r2://${r2Key}`);
          if (!isMounted) return;
          if (reSigned) freshUrl = reSigned;
        }

        const proxyImg = new Image();
        proxyImg.decoding = 'async';
        proxyImg.crossOrigin = 'anonymous';
        const proxyUrl = `/api/pdf-proxy?url=${encodeURIComponent(freshUrl)}`;
        proxyImg.onload = () => onNetworkSuccess(proxyImg, freshUrl);
        proxyImg.onerror = () => {
          // Last resort: try freshly re-signed direct URL without crossOrigin
          if (freshUrl !== sourceUrl) {
            const retryDirect = new Image();
            retryDirect.decoding = 'async';
            retryDirect.onload = () => onNetworkSuccess(retryDirect, freshUrl);
            retryDirect.onerror = () => {
              if (isMounted) setStatus('failed');
            };
            retryDirect.src = freshUrl;
          } else {
            if (isMounted) setStatus('failed');
          }
        };
        proxyImg.src = proxyUrl;
      };

      netImg.onload = () => onNetworkSuccess(netImg, targetSrc);
      netImg.onerror = () => {
        if (!isMounted) return;
        // If non-R2 failed due to crossOrigin attribute, retry without crossOrigin before proxy
        if (netImg.crossOrigin) {
          const noCorsImg = new Image();
          noCorsImg.decoding = 'async';
          noCorsImg.onload = () => onNetworkSuccess(noCorsImg, targetSrc);
          noCorsImg.onerror = () => {
            tryServerProxyFallback(targetSrc);
          };
          noCorsImg.src = targetSrc;
        } else {
          tryServerProxyFallback(targetSrc);
        }
      };

      netImg.src = targetSrc;
    }

    loadFloorplanImage();

    return () => {
      isMounted = false;
      if (bgCacheTimer) clearTimeout(bgCacheTimer);
    };
  }, [normalizedKey, url, crossOrigin]);

  return [image, status] as const;
}
