import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface UseTableVirtualizerOptions {
  count: number;
  estimateSize?: number;
  overscan?: number;
}

/**
 * Universal High-Performance Table Virtualizer bọc @tanstack/react-virtual
 * Giới hạn số lượng DOM nodes trên bảng lớn (chỉ render ~20-30 rows hiển thị trên màn hình)
 */
export function useTableVirtualizer({
  count,
  estimateSize = 46,
  overscan = 8,
}: UseTableVirtualizerOptions) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return {
    parentRef,
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
  };
}
