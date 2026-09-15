import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { enrichProjects } from '../lib/utils';
import { Task, Project, DelegationGroup, AppUser } from '../types';

let globalCache = {
  projects: null as Project[] | null,
  tasks: null as Task[] | null,
  delegationGroups: null as DelegationGroup[] | null,
  currentUser: null as AppUser | null,
  result: {
    enrichedProjects: [] as any[],
    filteredTasks: [] as any[],
    visibleDelegationGroups: [] as any[]
  }
};

export function useEnrichedData() {
  const projects = useAppStore(state => state.projects);
  const tasks = useAppStore(state => state.tasks);
  const delegationGroups = useAppStore(state => state.delegationGroups);
  const currentUser = useAppStore(state => state.currentUser)!;

  const result = useMemo(() => {
    if (
      globalCache.projects === projects &&
      globalCache.tasks === tasks &&
      globalCache.delegationGroups === delegationGroups &&
      globalCache.currentUser === currentUser
    ) {
      return globalCache.result;
    }

    const tasksByProject = new Map<string, Task[]>();
    tasks.forEach(t => {
      const key = `${String(t.projectCode || "").trim().toLowerCase()}-${String(t.projectYear || "").trim()}-${String(t.projectStore || "").trim().toLowerCase()}`;
      if (!tasksByProject.has(key)) tasksByProject.set(key, []);
      tasksByProject.get(key)!.push(t);
    });
    
    const enriched = enrichProjects(projects, tasks);
    
    let enrichedProjects = enriched;
    if (currentUser.role !== "admin") {
      enrichedProjects = enriched.filter((p) => {
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
        const userParties = currentUser.partyPermissions
          ? Object.keys(currentUser.partyPermissions)
              .filter((k) => currentUser.partyPermissions![k] && k.toLowerCase() !== "all")
              .map((k) => k.toLowerCase().trim())
          : [];
        const username = String(currentUser.username || "").toLowerCase().trim();
        const userId = String(currentUser.id || "").toLowerCase().trim();
        const pPartyList = String(p.party || "")
          .toLowerCase()
          .split(/[,;/+]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const pMatch =
          pPartyList.some((party) => userParties.includes(party)) ||
          pPartyList.includes(username) ||
          pPartyList.includes(userId);

        const pKey = `${String(p.code || "").trim().toLowerCase()}-${String(p.year || "").trim()}-${String(p.store || "").trim().toLowerCase()}`;
        const groupTasks = tasksByProject.get(pKey) || [];
        const tMatch = groupTasks.some((t) => {
          const tPartyList = String(t.party || "")
            .toLowerCase()
            .split(/[,;/+]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          const tMatch =
            tPartyList.some((party) => userParties.includes(party)) ||
            tPartyList.includes(username) ||
            tPartyList.includes(userId);
          return tMatch;
        });

        if (pMatch || tMatch) {
          return true;
        }
        if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true) {
          return false;
        }
        return hasStorePerm && hasLocPerm;
      });
    }

    let filteredTasks = tasks;
    if (currentUser.role !== "admin") {
      const visibleProjectKeys = new Set(
        enrichedProjects.map((p) =>
          `${String(p.code).trim()}_${String(p.year || "").trim()}_${String(p.store || "").trim()}`.toLowerCase(),
        ),
      );
      
      let visibleTasks = tasks.filter((t) => {
        const taskKey =
          `${String(t.projectCode).trim()}_${String(t.projectYear || "").trim()}_${String(t.projectStore || "").trim()}`.toLowerCase();
        return (
          visibleProjectKeys.has(taskKey) ||
          visibleProjectKeys.has(`${String(t.projectCode).trim()}__`.toLowerCase())
        );
      });

      const userParties = currentUser.partyPermissions
        ? Object.keys(currentUser.partyPermissions)
            .filter((k) => currentUser.partyPermissions![k] && k.toLowerCase() !== "all")
            .map((k) => k.toLowerCase().trim())
        : [];
      const username = String(currentUser.username || "").toLowerCase().trim();
      const userId = String(currentUser.id || "").toLowerCase().trim();

      if (currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true) {
        visibleTasks = visibleTasks.filter((t) => {
          const parentProject = enrichedProjects.find(
            (p) =>
              `${String(p.code).trim()}_${String(p.year || "").trim()}_${String(p.store || "").trim()}`.toLowerCase() ===
                `${String(t.projectCode).trim()}_${String(t.projectYear || "").trim()}_${String(t.projectStore || "").trim()}`.toLowerCase() ||
              `${String(p.code).trim()}__`.toLowerCase() === `${String(t.projectCode).trim()}__`.toLowerCase(),
          );
          const projectPartyList = parentProject
            ? String(parentProject.party || "")
                .toLowerCase()
                .split(/[,;/+]+/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
          const tPartyList = String(t.party || "")
            .toLowerCase()
            .split(/[,;/+]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          const pMatch =
            projectPartyList.some((p) => userParties.includes(p)) ||
            projectPartyList.includes(username) ||
            projectPartyList.includes(userId);
          const tMatch =
            tPartyList.some((p) => userParties.includes(p)) ||
            tPartyList.includes(username) ||
            tPartyList.includes(userId);
          return pMatch || tMatch;
        });
      }
      filteredTasks = visibleTasks;
    }

    let visibleDelegationGroups = delegationGroups;
    if (currentUser.role !== "admin") {
      visibleDelegationGroups = delegationGroups.filter((group) => {
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
          const userParties = currentUser.partyPermissions
            ? Object.keys(currentUser.partyPermissions)
                .filter((k) => currentUser.partyPermissions![k])
                .map((k) => k.toLowerCase().trim())
            : [];
          if (userParties.includes("all")) {
            return true;
          }
          const username = String(currentUser.username || "").toLowerCase().trim();
          return (
            pPartyList.some((p) => userParties.includes(p)) ||
            pPartyList.includes(username)
          );
        });
        return isCreator || isSubTaskInvolved || groupHasParty;
      });
    }

    globalCache = {
      projects,
      tasks,
      delegationGroups,
      currentUser,
      result: { enrichedProjects, filteredTasks, visibleDelegationGroups }
    };
    return globalCache.result;
  }, [projects, tasks, delegationGroups, currentUser]);

  return result;
}
