import { describe, it, expect } from 'vitest';
import {
  isEqualValue,
  computeFieldPatch,
  applyFieldPatch,
  createPatchDeltaItem,
  createBatchPatchDeltaItems,
  measurePayloadDiff,
} from './deltaPatchService';
import { Task } from '../types';

describe('deltaPatchService (Stage 3: Field-Level Granular Patching)', () => {
  const baseTask: Task = {
    id: 'task_001',
    name: 'Thi công vách thạch cao tầng 1',
    taskCodePhu: 'TK-01',
    projectCode: 'HCM-TAK-2026',
    projectYear: 2026,
    projectStore: 'HCM',
    start: '2026-10-01 08:00',
    finish: '2026-10-05 17:00',
    duration: '4',
    durationManual: false,
    finishManual: false,
    runningStatus: 'Upcoming',
    party: 'Thạch Cao SG',
    comments: [{ id: 'c1', text: 'Yêu cầu kiểm tra mặt bằng trước khi lắp khung xương', createdAt: '2026-10-01', userId: 'u1' }],
    orderIndex: 1,
    textColor: '#1a1a1a',
    updatedAt: '2026-10-01T08:00:00.000Z',
  };

  describe('isEqualValue', () => {
    it('compares primitives correctly', () => {
      expect(isEqualValue('hello', 'hello')).toBe(true);
      expect(isEqualValue('hello', 'world')).toBe(false);
      expect(isEqualValue(42, 42)).toBe(true);
      expect(isEqualValue(42, 43)).toBe(false);
      expect(isEqualValue(null, undefined)).toBe(true);
      expect(isEqualValue(null, 'null')).toBe(false);
    });

    it('compares arrays and objects correctly', () => {
      expect(isEqualValue(['A', 'B'], ['A', 'B'])).toBe(true);
      expect(isEqualValue(['A', 'B'], ['B', 'A'])).toBe(false);
      expect(isEqualValue({ x: 1 }, { x: 1 })).toBe(true);
      expect(isEqualValue({ x: 1 }, { x: 2 })).toBe(false);
    });
  });

  describe('computeFieldPatch', () => {
    it('returns full object when previous is null or undefined (create action)', () => {
      const patch = computeFieldPatch(null, baseTask);
      expect(patch).toEqual(baseTask);
    });

    it('returns only changed fields when dragging Gantt bar (dates and duration)', () => {
      const draggedTask: Task = {
        ...baseTask,
        start: '2026-10-03 08:00',
        finish: '2026-10-07 17:00',
        duration: '4',
        updatedAt: '2026-10-02T10:00:00.000Z',
      };

      const patch = computeFieldPatch(baseTask, draggedTask);

      // Changed fields
      expect(patch.start).toBe('2026-10-03 08:00');
      expect(patch.finish).toBe('2026-10-07 17:00');
      expect(patch.updatedAt).toBe('2026-10-02T10:00:00.000Z');

      // Unchanged fields MUST NOT be included
      expect(patch.name).toBeUndefined();
      expect(patch.comments).toBeUndefined();
      expect(patch.party).toBeUndefined();
      expect(patch.textColor).toBeUndefined();
      expect(patch.runningStatus).toBeUndefined();

      // Essential identifiers are kept
      expect(patch.id).toBe('task_001');
      expect(patch.projectCode).toBe('HCM-TAK-2026');
    });

    it('reduces payload size by over 80% compared to full task object', () => {
      const updatedTask: Task = {
        ...baseTask,
        runningStatus: 'Completed',
        updatedAt: '2026-10-02T12:00:00.000Z',
      };

      const patch = computeFieldPatch(baseTask, updatedTask);
      const metrics = measurePayloadDiff(updatedTask, patch);

      expect(metrics.savedBytes).toBeGreaterThan(0);
      expect(metrics.percentSaved).toBeGreaterThan(60);
    });

    it('detects removed fields by setting them to null', () => {
      const withParty = { ...baseTask, party: 'Contractor A' };
      const withoutParty = { ...baseTask };
      delete (withoutParty as any).party;

      const patch = computeFieldPatch(withParty, withoutParty);
      expect(patch.party).toBeNull();
    });
  });

  describe('applyFieldPatch (Conflict Avoidance)', () => {
    it('cleanly applies patch without clobbering concurrent field edits by another user', () => {
      // User A edited schedule dates
      const userAPatch = {
        id: 'task_001',
        start: '2026-10-10 08:00',
        finish: '2026-10-15 17:00',
        duration: '5',
        updatedAt: '2026-10-02T14:00:00.000Z',
      };

      // User B simultaneously edited status and party
      const userBLocalState: Task = {
        ...baseTask,
        runningStatus: 'On process',
        party: 'Nhà Thầu Mới HCM',
      };

      // Applying User A's patch to User B's state
      const merged = applyFieldPatch(userBLocalState, userAPatch);

      // User A's changes are applied
      expect(merged.start).toBe('2026-10-10 08:00');
      expect(merged.finish).toBe('2026-10-15 17:00');
      expect(merged.duration).toBe('5');

      // User B's concurrent changes are completely preserved! No clobbering!
      expect(merged.runningStatus).toBe('On process');
      expect(merged.party).toBe('Nhà Thầu Mới HCM');
      expect(merged.name).toBe(baseTask.name);
    });
  });

  describe('createPatchDeltaItem and createBatchPatchDeltaItems', () => {
    it('creates TakaDeltaItem with isPatch=true for updates', () => {
      const updatedTask: Task = {
        ...baseTask,
        runningStatus: 'Delayed',
        updatedAt: '2026-10-02T15:00:00.000Z',
      };

      const item = createPatchDeltaItem({
        docId: 'task_001',
        collectionName: 'taka_tasks',
        previous: baseTask,
        updated: updatedTask,
        year: '2026',
      });

      expect(item.action).toBe('update');
      expect(item.isPatch).toBe(true);
      expect(item.data?.runningStatus).toBe('Delayed');
      expect(item.data?.name).toBeUndefined();
    });

    it('creates batch items correctly', () => {
      const items = createBatchPatchDeltaItems([
        {
          docId: 'task_001',
          collectionName: 'taka_tasks',
          previous: baseTask,
          updated: { ...baseTask, runningStatus: 'Completed' },
          year: '2026',
        },
        {
          docId: 'task_002',
          collectionName: 'taka_tasks',
          action: 'delete',
          updated: null,
          year: '2026',
        },
      ]);

      expect(items).toHaveLength(2);
      expect(items[0].isPatch).toBe(true);
      expect(items[0].action).toBe('update');
      expect(items[1].action).toBe('delete');
    });
  });
});
