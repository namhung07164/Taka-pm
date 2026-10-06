import { describe, it, expect } from 'vitest';
import { 
  deduplicateTasksInMemory, 
  buildCanonicalProjectKey, 
  normalizeStoreCode,
  normalizeTaskNameForComparison
} from './taskDeduplicationService';
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

  it('normalizes task names stripping project code and number prefixes', () => {
    expect(normalizeTaskNameForComparison('Request to make design guideline', 'B1-B110-1'))
      .toBe('request to make design guideline');
    expect(normalizeTaskNameForComparison('B1-B110-1#1 Request to make design guideline', 'B1-B110-1'))
      .toBe('request to make design guideline');
    expect(normalizeTaskNameForComparison('#1 Request to make design guideline', 'B1-B110-1'))
      .toBe('request to make design guideline');
    expect(normalizeTaskNameForComparison('1. Request to make design guideline', 'B1-B110-1'))
      .toBe('request to make design guideline');
    expect(normalizeTaskNameForComparison('  B1-B110-1:  Request to make design guideline  ', 'B1-B110-1'))
      .toBe('request to make design guideline');
  });

  it('builds matching canonical project key for code, no, or id', () => {
    const key1 = buildCanonicalProjectKey('B1-B110-1', 2027, 'HN', mockProjects);
    const key2 = buildCanonicalProjectKey('B110-1', '2027', 'hn', mockProjects);
    const key3 = buildCanonicalProjectKey('p1', 2027, 'HN', mockProjects);

    expect(key1).toBe('b1-b110-1__2027__HN');
    expect(key2).toBe('b1-b110-1__2027__HN');
    expect(key3).toBe('b1-b110-1__2027__HN');
  });

  it('detects and merges duplicate tasks with prefixed name vs raw name in same project', () => {
    const duplicateTasks: Task[] = [
      {
        id: 't_raw',
        name: 'Request to make design guideline',
        taskCodePhu: 'B1-B110-1#1',
        projectCode: 'B1-B110-1',
        projectYear: 2026,
        projectStore: 'HN',
        start: '2026-05-05T09:00',
        finish: '2026-05-06T18:00',
        updatedAt: '2026-05-05T10:00:00.000Z'
      } as any,
      {
        id: 't_prefixed',
        name: 'B1-B110-1#1 Request to make design guideline',
        taskCodePhu: 'B1-B110-1#1',
        projectCode: 'B1-B110-1',
        projectYear: 2027,
        projectStore: 'HN',
        start: '2026-10-02T09:00',
        finish: '2026-10-03T18:00',
        updatedAt: '2026-10-02T10:00:00.000Z',
        comments: [{ id: 'c1', text: 'Important note', userId: 'u1', createdAt: '2026-10-02T10:00:00.000Z' }]
      } as any,
      {
        id: 't_other',
        name: 'FFD consulting (1st)',
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
    expect(removedTaskIds).toContain('t_raw');
    expect(dedupedTasks.length).toBe(2);
    // Verifies the latest task with comments was kept
    const keptGuideline = dedupedTasks.find(t => t.id === 't_prefixed');
    expect(keptGuideline).toBeDefined();
    expect(keptGuideline?.comments?.length).toBe(1);
  });
});
