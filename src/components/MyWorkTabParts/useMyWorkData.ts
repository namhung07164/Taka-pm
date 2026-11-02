import { useMemo } from 'react';
import { AppRole, AppUser, DelegationGroup, PermissionMatrix, Project, Task } from '../../types';
import {
  getTaskStatus,
  isTaskBelongsToProject,
  matchesAdvancedSearch,
} from '../../lib/utils';
import { isTaskDeletedInTracker } from '../../lib/taskDeletedTracker';
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
  loadLocalMyWorkStates,
  mergeMyWorkStates,
} from './myWorkAccountSync';
import {
  MS_PER_DAY,
  applyAccountOverrideToItem,
  buildFriendlyDueLabel,
  buildProjectMilestoneItems,
  isItemInFocusProject,
  isItemScheduledForToday,
  matchesTimeFilter,
  normalizeRole,
  parseLocalDayMs,
  parseParties,
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
      checkPartyMatch,
      hasAllPartyPerm,
      isAdminOrManager,
      canWriteDetailPerm,
      effectiveMyWorkStates,
    });
    allCandidateItems.push(...msCandidates);
    directMatchedItems.push(...msDirect);

    // Scope resolution
    const baseStream: UnifiedWorkItem[] =
      focusTarget && (focusTarget.projectId || focusTarget.projectCode)
        ? allCandidateItems
            .filter((item) => isItemInFocusProject(item, focusTarget))
            .map((item) => {
              const fTaskId = focusTarget.taskId ? String(focusTarget.taskId).trim() : '';
              const fTaskName = String(focusTarget.taskName || '').trim().toLowerCase();
              const matchesTask =
                (fTaskId &&
                  (String(item.rawTask?.id || '') === fTaskId ||
                    String(item.rawDelegationGroup?.parentTaskId || '') === fTaskId)) ||
                (fTaskName && String(item.title || '').trim().toLowerCase() === fTaskName);
              return matchesTask ? { ...item, isFocusedTarget: true } : item;
            })
        : directMatchedItems.length > 0
        ? directMatchedItems
        : hasAllPartyPerm
        ? allCandidateItems
        : directMatchedItems;

    // Briefing stats across the user's stream
    const briefingStats: MyWorkBriefingStats = {
      totalActiveTasks: 0,
      criticalUrgentCount: 0,
      highPriorityCount: 0,
      normalActiveCount: 0,
      upcomingMilestonesCount: 0,
      dueThisWeekCount: 0,
      delegationsActiveCount: 0,
      delegationsMyPICCount: 0,
      pendingMyApprovalCount: 0,
      needsReworkCount: 0,
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

    // Filter by status & search first so Time Filter chip counts reflect active items in the current search/type filter
    const searchAndStatusStream = baseStream.filter((item) => {
      if (statusFilter === 'overdue' && !item.isOverdue && !item.isNeedsRework) return false;
      if (statusFilter === 'approval' && !item.isAwaitingMyApproval && !item.isNeedsRework) return false;
      if (statusFilter === 'delegation' && item.type !== 'delegation_subtask') return false;
      if (statusFilter === 'milestone' && item.type !== 'project_milestone') return false;
      if (!searchQuery.trim()) return true;
      return matchesAdvancedSearch(searchQuery, [
        item.title,
        item.projectCode,
        item.projectName,
        item.floor || '',
        item.party,
        item.statusLabel,
      ]);
    });

    // Compute Time Filter badge counts across active items before applying timeFilter
    let allActiveCount = 0;
    let todayFocusCount = 0;
    let todayOnlyCount = 0;
    let thisWeekCount = 0;
    let thisMonthCount = 0;
    let overdueCount = 0;
    let futureCount = 0;
    let inboxCount = 0;
    let totalDoneCount = 0;

    for (let i = 0; i < searchAndStatusStream.length; i++) {
      const it = searchAndStatusStream[i];
      if (it.isCompleted) {
        totalDoneCount++;
        continue;
      }
      allActiveCount++;
      const isToday = isItemScheduledForToday(it, todayStartMs);
      const diff = it.dueDiffDays;
      if (it.isOverdue || it.isNeedsRework) overdueCount++;
      if (isToday) todayOnlyCount++;
      if (it.isOverdue || it.isNeedsRework || isToday || it.isAwaitingMyApproval || (diff !== null && diff <= 0)) {
        todayFocusCount++;
      }
      if (isToday || (diff !== null && diff >= 0 && diff <= 7)) thisWeekCount++;
      if (isToday || (diff !== null && diff >= 0 && diff <= 30)) thisMonthCount++;
      if (diff === null || diff > 30) futureCount++;
      if (it.isAwaitingMyApproval || it.isNeedsRework) inboxCount++;
    }

    // Apply Time Horizon Filter
    const filteredStream = searchAndStatusStream.filter((item) =>
      matchesTimeFilter(item, timeFilter, todayStartMs)
    );

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

    const overdueItems: UnifiedWorkItem[] = [];
    const approvalItems: UnifiedWorkItem[] = [];
    const todayItems: UnifiedWorkItem[] = [];
    const weekItems: UnifiedWorkItem[] = [];
    const monthItems: UnifiedWorkItem[] = [];
    const doneItems: UnifiedWorkItem[] = [];
    const kanbanTodo: UnifiedWorkItem[] = [];
    const kanbanInProgress: UnifiedWorkItem[] = [];
    const kanbanPendingApproval: UnifiedWorkItem[] = [];
    const kanbanDone: UnifiedWorkItem[] = [];

    for (let i = 0; i < filteredStream.length; i++) {
      const item = filteredStream[i];
      if (item.kanbanColumn === 'done') kanbanDone.push(item);
      else if (item.kanbanColumn === 'pending_approval') kanbanPendingApproval.push(item);
      else if (item.kanbanColumn === 'in_progress') kanbanInProgress.push(item);
      else kanbanTodo.push(item);

      if (item.isCompleted) {
        doneItems.push(item);
        continue;
      }
      if (item.isAwaitingMyApproval) approvalItems.push(item);
      if (item.isOverdue || item.isNeedsRework) overdueItems.push(item);
      else if (isItemScheduledForToday(item, todayStartMs) || item.isFocusedTarget) todayItems.push(item);
      else if (item.dueDiffDays !== null && item.dueDiffDays >= 1 && item.dueDiffDays <= 7) weekItems.push(item);
      else if (item.dueDiffDays !== null && item.dueDiffDays > 7 && (item.dueDiffDays <= 30 || Boolean(focusTarget))) monthItems.push(item);
      else if (item.dueDiffDays === null && !item.isAwaitingMyApproval) todayItems.push(item);
    }

    overdueItems.sort(sortFn);
    approvalItems.sort(sortFn);
    todayItems.sort(sortFn);
    weekItems.sort(sortFn);
    monthItems.sort(sortFn);
    doneItems.sort((a, b) => (a.isFocusedTarget === b.isFocusedTarget ? (b.dueDateStr || '').localeCompare(a.dueDateStr || '') : a.isFocusedTarget ? -1 : 1));
    kanbanTodo.sort(sortFn);
    kanbanInProgress.sort(sortFn);
    kanbanPendingApproval.sort(sortFn);
    kanbanDone.sort((a, b) => (a.isFocusedTarget === b.isFocusedTarget ? (b.dueDateStr || '').localeCompare(a.dueDateStr || '') : a.isFocusedTarget ? -1 : 1));

    const counts: MyWorkCounts = {
      today: overdueItems.length + todayItems.length,
      inbox: inboxCount,
      upcoming: weekItems.length + monthItems.length,
      done: totalDoneCount,
      overdue: overdueCount,
      todayTodo: todayItems.length + overdueItems.length,
      allActive: allActiveCount,
      todayFocus: todayFocusCount,
      todayOnly: todayOnlyCount,
      thisWeek: thisWeekCount,
      thisMonth: thisMonthCount,
      future: futureCount,
    };

    return {
      overdueItems,
      approvalItems,
      todayItems,
      weekItems,
      monthItems,
      doneItems: doneItems.slice(0, 60),
      kanbanTodo,
      kanbanInProgress,
      kanbanPendingApproval,
      kanbanDone: kanbanDone.slice(0, 60),
      counts,
      briefingStats,
      hasSummaryFallbacks: allCandidateItems.some((i) => i.isSummaryFallback),
    };
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
  ]);
}
