import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Flag,
  MessageSquare,
  Paperclip,
  Play,
  RotateCcw,
  Send,
  Zap,
} from 'lucide-react';
import { QuickNavButton } from '../QuickNavButton';
import { MyWorkKanbanColumnId, UnifiedWorkItem } from './myWorkTypes';
import { cn, formatDisplayDateMain } from '../../lib/utils';

interface MyWorkKanbanViewProps {
  todoItems: UnifiedWorkItem[];
  inProgressItems: UnifiedWorkItem[];
  pendingApprovalItems: UnifiedWorkItem[];
  doneItems: UnifiedWorkItem[];
  onAcceptItem: (item: UnifiedWorkItem) => void;
  onReportSubTaskComplete: (item: UnifiedWorkItem) => void;
  onToggleTaskComplete: (item: UnifiedWorkItem) => void;
  onApproveItem: (item: UnifiedWorkItem) => void;
  onReworkItem: (item: UnifiedWorkItem) => void;
  onMoveItemToColumn: (item: UnifiedWorkItem, targetCol: MyWorkKanbanColumnId) => void;
  onItemClick: (item: UnifiedWorkItem, initialTab?: 'details' | 'chat') => void;
}

interface KanbanColDef {
  id: MyWorkKanbanColumnId;
  title: string;
  headerBg: string;
  items: UnifiedWorkItem[];
}

export const MyWorkKanbanView: React.FC<MyWorkKanbanViewProps> = React.memo(function MyWorkKanbanView({
  todoItems,
  inProgressItems,
  pendingApprovalItems,
  doneItems,
  onAcceptItem,
  onReportSubTaskComplete,
  onToggleTaskComplete,
  onApproveItem,
  onReworkItem,
  onMoveItemToColumn,
  onItemClick,
}) {
  const [draggedItem, setDraggedItem] = useState<UnifiedWorkItem | null>(null);
  const [dragOverCol, setDragOverCol] = useState<MyWorkKanbanColumnId | null>(null);

  const columns: KanbanColDef[] = [
    {
      id: 'todo',
      title: 'To Do / Assigned',
      headerBg: 'bg-sky-500 dark:bg-sky-600 text-white',
      items: todoItems,
    },
    {
      id: 'in_progress',
      title: 'In Progress',
      headerBg: 'bg-indigo-800 dark:bg-indigo-700 text-white',
      items: inProgressItems,
    },
    {
      id: 'pending_approval',
      title: 'Pending Approval',
      headerBg: 'bg-amber-500 dark:bg-amber-600 text-white',
      items: pendingApprovalItems,
    },
    {
      id: 'done',
      title: 'Completed',
      headerBg: 'bg-emerald-500 dark:bg-emerald-600 text-white',
      items: doneItems,
    },
  ];

  const handleCircleAction = (e: React.MouseEvent, item: UnifiedWorkItem) => {
    e.stopPropagation();
    if (item.type === 'task' || item.type === 'project_milestone') {
      onToggleTaskComplete(item);
      return;
    }
    if (item.type === 'delegation_subtask') {
      if (item.canApproveOrReject) {
        onApproveItem(item);
      } else if (item.isCreator && !item.isCompleted) {
        onApproveItem({ ...item, canApproveOrReject: true });
      } else if (item.canSubmitApproval) {
        onReportSubTaskComplete(item);
      }
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto w-full px-4 sm:px-6 py-4 flex-grow">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {columns.map((col) => {
          const isDropTarget = dragOverCol === col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverCol !== col.id) setDragOverCol(col.id);
              }}
              onDragLeave={() => {
                if (dragOverCol === col.id) setDragOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCol(null);
                if (draggedItem && draggedItem.kanbanColumn !== col.id) {
                  onMoveItemToColumn(draggedItem, col.id);
                }
                setDraggedItem(null);
              }}
              className={cn(
                'flex flex-col rounded-2xl bg-slate-100/80 dark:bg-[#19191d] border border-slate-200/80 dark:border-[#2e2e34] overflow-hidden transition-all min-h-[420px]',
                isDropTarget && 'ring-2 ring-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
              )}
            >
              {/* Colored Pill Column Header */}
              <div className={cn('px-3.5 py-2.5 flex items-center justify-between shadow-2xs', col.headerBg)}>
                <span className="font-extrabold text-xs sm:text-sm tracking-wide truncate">
                  {col.title}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-white text-slate-900 shadow-2xs">
                    {col.items.length}
                  </span>
                  <Zap className="w-3.5 h-3.5 opacity-80" />
                </div>
              </div>

              {/* Cards Container */}
              <div className="p-2.5 space-y-2.5 max-h-[calc(100dvh-310px)] overflow-y-auto">
                {col.items.length === 0 ? (
                  <div className="py-12 px-4 text-center rounded-xl border border-dashed border-slate-300/70 dark:border-[#33333c] text-xs text-slate-400 dark:text-slate-500">
                    No items in {col.title}
                  </div>
                ) : (
                  col.items.map((item) => {
                    const dispDate = item.dueDateStr ? formatDisplayDateMain(item.dueDateStr) : 'No date';
                    const avatarInitial = String(item.party || 'U').trim().charAt(0).toUpperCase();
                    const canTapCircle =
                      ((item.type === 'task' || item.type === 'project_milestone') && item.canEdit) ||
                      (item.type === 'delegation_subtask' &&
                        (item.canSubmitApproval || item.canApproveOrReject || item.isCreator));

                    return (
                      <div
                        key={item.id}
                        draggable={item.canEdit || item.canApproveOrReject}
                        onDragStart={() => setDraggedItem(item)}
                        onDragEnd={() => {
                          setDraggedItem(null);
                          setDragOverCol(null);
                        }}
                        onClick={() => onItemClick(item, 'details')}
                        className={cn(
                          'group rounded-xl bg-white dark:bg-[#222227] p-3 border border-slate-200/90 dark:border-[#34343c] shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer select-none flex flex-col gap-2',
                          item.isFocusedTarget &&
                            'ring-2 ring-violet-500 dark:ring-violet-400 bg-violet-50/40 dark:bg-violet-950/30',
                          item.isCompleted && 'opacity-85'
                        )}
                      >
                        {/* Top Status & QuickNav Bar */}
                        <div className="flex items-center justify-between gap-1.5 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.isFocusedTarget && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-violet-600 text-white">
                                🎯 Target
                              </span>
                            )}
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                                item.isOverdue || item.isNeedsRework
                                  ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                                  : item.isAwaitingMyApproval
                                  ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                                  : item.isCompleted
                                  ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                                  : 'bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60'
                              )}
                            >
                              <span
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  item.isOverdue || item.isNeedsRework
                                    ? 'bg-rose-500'
                                    : item.isAwaitingMyApproval
                                    ? 'bg-amber-500'
                                    : item.isCompleted
                                    ? 'bg-emerald-500'
                                    : 'bg-sky-500'
                                )}
                              />
                              <span>{item.friendlyDueLabel}</span>
                            </span>

                            {item.type === 'delegation_subtask' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50">
                                Delegation
                              </span>
                            )}
                            {item.type === 'project_milestone' && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 dark:bg-purple-950/70 text-purple-600 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/50">
                                <Flag className="w-2.5 h-2.5" />
                                {item.milestoneKind}
                              </span>
                            )}
                          </div>

                          <div
                            className="flex items-center gap-1 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.rawProject && (
                              <QuickNavButton
                                project={item.rawProject}
                                task={item.rawTask || null}
                                taskCode={item.rawTask?.taskCodePhu || item.projectCode}
                              />
                            )}
                          </div>
                        </div>

                        {/* Title with 1-Click Check Circle & Project Metadata */}
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            disabled={!canTapCircle}
                            onClick={(e) => handleCircleAction(e, item)}
                            title={
                              item.isCompleted
                                ? 'Click to reopen'
                                : item.type === 'delegation_subtask' && !item.isCreator
                                ? 'Click to request approval (85%)'
                                : 'Click to mark as Completed (100%)'
                            }
                            className={cn(
                              'mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all touch-manipulation active:scale-90',
                              item.isCompleted
                                ? 'bg-emerald-500 border-emerald-500 text-white cursor-pointer'
                                : item.isAwaitingMyApproval
                                ? 'bg-amber-100 dark:bg-amber-950/70 border-amber-400 dark:border-amber-500 text-amber-600 dark:text-amber-300 cursor-pointer'
                                : canTapCircle
                                ? 'border-slate-300 dark:border-slate-500 hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-transparent hover:text-emerald-600 cursor-pointer'
                                : 'border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed'
                            )}
                          >
                            {item.isCompleted ? (
                              <Check className="w-3 h-3 stroke-[3]" />
                            ) : item.isAwaitingMyApproval ? (
                              <Clock className="w-3 h-3" />
                            ) : (
                              <Check className="w-3 h-3 stroke-[2.5]" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <h4
                              className={cn(
                                'font-bold text-xs sm:text-sm text-slate-800 dark:text-[#f3f3f3] leading-snug line-clamp-2',
                                item.isCompleted && 'line-through text-slate-400 dark:text-slate-500'
                              )}
                            >
                              {item.title}
                            </h4>

                            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                              <span className="font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#2c2c34] text-slate-700 dark:text-slate-300">
                                {item.projectCode}
                                {item.floor ? ` • ${String(item.floor).toUpperCase()}` : ''}
                                {item.projectStore ? ` • ${item.projectStore}` : ''}
                              </span>
                              <span className="truncate max-w-[150px]">{item.projectName}</span>
                            </div>

                            {item.reportSnippet && (
                              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 italic bg-slate-50 dark:bg-[#1b1b20] px-2 py-0.5 rounded border border-slate-100 dark:border-[#2e2e36]">
                                {item.reportSnippet}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* RBAC Action Bar for Delegation / Task State Machine */}
                        <div
                          className="flex items-center gap-1.5 flex-wrap pt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* 1. Accept / Start Task (To Do -> In Progress) */}
                          {item.canAccept && (
                            <button
                              type="button"
                              onClick={() => onAcceptItem(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer active:scale-95 touch-manipulation"
                              title={
                                item.type === 'delegation_subtask'
                                  ? 'Accept Delegation & Start Work (50%)'
                                  : 'Move Task to In Progress'
                              }
                            >
                              <Play className="w-3 h-3" />
                              <span>{item.type === 'delegation_subtask' ? 'Accept (50%)' : 'Start'}</span>
                            </button>
                          )}

                          {/* 2. Request Approval (85% Pending completed) for Delegation SubTask */}
                          {item.type === 'delegation_subtask' && item.canSubmitApproval && (
                            <button
                              type="button"
                              onClick={() => onReportSubTaskComplete(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/70 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-all cursor-pointer active:scale-95 touch-manipulation"
                              title="Request Approval (85% Pending Completed)"
                            >
                              <Send className="w-3 h-3" />
                              <span>Request Approval</span>
                            </button>
                          )}

                          {/* 3. Approve (100%) & Reject/Rework (25%) ONLY for Creator / Admin */}
                          {item.canApproveOrReject && (
                            <>
                              <button
                                type="button"
                                onClick={() => onApproveItem(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-all cursor-pointer active:scale-95 touch-manipulation"
                                title="Approve (100% Completed)"
                              >
                                <Check className="w-3 h-3 stroke-[2.5]" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onReworkItem(item)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition-all cursor-pointer active:scale-95 touch-manipulation"
                                title="Return for Rework / Reject"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Rework</span>
                              </button>
                            </>
                          )}

                          {/* 4. Standard Task & Milestone 1-Click Complete / Reopen */}
                          {(item.type === 'task' || item.type === 'project_milestone') &&
                            item.canEdit &&
                            !item.isAwaitingMyApproval && (
                              <button
                                type="button"
                                onClick={() => onToggleTaskComplete(item)}
                                className={cn(
                                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer active:scale-95 touch-manipulation',
                                  item.isCompleted
                                    ? 'bg-slate-100 dark:bg-[#2c2c34] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#3c3c46]'
                                    : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                                )}
                              >
                                <Check className="w-3 h-3" />
                                <span>{item.isCompleted ? 'Reopen' : 'Complete'}</span>
                              </button>
                            )}
                        </div>

                        {/* Card Footer: PIC Avatar + Date + Comments & Attachments Count */}
                        <div className="pt-2 mt-0.5 border-t border-slate-100 dark:border-[#2e2e36] flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-extrabold text-[10px] flex items-center justify-center shrink-0 shadow-2xs"
                              title={`PIC: ${item.party}`}
                            >
                              {avatarInitial}
                            </div>
                            <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[75px]">
                              {item.party}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {dispDate}
                            </span>
                          </div>

                          <div
                            className="flex items-center gap-2 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              onItemClick(item, 'chat');
                            }}
                          >
                            <span
                              className="inline-flex items-center gap-0.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              title="Comments & Chat"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>{item.commentCount}</span>
                            </span>
                            <span
                              className="inline-flex items-center gap-0.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              title="Attachments"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>{item.attachmentCount}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
