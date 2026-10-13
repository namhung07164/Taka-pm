import React, { Fragment, memo } from 'react';
import { Project } from '../../types';
import { DragOverTarget } from './generalTypes';
import { getStatus, formatDisplayDateMain, computePlanProgressFromSummaries, computeActProgressFromSummaries } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { Pin, GripVertical, ChevronUp, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

interface GeneralMobileCardProps {
  project: Project;
  idx: number;
  pinnedProjects: string[];
  draggedPinnedId: string | null;
  dragOverTarget: DragOverTarget | null;
  justDroppedId: string | null;
  onProjectClick: (p: Project) => void;
  handlePinToggle: (e: React.MouseEvent, projectId: string) => void;
  handleMovePinned: (e: React.MouseEvent, projectId: string, direction: 'up' | 'down') => void;
  handleDragStart: (e: React.DragEvent, id: string) => void;
  handleRowDragOver: (e: React.DragEvent, targetProject: Project, idx: number) => void;
  handleRowDrop: (e: React.DragEvent, targetId: string, position: 'above' | 'below') => void;
  handleDragEnd: () => void;
}

export const GeneralMobileCard = memo(function GeneralMobileCard({
  project: p,
  idx,
  pinnedProjects,
  draggedPinnedId,
  dragOverTarget,
  justDroppedId,
  onProjectClick,
  handlePinToggle,
  handleMovePinned,
  handleDragStart,
  handleRowDragOver,
  handleRowDrop,
  handleDragEnd
}: GeneralMobileCardProps) {
  const { t } = useLanguage();

  const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
  
  let statusBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  let borderAccentClass = 'border-l-4 border-l-slate-400';
  let bgCardTint = 'bg-white dark:bg-[#1e1e20]';
  
  if (status === 'Completed') {
    statusBadgeClass = 'bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white shadow-2xs font-extrabold border-emerald-500';
    borderAccentClass = 'border-l-[5px] border-l-emerald-500';
    bgCardTint = 'bg-emerald-50/25 dark:bg-emerald-950/15';
  } else if (status === 'Handover') {
    statusBadgeClass = 'bg-blue-600 text-white dark:bg-blue-600 dark:text-white shadow-2xs font-extrabold border-blue-500';
    borderAccentClass = 'border-l-[5px] border-l-blue-500';
    bgCardTint = 'bg-blue-50/25 dark:bg-blue-950/15';
  } else if (status === 'On process') {
    statusBadgeClass = 'bg-amber-500 text-white dark:bg-amber-500 dark:text-white shadow-2xs font-extrabold border-amber-400';
    borderAccentClass = 'border-l-[5px] border-l-amber-500';
    bgCardTint = 'bg-amber-50/30 dark:bg-amber-950/20';
  } else if (status === 'Canceled') {
    statusBadgeClass = 'bg-rose-600 text-white dark:bg-rose-600 dark:text-white shadow-2xs font-extrabold border-rose-500';
    borderAccentClass = 'border-l-[5px] border-l-rose-500';
    bgCardTint = 'bg-rose-50/25 dark:bg-rose-950/15';
  } else {
    statusBadgeClass = 'bg-indigo-600 text-white dark:bg-indigo-600 dark:text-white shadow-2xs font-extrabold border-indigo-500';
    borderAccentClass = 'border-l-[5px] border-l-indigo-500';
    bgCardTint = 'bg-indigo-50/25 dark:bg-indigo-950/15';
  }

  const storeUpper = (p.store || '').toUpperCase();
  let storeBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  if (storeUpper === 'HCM') {
    storeBadgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200/80 dark:border-blue-800 font-bold';
  } else if (storeUpper === 'HN') {
    storeBadgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200/80 dark:border-rose-800 font-bold';
  } else if (storeUpper) {
    storeBadgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200/80 dark:border-amber-800 font-bold';
  }

  const progressPercent = (p.computedPlanProgress && p.computedPlanProgress > 0)
    ? p.computedPlanProgress
    : (p.taskSummaries && p.taskSummaries.length > 0 ? computePlanProgressFromSummaries(p.taskSummaries) : (p.computedPlanProgress ?? 0));
  const actProgressPercent = (p.computedActProgress && p.computedActProgress > 0)
    ? p.computedActProgress
    : (p.taskSummaries && p.taskSummaries.length > 0 ? computeActProgressFromSummaries(p.taskSummaries) : (p.computedActProgress ?? 0));
  
  const allStoreTasks = useAppStore.getState().tasks || [];
  const projectTasks = allStoreTasks.filter(t => 
    (p.id && String(t.projectId) === String(p.id)) || 
    (p.code && t.projectCode === p.code)
  );
  const storeDelegationGroups = useAppStore.getState().delegationGroups || [];
  const hasProjectDelegation = Boolean(
    (p as any).delegation ||
    (p as any).hasDelegation ||
    (projectTasks.length > 0 && projectTasks.some(t => Boolean(t.delegation))) ||
    (p.taskSummaries && p.taskSummaries.length > 0 && p.taskSummaries.some((ts: any) => Boolean(ts.delegation))) ||
    (storeDelegationGroups && storeDelegationGroups.some(g => 
      (p.code && g.projectCode === p.code) || 
      (p.id && (g as any).projectId === p.id) ||
      (projectTasks.some(t => t.id === g.parentTaskId))
    ))
  );
  
  const now = new Date();
  let activeTaskNames: string[] = [];
  if (p.taskSummaries) {
    const activeTasks = p.taskSummaries.filter(t => {
      if (!t.start || !t.finish) return false;
      const start = new Date(t.start);
      const finish = new Date(t.finish);
      return now >= start && now <= finish;
    });
    activeTaskNames = activeTasks.map(t => t.name);
  }
  let taskLines: string[] = [];
  activeTaskNames.forEach(name => {
    taskLines.push(...name.split('\n').filter((l: string) => l.trim() !== ''));
  });

  const isPinned = p.id ? pinnedProjects.includes(p.id) : false;
  const pinnedIndex = p.id ? pinnedProjects.indexOf(p.id) : -1;
  const isSource = draggedPinnedId === p.id;
  const isTarget = dragOverTarget?.id === p.id;
  const isJustDropped = justDroppedId === p.id;

  return (
    <React.Fragment key={p.id || p.no || idx}>
      {/* Insertion line indicator on mobile when dragging above */}
      {draggedPinnedId && isTarget && dragOverTarget.position === 'above' && (
        <div className="w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.8)] -my-1 flex items-center justify-center">
          <span className="bg-blue-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
            ▲ {t('Insert above')}: {p.code}
          </span>
        </div>
      )}

      <div
        onDragOver={(e) => handleRowDragOver(e, p, idx)}
        onDrop={(e) => isTarget && handleRowDrop(e, p.id!, dragOverTarget.position)}
        onClick={() => onProjectClick(p)}
        className={`relative ${bgCardTint} border ${
          isJustDropped
            ? 'border-emerald-500 ring-2 ring-emerald-500/50 scale-[1.01] transition-all duration-700'
            : isSource
              ? 'border-dashed border-blue-400 opacity-40'
              : isPinned
                ? 'border-blue-300/80 dark:border-blue-900/60 shadow-xs'
                : 'border-slate-200 dark:border-[#333336] shadow-2xs'
        } ${borderAccentClass} mobile-card-optimized rounded-xl p-3 flex flex-col gap-2.5 cursor-pointer active:scale-[0.99] transition-all touch-manipulation`}
      >
        {/* Success badge for just dropped items */}
        {isJustDropped && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow animate-pulse">
            <CheckCircle2 className="w-3 h-3" />
            <span>{t('Updated')}</span>
          </div>
        )}

        {/* Card Header: Store, Location, Status, Code & Drag / Pin Actions */}
        <div className="flex items-start justify-between gap-2 w-full">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {p.year && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#252528] text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-[#333336]">
                  {p.year}
                </span>
              )}
              {p.store && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${storeBadgeClass}`}>
                  {p.store}
                </span>
              )}
              {p.location && (
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200/50 dark:border-[#333336]">
                  {p.location}
                </span>
              )}
              <span className="font-mono text-xs font-black text-blue-700 dark:text-[#8ab4f8] bg-blue-50/80 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-200/60 dark:border-blue-900/40">
                {p.code}
              </span>
            </div>
            {p.linkCodes && p.linkCodes !== p.code && (
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-normal leading-tight break-words">
                🔗 {p.linkCodes}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-md border whitespace-nowrap ${statusBadgeClass}`}>
              {status}
            </div>
            
            {/* Drag Handle & Pin Actions */}
            <div className="flex items-center bg-slate-100/90 dark:bg-slate-800/90 rounded-md p-0.5 border border-slate-200/60 dark:border-slate-700/60 shadow-2xs">
              {isPinned && (
                <div className="flex items-center gap-0.5 pr-1 border-r border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    disabled={pinnedIndex === 0}
                    onClick={(e) => handleMovePinned(e, p.id!, 'up')}
                    className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 active:scale-95 ${pinnedIndex === 0 ? 'invisible pointer-events-none' : ''}`}
                    title={t('Move up')}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={pinnedIndex === pinnedProjects.length - 1}
                    onClick={(e) => handleMovePinned(e, p.id!, 'down')}
                    className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 active:scale-95 ${pinnedIndex === pinnedProjects.length - 1 ? 'invisible pointer-events-none' : ''}`}
                    title={t('Move down')}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              
              <button
                type="button"
                onClick={(e) => handlePinToggle(e, p.id!)}
                className={`p-1 rounded transition-colors active:scale-95 ${
                  isPinned 
                    ? 'text-blue-600 dark:text-blue-400 hover:text-red-500' 
                    : 'text-slate-400 hover:text-blue-600'
                }`}
                title={isPinned ? t('Unpin') : t('Pin to top')}
              >
                <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
              </button>

              {isPinned && (
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, p.id!)}
                  onDragEnd={handleDragEnd}
                  className="p-1 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title={t('Drag to reorder')}
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Project Name */}
        <div className="font-bold text-slate-900 dark:text-[#ffffff] text-sm sm:text-base leading-snug">
          {p.name}
        </div>

        {/* Key Milestone Dates: Start, Finish, Opening */}
        <div className="grid grid-cols-3 gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50/90 dark:bg-[#161618] border border-slate-200/60 dark:border-[#2e2e32] text-center">
          <div className="flex flex-col min-w-0 pr-1.5">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-none mb-1">{t('Start')}</span>
            {(() => {
              const formatted = formatDisplayDateMain(p.computedTakStart || p.start);
              const commaIdx = formatted.indexOf(',');
              if (commaIdx !== -1) {
                return (
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-[#8ab4f8] leading-tight block">
                    <span className="block">{formatted.slice(0, commaIdx + 1)}</span>
                    <span className="block">{formatted.slice(commaIdx + 1).trim()}</span>
                  </span>
                );
              }
              return (
                <span className="font-mono text-xs font-bold text-blue-600 dark:text-[#8ab4f8] leading-tight break-words whitespace-normal">
                  {formatted || '-'}
                </span>
              );
            })()}
          </div>
          <div className="flex flex-col min-w-0 border-x border-slate-200/60 dark:border-[#2e2e32] px-2">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-none mb-1">{t('Finish')}</span>
            {(() => {
              const formatted = formatDisplayDateMain(p.computedTakCompl || p.handover || (p as any).takCompl);
              const commaIdx = formatted.indexOf(',');
              if (commaIdx !== -1) {
                return (
                  <span className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400 leading-tight block">
                    <span className="block">{formatted.slice(0, commaIdx + 1)}</span>
                    <span className="block">{formatted.slice(commaIdx + 1).trim()}</span>
                  </span>
                );
              }
              return (
                <span className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400 leading-tight break-words whitespace-normal">
                  {formatted || '-'}
                </span>
              );
            })()}
          </div>
          <div className="flex flex-col min-w-0 pl-1.5">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-none mb-1">{t('Opening')}</span>
            {(() => {
              const formatted = formatDisplayDateMain(p.computedOpening || p.opening);
              const commaIdx = formatted.indexOf(',');
              if (commaIdx !== -1) {
                return (
                  <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 leading-tight block">
                    <span className="block">{formatted.slice(0, commaIdx + 1)}</span>
                    <span className="block">{formatted.slice(commaIdx + 1).trim()}</span>
                  </span>
                );
              }
              return (
                <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 leading-tight break-words whitespace-normal">
                  {formatted || '-'}
                </span>
              );
            })()}
          </div>
        </div>

        {/* Progress Bars: Plan bar stacked directly on top of Act bar for easy direct visual comparison */}
        <div className="flex flex-col gap-1.5 py-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight w-11 shrink-0">Plan:</span>
            <div className="flex-1 bg-slate-200/80 dark:bg-slate-700/80 rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300 shadow-2xs" style={{ width: `${progressPercent}%` }}></div>
            </div>
            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 w-9 text-right shrink-0">{progressPercent}%</span>
          </div>
          {hasProjectDelegation && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight w-11 shrink-0">Act:</span>
              <div className="flex-1 bg-slate-200/80 dark:bg-slate-700/80 rounded-full h-2 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full transition-all duration-300 shadow-2xs" style={{ width: `${actProgressPercent}%` }}></div>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 w-9 text-right shrink-0">{actProgressPercent}%</span>
            </div>
          )}
        </div>
        
        {/* Active Subtasks / Description Detail Box */}
        {(taskLines.length > 0 || p.detail) && (
          <div className="bg-slate-50/90 dark:bg-[#161618] rounded-lg p-2 border border-slate-200/60 dark:border-[#2e2e32] text-xs shadow-2xs flex flex-col gap-1">
            {taskLines.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('Detail')}</div>
                {taskLines.map((line, idx) => (
                  <div key={idx} className={`font-medium text-xs leading-tight ${idx % 2 === 0 ? 'text-blue-600 dark:text-[#8ab4f8]' : 'text-orange-600 dark:text-orange-400'}`}>
                    • {line}
                  </div>
                ))}
              </div>
            )}
            {p.detail && (
              <div className="flex flex-col gap-0.5">
                <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('Description')}</div>
                <div className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">{p.detail}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Insertion line indicator on mobile when dragging below */}
      {draggedPinnedId && isTarget && dragOverTarget.position === 'below' && (
        <div className="w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.8)] -my-1 flex items-center justify-center">
          <span className="bg-blue-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
            ▼ {t('Insert below')}: {p.code}
          </span>
        </div>
      )}
    </React.Fragment>
  );
});
