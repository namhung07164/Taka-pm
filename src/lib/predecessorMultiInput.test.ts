import { describe, it, expect } from 'vitest';
import { splitPredecessors, parsePredecessors, buildTaskNoMap, calculateTaskDatesFromPredecessors } from './ganttUtils';
import { Project, Task } from '../types';

describe('Predecessor Multi Input & Selection After Comma', () => {
  const projects: Project[] = [
    { id: 'p1', no: 1, code: 'B2-B208', year: 2027, store: 'HCM', location: 'B2', name: 'Project 208' },
    { id: 'p2', no: 2, code: 'B2-B207', year: 2027, store: 'HCM', location: 'B2', name: 'Project 207' }
  ];

  const tasks: Task[] = [
    {
      id: 't1',
      projectId: 'p1',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      name: 'Hoarding up',
      taskCodePhu: 'B2-B208#1',
      start: '2027-04-01T09:00',
      finish: '2027-04-02T21:00',
      duration: '1.5',
      durationManual: false,
      finishManual: false,
      orderIndex: 0
    },
    {
      id: 't2',
      projectId: 'p1',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      name: 'Handover',
      taskCodePhu: 'B2-B208#2',
      start: '2027-04-01T09:00',
      finish: '2027-04-06T21:00',
      duration: '5.5',
      durationManual: false,
      finishManual: false,
      orderIndex: 1
    },
    {
      id: 't3',
      projectId: 'p1',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      name: 'Start Kitchen - Installation',
      taskCodePhu: 'B2-B208#3',
      start: '2027-04-03T09:00',
      finish: '2027-04-06T21:00',
      duration: '3.5',
      durationManual: false,
      finishManual: false,
      orderIndex: 2
    }
  ];

  it('splits predecessor with hash and multiple tokens accurately', () => {
    const taskNoMap = buildTaskNoMap(projects, tasks);
    const tokens = splitPredecessors('B2-B208#1, B2-B208#3FF', taskNoMap);
    expect(tokens).toEqual(['B2-B208#1', 'B2-B208#3FF']);
  });

  it('parses second predecessor with FF relationship and calculates dates correctly', () => {
    const taskNoMap = buildTaskNoMap(projects, tasks);
    const contextTask: Task = {
      id: 't2',
      projectId: 'p1',
      projectCode: 'B2-B208',
      projectYear: 2027,
      projectStore: 'HCM',
      name: 'Handover',
      start: '2027-04-01T09:00',
      finish: '2027-04-06T21:00',
      duration: '5.5',
      durationManual: false,
      finishManual: false
    };

    const parsed = parsePredecessors('B2-B208#1, B2-B208#3FF', taskNoMap, contextTask);
    expect(parsed.length).toBe(2);
    expect(parsed[0]?.task?.id).toBe('t1');
    expect(parsed[0]?.type).toBe('FS');
    expect(parsed[1]?.task?.id).toBe('t3');
    expect(parsed[1]?.type).toBe('FF');

    const calculated = calculateTaskDatesFromPredecessors(contextTask, parsed);
    expect(calculated).not.toBeNull();
    // Start should be driven by t1 (FS) finish: 2027-04-02T21:00
    // Finish should be driven by t3 (FF) finish: 2027-04-06T21:00
    expect(calculated?.start).toBe('2027-04-02T21:00');
    expect(calculated?.finish).toBe('2027-04-06T21:00');
  });
});
