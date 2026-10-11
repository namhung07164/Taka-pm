import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { enrichProjects, getUserAllowedStores } from '../lib/utils';
import { Task, DelegationGroup } from '../types';
import { deduplicateTasks } from '../lib/taskDeduplicationService';

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

    const tasks = deduplicateTasks(rawTasks);
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
    const visibleCodeSet = new Set<string>();
    const projectPartyByCodeKeyMap = new Map<string, string>();

    enrichedProjects.forEach((p) => {
      const pYear = String(p.year || "").trim().toLowerCase();
      const pStore = String(p.store || "").trim().toLowerCase();
      const rawCode = String(p.code || "").trim().toLowerCase();
      
      visibleProjectKeys.add(`${rawCode}_${pYear}_${pStore}`);
      visibleProjectKeys.add(`${rawCode}__`);
      visibleCodeSet.add(rawCode);
      projectPartyByCodeKeyMap.set(`${rawCode}_${pYear}_${pStore}`, String(p.party || ''));

      const pCodeParts = rawCode.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
      pCodeParts.forEach(part => {
        visibleProjectKeys.add(`${part}_${pYear}_${pStore}`);
        visibleProjectKeys.add(`${part}__`);
        visibleCodeSet.add(part);
        projectPartyByCodeKeyMap.set(`${part}_${pYear}_${pStore}`, String(p.party || ''));
      });

      if (p.linkCodes) {
        const linkParts = String(p.linkCodes).toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
        linkParts.forEach(part => {
          visibleProjectKeys.add(`${part}_${pYear}_${pStore}`);
          visibleProjectKeys.add(`${part}__`);
          visibleCodeSet.add(part);
          projectPartyByCodeKeyMap.set(`${part}_${pYear}_${pStore}`, String(p.party || ''));
        });
      }
    });

    let filteredTasks = tasks.filter((t) => {
      if (t.isDeleted) return false;
      const taskCode = String(t.projectCode || "").trim().toLowerCase();
      const taskYear = String(t.projectYear || "").trim().toLowerCase();
      const taskStore = String(t.projectStore || "").trim().toLowerCase();
      const taskKey = `${taskCode}_${taskYear}_${taskStore}`;

      const matchesProject =
        visibleProjectKeys.has(taskKey) ||
        visibleProjectKeys.has(`${taskCode}__`) ||
        visibleCodeSet.has(taskCode) ||
        (t.projectId && enrichedProjects.some(p => String(p.id) === String(t.projectId)));

      return matchesProject;
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

    // Consolidate virtual tasks from p.taskSummaries if a project has summaries but no detailed tasks in filteredTasks
    const existingTaskIds = new Set(filteredTasks.map(t => t.id));
    enrichedProjects.forEach(p => {
      if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
        const pCode = String(p.code || '').trim().toLowerCase();
        const pYear = String(p.year || '').trim().toLowerCase();
        const pStore = String(p.store || '').trim().toLowerCase();

        const hasRealTask = filteredTasks.some(ft => {
          if (ft.projectId && p.id && String(ft.projectId) === String(p.id)) return true;
          if (!ft.projectCode || !pCode) return false;
          const ftCode = String(ft.projectCode).trim().toLowerCase();
          const matchesCode = ftCode === pCode;
          const ftStore = ft.projectStore ? String(ft.projectStore).trim().toLowerCase() : '';
          const matchesStore = !ftStore || !pStore || ftStore === pStore;
          const ftYear = ft.projectYear !== undefined && ft.projectYear !== null ? String(ft.projectYear).trim().toLowerCase() : '';
          const matchesYear = !ftYear || !pYear || ftYear === pYear;
          return matchesCode && matchesStore && matchesYear;
        });

        if (!hasRealTask) {
          p.taskSummaries.forEach((ts, idx) => {
            const tsId = ts.id || `ts_${p.code || p.id}_${p.store || 'HCM'}_${p.year || ''}_${idx}`;
            if (!existingTaskIds.has(tsId)) {
              const vTask = {
                id: tsId,
                name: ts.name || `Task ${idx + 1}`,
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
                ...ts
              } as Task;
              filteredTasks.push(vTask);
              existingTaskIds.add(tsId);
            }
          });
        }
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
