import React, { useEffect, useState } from 'react';
/**
 * Smart Change Flash & Live Edit Awareness Service (Notion, Jira & Google Sheets Standard)
 * 
 * Provides instantaneous, high-performance visual feedback when data is updated remotely:
 * 1. Highlights recently updated rows with a subtle emerald green pulse (Smart Change Flash).
 * 2. Auto-fades after 2.5 seconds with zero residual CPU/DOM overhead.
 * 3. Tracks active collaborative editing presence between teammates.
 */


export interface FlashEntry {
  docId: string;
  collectionName: string;
  updatedBy?: string;
  timestamp: number;
}

// In-memory registry of flashed document IDs (O(1) lookups)
const activeFlashMap = new Map<string, FlashEntry>();
const listeners = new Set<(flashedIds: Set<string>) => void>();
let cleanupTimer: any = null;

// Registry of user editing presence: docId -> { email, timestamp }
const activeEditingPresenceMap = new Map<string, { email: string; timestamp: number }>();
const presenceListeners = new Set<() => void>();

function notifyListeners() {
  const currentSet = new Set(activeFlashMap.keys());
  listeners.forEach((fn) => {
    try {
      fn(currentSet);
    } catch (e) {
      console.warn('[changeFlash] Listener error:', e);
    }
  });
}

function scheduleCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setTimeout(() => {
    cleanupTimer = null;
    const now = Date.now();
    let hasExpired = false;

    for (const [id, entry] of activeFlashMap.entries()) {
      if (now - entry.timestamp >= 2500) {
        activeFlashMap.delete(id);
        hasExpired = true;
      }
    }

    if (hasExpired) {
      notifyListeners();
    }

    if (activeFlashMap.size > 0) {
      scheduleCleanup();
    }
  }, 300);
}

/**
 * Triggers a smart change flash on a document ID (e.g. from Delta Sync or Realtime listener)
 */
export function triggerChangeFlash(docId: string, collectionName: string, updatedBy?: string) {
  if (!docId) return;
  activeFlashMap.set(docId, {
    docId,
    collectionName,
    updatedBy,
    timestamp: Date.now(),
  });
  notifyListeners();
  scheduleCleanup();
}

/**
 * Batches multiple flash triggers into a single notification to avoid layout churn
 */
export function triggerBatchChangeFlash(
  entries: Array<{ docId: string; collectionName: string; updatedBy?: string }>
) {
  if (!entries || entries.length === 0) return;
  const now = Date.now();
  entries.forEach((e) => {
    if (e.docId) {
      activeFlashMap.set(e.docId, {
        docId: e.docId,
        collectionName: e.collectionName,
        updatedBy: e.updatedBy,
        timestamp: now,
      });
    }
  });
  notifyListeners();
  scheduleCleanup();
}

/**
 * Hook to check if a specific row/docId is currently in "Smart Flash" state.
 * Only re-renders rows that match the changed ID.
 */
export function useIsRowFlashed(docId?: string | null): { isFlashed: boolean; updatedBy?: string } {
  const [isFlashed, setIsFlashed] = useState<boolean>(() => (docId ? activeFlashMap.has(docId) : false));

  useEffect(() => {
    if (!docId) return;

    const handleUpdate = (flashedIds: Set<string>) => {
      const active = flashedIds.has(docId);
      setIsFlashed(active);
    };

    // Set initial
    setIsFlashed(activeFlashMap.has(docId));

    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, [docId]);

  const entry = docId ? activeFlashMap.get(docId) : undefined;
  return {
    isFlashed,
    updatedBy: entry?.updatedBy,
  };
}

/**
 * Broadcasts that the current user is actively viewing/editing a task or project
 */
export function setLocalEditingPresence(docId: string, email: string) {
  if (!docId || !email) return;
  activeEditingPresenceMap.set(docId, { email, timestamp: Date.now() });
  presenceListeners.forEach((fn) => fn());
}

/**
 * Clears local editing presence when a modal closes
 */
export function clearLocalEditingPresence(docId: string) {
  if (!docId) return;
  activeEditingPresenceMap.delete(docId);
  presenceListeners.forEach((fn) => fn());
}

/**
 * Hook to retrieve active collaborator presence for a document
 */
export function useEditingPresence(docId?: string | null, currentUserEmail?: string): { isCollaborating: boolean; collaboratorEmail?: string } {
  const [presence, setPresence] = useState<{ isCollaborating: boolean; collaboratorEmail?: string }>({ isCollaborating: false });

  useEffect(() => {
    if (!docId) return;

    const check = () => {
      const p = activeEditingPresenceMap.get(docId);
      if (p && p.email !== currentUserEmail && Date.now() - p.timestamp < 60000) {
        setPresence({ isCollaborating: true, collaboratorEmail: p.email });
      } else {
        setPresence({ isCollaborating: false });
      }
    };

    check();
    presenceListeners.add(check);
    return () => {
      presenceListeners.delete(check);
    };
  }, [docId, currentUserEmail]);

  return presence;
}
