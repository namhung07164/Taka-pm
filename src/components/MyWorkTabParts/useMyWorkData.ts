import { useMemo } from 'react';
import { AppUser, DelegationGroup, Project, Task } from '../../types';
import { isTaskBelongsToProject, isDelegationGroupBelongsToProject, matchesAdvancedSearch } from '../../lib/utils';
import { isTaskDeletedInTracker } from '../../lib/taskDeletedTracker';
import { MyWorkCounts, MyWorkFocusTarget, UnifiedWorkItem, WorkItemPriority } from './myWorkTypes';

interface UseMyWorkDataParams {
  projects: Project[];
  tasks: Task[];
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
  searchQuery: string;
  storeFilter: string;
  globalYearFilter: string;
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
  searchQuery,
  storeFilter,
  globalYearFilter,
  focusTarget,
}: UseMyWorkDataParams) {
  return useMemo(() => {
    const now = new Date();
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const usernameLower = String(currentUser?.username || '').toLowerCase().trim();
    const userIdLower = String(currentUser?.id || '').toLowerCase().trim();
    const isAdminOrManager =
      currentUser?.role === 'admin' ||
      String(currentUser?.role || '').toLowerCase() === 'manager' ||
      String(currentUser?.role || '').toUpperCase() === 'CP';

    const userSpecificParties = new Set<string>();
    if (currentUser?.partyPermissions) {
      Object.entries(currentUser.partyPermissions).forEach(([k, val]) => {
        if (val && k.toLowerCase().trim() !== 'all') userSpecificParties.add(k.toLowerCase().trim());
      });
    }
    const hasAllPartyPerm = currentUser?.role === 'admin' || currentUser?.partyPermissions?.all === true;

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

    // 1. Process Real Tasks
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
      const isOverdue = !isCompleted && diffDays !== null && diffDays < 0;

      const directPIC = checkPartyMatch(t.party) || (!t.party && checkPartyMatch(proj.party));
      const isApprover = isAwaitingMyApproval && isAdminOrManager;

      let priority: WorkItemPriority = 'medium';
      if (isOverdue || isNeedsRework) priority = 'critical';
      else if (isAwaitingMyApproval || (diffDays !== null && diffDays <= 1)) priority = 'high';
      else if (isCompleted) priority = 'low';

      const item: UnifiedWorkItem = {
        id: `task_${t.id}`,
        type: 'task',
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
          : rawStatus || 'On Process',
        isCompleted,
        isOverdue,
        isNeedsRework,
        isAwaitingMyApproval,
        isPIC: directPIC || hasAllPartyPerm,
        isApprover,
        party: t.party || proj.party || 'Unassigned',
        rawTask: t,
        rawProject: proj,
      };

      allCandidateItems.push(item);
      if (directPIC || isApprover) directMatchedItems.push(item);
    }

    // 2. 0ms Fallback to Project.taskSummaries if tasks haven't finished hydrating
    for (let i = 0; i < validProjects.length; i++) {
      const proj = validProjects[i];
      if (proj.id && coveredProjectIdsWithRealTasks.has(String(proj.id))) continue;
      const summaries = Array.isArray(proj.taskSummaries) ? proj.taskSummaries : [];
      for (let j = 0; j < summaries.length; j++) {
        const s: any = summaries[j];
        if (!s || !s.name) continue;
        const dueStr = s.finish || s.start || '';
        const dueMs = parseLocalDayMs(dueStr);
        const diffDays = dueMs !== null ? Math.round((dueMs - todayStartMs) / MS_PER_DAY) : null;
        const rawStatus = String(s.runningStatus || s.status || '').trim();
        const isCompleted = rawStatus.toLowerCase() === 'completed';
        const isOverdue = !isCompleted && diffDays !== null && diffDays < 0;
        const directPIC = checkPartyMatch(s.party || proj.party);

        const item: UnifiedWorkItem = {
          id: `sum_${proj.id}_${s.id || j}`,
          type: 'task',
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
          statusLabel: isCompleted ? 'Completed' : rawStatus || 'On Process',
          isCompleted,
          isOverdue,
          isNeedsRework: false,
          isAwaitingMyApproval: false,
          isPIC: directPIC || hasAllPartyPerm,
          isApprover: false,
          party: s.party || proj.party || 'PMO',
          rawProject: proj,
          isSummaryFallback: true,
        };
        allCandidateItems.push(item);
        if (directPIC) directMatchedItems.push(item);
      }
    }

    // 3. Process Delegation Groups & Sub-Tasks
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

      const isGroupCreator =
        Boolean(currentUser?.id && g.createdBy && String(g.createdBy) === String(currentUser.id)) || isAdminOrManager;

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
          appStatus.toLowerCase() === 'needs rework' ||
          appStatus.toLowerCase() === 'rejected';

        const isAwaitingApproval =
          !isCompleted &&
          ['Pending completed', 'ReqApproval', 'Waiting for approval'].some(
            (s) => stStatus === s || delStatus === s || appStatus === s
          );

        const isOverdue = !isCompleted && diffDays !== null && diffDays < 0;
        const directPIC = checkPartyMatch(st.party, st.involvedUsers);
        const isApprover = isAwaitingApproval && isGroupCreator;

        let priority: WorkItemPriority = 'medium';
        if (isOverdue || isNeedsRework || st.priority === 'High') priority = 'critical';
        else if (isAwaitingApproval || st.priority === 'Mid-high' || (diffDays !== null && diffDays <= 1)) priority = 'high';
        else if (isCompleted) priority = 'low';

        const subTitleText = st.name || st.comments || g.name || 'Delegated Sub-task';
        const item: UnifiedWorkItem = {
          id: `del_${g.id}_${st.id}`,
          type: 'delegation_subtask',
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
            ? 'Waiting Approval'
            : isCompleted
            ? 'Approved'
            : stStatus || 'Assigned',
          isCompleted,
          isOverdue,
          isNeedsRework,
          isAwaitingMyApproval: isAwaitingApproval,
          isPIC: directPIC || hasAllPartyPerm,
          isApprover,
          party: st.party || 'Assigned',
          rawProject: proj,
          rawTask: linkedTask,
          rawDelegationGroup: g,
          rawSubTask: st,
        };

        allCandidateItems.push(item);
        if (directPIC || isApprover) directMatchedItems.push(item);
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
          isAwaitingMyApproval: false,
          isPIC: directProjMatch || hasAllPartyPerm,
          isApprover: false,
          party: p.party || 'PMO',
          milestoneKind: ms.kind,
          rawProject: p,
        };
        allCandidateItems.push(item);
        if (directProjMatch) directMatchedItems.push(item);
      }
    }

    // If Quick Navigator focused on a specific project/task, include all related work items of that project
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

    const filteredStream = searchQuery.trim()
      ? baseStream.filter((item) =>
          matchesAdvancedSearch(searchQuery, [
            item.title,
            item.projectCode,
            item.projectName,
            item.floor || '',
            item.party,
            item.statusLabel,
          ])
        )
      : baseStream;

    const sortByUrgency = (a: UnifiedWorkItem, b: UnifiedWorkItem) => {
      if (a.isFocusedTarget && !b.isFocusedTarget) return -1;
      if (!a.isFocusedTarget && b.isFocusedTarget) return 1;
      const da = a.dueDiffDays ?? 9999;
      const db = b.dueDiffDays ?? 9999;
      return da !== db ? da - db : a.projectCode.localeCompare(b.projectCode);
    };

    const overdueItems: UnifiedWorkItem[] = [];
    const approvalItems: UnifiedWorkItem[] = [];
    const todayItems: UnifiedWorkItem[] = [];
    const weekItems: UnifiedWorkItem[] = [];
    const monthItems: UnifiedWorkItem[] = [];
    const doneItems: UnifiedWorkItem[] = [];

    for (let i = 0; i < filteredStream.length; i++) {
      const item = filteredStream[i];
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

    overdueItems.sort(sortByUrgency);
    approvalItems.sort(sortByUrgency);
    todayItems.sort(sortByUrgency);
    weekItems.sort(sortByUrgency);
    monthItems.sort(sortByUrgency);
    doneItems.sort((a, b) => (a.isFocusedTarget === b.isFocusedTarget ? (b.dueDateStr || '').localeCompare(a.dueDateStr || '') : a.isFocusedTarget ? -1 : 1));

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
      counts,
    };
  }, [projects, tasks, delegationGroups, currentUser, searchQuery, storeFilter, globalYearFilter, focusTarget]);
}
