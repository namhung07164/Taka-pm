import { AppRole, Project } from '../../types';
import { matchesAdvancedSearch } from '../../lib/utils';
import {
  MyWorkBriefingStats,
  MyWorkCounts,
  MyWorkFocusTarget,
  MyWorkKanbanColumnId,
  MyWorkTimeFilter,
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

export function matchesFixedProject(item: UnifiedWorkItem, fixedCode: string): boolean {
  const fix = fixedCode.trim().toLowerCase();
  if (!fix) return true;
  const pCode = String(item.projectCode || '').trim().toLowerCase();
  const pName = String(item.projectName || '').trim().toLowerCase();
  const pId = String(item.projectId || '').trim().toLowerCase();
  return pCode === fix || pCode.includes(fix) || pName.includes(fix) || pId === fix;
}

export function isItemScheduledForToday(item: UnifiedWorkItem, todayStartMs: number): boolean {
  if (item.dueDiffDays === 0) return true;
  const startMs = parseLocalDayMs(item.startDateStr);
  const dueMs = parseLocalDayMs(item.dueDateStr);
  if (startMs !== null && dueMs !== null && startMs <= todayStartMs && dueMs >= todayStartMs) {
    return true;
  }
  return false;
}

export function matchesTimeFilter(
  item: UnifiedWorkItem,
  timeFilter: MyWorkTimeFilter,
  todayStartMs: number
): boolean {
  if (!timeFilter || timeFilter === 'all') return true;
  if (item.isFocusedTarget) return true;

  const diff = item.dueDiffDays;
  const isTodayItem = isItemScheduledForToday(item, todayStartMs);

  switch (timeFilter) {
    case 'overdue':
      return item.isOverdue || item.isNeedsRework || (diff !== null && diff < 0);
    case 'today':
      return isTodayItem;
    case 'today_focus':
      return (
        item.isOverdue ||
        item.isNeedsRework ||
        isTodayItem ||
        item.isAwaitingMyApproval ||
        (diff !== null && diff <= 0)
      );
    case 'this_week':
      return isTodayItem || (diff !== null && diff >= 0 && diff <= 7);
    case 'this_month':
      return isTodayItem || (diff !== null && diff >= 0 && diff <= 30);
    case 'upcoming':
      return diff === null || diff > 30;
    default:
      return true;
  }
}

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
  fixedProjectCode?: string;
  checkPartyMatch: (partyStr?: string, involvedUsers?: string[]) => boolean;
  hasAllPartyPerm: boolean;
  isAdminOrManager: boolean;
  canWriteDetailPerm: boolean;
  effectiveMyWorkStates: Record<string, string>;
}): { candidates: UnifiedWorkItem[]; directMatched: UnifiedWorkItem[] } {
  const { validProjects, todayStartMs, currentYear, focusTarget, fixedProjectCode, checkPartyMatch, hasAllPartyPerm, isAdminOrManager, canWriteDetailPerm, effectiveMyWorkStates } = params;
  const candidates: UnifiedWorkItem[] = [];
  const directMatched: UnifiedWorkItem[] = [];
  const fixLower = (fixedProjectCode || '').trim().toLowerCase();

  for (let i = 0; i < validProjects.length; i++) {
    const p = validProjects[i];
    const isArchiveYear = Number(p.year || currentYear) < currentYear;
    const directProjMatch = checkPartyMatch(p.party);
    const pCodeLower = String(p.code || '').trim().toLowerCase();
    const isFocusedProj =
      Boolean(focusTarget && ((focusTarget.projectId && p.id && String(p.id) === String(focusTarget.projectId)) || pCodeLower === String(focusTarget.projectCode || '').trim().toLowerCase())) ||
      Boolean(fixLower && (pCodeLower === fixLower || pCodeLower.includes(fixLower)));
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

      const isCompleted = p.computedActProgress === 100 || String(p.mdStatus || '').toLowerCase() === 'completed';
      const canEdit = !isArchiveYear && (canWriteDetailPerm || directProjMatch || hasAllPartyPerm || isAdminOrManager);

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

      const finalItem = applyAccountOverrideToItem(baseItem, effectiveMyWorkStates, isArchiveYear, isAdminOrManager);
      candidates.push(finalItem);
      if (directProjMatch) directMatched.push(finalItem);
    }
  }

  return { candidates, directMatched };
}

export function partitionAndSortMyWorkStream(params: {
  baseStream: UnifiedWorkItem[];
  statusFilter: string;
  searchQuery: string;
  timeFilter: MyWorkTimeFilter;
  sortBy: 'urgency' | 'due_asc' | 'project' | 'priority';
  todayStartMs: number;
  hasProjectFocus: boolean;
  hasSummaryFallbacks: boolean;
}) {
  const { baseStream, statusFilter, searchQuery, timeFilter, sortBy, todayStartMs, hasProjectFocus, hasSummaryFallbacks } = params;

  const briefingStats: MyWorkBriefingStats = {
    totalActiveTasks: 0, criticalUrgentCount: 0, highPriorityCount: 0, normalActiveCount: 0,
    upcomingMilestonesCount: 0, dueThisWeekCount: 0, delegationsActiveCount: 0,
    delegationsMyPICCount: 0, pendingMyApprovalCount: 0, needsReworkCount: 0,
  };

  for (let i = 0; i < baseStream.length; i++) {
    const it = baseStream[i];
    if (it.isCompleted) continue;
    briefingStats.totalActiveTasks++;
    if (it.priority === 'critical' || it.isOverdue) briefingStats.criticalUrgentCount++;
    else if (it.priority === 'high') briefingStats.highPriorityCount++;
    else briefingStats.normalActiveCount++;
    if (it.type === 'project_milestone') briefingStats.upcomingMilestonesCount++;
    if (it.dueDiffDays !== null && it.dueDiffDays >= 0 && it.dueDiffDays <= 7) briefingStats.dueThisWeekCount++;
    if (it.type === 'delegation_subtask') {
      briefingStats.delegationsActiveCount++;
      if (it.isPIC) briefingStats.delegationsMyPICCount++;
    }
    if (it.isAwaitingMyApproval) briefingStats.pendingMyApprovalCount++;
    if (it.isNeedsRework) briefingStats.needsReworkCount++;
  }

  const searchAndStatusStream = baseStream.filter((item) => {
    if (statusFilter === 'overdue' && !item.isOverdue && !item.isNeedsRework) return false;
    if (statusFilter === 'approval' && !item.isAwaitingMyApproval && !item.isNeedsRework) return false;
    if (statusFilter === 'delegation' && item.type !== 'delegation_subtask') return false;
    if (statusFilter === 'milestone' && item.type !== 'project_milestone') return false;
    if (!searchQuery.trim()) return true;
    return matchesAdvancedSearch(searchQuery, [item.title, item.projectCode, item.projectName, item.floor || '', item.party, item.statusLabel]);
  });

  let allActiveCount = 0, todayFocusCount = 0, todayOnlyCount = 0, thisWeekCount = 0;
  let thisMonthCount = 0, overdueCount = 0, futureCount = 0, inboxCount = 0, totalDoneCount = 0;

  for (let i = 0; i < searchAndStatusStream.length; i++) {
    const it = searchAndStatusStream[i];
    if (it.isCompleted) { totalDoneCount++; continue; }
    allActiveCount++;
    const isToday = isItemScheduledForToday(it, todayStartMs);
    const diff = it.dueDiffDays;
    if (it.isOverdue || it.isNeedsRework) overdueCount++;
    if (isToday) todayOnlyCount++;
    if (it.isOverdue || it.isNeedsRework || isToday || it.isAwaitingMyApproval || (diff !== null && diff <= 0)) todayFocusCount++;
    if (isToday || (diff !== null && diff >= 0 && diff <= 7)) thisWeekCount++;
    if (isToday || (diff !== null && diff >= 0 && diff <= 30)) thisMonthCount++;
    if (diff === null || diff > 30) futureCount++;
    if (it.isAwaitingMyApproval || it.isNeedsRework) inboxCount++;
  }

  const filteredStream = searchAndStatusStream.filter((item) => matchesTimeFilter(item, timeFilter, todayStartMs));

  const pWeight: Record<WorkItemPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortFn = (a: UnifiedWorkItem, b: UnifiedWorkItem) => {
    if (a.isFocusedTarget && !b.isFocusedTarget) return -1;
    if (!a.isFocusedTarget && b.isFocusedTarget) return 1;
    if (sortBy === 'project') return a.projectCode.localeCompare(b.projectCode);
    if (sortBy === 'priority') return pWeight[a.priority] - pWeight[b.priority];
    const da = a.dueDiffDays ?? 9999;
    const db = b.dueDiffDays ?? 9999;
    return da !== db ? da - db : pWeight[a.priority] - pWeight[b.priority];
  };

  const overdueItems: UnifiedWorkItem[] = [], approvalItems: UnifiedWorkItem[] = [], todayItems: UnifiedWorkItem[] = [];
  const weekItems: UnifiedWorkItem[] = [], monthItems: UnifiedWorkItem[] = [], doneItems: UnifiedWorkItem[] = [];
  const kanbanTodo: UnifiedWorkItem[] = [], kanbanInProgress: UnifiedWorkItem[] = [], kanbanPendingApproval: UnifiedWorkItem[] = [], kanbanDone: UnifiedWorkItem[] = [];

  for (let i = 0; i < filteredStream.length; i++) {
    const item = filteredStream[i];
    if (item.kanbanColumn === 'done') kanbanDone.push(item);
    else if (item.kanbanColumn === 'pending_approval') kanbanPendingApproval.push(item);
    else if (item.kanbanColumn === 'in_progress') kanbanInProgress.push(item);
    else kanbanTodo.push(item);

    if (item.isCompleted) { doneItems.push(item); continue; }
    if (item.isAwaitingMyApproval) approvalItems.push(item);
    if (item.isOverdue || item.isNeedsRework) overdueItems.push(item);
    else if (isItemScheduledForToday(item, todayStartMs) || item.isFocusedTarget) todayItems.push(item);
    else if (item.dueDiffDays !== null && item.dueDiffDays >= 1 && item.dueDiffDays <= 7) weekItems.push(item);
    else if (item.dueDiffDays !== null && item.dueDiffDays > 7 && (item.dueDiffDays <= 30 || hasProjectFocus)) monthItems.push(item);
    else if (item.dueDiffDays === null && !item.isAwaitingMyApproval) todayItems.push(item);
  }

  overdueItems.sort(sortFn); approvalItems.sort(sortFn); todayItems.sort(sortFn);
  weekItems.sort(sortFn); monthItems.sort(sortFn);
  doneItems.sort((a, b) => (a.isFocusedTarget === b.isFocusedTarget ? (b.dueDateStr || '').localeCompare(a.dueDateStr || '') : a.isFocusedTarget ? -1 : 1));
  kanbanTodo.sort(sortFn); kanbanInProgress.sort(sortFn); kanbanPendingApproval.sort(sortFn);
  kanbanDone.sort((a, b) => (a.isFocusedTarget === b.isFocusedTarget ? (b.dueDateStr || '').localeCompare(a.dueDateStr || '') : a.isFocusedTarget ? -1 : 1));

  const counts: MyWorkCounts = {
    today: overdueItems.length + todayItems.length, inbox: inboxCount,
    upcoming: weekItems.length + monthItems.length, done: totalDoneCount,
    overdue: overdueCount, todayTodo: todayItems.length + overdueItems.length,
    allActive: allActiveCount, todayFocus: todayFocusCount, todayOnly: todayOnlyCount,
    thisWeek: thisWeekCount, thisMonth: thisMonthCount, future: futureCount,
  };

  return {
    overdueItems, approvalItems, todayItems, weekItems, monthItems,
    doneItems: doneItems.slice(0, 60), kanbanTodo, kanbanInProgress,
    kanbanPendingApproval, kanbanDone: kanbanDone.slice(0, 60),
    counts, briefingStats, hasSummaryFallbacks,
  };
}
