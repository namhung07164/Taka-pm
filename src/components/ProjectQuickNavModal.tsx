import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, 
  BarChartHorizontal, 
  ListOrdered, 
  PieChart, 
  Receipt, 
  X, 
  GripHorizontal,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { TabId } from '../types';
import { QuickNavTarget } from '../store/storeTypes';
import { useAppStore } from '../store/useAppStore';

interface ProjectQuickNavModalProps {
  target: QuickNavTarget | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (targetTab: TabId, target: QuickNavTarget) => void;
}

export function ProjectQuickNavModal({
  target,
  isOpen,
  onClose,
  onNavigate
}: ProjectQuickNavModalProps) {
  const currentUser = useAppStore(state => state.currentUser);
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !target || !target.project) return null;

  const { project, task, taskCode } = target;
  const isTaskMode = !!task;
  const effectiveCode = taskCode || (isTaskMode ? (task.taskCodePhu || project.code) : project.code) || 'NAV';
  const displayName = isTaskMode ? (task.name || project.name) : (project.name || 'Project');
  const store = project.store || task?.projectStore;
  const location = project.location;
  const year = project.year || task?.projectYear;

  const userRole = currentUser?.role || 'user';
  const perms = permissionMatrix[userRole] || {};
  const isAdmin = currentUser?.role === 'admin';

  // Permission helpers
  const canSeeLayout = isAdmin || !!perms.See?.layout;
  const canSeeGantt = isAdmin || !!perms.See?.report;
  const canSeeDetail = isAdmin || !!perms.See?.detail;
  const canSeeBudget = isAdmin || !!perms.See?.budget;
  const canSeeCost = isAdmin || !!perms.See?.costDetail;

  // Exact 5 ordered tabs as requested:
  // 1/ Layout: Floor Plan (Indigo)
  // 2/ Gantt: Timeline (Emerald)
  // 3/ Detail: Task Detail (Blue)
  // 4/ Budget: Budget (Amber)
  // 5/ Cost: Expenses (Rose)
  const navItems = [
    {
      id: 'layout' as TabId,
      allowed: canSeeLayout,
      num: '1',
      icon: MapPin,
      label: 'Layout',
      desc: 'Floor Plan',
      theme: {
        border: 'hover:border-indigo-500/70 dark:hover:border-indigo-400/70',
        bgHover: 'hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40',
        iconBg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300',
        accentText: 'text-indigo-600 dark:text-indigo-400',
      }
    },
    {
      id: 'gantt' as TabId,
      allowed: canSeeGantt,
      num: '2',
      icon: BarChartHorizontal,
      label: 'Gantt',
      desc: 'Timeline',
      theme: {
        border: 'hover:border-emerald-500/70 dark:hover:border-emerald-400/70',
        bgHover: 'hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40',
        iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
        accentText: 'text-emerald-600 dark:text-emerald-400',
      }
    },
    {
      id: 'detail' as TabId,
      allowed: canSeeDetail,
      num: '3',
      icon: ListOrdered,
      label: 'Detail',
      desc: 'Task Detail',
      theme: {
        border: 'hover:border-blue-500/70 dark:hover:border-blue-400/70',
        bgHover: 'hover:bg-blue-50/80 dark:hover:bg-blue-950/40',
        iconBg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',
        accentText: 'text-blue-600 dark:text-blue-400',
      }
    },
    {
      id: 'budget' as TabId,
      allowed: canSeeBudget,
      num: '4',
      icon: PieChart,
      label: 'Budget',
      desc: 'Allocations',
      theme: {
        border: 'hover:border-amber-500/70 dark:hover:border-amber-400/70',
        bgHover: 'hover:bg-amber-50/80 dark:hover:bg-amber-950/40',
        iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
        accentText: 'text-amber-600 dark:text-amber-400',
      }
    },
    {
      id: 'cost' as TabId,
      allowed: canSeeCost,
      num: '5',
      icon: Receipt,
      label: 'Cost',
      desc: 'Expenses',
      theme: {
        border: 'hover:border-rose-500/70 dark:hover:border-rose-400/70',
        bgHover: 'hover:bg-rose-50/80 dark:hover:bg-rose-950/40',
        iconBg: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300',
        accentText: 'text-rose-600 dark:text-rose-400',
      }
    }
  ];

  return (
    <AnimatePresence>
      <div 
        id="project-quick-nav-modal-backdrop"
        className="fixed inset-0 z-[100050] flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-[2px] transition-opacity"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          ref={modalRef}
          id="project-quick-nav-modal-container"
          drag
          dragMomentum={false}
          dragElastic={0.06}
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 8 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          className="w-[88vw] sm:w-[270px] max-w-[290px] bg-white dark:bg-[#1e1e20] rounded-xl shadow-2xl border border-slate-200 dark:border-[#444446] overflow-hidden flex flex-col select-none touch-manipulation"
        >
          {/* Draggable Header */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-[#333336] bg-slate-50/90 dark:bg-[#252528] flex items-center justify-between gap-1.5 cursor-grab active:cursor-grabbing">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 truncate max-w-[120px]">
                    {effectiveCode}
                  </span>
                  {store && (
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300">
                      {store}
                    </span>
                  )}
                  {location && (
                    <span className="text-[9px] font-medium px-1 py-0.2 rounded bg-slate-200/80 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300">
                      {location}
                    </span>
                  )}
                  {year && (
                    <span className="text-[9px] text-slate-400 font-mono">
                      {year}
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate leading-tight mt-0.5" title={displayName}>
                  {displayName}
                </div>
              </div>
            </div>

            <button
              id="quick-nav-close-btn"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors shrink-0"
              aria-label="Close"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 5 Ordered Navigation Buttons - Compact English */}
          <div className="p-2 space-y-1.5 bg-slate-50/30 dark:bg-[#1a1a1c]">
            {navItems.map((item) => {
              const IconComp = item.icon;
              if (!item.allowed) return null;

              return (
                <button
                  key={item.id}
                  type="button"
                  id={`quick-nav-tab-${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onNavigate(item.id, target);
                    onClose();
                  }}
                  className={`w-full h-9 px-2 rounded-lg border border-slate-200/90 dark:border-[#333336] bg-white dark:bg-[#232326] transition-all flex items-center justify-between group active:scale-[0.98] cursor-pointer shadow-xs ${item.theme.border} ${item.theme.bgHover}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 font-semibold w-3 shrink-0 text-center">
                      {item.num}
                    </span>
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${item.theme.iconBg}`}>
                      <IconComp className="w-3 h-3" />
                    </div>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white truncate">
                      {item.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                      {item.desc}
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform ${item.theme.accentText}`} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Micro Footer */}
          <div className="px-2.5 py-1 border-t border-slate-100 dark:border-[#333336] bg-slate-50/80 dark:bg-[#202022] text-[9px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <ExternalLink className="w-2.5 h-2.5 text-blue-500" />
              <span>Quick Nav</span>
            </span>
            <span>Esc to close</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
