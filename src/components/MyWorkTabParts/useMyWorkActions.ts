import { useCallback } from 'react';
import { AppUser, Project, Task } from '../../types';
import { MyWorkKanbanColumnId, UnifiedWorkItem } from './myWorkTypes';
import {
  mutateDelegationSubTaskUnified,
  mutateTaskStatusUnified,
  resolveRealTaskForWorkItem,
} from './myWorkMutationService';

interface UseMyWorkActionsParams {
  currentUser: AppUser;
  setToast: (toast: { title: string; message: string; type: 'info' | 'success' | 'warning' | 'error' } | null) => void;
  setEditingTask: (task: Task | null) => void;
  setEditingProject: (project: Project | null) => void;
  setIsTaskModalOpen: (open: boolean) => void;
  setIsProjectModalOpen: (open: boolean) => void;
  setModalInitialTab: (tab: 'details' | 'chat') => void;
  setIsReadOnlyModal: (readOnly: boolean) => void;
}

export function useMyWorkActions({
  currentUser,
  setToast,
  setEditingTask,
  setEditingProject,
  setIsTaskModalOpen,
  setIsProjectModalOpen,
  setModalInitialTab,
  setIsReadOnlyModal,
}: UseMyWorkActionsParams) {
  const handleToggleTaskComplete = useCallback(
    async (item: UnifiedWorkItem) => {
      if (!item.canEdit) {
        setToast({
          title: 'Permission Denied',
          message: 'You do not have write permission for this item or it belongs to an archived year.',
          type: 'warning',
        });
        return;
      }
      const nextCompleted = !item.isCompleted;
      const todayIso = new Date().toISOString().substring(0, 10);
      await mutateTaskStatusUnified(
        item,
        {
          runningStatus: nextCompleted ? 'Completed' : 'On process',
          ...(nextCompleted && !item.dueDateStr ? { finish: todayIso } : {}),
        },
        {
          title: nextCompleted ? 'Item Completed' : 'Item Reopened',
          message: `"${item.title}" moved to ${nextCompleted ? 'Completed' : 'In Progress'}.`,
          type: 'success',
        }
      );
    },
    [setToast]
  );

  const handleAcceptItem = useCallback(
    async (item: UnifiedWorkItem) => {
      if (!item.canAccept) return;
      const todayStr = new Date().toISOString().substring(0, 10);
      if (item.type === 'delegation_subtask') {
        await mutateDelegationSubTaskUnified(
          item,
          {
            approvalStatus: 'AcceptTask',
            status: 'On process',
            delegationStatus: 'On process',
            startAct: item.rawSubTask?.startAct || todayStr,
            approvedAt: null,
          },
          currentUser.id,
          'Delegation Accepted (50%)',
          `"${item.title}" moved to In Progress.`
        );
      } else {
        await mutateTaskStatusUnified(
          item,
          { runningStatus: 'On process', start: item.startDateStr || todayStr },
          { title: 'Task Started', message: `"${item.title}" moved to In Progress.`, type: 'info' }
        );
      }
    },
    [currentUser?.id]
  );

  // 1-Click PIC Submit for Approval (Pending completed 85%)
  const handleReportSubTaskComplete = useCallback(
    (item: UnifiedWorkItem) => {
      if (!item.canSubmitApproval) return;
      const todayStr = new Date().toISOString().substring(0, 10);
      mutateDelegationSubTaskUnified(
        item,
        {
          status: 'Pending completed',
          delegationStatus: 'Pending completed',
          approvalStatus: 'Requested',
          finishAct: item.rawSubTask?.finishAct || todayStr,
          approvedAt: null,
        },
        currentUser.id,
        'Requested Approval (85%)',
        `"${item.title}" moved to Pending Approval.`
      ).catch((err) => console.error('[MyWorkTab] handleReportSubTaskComplete error:', err));
    },
    [currentUser?.id]
  );

  const handleApproveItem = useCallback(
    async (item: UnifiedWorkItem) => {
      if (!item.canApproveOrReject) {
        setToast({
          title: 'Approver Permission Required',
          message: 'Only the Delegation Creator or Admin can approve this item.',
          type: 'warning',
        });
        return;
      }
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.substring(0, 10);
      if (item.type === 'delegation_subtask') {
        await mutateDelegationSubTaskUnified(
          item,
          { status: 'Approved', delegationStatus: 'Completed', approvalStatus: 'Approved', finishAct: todayStr, approvedAt: nowIso },
          currentUser.id,
          'Approved (100%)',
          `"${item.title}" has been approved and moved to Completed.`
        );
      } else {
        await mutateTaskStatusUnified(
          item,
          { approval: 'Approved', approvedAt: nowIso, runningStatus: 'Completed', finish: item.dueDateStr || todayStr },
          { title: 'Task Approved', message: `"${item.title}" approved and moved to Completed.`, type: 'success' }
        );
      }
    },
    [currentUser?.id, setToast]
  );

  const handleReworkItem = useCallback(
    async (item: UnifiedWorkItem) => {
      if (!item.canApproveOrReject) {
        setToast({
          title: 'Approver Permission Required',
          message: 'Only the Delegation Creator or Admin can return this item for rework.',
          type: 'warning',
        });
        return;
      }
      if (item.type === 'delegation_subtask') {
        await mutateDelegationSubTaskUnified(
          item,
          { status: 'Needs Rework', delegationStatus: 'Needs Rework', approvalStatus: 'ReqReview', approvedAt: null },
          currentUser.id,
          'Returned for Rework (25%)',
          `"${item.title}" marked as Needs Rework.`,
          'warning'
        );
      } else {
        await mutateTaskStatusUnified(
          item,
          { approval: 'Rejected', runningStatus: 'On process' },
          { title: 'Returned for Rework', message: `"${item.title}" returned to PIC for rework.`, type: 'warning' }
        );
      }
    },
    [currentUser?.id, setToast]
  );

  // Kanban Column Drag & Drop Handler (Enforces RBAC & Delegation State Machine)
  const handleMoveItemToColumn = useCallback(
    async (item: UnifiedWorkItem, targetCol: MyWorkKanbanColumnId) => {
      if (item.type === 'delegation_subtask') {
        if (targetCol === 'in_progress' && item.canEdit) {
          await handleAcceptItem({ ...item, canAccept: true });
        } else if (targetCol === 'pending_approval' && item.canEdit) {
          handleReportSubTaskComplete({ ...item, canSubmitApproval: true });
        } else if (targetCol === 'done') {
          if (item.isCreator) {
            await handleApproveItem({ ...item, canApproveOrReject: true });
          } else {
            handleReportSubTaskComplete({ ...item, canSubmitApproval: true });
          }
        } else if (targetCol === 'todo' && item.isCreator) {
          await handleReworkItem({ ...item, canApproveOrReject: true });
        }
      } else if ((item.type === 'task' || item.type === 'project_milestone') && item.canEdit) {
        const todayIso = new Date().toISOString().substring(0, 10);
        if (targetCol === 'done') {
          await mutateTaskStatusUnified(
            item,
            { runningStatus: 'Completed', finish: item.dueDateStr || todayIso },
            { title: 'Item Completed', message: `"${item.title}" moved to Completed.`, type: 'success' }
          );
        } else if (targetCol === 'pending_approval') {
          await mutateTaskStatusUnified(
            item,
            { approval: 'ReqApproval', runningStatus: 'On process' },
            { title: 'Submitted for Approval', message: `"${item.title}" moved to Pending Approval.`, type: 'info' }
          );
        } else if (targetCol === 'in_progress') {
          await mutateTaskStatusUnified(
            item,
            { runningStatus: 'On process' },
            { title: 'Item In Progress', message: `"${item.title}" moved to In Progress.`, type: 'info' }
          );
        } else {
          await mutateTaskStatusUnified(
            item,
            { runningStatus: 'Upcoming' },
            { title: 'Moved to To Do', message: `"${item.title}" moved to To Do.`, type: 'info' }
          );
        }
      }
    },
    [handleAcceptItem, handleApproveItem, handleReportSubTaskComplete, handleReworkItem]
  );

  // Zero-Query Modal Opener with on-demand summary hydration (Rule 8)
  const handleItemClick = useCallback(
    async (item: UnifiedWorkItem, initialTab: 'details' | 'chat' = 'details') => {
      setIsReadOnlyModal(!item.canEdit && !item.canApproveOrReject);
      setModalInitialTab(initialTab);

      const isVirtual =
        Boolean(item.isSummaryFallback) ||
        Boolean((item.rawTask as any)?._isVirtualSummary) ||
        String(item.rawTask?.id || '').startsWith('ts_');

      if (item.rawTask && !isVirtual) {
        setEditingTask(item.rawTask);
        setIsTaskModalOpen(true);
        return;
      }

      if (item.type === 'task') {
        const matched = await resolveRealTaskForWorkItem(item);
        if (matched || item.rawTask) {
          setEditingTask(matched || item.rawTask!);
          setIsTaskModalOpen(true);
          return;
        }
      }

      if (item.rawProject) {
        setEditingProject(item.rawProject);
        setIsProjectModalOpen(true);
      }
    },
    [setEditingProject, setEditingTask, setIsProjectModalOpen, setIsReadOnlyModal, setIsTaskModalOpen, setModalInitialTab]
  );

  return {
    handleToggleTaskComplete,
    handleAcceptItem,
    handleReportSubTaskComplete,
    handleApproveItem,
    handleReworkItem,
    handleMoveItemToColumn,
    handleItemClick,
  };
}
