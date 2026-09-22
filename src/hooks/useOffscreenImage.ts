import { useState, useEffect } from 'react';

/**
 * Custom hook to load & decode images off the Main Thread using createImageBitmap() or img.decode().
 * Prevents Main Thread jank/freeze (50ms-200ms) when loading large CAD floorplan images.
 */
export function useOffscreenImage(url: string | undefined | null, crossOrigin?: string) {
  const [image, setImage] = useState<HTMLImageElement | ImageBitmap | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');

  useEffect(() => {
    if (!url) {
      setImage(null);
      setStatus('failed');
      return;
    }

    let isMounted = true;
    setStatus('loading');

    // Strategy 1: Fetch blob and decode to ImageBitmap on C++ background thread
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        if (isMounted) {
          setImage(bitmap as any);
          setStatus('loaded');
        }
      })
      .catch((_err) => {
        // Strategy 2: Fallback to HTMLImageElement with img.decode()
        if (!isMounted) return;
        const img = new window.Image();
        if (crossOrigin) img.crossOrigin = crossOrigin;
        img.src = url;

        if ('decode' in img) {
          img.decode()
            .then(() => {
              if (isMounted) {
                setImage(img);
                setStatus('loaded');
              }
            })
            .catch(() => {
              if (isMounted) {
                setImage(img);
                setStatus('loaded');
              }
            });
        } else {
          img.onload = () => {
            if (isMounted) {
              setImage(img);
              setStatus('loaded');
            }
          };
          img.onerror = () => {
            if (isMounted) setStatus('failed');
          };
        }
      });

    return () => {
      isMounted = false;
    };
  }, [url, crossOrigin]);

  return [image, status] as const;
}
