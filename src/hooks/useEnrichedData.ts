import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { enrichProjects } from '../lib/utils';
import { Task, DelegationGroup } from '../types';

export function useEnrichedData() {
  const projects = useAppStore(state => state.projects);
  const tasks = useAppStore(state => state.tasks);
  const delegationGroups = useAppStore(state => state.delegationGroups);
  const currentUser = useAppStore(state => state.currentUser)!;

  return useMemo(() => {
    const enriched = enrichProjects(projects, tasks, delegationGroups);
    
    if (!currentUser || currentUser.role === "admin") {
      return { enrichedProjects: enriched, filteredTasks: tasks, visibleDelegationGroups: delegationGroups };
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
    const enrichedProjects = enriched.filter((p) => {
      // Store check
      const store = String(p.store || "").toUpperCase().trim();
      let hasStorePerm = false;
      if (store === "HCM" && currentUser.storePermissions?.hcm)
        hasStorePerm = true;
      else if (store === "HN" && currentUser.storePermissions?.hn)
        hasStorePerm = true;
      else if (store !== "HCM" && store !== "HN") {
        hasStorePerm = !!(currentUser.storePermissions?.hcm && currentUser.storePermissions?.hn);
      }

      // Location check (Dynamic)
      const loc = String(p.location || "").toLowerCase().trim();
      let permLoc = loc;
      if (["md-b1", "md-l1", "md-l2", "md-l3", "md-l4"].includes(permLoc)) {
        permLoc = permLoc.replace("md-", "");
      }
      const hasLocPerm =
        currentUser.locationPermissions?.all ||
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
      const taskCode = String(t.projectCode || "").trim().toLowerCase();
      const taskYear = String(t.projectYear || "").trim().toLowerCase();
      const taskStore = String(t.projectStore || "").trim().toLowerCase();
      const taskKey = `${taskCode}_${taskYear}_${taskStore}`;

      return (
        visibleProjectKeys.has(taskKey) ||
        visibleProjectKeys.has(`${taskCode}__`) ||
        visibleCodeSet.has(taskCode)
      );
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

    return { enrichedProjects, filteredTasks, visibleDelegationGroups };
  }, [projects, tasks, delegationGroups, currentUser]);
}
