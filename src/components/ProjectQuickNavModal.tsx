import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, 
  BarChartHorizontal, 
  ListOrdered, 
  PieChart, 
  Receipt, 
  X, 
  Building2, 
  Calendar, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { Project, TabId } from '../types';
import { useLanguage } from '../lib/LanguageContext';
import { useAppStore } from '../store/useAppStore';

interface ProjectQuickNavModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (targetTab: TabId, project: Project) => void;
}

export function ProjectQuickNavModal({
  project,
  isOpen,
  onClose,
  onNavigate
}: ProjectQuickNavModalProps) {
  const { t } = useLanguage();
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

  if (!isOpen || !project) return null;

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
  // 1/ 🗺️ Mặt Bằng (Layout): Định vị gian hàng trên bản vẽ mặt bằng (Tím / Indigo)
  // 2/ 📊 Gantt Chart: Xem tiến độ & biểu đồ Gantt theo thời gian (Xanh lá / Emerald)
  // 3/ 📋 Task Detail: Xem & chỉnh sửa chi tiết các đầu việc (Xanh dương)
  // 4/ 💰 Ngân Sách (Budget): Tra cứu hạn mức & phân bổ ngân sách (Vàng hổ phách / Amber)
  // 5/ 🧾 Chi Phí (Cost): Xem chi phí thực tế & quyết toán (Đỏ cam / Rose)
  const navItems = [
    {
      id: 'layout' as TabId,
      allowed: canSeeLayout,
      badgeNumber: '1',
      icon: MapPin,
      title: t('Mặt Bằng (Layout)'),
      subtitle: t('Định vị gian hàng trên bản vẽ mặt bằng'),
      theme: {
        border: 'hover:border-indigo-500/80 dark:hover:border-indigo-400/80',
        bgHover: 'hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30',
        iconBg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300',
        badgeBg: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        accentText: 'text-indigo-600 dark:text-indigo-400',
      }
    },
    {
      id: 'gantt' as TabId,
      allowed: canSeeGantt,
      badgeNumber: '2',
      icon: BarChartHorizontal,
      title: t('Gantt Chart'),
      subtitle: t('Xem tiến độ & biểu đồ Gantt theo thời gian'),
      theme: {
        border: 'hover:border-emerald-500/80 dark:hover:border-emerald-400/80',
        bgHover: 'hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30',
        iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
        badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        accentText: 'text-emerald-600 dark:text-emerald-400',
      }
    },
    {
      id: 'detail' as TabId,
      allowed: canSeeDetail,
      badgeNumber: '3',
      icon: ListOrdered,
      title: t('Task Detail'),
      subtitle: t('Xem & chỉnh sửa chi tiết các đầu việc'),
      theme: {
        border: 'hover:border-blue-500/80 dark:hover:border-blue-400/80',
        bgHover: 'hover:bg-blue-50/70 dark:hover:bg-blue-950/30',
        iconBg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',
        badgeBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        accentText: 'text-blue-600 dark:text-blue-400',
      }
    },
    {
      id: 'budget' as TabId,
      allowed: canSeeBudget,
      badgeNumber: '4',
      icon: PieChart,
      title: t('Ngân Sách (Budget)'),
      subtitle: t('Tra cứu hạn mức & phân bổ ngân sách'),
      theme: {
        border: 'hover:border-amber-500/80 dark:hover:border-amber-400/80',
        bgHover: 'hover:bg-amber-50/70 dark:hover:bg-amber-950/30',
        iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
        badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        accentText: 'text-amber-600 dark:text-amber-400',
      }
    },
    {
      id: 'cost' as TabId,
      allowed: canSeeCost,
      badgeNumber: '5',
      icon: Receipt,
      title: t('Chi Phí (Cost)'),
      subtitle: t('Xem chi phí thực tế & quyết toán'),
      theme: {
        border: 'hover:border-rose-500/80 dark:hover:border-rose-400/80',
        bgHover: 'hover:bg-rose-50/70 dark:hover:bg-rose-950/30',
        iconBg: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300',
        badgeBg: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        accentText: 'text-rose-600 dark:text-rose-400',
      }
    }
  ];

  return (
    <AnimatePresence>
      <div 
        id="project-quick-nav-modal-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          ref={modalRef}
          id="project-quick-nav-modal-container"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="w-full max-w-lg bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#444446] overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50/70 dark:bg-[#252528] flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 font-bold border border-blue-500/20">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                    {project.code || 'NO-CODE'}
                  </span>
                  {project.store && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200">
                      {project.store}
                    </span>
                  )}
                  {project.location && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200">
                      {project.location}
                    </span>
                  )}
                  {project.year && (
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {project.year}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate mt-1">
                  {project.name || t('Chi tiết dự án')}
                </h3>
              </div>
            </div>

            <button
              id="quick-nav-close-btn"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body: 5 Interactive Nav Cards in Exact Order */}
          <div className="p-4 overflow-y-auto space-y-2.5">
            <div className="px-1 text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>{t('Chọn phân hệ cần điều hướng:')}</span>
              <span className="text-[11px] flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                <Sparkles className="w-3 h-3" />
                {t('Tự động điền bộ lọc')}
              </span>
            </div>

            <div className="space-y-2">
              {navItems.map((item) => {
                const IconComponent = item.icon;
                if (!item.allowed) return null;

                return (
                  <button
                    key={item.id}
                    id={`quick-nav-tab-${item.id}`}
                    onClick={() => {
                      onNavigate(item.id, project);
                      onClose();
                    }}
                    className={`w-full text-left p-3 rounded-xl border border-slate-200/80 dark:border-[#38383b] bg-white dark:bg-[#232326] transition-all duration-150 flex items-center justify-between group active:scale-[0.99] touch-manipulation cursor-pointer shadow-xs ${item.theme.border} ${item.theme.bgHover}`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 shadow-xs ${item.theme.iconBg}`}>
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-slate-950 dark:group-hover:text-white">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 group-hover:translate-x-0.5 transition-transform shrink-0 ml-2">
                      <ChevronRight className={`w-4 h-4 ${item.theme.accentText}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Info */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-[#333336] bg-slate-50/50 dark:bg-[#1a1a1c] text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>{t('Nhấn')} <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[10px]">Esc</kbd> {t('để đóng')}</span>
            <span className="font-mono text-[11px] text-slate-400">Takashimaya PM</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
