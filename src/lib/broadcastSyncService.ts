import { TakaDelta, Project, Task, Cost, DelegationGroup } from '../types';
import { useAppStore } from '../store/useAppStore';
import { upsertLocalRecord, deleteLocalRecord } from './localDb';

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

/**
 * Khởi tạo kết nối BroadcastChannel giữa các tab trình duyệt
 */
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

/**
 * Phát tín hiệu delta đã nạp sang các tab khác trong cùng trình duyệt (0 Firestore READ)
 */
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

/**
 * Lắng nghe và áp dụng các thay đổi từ tab khác vào Zustand + Dexie
 */
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
    if (!msg || msg.senderTabId === TAB_ID) {
      return; // Bỏ qua thông điệp từ chính tab này
    }

    if (msg.type === 'DELTA_APPLIED' && Array.isArray(msg.deltas) && msg.deltas.length > 0) {
      const store = useAppStore.getState();
      const deltas = msg.deltas;

      const projectsToUpdate: (Partial<Project> & { id: string })[] = [];
      const projectsToDelete: string[] = [];
      const tasksToUpdate: (Partial<Task> & { id: string })[] = [];
      const tasksToDelete: string[] = [];
      const costsToUpdate: (Partial<Cost> & { id: string })[] = [];
      const costsToDelete: string[] = [];
      const delegationsToUpdate: DelegationGroup[] = [];
      const delegationsToDelete: string[] = [];

      const processItem = (
        docId: string,
        collectionName: string,
        action: 'create' | 'update' | 'delete',
        data: any
      ) => {
        if (!docId) return;

        switch (collectionName) {
          case 'taka_projects':
            if (action === 'delete') {
              projectsToDelete.push(docId);
              deleteLocalRecord('taka_projects', docId).catch(() => {});
            } else if (data) {
              const proj = { id: docId, ...data } as (Project & { id: string });
              projectsToUpdate.push(proj);
              upsertLocalRecord('taka_projects', proj).catch(() => {});
            }
            break;

          case 'taka_tasks':
            if (action === 'delete') {
              tasksToDelete.push(docId);
              deleteLocalRecord('taka_tasks', docId).catch(() => {});
            } else if (data) {
              const task = { id: docId, ...data } as (Task & { id: string });
              tasksToUpdate.push(task);
              upsertLocalRecord('taka_tasks', task).catch(() => {});
            }
            break;

          case 'taka_costs':
            if (action === 'delete') {
              costsToDelete.push(docId);
              deleteLocalRecord('taka_costs', docId).catch(() => {});
            } else if (data) {
              const cost = { id: docId, ...data } as (Cost & { id: string });
              costsToUpdate.push(cost);
              upsertLocalRecord('taka_costs', cost).catch(() => {});
            }
            break;

          case 'taka_delegations':
            if (action === 'delete') {
              delegationsToDelete.push(docId);
              deleteLocalRecord('taka_delegations', docId).catch(() => {});
            } else if (data) {
              const group = { id: docId, ...data } as DelegationGroup;
              delegationsToUpdate.push(group);
              upsertLocalRecord('taka_delegations', group).catch(() => {});
            }
            break;
        }
      };

      deltas.forEach((delta) => {
        if (delta.action === 'batch_update' && Array.isArray(delta.batchItems)) {
          delta.batchItems.forEach((item) => {
            processItem(item.docId, item.collectionName, item.action, item.data);
          });
        } else if (delta.docId && delta.collectionName) {
          processItem(delta.docId, delta.collectionName, delta.action as any, delta.data);
        }
      });

      // Áp dụng nguyên tử vào Zustand store của tab này (0ms delay)
      if (projectsToUpdate.length > 0) store.optimisticUpdateProjects(projectsToUpdate);
      if (projectsToDelete.length > 0) store.optimisticDeleteProjects(projectsToDelete);

      if (tasksToUpdate.length > 0) store.optimisticUpdateTasks(tasksToUpdate);
      if (tasksToDelete.length > 0) store.optimisticDeleteTasks(tasksToDelete);

      if (costsToUpdate.length > 0) store.optimisticUpdateCosts(costsToUpdate);
      if (costsToDelete.length > 0) store.optimisticDeleteCosts(costsToDelete);

      if (delegationsToUpdate.length > 0 || delegationsToDelete.length > 0) {
        const currentDelegations = store.delegationGroups || [];
        const toDeleteSet = new Set(delegationsToDelete);
        const toUpdateMap = new Map(delegationsToUpdate.map((d) => [d.id, d]));

        const updated = currentDelegations
          .filter((d) => !toDeleteSet.has(d.id))
          .map((d) => (toUpdateMap.has(d.id) ? { ...d, ...toUpdateMap.get(d.id)! } : d));

        delegationsToUpdate.forEach((d) => {
          if (!updated.some((u) => u.id === d.id)) {
            updated.push(d);
          }
        });
        store.setDelegationGroups(updated);
      }
    }
  };

  channel.addEventListener('message', handleMessage);

  return () => {
    try {
      channel.removeEventListener('message', handleMessage);
    } catch {}
  };
}
