import {
  setDoc as rawSetDoc,
  updateDoc as rawUpdateDoc,
  deleteDoc as rawDeleteDoc,
  writeBatch as rawWriteBatch,
  serverTimestamp,
  type WriteBatch,
} from 'firebase/firestore';
import { queueAutoDelta, resolveLogicalCollection } from './autoDeltaQueue';
import { removeUndefinedDeep } from './firestoreSanitizer';
import { deleteLocalRecord } from './localDb';
import { recordAuditLog } from './auditLogService';

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
      data: cleanData
    }).catch(() => {});
  }

  if (isDel) {
    const logical = resolveLogicalCollection(ref?.path);
    if (logical && ref?.id) deleteLocalRecord(logical, ref.id).catch(() => {});
  }
  const p = (rawSetDoc as any)(ref, cleanData, ...rest);
  Promise.resolve(p).then(() => {
    queueAutoDelta(ref?.path, ref?.id, isDel ? 'delete' : 'write');
  }).catch(() => {});
  return p;
}) as typeof rawSetDoc;

export const updateDoc = ((ref: any, data: any, ...rest: any[]) => {
  const cleanData = removeUndefinedDeep(data);
  const isDel = Boolean(cleanData?.isDeleted);
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
      data: cleanData
    }).catch(() => {});
  }

  if (isDel) {
    const logical = resolveLogicalCollection(ref?.path);
    if (logical && ref?.id) deleteLocalRecord(logical, ref.id).catch(() => {});
  }
  const p = (rawUpdateDoc as any)(ref, cleanData, ...rest);
  Promise.resolve(p).then(() => {
    queueAutoDelta(ref?.path, ref?.id, isDel ? 'delete' : 'write');
  }).catch(() => {});
  return p;
}) as typeof rawUpdateDoc;

export const deleteDoc = ((ref: any) => {
  const logical = resolveLogicalCollection(ref?.path);

  // Audit log for financial/core changes (Rule 4)
  if (ref?.path && (ref.path.includes('taka_projects') || ref.path.includes('taka_costs'))) {
    recordAuditLog({
      action: 'DELETE',
      docPath: ref.path,
      docId: ref.id,
      data: { isDeleted: true }
    }).catch(() => {});
  }

  if (logical && ref?.id) deleteLocalRecord(logical, ref.id).catch(() => {});
  const p = rawDeleteDoc(ref);
  Promise.resolve(p).then(() => {
    queueAutoDelta(ref?.path, ref?.id, 'delete');
  }).catch(() => {});
  return p;
}) as typeof rawDeleteDoc;

export function writeBatch(dbInstance: any): WriteBatch {
  const batch: any = rawWriteBatch(dbInstance);
  const ops: Array<{ ref: any; kind: 'write' | 'delete'; isDeleted?: boolean }> = [];
  const origSet = batch.set.bind(batch);
  const origUpdate = batch.update.bind(batch);
  const origDelete = batch.delete.bind(batch);
  const origCommit = batch.commit.bind(batch);

  batch.set = (ref: any, data: any, ...rest: any[]) => {
    const cleanData = removeUndefinedDeep(data);
    if (cleanData && typeof cleanData === 'object' && !cleanData.isDeleted) {
      (cleanData as any).updatedAt = serverTimestamp();
    }
    ops.push({ ref, kind: 'write', isDeleted: !!cleanData?.isDeleted });
    return origSet(ref, cleanData, ...rest);
  };
  batch.update = (ref: any, data: any, ...rest: any[]) => {
    const cleanData = removeUndefinedDeep(data);
    if (cleanData && typeof cleanData === 'object' && !cleanData.isDeleted) {
      (cleanData as any).updatedAt = serverTimestamp();
    }
    ops.push({ ref, kind: 'write', isDeleted: !!cleanData?.isDeleted });
    return origUpdate(ref, cleanData, ...rest);
  };
  batch.delete = (ref: any) => { ops.push({ ref, kind: 'delete' }); return origDelete(ref); };
  batch.commit = () => {
    ops.forEach((o) => {
      if (o.kind === 'delete' || o.isDeleted) {
        const logical = resolveLogicalCollection(o.ref?.path);
        if (logical && o.ref?.id) deleteLocalRecord(logical, o.ref.id).catch(() => {});
      }
    });
    const p = origCommit();
    // Queue auto-delta after server commit resolves so explicit recordBatchDeltas right after await batch.commit() cancels it
    Promise.resolve(p).then(() => {
      ops.forEach((o) => {
        queueAutoDelta(o.ref?.path, o.ref?.id, (o.kind === 'delete' || o.isDeleted) ? 'delete' : 'write');
      });
    }).catch(() => {});
    return p;
  };
  return batch as WriteBatch;
}
