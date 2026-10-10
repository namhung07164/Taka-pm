import { describe, it, expect } from 'vitest';
import {
  resolveActualStatus,
  getSubTaskProgressScore,
  getActStatusPercent,
  computeDelegationGroupProgressPercent,
  computeActProgressPercent,
} from './utils';
import { Task, DelegationGroup, DelegationSubTask } from '../types';

describe('Kiểm thử Logic Tính toán % và Phân loại Act Status (Actual Status & Progress)', () => {
  describe('getActStatusPercent', () => {
    it('trả về đúng 100% cho trạng thái Completed và Approved', () => {
      expect(getActStatusPercent('Completed')).toBe(100);
      expect(getActStatusPercent('approved')).toBe(100);
      expect(getActStatusPercent('Finished')).toBe(100);
    });

    it('trả về đúng 80% cho trạng thái Pending Approval và ReqApproval', () => {
      expect(getActStatusPercent('Pending Approval')).toBe(80);
      expect(getActStatusPercent('Pending Completed')).toBe(80);
      expect(getActStatusPercent('ReqApproval')).toBe(80);
      expect(getActStatusPercent('Review Late')).toBe(80);
    });

    it('trả về đúng 50% cho trạng thái Accepted, On process và In Progress', () => {
      expect(getActStatusPercent('Accepted')).toBe(50);
      expect(getActStatusPercent('On process')).toBe(50);
      expect(getActStatusPercent('In Progress')).toBe(50);
      expect(getActStatusPercent('Delayed')).toBe(50);
    });

    it('trả về đúng 30% cho trạng thái Correction Needed và Rejected', () => {
      expect(getActStatusPercent('Correction Needed')).toBe(30);
      expect(getActStatusPercent('Needs Rework')).toBe(30);
      expect(getActStatusPercent('Rejected')).toBe(30);
    });

    it('trả về đúng 0% cho trạng thái Planned, Assigned và Critical Delay', () => {
      expect(getActStatusPercent('Planned')).toBe(0);
      expect(getActStatusPercent('Assigned')).toBe(0);
      expect(getActStatusPercent('Upcoming')).toBe(0);
      expect(getActStatusPercent('Critical Delay')).toBe(0);
      expect(getActStatusPercent('Cancel')).toBe(0);
    });
  });

  describe('getSubTaskProgressScore', () => {
    it('tính đúng điểm số hoàn thành cho từng trạng thái subTask', () => {
      expect(getSubTaskProgressScore({ delegationStatus: 'Completed' })).toBe(1.0);
      expect(getSubTaskProgressScore({ status: 'Approved' })).toBe(1.0);
      expect(getSubTaskProgressScore({ approvalStatus: 'ReqApproval', delegationStatus: 'Pending completed' })).toBe(0.8);
      expect(getSubTaskProgressScore({ delegationStatus: 'Accepted' })).toBe(0.5);
      expect(getSubTaskProgressScore({ status: 'On process' })).toBe(0.5);
      expect(getSubTaskProgressScore({ delegationStatus: 'Rejected' })).toBe(0.3);
      expect(getSubTaskProgressScore({ delegationStatus: 'Assigned' })).toBe(0.0);
      expect(getSubTaskProgressScore({})).toBe(0.0);
    });
  });

  describe('resolveActualStatus', () => {
    it('nhận diện chính xác subtask Accepted là In Progress khi plan là Upcoming', () => {
      const subTasks: Partial<DelegationSubTask>[] = [
        { id: 'st1', delegationStatus: 'Accepted', status: 'On process' }
      ];
      const res = resolveActualStatus('Upcoming', subTasks);
      expect(res.label).toBe('In Progress');
    });

    it('nhận diện subtask Accepted khi plan đã Completed là Delayed (không bị gán nhầm Critical Delay)', () => {
      const subTasks: Partial<DelegationSubTask>[] = [
        { id: 'st1', delegationStatus: 'Accepted', status: 'On process' }
      ];
      const res = resolveActualStatus('Completed', subTasks);
      expect(res.label).toBe('Delayed');
    });

    it('nhận diện đúng Critical Delay khi subtask chỉ mới Assigned và plan đã Completed', () => {
      const subTasks: Partial<DelegationSubTask>[] = [
        { id: 'st1', delegationStatus: 'Assigned', status: 'Assigned' }
      ];
      const res = resolveActualStatus('Completed', subTasks);
      expect(res.label).toBe('Critical Delay');
    });

    it('nhận diện đúng Completed khi toàn bộ subtask hoàn thành', () => {
      const subTasks: Partial<DelegationSubTask>[] = [
        { id: 'st1', delegationStatus: 'Completed', status: 'Completed' },
        { id: 'st2', delegationStatus: 'Approved', status: 'Approved' }
      ];
      const res = resolveActualStatus('On process', subTasks);
      expect(res.label).toBe('Completed');
    });

    it('nhận diện đúng task không có delegation nhưng có runningStatus Completed', () => {
      const task: Partial<Task> = { runningStatus: 'Completed' };
      const res = resolveActualStatus('Upcoming', [], task);
      expect(res.label).toBe('Completed');
    });
  });

  describe('computeDelegationGroupProgressPercent & computeActProgressPercent', () => {
    it('tính đúng tiến độ % nhóm ủy quyền với các subtask có trạng thái khác nhau', () => {
      const group: Partial<DelegationGroup> = {
        id: 'g1',
        name: 'Group 1',
        subTasks: [
          { id: 'st1', delegationStatus: 'Completed', status: 'Completed', name: 'Sub 1', party: 'A', updatedAt: '' } as DelegationSubTask,
          { id: 'st2', delegationStatus: 'Accepted', status: 'On process', name: 'Sub 2', party: 'B', updatedAt: '' } as DelegationSubTask,
        ],
        updatedAt: '',
      };
      // (1.0 + 0.5) / 2 = 0.75 -> 75%
      const pct = computeDelegationGroupProgressPercent(group as DelegationGroup);
      expect(pct).toBe(75);
    });

    it('tính đúng computeActProgressPercent của dự án khi có task ủy quyền và task thường', () => {
      const tasks: Task[] = [
        {
          id: 't1',
          projectCode: 'P1',
          name: 'Task 1 (Có delegation)',
          start: '2026-03-01',
          finish: '2026-03-10',
          duration: '10',
          durationManual: false,
          finishManual: false,
        },
        {
          id: 't2',
          projectCode: 'P1',
          name: 'Task 2 (Thuần túy hoàn thành)',
          start: '2026-03-05',
          finish: '2026-03-15',
          duration: '10',
          durationManual: false,
          finishManual: false,
          runningStatus: 'Completed',
        },
      ];

      const groups: DelegationGroup[] = [
        {
          id: 'g1',
          parentTaskId: 't1',
          name: 'Group for t1',
          subTasks: [
            { id: 'st1', delegationStatus: 'Accepted', status: 'On process', name: 'Sub 1', party: 'A', updatedAt: '' } as DelegationSubTask,
          ],
          updatedAt: '',
        },
      ];

      // t1 có subtask Accepted -> 50%
      // t2 runningStatus Completed -> 100%
      // Trung bình: (0.5 + 1.0) / 2 = 0.75 -> 75%
      const actPercent = computeActProgressPercent(tasks, groups);
      expect(actPercent).toBe(75);
    });
  });
});
