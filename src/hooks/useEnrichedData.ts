import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { enrichProjects, getUserAllowedStores, isProjectTasksHydrated } from '../lib/utils';
import { Task } from '../types';
import { deduplicateTasks } from '../lib/taskDeduplicationService';
import { rollupParentTaskDatesAndStatus, filterNonOrphanTasks } from '../lib/taskRollupService';
import { isTaskDeletedInTracker } from '../lib/taskDeletedTracker';
import { buildTaskByIdMap, isForeignSummaryEntry } from '../lib/summaryGhostFilter';
import { useDataStore } from '../components/PictureMapping/DataContext';
import { selectUnitSizeSignature } from '../lib/unitSizeResolver';

let _lastProjectsRef: any = null;
let _lastRawTasksRef: any = null;
let _lastDelegationGroupsRef: any = null;
let _lastCurrentUserRef: any = null;
let _lastUnitSizeSigRef: string = '';
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
  const unitSizeSig = useDataStore(selectUnitSizeSignature);

  return useMemo(() => {
    if (
      _lastProjectsRef === projects &&
      _lastRawTasksRef === rawTasks &&
      _lastDelegationGroupsRef === delegationGroups &&
      _lastCurrentUserRef === currentUser &&
      _lastUnitSizeSigRef === unitSizeSig &&
      _lastEnrichedResult
    ) {
      return _lastEnrichedResult;
    }

    const deduped = deduplicateTasks(rawTasks, projects);
    const { cleaned: nonOrphanRaw } = filterNonOrphanTasks(deduped);
    const baseTasks = rollupParentTaskDatesAndStatus(nonOrphanRaw, delegationGroups);
    const enriched = enrichProjects(projects, baseTasks, delegationGroups);

    // Pre-index real tasks in O(T) to eliminate O(P * T) .some() scans per project
    const taskByIdFallback = buildTaskByIdMap(baseTasks);
    const consolidatedTasks = [...baseTasks];
    const allExistingIds = new Set<string>();
    const realTaskCountByProjectId = new Map<string, number>();
    const realTaskCountByCodeScope = new Map<string, number>();
    const realTaskIdentitiesByProject = new Map<string, Set<string>>();

    const addProjectIdentity = (pKey: string, identity: string) => {
      let set = realTaskIdentitiesByProject.get(pKey);
      if (!set) {
        set = new Set<string>();
        realTaskIdentitiesByProject.set(pKey, set);
      }
      set.add(identity);
    };

    for (let i = 0; i < consolidatedTasks.length; i++) {
      const ft = consolidatedTasks[i];
      if (!ft) continue;
      if (ft.id) {
        allExistingIds.add(String(ft.id).toLowerCase());
      }
      if (ft.isDeleted || (ft as any)._isVirtualSummary) continue;

      const ftProjId = ft.projectId ? String(ft.projectId).trim() : '';
      const ftCode = String(ft.projectCode || '').trim().toLowerCase();
      const ftStore = ft.projectStore ? String(ft.projectStore).trim().toLowerCase() : '';
      const ftYear = ft.projectYear !== undefined && ft.projectYear !== null ? String(ft.projectYear).trim().toLowerCase() : '';
      const scopeKey = `${ftCode}|${ftStore}|${ftYear}`;

      const ftIdLower = ft.id ? String(ft.id).trim().toLowerCase() : '';
      const ftCodePhuLower = ft.taskCodePhu ? String(ft.taskCodePhu).trim().toLowerCase() : '';
      const ftNameLower = ft.name ? String(ft.name).trim().toLowerCase() : '';
      const ftOrd = ft.orderIndex !== undefined && ft.orderIndex !== null ? String(ft.orderIndex) : '';
      const ftStart = ft.start ? String(ft.start).trim() : '';

      if (ftProjId) {
        realTaskCountByProjectId.set(ftProjId, (realTaskCountByProjectId.get(ftProjId) || 0) + 1);
        const pidKey = `pid:${ftProjId}`;
        if (ftIdLower) addProjectIdentity(pidKey, `id:${ftIdLower}`);
        if (ftCodePhuLower) addProjectIdentity(pidKey, `code:${ftCodePhuLower}`);
        if (ftNameLower) {
          addProjectIdentity(pidKey, `name_ord:${ftNameLower}|${ftOrd}`);
          addProjectIdentity(pidKey, `name_start:${ftNameLower}|${ftStart}`);
        }
      }

      if (ftCode) {
        realTaskCountByCodeScope.set(scopeKey, (realTaskCountByCodeScope.get(scopeKey) || 0) + 1);
        if (ftStore) realTaskCountByCodeScope.set(`${ftCode}|${ftStore}|*`, (realTaskCountByCodeScope.get(`${ftCode}|${ftStore}|*`) || 0) + 1);
        if (ftYear) realTaskCountByCodeScope.set(`${ftCode}|*|${ftYear}`, (realTaskCountByCodeScope.get(`${ftCode}|*|${ftYear}`) || 0) + 1);
        realTaskCountByCodeScope.set(`${ftCode}|*|*`, (realTaskCountByCodeScope.get(`${ftCode}|*|*`) || 0) + 1);

        const cKey = `scope:${scopeKey}`;
        if (ftIdLower) addProjectIdentity(cKey, `id:${ftIdLower}`);
        if (ftCodePhuLower) addProjectIdentity(cKey, `code:${ftCodePhuLower}`);
        if (ftNameLower) {
          addProjectIdentity(cKey, `name_ord:${ftNameLower}|${ftOrd}`);
          addProjectIdentity(cKey, `name_start:${ftNameLower}|${ftStart}`);
        }
      }
    }

    // Consolidate virtual tasks for unhydrated or partially hydrated projects in O(P)
    let addedVirtualSummaryTask = false;
    for (let pIdx = 0; pIdx < enriched.length; pIdx++) {
      const p = enriched[pIdx];
      if (!p.taskSummaries || !Array.isArray(p.taskSummaries) || p.taskSummaries.length === 0) continue;

      const pIdStr = p.id ? String(p.id).trim() : '';
      if (isProjectTasksHydrated(pIdStr)) continue;

      const pStore = String(p.store || '').trim().toLowerCase();
      const pYear = String(p.year || '').trim().toLowerCase();
      const rawCodeStr = p.linkCodes ? `${p.code || ''}, ${p.linkCodes}` : String(p.code || '');
      const pCodeParts = rawCodeStr.toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);

      let realCountForProject = pIdStr ? (realTaskCountByProjectId.get(pIdStr) || 0) : 0;
      if (realCountForProject === 0) {
        for (let cIdx = 0; cIdx < pCodeParts.length; cIdx++) {
          const cp = pCodeParts[cIdx];
          const count =
            realTaskCountByCodeScope.get(`${cp}|${pStore}|${pYear}`) ||
            (!pYear ? realTaskCountByCodeScope.get(`${cp}|${pStore}|*`) : 0) ||
            (!pStore ? realTaskCountByCodeScope.get(`${cp}|*|${pYear}`) : 0) ||
            0;
          if (count > 0) {
            realCountForProject += count;
          }
        }
      }

      if (realCountForProject >= p.taskSummaries.length) continue;

      const pidIdentitySet = pIdStr ? realTaskIdentitiesByProject.get(`pid:${pIdStr}`) : undefined;
      const primaryCode = String(p.code || '').trim().toLowerCase();
      const scopeIdentitySet = primaryCode ? realTaskIdentitiesByProject.get(`scope:${primaryCode}|${pStore}|${pYear}`) : undefined;

      p.taskSummaries.forEach((ts: any, idx: number) => {
        if (isTaskDeletedInTracker(ts.id, pIdStr || undefined)) return;
        if (isForeignSummaryEntry(ts.id, p, taskByIdFallback)) return;
        if (!Boolean((ts.name && String(ts.name).trim()) || (ts.start && String(ts.start).trim()) || (ts.finish && String(ts.finish).trim()) || ts.taskCodePhu)) {
          return;
        }

        const rawTsId = ts.id ? String(ts.id).trim() : '';
        const tsId = rawTsId || `ts_${p.id || p.code}_${p.store || 'HCM'}_${p.year || ''}_${idx}`;
        const tsIdLower = tsId.toLowerCase();
        if (allExistingIds.has(tsIdLower)) return;

        const tsCodeLower = String(ts.taskCodePhu || (p.code ? `${p.code}#${idx + 1}` : '')).trim().toLowerCase();
        const tsNameLower = ts.name ? String(ts.name).trim().toLowerCase() : '';
        const tsOrd = ts.orderIndex !== undefined && ts.orderIndex !== null ? String(ts.orderIndex) : String(idx);
        const tsStart = ts.start ? String(ts.start).trim() : '';

        const isMatchedInProject = (idSet?: Set<string>) => {
          if (!idSet) return false;
          if (rawTsId && idSet.has(`id:${tsIdLower}`)) return true;
          if (tsCodeLower && idSet.has(`code:${tsCodeLower}`)) return true;
          if (tsNameLower && (idSet.has(`name_ord:${tsNameLower}|${tsOrd}`) || idSet.has(`name_start:${tsNameLower}|${tsStart}`))) return true;
          return false;
        };

        if (isMatchedInProject(pidIdentitySet) || isMatchedInProject(scopeIdentitySet)) {
          return;
        }

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
        addedVirtualSummaryTask = true;
      });
    }

    const finalConsolidatedTasks = addedVirtualSummaryTask
      ? rollupParentTaskDatesAndStatus(filterNonOrphanTasks(consolidatedTasks).cleaned, delegationGroups)
      : consolidatedTasks;

    if (!currentUser || currentUser.role === 'admin') {
      const res = { enrichedProjects: enriched, filteredTasks: finalConsolidatedTasks, visibleDelegationGroups: delegationGroups };
      _lastProjectsRef = projects;
      _lastRawTasksRef = rawTasks;
      _lastDelegationGroupsRef = delegationGroups;
      _lastCurrentUserRef = currentUser;
      _lastUnitSizeSigRef = unitSizeSig;
      _lastEnrichedResult = res;
      return res;
    }

    const tasks = finalConsolidatedTasks;

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

    const filteredTasks = finalConsolidatedTasks.filter((t) => {
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

    // 4. Filter visibleDelegationGroups
    const visibleTaskIds = new Set(filteredTasks.map((t) => t.id));
    const visibleDelegationGroups = delegationGroups.filter((group) => {
      if (group.parentTaskId && visibleTaskIds.has(group.parentTaskId)) return true;
      if (group.projectId && visibleProjectIds.has(String(group.projectId).trim())) return true;
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
    _lastUnitSizeSigRef = unitSizeSig;
    _lastEnrichedResult = res;
    return res;
  }, [projects, rawTasks, delegationGroups, currentUser, unitSizeSig]);
}
