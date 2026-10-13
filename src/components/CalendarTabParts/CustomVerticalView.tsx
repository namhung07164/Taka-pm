import React, { FC, useMemo } from 'react';
import { format, addDays, subDays, startOfDay, endOfDay } from 'date-fns';
import { CalendarEvent } from './calendarTypes';

interface CustomVerticalViewProps {
  date: Date;
  events: CalendarEvent[];
  onSelectEvent?: (event: CalendarEvent) => void;
  daysCount: number;
}

export const CustomVerticalView: React.FC<CustomVerticalViewProps> = ({
  date,
  events,
  onSelectEvent,
  daysCount,
}) => {
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
                {dayEvents.length} {dayEvents.length === 1 ? 'task' : ''}
              </span>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {dayEvents.length > 0 ? (
                dayEvents.map((event, idx) => (
                  <div
                    key={`${event.id}-${idx}`}
                    onClick={() => onSelectEvent && onSelectEvent(event)}
                    className="cursor-pointer rounded-lg px-3 py-2.5 text-white text-sm font-medium shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                    style={{
                      backgroundColor:
                        event.color ||
                        (event.colorIndex === 0 ? '#10b981' : '#fb923c'),
                    }}
                  >
                    {event.title}
                  </div>
                ))
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
  <CustomVerticalView {...props} daysCount={7} />
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
  <CustomVerticalView {...props} daysCount={30} />
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
