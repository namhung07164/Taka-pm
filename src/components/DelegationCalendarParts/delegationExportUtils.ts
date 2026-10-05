import { format, addDays } from 'date-fns';
import { DelegationCalendarEvent } from './delegationCalendarTypes';

export function exportDelegationEventsToICS(events: DelegationCalendarEvent[]) {
  if (events.length === 0) {
    alert('No events to export.');
    return;
  }

  const formatDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Takashimaya Project Management//Delegation Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  events.forEach((event) => {
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
      const groupDesc = `Group: ${event.resource.group.name || ''}\nTask: ${event.title}\nStatus: ${event.resource.subTask?.status || ''}`;
      icsContent.push(
        `DESCRIPTION:${groupDesc
          .replace(/\n/g, '\\n')
          .replace(/[,;]/g, '\\$&')}`
      );
    }
    icsContent.push('END:VEVENT');
  });

  icsContent.push('END:VCALENDAR');

  const blob = new Blob([icsContent.join('\r\n')], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Takashimaya_Delegation_${format(new Date(), 'yyyyMMdd')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
