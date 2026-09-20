import React, { useState, useMemo } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  ArrowDownUp, 
  Edit2, 
  MessageSquare, 
  Maximize2, 
  X,
  Clock,
  ExternalLink
} from 'lucide-react';
import { cn, formatDisplayDateMain, parseDateTime } from '../../lib/utils';
import { FastToggle } from '../DetailTabParts/FastToggle';
import { Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';

interface LayoutUnitTooltipProps {
  hoverInfo: {
    visible: boolean;
    data: any;
    unitName: string;
  };
  tooltipRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onEditProject?: (project: Project, isReadOnly?: boolean, tab?: 'details' | 'chat' | 'delegation') => void;
  canWrite?: boolean;
  storeFilter?: string;
}

export const LayoutUnitTooltip: React.FC<LayoutUnitTooltipProps> = ({
  hoverInfo,
  tooltipRef,
  onClose,
  onEditProject,
  canWrite = false,
  storeFilter = 'HCM'
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const setProjects = useAppStore(state => state.setProjects);
  const data = hoverInfo?.data || {};
  const p: Project | undefined = data.matchedProject;

  // Delegation toggle handler
  const handleToggleDelegation = async (val: boolean) => {
    if (!p || !p.id) return;
    // 1. Optimistic local update (0ms)
    const currentProjects = useAppStore.getState().projects;
    const updatedProjects = currentProjects.map(proj => proj.id === p.id ? { ...proj, delegation: val } : proj);
    setProjects(updatedProjects);
    // 2. Fire-and-forget background sync to Firestore
    try {
      const projectRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', p.id);
      setDoc(projectRef, { delegation: val, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.error('Error updating project delegation:', e);
    }
  };

  // Subtasks list extraction
  const rawSubTasks: any[] = useMemo(() => {
    if (data.matchedTasks && data.matchedTasks.length > 0) return data.matchedTasks;
    if (p?.taskSummaries && p.taskSummaries.length > 0) return p.taskSummaries;
    if (data.subTasks && data.subTasks.length > 0) return data.subTasks;
    return [];
  }, [data.matchedTasks, data.subTasks, p?.taskSummaries]);

  // Sorted subtasks for expanded view
  const sortedSubTasks = useMemo(() => {
    if (!rawSubTasks || rawSubTasks.length === 0) return [];
    return [...rawSubTasks].sort((a, b) => {
      const startA = a.start || '9999-12-31';
      const startB = b.start || '9999-12-31';
      if (startA !== startB) {
        return sortDirection === 'asc' 
          ? (startA < startB ? -1 : 1) 
          : (startA > startB ? -1 : 1);
      }
      return 0;
    });
  }, [rawSubTasks, sortDirection]);

  // Effective count
  const effectiveTaskCount = useMemo(() => {
    if (rawSubTasks.length > 0) return rawSubTasks.length;
    if (p?.taskCount !== undefined) return p.taskCount;
    if (p?.taskSummaries?.length) return p.taskSummaries.length;
    if (data.taskLines?.length) return data.taskLines.length;
    return 0;
  }, [rawSubTasks, p?.taskCount, p?.taskSummaries, data.taskLines]);

  // Progress metrics
  const planProgressPercent = p?.computedPlanProgress ?? data.planProgressPercent ?? 0;
  const actProgressPercent = p?.computedActProgress ?? data.actProgressPercent ?? 0;

  // Status computation
  const status = p?.computedStatus || data.appProjectStatus || data.status || data.mdStatus || 'On process';
  
  let statusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
  const lowerStatus = String(status).toLowerCase();
  if (lowerStatus.includes('completed') || lowerStatus.includes('done')) {
    statusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200 dark:border-emerald-800';
  } else if (lowerStatus.includes('handover')) {
    statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-900/60';
  } else if (lowerStatus.includes('on process') || lowerStatus.includes('process')) {
    statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-900/60';
  } else if (lowerStatus.includes('delay') || lowerStatus.includes('canceled') || lowerStatus.includes('late')) {
    statusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60';
  } else if (lowerStatus.includes('ready')) {
    statusColorClass = 'bg-amber-50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60';
  }

  // Dates
  const computedTakStart = p?.computedTakStart || p?.start || data.startDate || '';
  const computedTakCompl = p?.computedTakCompl || p?.handover || data.handoverDate || '';

  // Comments count
  const commentsCount = p?.comments?.length || 0;

  // Store display
  const storeDisplay = p?.store || data.store || storeFilter || 'HCM';
  const unitCode = p?.code || hoverInfo.unitName;
  const projectName = p?.name || data.projectName || data.brandName || '';

  const isProjDelegationOn = !!p?.delegation;

  return (
    <div 
      ref={tooltipRef}
      className={cn(
        "fixed z-50 pointer-events-auto rounded-xl border border-slate-200 dark:border-[#444446] shadow-2xl p-3.5 sm:p-4 flex flex-col gap-3 relative transition-all duration-150",
        "bg-white dark:bg-[#1e1e20] text-slate-800 dark:text-slate-100",
        "w-[320px] sm:w-[350px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-28px)] overflow-y-auto custom-scrollbar"
      )}
      style={{ 
        left: -9999, 
        top: -9999,
        transformOrigin: 'top left'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Header Row */}
      <div className="flex items-start justify-between gap-2 pr-12">
        <div className="font-bold text-slate-800 dark:text-[#e3e3e3] text-sm sm:text-base leading-snug flex items-start gap-1.5 flex-1 min-w-0">
          {/* Expand/Collapse Task Count Pill */}
          <button 
            type="button"
            onClick={() => setIsExpanded(!isExpanded)} 
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 mt-0.5 shrink-0 rounded font-bold text-xs shadow-sm transition-all active:scale-95 touch-manipulation cursor-pointer",
              effectiveTaskCount >= 2
                ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white"
                : effectiveTaskCount === 1
                ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white"
                : "bg-slate-200 hover:bg-slate-300 dark:bg-[#333336] dark:hover:bg-[#444446] text-slate-600 dark:text-slate-300"
            )}
            title={isExpanded ? "Thu gọn danh sách công việc" : `Mở rộng danh sách công việc (${effectiveTaskCount})`}
          >
            {!isExpanded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span className="text-[10px]">({effectiveTaskCount})</span>
          </button>
          
          {/* Store - Code - Name */}
          <span className="break-words leading-tight">
            <span className={storeDisplay.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8]' : storeDisplay.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400' : ''}>
              {storeDisplay}
            </span>
            {' - '}
            <span className="font-bold font-mono">{unitCode}</span>
            {projectName ? ` - ${projectName}` : ''}
          </span>
        </div>

        {/* Status Badge */}
        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${statusColorClass}`}>
          {status}
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Đóng tooltip"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Middle Section: Progress Bars & Floating Edit Action Button */}
      <div className="flex items-center gap-2 px-0.5 mt-0.5">
        <div className="flex-1 flex flex-col gap-1.5">
          {/* Plan Progress */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[65px] shrink-0">
              Plan Prg:
            </span>
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, Math.max(0, planProgressPercent))}%` }} 
              />
            </div>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-8 text-right shrink-0">
              {planProgressPercent}%
            </span>
          </div>

          {/* Actual Progress */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[65px] shrink-0">
              Act Prg:
            </span>
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, Math.max(0, actProgressPercent))}%` }} 
              />
            </div>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-8 text-right shrink-0">
              {actProgressPercent}%
            </span>
          </div>
        </div>

        {/* Floating Edit Icon (Right-Side Square Button matching Task Summary) */}
        {p && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditProject?.(p, !canWrite, 'details');
            }}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#27272a] dark:hover:bg-[#323236] border border-slate-200 dark:border-[#3f3f46] text-blue-600 dark:text-blue-400 shadow-sm transition-all active:scale-95 touch-manipulation shrink-0"
            title="Xem chi tiết & Chỉnh sửa dự án"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Vacant / Non-Project Unit Attributes (If size or floor exists) */}
      {(!p || data.size > 0 || data.floor) && (
        <div className="grid grid-cols-2 gap-2 text-xs py-1">
          {data.size > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800/80">
              <div className="text-[10px] text-slate-400 font-medium uppercase">Diện tích</div>
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                {Number(data.size).toLocaleString('en-US')} m²
              </div>
            </div>
          )}
          {data.floor && (
            <div className="bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800/80">
              <div className="text-[10px] text-slate-400 font-medium uppercase">Vị trí / Tầng</div>
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                {data.floor}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Bottom Row: Subtasks info, Sort, Party, Toggle, Chat, Maximize & Start/Finish Dates */}
      <div className="flex justify-between items-center px-0.5 border-t border-slate-100 dark:border-slate-800 pt-2.5">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Subtasks Count Label */}
          <div className="text-xs text-slate-500 dark:text-[#a3a3a3] italic font-bold shrink-0">
            {effectiveTaskCount} Sub-
          </div>

          {/* Sort Button */}
          {effectiveTaskCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
              }}
              className="flex items-center text-[9px] font-medium px-1.5 py-0.5 rounded shadow-xs transition-colors cursor-pointer border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 active:bg-slate-100 shrink-0"
              title={`Sắp xếp công việc (${sortDirection === 'asc' ? 'Tăng dần' : 'Giảm dần'})`}
            >
              <ArrowDownUp className="w-2.5 h-2.5 mr-0.5" />
              Sort
            </button>
          )}

          {/* Party Badge (CP, etc.) */}
          {(p?.party || data.party) && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 truncate max-w-[70px] shrink-0">
              {p?.party || data.party}
            </span>
          )}

          {/* Delegation FastToggle */}
          {p && (
            <div title="Uỷ quyền công việc" className="flex items-center shrink-0">
              <FastToggle 
                value={Boolean(isProjDelegationOn)} 
                canWrite={canWrite} 
                onToggle={handleToggleDelegation} 
                isSmall={true} 
              />
            </div>
          )}

          {/* Project Chat / Comment Button */}
          {p && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditProject?.(p, false, 'chat');
              }}
              className={cn(
                "flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-all active:scale-95 touch-manipulation cursor-pointer shrink-0",
                commentsCount > 0 
                  ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800/80 hover:bg-blue-100" 
                  : "bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#444446] hover:text-blue-500"
              )}
              title="Mở trao đổi / Bình luận dự án (Zero-read optimization)"
            >
              <MessageSquare className="w-3 h-3" />
              {commentsCount > 0 && <span>{commentsCount}</span>}
            </button>
          )}

          {/* Maximize / Open Modal */}
          {p && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditProject?.(p, !canWrite, 'details');
              }}
              className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] p-1 rounded hover:bg-slate-100 dark:hover:bg-[#28282a] transition-colors shrink-0"
              title="Xem đầy đủ dự án"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Start Date (Blue) & Finish Date (Pink) */}
        <div className="flex gap-2.5 sm:gap-3 text-[11px] font-bold leading-tight shrink-0">
          {computedTakStart && (
            <div className="text-blue-700 dark:text-[#8ab4f8] text-right">
              {(() => {
                const d = parseDateTime(computedTakStart);
                if (!d) return null;
                return (
                  <>
                    <div>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</div>
                    <div>{d.getFullYear()}</div>
                  </>
                );
              })()}
            </div>
          )}
          {computedTakCompl && (
            <div className="text-pink-700 dark:text-pink-400 text-right">
              {(() => {
                const d = parseDateTime(computedTakCompl);
                if (!d) return null;
                return (
                  <>
                    <div>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</div>
                    <div>{d.getFullYear()}</div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* 4. Expandable Subtasks Drawer (When clicking `> (count)` button) */}
      {isExpanded && (
        <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 px-0.5">
            <span>DANH SÁCH CÔNG VIỆC</span>
            <span className="text-[10px] text-slate-400 font-normal">({sortedSubTasks.length} mục)</span>
          </div>

          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
            {sortedSubTasks.map((t: any, idx: number) => {
              const taskStart = t.start || '';
              const taskFinish = t.finish || '';
              return (
                <div 
                  key={t.id || idx} 
                  className="bg-slate-50 dark:bg-[#18181b]/70 rounded-lg p-2 border border-slate-200/80 dark:border-[#38383a] text-xs flex flex-col gap-1 hover:border-blue-400/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="font-semibold text-slate-800 dark:text-[#e3e3e3] leading-snug">
                      <span className="text-blue-600 dark:text-[#8ab4f8] mr-1 font-mono text-[11px]">
                        {t.taskCodePhu || `${unitCode}-${idx + 1}`}
                      </span>
                      {t.name || t.taskName || `Công việc #${idx + 1}`}
                    </span>
                    {t.party && (
                      <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60 shrink-0">
                        {t.party}
                      </span>
                    )}
                  </div>
                  
                  {(taskStart || taskFinish) && (
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-[#a3a3a3] font-mono pt-0.5 border-t border-slate-200/50 dark:border-slate-800/50">
                      <span className="text-blue-600 dark:text-[#8ab4f8]">
                        {formatDisplayDateMain(taskStart)}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="text-pink-600 dark:text-pink-400">
                        {formatDisplayDateMain(taskFinish)}
                      </span>
                      {t.duration && (
                        <span className="text-slate-400 italic">({t.duration}d)</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Fallback to taskLines if available */}
            {sortedSubTasks.length === 0 && data.taskLines && data.taskLines.length > 0 && (
              <div className="flex flex-col gap-1 text-xs">
                {data.taskLines.map((line: string, lIdx: number) => (
                  <div 
                    key={lIdx} 
                    className={`p-1.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 font-medium ${
                      lIdx % 2 === 0 ? 'text-blue-600 dark:text-[#8ab4f8]' : 'text-orange-600 dark:text-orange-400'
                    }`}
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}

            {sortedSubTasks.length === 0 && (!data.taskLines || data.taskLines.length === 0) && (
              <div className="text-center py-3 text-xs text-slate-400 italic">
                Chưa có công việc chi tiết
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Quick Description / Detail note if present */}
      {data.detail && (
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 border border-slate-200/60 dark:border-slate-700/60 text-xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
            Ghi chú
          </div>
          <div className="text-slate-700 dark:text-slate-300 font-normal whitespace-pre-wrap leading-relaxed">
            {data.detail}
          </div>
        </div>
      )}
    </div>
  );
};
