import { TakaDelta, Project, Task, Cost, DelegationGroup } from '../types';
import { useAppStore } from '../store/useAppStore';
import { upsertLocalRecord, patchLocalRecord, deleteLocalRecord } from './localDb';
import { applyFieldPatch } from './deltaPatchService';

const CHANNEL_NAME = 'taka_multi_tab_sync_v1';
const TAB_ID = typeof window !== 'undefined'
  ? `tab_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`
  : 'server_tab';

export interface MultiTabSyncMessage {
  type: 'DELTA_APPLIED' | 'DIRECT_MUTATION';
  senderTabId: string;
  deltas?: TakaDelta[];
  timestamp: number;
}

let broadcastChannel: BroadcastChannel | null = null;
let isListenerInitialized = false;

export function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof globalThis === 'undefined' || !('BroadcastChannel' in globalThis)) {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new (globalThis as any).BroadcastChannel(CHANNEL_NAME);
    } catch (e) {
      console.warn('[broadcastSync] BroadcastChannel init failed:', e);
      return null;
    }
  }
  return broadcastChannel;
}

export function resetBroadcastChannelForTesting(): void {
  broadcastChannel = null;
  isListenerInitialized = false;
}

export function broadcastAppliedDeltas(deltas: TakaDelta[]): void {
  if (!deltas || deltas.length === 0) return;
  const channel = getBroadcastChannel();
  if (!channel) return;

  try {
    const message: MultiTabSyncMessage = {
      type: 'DELTA_APPLIED',
      senderTabId: TAB_ID,
      deltas,
      timestamp: Date.now(),
    };
    channel.postMessage(message);
  } catch (err) {
    console.warn('[broadcastSync] Failed to post delta message to channel:', err);
  }
}

type Coll = 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations';

export function initBroadcastSyncListener(): () => void {
  if (isListenerInitialized || typeof window === 'undefined') {
    return () => {};
  }
  const channel = getBroadcastChannel();
  if (!channel) {
    return () => {};
  }
  isListenerInitialized = true;

  const handleMessage = (event: MessageEvent<MultiTabSyncMessage>) => {
    const msg = event.data;
    if (!msg || msg.senderTabId === TAB_ID) return;
    if (msg.type !== 'DELTA_APPLIED' || !Array.isArray(msg.deltas) || msg.deltas.length === 0) return;

    const store = useAppStore.getState();
    const projectMap = new Map<string, Project>((store.projects || []).map((p) => [p.id as string, p]));
    const taskMap = new Map<string, Task>((store.tasks || []).map((t) => [t.id as string, t]));
    const costMap = new Map<string, Cost>((store.costs || []).map((c) => [c.id as string, c]));
    const delegMap = new Map<string, DelegationGroup>((store.delegationGroups || []).map((d) => [d.id as string, d]));

    const projectsUpdated = new Map<string, Project>();
    const tasksUpdated = new Map<string, Task>();
    const costsUpdated = new Map<string, Cost>();
    const delegUpdated = new Map<string, DelegationGroup>();

    const projectsDeleted = new Set<string>();
    const tasksDeleted = new Set<string>();
    const costsDeleted = new Set<string>();
    const delegDeleted = new Set<string>();

    const processItem = (
      docId: string,
      collectionName: Coll,
      action: 'create' | 'update' | 'delete',
      data: any,
      invalidate?: boolean
    ) => {
      if (!docId) return;
      // Tín hiệu "invalidate" không mang dữ liệu: để pipeline delta của chính tab này tự đọc
      if (invalidate) return;

      const deleted: Set<string> = 
        collectionName === 'taka_projects' ? projectsDeleted :
        collectionName === 'taka_tasks' ? tasksDeleted :
        collectionName === 'taka_costs' ? costsDeleted :
        delegDeleted;

      const updated: Map<string, any> = 
        collectionName === 'taka_projects' ? projectsUpdated :
        collectionName === 'taka_tasks' ? tasksUpdated :
        collectionName === 'taka_costs' ? costsUpdated :
        delegUpdated;

      const existingMap: Map<string, any> = 
        collectionName === 'taka_projects' ? projectMap :
        collectionName === 'taka_tasks' ? taskMap :
        collectionName === 'taka_costs' ? costMap :
        delegMap;

      if (action === 'delete') {
        deleted.add(docId);
        updated.delete(docId);
        deleteLocalRecord(collectionName, docId).catch(() => {});
        return;
      }

      const existing = updated.get(docId) || existingMap.get(docId);
      if (action === 'create' && data && Object.keys(data).length > 0) {
        // Bản đầy đủ: hợp nhất lên bản đang có (nếu có) và upsert Dexie
        const merged = existing ? applyFieldPatch(existing, data) : { id: docId, ...data };
        updated.set(docId, merged);
        upsertLocalRecord(collectionName, merged).catch(() => {});
        return;
      }

      // action 'update' (bản vá): chỉ vá bản ghi ĐÃ CÓ. Không tạo bản ghi thiếu field.
      patchLocalRecord(collectionName, docId, data || {}).catch(() => {});
      if (existing && data && Object.keys(data).length > 0) {
        updated.set(docId, applyFieldPatch(existing, data));
      }
    };

    msg.deltas.forEach((delta) => {
      if (delta.action === 'batch_update' && Array.isArray(delta.batchItems)) {
        delta.batchItems.forEach((item) => {
          processItem(item.docId, item.collectionName as Coll, item.action, item.data, item.invalidate);
        });
      } else if (delta.docId && delta.collectionName) {
        processItem(delta.docId, delta.collectionName as Coll, delta.action as any, delta.data);
      }
    });

    if (projectsUpdated.size > 0) store.optimisticUpdateProjects(Array.from(projectsUpdated.values()) as (Project & { id: string })[]);
    if (projectsDeleted.size > 0) store.optimisticDeleteProjects(Array.from(projectsDeleted));
    if (tasksUpdated.size > 0) store.optimisticUpdateTasks(Array.from(tasksUpdated.values()) as (Task & { id: string })[]);
    if (tasksDeleted.size > 0) store.optimisticDeleteTasks(Array.from(tasksDeleted));
    if (costsUpdated.size > 0) store.optimisticUpdateCosts(Array.from(costsUpdated.values()));
    if (costsDeleted.size > 0) store.optimisticDeleteCosts(Array.from(costsDeleted));

    if (delegUpdated.size > 0 || delegDeleted.size > 0) {
      const current = store.delegationGroups || [];
      const next = current
        .filter((d) => !delegDeleted.has(d.id as string))
        .map((d) => (delegUpdated.has(d.id as string) ? delegUpdated.get(d.id as string)! : d));
      
      delegUpdated.forEach((d, id) => {
        if (!next.some((n) => n.id === id)) next.push(d);
      });
      store.setDelegationGroups(next);
    }
  };

  channel.addEventListener('message', handleMessage);

  return () => {
    channel.removeEventListener('message', handleMessage);
  };
}
