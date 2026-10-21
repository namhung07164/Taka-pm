import { describe, it, expect } from 'vitest';
import {
  calculateParentTaskPredecessorsAndDates,
  applyParentPredecessorsToTaskTree,
} from './parentTaskPredecessorService';
import { Task, Project } from '../types';

describe('parentTaskPredecessorService', () => {
  const mockProjects: Project[] = [
    {
      id: 'proj_1',
      code: 'A01',
      name: 'Project Alpha',
      store: 'HCM',
      year: 2026,
    } as Project,
  ];

  it('assigns SS to earliest start child and FF to latest finish child with multi predecessor string', () => {
    const parentTask: Task = {
      id: 'parent_task_1',
      name: 'Supervision Phase',
      projectCode: 'A01',
      projectId: 'proj_1',
      projectYear: 2026,
      projectStore: 'HCM',
      start: '2026-01-01T08:00',
      finish: '2026-01-01T08:00',
      duration: '0',
      durationManual: false,
      finishManual: false,
      taskCodePhu: 'A01#1',
    };

    const childTasks: Task[] = [
      {
        id: 'child_mid',
        name: 'Demolition',
        parentTaskId: 'parent_task_1',
        projectCode: 'A01',
        projectId: 'proj_1',
        projectYear: 2026,
        projectStore: 'HCM',
        taskCodePhu: 'A01#2',
        start: '2026-03-05T08:00',
        finish: '2026-03-12T17:00',
        duration: '7.38',
        durationManual: true,
        finishManual: false,
      },
      {
        id: 'child_earliest',
        name: 'Site Preparation',
        parentTaskId: 'parent_task_1',
        projectCode: 'A01',
        projectId: 'proj_1',
        projectYear: 2026,
        projectStore: 'HCM',
        taskCodePhu: 'A01#3',
        start: '2026-03-01T08:00',
        finish: '2026-03-04T17:00',
        duration: '3.38',
        durationManual: true,
        finishManual: false,
      },
      {
        id: 'child_latest',
        name: 'Final Cleaning',
        parentTaskId: 'parent_task_1',
        projectCode: 'A01',
        projectId: 'proj_1',
        projectYear: 2026,
        projectStore: 'HCM',
        taskCodePhu: 'A01#4',
        start: '2026-03-20T08:00',
        finish: '2026-03-28T17:00',
        duration: '8.38',
        durationManual: true,
        finishManual: false,
      },
    ];

    const patch = calculateParentTaskPredecessorsAndDates(
      parentTask,
      childTasks,
      mockProjects,
      [parentTask, ...childTasks]
    );

    expect(patch).not.toBeNull();
    // Multi predecessor: earliest child (A01#3) with SS, latest child (A01#4) with FF
    expect(patch?.predecessor).toBe('A01#3SS, A01#4FF');
    expect(patch?.predecessors).toEqual([
      { taskId: 'child_earliest', type: 'SS' },
      { taskId: 'child_latest', type: 'FF' },
    ]);
    expect(patch?.predecessorTaskIds).toEqual(['child_earliest', 'child_latest']);
    expect(patch?.start).toBe('2026-03-01T08:00');
    expect(patch?.finish).toBe('2026-03-28T17:00');
    expect(parseFloat(patch?.duration || '0')).toBeCloseTo(27.38, 1);
    expect(patch?.isModularParent).toBe(true);
  });

  it('handles a single child task by assigning both SS and FF to it', () => {
    const parentTask: Task = {
      id: 'parent_single',
      name: 'Single Child Parent',
      projectCode: 'A01',
      projectId: 'proj_1',
      start: '2026-01-01',
      finish: '2026-01-01',
      duration: '0',
      durationManual: false,
      finishManual: false,
      taskCodePhu: 'A01#10',
    };

    const onlyChild: Task = {
      id: 'child_only',
      name: 'Sole Task',
      parentTaskId: 'parent_single',
      projectCode: 'A01',
      projectId: 'proj_1',
      taskCodePhu: 'A01#11',
      start: '2026-04-10T08:00',
      finish: '2026-04-15T17:00',
      duration: '5.38',
      durationManual: true,
      finishManual: false,
    };

    const patch = calculateParentTaskPredecessorsAndDates(
      parentTask,
      [onlyChild],
      mockProjects,
      [parentTask, onlyChild]
    );

    expect(patch).not.toBeNull();
    expect(patch?.predecessor).toBe('A01#11SS, A01#11FF');
    expect(patch?.predecessors).toEqual([
      { taskId: 'child_only', type: 'SS' },
      { taskId: 'child_only', type: 'FF' },
    ]);
    expect(patch?.start).toBe('2026-04-10T08:00');
    expect(patch?.finish).toBe('2026-04-15T17:00');
  });

  it('applyParentPredecessorsToTaskTree updates all parent tasks across tree', () => {
    const parent1: Task = {
      id: 'p1',
      name: 'Parent 1',
      projectCode: 'A01',
      taskCodePhu: 'A01#1',
      start: '2026-01-01',
      finish: '2026-01-01',
      duration: '0',
      durationManual: false,
      finishManual: false,
    };
    const c1: Task = {
      id: 'c1',
      name: 'Child 1',
      parentTaskId: 'p1',
      projectCode: 'A01',
      taskCodePhu: 'A01#2',
      start: '2026-05-01T08:00',
      finish: '2026-05-03T17:00',
      duration: '2',
      durationManual: true,
      finishManual: false,
    };
    const c2: Task = {
      id: 'c2',
      name: 'Child 2',
      parentTaskId: 'p1',
      projectCode: 'A01',
      taskCodePhu: 'A01#3',
      start: '2026-05-02T08:00',
      finish: '2026-05-10T17:00',
      duration: '8',
      durationManual: true,
      finishManual: false,
    };

    const { updatedTasks, updatedParents } = applyParentPredecessorsToTaskTree(
      [parent1, c1, c2],
      mockProjects
    );

    expect(updatedParents.length).toBe(1);
    expect(updatedParents[0].id).toBe('p1');
    expect(updatedParents[0].predecessor).toBe('A01#2SS, A01#3FF');
    expect(updatedParents[0].start).toBe('2026-05-01T08:00');
    expect(updatedParents[0].finish).toBe('2026-05-10T17:00');
  });
});
