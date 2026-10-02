import { describe, it, expect } from 'vitest';
import { 
  calculateDatesFromPredecessorsAndDuration, 
  rollupParentTaskDates, 
  cleanDurationString 
} from './taskImportService';
import { Task, Project } from '../types';

describe('taskImportService', () => {
  it('cleanDurationString handles numeric and text duration formats', () => {
    expect(cleanDurationString(5)).toBe('5');
    expect(cleanDurationString('5')).toBe('5');
    expect(cleanDurationString('5d')).toBe('5');
    expect(cleanDurationString('2.5 days')).toBe('2.5');
    expect(cleanDurationString('')).toBe('0');
    expect(cleanDurationString(null)).toBe('0');
    expect(cleanDurationString(-3)).toBe('0');
  });

  it('recalculates task dates prioritizing assigned predecessors and duration', () => {
    const projects: Project[] = [
      { id: 'p1', no: 1, code: 'VN26', year: 2026, store: 'HCM', name: 'Test Project' }
    ];

    // Task 1: starts 2026-10-01T08:00, finish 2026-10-03T08:00 (2 days)
    const task1: Task = {
      id: 't1',
      projectCode: 'VN26',
      projectYear: 2026,
      projectStore: 'HCM',
      taskCodePhu: 'VN26#1',
      orderIndex: 0,
      name: 'Task 1',
      start: '2026-10-01T08:00',
      finish: '2026-10-03T08:00',
      duration: '2',
      durationManual: true,
      finishManual: false,
      predecessor: '',
      updatedAt: '2026-10-01T08:00:00Z'
    };

    // Task 2: has old/dummy dates in CSV, but predecessor is "VN26#1" and duration is 3 days
    const task2: Task = {
      id: 't2',
      projectCode: 'VN26',
      projectYear: 2026,
      projectStore: 'HCM',
      taskCodePhu: 'VN26#2',
      orderIndex: 1,
      name: 'Task 2',
      start: '2026-09-01T00:00', // outdated CSV date
      finish: '2026-09-02T00:00',
      duration: '3',
      durationManual: true,
      finishManual: false,
      predecessor: 'VN26#1',
      updatedAt: '2026-10-01T08:00:00Z'
    };

    // Task 3: depends on Task 2 with 4 days duration
    const task3: Task = {
      id: 't3',
      projectCode: 'VN26',
      projectYear: 2026,
      projectStore: 'HCM',
      taskCodePhu: 'VN26#3',
      orderIndex: 2,
      name: 'Task 3',
      start: '2026-09-01T00:00',
      finish: '2026-09-02T00:00',
      duration: '4',
      durationManual: true,
      finishManual: false,
      predecessor: '2', // short subtask number
      updatedAt: '2026-10-01T08:00:00Z'
    };

    const tasksToProcess = [task1, task2, task3];
    const calculated = calculateDatesFromPredecessorsAndDuration(tasksToProcess, tasksToProcess, projects);

    const calc1 = calculated.find(t => t.id === 't1')!;
    const calc2 = calculated.find(t => t.id === 't2')!;
    const calc3 = calculated.find(t => t.id === 't3')!;

    // Task 1 dates remain
    expect(calc1.start).toBe('2026-10-01T08:00');
    expect(calc1.finish).toBe('2026-10-03T08:00');

    // Task 2 should start when Task 1 finishes (2026-10-03T08:00) and finish 3 days later (2026-10-06T08:00)
    expect(calc2.start).toBe('2026-10-03T08:00');
    expect(calc2.finish).toBe('2026-10-06T08:00');
    expect(calc2.duration).toBe('3');

    // Task 3 should start when Task 2 finishes (2026-10-06T08:00) and finish 4 days later (2026-10-10T08:00)
    expect(calc3.start).toBe('2026-10-06T08:00');
    expect(calc3.finish).toBe('2026-10-10T08:00');
    expect(calc3.duration).toBe('4');
  });

  it('rolls up parent task dates from child tasks', () => {
    // Parent task with no or outdated dates
    const parentTask: Task = {
      id: 'parent_1',
      projectCode: 'VN26',
      projectYear: 2026,
      projectStore: 'HCM',
      name: 'Parent Task',
      start: '2026-01-01T08:00',
      finish: '2026-01-02T08:00',
      duration: '1',
      durationManual: true,
      finishManual: false,
      updatedAt: '2026-10-01T08:00:00Z'
    };

    const child1: Task = {
      id: 'child_1',
      parentTaskId: 'parent_1',
      projectCode: 'VN26',
      name: 'Child 1',
      start: '2026-10-05T08:00',
      finish: '2026-10-08T08:00',
      duration: '3',
      durationManual: true,
      finishManual: false,
      updatedAt: '2026-10-01T08:00:00Z'
    };

    const child2: Task = {
      id: 'child_2',
      parentTaskId: 'parent_1',
      projectCode: 'VN26',
      name: 'Child 2',
      start: '2026-10-07T08:00',
      finish: '2026-10-15T08:00',
      duration: '8',
      durationManual: true,
      finishManual: false,
      updatedAt: '2026-10-01T08:00:00Z'
    };

    const allTasks = [parentTask, child1, child2];
    const { updatedParents } = rollupParentTaskDates(allTasks, ['parent_1']);

    expect(updatedParents.length).toBe(1);
    const rolled = updatedParents[0];
    // Earliest child start is child1 (2026-10-05T08:00)
    expect(rolled.start).toBe('2026-10-05T08:00');
    // Latest child finish is child2 (2026-10-15T08:00)
    expect(rolled.finish).toBe('2026-10-15T08:00');
    // Duration in days from 2026-10-05 to 2026-10-15 is 10 days
    expect(rolled.duration).toBe('10');
  });
});
