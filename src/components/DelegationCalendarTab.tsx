import { useEnrichedData } from '../hooks/useEnrichedData';
import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import { useAppStore } from "../store/useAppStore";
import { useMemo, useState, useEffect } from "react";
import { useLanguage } from "../lib/LanguageContext";
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays, subDays, startOfDay, endOfDay, isSameDay, isBefore, isAfter } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
  Project,
  Task,
  AppUser,
  DelegationGroup,
  DelegationSubTask,
} from "../types";
import { parseDateTime, getTaskStatus, getStatus, getDefaultStoreFilter } from "../lib/utils";
import { Search, Download } from "lucide-react";

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface DelegationCalendarTabProps {
  groups: DelegationGroup[];
  onTabChange: (tabId: string) => void;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: {
    group: DelegationGroup;
    subTask: DelegationSubTask;
    isStartNode?: boolean;
    isFinishNode?: boolean;
    projectName?: string;
    currentView?: string;
  };
  colorIndex?: number;
}

const CustomVerticalView = ({
  date,
  events,
  onSelectEvent,
  daysCount,
}: any) => {
  const { t } = useLanguage();
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
    range.forEach((day) => {
      map.set(day.toDateString(), []);
    });

    events.forEach((event: CalendarEvent) => {
      range.forEach((day) => {
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
      {range.map((day) => {
        const dayEvents = eventsByDay.get(day.toDateString()) || [];
        if (daysCount !== 7 && dayEvents.length === 0) return null; // hide empty days in agenda

        return (
          <div
            key={day.toDateString()}
            className="bg-white dark:bg-[#1e1e20] rounded-xl shadow-sm border border-slate-200 dark:border-[#444446] overflow-hidden flex flex-col"
          >
            <div className="bg-slate-100 dark:bg-[#28282a]/80 px-4 py-2.5 border-b border-slate-200 dark:border-[#444446] font-bold text-slate-700 dark:text-[#e3e3e3] text-sm flex items-center justify-between">
              <span>{format(day, 'EEEE, MMMM d, yyyy')}</span>
              <span className="text-xs font-medium text-slate-500 dark:text-[#a3a3a3] bg-white dark:bg-[#1e1e20] px-2 py-1 rounded-md border border-slate-200 dark:border-[#444446] shadow-sm">
                {dayEvents.length} {dayEvents.length === 1 ? "task" : ""}
              </span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {dayEvents.length > 0 ? (
                dayEvents.map((event, idx) => {
                  const flowTxt =
                    event.resource.subTask.delegationStatus ||
                    event.resource.subTask.status ||
                    "Assigned";
                  const isStart = event.resource.isStartNode;
                  const isFinish = event.resource.isFinishNode;

                  let bgColor = "bg-slate-50 dark:bg-[#1e1e20]/50";
                  let borderColor = "border-slate-300 dark:border-[#555558]";

                  if (flowTxt === "Completed") {
                    bgColor = "bg-green-50 dark:bg-[#1a3821]";
                    borderColor = "border-green-200";
                  } else if (
                    flowTxt === "On process" ||
                    flowTxt === "Accepted"
                  ) {
                    bgColor = "bg-blue-50 dark:bg-[#28282a]";
                    borderColor = "border-blue-200";
                  } else if (
                    flowTxt === "Delayed" ||
                    [
                      "requested",
                      "hold",
                      "waiting for approval",
                      "pending completed",
                    ].includes(flowTxt.toLowerCase())
                  ) {
                    bgColor = "bg-orange-50 dark:bg-[#3b2a1a]";
                    borderColor = "border-orange-200";
                  } else if (
                    flowTxt === "Approved" ||
                    flowTxt === "Rejected" ||
                    flowTxt === "Request Delay" ||
                    flowTxt === "Needs Rework"
                  ) {
                    bgColor = "bg-purple-50 dark:bg-[#322a36]";
                    borderColor = "border-purple-200";
                  } else if (flowTxt === "Assigned") {
                    bgColor = "bg-orange-50 dark:bg-[#3b2a1a]";
                    borderColor = "border-orange-200";
                  }

                  const priority = event.resource.subTask.priority || "Mid";
                  const prioColors =
                    priority === "High"
                      ? "bg-orange-50 dark:bg-[#3b2a1a] text-orange-700 border-orange-200"
                      : priority === "Mid-high"
                        ? "bg-yellow-50 dark:bg-[#3b3a1a] text-yellow-700 border-yellow-200"
                        : priority === "Low"
                          ? "bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]"
                          : "bg-blue-50 dark:bg-[#28282a] text-blue-700 border-blue-200";

                  return (
                    <div
                      key={`${event.id}-${idx}`}
                      onClick={() => onSelectEvent && onSelectEvent(event)}
                      className={`cursor-pointer rounded border ${borderColor} ${bgColor} overflow-hidden flex flex-col sm:flex-row shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 text-xs min-h-[28px]`}
                    >
                      <div
                        className="flex-1 text-slate-900 dark:text-white px-3 py-2 font-bold whitespace-normal break-words sm:border-r border-b sm:border-b-0 border-black/10 flex items-center gap-1.5 flex-wrap"
                        title={event.title}
                      >
                        {event.resource.projectName && (
                          <span className="bg-blue-500 text-white px-1.5 py-0.5 rounded-[3px] text-[10px] uppercase tracking-wider flex-shrink-0">
                            {event.resource.projectName}
                          </span>
                        )}
                        <span
                          className="bg-blue-500 text-white px-1.5 py-0.5 rounded-[3px] text-[10px] tracking-wider flex-shrink-0 max-w-[100px] truncate"
                          title={event.resource.subTask.party || "N/A"}
                        >
                          {event.resource.subTask.party || "N/A"}
                        </span>
                        {isStart && (
                          <span className="bg-slate-200 dark:bg-[#333336]/60 text-slate-700 dark:text-[#e3e3e3] px-1 py-0.5 rounded-[3px] text-[10px] uppercase tracking-wider flex-shrink-0">{t("Start")}</span>
                        )}
                        {isFinish && (
                          <span className="bg-slate-200 dark:bg-[#333336]/60 text-slate-700 dark:text-[#e3e3e3] px-1 py-0.5 rounded-[3px] text-[10px] uppercase tracking-wider flex-shrink-0">{t("Finish")}</span>
                        )}
                        <span className="leading-tight">{event.title}</span>
                      </div>
                      <div className="flex-1 sm:max-w-[150px] sm:min-w-[120px] px-3 py-2 whitespace-normal break-words flex flex-wrap items-center gap-1.5 border-t sm:border-t-0 border-black/5 dark:border-white/5">
                        <span
                          className="bg-white dark:bg-[#1e1e20]/60 text-slate-700 dark:text-[#e3e3e3] px-1.5 py-1 rounded-[3px] text-[10px] uppercase tracking-wider font-bold border border-black/5 dark:border-white/5"
                          title={flowTxt}
                        >
                          {flowTxt}
                        </span>
                        <span
                          className={`px-1.5 py-1 rounded-[3px] text-[10px] uppercase tracking-wider font-bold border ${prioColors}`}
                          title={priority}
                        >
                          {priority}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-400 text-sm italic px-2 py-1">
                  No  scheduled for this day.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CustomWeekView = (props: any) => (
  <CustomVerticalView {...props} daysCount={7} />
);
CustomWeekView.range = (date: Date) => [
  startOfDay(date),
  addDays(date, 6),
];
CustomWeekView.navigate = (date: Date, action: string) => {
  switch (action) {
    case "PREV":
      return subDays(date, 7);
    case "NEXT":
      return addDays(date, 7);
    default:
      return date;
  }
};
CustomWeekView.title = (date: Date) => {
  const start = startOfDay(date);
  const end = addDays(date, 6);
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`;
};

const CustomAgendaView = (props: any) => (
  <CustomVerticalView {...props} daysCount={30} />
);
CustomAgendaView.range = (date: Date) => [
  startOfDay(date),
  addDays(date, 30),
];
CustomAgendaView.navigate = (date: Date, action: string) => {
  switch (action) {
    case "PREV":
      return subDays(date, 30);
    case "NEXT":
      return addDays(date, 30);
    default:
      return date;
  }
};
CustomAgendaView.title = (date: Date) => {
  const start = startOfDay(date);
  const end = addDays(date, 30);
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`;
};

const CustomEventComponent = ({ event }: any) => {
  const { t } = useLanguage();
  const flowTxt =
    event.resource.subTask.delegationStatus ||
    event.resource.subTask.status ||
    "Assigned";
  const isStart = event.resource.isStartNode;
  const isFinish = event.resource.isFinishNode;

  const priority = event.resource.subTask.priority || "Mid";
  const prioColors =
    priority === "High"
      ? "bg-orange-50 dark:bg-[#3b2a1a] text-orange-700 border-orange-200"
      : priority === "Mid-high"
        ? "bg-yellow-50 dark:bg-[#3b3a1a] text-yellow-700 border-yellow-200"
        : priority === "Low"
          ? "bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]"
          : "bg-blue-50 dark:bg-[#28282a] text-blue-700 border-blue-200";

  return (
    <div
      className="flex flex-col gap-0.5 w-full h-full text-slate-900 dark:text-white"
      title={`${event.resource.projectName || "Task"} - ${event.title} (${flowTxt})`}
    >
      <div className="flex items-start gap-1 font-semibold whitespace-normal leading-tight flex-wrap">
        {event.resource.projectName && (
          <span className="bg-blue-500 text-white px-1 py-0.5 rounded-[3px] text-[9.5px] uppercase tracking-wider flex-shrink-0">
            {event.resource.projectName}
          </span>
        )}
        <span
          className="bg-blue-500 text-white px-1 py-0.5 rounded-[3px] text-[9.5px] tracking-wider flex-shrink-0 font-bold max-w-[80px] truncate"
          title={event.resource.subTask.party || "N/A"}
        >
          {event.resource.subTask.party || "N/A"}
        </span>
        {isStart && (
          <span className="bg-slate-200 dark:bg-[#333336]/60 text-slate-700 dark:text-[#e3e3e3] px-1 py-0.5 rounded-[3px] text-[9px] uppercase tracking-wider flex-shrink-0">{t("Start")}</span>
        )}
        {isFinish && (
          <span className="bg-slate-200 dark:bg-[#333336]/60 text-slate-700 dark:text-[#e3e3e3] px-1 py-0.5 rounded-[3px] text-[9px] uppercase tracking-wider flex-shrink-0">{t("Finish")}</span>
        )}
        <span className="line-clamp-2">{event.title}</span>
      </div>
      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
        <span className="bg-white dark:bg-[#1e1e20]/60 text-slate-700 dark:text-[#e3e3e3] px-1.5 py-0.5 rounded-[3px] text-[9.5px] leading-none whitespace-nowrap border border-black/5 dark:border-white/5 font-bold">
          {flowTxt}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded-[3px] text-[9.5px] font-bold leading-none whitespace-nowrap border ${prioColors}`}
        >
          {priority}
        </span>
      </div>
      {event.resource.currentView === "day" &&
        (event.resource.subTask.comments || event.resource.subTask.report) && (
          <div className="w-full mt-1 flex flex-col gap-1 text-[11px] font-normal text-slate-700 dark:text-[#e3e3e3] bg-black/5 p-1.5 rounded">
            {event.resource.subTask.comments && (
              <div className="flex gap-1 items-start">
                <span className="font-semibold shrink-0 opacity-80">
                  Comments:
                </span>
                <span className="italic whitespace-pre-wrap">
                  {event.resource.subTask.comments}
                </span>
              </div>
            )}
            {event.resource.subTask.report && (
              <div className="flex gap-1 items-start">
                <span className="font-semibold shrink-0 opacity-80">
                  Report:
                </span>
                <span className="italic whitespace-pre-wrap">
                  {event.resource.subTask.report}
                </span>
              </div>
            )}
          </div>
        )}
    </div>
  );
};

export function DelegationCalendarTab({
  groups, onTabChange}: DelegationCalendarTabProps) {

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
  const [currentView, setCurrentView] = useState<View>("month");
  const [searchDate, setSearchDate] = useState("");
  const [filterStore, setFilterStore] = useState(() => {
    const def = getDefaultStoreFilter(currentUser);
    return def === 'all' ? '' : def;
  });

  useEffect(() => {
    safeSetItemLocal(`taka_store_filter_${currentUser.id}`, filterStore || 'all');
  }, [filterStore, currentUser.id]);

  const [filterLocation, setFilterLocation] = useState("");
  const [filterParty, setFilterParty] = useState("");
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(new Date());

  const uniqueStores = useMemo(() => {
    return [...new Set(projects.map(p => p.store).filter(Boolean))].sort();
  }, [projects]);

  const uniqueParties = useMemo(() => {
    const partiesList = new Set<string>();
    groups.forEach((g) =>
      g.subTasks.forEach((st) => {
        if (st.party) partiesList.add(st.party);
      }),
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
        setCurrentView("day");
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
      'PRODID:-//Takashimaya Project Management//Delegation Calendar//EN',
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
      if (event.resource && event.resource.group) {
        const groupDesc = `Group: ${event.resource.group.name || ''}\\nTask: ${event.title}\\nStatus: ${event.resource.subTask?.status || ''}`;
        icsContent.push(`DESCRIPTION:${groupDesc.replace(/\n/g, '\\n').replace(/[,;]/g, '\\$&')}`);
      }
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\\r\\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Takashimaya_Delegation_${format(new Date(), 'yyyyMMdd')}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const events = useMemo(() => {
    const projectMap = new Map();
    projects.forEach(p=> projectMap.set(p.code, p));
    const calendarEvents: CalendarEvent[] = [];

    const filteredGroups = groups.filter((g) => {
      const project = projectMap.get(g.projectCode) || projectMap.get(g.parentTaskId);

      if (filterStore && project && project.store !== filterStore) return false;
      if (filterLocation && project && project.location !== filterLocation)
        return false;

      return true;
    });

    filteredGroups.forEach((group) => {
      const project = projectMap.get(group.projectCode) || projectMap.get(group.parentTaskId);
      const projectPrefix = project ? `(${project.name}) ` : "";
      let subTasksToMap = group.subTasks;
      const isAdmin = currentUser.role === "admin";

      if (!isAdmin && group.createdBy !== currentUser.id) {
        subTasksToMap = subTasksToMap.filter((st) => {
          if (st.createdBy === currentUser.id || (st.involvedUsers && st.involvedUsers.includes(currentUser.id))) return true;
          const pLower = String(st.party || "")
            .toLowerCase()
            .trim();
          const userParties = currentUser.partyPermissions
            ? Object.keys(currentUser.partyPermissions)
                .filter((k) => currentUser.partyPermissions![k])
                .map((k) => k.toLowerCase().trim())
            : [];
          if (userParties.includes('all')) return true;
          const usernameMatch = pLower === String(currentUser.username || "").toLowerCase().trim();
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

          if (currentView === "month") {
            // Only show Start and Finish events
            calendarEvents.push({
              id: `del_${st.id}_start`,
              title: `${group.name} - ${st.name || "Delegation"}`,
              start: evtStart,
              end: evtStart, // single day
              allDay: true,
              resource: {
                group,
                subTask: st,
                isStartNode: true,
                projectName: project ? project.name : "",
                currentView,
              },
              colorIndex: 0,
            });
            // If start and end are the same day, don't duplicate
            if (evtStart.toDateString() !== evtEnd.toDateString()) {
              calendarEvents.push({
                id: `del_${st.id}_end`,
                title: `${group.name} - ${st.name || "Delegation"}`,
                start: evtEnd,
                end: evtEnd, // single day
                allDay: true,
                resource: {
                  group,
                  subTask: st,
                  isFinishNode: true,
                  projectName: project ? project.name : "",
                  currentView,
                },
                colorIndex: 0,
              });
            }
          } else {
            // Week/Agenda: single continuous event so CustomVerticalView shows it every day
            calendarEvents.push({
              id: `del_${st.id}`,
              title: `${group.name} - ${st.name || "Delegation"}`,
              start: evtStart,
              end: evtEnd,
              allDay: true,
              resource: {
                group,
                subTask: st,
                projectName: project ? project.name : "",
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
        ? tasks.find(t => t.id === a.resource.group.parentTaskId)
        : null;
      const parentTaskB = b.resource.group.parentTaskId
        ? tasks.find(t => t.id === b.resource.group.parentTaskId)
        : null;

      let plStatusA = "Upcoming";
      if (parentTaskA) {
        plStatusA = getTaskStatus(parentTaskA.start, parentTaskA.finish);
      } else {
        const pA = projectMap.get(a.resource.group.projectCode) || projectMap.get(a.resource.group.parentTaskId);
        if (pA) {
          plStatusA = getStatus(
            pA.computedTakStart || pA.start,
            pA.computedTakCompl,
            pA.computedOpening || pA.opening,
            pA.code,
          );
        }
      }

      let plStatusB = "Upcoming";
      if (parentTaskB) {
        plStatusB = getTaskStatus(parentTaskB.start, parentTaskB.finish);
      } else {
        const pB = projectMap.get(b.resource.group.projectCode) || projectMap.get(b.resource.group.parentTaskId);
        if (pB) {
          plStatusB = getStatus(
            pB.computedTakStart || pB.start,
            pB.computedTakCompl,
            pB.computedOpening || pB.opening,
            pB.code,
          );
        }
      }

      const statusPriority: Record<string, number> = {
        "On process": 1,
        Handover: 2,
        Upcoming: 3,
        Completed: 4,
        Canceled: 5,
      };

      const priA = statusPriority[plStatusA] || 99;
      const priB = statusPriority[plStatusB] || 99;
      if (priA !== priB) return priA - priB;

      if (plStatusA === "On process") {
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

      const startA = a.resource.subTask.startAct || "9999-12-31";
      const startB = b.resource.subTask.startAct || "9999-12-31";
      if (startA < startB) return -1;
      if (startA > startB) return 1;

      return 0;
    });

    return calendarEvents;
  }, [
    groups,
    
    
    filterStore,
    filterLocation,
    filterParty,
    currentView,
  ]);

  const eventStyleGetter = (event: CalendarEvent) => {
    let backgroundColor = "#f8fafc"; // slate-50
    let borderColor = "#cbd5e1"; // slate-300

    const flowTxt =
      event.resource.subTask.delegationStatus ||
      event.resource.subTask.status ||
      "Assigned";
    if (flowTxt === "Completed") {
      backgroundColor = "#f0fdf4"; // green-50
      borderColor = "#bbf7d0"; // green-200
    } else if (flowTxt === "On process" || flowTxt === "Accepted") {
      backgroundColor = "#eff6ff"; // blue-50
      borderColor = "#bfdbfe"; // blue-200
    } else if (
      flowTxt === "Delayed" ||
      [
        "requested",
        "hold",
        "waiting for approval",
        "pending completed",
      ].includes(flowTxt.toLowerCase())
    ) {
      backgroundColor = "#fff7ed"; // orange-50
      borderColor = "#fed7aa"; // orange-200
    } else if (
      flowTxt === "Approved" ||
      flowTxt === "Rejected" ||
      flowTxt === "Request Delay" ||
      flowTxt === "Needs Rework"
    ) {
      backgroundColor = "#faf5ff"; // purple-50
      borderColor = "#e9d5ff"; // purple-200
    } else if (flowTxt === "Assigned") {
      backgroundColor = "#fff7ed"; // orange-50
      borderColor = "#fed7aa"; // orange-200
    }

    return {
      style: {
        backgroundColor,
        borderRadius: "6px",
        opacity: 0.95,
        color: "#0f172a",
        border: `1px solid ${borderColor}`,
        display: "block",
        fontSize: "11px",
        fontWeight: "600",
        padding: "3px 6px",
        lineHeight: "1.3",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      },
    };
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    onTabChange("taskDelegation");
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("taka_open_delegation_group", {
          detail: {
            groupId: event.resource.group.id,
            subTaskId: event.resource.subTask.id,
          },
        }),
      );
    }, 150);
  };

  const CustomDateHeader = ({ label, date, onDrillDown }: any) => {
    const hasEvents = events.some((e) => {
      return (
        (startOfDay(e.start) <= startOfDay(date)) && (startOfDay(e.end) >= startOfDay(date))
      );
    });

    const isSelected = isSameDay(date, selectedMonthDate);

    return (
      <div
        className={`flex flex-col items-center justify-center cursor-pointer mt-1 mx-auto w-10 h-10 ${isSelected ? "bg-blue-100 rounded-full" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSelectedMonthDate(date);
        }}
      >
        <span
          className={`text-[13px] font-medium leading-none ${isSameDay(date, new Date()) ? "bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center" : "text-slate-700 dark:text-[#e3e3e3]"}`}
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
      <div className="flex flex-col gap-4 mb-4">
        {/* Top Row: Title */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800 dark:text-[#f3f3f3] shrink-0">
              Delegation Calendar
            </h2>
            <span className="text-sm font-medium text-slate-500 dark:text-[#a3a3a3] bg-slate-100 dark:bg-[#28282a] px-2 py-1 rounded-md">
              Total Events: {events.length}
            </span>
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
            {uniqueStores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="flex-grow sm:flex-grow-0 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
          >
            <option value="">{t("All Locations")}</option>
            {Array.from(new Set(locations)).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={filterParty}
            onChange={(e) => setFilterParty(e.target.value)}
            className="flex-grow sm:flex-grow-0 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] outline-none focus:ring-2 focus:ring-blue-500 min-w-[100px]"
          >
            <option value="">All Parties</option>
            <option value="unassigned">Unassigned</option>
            {uniqueParties.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={handleExportICS}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm font-medium text-slate-700 dark:text-[#e3e3e3] hover:bg-slate-50 dark:hover:bg-[#28282a] transition-colors outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
            title="Export to Calendar (.ics)"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export ICS</span>
          </button>
        </div>
      </div>
      <div className="flex-grow min-h-[600px]">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: "100%", minHeight: "600px" }}
          eventPropGetter={eventStyleGetter}
          components={{
            event: CustomEventComponent,
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

      {currentView === "month" && (
        <div className="mt-4 border-t border-slate-200 dark:border-[#444446] pt-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-[#f3f3f3] mb-3">
            {format(selectedMonthDate, 'EEEE, MMMM d, yyyy')}
          </h3>
          <div className="flex flex-col gap-2">
            {events.filter(
              (e) =>
                (startOfDay(e.start) <= startOfDay(selectedMonthDate)) && (startOfDay(e.end) >= startOfDay(selectedMonthDate))
            ).length > 0 ? (
              events
                .filter(
                  (e) =>
                    (startOfDay(e.start) <= startOfDay(selectedMonthDate)) && (startOfDay(e.end) >= startOfDay(selectedMonthDate))
                )
                .map((event, idx) => (
                  <div 
                    key={`${event.id}-${idx}`}
                    className="cursor-pointer bg-slate-50 dark:bg-[#1e1e20]/50 border border-slate-200 dark:border-[#444446] rounded p-2 hover:shadow-sm transition-shadow"
                    onClick={() => handleSelectEvent(event)}
                  >
                    <CustomEventComponent event={event} />
                  </div>
                ))
            ) : (
              <div className="text-slate-400 text-sm italic px-2 py-1">
                No  scheduled for this day.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DelegationCalendarTab;
