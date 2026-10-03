import { DelegationGroup, AppUser } from '../../types';
import { matchesAdvancedSearch } from '../../lib/utils';

interface FilterAndSortDelegationGroupsParams {
  groups: DelegationGroup[];
  isAdmin: boolean;
  currentUser: AppUser;
  filterFlowStatus: string;
  filterParty: string;
  multiSearchTerm: string;
  focusTarget: { groupId: string; subTaskId?: string } | null;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
}

export function filterAndSortDelegationGroups({
  groups,
  isAdmin,
  currentUser,
  filterFlowStatus,
  filterParty,
  multiSearchTerm,
  focusTarget,
  sortConfig,
}: FilterAndSortDelegationGroupsParams): DelegationGroup[] {
  return groups
    .filter((group) => {
      // 0. Focus Target Check
      if (focusTarget && focusTarget.groupId !== group.id) return false;

      // 1. Permission Check
      let hasAccess = false;
      if (isAdmin) {
        hasAccess = true;
      } else {
        const isCreator = group.createdBy === currentUser.id;
        const isSubTaskInvolved = group.subTasks.some(
          (st) => st.createdBy === currentUser.id || (st.involvedUsers && st.involvedUsers.includes(currentUser.id))
        );
        const groupHasParty = group.subTasks.some((st) => {
          const pPartyList = String(st.party || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
          const userParties = currentUser.partyPermissions
            ? Object.keys(currentUser.partyPermissions)
                .filter((k) => currentUser.partyPermissions![k])
                .map((k) => k.toLowerCase().trim())
            : [];
          if (userParties.includes('all')) return true;
          const usernameMatch = pPartyList.includes(String(currentUser.username || '').toLowerCase().trim());
          return userParties.some((p) => pPartyList.includes(p)) || usernameMatch;
        });

        hasAccess = isCreator || isSubTaskInvolved || groupHasParty;
      }
      if (!hasAccess) return false;

      // 2. Status Filter Check
      if (filterFlowStatus !== 'all') {
        const hasStatusMatch = group.subTasks.some((st) => {
          const flowStatusRaw = String(st.delegationStatus || st.status || 'Assigned').toLowerCase();
          if (filterFlowStatus === 'active_only') {
            return !['completed'].includes(flowStatusRaw);
          } else if (filterFlowStatus === 'assigned_inprogress') {
            return ['assigned', 'on process', 'in progress', 'accepted', 'approved'].includes(flowStatusRaw);
          } else if (filterFlowStatus === 'pending_rejected') {
            return [
              'pending completed',
              'rejected',
              'review late',
              'hold',
              'delayed',
              'requested',
              'request delay',
              'needs rework',
              'waiting for approval',
            ].includes(flowStatusRaw);
          } else if (filterFlowStatus === 'completed') {
            return flowStatusRaw === 'completed';
          }
          return true;
        });
        if (!hasStatusMatch) return false;
      }

      // Party Filter Check
      if (filterParty) {
        if (filterParty === 'unassigned') {
          const hasPartyMatch = group.subTasks.some((st) => !st.party || st.party.trim() === '');
          if (!hasPartyMatch) return false;
        } else {
          const hasPartyMatch = group.subTasks.some((st) => st.party === filterParty);
          if (!hasPartyMatch) return false;
        }
      }

      // 3. Multi-Search Check
      if (multiSearchTerm) {
        const groupFields = [group.name, group.projectCode, group.id];
        return matchesAdvancedSearch(multiSearchTerm, groupFields, [], (term, andTerms) => {
          return group.subTasks.some((st) => {
            return andTerms.every((tTerm) => {
              const inGroup = groupFields.some((v) => String(v || '').toLowerCase().includes(tTerm));
              if (inGroup) return true;
              const stFields = [st.name, st.party, st.delegationStatus, st.status, st.comments];
              return stFields.some((v) => String(v || '').toLowerCase().includes(tTerm));
            });
          });
        });
      }

      return true;
    })
    .map((group) => {
      let filteredSubTasks =
        focusTarget && focusTarget.subTaskId
          ? group.subTasks.filter((st) => st.id === focusTarget.subTaskId)
          : group.subTasks;

      if (!isAdmin && group.createdBy !== currentUser.id) {
        filteredSubTasks = filteredSubTasks.filter((st) => {
          if (st.createdBy === currentUser.id || (st.involvedUsers && st.involvedUsers.includes(currentUser.id)))
            return true;
          const pPartyList = String(st.party || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
          const userParties = currentUser.partyPermissions
            ? Object.keys(currentUser.partyPermissions)
                .filter((k) => currentUser.partyPermissions![k])
                .map((k) => k.toLowerCase().trim())
            : [];
          if (userParties.includes('all')) return true;
          const usernameMatch = pPartyList.includes(String(currentUser.username || '').toLowerCase().trim());
          return userParties.some((p) => pPartyList.includes(p)) || usernameMatch;
        });
      }

      if (filterFlowStatus !== 'all') {
        filteredSubTasks = filteredSubTasks.filter((st) => {
          const flowStatusRaw = String(st.delegationStatus || st.status || 'Assigned').toLowerCase();
          if (filterFlowStatus === 'active_only') {
            return !['completed'].includes(flowStatusRaw);
          } else if (filterFlowStatus === 'assigned_inprogress') {
            return ['assigned', 'on process', 'in progress', 'accepted', 'approved'].includes(flowStatusRaw);
          } else if (filterFlowStatus === 'pending_rejected') {
            return [
              'pending completed',
              'rejected',
              'review late',
              'hold',
              'delayed',
              'requested',
              'request delay',
              'needs rework',
              'waiting for approval',
            ].includes(flowStatusRaw);
          } else if (filterFlowStatus === 'completed') {
            return flowStatusRaw === 'completed';
          }
          return true;
        });
      }

      if (filterParty) {
        if (filterParty === 'unassigned') {
          filteredSubTasks = filteredSubTasks.filter((st) => !st.party || st.party.trim() === '');
        } else {
          filteredSubTasks = filteredSubTasks.filter((st) => st.party === filterParty);
        }
      }

      if (multiSearchTerm && !focusTarget) {
        filteredSubTasks = filteredSubTasks.filter((st) => {
          const groupFields = [group.name, group.projectCode, group.id];
          const stFields = [st.name, st.party, st.delegationStatus, st.status, st.comments];
          return matchesAdvancedSearch(multiSearchTerm, groupFields, stFields);
        });
      }

      const sortedSubTasks = [...filteredSubTasks].sort((a, b) => {
        if (sortConfig) {
          let valA = '';
          let valB = '';
          if (sortConfig.key === 'startAct') {
            valA = a.startAct || '9999-12-31';
            valB = b.startAct || '9999-12-31';
          } else if (sortConfig.key === 'finishAct') {
            valA = a.finishAct || '9999-12-31';
            valB = b.finishAct || '9999-12-31';
          }
          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        }

        const prioOrder: Record<string, number> = { High: 1, 'Mid-high': 2, Mid: 3, Low: 4 };
        const prioA = prioOrder[a.priority || 'Mid'] || 99;
        const prioB = prioOrder[b.priority || 'Mid'] || 99;
        if (prioA !== prioB) return prioA - prioB;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const finishA = a.finishAct ? new Date(a.finishAct) : null;
        const finishB = b.finishAct ? new Date(b.finishAct) : null;

        if (finishA && finishB) {
          const diffA = Math.abs(finishA.getTime() - today.getTime());
          const diffB = Math.abs(finishB.getTime() - today.getTime());
          if (diffA !== diffB) return diffA - diffB;
        } else if (finishA) {
          return -1;
        } else if (finishB) {
          return 1;
        }

        const startA = a.startAct || '9999-12-31';
        const startB = b.startAct || '9999-12-31';
        if (startA < startB) return -1;
        if (startA > startB) return 1;
        return 0;
      });
      return { ...group, subTasks: sortedSubTasks };
    })
    .filter((group) => group.subTasks.length > 0)
    .sort((a, b) => {
      if (sortConfig) {
        let valA = '';
        let valB = '';
        const direction = sortConfig.direction;
        if (sortConfig.key === 'startAct') {
          valA = a.subTasks[0]?.startAct || '9999-12-31';
          valB = b.subTasks[0]?.startAct || '9999-12-31';
        } else if (sortConfig.key === 'finishAct') {
          valA = a.subTasks.map((t) => t.finishAct).filter(Boolean).sort()[0] || '9999-12-31';
          valB = b.subTasks.map((t) => t.finishAct).filter(Boolean).sort()[0] || '9999-12-31';
        }
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      }

      const prioOrder: Record<string, number> = { High: 1, 'Mid-high': 2, Mid: 3, Low: 4 };
      const highestPrioA = Math.min(...a.subTasks.map((st) => prioOrder[st.priority || 'Mid'] || 99));
      const highestPrioB = Math.min(...b.subTasks.map((st) => prioOrder[st.priority || 'Mid'] || 99));
      if (highestPrioA !== highestPrioB) return highestPrioA - highestPrioB;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const getMinDiff = (group: any) => {
        let minDiff = Infinity;
        group.subTasks.forEach((st: any) => {
          if (st.finishAct) {
            const d = new Date(st.finishAct);
            const diff = Math.abs(d.getTime() - today.getTime());
            if (diff < minDiff) minDiff = diff;
          }
        });
        return minDiff;
      };

      const diffA = getMinDiff(a);
      const diffB = getMinDiff(b);
      if (diffA !== diffB) return diffA - diffB;

      const startA = a.subTasks[0]?.startAct || '9999-12-31';
      const startB = b.subTasks[0]?.startAct || '9999-12-31';
      if (startA < startB) return -1;
      if (startA > startB) return 1;

      return 0;
    });
}
