import {
  setDoc as rawSetDoc,
  updateDoc as rawUpdateDoc,
  deleteDoc as rawDeleteDoc,
  writeBatch as rawWriteBatch,
  serverTimestamp,
  type WriteBatch,
} from 'firebase/firestore';
import { queueAutoDelta, type SafeAutoDeltaPayload } from './autoDeltaQueue';
import { removeUndefinedDeep } from './firestoreSanitizer';
import { recordAuditLog } from './auditLogService';
import {
  mirrorLocalWrite,
  buildCleanLocalPayload,
  enrichPayloadWithStoreCompositeKeys,
} from './localMutationMirror';

function isCompleteRecordForAutoDelta(
  docPath: string | undefined,
  cleanCopy: Record<string, any>
): boolean {
  if (!docPath || !cleanCopy) return false;
  if (docPath.includes('taka_projects')) {
    return Boolean(
      cleanCopy.code &&
        cleanCopy.name &&
        cleanCopy.store &&
        cleanCopy.year !== undefined &&
        cleanCopy.status
    );
  }
  if (docPath.includes('taka_tasks')) {
    return Boolean(
      cleanCopy.name &&
        (cleanCopy.projectCode || cleanCopy.projectId) &&
        cleanCopy.start !== undefined &&
        cleanCopy.finish !== undefined
    );
  }
  if (docPath.includes('taka_costs')) {
    return Boolean(
      (cleanCopy.projectCode || cleanCopy.projectId) &&
        cleanCopy.actual !== undefined &&
        cleanCopy.costType !== undefined &&
        cleanCopy.firstPaid !== undefined
    );
  }
  if (docPath.includes('taka_delegation')) {
    return Boolean(cleanCopy.name && Array.isArray(cleanCopy.subTasks));
  }
  return false;
}

function extractAutoDeltaPayload(
  rawData: any,
  docId: string,
  isPatch: boolean,
  docPath?: string
): SafeAutoDeltaPayload | undefined {
  if (!rawData || typeof rawData !== 'object' || !docId) return undefined;
  const { cleanCopy, isCompletePlainObject } = buildCleanLocalPayload(rawData, docId);
  if (!isCompletePlainObject) return undefined;
  const enrichedCopy = enrichPayloadWithStoreCompositeKeys(docPath, docId, cleanCopy);
  const hasFullIdentity = isCompleteRecordForAutoDelta(docPath, cleanCopy);
  return {
    data: enrichedCopy,
    isPatch: isPatch && !hasFullIdentity,
  };
}

/**
 * Thin drop-in replacements for Firestore write functions that ALSO emit an auto delta
 * (see autoDeltaQueue.ts) for the 4 core collections. Behaviour is otherwise identical to firebase/firestore
 * (no validation, no audit log, no offline-queue side effects), so swapping the import is risk-free.
 *
 * RULE: any file that writes taka_projects / taka_tasks / taka_costs / taka_delegation_groups must import
 * setDoc/updateDoc/deleteDoc/writeBatch from here (or from lib/firebase.ts), never from 'firebase/firestore'.
 */

export const setDoc = ((ref: any, data: any, ...rest: any[]) => {
  const cleanData = removeUndefinedDeep(data);
  const isDel = Boolean(cleanData?.isDeleted);
  const isMerge = Boolean(rest[0]?.merge);
  const safePayload = !isDel ? extractAutoDeltaPayload(cleanData, ref?.id, isMerge, ref?.path) : undefined;

  mirrorLocalWrite(ref?.path, ref?.id, isDel ? 'delete' : 'set', cleanData, isMerge);

  // Inject serverTimestamp for consistency (Rule 15)
  if (cleanData && typeof cleanData === 'object' && !isDel) {
    (cleanData as any).updatedAt = serverTimestamp();
  }

  // Audit log for financial/core changes (Rule 4)
  if (ref?.path && (ref.path.includes('taka_projects') || ref.path.includes('taka_costs'))) {
    recordAuditLog({
      action: 'UPDATE',
      docPath: ref.path,
      docId: ref.id,
      data: cleanData,
    }).catch(() => {});
  }

  const p = (rawSetDoc as any)(ref, cleanData, ...rest);
  Promise.resolve(p)
    .then(() => {
      queueAutoDelta(ref?.path, ref?.id, isDel ? 'delete' : 'write', safePayload);
    })
    .catch(() => {});
  return p;
}) as typeof rawSetDoc;

export const updateDoc = ((ref: any, data: any, ...rest: any[]) => {
  const cleanData = removeUndefinedDeep(data);
  const isDel = Boolean(cleanData?.isDeleted);
  const safePayload = !isDel ? extractAutoDeltaPayload(cleanData, ref?.id, true, ref?.path) : undefined;

  mirrorLocalWrite(ref?.path, ref?.id, isDel ? 'delete' : 'update', cleanData, true);

  // Inject serverTimestamp for consistency (Rule 15)
  if (cleanData && typeof cleanData === 'object' && !isDel) {
    (cleanData as any).updatedAt = serverTimestamp();
  }

  // Audit log for financial/core changes (Rule 4)
  if (ref?.path && (ref.path.includes('taka_projects') || ref.path.includes('taka_costs'))) {
    recordAuditLog({
      action: 'UPDATE',
      docPath: ref.path,
      docId: ref.id,
      data: cleanData,
    }).catch(() => {});
  }

  const p = (rawUpdateDoc as any)(ref, cleanData, ...rest);
  Promise.resolve(p)
    .then(() => {
      queueAutoDelta(ref?.path, ref?.id, isDel ? 'delete' : 'write', safePayload);
    })
    .catch(() => {});
  return p;
}) as typeof rawUpdateDoc;

export const deleteDoc = ((ref: any) => {
  // Audit log for financial/core changes (Rule 4)
  if (ref?.path && (ref.path.includes('taka_projects') || ref.path.includes('taka_costs'))) {
    recordAuditLog({
      action: 'DELETE',
      docPath: ref.path,
      docId: ref.id,
      data: { isDeleted: true },
    }).catch(() => {});
  }

  mirrorLocalWrite(ref?.path, ref?.id, 'delete');
  const p = rawDeleteDoc(ref);
  Promise.resolve(p)
    .then(() => {
      queueAutoDelta(ref?.path, ref?.id, 'delete');
    })
    .catch(() => {});
  return p;
}) as typeof rawDeleteDoc;

export function writeBatch(dbInstance: any): WriteBatch {
  const batch: any = rawWriteBatch(dbInstance);
  const ops: Array<{
    ref: any;
    kind: 'set' | 'update' | 'delete';
    isDeleted?: boolean;
    rawData?: any;
    isMerge?: boolean;
    safePayload?: SafeAutoDeltaPayload;
  }> = [];
  const origSet = batch.set.bind(batch);
  const origUpdate = batch.update.bind(batch);
  const origDelete = batch.delete.bind(batch);
  const origCommit = batch.commit.bind(batch);

  batch.set = (ref: any, data: any, ...rest: any[]) => {
    const cleanData = removeUndefinedDeep(data);
    const isDel = Boolean(cleanData?.isDeleted);
    const isMerge = Boolean(rest[0]?.merge);
    const rawSnapshot = cleanData && typeof cleanData === 'object' ? { ...cleanData } : cleanData;
    const safePayload =
      !isDel && !batch.__suppressAutoDelta
        ? extractAutoDeltaPayload(rawSnapshot, ref?.id, isMerge, ref?.path)
        : undefined;
    if (cleanData && typeof cleanData === 'object' && !isDel) {
      (cleanData as any).updatedAt = serverTimestamp();
    }
    ops.push({ ref, kind: 'set', isDeleted: isDel, rawData: rawSnapshot, isMerge, safePayload });
    return origSet(ref, cleanData, ...rest);
  };
  batch.update = (ref: any, data: any, ...rest: any[]) => {
    const cleanData = removeUndefinedDeep(data);
    const isDel = Boolean(cleanData?.isDeleted);
    const rawSnapshot = cleanData && typeof cleanData === 'object' ? { ...cleanData } : cleanData;
    const safePayload =
      !isDel && !batch.__suppressAutoDelta
        ? extractAutoDeltaPayload(rawSnapshot, ref?.id, true, ref?.path)
        : undefined;
    if (cleanData && typeof cleanData === 'object' && !isDel) {
      (cleanData as any).updatedAt = serverTimestamp();
    }
    ops.push({ ref, kind: 'update', isDeleted: isDel, rawData: rawSnapshot, isMerge: true, safePayload });
    return origUpdate(ref, cleanData, ...rest);
  };
  batch.delete = (ref: any) => {
    ops.push({ ref, kind: 'delete', isDeleted: true });
    return origDelete(ref);
  };
  batch.commit = () => {
    if (!batch.__skipLocalMirror) {
      ops.forEach((o) => {
        mirrorLocalWrite(
          o.ref?.path,
          o.ref?.id,
          o.kind === 'delete' || o.isDeleted ? 'delete' : o.kind,
          o.rawData,
          o.isMerge
        );
      });
    }
    const p = origCommit();
    // Queue auto-delta after server commit resolves unless explicitly suppressed by mass batch engine
    if (!batch.__suppressAutoDelta) {
      Promise.resolve(p)
        .then(() => {
          ops.forEach((o) => {
            queueAutoDelta(
              o.ref?.path,
              o.ref?.id,
              o.kind === 'delete' || o.isDeleted ? 'delete' : 'write',
              o.safePayload
            );
          });
        })
        .catch(() => {});
    }
    return p;
  };
  return batch as WriteBatch;
}
