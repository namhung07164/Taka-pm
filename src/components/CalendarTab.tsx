import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import {
  format,
  parse,
  startOfWeek,
  getDay,
  startOfDay,
  isSameDay,
} from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { useEnrichedData } from '../hooks/useEnrichedData';
import { safeGetItemLocal, safeSetItemLocal } from '../lib/storage';
import { useAppStore } from '../store/useAppStore';
import { getDefaultStoreFilter } from '../lib/utils';
import { CalendarEvent, CalendarTabProps } from './CalendarTabParts/calendarTypes';
import {
  CustomWeekView,
  CustomAgendaView,
} from './CalendarTabParts/CustomVerticalView';
import { CalendarFilterToolbar } from './CalendarTabParts/CalendarFilterToolbar';
import { CalendarMonthDayList } from './CalendarTabParts/CalendarMonthDayList';
import { useCalendarEvents } from './CalendarTabParts/useCalendarEvents';
import { exportEventsToICS } from './CalendarTabParts/calendarExportUtils';

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export function CalendarTab({ onEditTask, onEditProject }: CalendarTabProps) {
  const { enrichedProjects: projects, filteredTasks: tasks } = useEnrichedData();
  const currentUser = useAppStore((state) => state.currentUser)!;
  const locations = useAppStore((state) => state.locations);
  const isTasksRequested = useAppStore((state) => state.isTasksRequested);
  const setIsTasksRequested = useAppStore((state) => state.setIsTasksRequested);

  // Tri-Gate Lazy Loading (Rule 3)
  useEffect(() => {
    if (!isTasksRequested) {
      setIsTasksRequested(true);
    }
  }, [isTasksRequested, setIsTasksRequested]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>('month');
  const [searchDate, setSearchDate] = useState('');
  const [filterStore, setFilterStore] = useState<string>(() => {
    const def = getDefaultStoreFilter(currentUser);
    return def === 'all' ? '' : def;
  });

  useEffect(() => {
    safeSetItemLocal(`taka_store_filter_${currentUser.id}`, filterStore || 'all');
  }, [filterStore, currentUser.id]);

  const [filterLocation, setFilterLocation] = useState('');
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(new Date());
  const [showSubTasksInMonth, setShowSubTasksInMonth] = useState<boolean>(() => {
    return safeGetItemLocal('taka_calendar_show_subtasks') === 'true';
  });

  useEffect(() => {
    safeSetItemLocal(
      'taka_calendar_show_subtasks',
      showSubTasksInMonth ? 'true' : 'false'
    );
  }, [showSubTasksInMonth]);

  const uniqueStores = useMemo(() => {
    return [...new Set(projects.map((p) => p.store).filter(Boolean))].sort();
  }, [projects]);

  const handleSearchDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchDate(val);
    if (val) {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) {
        setCurrentDate(parsed);
        setCurrentView('day');
      }
    }
  };

  const { events } = useCalendarEvents({
    projects,
    tasks,
    filterStore,
    filterLocation,
    currentView,
    showSubTasksInMonth,
  });

  const handleExportICS = () => {
    exportEventsToICS(events);
  };

  const eventStyleGetter = (event: CalendarEvent) => {
    const backgroundColor =
      event.color || (event.colorIndex === 0 ? '#10b981' : '#fb923c');

    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        opacity: 0.95,
        color: 'white',
        border: '0px',
        display: 'block',
        fontSize: '11px',
        fontWeight: '600',
        padding: '3px 6px',
        lineHeight: '1.3',
      },
    };
  };

  const CustomDateHeader = ({ label, date }: any) => {
    const dayEvents = events.filter((e) => {
      return (
        startOfDay(e.start) <= startOfDay(date) &&
        startOfDay(e.end) >= startOfDay(date)
      );
    });
    const hasEvents = dayEvents.length > 0;

    const dayColors: string[] = [];
    dayEvents.forEach((e) => {
      const c =
        e.color ||
        (eventStyleGetter(e).style.backgroundColor as string) ||
        (e.colorIndex === 0 ? '#10b981' : '#fb923c');
      if (!dayColors.includes(c)) dayColors.push(c);
    });

    const isSelected = isSameDay(date, selectedMonthDate);

    return (
      <div
        className={`flex flex-col items-center justify-center cursor-pointer mt-1 mx-auto w-10 h-10 ${
          isSelected ? 'bg-blue-100 dark:bg-blue-900/40 rounded-full' : ''
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedMonthDate(date);
        }}
      >
        <span
          className={`text-[13px] font-medium leading-none ${
            isSameDay(date, new Date())
              ? 'bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center'
              : 'text-slate-700 dark:text-[#e3e3e3]'
          }`}
        >
          {label}
        </span>
        <div className="h-2 flex items-center justify-center gap-1 mt-1">
          {hasEvents &&
            (dayColors.length > 0 ? (
              dayColors
                .slice(0, 4)
                .map((c, i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: c }}
                  />
                ))
            ) : (
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
            ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-grow flex flex-col min-h-[600px] bg-white dark:bg-[#1e1e20] rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm p-4">
      <style>{`
        .rbc-time-content { display: none !important; }
        .rbc-time-header-gutter { display: none !important; }
        .rbc-time-view .rbc-time-header { flex: 1 1 auto !important; min-height: 0 !important; }
        .rbc-time-header-content { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; border-left: none !important; }
        .rbc-allday-cell { flex: 1 1 auto !important; height: 100% !important; max-height: none !important; }
        .rbc-event { white-space: normal !important; word-break: break-word !important; height: auto !important; min-height: 24px; margin-bottom: 2px !important; }
        .rbc-event-content { white-space: normal !important; word-break: break-word !important; }
        .rbc-month-view .rbc-row-segment { display: none !important; }
        .rbc-month-view .rbc-month-row { flex: 1 0 50px !important; }
        .rbc-month-view .rbc-date-cell { text-align: center !important; padding: 0 !important; }
        .rbc-month-view .rbc-button-link { pointer-events: none !important; }
      `}</style>

      <CalendarFilterToolbar
        currentView={currentView}
        showSubTasksInMonth={showSubTasksInMonth}
        setShowSubTasksInMonth={setShowSubTasksInMonth}
        searchDate={searchDate}
        onSearchDateChange={handleSearchDate}
        filterStore={filterStore}
        setFilterStore={setFilterStore}
        uniqueStores={uniqueStores}
        filterLocation={filterLocation}
        setFilterLocation={setFilterLocation}
        locations={locations}
        onExportICS={handleExportICS}
      />

      <div className="flex-grow min-h-[600px]">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%', minHeight: '600px' }}
          eventPropGetter={eventStyleGetter}
          date={currentDate}
          onNavigate={(newDate) => setCurrentDate(newDate)}
          view={currentView}
          onView={(newView) => setCurrentView(newView)}
          onSelectEvent={(event) => {
            if (event.type === 'task' && event.resource) {
              onEditTask(event.resource, true);
            } else if (event.type === 'project' && event.resource) {
              onEditProject(event.resource, true);
            }
          }}
          components={{
            month: {
              dateHeader: CustomDateHeader,
            },
          }}
          views={{
            month: true,
            week: CustomWeekView,
            day: true,
            agenda: CustomAgendaView,
          }}
          popup
        />
      </div>

      {currentView === 'month' && (
        <CalendarMonthDayList
          selectedMonthDate={selectedMonthDate}
          events={events}
          onEditTask={onEditTask}
          onEditProject={onEditProject}
        />
      )}
    </div>
  );
}

export default CalendarTab;
