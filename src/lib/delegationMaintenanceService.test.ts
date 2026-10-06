import { describe, it, expect } from 'vitest';
import { isEmptyDelegationGroup } from './delegationMaintenanceService';
import { DelegationGroup } from '../types';

describe('delegationMaintenanceService - isEmptyDelegationGroup', () => {
  it('returns true for group with no subtasks or empty array', () => {
    const group: DelegationGroup = {
      id: 'del_1',
      name: 'Delegated Task',
      subTasks: [],
      updatedAt: '2026-01-01',
    };
    expect(isEmptyDelegationGroup(group)).toBe(true);
  });

  it('returns true for auto-generated import placeholder with blank subtask', () => {
    const group: DelegationGroup = {
      id: 'del_2',
      parentTaskId: 'task_123',
      name: 'Delegated Task',
      projectCode: 'HCM_01',
      projectYear: 2027,
      subTasks: [
        {
          id: 'sub_1',
          name: '',
          comments: '',
          status: 'Assigned',
          party: 'CP (Hung)',
          updatedAt: '2026-01-01',
        },
      ],
      updatedAt: '2026-01-01',
    };
    expect(isEmptyDelegationGroup(group)).toBe(true);
  });

  it('returns false if subtask has custom name', () => {
    const group: DelegationGroup = {
      id: 'del_3',
      name: 'Delegated Task',
      subTasks: [
        {
          id: 'sub_1',
          name: 'Lắp đặt hệ thống HVAC',
          comments: '',
          status: 'Assigned',
          party: 'CP',
          updatedAt: '2026-01-01',
        },
      ],
      updatedAt: '2026-01-01',
    };
    expect(isEmptyDelegationGroup(group)).toBe(false);
  });

  it('returns false if subtask has comments', () => {
    const group: DelegationGroup = {
      id: 'del_4',
      name: 'Delegated Task',
      subTasks: [
        {
          id: 'sub_1',
          name: '',
          comments: 'Đang đợi kiểm định từ ban quản lý',
          status: 'Assigned',
          party: 'CP',
          updatedAt: '2026-01-01',
        },
      ],
      updatedAt: '2026-01-01',
    };
    expect(isEmptyDelegationGroup(group)).toBe(false);
  });

  it('returns false if subtask has non-default status (e.g. Completed or In Progress)', () => {
    const group: DelegationGroup = {
      id: 'del_5',
      name: 'Delegated Task',
      subTasks: [
        {
          id: 'sub_1',
          name: '',
          comments: '',
          status: 'Completed',
          party: 'CP',
          updatedAt: '2026-01-01',
        },
      ],
      updatedAt: '2026-01-01',
    };
    expect(isEmptyDelegationGroup(group)).toBe(false);
  });

  it('returns false if subtask has attachments or file url', () => {
    const group: DelegationGroup = {
      id: 'del_6',
      name: 'Delegated Task',
      subTasks: [
        {
          id: 'sub_1',
          name: '',
          comments: '',
          status: 'Assigned',
          party: 'CP',
          fileUrl: 'https://r2.cloudflare.com/files/report.pdf',
          updatedAt: '2026-01-01',
        },
      ],
      updatedAt: '2026-01-01',
    };
    expect(isEmptyDelegationGroup(group)).toBe(false);
  });

  it('returns false if group has multiple subtasks', () => {
    const group: DelegationGroup = {
      id: 'del_7',
      name: 'Delegated Task',
      subTasks: [
        { id: 'sub_1', comments: '', status: 'Assigned', party: 'CP', updatedAt: '2026-01-01' },
        { id: 'sub_2', comments: '', status: 'Assigned', party: 'CP', updatedAt: '2026-01-01' },
      ],
      updatedAt: '2026-01-01',
    };
    expect(isEmptyDelegationGroup(group)).toBe(false);
  });
});
