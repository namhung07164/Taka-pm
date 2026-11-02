import { doc } from 'firebase/firestore';
import { setDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { useAppStore } from '../../store/useAppStore';
import { safeGetItemLocal, safeSetItemLocal } from '../../lib/storage';
import { UnifiedWorkItem } from './myWorkTypes';

export function sanitizeWorkKeyPart(val?: string | number | null): string {
  if (val === undefined || val === null) return '';
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/[./$[\]#\s|]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface WorkKeyInput {
  type?: 'task' | 'delegation_subtask' | 'project_milestone';
  taskId?: string;
  summaryId?: string;
  projectId?: string;
  projectCode?: string;
  projectStore?: string;
  projectYear?: string | number;
  title?: string;
  delegationGroupId?: string;
  subTaskId?: string;
  milestoneKind?: string;
}

/**
 * Generates deterministic, Firestore-safe canonical keys for a work item.
 * Includes a composite scope+title key so Summary Mode (0 Read) on Laptop
 * and Full Task Mode on iOS always resolve to the exact same key.
 */
export function buildWorkItemSyncKeys(input: WorkKeyInput): string[] {
  const keys: string[] = [];
  const pId = sanitizeWorkKeyPart(input.projectId);
  const pCode = sanitizeWorkKeyPart(input.projectCode);
  const pStore = sanitizeWorkKeyPart(input.projectStore || 'HCM');
  const pYear = sanitizeWorkKeyPart(input.projectYear);
  const title = sanitizeWorkKeyPart(input.title);

  if (input.type === 'delegation_subtask') {
    const gId = sanitizeWorkKeyPart(input.delegationGroupId);
    const stId = sanitizeWorkKeyPart(input.subTaskId);
    if (gId && stId) keys.push(`del_${gId}_${stId}`);
    if (pCode && title) keys.push(`delscope_${pCode}_${pStore}_${pYear}_${title}`);
    return Array.from(new Set(keys));
  }

  if (input.type === 'project_milestone') {
    const kind = sanitizeWorkKeyPart(input.milestoneKind || title);
    if (pId && kind) keys.push(`ms_${pId}_${kind}`);
    if (pCode && kind) keys.push(`ms_${pCode}_${pStore}_${pYear}_${kind}`);
    return Array.from(new Set(keys));
  }

  // Standard or Summary Task
  const rawTaskId = String(input.taskId || '').trim();
  if (rawTaskId && !rawTaskId.startsWith('ts_')) {
    keys.push(`tid_${sanitizeWorkKeyPart(rawTaskId)}`);
  }
  const rawSumId = String(input.summaryId || '').trim();
  if (rawSumId && !rawSumId.startsWith('ts_')) {
    keys.push(`tid_${sanitizeWorkKeyPart(rawSumId)}`);
  }
  if (pId && title) {
    keys.push(`pid_${pId}_${title}`);
  }
  if (pCode && title) {
    keys.push(`scope_${pCode}_${pStore}_${pYear}_${title}`);
  }
  return Array.from(new Set(keys));
}

export function buildKeysFromUnifiedItem(item: UnifiedWorkItem): string[] {
  return buildWorkItemSyncKeys({
    type: item.type,
    taskId: item.rawTask?.id,
    summaryId: item.rawSummaryId,
    projectId: item.projectId || item.rawProject?.id,
    projectCode: item.projectCode || item.rawProject?.code,
    projectStore: item.projectStore || item.rawProject?.store,
    projectYear: item.projectYear || item.rawProject?.year,
    title: item.title,
    delegationGroupId: item.rawDelegationGroup?.id,
    subTaskId: item.rawSubTask?.id,
    milestoneKind: item.milestoneKind,
  });
}

export function encodeMyWorkState(status: string, ts: number = Date.now()): string {
  return `${status}|${ts}`;
}

export function decodeMyWorkState(raw?: string | null): { status: string; ts: number } | null {
  if (!raw || typeof raw !== 'string') return null;
  const idx = raw.lastIndexOf('|');
  if (idx === -1) return { status: raw.trim(), ts: 0 };
  const status = raw.slice(0, idx).trim();
  const ts = Number(raw.slice(idx + 1)) || 0;
  return status ? { status, ts } : null;
}

/**
 * Merges two myWorkStates maps using Last-Write-Wins per key timestamp.
 */
export function mergeMyWorkStates(
  a?: Record<string, string> | null,
  b?: Record<string, string> | null
): Record<string, string> {
  const merged: Record<string, string> = {};
  if (a && typeof a === 'object') {
    for (const [k, v] of Object.entries(a)) {
      if (typeof v === 'string' && v) merged[k] = v;
    }
  }
  if (b && typeof b === 'object') {
    for (const [k, v] of Object.entries(b)) {
      if (typeof v !== 'string' || !v) continue;
      const existing = decodeMyWorkState(merged[k]);
      const incoming = decodeMyWorkState(v);
      if (!existing || (incoming && incoming.ts >= existing.ts)) {
        merged[k] = v;
      }
    }
  }
  return merged;
}

export function loadLocalMyWorkStates(userId?: string): Record<string, string> {
  if (!userId) return {};
  try {
    const raw = safeGetItemLocal(`taka_mywork_states_${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return {};
}

/**
 * Resolves the newest per-account status override across all candidate keys for an item.
 */
export function resolveAccountOverrideStatus(
  myWorkStates: Record<string, string> | undefined,
  keys: string[]
): string | null {
  if (!myWorkStates || keys.length === 0) return null;
  let bestStatus: string | null = null;
  let bestTs = -1;

  for (let i = 0; i < keys.length; i++) {
    const raw = myWorkStates[keys[i]];
    const decoded = decodeMyWorkState(raw);
    if (decoded && decoded.ts >= bestTs) {
      bestTs = decoded.ts;
      bestStatus = decoded.status;
    }
  }
  return bestStatus;
}

const pendingUserPatches = new Map<string, Record<string, string>>();
let flushUserStateTimer: ReturnType<typeof setTimeout> | null = null;

async function flushPendingAccountMyWorkStates(): Promise<void> {
  const entries = Array.from(pendingUserPatches.entries());
  pendingUserPatches.clear();
  if (entries.length === 0) return;

  const nowIso = new Date().toISOString();
  const { syncQueueManager, isPermanentWriteError } = await import('../../lib/syncQueue');
  const { recordDelta } = await import('../../lib/deltaWriteService');

  for (const [userId, patchMap] of entries) {
    if (!userId || userId === 'guest') continue;
    const payload = {
      myWorkStates: patchMap,
      myWorkUpdatedAt: nowIso,
    };
    try {
      await setDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId),
        payload,
        { merge: true }
      );
      await recordDelta({
        docId: `sys_mywork_${userId}`,
        collectionName: 'taka_projects',
        action: 'update',
        data: {
          type: 'USER_MYWORK_SYNC',
          userId,
          myWorkStates: patchMap,
          updatedAt: nowIso,
        },
        updatedBy: userId,
      }).catch(() => {});
    } catch (err) {
      console.warn('[myWorkAccountSync] Write failed, queueing to SyncQueue:', err);
      if (!isPermanentWriteError(err)) {
        await syncQueueManager.addToQueue('taka_users', userId, 'set', payload);
      }
    }
  }
}

/**
 * Persists a user's checked/kanban status to Zustand (0ms), localStorage, and debounced (400ms)
 * Firestore `taka_users/{userId}` + `taka_deltas` so iOS and Laptop stay 100% synchronized in real time.
 */
export async function persistAccountMyWorkState(
  keys: string[],
  nextStatus: string
): Promise<void> {
  if (!keys.length) return;
  const state = useAppStore.getState();
  const currentUser = state.currentUser;
  if (!currentUser || !currentUser.id) return;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const encoded = encodeMyWorkState(nextStatus, nowMs);

  const patchMap: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    patchMap[keys[i]] = encoded;
  }

  const localStates = loadLocalMyWorkStates(currentUser.id);
  const mergedStates = mergeMyWorkStates(
    mergeMyWorkStates(localStates, currentUser.myWorkStates),
    patchMap
  );

  // 0ms Optimistic Update on currentUser + appUsers + localStorage
  const updatedUser = {
    ...currentUser,
    myWorkStates: mergedStates,
    myWorkUpdatedAt: nowIso,
  };
  state.setCurrentUser(updatedUser);
  if (Array.isArray(state.appUsers) && state.appUsers.length > 0) {
    state.setAppUsers(state.appUsers.map((u) => (u.id === currentUser.id ? updatedUser : u)));
  }
  safeSetItemLocal(`taka_mywork_states_${currentUser.id}`, JSON.stringify(mergedStates));
  safeSetItemLocal('taka_auth_v1', JSON.stringify(updatedUser));

  if (currentUser.id !== 'guest') {
    const existingPending = pendingUserPatches.get(currentUser.id) || {};
    pendingUserPatches.set(currentUser.id, mergeMyWorkStates(existingPending, patchMap));
    if (flushUserStateTimer) clearTimeout(flushUserStateTimer);
    flushUserStateTimer = setTimeout(() => {
      flushUserStateTimer = null;
      void flushPendingAccountMyWorkStates();
    }, 400);
  }
}

/**
 * Applies a remote `USER_MYWORK_SYNC` delta payload received over `taka_deltas` in 0ms
 * with 0 extra Firestore reads or listeners.
 */
export function applyIncomingMyWorkSyncDelta(data: any): void {
  if (!data || data.type !== 'USER_MYWORK_SYNC' || !data.userId || !data.myWorkStates) return;
  const state = useAppStore.getState();
  const cur = state.currentUser;
  if (!cur || cur.id !== data.userId) return;

  const localStates = loadLocalMyWorkStates(cur.id);
  const merged = mergeMyWorkStates(
    mergeMyWorkStates(localStates, cur.myWorkStates),
    data.myWorkStates
  );
  if (JSON.stringify(cur.myWorkStates || {}) === JSON.stringify(merged)) return;

  const updated = {
    ...cur,
    myWorkStates: merged,
    myWorkUpdatedAt: data.updatedAt || new Date().toISOString(),
  };
  state.setCurrentUser(updated);
  if (Array.isArray(state.appUsers) && state.appUsers.length > 0) {
    state.setAppUsers(state.appUsers.map((u) => (u.id === cur.id ? updated : u)));
  }
  safeSetItemLocal(`taka_mywork_states_${cur.id}`, JSON.stringify(merged));
  safeSetItemLocal('taka_auth_v1', JSON.stringify(updated));
}

