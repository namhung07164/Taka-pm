import React, { useEffect, useId, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Enterprise Stacking Context & Z-Index Management Standard
 * 
 * Strict hierarchic layers to prevent DOM clipping, portal layering bugs,
 * and ensure tooltips, popovers, and nested modals stay in correct depth.
 */
export const Z_INDEX_VALUES = {
  BASE: 0,
  STICKY_HEADER: 40,
  DROPDOWN: 100,
  DRAWER: 200,
  FLOATING_CONTROL: 500,
  LAYOUT_TOOLTIP: 20000,
  MODAL_BASE: 100000,
  MODAL_NESTED: 120000,
  QUICK_NAV: 150000,
  MINI_GANTT: 150000,
  CONFIRM_ALERT: 160000,
  COMMAND_PALETTE: 170000,
  LIGHTBOX: 180000,
  MODAL_MODULAR: 185000,
  TOAST: 200000,
  MAX: 999999
} as const;

export type ZIndexLayer = keyof typeof Z_INDEX_VALUES;

/**
 * Returns numeric z-index value with optional relative offset
 */
export function getZIndexValue(layer: ZIndexLayer, offset: number = 0): number {
  return (Z_INDEX_VALUES[layer] ?? 0) + offset;
}

/**
 * Returns Tailwind arbitrary z-index class string, e.g. "z-[150000]"
 */
export function getZIndexClass(layer: ZIndexLayer, offset: number = 0): string {
  const val = getZIndexValue(layer, offset);
  return `z-[${val}]`;
}

/**
 * Active Overlay Registry for dynamic stacking, nesting, and tab-switch cleanup
 */
interface OverlayEntry {
  id: string;
  layer: ZIndexLayer;
  createdAt: number;
  onClose?: () => void;
  closeOnTabChange?: boolean;
}

class OverlayStackManager {
  private overlays: Map<string, OverlayEntry> = new Map();
  private listeners: Set<() => void> = new Set();

  public register(entry: OverlayEntry): () => void {
    this.overlays.set(entry.id, entry);
    this.notify();
    return () => {
      this.overlays.delete(entry.id);
      this.notify();
    };
  }

  public unregister(id: string): void {
    if (this.overlays.has(id)) {
      this.overlays.delete(id);
      this.notify();
    }
  }

  public getTopLayer(): ZIndexLayer | null {
    if (this.overlays.size === 0) return null;
    let topEntry: OverlayEntry | null = null;
    for (const entry of this.overlays.values()) {
      if (!topEntry || Z_INDEX_VALUES[entry.layer] > Z_INDEX_VALUES[topEntry.layer]) {
        topEntry = entry;
      }
    }
    return topEntry?.layer ?? null;
  }

  public hasModalOpen(): boolean {
    for (const entry of this.overlays.values()) {
      if (Z_INDEX_VALUES[entry.layer] >= Z_INDEX_VALUES.MODAL_BASE) {
        return true;
      }
    }
    return false;
  }

  public closeTabSensitiveOverlays(): void {
    for (const [id, entry] of this.overlays.entries()) {
      if (entry.closeOnTabChange && typeof entry.onClose === 'function') {
        try {
          entry.onClose();
        } catch {}
      }
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(fn => {
      try { fn(); } catch {}
    });
  }
}

export const overlayStackManager = new OverlayStackManager();

/**
 * Hook to register an overlay with the central Z-Index manager
 * and auto-close when tab switching occurs.
 */
export function useOverlayStack(options: {
  layer: ZIndexLayer;
  isOpen: boolean;
  onClose?: () => void;
  closeOnTabChange?: boolean;
}) {
  const { layer, isOpen, onClose, closeOnTabChange = true } = options;
  const overlayId = useId();
  const activeTab = useAppStore(state => state.activeTab);

  useEffect(() => {
    if (!isOpen) return;

    const cleanup = overlayStackManager.register({
      id: overlayId,
      layer,
      createdAt: Date.now(),
      onClose,
      closeOnTabChange
    });

    return () => {
      cleanup();
    };
  }, [overlayId, layer, isOpen, onClose, closeOnTabChange]);

  // Tab switch auto-close enforcement
  useEffect(() => {
    if (isOpen && closeOnTabChange && onClose) {
      // Tab changed while overlay is open
      const unsub = useAppStore.subscribe((state, prevState) => {
        if (state.activeTab !== prevState.activeTab) {
          onClose();
        }
      });
      return () => unsub();
    }
  }, [isOpen, closeOnTabChange, onClose]);

  return {
    zValue: getZIndexValue(layer),
    zClass: getZIndexClass(layer)
  };
}
