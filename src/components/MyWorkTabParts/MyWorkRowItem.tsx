import React from 'react';
import { Check, RotateCcw, Flag, Sparkles, MessageSquare, Clock, Play } from 'lucide-react';
import { QuickNavButton } from '../QuickNavButton';
import { UnifiedWorkItem } from './myWorkTypes';
import { cn } from '../../lib/utils';

interface MyWorkRowItemProps {
  item: UnifiedWorkItem;
  onAcceptItem: (item: UnifiedWorkItem) => void;
  onToggleTaskComplete: (item: UnifiedWorkItem) => void;
  onReportSubTaskComplete: (item: UnifiedWorkItem) => void;
  onApproveItem: (item: UnifiedWorkItem) => void;
  onReworkItem: (item: UnifiedWorkItem) => void;
  onItemClick: (item: UnifiedWorkItem, initialTab?: 'details' | 'chat') => void;
}

export const MyWorkRowItem: React.FC<MyWorkRowItemProps> = React.memo(function MyWorkRowItem({
  item,
  onAcceptItem,
  onToggleTaskComplete,
  onReportSubTaskComplete,
  onApproveItem,
  onReworkItem,
  onItemClick,
}) {
  const priorityBorderClass = item.isCompleted
    ? 'border-l-emerald-500'
    : item.isOverdue || item.isNeedsRework
    ? 'border-l-rose-500'
    : item.isAwaitingMyApproval || item.priority === 'high'
    ? 'border-l-amber-500'
    : 'border-l-blue-500';

  const handleLeftCircleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.type === 'task' || item.type === 'project_milestone') {
      if (item.canEdit) onToggleTaskComplete(item);
    } else if (item.type === 'delegation_subtask') {
      if (item.canApproveOrReject) {
        onApproveItem(item);
      } else if (item.canSubmitApproval) {
        onReportSubTaskComplete(item);
      }
    } else {
      onItemClick(item, 'details');
    }
  };

  return (
    <div
      onClick={() => onItemClick(item, 'details')}
      className={cn(
        'group relative flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-[#333338] border-l-4 bg-white dark:bg-[#1e1e22] hover:bg-slate-50/90 dark:hover:bg-[#26262b] shadow-2xs hover:shadow-sm transition-all cursor-pointer select-none',
        priorityBorderClass,
        item.isFocusedTarget &&
          'ring-2 ring-violet-500/80 dark:ring-violet-400/80 bg-violet-50/40 dark:bg-violet-950/25',
        item.isCompleted && 'opacity-75'
      )}
    >
      {/* Left Column: Things 3-style 1-Click Circular Action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          disabled={!item.canEdit && !item.canApproveOrReject}
          onClick={handleLeftCircleClick}
          title={
            !item.canEdit && !item.canApproveOrReject
              ? 'Read-only (No write permission or archived year)'
              : item.isCompleted
              ? 'Click to reopen'
              : item.type === 'delegation_subtask' && !item.canApproveOrReject
              ? '1-Click: Request Approval (85% Pending Completed)'
              : '1-Click: Mark as Completed'
          }
          className={cn(
            'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer active:scale-90 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed',
            item.isCompleted
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : item.isAwaitingMyApproval
              ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50 text-amber-600 hover:bg-emerald-500 hover:border-emerald-500 hover:text-white'
              : item.isOverdue || item.isNeedsRework
              ? 'border-rose-400 dark:border-rose-500 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-transparent hover:text-emerald-600'
              : 'border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-transparent hover:text-emerald-600'
          )}
        >
          <Check className="w-3 h-3 stroke-[3]" />
        </button>
      </div>

      {/* Middle Column: Clean 2-Line Information */}
      <div className="flex-1 min-w-0">
        {/* Line 1: Work Title + Compact Status Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {item.isFocusedTarget && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-violet-600 text-white shadow-2xs">
              🎯 Target Task
            </span>
          )}

          <span
            className={cn(
              'font-semibold text-sm text-slate-900 dark:text-[#f3f3f3] truncate',
              item.isCompleted && 'line-through text-slate-400 dark:text-slate-500'
            )}
          >
            {item.title}
          </span>

          {item.isNeedsRework && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
              ↺ Needs Rework
            </span>
          )}

          {item.type === 'project_milestone' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
              <Sparkles className="w-2.5 h-2.5" />
              {item.milestoneKind}
            </span>
          )}

          {item.type === 'delegation_subtask' && !item.isNeedsRework && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50">
              Delegation • {item.statusLabel}
            </span>
          )}
        </div>

        {/* Line 2: Compact Metadata [Code • Floor • Store] + Project Name + Due Date */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#9e9ea6] mt-0.5 flex-wrap">
          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#2a2a2e] text-slate-700 dark:text-[#d4d4d8]">
            {item.projectCode}
            {item.floor ? ` • ${String(item.floor).toUpperCase()}` : ''}
            {item.projectStore ? ` • ${item.projectStore}` : ''}
          </span>

          <span className="truncate max-w-[180px] sm:max-w-[260px] font-medium text-slate-600 dark:text-[#b4b4bc]">
            {item.projectName}
          </span>

          {item.party && (
            <span className="text-[11px] text-slate-400 dark:text-[#83838a]">
              • PIC: <strong className="text-slate-600 dark:text-[#c3c3ca]">{item.party}</strong>
            </span>
          )}

          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-bold ml-auto sm:ml-0',
              item.isCompleted
                ? 'text-emerald-600 dark:text-emerald-400'
                : item.isOverdue
                ? 'text-rose-600 dark:text-rose-400'
                : item.dueDiffDays === 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-[#9e9ea6]'
            )}
          >
            <Clock className="w-3 h-3 shrink-0" />
            <span>{item.friendlyDueLabel}</span>
          </span>
        </div>
      </div>

      {/* Right Column: Inline Quick Actions (Strictly RBAC Gated) */}
      <div
        className="flex items-center gap-1.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. If item is awaiting approval and currentUser is Creator/Approver */}
        {item.canApproveOrReject && (
          <>
            <button
              type="button"
              onClick={() => onApproveItem(item)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-all cursor-pointer active:scale-95 touch-manipulation"
              title="1-Click Approve (100% Completed)"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Approve</span>
            </button>

            <button
              type="button"
              onClick={() => onReworkItem(item)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-2xs transition-all cursor-pointer active:scale-95 touch-manipulation"
              title="Request Rework / Return to PIC"
            >
              <RotateCcw className="w-3.5 h-3.5 stroke-[2.2]" />
              <span className="hidden sm:inline">Rework</span>
            </button>
          </>
        )}

        {/* 2. Accept Delegation (0% -> 50% On process) */}
        {item.type === 'delegation_subtask' && item.canAccept && (
          <button
            type="button"
            onClick={() => onAcceptItem(item)}
            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 transition-all cursor-pointer active:scale-95"
            title="Accept Delegation (50% On process)"
          >
            <Play className="w-3 h-3" />
            <span>Accept</span>
          </button>
        )}

        {/* 3. Submit Delegation for Approval (85% Pending completed) */}
        {item.type === 'delegation_subtask' && item.canSubmitApproval && (
          <button
            type="button"
            onClick={() => onReportSubTaskComplete(item)}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 transition-all cursor-pointer active:scale-95 touch-manipulation"
            title="Submit for Approval (85% Pending completed)"
          >
            <Check className="w-3 h-3" />
            <span>Request Approval</span>
          </button>
        )}

        {/* Open Chat directly */}
        <button
          type="button"
          onClick={() => onItemClick(item, 'chat')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#303036] transition-colors cursor-pointer active:scale-95"
          title="Open Comments & Chat"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>

        {/* 1-Click QuickNav to Layout 2D / Gantt / Detail / My Works */}
        {item.rawProject && (
          <QuickNavButton
            project={item.rawProject}
            task={item.rawTask || null}
            taskCode={item.rawTask?.taskCodePhu || item.projectCode}
          />
        )}
      </div>
    </div>
  );
});
