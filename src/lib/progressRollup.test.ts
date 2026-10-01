import { describe, it, expect } from 'vitest';
import {
  computePlanProgressPercent,
  computeActProgressPercent,
  calculateDays,
  getTaskStatus
} from './utils';
import {
  calculateProjectComputedDates,
  matchProjectCode,
  getTasksForProject
} from './projectDatesService';
import { Project, Task, DelegationGroup } from '../types';

describe('1. Tính toán Tỷ lệ Tiến độ Kế hoạch (computePlanProgressPercent)', () => {
  it('trả về 0% khi danh sách công việc rỗng', () => {
    expect(computePlanProgressPercent([])).toBe(0);
  });

  it('trả về 100% khi toàn bộ công việc đã kết thúc trong quá khứ', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'P1',
        name: 'Khảo sát',
        start: '2020-01-01',
        finish: '2020-01-10',
        duration: '9',
        durationManual: false,
        finishManual: false
      },
      {
        id: 't2',
        projectCode: 'P1',
        name: 'Thi công',
        start: '2020-01-11',
        finish: '2020-01-20',
        duration: '9',
        durationManual: false,
        finishManual: false
      }
    ];
    expect(computePlanProgressPercent(tasks)).toBe(100);
  });

  it('trả về 0% khi toàn bộ công việc đều nằm trong tương lai', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'P1',
        name: 'Kế hoạch tương lai 1',
        start: '2099-01-01',
        finish: '2099-01-10',
        duration: '9',
        durationManual: false,
        finishManual: false
      },
      {
        id: 't2',
        projectCode: 'P1',
        name: 'Kế hoạch tương lai 2',
        start: '2099-02-01',
        finish: '2099-02-15',
        duration: '14',
        durationManual: false,
        finishManual: false
      }
    ];
    expect(computePlanProgressPercent(tasks)).toBe(0);
  });

  it('nội suy tỷ lệ phần trăm chính xác cho công việc đang diễn ra hôm nay', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - 5);

    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 5);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'P1',
        name: 'Đang diễn ra (50% thời gian trôi qua)',
        start: fmt(pastDate),
        finish: fmt(futureDate),
        duration: '10',
        durationManual: false,
        finishManual: false
      }
    ];

    const percent = computePlanProgressPercent(tasks);
    // 5 ngày trôi qua trên tổng 10 ngày = 50%
    expect(percent).toBe(50);
  });

  it('tính toán chính xác tổ hợp hỗn hợp: 1 công việc xong (100%), 1 công việc tương lai (0%) -> trung bình 50%', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'P1',
        name: 'Đã xong trong quá khứ',
        start: '2020-01-01',
        finish: '2020-01-10',
        duration: '9',
        durationManual: false,
        finishManual: false
      },
      {
        id: 't2',
        projectCode: 'P1',
        name: 'Chưa bắt đầu trong tương lai',
        start: '2099-01-01',
        finish: '2099-01-10',
        duration: '9',
        durationManual: false,
        finishManual: false
      }
    ];
    expect(computePlanProgressPercent(tasks)).toBe(50);
  });

  it('xử lý an toàn khi công việc có start và finish cùng một ngày', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'P1',
        name: 'Milestone cùng ngày trong quá khứ',
        start: '2020-05-01',
        finish: '2020-05-01',
        duration: '0',
        durationManual: false,
        finishManual: false
      }
    ];
    expect(computePlanProgressPercent(tasks)).toBe(100);
  });
});

describe('2. Tính toán Tỷ lệ Tiến độ Thực tế (computeActProgressPercent)', () => {
  it('trả về 0% khi danh sách công việc rỗng', () => {
    expect(computeActProgressPercent([], [])).toBe(0);
  });

  it('tính đúng 100% khi tất cả các task đều có trạng thái hoàn thành trực tiếp', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'P1',
        name: 'Task 1',
        start: '2026-01-01',
        finish: '2026-01-10',
        duration: '9',
        durationManual: false,
        finishManual: false
      },
      {
        id: 't2',
        projectCode: 'P1',
        name: 'Task 2',
        start: '2026-01-11',
        finish: '2026-01-20',
        duration: '9',
        durationManual: false,
        finishManual: false
      }
    ];

    const delegationGroups: DelegationGroup[] = [
      {
        id: 'dg1',
        parentTaskId: 't1',
        subTasks: [
          { id: 'st1', name: 'Sub 1', status: 'Completed' }
        ]
      } as any,
      {
        id: 'dg2',
        parentTaskId: 't2',
        subTasks: [
          { id: 'st2', name: 'Sub 2', status: 'Completed' }
        ]
      } as any
    ];

    expect(computeActProgressPercent(tasks, delegationGroups)).toBe(100);
  });

  it('tính trọng số 0.33 cho công việc In Progress và 0.66 cho Pending Approval', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'P1',
        name: 'Task In Progress',
        start: '2020-01-01',
        finish: '2099-01-01',
        duration: '100',
        durationManual: false,
        finishManual: false
      },
      {
        id: 't2',
        projectCode: 'P1',
        name: 'Task Pending Approval',
        start: '2020-01-01',
        finish: '2099-01-01',
        duration: '100',
        durationManual: false,
        finishManual: false
      }
    ];

    const delegationGroups: DelegationGroup[] = [
      {
        id: 'dg1',
        parentTaskId: 't1',
        subTasks: [
          { id: 'st1', name: 'Sub 1', status: 'In Progress' }
        ]
      } as any,
      {
        id: 'dg2',
        parentTaskId: 't2',
        subTasks: [
          { id: 'st2', name: 'Sub 2', status: 'waiting for approval' }
        ]
      } as any
    ];

    const result = computeActProgressPercent(tasks, delegationGroups);
    // (0.33 + 0.66) / 2 = 0.99 / 2 = 49.5% -> round 50%
    expect(result).toBe(50);
  });

  it('hỗ trợ cấu trúc delegationGroups truyền vào dưới dạng Map<string, DelegationGroup>', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        projectCode: 'P1',
        name: 'Task Map',
        start: '2026-01-01',
        finish: '2026-01-10',
        duration: '9',
        durationManual: false,
        finishManual: false
      }
    ];

    const map = new Map<string, DelegationGroup>();
    map.set('t1', {
      id: 'dg1',
      parentTaskId: 't1',
      subTasks: [{ id: 'st1', name: 'Sub', status: 'Completed' }]
    } as any);

    expect(computeActProgressPercent(tasks, map)).toBe(100);
  });
});

describe('3. Tính toán Khoảng thời gian & Trạng thái Công việc (calculateDays & getTaskStatus)', () => {
  it('calculateDays tính chính xác số ngày giữa Start và Finish', () => {
    expect(calculateDays('2026-03-01', '2026-03-11')).toBe('10 days');
    expect(calculateDays('2026-03-01', '2026-03-01')).toBe('0 days');
    expect(calculateDays(undefined, '2026-03-10')).toBe('');
    expect(calculateDays('2026-03-10', undefined)).toBe('');
  });

  it('calculateDays trả về 0 days nếu ngày Finish nhỏ hơn ngày Start (ngăn giá trị âm)', () => {
    expect(calculateDays('2026-03-15', '2026-03-10')).toBe('0 days');
  });

  it('getTaskStatus phân loại chuẩn Upcoming, Completed, On process', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pastStart = new Date(today);
    pastStart.setDate(today.getDate() - 20);
    const pastFinish = new Date(today);
    pastFinish.setDate(today.getDate() - 10);

    const futureStart = new Date(today);
    futureStart.setDate(today.getDate() + 10);
    const futureFinish = new Date(today);
    futureFinish.setDate(today.getDate() + 20);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    // Quá khứ hoàn toàn -> Completed
    expect(getTaskStatus(fmt(pastStart), fmt(pastFinish))).toBe('Completed');

    // Tương lai hoàn toàn -> Upcoming
    expect(getTaskStatus(fmt(futureStart), fmt(futureFinish))).toBe('Upcoming');

    // Đang diễn ra (start trong quá khứ, finish trong tương lai) -> On process
    expect(getTaskStatus(fmt(pastStart), fmt(futureFinish))).toBe('On process');

    // Không có ngày -> Upcoming fallback
    expect(getTaskStatus(undefined, undefined)).toBe('Upcoming');
  });
});

describe('4. In-Memory Computed Rollup & Tự Động Tính Mốc Ngày Dự Án (Rule 9)', () => {
  it('tính đúng computedTakStart (sớm nhất) và computedTakCompl (muộn nhất) từ cây tasks con', () => {
    const project: Partial<Project> = {
      code: 'PRJ-TEST-ROLLUP',
      start: '2026-05-10',
      handover: '2026-05-20',
      opening: '2026-06-01'
    };

    const tasks: Task[] = [
      { id: '1', projectCode: 'PRJ-TEST-ROLLUP', name: 'Task Early', start: '2026-05-01', finish: '2026-05-15', duration: '14', durationManual: false, finishManual: false },
      { id: '2', projectCode: 'PRJ-TEST-ROLLUP', name: 'Task Late', start: '2026-05-16', finish: '2026-05-30', duration: '14', durationManual: false, finishManual: false },
      { id: '3', projectCode: 'PRJ-TEST-ROLLUP', name: 'Task Middle', start: '2026-05-05', finish: '2026-05-25', duration: '20', durationManual: false, finishManual: false }
    ];

    const computed = calculateProjectComputedDates(project, tasks);
    expect(computed.computedTakStart).toBe('2026-05-01');
    expect(computed.computedTakCompl).toBe('2026-05-30');
    expect(computed.taskCount).toBe(3);
    expect(computed.taskSummaries?.length).toBe(3);
  });

  it('tự động nhận diện mốc Opening từ task con có chứa từ khóa opening/open', () => {
    const project: Partial<Project> = {
      code: 'PRJ-STORE-01',
      start: '2026-06-01',
      opening: '2026-07-01'
    };

    const tasks: Task[] = [
      { id: '1', projectCode: 'PRJ-STORE-01', name: 'Fit out works', start: '2026-06-01', finish: '2026-06-25', duration: '24', durationManual: false, finishManual: false },
      { id: '2', projectCode: 'PRJ-STORE-01', name: 'Grand Opening Day Ceremony', start: '2026-06-26', finish: '2026-06-28', duration: '2', durationManual: false, finishManual: false }
    ];

    const computed = calculateProjectComputedDates(project, tasks);
    // Nhận diện finish của task Grand Opening Day
    expect(computed.computedOpening).toBe('2026-06-28');
  });

  it('fallback về thông tin project khi không có tasks con', () => {
    const project: Partial<Project> = {
      code: 'PRJ-NO-TASKS',
      start: '2026-08-01',
      handover: '2026-08-20',
      opening: '2026-09-01',
      taskCount: 0
    };

    const computed = calculateProjectComputedDates(project, []);
    expect(computed.computedTakStart).toBe('2026-08-01');
    expect(computed.computedTakCompl).toBe('2026-08-20');
    expect(computed.computedOpening).toBe('2026-09-01');
    expect(computed.taskCount).toBe(0);
  });

  it('trích xuất đúng danh sách Task cho Project theo Store, Year và Multi-code (getTasksForProject)', () => {
    const project: Partial<Project> = {
      code: 'L1-01',
      linkCodes: 'L1-01-A, L1-01-B',
      store: 'HCM',
      year: '2026'
    };

    const allTasks: Task[] = [
      // Khớp code chính
      { id: 't1', projectCode: 'L1-01', projectStore: 'HCM', projectYear: '2026', name: 'Khớp 1', start: '2026-01-01', finish: '2026-01-10', duration: '9', durationManual: false, finishManual: false },
      // Khớp link code
      { id: 't2', projectCode: 'L1-01-A', projectStore: 'HCM', projectYear: '2026', name: 'Khớp 2', start: '2026-01-01', finish: '2026-01-10', duration: '9', durationManual: false, finishManual: false },
      // Khác store -> loại bỏ
      { id: 't3', projectCode: 'L1-01', projectStore: 'HN', projectYear: '2026', name: 'Khác store', start: '2026-01-01', finish: '2026-01-10', duration: '9', durationManual: false, finishManual: false },
      // Khác year -> loại bỏ
      { id: 't4', projectCode: 'L1-01', projectStore: 'HCM', projectYear: '2027', name: 'Khác year', start: '2026-01-01', finish: '2026-01-10', duration: '9', durationManual: false, finishManual: false },
      // Khác hẳn projectCode -> loại bỏ
      { id: 't5', projectCode: 'L2-99', projectStore: 'HCM', projectYear: '2026', name: 'Khác code', start: '2026-01-01', finish: '2026-01-10', duration: '9', durationManual: false, finishManual: false }
    ];

    const matched = getTasksForProject(project, allTasks);
    expect(matched.length).toBe(2);
    expect(matched.map(m => m.id)).toEqual(['t1', 't2']);
  });

  it('matchProjectCode xử lý chính xác nhiều mã, dấu phân tách và chữ hoa thường', () => {
    expect(matchProjectCode('L1-01', 'L1-01')).toBe(true);
    expect(matchProjectCode('l1-01', 'L1-01')).toBe(true);
    expect(matchProjectCode('L1-01, L1-02', 'L1-02')).toBe(true);
    expect(matchProjectCode('L1-01; L1-02', 'L1-01')).toBe(true);
    expect(matchProjectCode('L1-01', 'L2-01')).toBe(false);
    expect(matchProjectCode('', 'L1-01')).toBe(false);
    expect(matchProjectCode(undefined, undefined)).toBe(false);
  });
});
