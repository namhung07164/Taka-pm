import { describe, it, expect } from 'vitest';
import { calculateProjectComputedDates, matchProjectCode, getTasksForProject } from './projectDatesService';
import { Project, Task } from '../types';

describe('Kiểm thử tính toán Pre-computed Dates của Project (calculateProjectComputedDates)', () => {
  it('tính đúng computedTakStart từ ngày start sớm nhất và computedTakCompl từ ngày finish muộn nhất', () => {
    const project: Partial<Project> = {
      code: 'PRJ-2026-HCM-01',
      start: '2026-03-01',
      handover: '2026-03-30',
      opening: '2026-04-01',
    };

    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'PRJ-2026-HCM-01',
        name: 'Thi công thô',
        start: '2026-03-05',
        finish: '2026-03-15',
        duration: '10',
        durationManual: false,
        finishManual: false,
      },
      {
        id: 't2',
        projectCode: 'PRJ-2026-HCM-01',
        name: 'Hoàn thiện nội thất',
        start: '2026-03-02',
        finish: '2026-03-25',
        duration: '23',
        durationManual: false,
        finishManual: false,
      },
      {
        id: 't3',
        projectCode: 'PRJ-2026-HCM-01',
        name: 'Lễ Khai Trương (Opening Event)',
        start: '2026-03-26',
        finish: '2026-03-28',
        duration: '2',
        durationManual: false,
        finishManual: false,
      },
    ];

    const result = calculateProjectComputedDates(project, tasks);
    expect(result.computedTakStart).toBe('2026-03-02');
    expect(result.computedTakCompl).toBe('2026-03-28');
    expect(result.computedOpening).toBe('2026-03-28');
  });

  it('fallback về ngày start, handover và opening của project khi không có tasks', () => {
    const project: Partial<Project> = {
      code: 'PRJ-EMPTY',
      start: '2026-05-01',
      handover: '2026-05-25',
      opening: '2026-06-01',
    };

    const result = calculateProjectComputedDates(project, []);
    expect(result.computedTakStart).toBe('2026-05-01');
    expect(result.computedTakCompl).toBe('2026-05-25');
    expect(result.computedOpening).toBe('2026-06-01');
  });

  it('fallback opening về project.opening nếu không có task nào chứa từ khóa opening/open', () => {
    const project: Partial<Project> = {
      code: 'PRJ-NO-OPEN',
      start: '2026-01-01',
      opening: '2026-02-15',
    };

    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'PRJ-NO-OPEN',
        name: 'Khảo sát hiện trạng',
        start: '2026-01-05',
        finish: '2026-01-10',
        duration: '5',
        durationManual: false,
        finishManual: false,
      },
    ];

    const result = calculateProjectComputedDates(project, tasks);
    expect(result.computedTakStart).toBe('2026-01-05');
    expect(result.computedTakCompl).toBe('2026-01-10');
    expect(result.computedOpening).toBe('2026-02-15');
  });

  it('hỗ trợ tìm task chính xác cho dự án multi-code (ví dụ: L3-333-2, L3-333-3)', () => {
    expect(matchProjectCode('L3-333-2, L3-333-3', 'L3-333-2')).toBe(true);
    expect(matchProjectCode('L3-333-2', 'L3-333-2, L3-333-3')).toBe(true);
    expect(matchProjectCode('L3-333-1', 'L3-333-2, L3-333-3')).toBe(false);

    const project: Partial<Project> = {
      code: 'L3-333-2, L3-333-3',
      year: 2026,
      store: 'HCM',
      start: '2026-01-01',
      handover: '2026-01-30',
    };

    const allTasks: Task[] = [
      {
        id: 'task-1',
        projectCode: 'L3-333-2',
        projectYear: 2026,
        projectStore: 'HCM',
        name: 'Task of Code 2',
        start: '2026-02-01',
        finish: '2026-02-15',
        duration: '14',
        durationManual: false,
        finishManual: false,
      },
      {
        id: 'task-2',
        projectCode: 'L3-333-3',
        projectYear: 2026,
        projectStore: 'HCM',
        name: 'Task of Code 3',
        start: '2026-02-10',
        finish: '2026-02-28',
        duration: '18',
        durationManual: false,
        finishManual: false,
      },
      {
        id: 'task-other',
        projectCode: 'L3-999-9',
        projectYear: 2026,
        projectStore: 'HCM',
        name: 'Other Task',
        start: '2026-03-01',
        finish: '2026-03-10',
        duration: '9',
        durationManual: false,
        finishManual: false,
      }
    ];

    const projectTasks = getTasksForProject(project, allTasks);
    expect(projectTasks.length).toBe(2);
    expect(projectTasks.map(t => t.id)).toEqual(['task-1', 'task-2']);

    const computed = calculateProjectComputedDates(project, projectTasks);
    expect(computed.computedTakStart).toBe('2026-02-01');
    expect(computed.computedTakCompl).toBe('2026-02-28');
  });
});
