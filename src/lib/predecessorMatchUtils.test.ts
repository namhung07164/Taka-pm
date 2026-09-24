import { describe, it, expect } from 'vitest';
import {
  parsePredecessorToken,
  stringSimilarity,
  scoreTaskPredecessorMatch,
  rankCandidateTasks,
  findClosestTaskMatch,
  resolvePredecessorString,
  getTaskProjectDiffDetails,
  isTaskDifferentProject
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
      { id: 'p1', no: '1', code: 'CP-01', year: 2026, store: 'HCM', name: 'Canopy Project' } as unknown as Project,
      { id: 'p2', no: '2', code: 'HN-TKV-SMZ2', year: 2026, store: 'HN', name: 'Shimizu Project' } as unknown as Project
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
      } as unknown as Task,
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
      } as unknown as Task,
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
      } as unknown as Task
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

    it('matches partial cross-project code with # delimiter: smz2#85 -> HN-TKV-SMZ2-85', () => {
      const match = findClosestTaskMatch('smz2#85', tasks, projects, tasks, 'CP-01');
      expect(match).not.toBeNull();
      expect(match?.task.id).toBe('t3');
      expect(match?.exactTaskCode).toBe('HN-TKV-SMZ2-85');
      expect(match?.isExternal).toBe(true);
    });

    it('matches #2 directly within current project', () => {
      const match = findClosestTaskMatch('#2', tasks, projects, tasks, 'CP-01');
      expect(match).not.toBeNull();
      expect(match?.task.id).toBe('t2');
      expect(match?.exactTaskCode).toBe('CP-01-2');
    });

    it('matches task number 85 to task with -85 or #85', () => {
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
      { id: 'p1', no: '1', code: 'CP-01', year: 2026, store: 'HCM', name: 'Canopy Project' } as unknown as Project,
      { id: 'p2', no: '2', code: 'HN-TKV-SMZ2', year: 2026, store: 'HN', name: 'Shimizu Project' } as unknown as Project
    ];

    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'CP-01',
        taskCodePhu: 'CP-01#1',
        orderIndex: 0,
        name: 'Task 1',
        finishManual: false
      } as unknown as Task,
      {
        id: 't2',
        projectCode: 'CP-01',
        taskCodePhu: 'CP-01#2',
        orderIndex: 1,
        name: 'Task 2',
        finishManual: false
      } as unknown as Task,
      {
        id: 't3',
        projectCode: 'HN-TKV-SMZ2',
        taskCodePhu: 'HN-TKV-SMZ2#85',
        orderIndex: 84,
        name: 'Shimizu Inspection',
        finishManual: false
      } as unknown as Task
    ];

    it('auto-resolves single predecessor closest match: "smz2-85" -> "HN-TKV-SMZ2#85"', () => {
      const res = resolvePredecessorString('smz2-85', tasks, projects, 'CP-01');
      expect(res).toBe('HN-TKV-SMZ2#85');
    });

    it('auto-resolves with relationship suffix preserved: "smz2-85SS" -> "HN-TKV-SMZ2#85SS"', () => {
      const res = resolvePredecessorString('smz2-85SS', tasks, projects, 'CP-01');
      expect(res).toBe('HN-TKV-SMZ2#85SS');
    });

    it('auto-resolves task number within project: "1" -> "CP-01#1"', () => {
      const res = resolvePredecessorString('1', tasks, projects, 'CP-01');
      expect(res).toBe('CP-01#1');
    });

    it('auto-resolves two predecessors and applies Gantt rule on second: "1, 2" -> "CP-01#1, CP-01#2FF"', () => {
      const res = resolvePredecessorString('1, 2', tasks, projects, 'CP-01');
      expect(res).toBe('CP-01#1, CP-01#2FF');
    });

    it('correctly disambiguates same project code across different years (e.g. 2026 vs 2027 B2-B208)', () => {
      const ambiguousProjects: Project[] = [
        { id: 'p2026', code: 'B2-B208', year: 2026, store: 'HCM', location: 'B2' } as unknown as Project,
        { id: 'p2027', code: 'B2-B208', year: 2027, store: 'HCM', location: 'B2' } as unknown as Project
      ];

      const ambiguousTasks: Task[] = [
        {
          id: 't2026_1',
          projectId: 'p2026',
          projectCode: 'B2-B208',
          projectYear: 2026,
          projectStore: 'HCM',
          location: 'B2',
          orderIndex: 0,
          name: 'Task in 2026',
          finishManual: false
        } as unknown as Task,
        {
          id: 't2027_1',
          projectId: 'p2027',
          projectCode: 'B2-B208',
          projectYear: 2027,
          projectStore: 'HCM',
          location: 'B2',
          orderIndex: 0,
          name: 'Task in 2027',
          finishManual: false
        } as unknown as Task
      ];

      // Context 2026
      const ctx2026 = {
        projectId: 'p2026',
        projectCode: 'B2-B208',
        projectYear: 2026,
        projectStore: 'HCM',
        projectLocation: 'B2'
      };

      const match2026 = findClosestTaskMatch('1', ambiguousTasks, ambiguousProjects, ambiguousTasks, 'B2-B208', 750, ctx2026);
      expect(match2026).not.toBeNull();
      expect(match2026?.task.id).toBe('t2026_1');

      // Context 2027
      const ctx2027 = {
        projectId: 'p2027',
        projectCode: 'B2-B208',
        projectYear: 2027,
        projectStore: 'HCM',
        projectLocation: 'B2'
      };

      const match2027 = findClosestTaskMatch('1', ambiguousTasks, ambiguousProjects, ambiguousTasks, 'B2-B208', 750, ctx2027);
      expect(match2027).not.toBeNull();
      expect(match2027?.task.id).toBe('t2027_1');
    });
  });

  describe('Cross-project diff validation (Year, Store, Location, Code)', () => {
    const testProjects: Project[] = [
      { id: 'p1', code: 'B2-B208', year: 2026, store: 'HCM', location: 'B2' } as unknown as Project,
      { id: 'p2', code: 'B2-B208', year: 2027, store: 'HCM', location: 'B2' } as unknown as Project,
      { id: 'p3', code: 'B2-B208', year: 2026, store: 'HN', location: 'B2' } as unknown as Project,
      { id: 'p4', code: 'B2-B208', year: 2026, store: 'HCM', location: '1F' } as unknown as Project
    ];

    const currentContext = {
      projectId: 'p1',
      projectCode: 'B2-B208',
      projectYear: 2026,
      projectStore: 'HCM',
      projectLocation: 'B2'
    };

    it('flags task with different year as different project', () => {
      const taskDifferentYear: Task = {
        id: 't_diff_year',
        projectId: 'p2',
        projectCode: 'B2-B208',
        projectYear: 2027,
        projectStore: 'HCM',
        location: 'B2'
      } as unknown as Task;

      const diff = getTaskProjectDiffDetails(currentContext, taskDifferentYear, testProjects);
      expect(diff.isDifferent).toBe(true);
      expect(diff.diffFactors).toContain('year');
      expect(isTaskDifferentProject(currentContext, taskDifferentYear, testProjects)).toBe(true);
    });

    it('flags task with different store as different project', () => {
      const taskDifferentStore: Task = {
        id: 't_diff_store',
        projectId: 'p3',
        projectCode: 'B2-B208',
        projectYear: 2026,
        projectStore: 'HN',
        location: 'B2'
      } as unknown as Task;

      const diff = getTaskProjectDiffDetails(currentContext, taskDifferentStore, testProjects);
      expect(diff.isDifferent).toBe(true);
      expect(diff.diffFactors).toContain('store');
      expect(isTaskDifferentProject(currentContext, taskDifferentStore, testProjects)).toBe(true);
    });

    it('flags task with different location as different project', () => {
      const taskDifferentLocation: Task = {
        id: 't_diff_loc',
        projectId: 'p4',
        projectCode: 'B2-B208',
        projectYear: 2026,
        projectStore: 'HCM',
        location: '1F'
      } as unknown as Task;

      const diff = getTaskProjectDiffDetails(currentContext, taskDifferentLocation, testProjects);
      expect(diff.isDifferent).toBe(true);
      expect(diff.diffFactors).toContain('location');
      expect(isTaskDifferentProject(currentContext, taskDifferentLocation, testProjects)).toBe(true);
    });

    it('considers task with matching year, store, location and code as same project', () => {
      const taskSameProject: Task = {
        id: 't_same',
        projectId: 'p1',
        projectCode: 'B2-B208',
        projectYear: 2026,
        projectStore: 'HCM',
        location: 'B2'
      } as unknown as Task;

      const diff = getTaskProjectDiffDetails(currentContext, taskSameProject, testProjects);
      expect(diff.isDifferent).toBe(false);
      expect(diff.diffFactors).toEqual([]);
      expect(isTaskDifferentProject(currentContext, taskSameProject, testProjects)).toBe(false);
    });

    it('accurately sets isExternal flag in rankCandidateTasks based on year, store, or location differences', () => {
      const allTasks: Task[] = [
        {
          id: 't_same',
          projectCode: 'B2-B208',
          projectYear: 2026,
          projectStore: 'HCM',
          location: 'B2',
          taskCodePhu: 'B2-B208#1',
          name: 'Task Same'
        } as unknown as Task,
        {
          id: 't_diff_loc',
          projectCode: 'B2-B208',
          projectYear: 2026,
          projectStore: 'HCM',
          location: '1F',
          taskCodePhu: 'B2-B208#2',
          name: 'Task Diff Location'
        } as unknown as Task
      ];

      const ranked = rankCandidateTasks('', allTasks, testProjects, allTasks, 'B2-B208', currentContext);
      const sameMatch = ranked.find(r => r.task.id === 't_same');
      const diffLocMatch = ranked.find(r => r.task.id === 't_diff_loc');

      expect(sameMatch?.isExternal).toBe(false);
      expect(diffLocMatch?.isExternal).toBe(true);
      expect(diffLocMatch?.diffDetails?.diffFactors).toContain('location');
    });
  });
});
