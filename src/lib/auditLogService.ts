import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';

const SCHEDULE_ONLY_PROJECT_KEYS = new Set([
  'updatedAt',
  'computedTakStart',
  'computedTakCompl',
  'computedOpening',
  'computedPlanProgress',
  'computedActProgress',
  'taskCount',
  'taskSummaries',
]);

function isScheduleOnlyProjectSync(docPath: string, data: any): boolean {
  if (!docPath.includes('taka_projects') || !data || typeof data !== 'object') return false;
  const keys = Object.keys(data);
  if (keys.length === 0) return true;
  return keys.every((k) => SCHEDULE_ONLY_PROJECT_KEYS.has(k));
}

function compactAuditData(data: any): any {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const copy: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'taskSummaries' && Array.isArray(v)) {
      copy.taskSummariesCount = v.length;
      continue;
    }
    copy[k] = v;
  }
  return copy;
}

const pendingUpdateAudits = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; payload: Record<string, any> }
>();
const AUDIT_COALESCE_MS = 1500;

async function commitAuditPayload(auditPayload: Record<string, any>): Promise<void> {
  try {
    const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'audit_logs');
    await addDoc(colRef, auditPayload);
  } catch (err) {
    console.warn('[auditLog] Failed to record audit log:', err);
  }
}

/**
 * Ghi log kiểm toán (Append-only) cho các biến động quan trọng / tài chính (Rule 4).
 * Loại bỏ các bản cập nhật chỉ đồng bộ tiến độ/taskSummaries tự động để chống phình to Firestore,
 * và gom (coalesce) các lệnh UPDATE liên tiếp trên cùng 1 docId trong cửa sổ 1.5s thành 1 lần ghi duy nhất.
 */
export async function recordAuditLog(log: {
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType?: string;
  docPath: string;
  docId: string;
  data: any;
  previousData?: any;
}): Promise<void> {
  const user = useAppStore.getState().currentUser;
  if (!user) return;
  if (log.action === 'UPDATE' && isScheduleOnlyProjectSync(log.docPath, log.data)) {
    return;
  }

  const now = Date.now();
  const entityType = log.entityType || resolveEntityType(log.docPath);
  const compactData = compactAuditData(log.data);
  const compactPrev = log.previousData ? compactAuditData(log.previousData) : null;

  const auditPayload: Record<string, any> = {
    timestamp: now,
    serverTime: serverTimestamp(),
    expireAt: Timestamp.fromMillis(now + 90 * 24 * 60 * 60 * 1000),
    userId: user.id,
    userEmail: user.email || user.username || 'unknown',
    action: log.action,
    entityType,
    docPath: log.docPath,
    docId: log.docId,
    data: compactData,
    previousData: compactPrev,
  };

  if (log.action === 'UPDATE' && log.docId) {
    const coalesceKey = `${entityType}:${log.docId}`;
    const existing = pendingUpdateAudits.get(coalesceKey);
    if (existing) {
      clearTimeout(existing.timer);
      const mergedData =
        existing.payload.data &&
        typeof existing.payload.data === 'object' &&
        compactData &&
        typeof compactData === 'object'
          ? { ...existing.payload.data, ...compactData }
          : compactData;
      const mergedPayload = {
        ...existing.payload,
        ...auditPayload,
        data: mergedData,
        previousData: existing.payload.previousData ?? compactPrev,
      };
      const timer = setTimeout(() => {
        pendingUpdateAudits.delete(coalesceKey);
        commitAuditPayload(mergedPayload);
      }, AUDIT_COALESCE_MS);
      pendingUpdateAudits.set(coalesceKey, { timer, payload: mergedPayload });
      return;
    }

    const timer = setTimeout(() => {
      pendingUpdateAudits.delete(coalesceKey);
      commitAuditPayload(auditPayload);
    }, AUDIT_COALESCE_MS);
    pendingUpdateAudits.set(coalesceKey, { timer, payload: auditPayload });
    return;
  }

  await commitAuditPayload(auditPayload);
}

function resolveEntityType(docPath: string): string {
  if (docPath.includes('taka_projects')) return 'project';
  if (docPath.includes('taka_tasks')) return 'task';
  if (docPath.includes('taka_costs')) return 'cost';
  if (docPath.includes('taka_delegation')) return 'delegation';
  if (docPath.includes('taka_users')) return 'user';
  return 'unknown';
}
