import React, { useMemo } from 'react';
import { Project, Task, DelegationGroup, AppUser } from '../../types';
import { parseDateTime, getTaskStatus, getStatus } from '../../lib/utils';
import { DelegationCalendarEvent } from './delegationCalendarTypes';

interface UseDelegationCalendarEventsParams {
  groups: DelegationGroup[];
  projects: Project[];
  tasks: Task[];
  currentUser: AppUser;
  filterStore: string;
  filterLocation: string;
  filterParty: string;
  currentView: string;
}

export function useDelegationCalendarEvents({
  groups,
  projects,
  tasks,
  currentUser,
  filterStore,
  filterLocation,
  filterParty,
  currentView,
}: UseDelegationCalendarEventsParams) {
  const events = useMemo(() => {
    const projectMap = new Map<string, Project>();
    projects.forEach((p) => {
      if (p.code) projectMap.set(p.code, p);
    });
    const calendarEvents: DelegationCalendarEvent[] = [];

    const filteredGroups = groups.filter((g) => {
      const project =
        projectMap.get(g.projectCode) || projectMap.get(g.parentTaskId);

      if (filterStore && project && project.store !== filterStore) return false;
      if (filterLocation && project && project.location !== filterLocation)
        return false;

      return true;
    });

    filteredGroups.forEach((group) => {
      const project =
        projectMap.get(group.projectCode) || projectMap.get(group.parentTaskId);
      let subTasksToMap = group.subTasks;
      const isAdmin = currentUser.role === 'admin';

      if (!isAdmin && group.createdBy !== currentUser.id) {
        subTasksToMap = subTasksToMap.filter((st) => {
          if (
            st.createdBy === currentUser.id ||
            (st.involvedUsers && st.involvedUsers.includes(currentUser.id))
          )
            return true;
          const pLower = String(st.party || '')
            .toLowerCase()
            .trim();
          const userParties = currentUser.partyPermissions
            ? Object.keys(currentUser.partyPermissions)
                .filter((k) => currentUser.partyPermissions![k])
                .map((k) => k.toLowerCase().trim())
            : [];
          if (userParties.includes('all')) return true;
          const usernameMatch =
            pLower === String(currentUser.username || '').toLowerCase().trim();
          return userParties.includes(pLower) || usernameMatch;
        });
      }

      subTasksToMap.forEach((st) => {
        if (filterParty) {
          if (filterParty === 'unassigned') {
            if (st.party && st.party.trim() !== '') return;
          } else {
            if (st.party !== filterParty) return;
          }
        }

        const startVal =
          st.startAct ||
          group.updatedAt?.substring(0, 10) ||
          new Date().toISOString().substring(0, 10);
        const endVal = st.finishAct || startVal;

        const start = parseDateTime(startVal);
        const end = parseDateTime(endVal);

        if (start && end) {
          const evtStart = new Date(start);
          evtStart.setHours(0, 0, 0, 0);
          const evtEnd = new Date(end);
          evtEnd.setHours(23, 59, 59, 999);

          if (currentView === 'month') {
            calendarEvents.push({
              id: `del_${st.id}_start`,
              title: `${group.name} - ${st.name || 'Delegation'}`,
              start: evtStart,
              end: evtStart,
              allDay: true,
              resource: {
                group,
                subTask: st,
                isStartNode: true,
                projectName: project ? project.name : '',
                currentView,
              },
              colorIndex: 0,
            });
            if (evtStart.toDateString() !== evtEnd.toDateString()) {
              calendarEvents.push({
                id: `del_${st.id}_end`,
                title: `${group.name} - ${st.name || 'Delegation'}`,
                start: evtEnd,
                end: evtEnd,
                allDay: true,
                resource: {
                  group,
                  subTask: st,
                  isFinishNode: true,
                  projectName: project ? project.name : '',
                  currentView,
                },
                colorIndex: 0,
              });
            }
          } else {
            calendarEvents.push({
              id: `del_${st.id}`,
              title: `${group.name} - ${st.name || 'Delegation'}`,
              start: evtStart,
              end: evtEnd,
              allDay: true,
              resource: {
                group,
                subTask: st,
                projectName: project ? project.name : '',
                currentView,
              },
              colorIndex: 0,
            });
          }
        }
      });
    });

    calendarEvents.sort((a, b) => {
      const parentTaskA = a.resource.group.parentTaskId
        ? tasks.find((t) => t.id === a.resource.group.parentTaskId)
        : null;
      const parentTaskB = b.resource.group.parentTaskId
        ? tasks.find((t) => t.id === b.resource.group.parentTaskId)
        : null;

      let plStatusA = 'Upcoming';
      if (parentTaskA) {
        plStatusA = getTaskStatus(parentTaskA.start, parentTaskA.finish);
      } else {
        const pA =
          projectMap.get(a.resource.group.projectCode) ||
          projectMap.get(a.resource.group.parentTaskId);
        if (pA) {
          plStatusA = getStatus(
            pA.computedTakStart || pA.start,
            pA.computedTakCompl,
            pA.computedOpening || pA.opening,
            pA.code
          );
        }
      }

      let plStatusB = 'Upcoming';
      if (parentTaskB) {
        plStatusB = getTaskStatus(parentTaskB.start, parentTaskB.finish);
      } else {
        const pB =
          projectMap.get(b.resource.group.projectCode) ||
          projectMap.get(b.resource.group.parentTaskId);
        if (pB) {
          plStatusB = getStatus(
            pB.computedTakStart || pB.start,
            pB.computedTakCompl,
            pB.computedOpening || pB.opening,
            pB.code
          );
        }
      }

      const statusPriority: Record<string, number> = {
        'On process': 1,
        Handover: 2,
        Upcoming: 3,
        Completed: 4,
        Canceled: 5,
      };

      const priA = statusPriority[plStatusA] || 99;
      const priB = statusPriority[plStatusB] || 99;
      if (priA !== priB) return priA - priB;

      if (plStatusA === 'On process') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const finishA = parseDateTime(a.resource.subTask.finishAct);
        const finishB = parseDateTime(b.resource.subTask.finishAct);
        if (finishA && finishB) {
          const diffA = Math.abs(finishA.getTime() - today.getTime());
          const diffB = Math.abs(finishB.getTime() - today.getTime());
          if (diffA !== diffB) return diffA - diffB;
        }
      }

      const startA = a.resource.subTask.startAct || '9999-12-31';
      const startB = b.resource.subTask.startAct || '9999-12-31';
      if (startA < startB) return -1;
      if (startA > startB) return 1;

      return 0;
    });

    return calendarEvents;
  }, [
    groups,
    projects,
    tasks,
    currentUser,
    filterStore,
    filterLocation,
    filterParty,
    currentView,
  ]);

  return { events };
}
