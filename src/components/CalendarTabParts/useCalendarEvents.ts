import React, { useMemo } from 'react';
import { Project, Task } from '../../types';
import { parseDateTime, isTaskBelongsToProject } from '../../lib/utils';
import { CalendarEvent } from './calendarTypes';

interface UseCalendarEventsParams {
  projects: Project[];
  tasks: Task[];
  filterStore: string;
  filterLocation: string;
  currentView: string;
  showSubTasksInMonth: boolean;
}

export function useCalendarEvents({
  projects,
  tasks,
  filterStore,
  filterLocation,
  currentView,
  showSubTasksInMonth,
}: UseCalendarEventsParams) {
  const events = useMemo(() => {
    const calendarEvents: CalendarEvent[] = [];

    const projectMapById = new Map<string, Project>();
    const projectMapByScopedKey = new Map<string, Project>();
    projects.forEach((p) => {
      if (!p || p.isDeleted) return;
      if (p.id) projectMapById.set(String(p.id).trim(), p);
      const pCode = String(p.code || '').trim().toLowerCase();
      const pYear = String(p.year || '').trim();
      const pStore = String(p.store || '').trim().toUpperCase();
      if (pCode) {
        projectMapByScopedKey.set(`${pCode}-${pYear}-${pStore}`, p);
      }
    });

    const resolveParentProject = (t: Task): Project | undefined => {
      if (t.projectId) {
        const byId = projectMapById.get(String(t.projectId).trim());
        if (byId && isTaskBelongsToProject(t, byId)) return byId;
      }
      const tCode = String(t.projectCode || '').trim().toLowerCase();
      const tYear = String(t.projectYear || '').trim();
      const tStore = String(t.projectStore || '').trim().toUpperCase();
      if (tCode) {
        const byScoped = projectMapByScopedKey.get(`${tCode}-${tYear}-${tStore}`);
        if (byScoped && isTaskBelongsToProject(t, byScoped)) return byScoped;
      }
      return projects.find((p) => isTaskBelongsToProject(t, p));
    };

    if (currentView === 'month') {
      const filteredProjects = projects.filter((p) => {
        if (!p || p.isDeleted) return false;
        if (filterStore && p.store !== filterStore) return false;
        if (filterLocation && p.location !== filterLocation) return false;
        return true;
      });

      filteredProjects.forEach((p) => {
        const start = parseDateTime(p.computedTakStart || p.start);
        const end = parseDateTime(
          p.computedTakCompl || p.handover || p.computedOpening || p.opening
        );

        if (start) {
          const dayStart = new Date(start);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(start);
          dayEnd.setHours(23, 59, 59, 999);
          calendarEvents.push({
            id: `p_start_${p.id || p.no}`,
            title: `Start: ${p.code} - ${p.name}`,
            start: dayStart,
            end: dayEnd,
            allDay: true,
            resource: p,
            type: 'project',
            subType: 'start',
            colorIndex: 0,
            color: '#10b981',
          });
        }

        if (end) {
          const dayStart = new Date(end);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(end);
          dayEnd.setHours(23, 59, 59, 999);
          calendarEvents.push({
            id: `p_end_${p.id || p.no}`,
            title: `Finish: ${p.code} - ${p.name}`,
            start: dayStart,
            end: dayEnd,
            allDay: true,
            resource: p,
            type: 'project',
            subType: 'finish',
            colorIndex: 1,
            color: '#fb923c',
          });
        }
      });

      if (showSubTasksInMonth) {
        const filteredTasks = tasks.filter((t) => {
          if (!t || t.isDeleted) return false;
          const project = resolveParentProject(t);
          if (!project) return false;

          if (filterStore && filterStore !== 'all' && project.store?.toUpperCase() !== filterStore.toUpperCase()) return false;
          if (filterLocation && filterLocation !== 'all' && project.location !== filterLocation) return false;

          return true;
        });

        filteredTasks.forEach((t) => {
          const start = parseDateTime(t.start);
          const end = parseDateTime(t.finish);

          if (start) {
            const dayStart = new Date(start);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(start);
            dayEnd.setHours(23, 59, 59, 999);
            calendarEvents.push({
              id: `t_start_${t.id}`,
              title: `Start: ${t.projectCode ? t.projectCode + ' - ' : ''}${t.name}`,
              start: dayStart,
              end: dayEnd,
              allDay: true,
              resource: t,
              type: 'task',
              subType: 'start',
              color: '#2563eb',
            });
          }

          if (end) {
            const dayStart = new Date(end);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(end);
            dayEnd.setHours(23, 59, 59, 999);
            calendarEvents.push({
              id: `t_end_${t.id}`,
              title: `Finish: ${t.projectCode ? t.projectCode + ' - ' : ''}${t.name}`,
              start: dayStart,
              end: dayEnd,
              allDay: true,
              resource: t,
              type: 'task',
              subType: 'finish',
              color: '#a21caf',
            });
          }
        });
      }
    } else {
      const filteredTasks = tasks.filter((t) => {
        if (!t || t.isDeleted) return false;
        const project = resolveParentProject(t);
        if (!project) return false;

        if (filterStore && filterStore !== 'all' && project.store?.toUpperCase() !== filterStore.toUpperCase()) return false;
        if (filterLocation && filterLocation !== 'all' && project.location !== filterLocation) return false;

        return true;
      });

      filteredTasks.forEach((t) => {
        const start = parseDateTime(t.start);
        const end = parseDateTime(t.finish);

        if (start && end) {
          let current = new Date(start);
          current.setHours(0, 0, 0, 0);
          const endDay = new Date(end);
          endDay.setHours(23, 59, 59, 999);

          while (current <= endDay) {
            const dayStart = new Date(current);
            const dayEnd = new Date(current);
            dayEnd.setHours(23, 59, 59, 999);

            calendarEvents.push({
              id: `t_${t.id}_${current.getTime()}`,
              title: `${t.projectCode} - ${t.name}`,
              start: dayStart,
              end: dayEnd,
              allDay: true,
              resource: t,
              type: 'task',
            });

            current.setDate(current.getDate() + 1);
          }
        } else if (start) {
          const dayEnd = new Date(start);
          dayEnd.setHours(23, 59, 59, 999);
          calendarEvents.push({
            id: `t_${t.id}`,
            title: `${t.projectCode} - ${t.name}`,
            start: start,
            end: dayEnd,
            allDay: true,
            resource: t,
            type: 'task',
          });
        } else if (end) {
          const dayEnd = new Date(end);
          dayEnd.setHours(23, 59, 59, 999);
          calendarEvents.push({
            id: `t_${t.id}`,
            title: `${t.projectCode} - ${t.name}`,
            start: end,
            end: dayEnd,
            allDay: true,
            resource: t,
            type: 'task',
          });
        }
      });
    }

    // Sort events to ensure consistent ordering
    calendarEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

    if (currentView !== 'month') {
      const eventsByDate: Record<string, number> = {};
      calendarEvents.forEach((event) => {
        const dateStr = event.start.toDateString();
        if (eventsByDate[dateStr] === undefined) {
          eventsByDate[dateStr] = 0;
        }
        event.colorIndex = eventsByDate[dateStr] % 2;
        eventsByDate[dateStr]++;
      });
    }

    return calendarEvents;
  }, [projects, tasks, filterStore, filterLocation, currentView, showSubTasksInMonth]);

  return { events };
}
