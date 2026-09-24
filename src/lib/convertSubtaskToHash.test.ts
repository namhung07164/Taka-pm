import { describe, it, expect } from 'vitest';
import { convertAllSubtaskCodesAndPredecessorsToHash } from './ganttUtils';
import { Task, Project } from '../types';

describe('convertAllSubtaskCodesAndPredecessorsToHash', () => {
  const mockProjects: Project[] = [
    { id: 'p1', code: 'B2-B208', year: 2027, store: 'HCM', location: 'B2' } as unknown as Project,
    { id: 'p2', code: 'L1-115', year: 2027, store: 'HCM', location: 'L1' } as unknown as Project,
    { id: 'p3', code: 'HN-TKV-SMZ2', year: 2027, store: 'HN', location: 'L1' } as unknown as Project,
    { id: 'p4', code: 'CP-01', year: 2027, store: 'HCM', location: 'B1' } as unknown as Project
  ];

  const mockTasks: Task[] = [
    {
      id: 't1',
      projectId: 'p1',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      name: 'Hoarding up',
      orderIndex: 0,
      taskCodePhu: 'B2-B208-1'
    } as unknown as Task,
    {
      id: 't2',
      projectId: 'p1',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      name: 'Re-instatement',
      orderIndex: 1,
      taskCodePhu: 'B2-B208-2',
      predecessor: 'B2-B208-1'
    } as unknown as Task,
    {
      id: 't3',
      projectId: 'p1',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      name: 'Handover',
      orderIndex: 2,
      taskCodePhu: 'B2-B208-3',
      predecessor: 'B2-B208-2, HN-TKV-SMZ2-85SS, L1-115'
    } as unknown as Task,
    {
      id: 't4',
      projectId: 'p3',
      projectCode: 'HN-TKV-SMZ2',
      projectYear: 2027,
      projectStore: 'HN',
      name: 'SMZ Task 85',
      orderIndex: 84,
      taskCodePhu: 'HN-TKV-SMZ2-85'
    } as unknown as Task,
    {
      id: 't5',
      projectId: 'p2',
      projectCode: 'L1-115',
      projectYear: 2027,
      projectStore: 'HCM',
      name: 'L1 Task 1',
      orderIndex: 0,
      taskCodePhu: 'L1-115#1'
    } as unknown as Task
  ];

  it('scans and converts all "-" subtask codes and predecessor references to "#"', () => {
    const res = convertAllSubtaskCodesAndPredecessorsToHash(mockTasks, mockProjects);
    expect(res.changedCount).toBe(4);

    const t1 = res.updatedTasks.find(t => t.id === 't1')!;
    expect(t1.taskCodePhu).toBe('B2-B208#1');

    const t2 = res.updatedTasks.find(t => t.id === 't2')!;
    expect(t2.taskCodePhu).toBe('B2-B208#2');
    expect(t2.predecessor).toBe('B2-B208#1');

    const t3 = res.updatedTasks.find(t => t.id === 't3')!;
    expect(t3.taskCodePhu).toBe('B2-B208#3');
    expect(t3.predecessor).toBe('B2-B208#2, HN-TKV-SMZ2#85SS, L1-115');

    const t4 = res.updatedTasks.find(t => t.id === 't4')!;
    expect(t4.taskCodePhu).toBe('HN-TKV-SMZ2#85');

    const t5 = res.updatedTasks.find(t => t.id === 't5')!;
    expect(t5.taskCodePhu).toBe('L1-115#1');
  });
});
