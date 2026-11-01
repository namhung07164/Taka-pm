import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { MyWorkTabView, UnifiedWorkItem } from './myWorkTypes';
import { MyWorkRowItem } from './MyWorkRowItem';
import { cn } from '../../lib/utils';

interface MyWorkStreamViewProps {
  activeView: MyWorkTabView;
  isProjectFocused?: boolean;
  overdueItems: UnifiedWorkItem[];
  approvalItems: UnifiedWorkItem[];
  todayItems: UnifiedWorkItem[];
  weekItems: UnifiedWorkItem[];
  monthItems: UnifiedWorkItem[];
  doneItems: UnifiedWorkItem[];
  onAcceptItem: (item: UnifiedWorkItem) => void;
  onToggleTaskComplete: (item: UnifiedWorkItem) => void;
  onReportSubTaskComplete: (item: UnifiedWorkItem) => void;
  onApproveItem: (item: UnifiedWorkItem) => void;
  onReworkItem: (item: UnifiedWorkItem) => void;
  onItemClick: (item: UnifiedWorkItem, initialTab?: 'details' | 'chat') => void;
}

interface StreamSectionConfig {
  id: string;
  title: string;
  badgeColor: string;
  items: UnifiedWorkItem[];
}

export const MyWorkStreamView: React.FC<MyWorkStreamViewProps> = React.memo(
  function MyWorkStreamView({
    activeView,
    isProjectFocused = false,
    overdueItems,
    approvalItems,
    todayItems,
    weekItems,
    monthItems,
    doneItems,
    onAcceptItem,
    onToggleTaskComplete,
    onReportSubTaskComplete,
    onApproveItem,
    onReworkItem,
    onItemClick,
  }) {
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

    const toggleSection = (id: string) => {
      setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    let sections: StreamSectionConfig[] = [];

    if (activeView === 'today') {
      if (overdueItems.length > 0) {
        sections.push({
          id: 'overdue',
          title: '🚨 Overdue & Needs Rework',
          badgeColor:
            'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
          items: overdueItems,
        });
      }
      if (approvalItems.length > 0) {
        sections.push({
          id: 'quick_approvals',
          title: '📥 Waiting for Your Quick Approval',
          badgeColor:
            'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
          items: approvalItems,
        });
      }
      if (todayItems.length > 0) {
        sections.push({
          id: 'today_focus',
          title: isProjectFocused ? '🎯 Target Task & Active Focus' : '☀️ Today’s Focus',
          badgeColor:
            'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800/60',
          items: todayItems,
        });
      }
      if (isProjectFocused) {
        const relatedUpcoming = [...weekItems, ...monthItems];
        if (relatedUpcoming.length > 0) {
          sections.push({
            id: 'related_project_upcoming',
            title: '🔗 Related Project Tasks & Milestones',
            badgeColor:
              'bg-violet-100 text-violet-700 dark:bg-violet-950/80 dark:text-violet-300 border-violet-200 dark:border-violet-800/60',
            items: relatedUpcoming,
          });
        }
        if (doneItems.length > 0) {
          sections.push({
            id: 'related_project_done',
            title: '✅ Completed Work in This Project',
            badgeColor:
              'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
            items: doneItems,
          });
        }
      }
    } else if (activeView === 'inbox') {
      if (approvalItems.length > 0) {
        sections.push({
          id: 'inbox_approvals',
          title: '📥 Pending Your Approval',
          badgeColor:
            'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
          items: approvalItems,
        });
      }
      const reworkOnly = overdueItems.filter((i) => i.isNeedsRework);
      if (reworkOnly.length > 0) {
        sections.push({
          id: 'inbox_rework',
          title: '↺ Returned / Needs Rework',
          badgeColor:
            'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
          items: reworkOnly,
        });
      }
    } else if (activeView === 'upcoming') {
      if (weekItems.length > 0) {
        sections.push({
          id: 'upcoming_week',
          title: '📅 Next 7 Days (This Week)',
          badgeColor:
            'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60',
          items: weekItems,
        });
      }
      if (monthItems.length > 0) {
        sections.push({
          id: 'upcoming_month',
          title: '🗓️ Next 30 Days (This Month & Milestones)',
          badgeColor:
            'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border-purple-200 dark:border-purple-800/60',
          items: monthItems,
        });
      }
    } else if (activeView === 'done') {
      if (doneItems.length > 0) {
        sections.push({
          id: 'done_recent',
          title: '✅ Completed & Approved Items',
          badgeColor:
            'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
          items: doneItems,
        });
      }
    }

    if (sections.length === 0) {
      return (
        <div className="max-w-5xl mx-auto w-full px-4 py-16 text-center">
          <div className="max-w-md mx-auto bg-white dark:bg-[#1e1e22] rounded-2xl border border-slate-200/80 dark:border-[#333338] p-8 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-200/60 dark:border-emerald-800/50">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-[#f3f3f3]">
              {activeView === 'today'
                ? '🎉 All clear! You have handled everything for today.'
                : activeView === 'inbox'
                ? '📥 Inbox Zero — No pending approvals waiting on you.'
                : activeView === 'upcoming'
                ? '📅 No upcoming deadlines in the next 30 days.'
                : 'No completed items matching your current filter.'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#9e9ea6] mt-1.5">
              Switch tabs above or adjust the store filter to inspect other schedules.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 space-y-6">
        {sections.map((section) => {
          const isCollapsed = !!collapsedSections[section.id];
          return (
            <div key={section.id} className="space-y-2.5">
              {/* Collapsible Section Header */}
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between py-1.5 px-1 text-left group cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white transition-colors" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white transition-colors" />
                  )}
                  <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-[#d4d4d8]">
                    {section.title}
                  </h2>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-extrabold border',
                      section.badgeColor
                    )}
                  >
                    {section.items.length}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                  {isCollapsed ? 'Expand' : 'Collapse'}
                </span>
              </button>

              {/* Stream Rows */}
              {!isCollapsed && (
                <div className="space-y-2">
                  {section.items.map((item) => (
                    <MyWorkRowItem
                      key={item.id}
                      item={item}
                      onAcceptItem={onAcceptItem}
                      onToggleTaskComplete={onToggleTaskComplete}
                      onReportSubTaskComplete={onReportSubTaskComplete}
                      onApproveItem={onApproveItem}
                      onReworkItem={onReworkItem}
                      onItemClick={onItemClick}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);
