import React, { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { enrichProjects, getUserAllowedStores } from '../lib/utils';
import { Task, DelegationGroup } from '../types';
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
    
    if (!currentUser || currentUser.role === "admin") {
      const res = { enrichedProjects: enriched, filteredTasks: tasks, visibleDelegationGroups: delegationGroups };
      _lastProjectsRef = projects;
      _lastRawTasksRef = rawTasks;
      _lastDelegationGroupsRef = delegationGroups;
      _lastCurrentUserRef = currentUser;
      _lastEnrichedResult = res;
      return res;
    }

    // 1. Index tasks by project code for O(1) project permission matching
    const tasksByCodeMap = new Map<string, Task[]>();
    tasks.forEach(t => {
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

    // Extract user party permissions once into O(1) Set
    const userParties = currentUser.partyPermissions
      ? Object.keys(currentUser.partyPermissions)
          .filter((k) => currentUser.partyPermissions![k] && k.toLowerCase() !== "all")
          .map((k) => k.toLowerCase().trim())
      : [];
    const username = String(currentUser.username || "").toLowerCase().trim();
    const userId = String(currentUser.id || "").toLowerCase().trim();
    const userPartySet = new Set(userParties);

    const hasUserPartyMatch = (partyStr: string | undefined) => {
      if (!partyStr) return false;
      const pPartyList = partyStr.toLowerCase().split(/[,;/+]+/).map((s) => s.trim()).filter(Boolean);
      return pPartyList.some((party) => userPartySet.has(party) || party === username || party === userId);
    };

    // 2. Filter enrichedProjects with O(1) task lookup
    const allowedStores = getUserAllowedStores(currentUser);
    const enrichedProjects = enriched.filter((p) => {
      // Store check
      const store = String(p.store || "").toUpperCase().trim();
      let hasStorePerm = allowedStores.includes(store);
      if (!hasStorePerm && (store === "HCM" || store === "HN")) {
        hasStorePerm = allowedStores.includes(store);
      } else if (!hasStorePerm && store !== "HCM" && store !== "HN") {
        hasStorePerm = allowedStores.length >= 2;
      }

      // Location check (Dynamic)
      const loc = String(p.location || "").toLowerCase().trim();
      let permLoc = loc;
      if (["md-b1", "md-l1", "md-l2", "md-l3", "md-l4"].includes(permLoc)) {
        permLoc = permLoc.replace("md-", "");
      }
      const isStorewideLoc = loc === 'store' || loc === 'all' || loc === 'storewide' || loc === 'whole store' || loc === 'all floors';
      const hasLocPerm =
        currentUser.locationPermissions?.all ||
        isStorewideLoc ||
        (currentUser.locationPermissions?.[permLoc] ?? false);

      // Party check for project
      const pMatch = hasUserPartyMatch(p.party);

      const pCodeParts = String(p.code || "").toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
      const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';
      const pStore = p.store ? String(p.store).trim().toLowerCase() : '';

      let tMatch = false;
      for (let i = 0; i < pCodeParts.length; i++) {
        const candidateTasks = tasksByCodeMap.get(pCodeParts[i]);
        if (candidateTasks) {
          for (let j = 0; j < candidateTasks.length; j++) {
            const t = candidateTasks[j];
            const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
            if (pStore && tStore && pStore !== tStore) continue;
            const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
            if (pYear && tYear && pYear !== tYear) continue;

            if (hasUserPartyMatch(t.party)) {
              tMatch = true;
              break;
            }
          }
        }
        if (tMatch) break;
      }

      // Mandatory Store & Location permission checks
      if (!hasStorePerm || !hasLocPerm) {
        return false;
      }

      // If By-Party Access is enabled for user, require party match
      if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true) {
        return pMatch || tMatch;
      }

      return true;
    });

    // 3. Pre-index visible projects into O(1) set & map for fast task filtering
    const visibleProjectKeys = new Set<string>();
    const projectPartyByCodeKeyMap = new Map<string, string>();

    enrichedProjects.forEach((p) => {
      const pYear = String(p.year || "").trim().toLowerCase();
      const pStore = String(p.store || "").trim().toLowerCase();
      const rawCode = String(p.code || "").trim().toLowerCase();
      
      visibleProjectKeys.add(`${rawCode}_${pYear}_${pStore}`);
      projectPartyByCodeKeyMap.set(`${rawCode}_${pYear}_${pStore}`, String(p.party || ''));

      const pCodeParts = rawCode.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
      pCodeParts.forEach(part => {
        visibleProjectKeys.add(`${part}_${pYear}_${pStore}`);
        projectPartyByCodeKeyMap.set(`${part}_${pYear}_${pStore}`, String(p.party || ''));
      });

      if (p.linkCodes) {
        const linkParts = String(p.linkCodes).toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
        linkParts.forEach(part => {
          visibleProjectKeys.add(`${part}_${pYear}_${pStore}`);
          projectPartyByCodeKeyMap.set(`${part}_${pYear}_${pStore}`, String(p.party || ''));
        });
      }
    });

    let filteredTasks = tasks.filter((t) => {
      if (!t || t.isDeleted) return false;
      const taskCode = String(t.projectCode || "").trim().toLowerCase();
      const taskYear = String(t.projectYear || "").trim().toLowerCase();
      const taskStore = String(t.projectStore || "").trim().toLowerCase();
      const taskKey = `${taskCode}_${taskYear}_${taskStore}`;

      if (visibleProjectKeys.has(taskKey)) return true;

      return enrichedProjects.some(p => {
        const pStore = String(p.store || "").trim().toLowerCase();
        const pYear = String(p.year || "").trim().toLowerCase();
        if (taskStore && pStore && taskStore !== pStore) return false;
        if (taskYear && pYear && taskYear !== pYear) return false;

        if (t.projectId && p.id && String(p.id) === String(t.projectId)) return true;

        const pCode = String(p.code || "").trim().toLowerCase();
        return pCode && pCode === taskCode;
      });
    });

    if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true) {
      filteredTasks = filteredTasks.filter((t) => {
        const taskCode = String(t.projectCode || "").trim().toLowerCase();
        const taskYear = String(t.projectYear || "").trim().toLowerCase();
        const taskStore = String(t.projectStore || "").trim().toLowerCase();
        const taskKey = `${taskCode}_${taskYear}_${taskStore}`;

        const projectParty = projectPartyByCodeKeyMap.get(taskKey) || '';
        const pMatch = hasUserPartyMatch(projectParty);
        const tMatch = hasUserPartyMatch(t.party);

        return pMatch || tMatch;
      });
    }

    // Consolidate virtual tasks from p.taskSummaries ONLY when no real tasks are in memory for this project (lazy loading placeholder)
    const taskByIdFallback = buildTaskByIdMap(tasks);
    const allExistingIds = new Set(filteredTasks.map(t => String(t.id || '').toLowerCase()));
    enrichedProjects.forEach(p => {
      if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
        const pCode = String(p.code || '').trim().toLowerCase();
        const rawCodeStr = p.linkCodes ? `${p.code || ''}, ${p.linkCodes}` : String(p.code || '');
        const pCodeParts = rawCodeStr.toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
        const pYear = String(p.year || '').trim().toLowerCase();
        const pStore = String(p.store || '').trim().toLowerCase();
        const pIdStr = p.id ? String(p.id).trim() : '';

        // Check if real tasks already exist in memory for this project
        const hasRealProjectTasks = filteredTasks.some(ft => {
          if (!ft || ft.isDeleted || String(ft.id || '').startsWith('ts_') || (ft as any)._isVirtualSummary) return false;
          const ftProjId = ft.projectId ? String(ft.projectId).trim() : '';
          if (ftProjId && pIdStr && ftProjId !== pIdStr) return false;

          const ftStore = ft.projectStore ? String(ft.projectStore).trim().toLowerCase() : '';
          const ftYear = ft.projectYear !== undefined && ft.projectYear !== null ? String(ft.projectYear).trim().toLowerCase() : '';

          if (pStore && ftStore && pStore !== ftStore) return false;
          if (pYear && ftYear && pYear !== ftYear) return false;

          if (ftProjId && pIdStr && ftProjId === pIdStr) return true;
          const ftCode = String(ft.projectCode || '').trim().toLowerCase();
          return Boolean(ftCode && (ftCode === pCode || pCodeParts.includes(ftCode)));
        });

        // When real tasks for this project are loaded in memory, they are authoritative — do not mix in stale summary placeholders
        if (hasRealProjectTasks) return;

        const isPartyRestricted = currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true;
        const pPartyMatch = isPartyRestricted ? hasUserPartyMatch(String(p.party || '')) : true;

        p.taskSummaries.forEach((ts, idx) => {
          if (isTaskDeletedInTracker(ts.id, pIdStr || undefined)) return;
          if (isForeignSummaryEntry(ts.id, p, taskByIdFallback)) return;
          if (!Boolean((ts.name && String(ts.name).trim()) || (ts.start && String(ts.start).trim()) || (ts.finish && String(ts.finish).trim()) || ts.taskCodePhu)) {
            return;
          }
          if (isPartyRestricted && !pPartyMatch && !hasUserPartyMatch(ts.party)) {
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
            filteredTasks.push(vTask);
          }
        });
      }
    });

    // 4. Filter visibleDelegationGroups
    const visibleDelegationGroups = delegationGroups.filter((group) => {
      const isCreator = group.createdBy === currentUser.id;
      const isSubTaskInvolved = group.subTasks?.some(
        (st) =>
          st.createdBy === currentUser.id ||
          (st.involvedUsers && st.involvedUsers.includes(currentUser.id)),
      );
      const groupHasParty = group.subTasks?.some((st) => {
        const pPartyList = String(st.party || "")
          .toLowerCase()
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (userPartySet.has("all")) {
          return true;
        }
        return (
          pPartyList.some((p) => userPartySet.has(p)) ||
          pPartyList.includes(username)
        );
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
