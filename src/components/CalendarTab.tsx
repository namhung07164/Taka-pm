import { useEnrichedData } from '../hooks/useEnrichedData';
import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import { useAppStore } from "../store/useAppStore";
import { useMemo, useState, useEffect } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays, subDays, startOfDay, endOfDay, isSameDay, isBefore, isAfter } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Project, Task, AppUser, PermissionMatrix, AppRole } from '../types';
import { parseDateTime, getDefaultStoreFilter } from '../lib/utils';
import { Search, Download, Smartphone } from 'lucide-react';

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface CalendarTabProps {
  onEditTask: (t: Task, isReadOnly?: boolean) => void;
  onEditProject: (p: Project, isReadOnly?: boolean) => void;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: any;
  type: 'project' | 'task';
  subType?: 'start' | 'finish';
  colorIndex?: number;
  color?: string;
}

const CustomVerticalView = ({ date, events, onSelectEvent, daysCount }: any) => {
  const range = useMemo(() => {
    let start, end;
    if (daysCount === 7) {
      start = startOfDay(date);
      end = addDays(date, 6);
    } else {
      start = startOfDay(date);
      end = addDays(date, 30);
    }
    
    const daysArray = [];
    let current = start;
    while (current <= end) {
      daysArray.push(current);
      current = addDays(current, 1);
    }
    return daysArray;
  }, [date, daysCount]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    range.forEach(day => {
      map.set(day.toDateString(), []);
    });

    events.forEach((event: CalendarEvent) => {
      range.forEach(day => {
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);
        if (event.start <= dayEnd && event.end >= dayStart) {
          map.get(day.toDateString())?.push(event);
        }
      });
    });
    return map;
  }, [events, range]);

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full bg-slate-50 dark:bg-[#1e1e20]/50 rounded-b-xl">
      {range.map(day => {
        const dayEvents = eventsByDay.get(day.toDateString()) || [];
        if (daysCount !== 7 && dayEvents.length === 0) return null; // hide empty days in agenda
        
        return (
          <div key={day.toDateString()} className="bg-white dark:bg-[#1e1e20] rounded-xl shadow-sm border border-slate-200 dark:border-[#444446] overflow-hidden flex flex-col">
            <div className="bg-slate-100 dark:bg-[#28282a]/80 px-4 py-2.5 border-b border-slate-200 dark:border-[#444446] font-bold text-slate-700 dark:text-[#e3e3e3] text-sm flex items-center justify-between">
              <span>{format(day, 'EEEE, MMMM d, yyyy')}</span>
              <span className="text-xs font-medium text-slate-500 dark:text-[#a3a3a3] bg-white dark:bg-[#1e1e20] px-2 py-1 rounded-md border border-slate-200 dark:border-[#444446] shadow-sm">
                {dayEvents.length} {dayEvents.length === 1 ? 'task' : ''}
              </span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {dayEvents.length > 0 ? dayEvents.map((event, idx) => (
                <div 
                  key={`${event.id}-${idx}`}
                  onClick={() => onSelectEvent && onSelectEvent(event)}
                  className="cursor-pointer rounded-lg px-3 py-2.5 text-white text-sm font-medium shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                  style={{ backgroundColor: event.colorIndex === 0 ? '#10b981' : '#fb923c' }}
                >
                  {event.title}
                </div>
              )) : (
                <div className="text-slate-400 text-sm italic px-2 py-1">No  scheduled for this day.</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CustomWeekView = (props: any) => <CustomVerticalView {...props} daysCount={7} />;
CustomWeekView.range = (date: Date) => [startOfDay(date), addDays(date, 6)];
CustomWeekView.navigate = (date: Date, action: string) => {
  switch (action) {
    case 'PREV': return subDays(date, 7);
    case 'NEXT': return addDays(date, 7);
    default: return date;
  }
};
CustomWeekView.title = (date: Date) => {
  const start = startOfDay(date);
  const end = addDays(date, 6);
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`;
};

const CustomAgendaView = (props: any) => <CustomVerticalView {...props} daysCount={30} />;
CustomAgendaView.range = (date: Date) => [startOfDay(date), addDays(date, 30)];
CustomAgendaView.navigate = (date: Date, action: string) => {
  switch (action) {
    case 'PREV': return subDays(date, 30);
    case 'NEXT': return addDays(date, 30);
    default: return date;
  }
};
CustomAgendaView.title = (date: Date) => {
  const start = startOfDay(date);
  const end = addDays(date, 30);
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`;
};

export function CalendarTab({      onEditTask, onEditProject}: CalendarTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();
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
    safeSetItemLocal('taka_calendar_show_subtasks', showSubTasksInMonth ? 'true' : 'false');
  }, [showSubTasksInMonth]);

  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.calendar) && !isArchiveYear;

  const uniqueStores = useMemo(() => {
    return [...new Set(projects.map(p=> p.store).filter(Boolean))].sort();
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

  const handleExportICS = () => {
    if (events.length === 0) {
      alert("No events to export.");
      return;
    }
    
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Takashimaya Project Management//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    events.forEach(event => {
      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:${event.id}@taka.app`);
      icsContent.push(`DTSTAMP:${formatDate(new Date())}`);
      if (event.allDay) {
        const startStr = format(event.start, 'yyyyMMdd');
        const endStr = format(addDays(event.start, 1), 'yyyyMMdd');
        icsContent.push(`DTSTART;VALUE=DATE:${startStr}`);
        icsContent.push(`DTEND;VALUE=DATE:${endStr}`);
      } else {
        icsContent.push(`DTSTART:${formatDate(event.start)}`);
        icsContent.push(`DTEND:${formatDate(event.end)}`);
      }
      icsContent.push(`SUMMARY:${event.title.replace(/[,;]/g, '\\$&')}`);
      if (event.resource && event.resource.detail) {
        icsContent.push(`DESCRIPTION:${(event.resource.detail || '').replace(/\n/g, '\\n').replace(/[,;]/g, '\\$&')}`);
      }
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\\r\\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Takashimaya_Calendar_${format(new Date(), 'yyyyMMdd')}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const events = useMemo(() => {
    const calendarEvents: CalendarEvent[] = [];

    if (currentView === 'month') {
      const filteredProjects = projects.filter(p=> {
        if (filterStore && p.store !== filterStore) return false;
        if (filterLocation && p.location !== filterLocation) return false;
        return true;
      });

      filteredProjects.forEach(p => {
        const start = parseDateTime(p.computedTakStart || p.start);
        const end = parseDateTime(p.computedTakCompl || p.handover || p.computedOpening || p.opening);

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
            colorIndex: 0, // Emerald for Start
            color: '#10b981'
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
            colorIndex: 1, // Orange for Finish
            color: '#fb923c'
          });
        }
      });

      if (showSubTasksInMonth) {
        const projectMap = new Map();
        projects.forEach(p => {
          const key = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
          projectMap.set(key, p);
          if (p.code) {
            projectMap.set(p.code, p);
          }
        });

        const filteredTasks = tasks.filter(t => {
          const key = `${t.projectCode || ""}-${t.projectYear || ""}-${t.projectStore || ""}`;
          const project = projectMap.get(key) || (t.projectCode ? projectMap.get(t.projectCode) : undefined);
          if (!project) return false;
          
          if (filterStore && project.store !== filterStore) return false;
          if (filterLocation && project.location !== filterLocation) return false;
          
          return true;
        });

        filteredTasks.forEach(t => {
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
              color: '#2563eb' // Xanh dương (Blue)
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
              color: '#a21caf' // Đỏ tía (Deep Purple-Red / Fuchsia)
            });
          }
        });
      }
    } else {
      const projectMap = new Map();
      projects.forEach(p=> {
        const key = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
        projectMap.set(key, p);
        if (p.code) {
          projectMap.set(p.code, p);
        }
      });

      const filteredTasks = tasks.filter(t=> {
        const key = `${t.projectCode || ""}-${t.projectYear || ""}-${t.projectStore || ""}`;
        const project = projectMap.get(key) || (t.projectCode ? projectMap.get(t.projectCode) : undefined);
        if (!project) return false;
        
        if (filterStore && project.store !== filterStore) return false;
        if (filterLocation && project.location !== filterLocation) return false;
        
        return true;
      });

      // Add 
      filteredTasks.forEach(t => {
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
              type: 'task'
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
            type: 'task'
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
            type: 'task'
          });
        }
      });
    }

    // Sort events to ensure consistent ordering
    calendarEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

    if (currentView !== 'month') {
      // Assign alternating colors per day for 
      const eventsByDate: Record<string, number> = {};
      calendarEvents.forEach(event => {
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

  const eventStyleGetter = (event: CalendarEvent) => {
    let backgroundColor = event.color || (event.colorIndex === 0 ? '#10b981' : '#fb923c'); // emerald-500 : orange-400

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
        lineHeight: '1.3'
      }
    };
  };

  const CustomDateHeader = ({ label, date, onDrillDown }: any) => {
    // Check if this date has events
    const dayEvents = events.filter(e => {
      return (startOfDay(e.start) <= startOfDay(date)) && (startOfDay(e.end) >= startOfDay(date));
    });
    const hasEvents = dayEvents.length > 0;
    
    // Collect distinct colors on this day
    const dayColors: string[] = [];
    dayEvents.forEach(e => {
      const c = e.color || (eventStyleGetter(e).style.backgroundColor as string) || (e.colorIndex === 0 ? '#10b981' : '#fb923c');
      if (!dayColors.includes(c)) dayColors.push(c);
    });
    
    const isSelected = isSameDay(date, selectedMonthDate);

    return (
      <div 
        className={`flex flex-col items-center justify-center cursor-pointer mt-1 mx-auto w-10 h-10 ${isSelected ? 'bg-blue-100 dark:bg-blue-900/40 rounded-full' : ''}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedMonthDate(date);
        }}
      >
        <span className={`text-[13px] font-medium leading-none ${isSameDay(date, new Date()) ? 'bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center' : 'text-slate-700 dark:text-[#e3e3e3]'}`}>
          {label}
        </span>
        <div className="h-2 flex items-center justify-center gap-1 mt-1">
          {hasEvents && (
            dayColors.length > 0 ? (
              dayColors.slice(0, 4).map((c, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
              ))
            ) : (
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-grow flex flex-col min-h-[600px] bg-white dark:bg-[#1e1e20] rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm p-4">
      <style>{`
        .rbc-time-content {
          display: none !important;
        }
        .rbc-time-header-gutter {
          display: none !important;
        }
        .rbc-time-view .rbc-time-header {
          flex: 1 1 auto !important;
          min-height: 0 !important;
        }
        .rbc-time-header-content {
          flex: 1 1 auto !important;
          display: flex !important;
          flex-direction: column !important;
          border-left: none !important;
        }
        .rbc-allday-cell {
          flex: 1 1 auto !important;
          height: 100% !important;
          max-height: none !important;
        }
        .rbc-event {
          white-space: normal !important;
          word-break: break-word !important;
          height: auto !important;
          min-height: 24px;
          margin-bottom: 2px !important;
        }
        .rbc-event-content {
          white-space: normal !important;
          word-break: break-word !important;
        }
        .rbc-month-view .rbc-row-segment {
          display: none !important;
        }
        .rbc-month-view .rbc-month-row {
          flex: 1 0 50px !important;
        }
        .rbc-month-view .rbc-date-cell {
          text-align: center !important;
          padding: 0 !important;
        }
        .rbc-month-view .rbc-button-link {
          pointer-events: none !important;
        }
      `}</style>
      <div className="flex flex-col gap-4 mb-4">
        {/* Top Row: Title and Legend */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 dark:text-[#f3f3f3] shrink-0">Task Calendar</h2>
          </div>
          <div className="flex gap-4 text-sm shrink-0">
            {currentView === 'month' ? (
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></div>
                  <span className="text-slate-600 dark:text-[#c3c3c3] font-medium whitespace-nowrap">{t('Project Start')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-orange-400 shrink-0"></div>
                  <span className="text-slate-600 dark:text-[#c3c3c3] font-medium whitespace-nowrap">{t('Project Finish')}</span>
                </div>
                {showSubTasksInMonth && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-blue-600 shrink-0"></div>
                      <span className="text-slate-600 dark:text-[#c3c3c3] font-medium whitespace-nowrap">{t('Task Start')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#a21caf] shrink-0"></div>
                      <span className="text-slate-600 dark:text-[#c3c3c3] font-medium whitespace-nowrap">{t('Task Finish')}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <div className="w-3 h-3 rounded-full bg-orange-400"></div>
                <span className="text-slate-600 dark:text-[#c3c3c3] font-medium">{t('Task con (Tasks)')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row: Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-grow sm:flex-grow-0 min-w-[140px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            <input
              type="date"
              value={searchDate}
              onChange={handleSearchDate}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 dark:border-[#555558] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 dark:bg-[#1e1e20]/50"
              title="Search Date"
            />
          </div>
          <select 
            value={filterStore} 
            onChange={(e) => setFilterStore(e.target.value)}
            className="flex-grow sm:flex-grow-0 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
          >
            <option value="">{t("All Stores")}</option>
            {uniqueStores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select 
            value={filterLocation} 
            onChange={(e) => setFilterLocation(e.target.value)}
            className="flex-grow sm:flex-grow-0 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
          >
            <option value="">{t("All Locations")}</option>
            {Array.from(new Set(locations)).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {/* Toggle Task Con */}
          <button
            type="button"
            onClick={() => setShowSubTasksInMonth(prev => !prev)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-all shadow-xs shrink-0 select-none ${
              showSubTasksInMonth
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold'
                : 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#28282a]'
            }`}
            title="Bật/tắt hiển thị task con trong calendar"
          >
            <span className="text-xs sm:text-sm whitespace-nowrap">{t('Task con')}</span>
            <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors relative flex items-center ${
              showSubTasksInMonth ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
            }`}>
              <div className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                showSubTasksInMonth ? 'translate-x-3.5' : 'translate-x-0'
              }`} />
            </div>
          </button>
          <button
            onClick={handleExportICS}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] hover:bg-slate-50 dark:hover:bg-[#28282a] transition-colors outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
            title="Export to Calendar (.ics)"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export ICS</span>
          </button>
          <button
            onClick={() => useAppStore.getState().setIsCalendarSyncModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800/60 rounded-lg text-sm font-semibold text-red-700 dark:text-red-300 transition-all outline-none focus:ring-2 focus:ring-red-500 shrink-0 shadow-xs cursor-pointer active:scale-95"
            title="Đồng bộ Apple Calendar (iOS)"
          >
            <Smartphone className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="hidden sm:inline">Apple Calendar (iOS)</span>
          </button>
        </div>
      </div>
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
              dateHeader: CustomDateHeader
            }
          }}
          views={{
            month: true,
            week: CustomWeekView,
            day: true,
            agenda: CustomAgendaView
          }}
          popup
        />
      </div>

      {currentView === 'month' && (
        <div className="mt-4 border-t border-slate-200 dark:border-[#444446] pt-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-[#f3f3f3] mb-3">{format(selectedMonthDate, 'EEEE, MMMM d, yyyy')}</h3>
            <div className="flex flex-col gap-2">
                {events.filter(e => (startOfDay(e.start) <= startOfDay(selectedMonthDate)) && (startOfDay(e.end) >= startOfDay(selectedMonthDate))).length > 0 ? (
                  events.filter(e => (startOfDay(e.start) <= startOfDay(selectedMonthDate)) && (startOfDay(e.end) >= startOfDay(selectedMonthDate))).map((event, idx) => (
                    <div 
                      key={`${event.id}-${idx}`}
                      onClick={() => {
                        if (event.type === 'task' && event.resource) {
                          onEditTask(event.resource, true);
                        } else if (event.type === 'project' && event.resource) {
                          onEditProject(event.resource, true);
                        }
                      }}
                      className="cursor-pointer rounded-lg px-3 py-2.5 text-white text-sm font-medium shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 flex items-center justify-between gap-2"
                      style={{ backgroundColor: event.color || (event.colorIndex === 0 ? '#10b981' : '#fb923c') }}
                    >
                      <span className="truncate">{event.title}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/20 text-white shrink-0 uppercase tracking-wider">
                        {event.type === 'project' ? t('Project') : t('Task')}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-400 text-sm italic px-2 py-1">{t('No events scheduled for this day.')}</div>
                )}
            </div>
        </div>
      )}
    </div>
  );
}

export default CalendarTab;
