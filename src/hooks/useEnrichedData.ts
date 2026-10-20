import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { enrichProjects, getUserAllowedStores } from '../lib/utils';
import { Task } from '../types';
import { deduplicateTasks } from '../lib/taskDeduplicationService';
import { rollupParentTaskDatesAndStatus } from '../lib/taskRollupService';
import { isTaskDeletedInTracker } from '../lib/taskDeletedTracker';
import { buildTaskByIdMap, isForeignSummaryEntry } from '../lib/summaryGhostFilter';

let _lastProjectsRef: any = null;
let _lastRawTasksRef: any = null;
let _lastDelegationGroupsRef: any = null;
let _lastCurrentUserRef: any = null;
let _lastEnrichedResult: {
  enrichedProjects: any[];
  filteredTasks: any[];
  visibleDelegationGroups: any[];
} | null = null;

export function useEnrichedData() {
  const projects = useAppStore(state => state.projects);
  const rawTasks = useAppStore(state => state.tasks);
  const delegationGroups = useAppStore(state => state.delegationGroups);
  const currentUser = useAppStore(state => state.currentUser)!;

  return useMemo(() => {
    if (
      _lastProjectsRef === projects &&
      _lastRawTasksRef === rawTasks &&
      _lastDelegationGroupsRef === delegationGroups &&
      _lastCurrentUserRef === currentUser &&
      _lastEnrichedResult
    ) {
      return _lastEnrichedResult;
    }

    const deduped = deduplicateTasks(rawTasks);
    const tasks = rollupParentTaskDatesAndStatus(deduped, delegationGroups);
    const enriched = enrichProjects(projects, tasks, delegationGroups);

    // Pre-index real tasks in O(T) to eliminate O(P * T) .some() scans per project
    const taskByIdFallback = buildTaskByIdMap(tasks);
    const consolidatedTasks = [...tasks];
    const allExistingIds = new Set<string>();
    const realTasksByProjectId = new Set<string>();
    const realTasksByCodeScope = new Set<string>();

    for (let i = 0; i < consolidatedTasks.length; i++) {
      const ft = consolidatedTasks[i];
      if (!ft) continue;
      if (ft.id) {
        allExistingIds.add(String(ft.id).toLowerCase());
      }
      if (ft.isDeleted || (ft as any)._isVirtualSummary) continue;

      const ftProjId = ft.projectId ? String(ft.projectId).trim() : '';
      if (ftProjId) {
        realTasksByProjectId.add(ftProjId);
      }

      const ftCode = String(ft.projectCode || '').trim().toLowerCase();
      if (ftCode) {
        const ftStore = ft.projectStore ? String(ft.projectStore).trim().toLowerCase() : '';
        const ftYear = ft.projectYear !== undefined && ft.projectYear !== null ? String(ft.projectYear).trim().toLowerCase() : '';
        realTasksByCodeScope.add(`${ftCode}|${ftStore}|${ftYear}`);
        if (ftStore) realTasksByCodeScope.add(`${ftCode}|${ftStore}|*`);
        if (ftYear) realTasksByCodeScope.add(`${ftCode}|*|${ftYear}`);
        realTasksByCodeScope.add(`${ftCode}|*|*`);
      }
    }

    // Consolidate virtual tasks for unhydrated projects in O(P)
    for (let pIdx = 0; pIdx < enriched.length; pIdx++) {
      const p = enriched[pIdx];
      if (!p.taskSummaries || !Array.isArray(p.taskSummaries) || p.taskSummaries.length === 0) continue;

      const pIdStr = p.id ? String(p.id).trim() : '';
      let hasRealProjectTasks = Boolean(pIdStr && realTasksByProjectId.has(pIdStr));

      if (!hasRealProjectTasks) {
        const pStore = String(p.store || '').trim().toLowerCase();
        const pYear = String(p.year || '').trim().toLowerCase();
        const rawCodeStr = p.linkCodes ? `${p.code || ''}, ${p.linkCodes}` : String(p.code || '');
        const pCodeParts = rawCodeStr.toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);

        for (let cIdx = 0; cIdx < pCodeParts.length; cIdx++) {
          const cp = pCodeParts[cIdx];
          if (
            realTasksByCodeScope.has(`${cp}|${pStore}|${pYear}`) ||
            (!pYear && realTasksByCodeScope.has(`${cp}|${pStore}|*`)) ||
            (!pStore && realTasksByCodeScope.has(`${cp}|*|${pYear}`))
          ) {
            hasRealProjectTasks = true;
            break;
          }
        }
      }

      if (hasRealProjectTasks) continue;

      p.taskSummaries.forEach((ts: any, idx: number) => {
        if (isTaskDeletedInTracker(ts.id, pIdStr || undefined)) return;
        if (isForeignSummaryEntry(ts.id, p, taskByIdFallback)) return;
        if (!Boolean((ts.name && String(ts.name).trim()) || (ts.start && String(ts.start).trim()) || (ts.finish && String(ts.finish).trim()) || ts.taskCodePhu)) {
          return;
        }

        const rawTsId = ts.id ? String(ts.id).trim() : '';
        const tsId = rawTsId || `ts_${p.id || p.code}_${p.store || 'HCM'}_${p.year || ''}_${idx}`;
        const tsIdLower = tsId.toLowerCase();

        if (!allExistingIds.has(tsIdLower)) {
          allExistingIds.add(tsIdLower);
          const vTask = {
            id: tsId,
            name: (ts.name && String(ts.name).trim()) ? ts.name : (ts.taskCodePhu || `Task ${idx + 1}`),
            start: ts.start || p.computedTakStart || p.start || '',
            finish: ts.finish || p.computedTakCompl || p.handover || '',
            projectCode: p.code || '',
            projectStore: p.store || 'HCM',
            projectYear: p.year ? String(p.year) : '',
            party: ts.party || p.party || '',
            runningStatus: ts.runningStatus || 'On process',
            duration: ts.duration || '',
            parentTaskId: ts.parentTaskId,
            taskCodePhu: ts.taskCodePhu || (p.code ? `${p.code}#${idx + 1}` : undefined),
            orderIndex: ts.orderIndex !== undefined ? ts.orderIndex : idx,
            projectId: p.id,
            ...ts,
            _isVirtualSummary: true,
          } as unknown as Task;
          consolidatedTasks.push(vTask);
        }
      });
    }

    if (!currentUser || currentUser.role === 'admin') {
      const res = { enrichedProjects: enriched, filteredTasks: consolidatedTasks, visibleDelegationGroups: delegationGroups };
      _lastProjectsRef = projects;
      _lastRawTasksRef = rawTasks;
      _lastDelegationGroupsRef = delegationGroups;
      _lastCurrentUserRef = currentUser;
      _lastEnrichedResult = res;
      return res;
    }

    // 1. Index tasks by projectId and projectCode for O(1) project permission matching
    const tasksByProjectIdMap = new Map<string, Task[]>();
    const tasksByCodeMap = new Map<string, Task[]>();
    tasks.forEach(t => {
      if (t.projectId) {
        const pid = String(t.projectId).trim();
        let pList = tasksByProjectIdMap.get(pid);
        if (!pList) {
          pList = [];
          tasksByProjectIdMap.set(pid, pList);
        }
        pList.push(t);
      }
      if (!t.projectCode) return;
      const codeParts = String(t.projectCode).toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
      codeParts.forEach(cp => {
        let list = tasksByCodeMap.get(cp);
        if (!list) {
          list = [];
          tasksByCodeMap.set(cp, list);
        }
        list.push(t);
      });
    });

    const userParties = currentUser.partyPermissions
      ? Object.keys(currentUser.partyPermissions)
          .filter((k) => currentUser.partyPermissions![k] && k.toLowerCase() !== 'all')
          .map((k) => k.toLowerCase().trim())
      : [];
    const username = String(currentUser.username || '').toLowerCase().trim();
    const userId = String(currentUser.id || '').toLowerCase().trim();
    const userPartySet = new Set(userParties);

    const hasUserPartyMatch = (partyStr: string | undefined) => {
      if (!partyStr) return false;
      const pPartyList = partyStr.toLowerCase().split(/[,;/+]+/).map((s) => s.trim()).filter(Boolean);
      return pPartyList.some((party) => userPartySet.has(party) || party === username || party === userId);
    };

    // 2. Filter enrichedProjects with O(1) task lookup
    const allowedStores = getUserAllowedStores(currentUser);
    const enrichedProjects = enriched.filter((p) => {
      const store = String(p.store || '').toUpperCase().trim();
      let hasStorePerm = allowedStores.includes(store);
      if (!hasStorePerm && (store === 'HCM' || store === 'HN')) {
        hasStorePerm = allowedStores.includes(store);
      } else if (!hasStorePerm && store !== 'HCM' && store !== 'HN') {
        hasStorePerm = allowedStores.length >= 2;
      }

      const loc = String(p.location || '').toLowerCase().trim();
      let permLoc = loc;
      if (['md-b1', 'md-l1', 'md-l2', 'md-l3', 'md-l4'].includes(permLoc)) {
        permLoc = permLoc.replace('md-', '');
      }
      const isStorewideLoc = loc === 'store' || loc === 'all' || loc === 'storewide' || loc === 'whole store' || loc === 'all floors';
      const hasLocPerm =
        currentUser.locationPermissions?.all ||
        isStorewideLoc ||
        (currentUser.locationPermissions?.[permLoc] ?? false);

      if (!hasStorePerm || !hasLocPerm) return false;

      if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true) {
        if (hasUserPartyMatch(p.party)) return true;

        const pIdStr = p.id ? String(p.id).trim() : '';
        if (pIdStr) {
          const idTasks = tasksByProjectIdMap.get(pIdStr);
          if (idTasks && idTasks.some(t => hasUserPartyMatch(t.party))) return true;
        }

        const pCodeParts = String(p.code || '').toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
        const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';
        const pStore = p.store ? String(p.store).trim().toLowerCase() : '';

        for (let i = 0; i < pCodeParts.length; i++) {
          const candidateTasks = tasksByCodeMap.get(pCodeParts[i]);
          if (candidateTasks) {
            for (let j = 0; j < candidateTasks.length; j++) {
              const t = candidateTasks[j];
              if (t.projectId && pIdStr && String(t.projectId).trim() !== pIdStr) continue;
              const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
              if (pStore && tStore && pStore !== tStore) continue;
              const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
              if (pYear && tYear && pYear !== tYear) continue;
              if (hasUserPartyMatch(t.party)) return true;
            }
          }
        }
        return false;
      }

      return true;
    });

    // 3. Pre-index visible projects into O(1) Sets & Maps (by projectId AND composite keys)
    const visibleProjectIds = new Set<string>();
    const projectPartyByIdMap = new Map<string, string>();
    const visibleProjectKeys = new Set<string>();
    const projectPartyByCodeKeyMap = new Map<string, string>();

    enrichedProjects.forEach((p) => {
      const pParty = String(p.party || '');
      if (p.id) {
        const pid = String(p.id).trim();
        visibleProjectIds.add(pid);
        projectPartyByIdMap.set(pid, pParty);
      }

      const pYear = String(p.year || '').trim().toLowerCase();
      const pStore = String(p.store || '').trim().toLowerCase();
      const rawCode = String(p.code || '').trim().toLowerCase();

      const registerKey = (codePart: string) => {
        if (!codePart) return;
        visibleProjectKeys.add(`${codePart}_${pYear}_${pStore}`);
        visibleProjectKeys.add(`${codePart}__${pStore}`);
        visibleProjectKeys.add(`${codePart}_${pYear}_`);
        projectPartyByCodeKeyMap.set(`${codePart}_${pYear}_${pStore}`, pParty);
        projectPartyByCodeKeyMap.set(`${codePart}__${pStore}`, pParty);
      };

      registerKey(rawCode);
      rawCode.split(/[,;/]+/).map(s => s.trim()).filter(Boolean).forEach(registerKey);
      if (p.linkCodes) {
        String(p.linkCodes).toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean).forEach(registerKey);
      }
    });

    let filteredTasks = consolidatedTasks.filter((t) => {
      if (!t || t.isDeleted) return false;
      // Priority #1: Match by projectId (AGENTS.md Rule 16.1)
      if (t.projectId) {
        return visibleProjectIds.has(String(t.projectId).trim());
      }
      const taskCode = String(t.projectCode || '').trim().toLowerCase();
      const taskYear = String(t.projectYear || '').trim().toLowerCase();
      const taskStore = String(t.projectStore || '').trim().toLowerCase();
      return visibleProjectKeys.has(`${taskCode}_${taskYear}_${taskStore}`);
    });

    if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true) {
      filteredTasks = filteredTasks.filter((t) => {
        if (hasUserPartyMatch(t.party)) return true;
        if (t.projectId) {
          const pParty = projectPartyByIdMap.get(String(t.projectId).trim()) || '';
          if (hasUserPartyMatch(pParty)) return true;
        }
        const taskCode = String(t.projectCode || '').trim().toLowerCase();
        const taskYear = String(t.projectYear || '').trim().toLowerCase();
        const taskStore = String(t.projectStore || '').trim().toLowerCase();
        const projectParty =
          projectPartyByCodeKeyMap.get(`${taskCode}_${taskYear}_${taskStore}`) ||
          projectPartyByCodeKeyMap.get(`${taskCode}__${taskStore}`) ||
          '';
        return hasUserPartyMatch(projectParty);
      });
    }

    // 4. Filter visibleDelegationGroups
    const visibleDelegationGroups = delegationGroups.filter((group) => {
      const isCreator = group.createdBy === currentUser.id;
      const isSubTaskInvolved = group.subTasks?.some(
        (st) => st.createdBy === currentUser.id || (st.involvedUsers && st.involvedUsers.includes(currentUser.id))
      );
      const groupHasParty = group.subTasks?.some((st) => {
        if (userPartySet.has('all')) return true;
        const pPartyList = String(st.party || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
        return pPartyList.some((p) => userPartySet.has(p)) || pPartyList.includes(username);
      });
      return isCreator || isSubTaskInvolved || groupHasParty;
    });

    const res = { enrichedProjects, filteredTasks, visibleDelegationGroups };
    _lastProjectsRef = projects;
    _lastRawTasksRef = rawTasks;
    _lastDelegationGroupsRef = delegationGroups;
    _lastCurrentUserRef = currentUser;
    _lastEnrichedResult = res;
    return res;
  }, [projects, rawTasks, delegationGroups, currentUser]);
}
