import {
  upsertLocalRecord,
  patchLocalRecord,
  deleteLocalRecord,
  bulkPersistProjects,
  bulkPersistTasks,
  bulkPersistCosts,
  bulkPersistDelegations,
} from './localDb';
import { resolveLogicalCollection } from './autoDeltaQueue';
import { useAppStore } from '../store/useAppStore';
import { rollupParentTaskDatesAndStatus } from './taskRollupService';
import type { Project, Task, Cost, DelegationGroup } from '../types';

/**
 * Checks if a value or nested object contains a Firestore FieldValue sentinel
 * (e.g. serverTimestamp(), increment(), arrayUnion(), arrayRemove(), deleteField())
 * or dot-notation field paths (e.g. 'financial.byStore.HCM.totalApproved').
 */
export function hasSpecialFirestoreSentinelOrDotPath(
  obj: Record<string, any> | null | undefined,
  ignoreUpdatedAtSentinel = true
): boolean {
  if (!obj || typeof obj !== 'object') return false;

  const inspectValue = (val: any, depth: number): boolean => {
    if (val === null || val === undefined || typeof val !== 'object') return false;
    if (val instanceof Date) return false;
    if (Array.isArray(val)) {
      if (depth > 3) return false;
      return val.some((item) => inspectValue(item, depth + 1));
    }
    const ctorName = val.constructor?.name;
    if (
      typeof (val as any)._methodName === 'string' ||
      (ctorName && ctorName !== 'Object' && ctorName !== 'Array')
    ) {
      return true;
    }
    if (depth > 3) return false;
    for (const v of Object.values(val)) {
      if (inspectValue(v, depth + 1)) return true;
    }
    return false;
  };

  for (const [key, val] of Object.entries(obj)) {
    if (key.includes('.')) return true;
    if (ignoreUpdatedAtSentinel && key === 'updatedAt') continue;
    if (inspectValue(val, 0)) return true;
  }
  return false;
}

/**
 * Builds a clean plain-JSON copy of a Firestore payload suitable for local Dexie/Zustand
 * and auto-delta transmission (replacing any serverTimestamp() on updatedAt with ISO string,
 * and stripping any FieldValue sentinels or dot-path keys).
 */
export function buildCleanLocalPayload(
  rawData: Record<string, any> | null | undefined,
  docId: string
): { cleanCopy: Record<string, any>; isCompletePlainObject: boolean } {
  if (!rawData || typeof rawData !== 'object') {
    return { cleanCopy: { id: docId }, isCompletePlainObject: false };
  }

  const hasSpecial = hasSpecialFirestoreSentinelOrDotPath(rawData, true);
  const cleanCopy: Record<string, any> = { id: docId };

  for (const [key, val] of Object.entries(rawData)) {
    if (key.includes('.')) continue;
    if (key === 'updatedAt') {
      cleanCopy.updatedAt =
        typeof val === 'string' || typeof val === 'number' ? val : new Date().toISOString();
      continue;
    }
    if (val !== null && typeof val === 'object' && !(val instanceof Date) && !Array.isArray(val)) {
      const ctorName = val.constructor?.name;
      if (typeof (val as any)._methodName === 'string' || (ctorName && ctorName !== 'Object')) {
        continue;
      }
    }
    cleanCopy[key] = val;
  }

  if (!cleanCopy.updatedAt) {
    cleanCopy.updatedAt = new Date().toISOString();
  }

  return { cleanCopy, isCompletePlainObject: !hasSpecial };
}

/**
 * Mirrors a direct Firestore write (setDoc / updateDoc / deleteDoc / writeBatch)
 * into Dexie (localDb) and Zustand (useAppStore) on the originating device so that
 * when DELTA_FIRST detaches collection listeners and skips self-session deltas,
 * local state and IndexedDB stay 100% synchronized in 0ms.
 */
export function mirrorLocalWrite(
  docPath: string | undefined,
  docId: string | undefined,
  kind: 'set' | 'update' | 'delete',
  rawData?: Record<string, any>,
  isMerge: boolean = false
): void {
  if (!docPath || !docId || String(docId).startsWith('ts_')) return;
  const logical = resolveLogicalCollection(docPath);
  if (!logical) return;

  const isDel = kind === 'delete' || Boolean(rawData?.isDeleted);
  if (isDel) {
    deleteLocalRecord(logical, docId).catch(() => {});
    const store = useAppStore.getState();
    if (logical === 'taka_delegations') {
      const existing = store.delegationGroups || [];
      if (existing.some((g) => g.id === docId)) {
        const nextGroups = existing.filter((g) => g.id !== docId);
        store.setDelegationGroups(nextGroups);
        if (store.tasks && store.tasks.length > 0) {
          store.setTasks(rollupParentTaskDatesAndStatus(store.tasks, nextGroups));
        }
      }
    } else if (logical === 'taka_costs') {
      if ((store.costs || []).some((c) => c.id === docId)) {
        store.optimisticDeleteCosts([docId]);
      }
    } else if (logical === 'taka_tasks') {
      if ((store.tasks || []).some((t) => t.id === docId)) {
        store.optimisticDeleteTasks([docId]);
      }
    } else if (logical === 'taka_projects') {
      if ((store.projects || []).some((p) => p.id === docId)) {
        store.optimisticDeleteProjects([docId]);
      }
    }
    return;
  }

  if (!rawData || typeof rawData !== 'object') return;
  const { cleanCopy } = buildCleanLocalPayload(rawData, docId);
  const isFullRecord =
    kind === 'set' &&
    !isMerge &&
    Boolean(cleanCopy.name || cleanCopy.code || cleanCopy.projectCode || cleanCopy.subTasks);

  // 1. Offload persistence to Dexie Local Database
  if (isFullRecord || logical === 'taka_delegations') {
    upsertLocalRecord(logical, cleanCopy).catch(() => {});
  } else {
    patchLocalRecord(logical, docId, cleanCopy).catch(() => {});
  }

  // 2. Immediately mirror into Zustand for Delegation Groups (which often call setDoc directly)
  // and for tasks/projects/costs when modified via direct setDoc/updateDoc (e.g. delegation flag toggles)
  const store = useAppStore.getState();
  if (logical === 'taka_delegations') {
    const currentGroups = store.delegationGroups || [];
    const idx = currentGroups.findIndex((g) => g.id === docId);
    if (idx !== -1) {
      const merged = { ...currentGroups[idx], ...cleanCopy } as DelegationGroup;
      const nextGroups = [...currentGroups];
      nextGroups[idx] = merged;
      store.setDelegationGroups(nextGroups);
      if (store.tasks && store.tasks.length > 0) {
        store.setTasks(rollupParentTaskDatesAndStatus(store.tasks, nextGroups));
      }
    } else if (
      store.isDelegationsRequested ||
      currentGroups.length > 0 ||
      store.isTaskModalOpen ||
      store.isProjectModalOpen
    ) {
      const nextGroups = [...currentGroups, cleanCopy as DelegationGroup];
      store.setDelegationGroups(nextGroups);
      if (store.tasks && store.tasks.length > 0) {
        store.setTasks(rollupParentTaskDatesAndStatus(store.tasks, nextGroups));
      }
    }
  } else if (logical === 'taka_tasks' && cleanCopy.delegation !== undefined && Object.keys(cleanCopy).length <= 5) {
    const existingTask = (store.tasks || []).find((t) => t.id === docId);
    if (existingTask && existingTask.delegation !== cleanCopy.delegation) {
      store.optimisticUpdateTasks([{ id: docId, delegation: cleanCopy.delegation, updatedAt: cleanCopy.updatedAt }]);
    }
  } else if (logical === 'taka_projects' && cleanCopy.delegation !== undefined && Object.keys(cleanCopy).length <= 5) {
    const existingProj = (store.projects || []).find((p) => p.id === docId);
    if (existingProj && existingProj.delegation !== cleanCopy.delegation) {
      store.optimisticUpdateProjects([{ id: docId, delegation: cleanCopy.delegation, updatedAt: cleanCopy.updatedAt }]);
    }
  }
}

export {
  bulkPersistProjects,
  bulkPersistTasks,
  bulkPersistCosts,
  bulkPersistDelegations,
  deleteLocalRecord,
};
