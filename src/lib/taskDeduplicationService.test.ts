import { describe, it, expect } from 'vitest';
import { 
  deduplicateTasksInMemory, 
  buildCanonicalProjectKey, 
  normalizeStoreCode,
  normalizeTaskNameForComparison
} from './taskDeduplicationService';
import { rollupTaskSummaries } from './taskRollupHelpers';
import { Task, Project } from '../types';

describe('taskDeduplicationService', () => {
  const mockProjects: Project[] = [
    {
      id: 'p1',
      no: 'B110-1',
      code: 'B1-B110-1',
      name: 'Salada',
      year: 2027,
      store: 'HN',
      location: 'B1'
    } as any
  ];

  it('normalizes store code properly', () => {
    expect(normalizeStoreCode('hn')).toBe('HN');
    expect(normalizeStoreCode('Hà Nội')).toBe('HN');
    expect(normalizeStoreCode('hcm')).toBe('HCM');
    expect(normalizeStoreCode('Hồ Chí Minh')).toBe('HCM');
  });

  it('treats task names as absolute values and keeps FFD, FFD-1, 1 distinct', () => {
    expect(normalizeTaskNameForComparison('FFD', 'FFD')).toBe('ffd');
    expect(normalizeTaskNameForComparison('FFD-1', 'FFD')).toBe('ffd-1');
    expect(normalizeTaskNameForComparison('1', 'FFD')).toBe('1');
    expect(normalizeTaskNameForComparison('FFD')).not.toBe(normalizeTaskNameForComparison('FFD-1'));
    expect(normalizeTaskNameForComparison('FFD-1')).not.toBe(normalizeTaskNameForComparison('1'));
    expect(normalizeTaskNameForComparison('  FFD-1  ')).toBe('ffd-1');
  });

  it('builds matching canonical project key for code, no, or id', () => {
    const key1 = buildCanonicalProjectKey('B1-B110-1', 2027, 'HN', mockProjects);
    const key2 = buildCanonicalProjectKey('B110-1', '2027', 'hn', mockProjects);
    const key3 = buildCanonicalProjectKey('p1', 2027, 'HN', mockProjects);

    expect(key1).toBe('b1-b110-1__2027__HN');
    expect(key2).toBe('b1-b110-1__2027__HN');
    expect(key3).toBe('b1-b110-1__2027__HN');
  });

  it('detects and merges true duplicate tasks with identical signature in same project', () => {
    const duplicateTasks: Task[] = [
      {
        id: 't_first',
        name: 'Request to make design guideline',
        taskCodePhu: 'B1-B110-1#1',
        projectCode: 'B1-B110-1',
        projectYear: 2027,
        projectStore: 'HN',
        start: '2026-05-05T09:00',
        finish: '2026-05-06T18:00',
        updatedAt: '2026-05-05T10:00:00.000Z'
      } as any,
      {
        id: 't_second',
        name: 'Request to make design guideline',
        taskCodePhu: 'B1-B110-1#1',
        projectCode: 'B1-B110-1',
        projectYear: 2027,
        projectStore: 'HN',
        start: '2026-05-05T09:00',
        finish: '2026-05-06T18:00',
        updatedAt: '2026-10-02T10:00:00.000Z',
        comments: [{ id: 'c1', text: 'Important note', userId: 'u1', createdAt: '2026-10-02T10:00:00.000Z' }]
      } as any,
      {
        id: 't_other',
        name: 'FFD-1',
        projectCode: 'B1-B110-1',
        projectYear: 2027,
        projectStore: 'HN',
        start: '2026-05-06T09:00',
        finish: '2026-05-06T18:00',
        updatedAt: '2026-05-06T10:00:00.000Z'
      } as any
    ];

    const { dedupedTasks, duplicateCount, removedTaskIds } = deduplicateTasksInMemory(duplicateTasks, mockProjects);

    expect(duplicateCount).toBe(1);
    expect(removedTaskIds).toContain('t_first');
    expect(dedupedTasks.length).toBe(2);
    // Verifies the latest task with comments was kept
    const keptGuideline = dedupedTasks.find(t => t.id === 't_second');
    expect(keptGuideline).toBeDefined();
    expect(keptGuideline?.comments?.length).toBe(1);
  });

  it('never collapses distinct project tasks or summaries (e.g. 48 tasks in B1-B105) that share name+dates but have distinct IDs, orderIndex, taskCodePhu, or parent hierarchy', () => {
    const b105Project: Project = {
      id: 'proj_b105',
      code: 'B1-B105',
      name: 'Nakajima Suisan',
      year: 2027,
      store: 'HN',
      location: 'B1'
    } as any;

    const tasks48: Task[] = Array.from({ length: 48 }, (_, idx) => ({
      id: `t_b105_${idx + 1}`,
      projectId: 'proj_b105',
      projectCode: 'B1-B105',
      projectYear: 2027,
      projectStore: 'HN',
      name: idx >= 38 ? `Phase Task ${(idx - 38) + 1}` : `Phase Task ${idx + 1}`,
      taskCodePhu: idx < 20 ? `B1-B105#${idx + 1}` : undefined,
      orderIndex: idx,
      parentTaskId: idx >= 38 ? 't_b105_1' : undefined,
      start: '2026-06-15T22:00',
      finish: '2027-11-01T00:00',
      updatedAt: '2026-10-20T10:00:00.000Z'
    } as any));

    const { dedupedTasks, duplicateCount } = deduplicateTasksInMemory(tasks48, [b105Project]);
    expect(duplicateCount).toBe(0);
    expect(dedupedTasks.length).toBe(48);

    const rolledSummaries = rollupTaskSummaries(tasks48.map(t => ({ ...t })));
    expect(rolledSummaries.length).toBe(48);
  });
});
