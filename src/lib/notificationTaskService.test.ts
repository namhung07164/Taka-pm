import { describe, it, expect } from 'vitest';
import {
  getNotificationDateRange,
  filterTasksForNotificationWindow,
} from './notificationTaskService';
import { Task } from '../types';

describe('notificationTaskService (Method 1: Local-First Notification Optimization)', () => {
  const refDate = new Date('2026-10-15T12:00:00Z');

  it('calculates correct past7 and future14 range based on reference date', () => {
    const { past7, future14 } = getNotificationDateRange(refDate);
    expect(past7).toBe('2026-10-08');
    expect(future14).toBe('2026-10-29');
  });

  const mockTasks: Task[] = [
    {
      id: 'task-overdue-recent',
      name: 'Task overdue 3 days ago',
      projectCode: 'HCM-01',
      start: '2026-10-01',
      finish: '2026-10-12',
      duration: '11',
      durationManual: false,
      finishManual: false,
      runningStatus: 'Delayed',
    },
    {
      id: 'task-due-soon',
      name: 'Task finishing in 5 days',
      projectCode: 'HCM-01',
      start: '2026-10-10',
      finish: '2026-10-20',
      duration: '10',
      durationManual: false,
      finishManual: false,
      runningStatus: 'On process',
    },
    {
      id: 'task-far-past',
      name: 'Task completed 2 months ago',
      projectCode: 'HCM-01',
      start: '2026-08-01',
      finish: '2026-08-15',
      duration: '14',
      durationManual: false,
      finishManual: false,
      runningStatus: 'Completed',
    },
    {
      id: 'task-far-future',
      name: 'Task scheduled 3 months later',
      projectCode: 'HCM-01',
      start: '2026-12-01',
      finish: '2026-12-20',
      duration: '19',
      durationManual: false,
      finishManual: false,
      runningStatus: 'Upcoming',
    },
    {
      id: 'task-deleted-in-range',
      name: 'Deleted task that would be in range',
      projectCode: 'HCM-01',
      start: '2026-10-10',
      finish: '2026-10-18',
      duration: '8',
      durationManual: false,
      finishManual: false,
      isDeleted: true,
    },
    {
      id: 'task-no-finish',
      name: 'Task without finish date',
      projectCode: 'HCM-01',
      start: '2026-10-10',
      finish: '',
      duration: '0',
      durationManual: false,
      finishManual: false,
    },
  ];

  it('filters only tasks within the -7 to +14 day window and excludes deleted tasks', () => {
    const { past7, future14 } = getNotificationDateRange(refDate);
    const result = filterTasksForNotificationWindow(mockTasks, past7, future14);

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['task-overdue-recent', 'task-due-soon']);
  });

  it('sorts matched tasks ascending by finish date', () => {
    const { past7, future14 } = getNotificationDateRange(refDate);
    const result = filterTasksForNotificationWindow(mockTasks, past7, future14);

    expect(result[0].finish).toBe('2026-10-12');
    expect(result[1].finish).toBe('2026-10-20');
  });

  it('limits result count if maxCount is specified', () => {
    const { past7, future14 } = getNotificationDateRange(refDate);
    const result = filterTasksForNotificationWindow(mockTasks, past7, future14, 1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('task-overdue-recent');
  });

  it('returns empty array when input is empty or null', () => {
    const { past7, future14 } = getNotificationDateRange(refDate);
    expect(filterTasksForNotificationWindow([], past7, future14)).toEqual([]);
    expect(filterTasksForNotificationWindow(null as any, past7, future14)).toEqual([]);
  });
});
