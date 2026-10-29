import React, { useMemo, useState } from 'react';
import {
  Search,
  ChevronRight,
  ExternalLink,
  Compass,
  CalendarClock,
  Wallet,
  Users,
  Map as MapIcon,
  ShieldCheck,
  Sparkles,
  Zap,
  X
} from 'lucide-react';
import { FAQ_CATEGORIES, FAQ_KNOWLEDGE_BASE, FaqKnowledgeEntry } from './faqKnowledgeEngine';
import { FaqQuickChip } from './faqTabQuickChips';
import { TabId } from '../../types';

interface FaqManualExplorerProps {
  lang: 'vi' | 'en';
  activeTabDisplay: string;
  activeTabQuickChips: FaqQuickChip[];
  onSelectEntry: (entry: FaqKnowledgeEntry) => void;
  onSelectQuickChip: (chip: FaqQuickChip) => void;
  onJumpToTab: (tabId: TabId) => void;
}

const CATEGORY_META: Record<
  FaqKnowledgeEntry['category'],
  {
    icon: React.FC<{ className?: string }>;
    colorClass: string;
    bgClass: string;
    descVi: string;
    descEn: string;
  }
> = {
  'Overview & Scope': {
    icon: Compass,
    colorClass: 'text-blue-600 dark:text-blue-400',
    bgClass: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200/70 dark:border-blue-800/50',
    descVi: 'Lộ trình 5 phút cho người mới, tạo dự án & phím tắt',
    descEn: '5-minute onboarding, creating projects & shortcuts'
  },
  'Task & Gantt': {
    icon: CalendarClock,
    colorClass: 'text-indigo-600 dark:text-indigo-400',
    bgClass: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/70 dark:border-indigo-800/50',
    descVi: 'Chia việc WBS, nối Predecessor #, kéo biểu đồ Gantt',
    descEn: 'WBS tasks, Predecessor #, and Gantt timeline controls'
  },
  'Budget & Cost': {
    icon: Wallet,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-800/50',
    descVi: 'Ngân sách dự án, cảnh báo % & thanh toán 3 đợt',
    descEn: 'Project budgets, % alerts & 3-stage cost payments'
  },
  'Delegation & Tracker': {
    icon: Users,
    colorClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/50',
    descVi: 'Giao việc nội bộ, quy trình 5 bước duyệt & đồng bộ lịch iOS',
    descEn: 'Task delegation, 5-step approval & iOS calendar sync'
  },
  'Layout & Floor Plan': {
    icon: MapIcon,
    colorClass: 'text-purple-600 dark:text-purple-400',
    bgClass: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200/70 dark:border-purple-800/50',
    descVi: 'Bản đồ 2D, đồng bộ diện tích m² & ảnh hiện trường',
    descEn: '2D floor map, area m² sync & site photo mapping'
  },
  'RBAC & Sync': {
    icon: ShieldCheck,
    colorClass: 'text-rose-600 dark:text-rose-400',
    bgClass: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-800/50',
    descVi: 'Phân quyền, chống ngủ tab, Cloudflare R2 & đồng bộ Offline',
    descEn: 'RBAC permissions, sleeping tabs, R2 CORS & offline sync'
  }
};

export const FaqManualExplorer: React.FC<FaqManualExplorerProps> = React.memo(({
  lang,
  activeTabDisplay,
  activeTabQuickChips,
  onSelectEntry,
  onSelectQuickChip,
  onJumpToTab
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'All' | FaqKnowledgeEntry['category']>('All');

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FAQ_KNOWLEDGE_BASE.filter(entry => {
      if (activeCategory !== 'All' && entry.category !== activeCategory) return false;
      if (!q) return true;
      const haystack = `${entry.titleVi} ${entry.titleEn} ${entry.keywords.join(' ')} ${entry.answerVi} ${entry.answerEn}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery, activeCategory]);

  const cleanTitle = (rawTitle: string) => rawTitle.replace(/^\d+\.\s*/, '');

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-[#18181b]">
      {/* Search Bar inside Manual */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={
            lang === 'vi'
              ? 'Tìm nhanh chủ đề (VD: Predecessor, R2, diện tích m², ngân sách)...'
              : 'Search manual topics (e.g., Predecessor, R2, area m², budget)...'
          }
          className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200/90 dark:border-slate-700/80 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none shadow-2xs"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Onboarding Banner for Brand New Users */}
      {!searchQuery && activeCategory === 'All' && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-sm flex items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-100 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{lang === 'vi' ? 'Dành cho người dùng mới' : 'New User Quick Start'}</span>
            </div>
            <h4 className="text-xs sm:text-sm font-bold leading-snug">
              {lang === 'vi'
                ? 'Làm quen Taka PM chỉ trong 5 phút với 4 bước cơ bản'
                : 'Master Taka PM in 5 minutes with 4 simple steps'}
            </h4>
          </div>
          <button
            type="button"
            onClick={() => onSelectEntry(FAQ_KNOWLEDGE_BASE[0])}
            className="px-3 py-2 rounded-xl bg-white text-blue-700 hover:bg-blue-50 text-xs font-bold shrink-0 shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            {lang === 'vi' ? 'Xem ngay' : 'Start Now'}
          </button>
        </div>
      )}

      {/* Context-aware suggestions for current tab */}
      {!searchQuery && activeCategory === 'All' && activeTabQuickChips.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold px-0.5">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
              {lang === 'vi'
                ? `Mẹo dùng nhanh tại ${activeTabDisplay}`
                : `Quick tips for ${activeTabDisplay}`}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeTabQuickChips.slice(0, 4).map(chip => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onSelectQuickChip(chip)}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200/80 dark:border-slate-700/70 hover:border-blue-400 dark:hover:border-blue-500 text-left transition-all active:scale-98 cursor-pointer group"
              >
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                  {lang === 'vi' ? chip.labelVi : chip.labelEn}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-0.5">
          {lang === 'vi' ? 'Khám phá theo nhóm chức năng' : 'Browse by Category'}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FAQ_CATEGORIES.filter(c => c.id !== 'All').map(cat => {
            const catId = cat.id as FaqKnowledgeEntry['category'];
            const meta = CATEGORY_META[catId];
            const Icon = meta.icon;
            const isSelected = activeCategory === catId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(prev => (prev === catId ? 'All' : catId))}
                className={`p-2.5 rounded-xl border text-left transition-all active:scale-98 cursor-pointer flex flex-col gap-1 ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white dark:bg-[#27272a] border-slate-200/80 dark:border-slate-700/70 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : meta.colorClass}`} />
                  {isSelected && (
                    <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded">
                      {lang === 'vi' ? 'Đang lọc' : 'Active'}
                    </span>
                  )}
                </div>
                <div className={`text-xs font-bold leading-snug ${isSelected ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                  {lang === 'vi' ? cat.labelVi : cat.labelEn}
                </div>
                <div className={`text-[10px] line-clamp-1 ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                  {lang === 'vi' ? meta.descVi : meta.descEn}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Topic List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-0.5">
          <span>
            {activeCategory === 'All'
              ? lang === 'vi'
                ? `Tất cả bài hướng dẫn (${filteredEntries.length})`
                : `All Manual Guides (${filteredEntries.length})`
              : lang === 'vi'
                ? `Chủ đề trong nhóm (${filteredEntries.length})`
                : `Topics in Category (${filteredEntries.length})`}
          </span>
          {activeCategory !== 'All' && (
            <button
              type="button"
              onClick={() => setActiveCategory('All')}
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {lang === 'vi' ? 'Xem tất cả' : 'Show all'}
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          {filteredEntries.map(entry => {
            const targetLabel = lang === 'vi' ? entry.targetTabLabelVi : entry.targetTabLabelEn;
            return (
              <div
                key={entry.id}
                className="p-3 rounded-xl bg-white dark:bg-[#27272a] border border-slate-200/80 dark:border-slate-700/70 hover:border-blue-400/80 dark:hover:border-blue-500/70 transition-all flex items-center justify-between gap-3 group"
              >
                <button
                  type="button"
                  onClick={() => onSelectEntry(entry)}
                  className="flex-1 text-left min-w-0 cursor-pointer"
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 leading-snug">
                    {cleanTitle(lang === 'vi' ? entry.titleVi : entry.titleEn)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {entry.category}
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {entry.targetTab && targetLabel && (
                    <button
                      type="button"
                      onClick={() => onJumpToTab(entry.targetTab!)}
                      title={targetLabel}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectEntry(entry)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1e1e20] group-hover:bg-blue-600 group-hover:text-white text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>{lang === 'vi' ? 'Đọc' : 'Read'}</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

FaqManualExplorer.displayName = 'FaqManualExplorer';
