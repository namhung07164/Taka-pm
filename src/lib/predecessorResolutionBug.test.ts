import { describe, it, expect } from 'vitest';
import { buildTaskNoMap, parsePredecessors, computeTaskCode } from './ganttUtils';
import { Project, Task } from '../types';

describe('Predecessor Resolution and Subtask Index Matching', () => {
  const mockProjects: Project[] = [
    {
      id: 'proj-2026',
      no: 1,
      code: 'B2-B208',
      name: 'Old Restaurant 2026',
      year: 2026,
      store: 'HCM',
      location: 'B2',
      start: '2026-03-01',
      handover: '2026-04-01'
    } as unknown as Project,
    {
      id: 'proj-2027',
      no: 2,
      code: 'B2-B208',
      name: 'New Restaurant 2027',
      year: 2027,
      store: 'HCM',
      location: 'B2',
      start: '2027-03-31',
      handover: '2027-04-06'
    } as unknown as Project
  ];

  const mockTasks: Task[] = [
    // 2026 Tasks (with non-zero orderIndex)
    {
      id: 'task-2026-1',
      projectId: 'proj-2026',
      projectCode: 'B2-B208',
      projectYear: 2026,
      projectStore: 'HCM',
      location: 'B2',
      name: '2026 Hoarding up',
      orderIndex: 1,
      start: '2026-03-01T09:00',
      finish: '2026-03-05T18:00',
      duration: '4',
      durationManual: true,
      finishManual: false
    } as unknown as Task,
    {
      id: 'task-2026-2',
      projectId: 'proj-2026',
      projectCode: 'B2-B208',
      projectYear: 2026,
      projectStore: 'HCM',
      location: 'B2',
      name: '2026 Re-instatement',
      orderIndex: 2,
      start: '2026-03-05T09:00',
      finish: '2026-03-10T18:00',
      duration: '5',
      durationManual: true,
      finishManual: false
    } as unknown as Task,

    // 2027 Tasks
    {
      id: 'task-2027-1',
      projectId: 'proj-2027',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      location: 'B2',
      name: 'Hoarding up',
      orderIndex: 0,
      start: '2027-03-31T09:00',
      finish: '2027-04-01T09:00',
      duration: '1',
      durationManual: true,
      finishManual: false
    } as unknown as Task,
    {
      id: 'task-2027-2',
      projectId: 'proj-2027',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      location: 'B2',
      name: 'Re-instatement',
      orderIndex: 1,
      start: '2027-04-01T09:00',
      finish: '2027-04-06T18:00',
      duration: '5',
      durationManual: true,
      finishManual: false
    } as unknown as Task,
    {
      id: 'task-2027-3',
      projectId: 'proj-2027',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      location: 'B2',
      name: 'Handover',
      orderIndex: 2,
      start: '2027-04-06T09:00',
      finish: '2027-04-06T18:00',
      duration: '0',
      durationManual: true,
      finishManual: false
    } as unknown as Task
  ];

  it('correctly maps computed task codes for each task', () => {
    expect(computeTaskCode(mockProjects, mockTasks, mockTasks[2])).toBe('B2-B208#1');
    expect(computeTaskCode(mockProjects, mockTasks, mockTasks[3])).toBe('B2-B208#2');
    expect(computeTaskCode(mockProjects, mockTasks, mockTasks[4])).toBe('B2-B208#3');
  });

  it('resolves B2-B208#2 to Subtask 2 (Re-instatement) in 2027 context, never to Subtask 1', () => {
    const taskNoMap = buildTaskNoMap(mockProjects, mockTasks);
    
    // Context is task 3 (Handover) in 2027 project
    const contextTask: Task = {
      id: 'task-2027-3',
      projectId: 'proj-2027',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      location: 'B2',
      name: 'Handover',
      start: '2027-04-01T09:00',
      finish: '2027-04-01T18:00',
      duration: '0',
      durationManual: true,
      finishManual: false
    } as unknown as Task;

    const parsed = parsePredecessors('B2-B208#2', taskNoMap, contextTask);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].task).toBeDefined();
    expect(parsed[0].task?.id).toBe('task-2027-2');
    expect(parsed[0].task?.name).toBe('Re-instatement');
    expect(parsed[0].task?.projectId).toBe('proj-2027');
  });

  it('resolves B2-B208#1 to Subtask 1 (Hoarding up) in 2027 context', () => {
    const taskNoMap = buildTaskNoMap(mockProjects, mockTasks);
    
    const contextTask: Task = {
      id: 'task-2027-2',
      projectId: 'proj-2027',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      location: 'B2',
      name: 'Re-instatement',
      start: '2027-04-01T09:00',
      finish: '2027-04-06T18:00',
      duration: '5',
      durationManual: true,
      finishManual: false
    } as unknown as Task;

    const parsed = parsePredecessors('B2-B208#1', taskNoMap, contextTask);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].task).toBeDefined();
    expect(parsed[0].task?.id).toBe('task-2027-1');
    expect(parsed[0].task?.name).toBe('Hoarding up');
    expect(parsed[0].task?.projectId).toBe('proj-2027');
  });

  it('handles input with trailing comma and space cleanly', () => {
    const taskNoMap = buildTaskNoMap(mockProjects, mockTasks);
    const contextTask: Task = {
      id: 'task-2027-3',
      projectId: 'proj-2027',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      location: 'B2',
      name: 'Handover',
      start: '2027-04-01T09:00',
      finish: '2027-04-01T18:00',
      duration: '0',
      durationManual: true,
      finishManual: false
    } as unknown as Task;

    const parsed = parsePredecessors('B2-B208#2, ', taskNoMap, contextTask);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].task?.id).toBe('task-2027-2');
    expect(parsed[0].task?.name).toBe('Re-instatement');
  });

  it('preserves dash format in computeTaskCode and does not convert "-" to "#"', () => {
    const taskWithDash: Task = {
      id: 'task-custom-dash',
      projectId: 'proj-2027',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      location: 'B2',
      taskCodePhu: 'B2-B208-2',
      name: 'Re-instatement'
    } as unknown as Task;

    const computed = computeTaskCode(mockProjects, mockTasks, taskWithDash);
    expect(computed).toBe('B2-B208-2');
  });

  it('resolves predecessor B2-B208-2 directly to Re-instatement in 2027', () => {
    const taskNoMap = buildTaskNoMap(mockProjects, mockTasks);
    const contextTask: Task = {
      id: 'task-2027-3',
      projectId: 'proj-2027',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      location: 'B2',
      name: 'Handover'
    } as unknown as Task;

    const parsed = parsePredecessors('B2-B208-2', taskNoMap, contextTask);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].task?.id).toBe('task-2027-2');
    expect(parsed[0].task?.name).toBe('Re-instatement');
  });
});
