import {
  setDoc as rawSetDoc,
  updateDoc as rawUpdateDoc,
  deleteDoc as rawDeleteDoc,
  writeBatch as rawWriteBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { queueAutoDelta, resolveLogicalCollection } from './autoDeltaQueue';
import { removeUndefinedDeep } from './firestoreSanitizer';
import { deleteLocalRecord } from './localDb';

/**
 * Thin drop-in replacements for Firestore write functions that ALSO emit an auto delta
 * (see autoDeltaQueue.ts) for the 4 core collections. Behaviour is otherwise identical to firebase/firestore
 * (no validation, no audit log, no offline-queue side effects), so swapping the import is risk-free.
 *
 * RULE: any file that writes taka_projects / taka_tasks / taka_costs / taka_delegation_groups must import
 * setDoc/updateDoc/deleteDoc/writeBatch from here (or from lib/firebase.ts), never from 'firebase/firestore'.
 */

export const setDoc = ((ref: any, data: any, ...rest: any[]) => {
  queueAutoDelta(ref?.path, ref?.id, 'write');
  const cleanData = removeUndefinedDeep(data);
  if (cleanData?.isDeleted) {
    const logical = resolveLogicalCollection(ref?.path);
    if (logical && ref?.id) deleteLocalRecord(logical, ref.id).catch(() => {});
  }
  return (rawSetDoc as any)(ref, cleanData, ...rest);
}) as typeof rawSetDoc;

export const updateDoc = ((ref: any, data: any, ...rest: any[]) => {
  queueAutoDelta(ref?.path, ref?.id, 'write');
  const cleanData = removeUndefinedDeep(data);
  if (cleanData?.isDeleted) {
    const logical = resolveLogicalCollection(ref?.path);
    if (logical && ref?.id) deleteLocalRecord(logical, ref.id).catch(() => {});
  }
  return (rawUpdateDoc as any)(ref, cleanData, ...rest);
}) as typeof rawUpdateDoc;

export const deleteDoc = ((ref: any) => {
  queueAutoDelta(ref?.path, ref?.id, 'delete');
  const logical = resolveLogicalCollection(ref?.path);
  if (logical && ref?.id) deleteLocalRecord(logical, ref.id).catch(() => {});
  return rawDeleteDoc(ref);
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
    ops.push({ ref, kind: 'write', isDeleted: !!cleanData?.isDeleted });
    return origSet(ref, cleanData, ...rest);
  };
  batch.update = (ref: any, data: any, ...rest: any[]) => {
    const cleanData = removeUndefinedDeep(data);
    ops.push({ ref, kind: 'write', isDeleted: !!cleanData?.isDeleted });
    return origUpdate(ref, cleanData, ...rest);
  };
  batch.delete = (ref: any) => { ops.push({ ref, kind: 'delete' }); return origDelete(ref); };
  batch.commit = () => {
    // Queue after the ops are handed to the SDK so the delta write is ordered after the data writes
    ops.forEach((o) => {
      queueAutoDelta(o.ref?.path, o.ref?.id, o.kind);
      if (o.kind === 'delete' || o.isDeleted) {
        const logical = resolveLogicalCollection(o.ref?.path);
        if (logical && o.ref?.id) deleteLocalRecord(logical, o.ref.id).catch(() => {});
      }
    });
    return origCommit();
  };
  return batch as WriteBatch;
}
