import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { writeBatch } from './firestoreWrites';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { DelegationGroup } from '../types';
import { deleteLocalRecord } from './localDb';

/**
 * Kiểm tra xem một DelegationGroup có phải là placeholder rỗng tự động tạo khi import hay không:
 * - Có tối đa 1 subtask
 * - Subtask không có tên cụ thể, không có comment, không có báo cáo, không có đính kèm file
 * - Trạng thái là Assigned mặc định hoặc rỗng
 * - Không có phê duyệt
 */
export function isEmptyDelegationGroup(group: DelegationGroup): boolean {
  if (!group || !group.subTasks || group.subTasks.length === 0) return true;
  if (group.subTasks.length > 1) return false; // Có từ 2 subtask trở lên -> Genuine

  const sub = group.subTasks[0];
  const hasName = Boolean(sub.name && sub.name.trim().length > 0);
  const hasComments = Boolean(sub.comments && sub.comments.trim().length > 0);
  const hasReport = Boolean(sub.report && sub.report.trim().length > 0);
  const hasChildReport = Boolean(sub.childReport && sub.childReport.trim().length > 0);
  const hasFile = Boolean(sub.fileUrl || sub.childFileUrl);
  const hasAttachments = Boolean(sub.attachments && sub.attachments.length > 0);
  const hasNonDefaultStatus = Boolean(
    sub.status && sub.status !== 'Assigned' && sub.status !== 'Pending' && sub.status !== ''
  );
  const hasApproval = Boolean(
    sub.approvalStatus && sub.approvalStatus !== 'Pending' && sub.approvalStatus !== ''
  );

  // Nếu có bất kỳ nội dung thực tế nào -> Tuyệt đối KHÔNG xóa
  if (hasName || hasComments || hasReport || hasChildReport || hasFile || hasAttachments || hasNonDefaultStatus || hasApproval) {
    return false;
  }

  return true;
}

/**
 * Quét toàn bộ Delegation Groups trên Firestore hoặc in-memory để thống kê số lượng rỗng
 */
export async function scanEmptyDelegations(yearFilter?: string | number): Promise<{
  totalScanned: number;
  emptyCount: number;
  genuineCount: number;
  emptyGroups: DelegationGroup[];
}> {
  try {
    const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups');
    let q = query(colRef);

    if (yearFilter && String(yearFilter).toLowerCase() !== 'all') {
      const yearStr = String(yearFilter);
      const yearNum = Number(yearFilter);
      q = query(colRef, where('projectYear', 'in', [yearStr, yearNum]));
    }

    const snap = await getDocs(q);
    const emptyGroups: DelegationGroup[] = [];
    let genuineCount = 0;

    snap.docs.forEach((d) => {
      const data = { id: d.id, ...d.data() } as DelegationGroup;
      if (isEmptyDelegationGroup(data)) {
        emptyGroups.push(data);
      } else {
        genuineCount++;
      }
    });

    return {
      totalScanned: snap.docs.length,
      emptyCount: emptyGroups.length,
      genuineCount,
      emptyGroups,
    };
  } catch (err) {
    console.error('[delegationMaintenance] scanEmptyDelegations error:', err);
    throw err;
  }
}

/**
 * Dọn dẹp an toàn các empty delegation groups theo từng lô 400 documents
 */
export async function pruneEmptyDelegations(
  emptyGroupIds: string[],
  onProgress?: (processed: number, total: number) => void
): Promise<{ deletedCount: number }> {
  if (!emptyGroupIds || emptyGroupIds.length === 0) {
    return { deletedCount: 0 };
  }

  const BATCH_SIZE = 400;
  let deletedCount = 0;

  for (let i = 0; i < emptyGroupIds.length; i += BATCH_SIZE) {
    const chunk = emptyGroupIds.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    chunk.forEach((id) => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', id);
      batch.delete(docRef);
    });

    await batch.commit();

    // Đồng thời xóa khỏi Dexie Local Database
    for (const id of chunk) {
      await deleteLocalRecord('taka_delegations', id);
    }

    deletedCount += chunk.length;
    onProgress?.(deletedCount, emptyGroupIds.length);
  }

  // Cập nhật lại Zustand Store
  const store = useAppStore.getState();
  const currentGroups = store.delegationGroups || [];
  const idSet = new Set(emptyGroupIds);
  const remaining = currentGroups.filter((g) => !idSet.has(g.id));
  store.setDelegationGroups(remaining);

  return { deletedCount };
}
