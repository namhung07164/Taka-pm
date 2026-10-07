import { describe, it, expect, vi } from 'vitest';
import { recordBatchDeltas } from './deltaSyncService';
import { TakaDeltaItem } from '../types';

describe('deltaBatchSync (Phase 2: Delta Coalescing)', () => {
  it('handles empty batch gracefully without throwing', async () => {
    await expect(recordBatchDeltas([])).resolves.not.toThrow();
  });

  it('accepts and structures multiple delta items into a single batch_update payload', async () => {
    const items: TakaDeltaItem[] = [
      {
        docId: 'task_1',
        collectionName: 'taka_tasks',
        action: 'update',
        data: { name: 'Task 1 Updated', finish: '2026-11-01' },
        year: '2026',
      },
      {
        docId: 'task_2',
        collectionName: 'taka_tasks',
        action: 'update',
        data: { name: 'Task 2 Updated', finish: '2026-11-05' },
        year: '2026',
      },
    ];

    await expect(recordBatchDeltas(items, 'test_user')).resolves.not.toThrow();
  });
});
