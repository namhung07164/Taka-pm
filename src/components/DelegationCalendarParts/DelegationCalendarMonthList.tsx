import React, { FC } from 'react';
import { format, startOfDay } from 'date-fns';
import { DelegationCalendarEvent } from './delegationCalendarTypes';
import { CustomEventComponent } from './DelegationCustomEvent';

interface DelegationCalendarMonthListProps {
  selectedMonthDate: Date;
  events: DelegationCalendarEvent[];
  onSelectEvent: (event: DelegationCalendarEvent) => void;
}

export const DelegationCalendarMonthList: React.FC<DelegationCalendarMonthListProps> = ({
  selectedMonthDate,
  events,
  onSelectEvent,
}) => {
  const dayEvents = events.filter(
    (e) =>
      startOfDay(e.start) <= startOfDay(selectedMonthDate) &&
      startOfDay(e.end) >= startOfDay(selectedMonthDate)
  );

  return (
    <div className="mt-4 border-t border-slate-200 dark:border-[#444446] pt-4">
      <h3 className="text-sm font-bold text-slate-800 dark:text-[#f3f3f3] mb-3">
        {format(selectedMonthDate, 'EEEE, MMMM d, yyyy')}
      </h3>
      <div className="flex flex-col gap-2">
        {dayEvents.length > 0 ? (
          dayEvents.map((event, idx) => (
            <div
              key={`${event.id}-${idx}`}
              className="cursor-pointer bg-slate-50 dark:bg-[#1e1e20]/50 border border-slate-200 dark:border-[#444446] rounded p-2 hover:shadow-sm transition-shadow"
              onClick={() => onSelectEvent(event)}
            >
              <CustomEventComponent event={event} />
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
};
