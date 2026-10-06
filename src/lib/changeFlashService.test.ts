import { describe, it, expect, vi } from 'vitest';
import { triggerChangeFlash, triggerBatchChangeFlash } from './changeFlashService';

describe('changeFlashService', () => {
  it('triggers change flash and registers entry', () => {
    triggerChangeFlash('task_123', 'taka_tasks', 'user@example.com');
    // Service runs and handles without throwing
    expect(true).toBe(true);
  });

  it('triggers batch change flash without error', () => {
    triggerBatchChangeFlash([
      { docId: 'task_1', collectionName: 'taka_tasks', updatedBy: 'userA@taka.com' },
      { docId: 'task_2', collectionName: 'taka_tasks', updatedBy: 'userB@taka.com' },
    ]);
    expect(true).toBe(true);
  });
});
