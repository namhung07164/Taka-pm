import React, { FC } from 'react';
import { format, startOfDay } from 'date-fns';
import { useLanguage } from '../../lib/LanguageContext';
import { CalendarEvent } from './calendarTypes';
import { Project, Task } from '../../types';

interface CalendarMonthDayListProps {
  selectedMonthDate: Date;
  events: CalendarEvent[];
  onEditTask: (t: Task, isReadOnly?: boolean) => void;
  onEditProject: (p: Project, isReadOnly?: boolean) => void;
}

export const CalendarMonthDayList: React.FC<CalendarMonthDayListProps> = ({
  selectedMonthDate,
  events,
  onEditTask,
  onEditProject,
}) => {
  const { t } = useLanguage();

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
              onClick={() => {
                if (event.type === 'task' && event.resource) {
                  onEditTask(event.resource, true);
                } else if (event.type === 'project' && event.resource) {
                  onEditProject(event.resource, true);
                }
              }}
              className="cursor-pointer rounded-lg px-3 py-2.5 text-white text-sm font-medium shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 flex items-center justify-between gap-2"
              style={{
                backgroundColor:
                  event.color ||
                  (event.colorIndex === 0 ? '#10b981' : '#fb923c'),
              }}
            >
              <span className="truncate">{event.title}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/20 text-white shrink-0 uppercase tracking-wider">
                {event.type === 'project' ? t('Project') : t('Task')}
              </span>
            </div>
          ))
        ) : (
          <div className="text-slate-400 text-sm italic px-2 py-1">
            {t('No events scheduled for this day.')}
          </div>
        )}
      </div>
    </div>
  );
};
