import { Task, Project } from '../types';
import { parseDateTime } from './utils';

export interface IcalOptions {
  tasks: Task[];
  projects?: Project[];
  calendarName?: string;
  calendarDesc?: string;
  storeFilter?: string;
  yearFilter?: string;
  onlyAssignedTo?: string;
  includeProjects?: boolean;
  includeSubtasks?: boolean;
  appUrl?: string;
}

function escapeIcsText(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
    .trim();
}

function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatIcsDateTime(d: Date): string {
  return `${d.getUTCFullYear()}${padZero(d.getUTCMonth() + 1)}${padZero(d.getUTCDate())}T${padZero(d.getUTCHours())}${padZero(d.getUTCMinutes())}${padZero(d.getUTCSeconds())}Z`;
}

function formatIcsDateOnly(d: Date): string {
  return `${d.getFullYear()}${padZero(d.getMonth() + 1)}${padZero(d.getDate())}`;
}

/**
 * Folds lines to max 75 octets per RFC 5545
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.slice(0, 75));
  let i = 75;
  while (i < line.length) {
    // Continuation lines start with a single space
    chunks.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join('\r\n');
}

/**
 * Generates an RFC 5545 compliant iCalendar string
 */
export function generateIcsString(options: IcalOptions): string {
  const {
    tasks,
    projects = [],
    calendarName = 'Takashimaya Project Management',
    calendarDesc = 'Takashimaya department store project schedule',
    storeFilter = '',
    yearFilter = '',
    onlyAssignedTo = '',
    includeProjects = true,
    includeSubtasks = true,
    appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  } = options;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Takashimaya Department Store//Project Schedule 1.0//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calendarName}`,
    'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
    `X-WR-CALDESC:${calendarDesc}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H'
  ];

  const now = new Date();
  const dtStamp = formatIcsDateTime(now);

  // Map projects by code for fast lookup
  const projectMap = new Map<string, Project>();
  projects.forEach(p => {
    if (p.code) {
      projectMap.set(`${p.code}_${p.store || ''}_${p.year || ''}`.toLowerCase(), p);
      projectMap.set(p.code.toLowerCase(), p);
    }
  });

  // 1. Add Projects as Milestone/Summary Events if enabled
  if (includeProjects && projects.length > 0) {
    projects.forEach(proj => {
      if (proj.isDeleted) return;
      if (storeFilter && storeFilter !== 'all' && proj.store && proj.store.toLowerCase() !== storeFilter.toLowerCase()) return;
      if (yearFilter && yearFilter !== 'all' && proj.year && String(proj.year) !== String(yearFilter)) return;

      const pStart = parseDateTime(proj.computedTakStart || proj.start);
      const pFinish = parseDateTime(proj.computedTakCompl || proj.opening || proj.handover);

      if (!pStart) return;

      const endDate = pFinish ? new Date(pFinish) : new Date(pStart);
      const uidStart = `proj_${proj.id || proj.code}_${proj.store || 'store'}_start@takashimaya.vn`;
      const uidEnd = `proj_${proj.id || proj.code}_${proj.store || 'store'}_end@takashimaya.vn`;
      
      const summaryStart = `📌 [Start] [${proj.store || ''}] ${proj.name} (${proj.code})`;
      const summaryEnd = `🏁 [Finish] [${proj.store || ''}] ${proj.name} (${proj.code})`;

      const descLines = [
        `Project Code: ${proj.code}`,
        `Project Name: ${proj.name}`,
        `Store: ${proj.store || 'HCM/HN'}`,
        `Location: ${proj.location || 'N/A'}`,
        proj.detail ? `Detail: ${proj.detail}` : '',
        appUrl ? `View on Web: ${appUrl}` : ''
      ].filter(Boolean).join('\n');

      const location = `Takashimaya ${proj.store || ''} - ${proj.location || ''}`;
      
      // Start Event (1 day milestone)
      const pStartNextDay = new Date(pStart);
      pStartNextDay.setDate(pStartNextDay.getDate() + 1);

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uidStart}`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(pStart)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDateOnly(pStartNextDay)}`);
      lines.push(`SUMMARY:${escapeIcsText(summaryStart)}`);
      lines.push(`DESCRIPTION:${escapeIcsText(descLines)}`);
      lines.push(`LOCATION:${escapeIcsText(location)}`);
      lines.push('STATUS:CONFIRMED');
      lines.push(`CATEGORIES:Takashimaya,Project,${proj.store || 'Store'}`);
      lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');

      // Finish Event (1 day milestone, only if distinct from start)
      if (formatIcsDateOnly(pStart) !== formatIcsDateOnly(endDate)) {
        const pEndNextDay = new Date(endDate);
        pEndNextDay.setDate(pEndNextDay.getDate() + 1);

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${uidEnd}`);
        lines.push(`DTSTAMP:${dtStamp}`);
        lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(endDate)}`);
        lines.push(`DTEND;VALUE=DATE:${formatIcsDateOnly(pEndNextDay)}`);
        lines.push(`SUMMARY:${escapeIcsText(summaryEnd)}`);
        lines.push(`DESCRIPTION:${escapeIcsText(descLines)}`);
        lines.push(`LOCATION:${escapeIcsText(location)}`);
        lines.push('STATUS:CONFIRMED');
        lines.push(`CATEGORIES:Takashimaya,Project,${proj.store || 'Store'}`);
        lines.push('TRANSP:TRANSPARENT');
        lines.push('END:VEVENT');
      }
    });
  }

  // 2. Add Tasks
  tasks.forEach(task => {
    if (task.isDeleted) return;

    // Filter by subtask if toggle off
    if (!includeSubtasks && task.parentTaskId) return;

    // Filter by store
    if (storeFilter && storeFilter !== 'all' && task.projectStore && task.projectStore.toLowerCase() !== storeFilter.toLowerCase()) {
      return;
    }

    // Filter by year
    if (yearFilter && yearFilter !== 'all' && task.projectYear && String(task.projectYear) !== String(yearFilter)) {
      return;
    }

    // Filter by assignee / party
    if (onlyAssignedTo) {
      const party = (task.party || '').toLowerCase();
      const matchParty = party.includes(onlyAssignedTo.toLowerCase());
      if (!matchParty) return;
    }

    const dStart = parseDateTime(task.start);
    const dFinish = parseDateTime(task.finish);

    if (!dStart) return;

    const endDate = dFinish ? new Date(dFinish) : new Date(dStart);
    const isAllDay = (task.start && task.start.length === 10) && (!task.finish || task.finish.length === 10);

    const relatedProject = projectMap.get(`${task.projectCode}_${task.projectStore || ''}_${task.projectYear || ''}`.toLowerCase()) 
      || projectMap.get(task.projectCode.toLowerCase());

    const projectName = relatedProject ? relatedProject.name : task.projectCode;
    const store = task.projectStore || relatedProject?.store || '';
    const taskCode = task.taskCodePhu || task.name;

    const summaryPrefix = store ? `[${store}]` : '';
    const summaryStart = `[Start] ${summaryPrefix} ${task.name} (${task.projectCode})`;
    const summaryEnd = `[Finish] ${summaryPrefix} ${task.name} (${task.projectCode})`;

    const notesContent = (task.notes || []).map(n => n.content).join('; ');
    const descParts = [
      `Task: ${task.name}`,
      `Project: ${projectName} (${task.projectCode})`,
      store ? `Store: Takashimaya ${store}` : '',
      task.party ? `Assigned To: ${task.party}` : '',
      task.runningStatus ? `Status: ${task.runningStatus}` : '',
      task.predecessor ? `Predecessor: ${task.predecessor}` : '',
      task.duration ? `Duration: ${task.duration}` : '',
      notesContent ? `Notes: ${notesContent}` : '',
      appUrl ? `Open App: ${appUrl}` : ''
    ].filter(Boolean);

    const descText = descParts.join('\n');
    const location = store || relatedProject?.location ? `Takashimaya ${store} - ${relatedProject?.location || ''}` : '';

    const uidStart = `task_${task.id}_start@takashimaya.vn`;
    const uidEnd = `task_${task.id}_end@takashimaya.vn`;

    // Start Event
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uidStart}`);
    lines.push(`DTSTAMP:${dtStamp}`);

    if (isAllDay) {
      const startNextDay = new Date(dStart);
      startNextDay.setDate(startNextDay.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(dStart)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDateOnly(startNextDay)}`);
    } else {
      const startEnd = new Date(dStart);
      startEnd.setHours(startEnd.getHours() + 1);
      lines.push(`DTSTART:${formatIcsDateTime(dStart)}`);
      lines.push(`DTEND:${formatIcsDateTime(startEnd)}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(summaryStart)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(descText)}`);
    if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
    lines.push('STATUS:CONFIRMED');
    lines.push(`CATEGORIES:Takashimaya,Task,${store || 'Store'}`);
    lines.push('END:VEVENT');

    // Finish Event (only if different from start)
    const isDifferentDay = isAllDay ? formatIcsDateOnly(dStart) !== formatIcsDateOnly(endDate) : dStart.getTime() !== endDate.getTime();
    
    if (isDifferentDay) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uidEnd}`);
      lines.push(`DTSTAMP:${dtStamp}`);

      if (isAllDay) {
        const endNextDay = new Date(endDate);
        endNextDay.setDate(endNextDay.getDate() + 1);
        lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(endDate)}`);
        lines.push(`DTEND;VALUE=DATE:${formatIcsDateOnly(endNextDay)}`);
      } else {
        const endEnd = new Date(endDate);
        endEnd.setHours(endEnd.getHours() + 1);
        lines.push(`DTSTART:${formatIcsDateTime(endDate)}`);
        lines.push(`DTEND:${formatIcsDateTime(endEnd)}`);
      }

      lines.push(`SUMMARY:${escapeIcsText(summaryEnd)}`);
      lines.push(`DESCRIPTION:${escapeIcsText(descText)}`);
      if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
      lines.push('STATUS:CONFIRMED');
      lines.push(`CATEGORIES:Takashimaya,Task,${store || 'Store'}`);
      lines.push('END:VEVENT');
    }
  });

  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n');
}

/**
 * Triggers native browser download for .ics file
 */
export function downloadIcsFile(icsString: string, filename = 'Takashimaya_Schedule.ics'): void {
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Converts https:// or http:// URL to webcal:// for iOS Calendar subscription
 */
export function toWebcalUrl(httpUrl: string): string {
  if (!httpUrl) return '';
  return httpUrl.replace(/^https?:\/\//i, 'webcal://');
}
