import { describe, it, expect } from 'vitest';
import { calculateProjectComputedDates } from './projectDatesService';
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

  it('fallback về ngày start và opening của project khi không có tasks', () => {
    const project: Partial<Project> = {
      code: 'PRJ-EMPTY',
      start: '2026-05-01',
      opening: '2026-06-01',
    };

    const result = calculateProjectComputedDates(project, []);
    expect(result.computedTakStart).toBe('2026-05-01');
    expect(result.computedTakCompl).toBe('');
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
});
