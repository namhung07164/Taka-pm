import React, { lazy, useEffect, useRef, useState } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { cn } from '../lib/utils';

export function LazyImage({ src, alt, className }: { src: string, alt: string, className?: string }) {
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '50px',
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={imgRef} className={cn("relative min-h-[100px] bg-black/5 dark:bg-white/5 rounded flex items-center justify-center", className)}>
      {isVisible ? (
        <img
          src={src}
          alt={alt}
          className={cn("w-full h-auto rounded object-contain border border-black/10 dark:border-white/10 shadow-sm", className)}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
            if (imgRef.current) {
              imgRef.current.style.display = 'none';
            }
          }}
        />
      ) : (
        <span className="text-xs text-slate-400">Loading thumbnail...</span>
      )}
    </div>
  );
}
