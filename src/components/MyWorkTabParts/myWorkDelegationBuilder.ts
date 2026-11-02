import { DelegationGroup, Project, Task } from '../../types';
import {
  getTaskStatus,
  isDelegationGroupBelongsToProject,
} from '../../lib/utils';
import {
  MyWorkKanbanColumnId,
  UnifiedWorkItem,
  WorkItemPriority,
} from './myWorkTypes';
import {
  MS_PER_DAY,
  applyAccountOverrideToItem,
  buildFriendlyDueLabel,
  parseLocalDayMs,
} from './myWorkDataBuilders';

export function buildSummaryFallbackItems(params: {
  validProjects: Project[];
  coveredProjectIdsWithTasks: Set<string>;
  todayStartMs: number;
  currentYear: number;
  checkPartyMatch: (partyStr?: string, involvedUsers?: string[]) => boolean;
  hasAllPartyPerm: boolean;
  isAdminOrManager: boolean;
  canWriteDetailPerm: boolean;
  effectiveMyWorkStates: Record<string, string>;
}): { candidates: UnifiedWorkItem[]; directMatched: UnifiedWorkItem[] } {
  const {
    validProjects,
    coveredProjectIdsWithTasks,
    todayStartMs,
    currentYear,
    checkPartyMatch,
    hasAllPartyPerm,
    isAdminOrManager,
    canWriteDetailPerm,
    effectiveMyWorkStates,
  } = params;

  const candidates: UnifiedWorkItem[] = [];
  const directMatched: UnifiedWorkItem[] = [];

  for (let i = 0; i < validProjects.length; i++) {
    const proj = validProjects[i];
    if (proj.id && coveredProjectIdsWithTasks.has(String(proj.id))) continue;
    const pYear = Number(proj.year || currentYear);
    const isArchiveYear = pYear < currentYear;
    const summaries = Array.isArray(proj.taskSummaries) ? proj.taskSummaries : [];
    const summaryParentIds = new Set<string>();
    summaries.forEach((s: any) => {
      if (s?.parentTaskId) summaryParentIds.add(String(s.parentTaskId));
    });

    for (let j = 0; j < summaries.length; j++) {
      const s: any = summaries[j];
      if (!s || !s.name || s.isModularParent || (s.id && summaryParentIds.has(String(s.id)))) continue;
      const dueStr = s.finish || s.start || '';
      const dueMs = parseLocalDayMs(dueStr);
      const diffDays = dueMs !== null ? Math.round((dueMs - todayStartMs) / MS_PER_DAY) : null;
      const rawStatus = String(s.runningStatus || s.status || '').trim().toLowerCase();
      const plStatus = getTaskStatus(s.start, s.finish);

      const isCompleted =
        rawStatus === 'completed' ||
        (!rawStatus && (plStatus === 'Completed' || proj.computedActProgress === 100));
      const isInProgress =
        !isCompleted &&
        rawStatus !== 'upcoming' &&
        (rawStatus === 'on process' || rawStatus === 'in progress' || plStatus === 'On process');
      const isOverdue = !isCompleted && diffDays !== null && diffDays < 0;
      const directPIC = checkPartyMatch(s.party || proj.party);
      const isPIC = directPIC || hasAllPartyPerm;
      const canEdit = !isArchiveYear && (canWriteDetailPerm || isPIC || isAdminOrManager);

      const baseItem: UnifiedWorkItem = {
        id: `sum_${proj.id}_${s.id || j}`,
        type: 'task',
        kanbanColumn: isCompleted ? 'done' : isInProgress ? 'in_progress' : 'todo',
        title: s.name,
        subtitle: proj.code,
        projectId: proj.id,
        projectCode: proj.code,
        projectName: proj.name || proj.code,
        projectStore: proj.store || 'HCM',
        projectYear: proj.year || '',
        floor: proj.location || '',
        dueDateStr: dueStr,
        startDateStr: s.start || '',
        dueDiffDays: diffDays,
        friendlyDueLabel: buildFriendlyDueLabel(diffDays, dueStr, isCompleted),
        priority: isOverdue ? 'critical' : diffDays !== null && diffDays <= 1 ? 'high' : 'medium',
        statusLabel: isCompleted ? 'Completed' : isInProgress ? 'On Process' : 'To Do',
        isCompleted,
        isOverdue,
        isNeedsRework: false,
        isInProgress,
        isAwaitingMyApproval: false,
        isPIC,
        isCreator: isAdminOrManager,
        isApprover: false,
        canEdit,
        canAccept: canEdit && !isInProgress && !isCompleted,
        canSubmitApproval: canEdit && !isCompleted,
        canApproveOrReject: false,
        party: s.party || proj.party || 'PMO',
        commentCount: proj.comments?.length || 0,
        attachmentCount: 0,
        rawProject: proj,
        rawSummaryId: s.id ? String(s.id) : undefined,
        isSummaryFallback: true,
      };

      const item = applyAccountOverrideToItem(baseItem, effectiveMyWorkStates, isArchiveYear, isAdminOrManager);
      candidates.push(item);
      if (directPIC) directMatched.push(item);
    }
  }

  return { candidates, directMatched };
}

export function buildDelegationSubTaskItems(params: {
  delegationGroups: DelegationGroup[];
  validProjects: Project[];
  projectById: Map<string, Project>;
  taskById: Map<string, Task>;
  resolveParentProjectForTask: (t: Partial<Task>) => Project | undefined;
  storeFilter: string;
  globalYearFilter: string;
  currentYear: number;
  todayStartMs: number;
  currentUserId?: string;
  isAdmin: boolean;
  isAdminOrManager: boolean;
  canWriteDelegationPerm: boolean;
  hasAllPartyPerm: boolean;
  checkPartyMatch: (partyStr?: string, involvedUsers?: string[]) => boolean;
  effectiveMyWorkStates: Record<string, string>;
}): { candidates: UnifiedWorkItem[]; directMatched: UnifiedWorkItem[] } {
  const {
    delegationGroups,
    validProjects,
    projectById,
    taskById,
    resolveParentProjectForTask,
    storeFilter,
    globalYearFilter,
    currentYear,
    todayStartMs,
    currentUserId,
    isAdmin,
    isAdminOrManager,
    canWriteDelegationPerm,
    hasAllPartyPerm,
    checkPartyMatch,
    effectiveMyWorkStates,
  } = params;

  const candidates: UnifiedWorkItem[] = [];
  const directMatched: UnifiedWorkItem[] = [];

  const activeGroups = (delegationGroups || []).filter((g) => g && !g.isDeleted);
  for (let i = 0; i < activeGroups.length; i++) {
    const g = activeGroups[i];
    const linkedTask = g.parentTaskId ? taskById.get(g.parentTaskId) : undefined;
    const proj =
      (g.projectId ? projectById.get(String(g.projectId).trim()) : undefined) ||
      (linkedTask ? resolveParentProjectForTask(linkedTask) : undefined) ||
      validProjects.find((p) => isDelegationGroupBelongsToProject(g, p));

    if (
      storeFilter &&
      storeFilter !== 'all' &&
      String(proj?.store || g.projectStore || '').toUpperCase().trim() !== storeFilter.toUpperCase().trim()
    ) {
      continue;
    }
    if (
      globalYearFilter &&
      globalYearFilter !== 'all' &&
      String(proj?.year || g.projectYear || '').trim() !== String(globalYearFilter).trim()
    ) {
      continue;
    }

    const pYear = Number(proj?.year || g.projectYear || currentYear);
    const isArchiveYear = pYear < currentYear;
    const isCreator =
      Boolean(currentUserId && g.createdBy && String(g.createdBy) === String(currentUserId)) || isAdmin;

    const subTasks = Array.isArray(g.subTasks) ? g.subTasks : [];
    for (let j = 0; j < subTasks.length; j++) {
      const st = subTasks[j];
      if (!st) continue;
      const dueStr = st.finishAct || st.finish || st.startAct || st.start || '';
      const dueMs = parseLocalDayMs(dueStr);
      const diffDays = dueMs !== null ? Math.round((dueMs - todayStartMs) / MS_PER_DAY) : null;

      const stStatus = String(st.status || '').trim();
      const delStatus = String(st.delegationStatus || '').trim();
      const appStatus = String(st.approvalStatus || '').trim();

      const isCompleted =
        stStatus.toLowerCase() === 'approved' ||
        stStatus.toLowerCase() === 'completed' ||
        delStatus.toLowerCase() === 'completed' ||
        appStatus.toLowerCase() === 'approved';

      const isNeedsRework =
        stStatus.toLowerCase() === 'needs rework' ||
        stStatus.toLowerCase() === 'rejected' ||
        delStatus.toLowerCase() === 'needs rework' ||
        delStatus.toLowerCase() === 'rejected' ||
        appStatus.toLowerCase() === 'needs rework' ||
        appStatus.toLowerCase() === 'rejected';

      const isAwaitingApproval =
        !isCompleted &&
        ['pending completed', 'reqapproval', 'waiting for approval', 'requested', 'hold'].some(
          (s) => stStatus.toLowerCase() === s || delStatus.toLowerCase() === s || appStatus.toLowerCase() === s
        );

      const isInProgress =
        !isCompleted &&
        !isAwaitingApproval &&
        !isNeedsRework &&
        ['on process', 'accepted', 'accepttask'].some(
          (s) => stStatus.toLowerCase() === s || delStatus.toLowerCase() === s || appStatus.toLowerCase() === s
        );

      const isOverdue = !isCompleted && diffDays !== null && diffDays < 0;
      const directPIC = checkPartyMatch(st.party, st.involvedUsers);
      const isPIC = directPIC || hasAllPartyPerm;
      const isApprover = isAwaitingApproval && isCreator;
      const canEdit = !isArchiveYear && (canWriteDelegationPerm || isCreator || isPIC);

      let priority: WorkItemPriority = 'medium';
      if (isOverdue || isNeedsRework || st.priority === 'High') priority = 'critical';
      else if (isAwaitingApproval || st.priority === 'Mid-high' || (diffDays !== null && diffDays <= 1)) {
        priority = 'high';
      } else if (isCompleted) priority = 'low';

      const kanbanColumn: MyWorkKanbanColumnId = isCompleted
        ? 'done'
        : isAwaitingApproval
        ? 'pending_approval'
        : isInProgress
        ? 'in_progress'
        : 'todo';

      const subTitleText = st.name || st.comments || g.name || 'Delegated Sub-task';
      const attCount = (st.attachments?.length || 0) + (st.fileUrl || st.childFileUrl ? 1 : 0);

      const baseItem: UnifiedWorkItem = {
        id: `del_${g.id}_${st.id}`,
        type: 'delegation_subtask',
        kanbanColumn,
        title: subTitleText,
        subtitle: g.name && g.name !== subTitleText ? g.name : proj?.code || g.projectCode || '',
        projectId: proj?.id || g.projectId,
        projectCode: proj?.code || g.projectCode || 'CUSTOM',
        projectName: proj?.name || g.name || 'Delegation',
        projectStore: proj?.store || g.projectStore || 'HCM',
        projectYear: proj?.year || g.projectYear || '',
        floor: proj?.location || '',
        dueDateStr: dueStr,
        startDateStr: st.startAct || st.start || '',
        dueDiffDays: diffDays,
        friendlyDueLabel: buildFriendlyDueLabel(diffDays, dueStr, isCompleted),
        priority,
        statusLabel: isNeedsRework
          ? 'Needs Rework'
          : isAwaitingApproval
          ? 'Pending Completed (85%)'
          : isCompleted
          ? 'Approved (100%)'
          : isInProgress
          ? 'On Process (50%)'
          : 'Assigned (0%)',
        flowStatusLabel: delStatus || stStatus || 'Assigned',
        isCompleted,
        isOverdue,
        isNeedsRework,
        isInProgress,
        isAwaitingMyApproval: isAwaitingApproval,
        isPIC,
        isCreator,
        isApprover,
        canEdit,
        canAccept: canEdit && (isPIC || isCreator) && !isInProgress && !isAwaitingApproval && !isCompleted,
        canSubmitApproval: canEdit && (isPIC || isCreator) && !isAwaitingApproval && !isCompleted,
        canApproveOrReject: !isArchiveYear && isCreator && isAwaitingApproval,
        party: st.party || 'Assigned',
        commentCount: st.comments ? 1 : 0,
        attachmentCount: attCount,
        reportSnippet: st.report || st.childReport || st.comments || '',
        rawProject: proj,
        rawTask: linkedTask,
        rawDelegationGroup: g,
        rawSubTask: st,
      };

      const item = applyAccountOverrideToItem(baseItem, effectiveMyWorkStates, isArchiveYear, isAdminOrManager);
      candidates.push(item);
      if (directPIC || isCreator) directMatched.push(item);
    }
  }

  return { candidates, directMatched };
}
