import React, { FC } from 'react';
import { useLanguage } from '../../lib/LanguageContext';
import { DelegationCalendarEvent } from './delegationCalendarTypes';

interface CustomEventComponentProps {
  event: DelegationCalendarEvent;
}

export const CustomEventComponent: React.FC<CustomEventComponentProps> = ({
  event,
}) => {
  const { t } = useLanguage();
  const flowTxt =
    event.resource.subTask.delegationStatus ||
    event.resource.subTask.status ||
    'Assigned';
  const isStart = event.resource.isStartNode;
  const isFinish = event.resource.isFinishNode;

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
      className="flex flex-col gap-0.5 w-full h-full text-slate-900 dark:text-white"
      title={`${event.resource.projectName || 'Task'} - ${event.title} (${flowTxt})`}
    >
      <div className="flex items-start gap-1 font-semibold whitespace-normal leading-tight flex-wrap">
        {event.resource.projectName && (
          <span className="bg-blue-500 text-white px-1 py-0.5 rounded-[3px] text-[9.5px] uppercase tracking-wider flex-shrink-0">
            {event.resource.projectName}
          </span>
        )}
        <span
          className="bg-blue-500 text-white px-1 py-0.5 rounded-[3px] text-[9.5px] tracking-wider flex-shrink-0 font-bold max-w-[80px] truncate"
          title={event.resource.subTask.party || 'N/A'}
        >
          {event.resource.subTask.party || 'N/A'}
        </span>
        {isStart && (
          <span className="bg-slate-200 dark:bg-[#333336]/60 text-slate-700 dark:text-[#e3e3e3] px-1 py-0.5 rounded-[3px] text-[9px] uppercase tracking-wider flex-shrink-0">
            {t('Start')}
          </span>
        )}
        {isFinish && (
          <span className="bg-slate-200 dark:bg-[#333336]/60 text-slate-700 dark:text-[#e3e3e3] px-1 py-0.5 rounded-[3px] text-[9px] uppercase tracking-wider flex-shrink-0">
            {t('Finish')}
          </span>
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
      {event.resource.currentView === 'day' &&
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
