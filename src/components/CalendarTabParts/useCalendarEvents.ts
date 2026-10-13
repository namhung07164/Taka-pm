import { useMemo } from 'react';
import { Project, Task } from '../../types';
import { parseDateTime } from '../../lib/utils';
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

    if (currentView === 'month') {
      const filteredProjects = projects.filter((p) => {
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
        const projectMap = new Map<string, Project>();
        projects.forEach((p) => {
          const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
          projectMap.set(key, p);
          if (p.code) {
            projectMap.set(p.code, p);
          }
        });

        const filteredTasks = tasks.filter((t) => {
          const key = `${t.projectCode || ''}-${t.projectYear || ''}-${t.projectStore || ''}`;
          const project =
            projectMap.get(key) ||
            (t.projectCode ? projectMap.get(t.projectCode) : undefined);
          if (!project) return false;

          if (filterStore && project.store !== filterStore) return false;
          if (filterLocation && project.location !== filterLocation) return false;

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
      const projectMap = new Map<string, Project>();
      projects.forEach((p) => {
        const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
        projectMap.set(key, p);
        if (p.code) {
          projectMap.set(p.code, p);
        }
      });

      const filteredTasks = tasks.filter((t) => {
        const key = `${t.projectCode || ''}-${t.projectYear || ''}-${t.projectStore || ''}`;
        const project =
          projectMap.get(key) ||
          (t.projectCode ? projectMap.get(t.projectCode) : undefined);
        if (!project) return false;

        if (filterStore && project.store !== filterStore) return false;
        if (filterLocation && project.location !== filterLocation) return false;

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
