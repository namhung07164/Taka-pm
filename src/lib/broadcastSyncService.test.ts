import { describe, it, expect, vi, beforeEach } from 'vitest';
import { broadcastAppliedDeltas, resetBroadcastChannelForTesting } from './broadcastSyncService';
import { TakaDelta } from '../types';

describe('broadcastSyncService', () => {
  beforeEach(() => {
    resetBroadcastChannelForTesting();
  });

  it('does not throw when broadcasting empty or null deltas', () => {
    expect(() => broadcastAppliedDeltas([])).not.toThrow();
    expect(() => broadcastAppliedDeltas(null as any)).not.toThrow();
  });

  it('formats and sends delta messages through BroadcastChannel', () => {
    const mockPostMessage = vi.fn();
    class MockBroadcastChannel {
      postMessage = mockPostMessage;
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      close = vi.fn();
    }

    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    const testDeltas: TakaDelta[] = [
      {
        id: 'd1',
        docId: 't1',
        collectionName: 'taka_tasks',
        action: 'update',
        data: { name: 'Updated Task Name' },
        timestamp: new Date().toISOString(),
        numericTime: Date.now(),
      }
    ];

    broadcastAppliedDeltas(testDeltas);
    expect(mockPostMessage).toHaveBeenCalled();
    const sentMsg = mockPostMessage.mock.calls[0][0];
    expect(sentMsg.type).toBe('DELTA_APPLIED');
    expect(sentMsg.deltas).toEqual(testDeltas);
  });
});
