import { describe, it, expect } from 'vitest';
import {
  parsePredecessorToken,
  stringSimilarity,
  scoreTaskPredecessorMatch,
  rankCandidateTasks,
  findClosestTaskMatch,
  resolvePredecessorString
} from './predecessorMatchUtils';
import { Task, Project } from '../types';

describe('predecessorMatchUtils', () => {
  describe('parsePredecessorToken', () => {
    it('correctly splits query and suffix', () => {
      expect(parsePredecessorToken('A01-1SS')).toEqual({ query: 'A01-1', suffix: 'SS' });
      expect(parsePredecessorToken('CP-01-2FF')).toEqual({ query: 'CP-01-2', suffix: 'FF' });
      expect(parsePredecessorToken('85+2')).toEqual({ query: '85', suffix: '+2' });
      expect(parsePredecessorToken('smz2-85SS+1')).toEqual({ query: 'smz2-85', suffix: 'SS+1' });
      expect(parsePredecessorToken('HN-TKV-SMZ2-85')).toEqual({ query: 'HN-TKV-SMZ2-85', suffix: '' });
      expect(parsePredecessorToken('2')).toEqual({ query: '2', suffix: '' });
      expect(parsePredecessorToken('2 FF')).toEqual({ query: '2', suffix: 'FF' });
      expect(parsePredecessorToken('')).toEqual({ query: '', suffix: '' });
    });
  });

  describe('stringSimilarity', () => {
    it('computes Sorensen-Dice similarity', () => {
      expect(stringSimilarity('hello', 'hello')).toBe(1);
      expect(stringSimilarity('smz2-85', 'smz285')).toBeGreaterThan(0.7);
      expect(stringSimilarity('cp01-2', 'cp-01-2')).toBeGreaterThan(0.7);
      expect(stringSimilarity('apple', 'banana')).toBeLessThan(0.3);
    });
  });

  describe('scoreTaskPredecessorMatch & findClosestTaskMatch', () => {
    const projects: Project[] = [
      { id: 'p1', code: 'CP-01', year: 2026, store: 'HCM', name: 'Canopy Project' },
      { id: 'p2', code: 'HN-TKV-SMZ2', year: 2026, store: 'HN', name: 'Shimizu Project' }
    ];

    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'CP-01',
        projectYear: 2026,
        projectStore: 'HCM',
        taskCodePhu: 'CP-01-1',
        orderIndex: 0,
        name: 'Design review',
        finishManual: false,
        party: 'Takashimaya'
      },
      {
        id: 't2',
        projectCode: 'CP-01',
        projectYear: 2026,
        projectStore: 'HCM',
        taskCodePhu: 'CP-01-2',
        orderIndex: 1,
        name: 'Civil structure work',
        finishManual: false,
        party: 'Takashimaya'
      },
      {
        id: 't3',
        projectCode: 'HN-TKV-SMZ2',
        projectYear: 2026,
        projectStore: 'HN',
        taskCodePhu: 'HN-TKV-SMZ2-85',
        orderIndex: 84,
        name: 'Final inspection Shimizu',
        finishManual: false,
        party: 'Shimizu'
      }
    ];

    it('finds exact code match with highest score', () => {
      const match = findClosestTaskMatch('CP-01-2', tasks, projects, tasks, 'CP-01');
      expect(match).not.toBeNull();
      expect(match?.task.id).toBe('t2');
      expect(match?.score).toBeGreaterThanOrEqual(1000);
    });

    it('matches short task number within current project', () => {
      const match = findClosestTaskMatch('2', tasks, projects, tasks, 'CP-01');
      expect(match).not.toBeNull();
      expect(match?.task.id).toBe('t2');
      expect(match?.exactTaskCode).toBe('CP-01-2');
    });

    it('matches partial cross-project code: smz2-85 -> HN-TKV-SMZ2-85', () => {
      const match = findClosestTaskMatch('smz2-85', tasks, projects, tasks, 'CP-01');
      expect(match).not.toBeNull();
      expect(match?.task.id).toBe('t3');
      expect(match?.exactTaskCode).toBe('HN-TKV-SMZ2-85');
      expect(match?.isExternal).toBe(true);
    });

    it('matches task number 85 to task with -85', () => {
      const match = findClosestTaskMatch('85', tasks, projects, tasks, 'CP-01');
      expect(match).not.toBeNull();
      expect(match?.task.id).toBe('t3');
      expect(match?.exactTaskCode).toBe('HN-TKV-SMZ2-85');
    });

    it('matches task by name', () => {
      const match = findClosestTaskMatch('Civil structure', tasks, projects, tasks, 'CP-01');
      expect(match).not.toBeNull();
      expect(match?.task.id).toBe('t2');
    });
  });

  describe('resolvePredecessorString', () => {
    const projects: Project[] = [
      { id: 'p1', code: 'CP-01', year: 2026, store: 'HCM', name: 'Canopy Project' },
      { id: 'p2', code: 'HN-TKV-SMZ2', year: 2026, store: 'HN', name: 'Shimizu Project' }
    ];

    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'CP-01',
        taskCodePhu: 'CP-01-1',
        orderIndex: 0,
        name: 'Task 1',
        finishManual: false
      },
      {
        id: 't2',
        projectCode: 'CP-01',
        taskCodePhu: 'CP-01-2',
        orderIndex: 1,
        name: 'Task 2',
        finishManual: false
      },
      {
        id: 't3',
        projectCode: 'HN-TKV-SMZ2',
        taskCodePhu: 'HN-TKV-SMZ2-85',
        orderIndex: 84,
        name: 'Shimizu Inspection',
        finishManual: false
      }
    ];

    it('auto-resolves single predecessor closest match: "smz2-85" -> "HN-TKV-SMZ2-85"', () => {
      const res = resolvePredecessorString('smz2-85', tasks, projects, 'CP-01');
      expect(res).toBe('HN-TKV-SMZ2-85');
    });

    it('auto-resolves with relationship suffix preserved: "smz2-85SS" -> "HN-TKV-SMZ2-85SS"', () => {
      const res = resolvePredecessorString('smz2-85SS', tasks, projects, 'CP-01');
      expect(res).toBe('HN-TKV-SMZ2-85SS');
    });

    it('auto-resolves task number within project: "1" -> "CP-01-1"', () => {
      const res = resolvePredecessorString('1', tasks, projects, 'CP-01');
      expect(res).toBe('CP-01-1');
    });

    it('auto-resolves two predecessors and applies Gantt rule on second: "1, 2" -> "CP-01-1, CP-01-2FF"', () => {
      const res = resolvePredecessorString('1, 2', tasks, projects, 'CP-01');
      expect(res).toBe('CP-01-1, CP-01-2FF');
    });
  });
});
