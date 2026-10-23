import { describe, it, expect } from 'vitest';
import { buildTaskNoMap, parsePredecessors, calculateTaskDatesFromPredecessors } from './ganttUtils';
import { Project, Task } from '../types';

describe('Cross-Project Predecessor Resolution & Date Calculation', () => {
  const projects: Project[] = [
    {
      id: 'p1',
      code: 'HN-TKV-SMZ2',
      name: 'Shimazu Project 2',
      year: 2026,
      store: 'HN'
    } as Project,
    {
      id: 'p2',
      code: 'HN-TKV-IT',
      name: 'IT Project',
      year: 2026,
      store: 'HN'
    } as Project
  ];

  const tasks: Task[] = [
    {
      id: 'task-smz2-85',
      projectCode: 'HN-TKV-SMZ2',
      projectYear: 2026,
      projectStore: 'HN',
      name: 'Khai trương gian hàng',
      orderIndex: 84, // 85th task (index + 1 = 85)
      taskCodePhu: '5.1.1.1.9',
      start: '2026-09-25T22:00:00',
      finish: '2026-09-26T06:00:00',
      duration: '1'
    } as Task,
    {
      id: 'task-it-2',
      projectCode: 'HN-TKV-IT',
      projectYear: 2026,
      projectStore: 'HN',
      name: 'Setup IT Store',
      orderIndex: 1,
      start: '2026-09-30T21:00:00',
      finish: '2026-10-01T21:00:00',
      duration: '1'
    } as Task
  ];

  it('buildTaskNoMap indexes both taskCodePhu and project-sequential codes', () => {
    const map = buildTaskNoMap(projects, tasks);
    expect(map.has('5.1.1.1.9')).toBe(true);
    expect(map.has('hn-tkv-smz2-85')).toBe(true);
    expect(map.get('hn-tkv-smz2-85')?.[0]?.id).toBe('task-smz2-85');
  });

  it('parsePredecessors correctly identifies external project task with SS relationship', () => {
    const map = buildTaskNoMap(projects, tasks);
    const contextTask = tasks[1]; // task-it-2
    const parsed = parsePredecessors('HN-TKV-SMZ2-85SS', map, contextTask);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].type).toBe('SS');
    expect(parsed[0].task).toBeDefined();
    expect(parsed[0].task?.id).toBe('task-smz2-85');
  });

  it('calculateTaskDatesFromPredecessors recalculates start and finish based on external predecessor with SS', () => {
    const map = buildTaskNoMap(projects, tasks);
    const currentTask = { ...tasks[1], duration: '1' };
    const parsed = parsePredecessors('HN-TKV-SMZ2-85SS', map, currentTask);

    const result = calculateTaskDatesFromPredecessors(currentTask, parsed);
    expect(result).not.toBeNull();
    // For SS without lag, start should match predecessor start formatted
    expect(result?.start).toBe('2026-09-25T22:00');
    // For SS with duration 1 day, finish should be start + 1 day
    expect(result?.finish).toBe('2026-09-26T22:00');
    expect(result?.duration).toBe('1');
  });

  it('calculateTaskDatesFromPredecessors handles FS with positive lag', () => {
    const map = buildTaskNoMap(projects, tasks);
    const currentTask = { ...tasks[1], duration: '2' };
    const parsed = parsePredecessors('HN-TKV-SMZ2-85FS+1', map, currentTask);

    const result = calculateTaskDatesFromPredecessors(currentTask, parsed);
    expect(result).not.toBeNull();
    // For FS+1, start = finish of pred ('2026-09-26T06:00:00') + 1 day = '2026-09-27T06:00'
    expect(result?.start).toBe('2026-09-27T06:00');
    // duration 2 days => finish = '2026-09-29T06:00'
    expect(result?.finish).toBe('2026-09-29T06:00');
    expect(result?.duration).toBe('2');
  });

  it('handles simultaneous SS and FF from cross-project task with en-dash (HN–TKV–01#27SS, HN–TKV–01#27FF)', () => {
    const p1: Project = { id: 'p_hn', code: 'HN-TKV-01', year: 2026, store: 'HN' } as Project;
    const p2: Project = { id: 'p_b1', code: 'B1-B101', year: 2027, store: 'HCM' } as Project;
    const task27: Task = {
      id: 't_27',
      projectId: 'p_hn',
      projectCode: 'HN-TKV-01',
      projectYear: 2026,
      projectStore: 'HN',
      name: 'Tenant - Design guidline',
      orderIndex: 26,
      start: '2026-06-15T08:00:00',
      finish: '2026-10-28T17:00:00',
      duration: '135'
    } as Task;
    const task35: Task = {
      id: 't_35',
      projectId: 'p_b1',
      projectCode: 'B1-B101',
      projectYear: 2027,
      projectStore: 'HCM',
      name: 'Tenant - Design guidline',
      orderIndex: 34,
      start: '2027-01-02T08:00:00',
      finish: '2027-01-02T17:00:00',
      duration: '0',
      predecessor: 'HN\u2013TKV\u201301#27SS, HN\u2013TKV\u201301#27FF'
    } as Task;

    const map = buildTaskNoMap([p1, p2], [task27, task35]);
    const parsed = parsePredecessors(task35.predecessor!, map, task35);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].type).toBe('SS');
    expect(parsed[0].task?.id).toBe('t_27');
    expect(parsed[1].type).toBe('FF');
    expect(parsed[1].task?.id).toBe('t_27');

    const result = calculateTaskDatesFromPredecessors(task35, parsed);
    expect(result).not.toBeNull();
    expect(result?.start).toBe('2026-06-15T08:00');
    expect(result?.finish).toBe('2026-10-28T17:00');
    expect(result?.duration).toBe('135');
    expect(result?.durationManual).toBe(false);
  });
});
