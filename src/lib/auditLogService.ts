import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { AuditLog } from '../types';

/**
 * Ghi log kiểm toán (Append-only) cho các biến động quan trọng (Rule 4)
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

  const auditPayload: any = {
    timestamp: Date.now(),
    serverTime: serverTimestamp(),
    userId: user.id,
    userEmail: user.email || user.username || 'unknown',
    action: log.action,
    entityType: log.entityType || resolveEntityType(log.docPath),
    docPath: log.docPath,
    docId: log.docId,
    data: log.data,
    previousData: log.previousData || null,
  };

  try {
    const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'audit_logs');
    await addDoc(colRef, auditPayload);
  } catch (err) {
    console.warn('[auditLog] Failed to record audit log:', err);
  }
}

function resolveEntityType(docPath: string): string {
  if (docPath.includes('taka_projects')) return 'project';
  if (docPath.includes('taka_tasks')) return 'task';
  if (docPath.includes('taka_costs')) return 'cost';
  if (docPath.includes('taka_delegation')) return 'delegation';
  if (docPath.includes('taka_users')) return 'user';
  return 'unknown';
}
