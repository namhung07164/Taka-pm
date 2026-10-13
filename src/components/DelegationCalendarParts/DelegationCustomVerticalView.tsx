import React, { FC, useMemo } from 'react';
import { format, addDays, subDays, startOfDay, endOfDay } from 'date-fns';
import { useLanguage } from '../../lib/LanguageContext';
import { DelegationCalendarEvent } from './delegationCalendarTypes';

interface DelegationCustomVerticalViewProps {
  date: Date;
  events: DelegationCalendarEvent[];
  onSelectEvent?: (event: DelegationCalendarEvent) => void;
  daysCount: number;
}

export const DelegationCustomVerticalView: React.FC<DelegationCustomVerticalViewProps> = ({
  date,
  events,
  onSelectEvent,
  daysCount,
}) => {
  const { t } = useLanguage();
  const range = useMemo(() => {
    let start: Date;
    let end: Date;
    if (daysCount === 7) {
      start = startOfDay(date);
      end = addDays(date, 6);
    } else {
      start = startOfDay(date);
      end = addDays(date, 30);
    }

    const daysArray: Date[] = [];
    let current = start;
    while (current <= end) {
      daysArray.push(current);
      current = addDays(current, 1);
    }
    return daysArray;
  }, [date, daysCount]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, DelegationCalendarEvent[]>();
    range.forEach((day) => {
      map.set(day.toDateString(), []);
    });

    events.forEach((event: DelegationCalendarEvent) => {
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
        if (daysCount !== 7 && dayEvents.length === 0) return null;

        return (
          <div
            key={day.toDateString()}
            className="bg-white dark:bg-[#1e1e20] rounded-xl shadow-sm border border-slate-200 dark:border-[#444446] overflow-hidden flex flex-col"
          >
            <div className="bg-slate-100 dark:bg-[#28282a]/80 px-4 py-2.5 border-b border-slate-200 dark:border-[#444446] font-bold text-slate-700 dark:text-[#e3e3e3] text-sm flex items-center justify-between">
              <span>{format(day, 'EEEE, MMMM d, yyyy')}</span>
              <span className="text-xs font-medium text-slate-500 dark:text-[#a3a3a3] bg-white dark:bg-[#1e1e20] px-2 py-1 rounded-md border border-slate-200 dark:border-[#444446] shadow-sm">
                {dayEvents.length} {dayEvents.length === 1 ? 'task' : ''}
              </span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {dayEvents.length > 0 ? (
                dayEvents.map((event, idx) => {
                  const flowTxt =
                    event.resource.subTask.delegationStatus ||
                    event.resource.subTask.status ||
                    'Assigned';
                  const isStart = event.resource.isStartNode;
                  const isFinish = event.resource.isFinishNode;

                  let bgColor = 'bg-slate-50 dark:bg-[#1e1e20]/50';
                  let borderColor = 'border-slate-300 dark:border-[#555558]';

                  if (flowTxt === 'Completed') {
                    bgColor = 'bg-green-50 dark:bg-[#1a3821]';
                    borderColor = 'border-green-200';
                  } else if (
                    flowTxt === 'On process' ||
                    flowTxt === 'Accepted'
                  ) {
                    bgColor = 'bg-blue-50 dark:bg-[#28282a]';
                    borderColor = 'border-blue-200';
                  } else if (
                    flowTxt === 'Delayed' ||
                    [
                      'requested',
                      'hold',
                      'waiting for approval',
                      'pending completed',
                    ].includes(flowTxt.toLowerCase())
                  ) {
                    bgColor = 'bg-orange-50 dark:bg-[#3b2a1a]';
                    borderColor = 'border-orange-200';
                  } else if (
                    flowTxt === 'Approved' ||
                    flowTxt === 'Rejected' ||
                    flowTxt === 'Request Delay' ||
                    flowTxt === 'Needs Rework'
                  ) {
                    bgColor = 'bg-purple-50 dark:bg-[#322a36]';
                    borderColor = 'border-purple-200';
                  } else if (flowTxt === 'Assigned') {
                    bgColor = 'bg-orange-50 dark:bg-[#3b2a1a]';
                    borderColor = 'border-orange-200';
                  }

                  const priority = event.resource.subTask.priority || 'Mid';
                  const prioColors =
                    priority === 'High'
                      ? 'bg-orange-50 dark:bg-[#3b2a1a] text-orange-700 border-orange-200'
                      : priority === 'Mid-high'
                        ? 'bg-yellow-50 dark:bg-[#3b3a1a] text-yellow-700 border-yellow-200'
                        : priority === 'Low'
                          ? 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]'
                          : 'bg-blue-50 dark:bg-[#28282a] text-blue-700 border-blue-200';

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
                          title={event.resource.subTask.party || 'N/A'}
                        >
                          {event.resource.subTask.party || 'N/A'}
                        </span>
                        {isStart && (
                          <span className="bg-slate-200 dark:bg-[#333336]/60 text-slate-700 dark:text-[#e3e3e3] px-1 py-0.5 rounded-[3px] text-[10px] uppercase tracking-wider flex-shrink-0">
                            {t('Start')}
                          </span>
                        )}
                        {isFinish && (
                          <span className="bg-slate-200 dark:bg-[#333336]/60 text-slate-700 dark:text-[#e3e3e3] px-1 py-0.5 rounded-[3px] text-[10px] uppercase tracking-wider flex-shrink-0">
                            {t('Finish')}
                          </span>
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
                  No scheduled for this day.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const CustomWeekView: any = (props: any) => (
  <DelegationCustomVerticalView {...props} daysCount={7} />
);
CustomWeekView.range = (date: Date) => [startOfDay(date), addDays(date, 6)];
CustomWeekView.navigate = (date: Date, action: string) => {
  switch (action) {
    case 'PREV':
      return subDays(date, 7);
    case 'NEXT':
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

export const CustomAgendaView: any = (props: any) => (
  <DelegationCustomVerticalView {...props} daysCount={30} />
);
CustomAgendaView.range = (date: Date) => [startOfDay(date), addDays(date, 30)];
CustomAgendaView.navigate = (date: Date, action: string) => {
  switch (action) {
    case 'PREV':
      return subDays(date, 30);
    case 'NEXT':
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
