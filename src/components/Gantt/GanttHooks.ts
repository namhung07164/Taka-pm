import React, { RefObject, useRef } from 'react';

export function useSyncScroll() {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingTop = useRef(false);
  const isSyncingMain = useRef(false);

  const handleTopScroll = () => {
    if (isSyncingMain.current) {
      isSyncingMain.current = false;
      return;
    }
    if (mainScrollRef.current && topScrollRef.current) {
      isSyncingTop.current = true;
      mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleMainScroll = () => {
    if (isSyncingTop.current) {
      isSyncingTop.current = false;
    } else {
      if (mainScrollRef.current && topScrollRef.current) {
        isSyncingMain.current = true;
        topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft;
      }
    }
  };

  return {
    topScrollRef,
    mainScrollRef,
    handleTopScroll,
    handleMainScroll,
  };
}
