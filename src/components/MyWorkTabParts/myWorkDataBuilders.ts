import { AppRole, DelegationGroup, Project, Task } from '../../types';
import {
  MyWorkFocusTarget,
  MyWorkKanbanColumnId,
  UnifiedWorkItem,
  WorkItemPriority,
} from './myWorkTypes';
import {
  buildKeysFromUnifiedItem,
  resolveAccountOverrideStatus,
} from './myWorkAccountSync';

export const MS_PER_DAY = 86400000;

export function normalizeRole(r?: string): AppRole | 'admin' {
  if (!r) return 'Staff';
  const lower = r.toLowerCase().trim();
  if (lower === 'admin') return 'admin';
  if (lower === 'manager') return 'Manager';
  if (lower === 'cp') return 'CP';
  if (lower === 'staff') return 'Staff';
  if (lower === 'external') return 'External';
  return r as AppRole;
}

export function parseLocalDayMs(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const clean = String(dateStr).trim().substring(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) {
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d).getTime();
  }
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) {
    const dt = new Date(parsed);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  }
  return null;
}

export function buildFriendlyDueLabel(
  diffDays: number | null,
  dateStr: string,
  isCompleted: boolean
): string {
  if (!dateStr) return 'No due date';
  const shortDate = String(dateStr).substring(0, 10);
  if (isCompleted) return `Done • ${shortDate}`;
  if (diffDays === null) return shortDate;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Overdue 1d';
  if (diffDays < -1) return `Overdue ${Math.abs(diffDays)}d`;
  if (diffDays <= 7) return `In ${diffDays}d (${shortDate.slice(5)})`;
  return shortDate;
}

export function parseParties(raw?: string): string[] {
  if (!raw) return [];
  return String(raw)
    .toLowerCase()
    .split(/[,;/+]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isItemInFocusProject(
  item: UnifiedWorkItem,
  focus: MyWorkFocusTarget
): boolean {
  if (focus.projectId && item.projectId) {
    return String(item.projectId).trim() === String(focus.projectId).trim();
  }
  const fCode = String(focus.projectCode || '').trim().toLowerCase();
  const iCode = String(item.projectCode || '').trim().toLowerCase();
  if (!fCode || fCode !== iCode) return false;
  if (focus.projectStore && item.projectStore) {
    if (
      String(focus.projectStore).trim().toLowerCase() !==
      String(item.projectStore).trim().toLowerCase()
    ) {
      return false;
    }
  }
  if (focus.projectYear && item.projectYear) {
    if (String(focus.projectYear).trim() !== String(item.projectYear).trim()) {
      return false;
    }
  }
  return true;
}

/**
 * Applies the user's account-level My Work status override (`currentUser.myWorkStates`)
 * so any task/delegation/milestone ticked on iOS immediately reflects on Laptop
 * even in Summary Mode (0 Read).
 */
export function applyAccountOverrideToItem(
  item: UnifiedWorkItem,
  effectiveMyWorkStates: Record<string, string>,
  isArchiveYear: boolean,
  isAdminOrManager: boolean
): UnifiedWorkItem {
  const keys = buildKeysFromUnifiedItem(item);
  const overrideStatus = resolveAccountOverrideStatus(effectiveMyWorkStates, keys);
  if (!overrideStatus) return item;

  const ovLower = overrideStatus.toLowerCase().trim();
  const isCompleted = ovLower === 'completed' || ovLower === 'approved';
  const isAwaitingMyApproval =
    !isCompleted &&
    (ovLower === 'reqapproval' ||
      ovLower === 'pending completed' ||
      ovLower === 'waiting for approval');
  const isNeedsRework =
    !isCompleted && (ovLower === 'needs rework' || ovLower === 'rejected');
  const isExplicitUpcoming = ovLower === 'upcoming' || ovLower === 'todo';
  const isInProgress =
    !isCompleted &&
    !isAwaitingMyApproval &&
    !isNeedsRework &&
    !isExplicitUpcoming &&
    (ovLower === 'on process' || ovLower === 'in progress');

  const diffDays = item.dueDiffDays;
  const isOverdue = !isCompleted && diffDays !== null && diffDays < 0;

  let priority: WorkItemPriority = item.priority;
  if (isCompleted) priority = 'low';
  else if (isOverdue || isNeedsRework) priority = 'critical';
  else if (isAwaitingMyApproval || (diffDays !== null && diffDays <= 1)) priority = 'high';

  const kanbanColumn: MyWorkKanbanColumnId = isCompleted
    ? 'done'
    : isAwaitingMyApproval
    ? 'pending_approval'
    : isInProgress
    ? 'in_progress'
    : 'todo';

  const statusLabel = isNeedsRework
    ? 'Needs Rework'
    : isAwaitingMyApproval
    ? item.type === 'delegation_subtask'
      ? 'Pending Completed (85%)'
      : 'Pending Approval'
    : isCompleted
    ? item.type === 'delegation_subtask'
      ? 'Approved (100%)'
      : 'Completed'
    : isInProgress
    ? item.type === 'delegation_subtask'
      ? 'On Process (50%)'
      : 'On Process'
    : item.type === 'project_milestone'
    ? item.milestoneKind || 'Milestone'
    : 'To Do';

  return {
    ...item,
    kanbanColumn,
    isCompleted,
    isOverdue,
    isNeedsRework,
    isInProgress,
    isAwaitingMyApproval,
    priority,
    statusLabel,
    friendlyDueLabel: buildFriendlyDueLabel(diffDays, item.dueDateStr, isCompleted),
    canAccept:
      item.canEdit &&
      !isInProgress &&
      !isAwaitingMyApproval &&
      !isCompleted,
    canSubmitApproval:
      item.canEdit && !isAwaitingMyApproval && !isCompleted,
    canApproveOrReject:
      !isArchiveYear &&
      (item.type === 'delegation_subtask' ? item.isCreator : isAdminOrManager) &&
      isAwaitingMyApproval,
  };
}

export function buildProjectMilestoneItems(params: {
  validProjects: Project[];
  todayStartMs: number;
  currentYear: number;
  focusTarget?: MyWorkFocusTarget | null;
  checkPartyMatch: (partyStr?: string, involvedUsers?: string[]) => boolean;
  hasAllPartyPerm: boolean;
  isAdminOrManager: boolean;
  canWriteDetailPerm: boolean;
  effectiveMyWorkStates: Record<string, string>;
}): { candidates: UnifiedWorkItem[]; directMatched: UnifiedWorkItem[] } {
  const {
    validProjects,
    todayStartMs,
    currentYear,
    focusTarget,
    checkPartyMatch,
    hasAllPartyPerm,
    isAdminOrManager,
    canWriteDetailPerm,
    effectiveMyWorkStates,
  } = params;

  const candidates: UnifiedWorkItem[] = [];
  const directMatched: UnifiedWorkItem[] = [];

  for (let i = 0; i < validProjects.length; i++) {
    const p = validProjects[i];
    const pYear = Number(p.year || currentYear);
    const isArchiveYear = pYear < currentYear;
    const directProjMatch = checkPartyMatch(p.party);
    const isFocusedProj = Boolean(
      focusTarget &&
        ((focusTarget.projectId && p.id && String(p.id) === String(focusTarget.projectId)) ||
          String(p.code || '').trim().toLowerCase() ===
            String(focusTarget.projectCode || '').trim().toLowerCase())
    );
    const milestones: Array<{ kind: 'Start' | 'Handover' | 'Opening'; dateStr?: string }> = [
      { kind: 'Handover', dateStr: p.computedTakCompl || p.handover },
      { kind: 'Opening', dateStr: p.computedOpening || p.opening },
    ];

    for (let m = 0; m < milestones.length; m++) {
      const ms = milestones[m];
      if (!ms.dateStr) continue;
      const dueMs = parseLocalDayMs(ms.dateStr);
      if (dueMs === null) continue;
      const diffDays = Math.round((dueMs - todayStartMs) / MS_PER_DAY);
      if (!isFocusedProj && (diffDays < 0 || diffDays > 30)) continue;

      const isCompleted =
        p.computedActProgress === 100 || String(p.mdStatus || '').toLowerCase() === 'completed';
      const canEdit =
        !isArchiveYear && (canWriteDetailPerm || directProjMatch || hasAllPartyPerm || isAdminOrManager);

      const baseItem: UnifiedWorkItem = {
        id: `ms_${p.id}_${ms.kind}`,
        type: 'project_milestone',
        kanbanColumn: isCompleted ? 'done' : diffDays <= 7 ? 'in_progress' : 'todo',
        title: `${ms.kind} Milestone: ${p.name || p.code}`,
        subtitle: p.code,
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name || p.code,
        projectStore: p.store || 'HCM',
        projectYear: p.year || '',
        floor: p.location || '',
        dueDateStr: ms.dateStr,
        dueDiffDays: diffDays,
        friendlyDueLabel: buildFriendlyDueLabel(diffDays, ms.dateStr, isCompleted),
        priority: diffDays <= 3 ? 'high' : 'medium',
        statusLabel: ms.kind,
        isCompleted,
        isOverdue: false,
        isNeedsRework: false,
        isInProgress: diffDays <= 7 && !isCompleted,
        isAwaitingMyApproval: false,
        isPIC: directProjMatch || hasAllPartyPerm,
        isCreator: isAdminOrManager,
        isApprover: false,
        canEdit,
        canAccept: canEdit && diffDays > 7 && !isCompleted,
        canSubmitApproval: false,
        canApproveOrReject: false,
        party: p.party || 'PMO',
        commentCount: p.comments?.length || 0,
        attachmentCount: 0,
        milestoneKind: ms.kind,
        rawProject: p,
      };

      const finalItem = applyAccountOverrideToItem(
        baseItem,
        effectiveMyWorkStates,
        isArchiveYear,
        isAdminOrManager
      );
      candidates.push(finalItem);
      if (directProjMatch) directMatched.push(finalItem);
    }
  }

  return { candidates, directMatched };
}
