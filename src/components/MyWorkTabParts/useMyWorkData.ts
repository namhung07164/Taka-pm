import { useMemo } from 'react';
import { AppRole, AppUser, DelegationGroup, PermissionMatrix, Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import {
  getTaskStatus,
  isTaskBelongsToProject,
} from '../../lib/utils';
import { isTaskDeletedInTracker } from '../../lib/taskDeletedTracker';
import {
  MyWorkFocusTarget,
  MyWorkKanbanColumnId,
  MyWorkTimeFilter,
  UnifiedWorkItem,
  WorkItemPriority,
} from './myWorkTypes';
import {
  loadLocalMyWorkStates,
  mergeMyWorkStates,
} from './myWorkAccountSync';
import {
  MS_PER_DAY,
  applyAccountOverrideToItem,
  buildFriendlyDueLabel,
  buildProjectMilestoneItems,
  isItemInFocusProject,
  matchesFixedProject,
  normalizeRole,
  parseLocalDayMs,
  parseParties,
  partitionAndSortMyWorkStream,
} from './myWorkDataBuilders';
import {
  buildDelegationSubTaskItems,
  buildSummaryFallbackItems,
} from './myWorkDelegationBuilder';

interface UseMyWorkDataParams {
  projects: Project[];
  tasks: Task[];
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
  permissionMatrix: PermissionMatrix;
  searchQuery: string;
  storeFilter: string;
  globalYearFilter: string;
  statusFilter: string;
  timeFilter: MyWorkTimeFilter;
  sortBy: 'urgency' | 'due_asc' | 'project' | 'priority';
  focusTarget?: MyWorkFocusTarget | null;
}

export function useMyWorkData({
  projects,
  tasks,
  delegationGroups,
  currentUser,
  permissionMatrix,
  searchQuery,
  storeFilter,
  globalYearFilter,
  statusFilter,
  timeFilter,
  sortBy,
  focusTarget,
}: UseMyWorkDataParams) {
  const fixedProjectCode = useAppStore((s) => s.fixedProjectCode);

  return useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const todayStartMs = new Date(currentYear, now.getMonth(), now.getDate()).getTime();
    const usernameLower = String(currentUser?.username || '').toLowerCase().trim();
    const userIdLower = String(currentUser?.id || '').toLowerCase().trim();
    const role = normalizeRole(currentUser?.role);
    const isAdmin = role === 'admin';
    const isAdminOrManager = isAdmin || role === 'Manager' || role === 'CP';

    // Merge localStorage + Firestore account-level My Work states (Last-Write-Wins per key)
    const effectiveMyWorkStates = mergeMyWorkStates(
      loadLocalMyWorkStates(currentUser?.id),
      currentUser?.myWorkStates
    );

    const canWriteDetailPerm =
      isAdmin || Boolean(permissionMatrix?.[role as AppRole]?.Write?.detail) || Boolean(currentUser?.canWrite);
    const canWriteDelegationPerm =
      isAdmin || Boolean(permissionMatrix?.[role as AppRole]?.Write?.taskDelegation) || Boolean(currentUser?.canWrite);

    const userSpecificParties = new Set<string>();
    if (role === 'CP') userSpecificParties.add('cp');
    if (currentUser?.partyPermissions) {
      Object.entries(currentUser.partyPermissions).forEach(([k, val]) => {
        if (val && k.toLowerCase().trim() !== 'all') userSpecificParties.add(k.toLowerCase().trim());
      });
    }
    const hasAllPartyPerm = isAdmin || currentUser?.partyPermissions?.all === true;

    const checkPartyMatch = (partyStr?: string, involvedUsers?: string[]): boolean => {
      if (
        Array.isArray(involvedUsers) &&
        involvedUsers.some((u) => {
          const v = String(u).toLowerCase().trim();
          return v === userIdLower || v === usernameLower;
        })
      ) {
        return true;
      }
      return parseParties(partyStr).some(
        (t) => (usernameLower && t === usernameLower) || (userIdLower && t === userIdLower) || userSpecificParties.has(t)
      );
    };

    // O(1) Pre-Indexing of Projects by ID and Composite Key (Rule 7 & Rule 16.1)
    const projectById = new Map<string, Project>();
    const projectByCompositeKey = new Map<string, Project>();
    const projectsByCodeLower = new Map<string, Project[]>();
    const summaryStatusByProjAndKey = new Map<string, string>();

    const validProjects = (projects || []).filter((p) => {
      if (!p || p.isDeleted) return false;
      if (storeFilter && storeFilter !== 'all' && String(p.store || '').toUpperCase().trim() !== storeFilter.toUpperCase().trim()) return false;
      if (globalYearFilter && globalYearFilter !== 'all' && String(p.year || '').trim() !== String(globalYearFilter).trim()) return false;
      return true;
    });

    for (let i = 0; i < validProjects.length; i++) {
      const p = validProjects[i];
      const pKey = String(p.id || p.code || '').trim();
      if (p.id) projectById.set(String(p.id).trim(), p);
      const compKey = `${String(p.code || '').trim().toLowerCase()}|${String(p.store || '').trim().toLowerCase()}|${String(p.year || '').trim()}`;
      projectByCompositeKey.set(compKey, p);
      const codeLower = String(p.code || '').trim().toLowerCase();
      if (codeLower) {
        const list = projectsByCodeLower.get(codeLower) || [];
        list.push(p);
        projectsByCodeLower.set(codeLower, list);
      }
      if (Array.isArray(p.taskSummaries)) {
        p.taskSummaries.forEach((s: any, idx: number) => {
          if (!s) return;
          const explicit = String(s.runningStatus || s.status || '').trim();
          if (!explicit) return;
          if (s.id) summaryStatusByProjAndKey.set(`${pKey}|id:${String(s.id).trim()}`, explicit);
          if (s.name) summaryStatusByProjAndKey.set(`${pKey}|name:${String(s.name).trim().toLowerCase()}`, explicit);
          summaryStatusByProjAndKey.set(`${pKey}|idx:${idx}`, explicit);
        });
      }
    }

    const resolveParentProjectForTask = (t: Partial<Task>): Project | undefined => {
      if (t.projectId) {
        const byId = projectById.get(String(t.projectId).trim());
        return byId && isTaskBelongsToProject(t, byId) ? byId : undefined;
      }
      const compKey = `${String(t.projectCode || '').trim().toLowerCase()}|${String(t.projectStore || '').trim().toLowerCase()}|${String(t.projectYear || '').trim()}`;
      const byComp = projectByCompositeKey.get(compKey);
      if (byComp && isTaskBelongsToProject(t, byComp)) return byComp;
      return projectsByCodeLower.get(String(t.projectCode || '').trim().toLowerCase())?.find((p) => isTaskBelongsToProject(t, p));
    };

    const allCandidateItems: UnifiedWorkItem[] = [];
    const directMatchedItems: UnifiedWorkItem[] = [];
    const taskById = new Map<string, Task>();
    const coveredProjectIdsWithTasks = new Set<string>();

    const activeTasks = (tasks || []).filter(
      (t) => t && !t.isDeleted && !isTaskDeletedInTracker(t.id, t.projectId ? String(t.projectId) : undefined)
    );

    const parentTaskIds = new Set<string>();
    const maxCompletedStartMsByProj = new Map<string, number>();

    for (let i = 0; i < activeTasks.length; i++) {
      const t = activeTasks[i];
      taskById.set(t.id, t);
      if (t.parentTaskId) parentTaskIds.add(String(t.parentTaskId));
      const rStat = String(t.runningStatus || '').trim().toLowerCase();
      const rApp = String(t.approval || '').trim().toLowerCase();
      if (rStat === 'completed' || rApp === 'approved') {
        const pId = String(t.projectId || t.projectCode || '').trim();
        const sMs = parseLocalDayMs(t.start);
        if (pId && sMs !== null) {
          const prev = maxCompletedStartMsByProj.get(pId) || 0;
          if (sMs > prev) maxCompletedStartMsByProj.set(pId, sMs);
        }
      }
    }

    // 1. Process Tasks (Real + Virtual Summary Tasks from useEnrichedData)
    for (let i = 0; i < activeTasks.length; i++) {
      const t = activeTasks[i];
      const proj = resolveParentProjectForTask(t);
      if (!proj) continue;
      const pKey = String(proj.id || proj.code || '').trim();
      if (proj.id) coveredProjectIdsWithTasks.add(String(proj.id));

      const isDirectFocusTask = Boolean(focusTarget?.taskId && String(t.id) === String(focusTarget.taskId));
      if ((t.isModularParent || parentTaskIds.has(t.id)) && t.approval !== 'ReqApproval' && !isDirectFocusTask) {
        continue;
      }

      const isVirtual = Boolean((t as any)._isVirtualSummary) || String(t.id || '').startsWith('ts_');
      const pYear = Number(proj.year || t.projectYear || currentYear);
      const isArchiveYear = pYear < currentYear;
      const startMs = parseLocalDayMs(t.start);
      const dueStr = t.finish || t.start || '';
      const dueMs = parseLocalDayMs(dueStr);
      const diffDays = dueMs !== null ? Math.round((dueMs - todayStartMs) / MS_PER_DAY) : null;

      const explicitSummaryStatus =
        summaryStatusByProjAndKey.get(`${pKey}|id:${String(t.id).trim()}`) ||
        summaryStatusByProjAndKey.get(`${pKey}|name:${String(t.name || '').trim().toLowerCase()}`) ||
        '';

      const effectiveRawStatus = isVirtual ? explicitSummaryStatus : String(t.runningStatus || '').trim();
      const rawStatusLower = effectiveRawStatus.toLowerCase();
      const rawApproval = String(t.approval || '').trim();
      const rawApprovalLower = rawApproval.toLowerCase();

      const isProjCompleted =
        proj.computedActProgress === 100 ||
        String(proj.mdStatus || '').toLowerCase() === 'completed' ||
        (!t.delegation && String(proj.computedStatus || '').toLowerCase() === 'completed');

      const maxCompStartMs = maxCompletedStartMsByProj.get(pKey) || 0;
      const plStatus = getTaskStatus(t.start, t.finish);

      const isExplicitlyCompleted = rawStatusLower === 'completed' || rawApprovalLower === 'approved';
      const isExplicitlyReopenedOrDelayed =
        rawStatusLower === 'delayed' ||
        rawStatusLower === 'needs rework' ||
        rawApprovalLower === 'rejected' ||
        rawApprovalLower === 'reqapproval' ||
        (isVirtual && (rawStatusLower === 'on process' || rawStatusLower === 'upcoming'));

      const isScheduleCompleted =
        !isExplicitlyReopenedOrDelayed &&
        (isProjCompleted ||
          (dueMs !== null && maxCompStartMs > 0 && dueMs <= maxCompStartMs) ||
          (!t.delegation && plStatus === 'Completed' && (isVirtual || rawStatusLower === '' || rawStatusLower === 'on process')));

      const isCompleted = isExplicitlyCompleted || isScheduleCompleted;
      const isNeedsRework =
        !isCompleted &&
        (rawApprovalLower === 'rejected' || rawApprovalLower === 'needs rework' || rawStatusLower === 'needs rework');
      const isAwaitingMyApproval =
        !isCompleted &&
        (rawApproval === 'ReqApproval' || rawApprovalLower === 'pending' || rawApprovalLower === 'waiting for approval');

      const isExplicitUpcoming = rawStatusLower === 'upcoming' || rawStatusLower === 'todo';
      const isInProgress =
        !isCompleted &&
        !isAwaitingMyApproval &&
        !isNeedsRework &&
        !isExplicitUpcoming &&
        (rawStatusLower === 'on process' ||
          rawStatusLower === 'in progress' ||
          rawStatusLower === 'delayed' ||
          plStatus === 'On process') &&
        !(startMs !== null && startMs > todayStartMs && !explicitSummaryStatus);

      const isOverdue = !isCompleted && diffDays !== null && diffDays < 0;
      const directPIC = checkPartyMatch(t.party) || (!t.party && checkPartyMatch(proj.party));
      const isPIC = directPIC || hasAllPartyPerm;
      const isApprover = isAwaitingMyApproval && isAdminOrManager;
      const canEdit = !isArchiveYear && (canWriteDetailPerm || isPIC || isAdminOrManager);

      let priority: WorkItemPriority = 'medium';
      if (isOverdue || isNeedsRework) priority = 'critical';
      else if (isAwaitingMyApproval || (diffDays !== null && diffDays <= 1)) priority = 'high';
      else if (isCompleted) priority = 'low';

      const kanbanColumn: MyWorkKanbanColumnId = isCompleted
        ? 'done'
        : isAwaitingMyApproval
        ? 'pending_approval'
        : isInProgress
        ? 'in_progress'
        : 'todo';

      const taskAttachmentCount = (t.comments || []).reduce((acc, c) => acc + (c.attachments?.length || 0), 0);

      const baseItem: UnifiedWorkItem = {
        id: `task_${t.id}`,
        type: 'task',
        kanbanColumn,
        title: t.name || 'Untitled Task',
        subtitle: t.taskCodePhu || proj.code,
        projectId: proj.id,
        projectCode: proj.code,
        projectName: proj.name || proj.code,
        projectStore: proj.store || t.projectStore || 'HCM',
        projectYear: proj.year || t.projectYear || '',
        floor: proj.location || '',
        dueDateStr: dueStr,
        startDateStr: t.start || '',
        dueDiffDays: diffDays,
        friendlyDueLabel: buildFriendlyDueLabel(diffDays, dueStr, isCompleted),
        priority,
        statusLabel: isNeedsRework
          ? 'Needs Rework'
          : isAwaitingMyApproval
          ? 'Pending Approval'
          : isCompleted
          ? 'Completed'
          : isInProgress
          ? 'On Process'
          : 'To Do',
        isCompleted,
        isOverdue,
        isNeedsRework,
        isInProgress,
        isAwaitingMyApproval,
        isPIC,
        isCreator: isAdminOrManager,
        isApprover,
        canEdit,
        canAccept: canEdit && !isInProgress && !isCompleted,
        canSubmitApproval: canEdit && !isCompleted,
        canApproveOrReject: !isArchiveYear && isAdminOrManager && isAwaitingMyApproval,
        party: t.party || proj.party || 'Unassigned',
        commentCount: (t.comments?.length || 0) + (proj.comments?.length || 0),
        attachmentCount: taskAttachmentCount,
        rawTask: t,
        rawProject: proj,
        rawSummaryId: t.id,
        isSummaryFallback: isVirtual,
      };

      const item = applyAccountOverrideToItem(baseItem, effectiveMyWorkStates, isArchiveYear, isAdminOrManager);
      allCandidateItems.push(item);
      if (directPIC || item.isApprover) directMatchedItems.push(item);
    }

    // 2. Fallback for any project with taskSummaries not yet in activeTasks
    const { candidates: sumCandidates, directMatched: sumDirect } = buildSummaryFallbackItems({
      validProjects,
      coveredProjectIdsWithTasks,
      todayStartMs,
      currentYear,
      checkPartyMatch,
      hasAllPartyPerm,
      isAdminOrManager,
      canWriteDetailPerm,
      effectiveMyWorkStates,
    });
    allCandidateItems.push(...sumCandidates);
    directMatchedItems.push(...sumDirect);

    // 3. Process Delegation Groups & Sub-Tasks
    const { candidates: delCandidates, directMatched: delDirect } = buildDelegationSubTaskItems({
      delegationGroups,
      validProjects,
      projectById,
      taskById,
      resolveParentProjectForTask,
      storeFilter,
      globalYearFilter,
      currentYear,
      todayStartMs,
      currentUserId: currentUser?.id,
      isAdmin,
      isAdminOrManager,
      canWriteDelegationPerm,
      hasAllPartyPerm,
      checkPartyMatch,
      effectiveMyWorkStates,
    });
    allCandidateItems.push(...delCandidates);
    directMatchedItems.push(...delDirect);

    // 4. Process Project Milestones (Handover / Opening)
    const { candidates: msCandidates, directMatched: msDirect } = buildProjectMilestoneItems({
      validProjects,
      todayStartMs,
      currentYear,
      focusTarget,
      fixedProjectCode,
      checkPartyMatch,
      hasAllPartyPerm,
      isAdminOrManager,
      canWriteDetailPerm,
      effectiveMyWorkStates,
    });
    allCandidateItems.push(...msCandidates);
    directMatchedItems.push(...msDirect);

    // Scope resolution (supports both QuickNav focusTarget and global fixedProjectCode)
    const hasFocusTarget = Boolean(focusTarget && (focusTarget.projectId || focusTarget.projectCode));
    const hasFixedCode = Boolean(fixedProjectCode && fixedProjectCode.trim());

    let baseStream: UnifiedWorkItem[] = hasFocusTarget
      ? allCandidateItems
          .filter((item) => isItemInFocusProject(item, focusTarget!))
          .map((item) => {
            const fTaskId = focusTarget!.taskId ? String(focusTarget!.taskId).trim() : '';
            const fTaskName = String(focusTarget!.taskName || '').trim().toLowerCase();
            const matchesTask =
              (fTaskId &&
                (String(item.rawTask?.id || '') === fTaskId ||
                  String(item.rawDelegationGroup?.parentTaskId || '') === fTaskId)) ||
              (fTaskName && String(item.title || '').trim().toLowerCase() === fTaskName);
            return matchesTask ? { ...item, isFocusedTarget: true } : item;
          })
      : hasFixedCode
      ? allCandidateItems.filter((item) => matchesFixedProject(item, fixedProjectCode))
      : directMatchedItems.length > 0
      ? directMatchedItems
      : hasAllPartyPerm
      ? allCandidateItems
      : directMatchedItems;

    if (hasFocusTarget && hasFixedCode) {
      baseStream = baseStream.filter((item) => matchesFixedProject(item, fixedProjectCode));
    }

    return partitionAndSortMyWorkStream({
      baseStream,
      statusFilter,
      searchQuery,
      timeFilter,
      sortBy,
      todayStartMs,
      hasProjectFocus: hasFocusTarget || hasFixedCode,
      hasSummaryFallbacks: allCandidateItems.some((i) => i.isSummaryFallback),
    });
  }, [
    projects,
    tasks,
    delegationGroups,
    currentUser,
    permissionMatrix,
    searchQuery,
    storeFilter,
    globalYearFilter,
    statusFilter,
    timeFilter,
    sortBy,
    focusTarget,
    fixedProjectCode,
  ]);
}
