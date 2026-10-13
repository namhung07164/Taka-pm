import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, isSameDay, startOfDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { useEnrichedData } from '../hooks/useEnrichedData';
import { safeSetItemLocal } from '../lib/storage';
import { useAppStore } from '../store/useAppStore';
import { getDefaultStoreFilter } from '../lib/utils';

import {
  DelegationCalendarEvent,
  DelegationCalendarTabProps,
} from './DelegationCalendarParts/delegationCalendarTypes';
import {
  CustomWeekView,
  CustomAgendaView,
} from './DelegationCalendarParts/DelegationCustomVerticalView';
import { CustomEventComponent } from './DelegationCalendarParts/DelegationCustomEvent';
import { DelegationCalendarFilterToolbar } from './DelegationCalendarParts/DelegationCalendarFilterToolbar';
import { DelegationCalendarMonthList } from './DelegationCalendarParts/DelegationCalendarMonthList';
import { useDelegationCalendarEvents } from './DelegationCalendarParts/useDelegationCalendarEvents';
import { exportDelegationEventsToICS } from './DelegationCalendarParts/delegationExportUtils';

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export function DelegationCalendarTab({
  groups,
  onTabChange,
}: DelegationCalendarTabProps) {
  const { enrichedProjects: projects, filteredTasks: tasks } = useEnrichedData();
  const currentUser = useAppStore((state) => state.currentUser)!;
  const locations = useAppStore((state) => state.locations);
  const isTasksRequested = useAppStore((state) => state.isTasksRequested);
  const setIsTasksRequested = useAppStore((state) => state.setIsTasksRequested);
  const isDelegationsRequested = useAppStore((state) => state.isDelegationsRequested);
  const setIsDelegationsRequested = useAppStore((state) => state.setIsDelegationsRequested);

  // Tri-Gate Lazy Loading (Rule 3)
  useEffect(() => {
    if (!isTasksRequested) setIsTasksRequested(true);
    if (!isDelegationsRequested) setIsDelegationsRequested(true);
  }, [isTasksRequested, setIsTasksRequested, isDelegationsRequested, setIsDelegationsRequested]);

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
  const [filterParty, setFilterParty] = useState('');
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(new Date());

  const uniqueStores = useMemo(() => {
    return [...new Set(projects.map((p) => p.store).filter(Boolean))].sort();
  }, [projects]);

  const uniqueParties = useMemo(() => {
    const partiesList = new Set<string>();
    groups.forEach((g) =>
      g.subTasks.forEach((st) => {
        if (st.party) partiesList.add(st.party);
      })
    );
    return [...partiesList].sort();
  }, [groups]);

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

  const { events } = useDelegationCalendarEvents({
    groups,
    projects,
    tasks,
    currentUser,
    filterStore,
    filterLocation,
    filterParty,
    currentView,
  });

  const handleExportICS = () => {
    exportDelegationEventsToICS(events);
  };

  const eventStyleGetter = (event: DelegationCalendarEvent) => {
    let backgroundColor = '#f8fafc';
    let borderColor = '#cbd5e1';

    const flowTxt =
      event.resource.subTask.delegationStatus ||
      event.resource.subTask.status ||
      'Assigned';
    if (flowTxt === 'Completed') {
      backgroundColor = '#f0fdf4';
      borderColor = '#bbf7d0';
    } else if (flowTxt === 'On process' || flowTxt === 'Accepted') {
      backgroundColor = '#eff6ff';
      borderColor = '#bfdbfe';
    } else if (
      flowTxt === 'Delayed' ||
      [
        'requested',
        'hold',
        'waiting for approval',
        'pending completed',
      ].includes(flowTxt.toLowerCase())
    ) {
      backgroundColor = '#fff7ed';
      borderColor = '#fed7aa';
    } else if (
      flowTxt === 'Approved' ||
      flowTxt === 'Rejected' ||
      flowTxt === 'Request Delay' ||
      flowTxt === 'Needs Rework'
    ) {
      backgroundColor = '#faf5ff';
      borderColor = '#e9d5ff';
    } else if (flowTxt === 'Assigned') {
      backgroundColor = '#fff7ed';
      borderColor = '#fed7aa';
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        opacity: 0.95,
        color: '#0f172a',
        border: `1px solid ${borderColor}`,
        display: 'block',
        fontSize: '11px',
        fontWeight: '600',
        padding: '3px 6px',
        lineHeight: '1.3',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      },
    };
  };

  const handleSelectEvent = (event: DelegationCalendarEvent) => {
    onTabChange('taskDelegation');
    setTimeout(() => {
      const el = document.getElementById(`delegation-group-${event.resource.group.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
  };

  const CustomDateHeader = ({ label, date }: any) => {
    const dayEvents = events.filter(
      (e) =>
        startOfDay(e.start) <= startOfDay(date) &&
        startOfDay(e.end) >= startOfDay(date)
    );
    const hasEvents = dayEvents.length > 0;
    const isSelected = isSameDay(date, selectedMonthDate);

    return (
      <div
        className={`flex flex-col items-center justify-center cursor-pointer mt-1 mx-auto w-10 h-10 ${
          isSelected ? 'bg-blue-100 rounded-full' : ''
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
        <div className="h-2 flex items-center justify-center mt-1">
          {hasEvents && (
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
          )}
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
        .rbc-event { white-space: normal !important; word-break: break-word !important; height: auto !important; min-height: 24px; margin-bottom: 2px !important; background: transparent !important; padding: 0 !important; border: 0 !important; }
        .rbc-event-content { white-space: normal !important; word-break: break-word !important; height: 100%; display: flex; }
        .rbc-month-view .rbc-row-segment { display: none !important; }
        .rbc-month-view .rbc-month-row { flex: 1 0 50px !important; }
        .rbc-month-view .rbc-date-cell { text-align: center !important; padding: 0 !important; }
        .rbc-month-view .rbc-button-link { pointer-events: none !important; }
      `}</style>

      <DelegationCalendarFilterToolbar
        totalEvents={events.length}
        searchDate={searchDate}
        onSearchDateChange={handleSearchDate}
        filterStore={filterStore}
        setFilterStore={setFilterStore}
        uniqueStores={uniqueStores}
        filterLocation={filterLocation}
        setFilterLocation={setFilterLocation}
        locations={locations}
        filterParty={filterParty}
        setFilterParty={setFilterParty}
        uniqueParties={uniqueParties}
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
          components={{
            event: CustomEventComponent as any,
            month: {
              dateHeader: CustomDateHeader,
            },
          }}
          onSelectEvent={handleSelectEvent}
          date={currentDate}
          onNavigate={(newDate) => setCurrentDate(newDate)}
          view={currentView}
          onView={(newView) => setCurrentView(newView)}
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
        <DelegationCalendarMonthList
          selectedMonthDate={selectedMonthDate}
          events={events}
          onSelectEvent={handleSelectEvent}
        />
      )}
    </div>
  );
}

export default DelegationCalendarTab;
