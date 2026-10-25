import { TakaDelta } from '../types';
import { filterUnappliedDeltas } from './deltaSyncService';
import { applyIncomingDeltas } from './deltaApplyService';

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

    // Normalize sessionId so applyIncomingDeltas does not skip deltas originating from another tab in the same browser
    const normalized = msg.deltas.map((d) => ({
      ...d,
      sessionId: d.sessionId ? `tab_relay_${d.sessionId}` : '__tab_relay__',
      updatedBy: d.updatedBy ? `tab_relay:${d.updatedBy}` : 'tab_relay',
    }));

    const fresh = filterUnappliedDeltas(normalized);
    if (fresh.length === 0) return;

    applyIncomingDeltas(fresh);
  };

  channel.addEventListener('message', handleMessage);

  return () => {
    channel.removeEventListener('message', handleMessage);
    isListenerInitialized = false;
  };
}

