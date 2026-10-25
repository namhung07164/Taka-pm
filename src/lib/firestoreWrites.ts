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
import { mirrorLocalWrite, buildCleanLocalPayload } from './localMutationMirror';

function extractAutoDeltaPayload(
  rawData: any,
  docId: string,
  isPatch: boolean
): SafeAutoDeltaPayload | undefined {
  if (!rawData || typeof rawData !== 'object' || !docId) return undefined;
  const { cleanCopy, isCompletePlainObject } = buildCleanLocalPayload(rawData, docId);
  if (!isCompletePlainObject) return undefined;
  const hasFullIdentity = Boolean(
    cleanCopy.name || cleanCopy.code || cleanCopy.projectCode || cleanCopy.subTasks
  );
  return {
    data: cleanCopy,
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
  const safePayload = !isDel ? extractAutoDeltaPayload(cleanData, ref?.id, isMerge) : undefined;

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
  const safePayload = !isDel ? extractAutoDeltaPayload(cleanData, ref?.id, true) : undefined;

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
    const safePayload = !isDel ? extractAutoDeltaPayload(rawSnapshot, ref?.id, isMerge) : undefined;
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
    const safePayload = !isDel ? extractAutoDeltaPayload(rawSnapshot, ref?.id, true) : undefined;
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
    ops.forEach((o) => {
      mirrorLocalWrite(
        o.ref?.path,
        o.ref?.id,
        o.kind === 'delete' || o.isDeleted ? 'delete' : o.kind,
        o.rawData,
        o.isMerge
      );
    });
    const p = origCommit();
    // Queue auto-delta after server commit resolves so explicit recordBatchDeltas right after await batch.commit() cancels it
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
    return p;
  };
  return batch as WriteBatch;
}
