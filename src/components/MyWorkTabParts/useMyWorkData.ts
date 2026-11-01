import { useMemo } from 'react';
import { AppRole, AppUser, DelegationGroup, PermissionMatrix, Project, Task } from '../../types';
import { isTaskBelongsToProject, isDelegationGroupBelongsToProject, matchesAdvancedSearch } from '../../lib/utils';
import { isTaskDeletedInTracker } from '../../lib/taskDeletedTracker';
import {
  MyWorkBriefingStats,
  MyWorkCounts,
  MyWorkFocusTarget,
  MyWorkKanbanColumnId,
  UnifiedWorkItem,
  WorkItemPriority,
} from './myWorkTypes';

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
  sortBy: 'urgency' | 'due_asc' | 'project' | 'priority';
  focusTarget?: MyWorkFocusTarget | null;
}

const MS_PER_DAY = 86400000;

function parseLocalDayMs(dateStr?: string | null): number | null {
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

function buildFriendlyDueLabel(diffDays: number | null, dateStr: string, isCompleted: boolean): string {
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

function parseParties(raw?: string): string[] {
  if (!raw) return [];
  return String(raw).toLowerCase().split(/[,;/+]+/).map((s) => s.trim()).filter(Boolean);
}

function isItemInFocusProject(item: UnifiedWorkItem, focus: MyWorkFocusTarget): boolean {
  if (focus.projectId && item.projectId) {
    return String(item.projectId).trim() === String(focus.projectId).trim();
  }
  const fCode = String(focus.projectCode || '').trim().toLowerCase();
  const iCode = String(item.projectCode || '').trim().toLowerCase();
  if (!fCode || fCode !== iCode) return false;
  if (focus.projectStore && item.projectStore) {
    if (String(focus.projectStore).trim().toLowerCase() !== String(item.projectStore).trim().toLowerCase()) return false;
  }
  if (focus.projectYear && item.projectYear) {
    if (String(focus.projectYear).trim() !== String(item.projectYear).trim()) return false;
  }
  return true;
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
  sortBy,
  focusTarget,
}: UseMyWorkDataParams) {
  return useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const todayStartMs = new Date(currentYear, now.getMonth(), now.getDate()).getTime();
    const usernameLower = String(currentUser?.username || '').toLowerCase().trim();
    const userIdLower = String(currentUser?.id || '').toLowerCase().trim();
    const isAdmin = currentUser?.role === 'admin';
    const role = (currentUser?.role || 'Staff') as AppRole;
    const isAdminOrManager =
      isAdmin || String(role).toLowerCase() === 'manager' || String(role).toUpperCase() === 'CP';

    const canWriteDetailPerm = isAdmin || Boolean(permissionMatrix?.[role]?.Write?.detail) || Boolean(currentUser?.canWrite);
    const canWriteDelegationPerm = isAdmin || Boolean(permissionMatrix?.[role]?.Write?.taskDelegation);

    const userSpecificParties = new Set<string>();
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

    const validProjects = (projects || []).filter((p) => {
      if (!p || p.isDeleted) return false;
      if (storeFilter && storeFilter !== 'all' && String(p.store || '').toUpperCase().trim() !== storeFilter.toUpperCase().trim()) return false;
      if (globalYearFilter && globalYearFilter !== 'all' && String(p.year || '').trim() !== String(globalYearFilter).trim()) return false;
      return true;
    });

    for (let i = 0; i < validProjects.length; i++) {
      const p = validProjects[i];
      if (p.id) projectById.set(String(p.id).trim(), p);
      const compKey = `${String(p.code || '').trim().toLowerCase()}|${String(p.store || '').trim().toLowerCase()}|${String(p.year || '').trim()}`;
      projectByCompositeKey.set(compKey, p);
      const codeLower = String(p.code || '').trim().toLowerCase();
      if (codeLower) {
        const list = projectsByCodeLower.get(codeLower) || [];
        list.push(p);
        projectsByCodeLower.set(codeLower, list);
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
    const coveredProjectIdsWithRealTasks = new Set<string>();

    // 1. Process Real Tasks (if already in memory from Dexie / Delta)
    const activeTasks = (tasks || []).filter(
      (t) => t && !t.isDeleted && !isTaskDeletedInTracker(t.id, t.projectId ? String(t.projectId) : undefined)
    );

    const parentTaskIds = new Set<string>();
    for (let i = 0; i < activeTasks.length; i++) {
      const t = activeTasks[i];
      taskById.set(t.id, t);
      if (t.parentTaskId) parentTaskIds.add(String(t.parentTaskId));
    }

    for (let i = 0; i < activeTasks.length; i++) {
      const t = activeTasks[i];
      const proj = resolveParentProjectForTask(t);
      if (!proj) continue;
      if (proj.id) coveredProjectIdsWithRealTasks.add(String(proj.id));
      const isDirectFocusTask = Boolean(focusTarget?.taskId && String(t.id) === String(focusTarget.taskId));
      if (parentTaskIds.has(t.id) && t.approval !== 'ReqApproval' && !isDirectFocusTask) continue;

      const pYear = Number(proj.year || t.projectYear || currentYear);
      const isArchiveYear = pYear < currentYear;
      const dueStr = t.finish || t.start || '';
      const dueMs = parseLocalDayMs(dueStr);
      const diffDays = dueMs !== null ? Math.round((dueMs - todayStartMs) / MS_PER_DAY) : null;

      const rawStatus = String(t.runningStatus || '').trim();
      const rawApproval = String(t.approval || '').trim();
      const isCompleted = rawStatus.toLowerCase() === 'completed' || rawApproval.toLowerCase() === 'approved';
      const isNeedsRework =
        rawApproval.toLowerCase() === 'rejected' ||
        rawApproval.toLowerCase() === 'needs rework' ||
        rawStatus.toLowerCase() === 'needs rework';
      const isAwaitingMyApproval =
        !isCompleted &&
        (rawApproval === 'ReqApproval' || rawApproval.toLowerCase() === 'pending' || rawApproval.toLowerCase() === 'waiting for approval');
      const isInProgress =
        !isCompleted &&
        !isAwaitingMyApproval &&
        !isNeedsRework &&
        (rawStatus.toLowerCase() === 'on process' || rawStatus.toLowerCase() === 'in progress');
      const isOverdue = !isCompleted && diffDays !== null && diffDays < 0;

      const directPIC = checkPartyMatch(t.party) || (!t.party && checkPartyMatch(proj.party));
      const isPIC = directPIC || hasAllPartyPerm;
      const isApprover = isAwaitingMyApproval && isAdminOrManager;
      const canEdit = !isArchiveYear && canWriteDetailPerm && isPIC;

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

      const taskAttachmentCount = (t.comments || []).reduce(
        (acc, c) => acc + (c.attachments?.length || 0),
        0
      );

      const item: UnifiedWorkItem = {
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
          : rawStatus || 'To Do',
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
      };

      allCandidateItems.push(item);
      if (directPIC || isApprover) directMatchedItems.push(item);
    }

    // 2. Priority Summary-First (0 Firestore Read): Build from Project.taskSummaries whenever real tasks aren't loaded yet
    for (let i = 0; i < validProjects.length; i++) {
      const proj = validProjects[i];
      if (proj.id && coveredProjectIdsWithRealTasks.has(String(proj.id))) continue;
      const pYear = Number(proj.year || currentYear);
      const isArchiveYear = pYear < currentYear;
      const summaries = Array.isArray(proj.taskSummaries) ? proj.taskSummaries : [];
      for (let j = 0; j < summaries.length; j++) {
        const s: any = summaries[j];
        if (!s || !s.name) continue;
        const dueStr = s.finish || s.start || '';
        const dueMs = parseLocalDayMs(dueStr);
        const diffDays = dueMs !== null ? Math.round((dueMs - todayStartMs) / MS_PER_DAY) : null;
        const rawStatus = String(s.runningStatus || s.status || '').trim();
        const isCompleted = rawStatus.toLowerCase() === 'completed';
        const isInProgress =
          !isCompleted &&
          (rawStatus.toLowerCase() === 'on process' ||
            rawStatus.toLowerCase() === 'in progress' ||
            (dueMs !== null && parseLocalDayMs(s.start) !== null && parseLocalDayMs(s.start)! <= todayStartMs));
        const isOverdue = !isCompleted && diffDays !== null && diffDays < 0;
        const directPIC = checkPartyMatch(s.party || proj.party);
        const isPIC = directPIC || hasAllPartyPerm;
        const canEdit = !isArchiveYear && canWriteDetailPerm && isPIC;

        const kanbanColumn: MyWorkKanbanColumnId = isCompleted
          ? 'done'
          : isInProgress
          ? 'in_progress'
          : 'todo';

        const item: UnifiedWorkItem = {
          id: `sum_${proj.id}_${s.id || j}`,
          type: 'task',
          kanbanColumn,
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
          statusLabel: isCompleted ? 'Completed' : isInProgress ? 'On Process' : rawStatus || 'To Do',
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
          isSummaryFallback: true,
        };
        allCandidateItems.push(item);
        if (directPIC) directMatchedItems.push(item);
      }
    }

    // 3. Process Delegation Groups & Sub-Tasks (Strict RBAC & Approval State Machine)
    const activeGroups = (delegationGroups || []).filter((g) => g && !g.isDeleted);
    for (let i = 0; i < activeGroups.length; i++) {
      const g = activeGroups[i];
      const linkedTask = g.parentTaskId ? taskById.get(g.parentTaskId) : undefined;
      const proj =
        (g.projectId ? projectById.get(String(g.projectId).trim()) : undefined) ||
        (linkedTask ? resolveParentProjectForTask(linkedTask) : undefined) ||
        validProjects.find((p) => isDelegationGroupBelongsToProject(g, p));

      if (storeFilter && storeFilter !== 'all' && String(proj?.store || g.projectStore || '').toUpperCase().trim() !== storeFilter.toUpperCase().trim()) continue;
      if (globalYearFilter && globalYearFilter !== 'all' && String(proj?.year || g.projectYear || '').trim() !== String(globalYearFilter).trim()) continue;

      const pYear = Number(proj?.year || g.projectYear || currentYear);
      const isArchiveYear = pYear < currentYear;
      // Strict Delegation Creator Check (Matches TaskDelegationDesktopSubTaskRow.tsx line 51 & 474)
      const isCreator = Boolean(currentUser?.id && g.createdBy && String(g.createdBy) === String(currentUser.id)) || isAdmin;

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
        else if (isAwaitingApproval || st.priority === 'Mid-high' || (diffDays !== null && diffDays <= 1)) priority = 'high';
        else if (isCompleted) priority = 'low';

        const kanbanColumn: MyWorkKanbanColumnId = isCompleted
          ? 'done'
          : isAwaitingApproval
          ? 'pending_approval'
          : isInProgress
          ? 'in_progress'
          : 'todo';

        const subTitleText = st.name || st.comments || g.name || 'Delegated Sub-task';
        const attCount = (st.attachments?.length || 0) + (st.fileUrl || st.childFileUrl ? 1 : 0);

        const item: UnifiedWorkItem = {
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

        allCandidateItems.push(item);
        if (directPIC || isCreator) directMatchedItems.push(item);
      }
    }

    // 4. Process Project Milestones (Handover / Opening)
    for (let i = 0; i < validProjects.length; i++) {
      const p = validProjects[i];
      const directProjMatch = checkPartyMatch(p.party);
      const isFocusedProj = Boolean(
        focusTarget &&
          ((focusTarget.projectId && p.id && String(p.id) === String(focusTarget.projectId)) ||
            String(p.code || '').trim().toLowerCase() === String(focusTarget.projectCode || '').trim().toLowerCase())
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

        const isCompleted = p.computedActProgress === 100 || String(p.mdStatus || '').toLowerCase() === 'completed';
        const item: UnifiedWorkItem = {
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
          canEdit: false,
          canAccept: false,
          canSubmitApproval: false,
          canApproveOrReject: false,
          party: p.party || 'PMO',
          commentCount: p.comments?.length || 0,
          attachmentCount: 0,
          milestoneKind: ms.kind,
          rawProject: p,
        };
        allCandidateItems.push(item);
        if (directProjMatch) directMatchedItems.push(item);
      }
    }

    // Scope resolution
    let baseStream: UnifiedWorkItem[];
    if (focusTarget && (focusTarget.projectId || focusTarget.projectCode)) {
      const fTaskId = focusTarget.taskId ? String(focusTarget.taskId).trim() : '';
      const fTaskName = String(focusTarget.taskName || '').trim().toLowerCase();
      baseStream = allCandidateItems
        .filter((item) => isItemInFocusProject(item, focusTarget))
        .map((item) => {
          const matchesTask =
            (fTaskId &&
              (String(item.rawTask?.id || '') === fTaskId ||
                String(item.rawDelegationGroup?.parentTaskId || '') === fTaskId)) ||
            (fTaskName && String(item.title || '').trim().toLowerCase() === fTaskName);
          return matchesTask ? { ...item, isFocusedTarget: true } : item;
        });
    } else {
      baseStream =
        directMatchedItems.length > 0 ? directMatchedItems : hasAllPartyPerm ? allCandidateItems : directMatchedItems;
    }

    // Briefing stats across the user's stream (before status/search sub-filtering)
    let totalActiveTasks = 0;
    let criticalUrgentCount = 0;
    let highPriorityCount = 0;
    let normalActiveCount = 0;
    let upcomingMilestonesCount = 0;
    let dueThisWeekCount = 0;
    let delegationsActiveCount = 0;
    let delegationsMyPICCount = 0;
    let pendingMyApprovalCount = 0;
    let needsReworkCount = 0;

    for (let i = 0; i < baseStream.length; i++) {
      const it = baseStream[i];
      if (!it.isCompleted) {
        totalActiveTasks++;
        if (it.priority === 'critical' || it.isOverdue) criticalUrgentCount++;
        else if (it.priority === 'high') highPriorityCount++;
        else normalActiveCount++;

        if (it.type === 'project_milestone') upcomingMilestonesCount++;
        if (it.dueDiffDays !== null && it.dueDiffDays >= 0 && it.dueDiffDays <= 7) dueThisWeekCount++;
        if (it.type === 'delegation_subtask') {
          delegationsActiveCount++;
          if (it.isPIC) delegationsMyPICCount++;
        }
        if (it.isAwaitingMyApproval) pendingMyApprovalCount++;
        if (it.isNeedsRework) needsReworkCount++;
      }
    }

    const briefingStats: MyWorkBriefingStats = {
      totalActiveTasks,
      criticalUrgentCount,
      highPriorityCount,
      normalActiveCount,
      upcomingMilestonesCount,
      dueThisWeekCount,
      delegationsActiveCount,
      delegationsMyPICCount,
      pendingMyApprovalCount,
      needsReworkCount,
    };

    const filteredStream = baseStream.filter((item) => {
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
      else if (item.dueDiffDays === 0 || item.isFocusedTarget) todayItems.push(item);
      else if (item.dueDiffDays !== null && item.dueDiffDays >= 1 && item.dueDiffDays <= 7) weekItems.push(item);
      else if (item.dueDiffDays !== null && (item.dueDiffDays > 7 && (item.dueDiffDays <= 30 || Boolean(focusTarget)))) monthItems.push(item);
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
      inbox: approvalItems.length + overdueItems.filter((i) => i.isNeedsRework).length,
      upcoming: weekItems.length + monthItems.length,
      done: doneItems.length,
      overdue: overdueItems.length,
      todayTodo: todayItems.length + overdueItems.length,
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
    sortBy,
    focusTarget,
  ]);
}
