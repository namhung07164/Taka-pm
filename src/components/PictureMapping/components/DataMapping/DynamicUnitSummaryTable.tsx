import React, { useState, useMemo } from "react";
import { DynamicUnitSummaryItem } from '../../lib/dynamicSummaryEngine';
import { Search, Filter, CheckCircle2, Clock, AlertTriangle, Building, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { DebouncedSearchInput } from '../../../DebouncedSearchInput';

interface DynamicUnitSummaryTableProps {
  summaryList: DynamicUnitSummaryItem[];
  selectedUnitId?: string | null;
  onSelectUnit?: (unitId: string) => void;
  title?: string;
  isCompact?: boolean;
}

export const DynamicUnitSummaryTable: React.FC<DynamicUnitSummaryTableProps> = React.memo(({
  summaryList,
  selectedUnitId,
  onSelectUnit,
  title = "Bảng Tổng Hợp So Sánh & Màu Tô Thực Tế (Dynamic Unit Summary)",
  isCompact = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [isExpanded, setIsExpanded] = useState(true);

  // Available groups for filter dropdown
  const availableGroups = useMemo(() => {
    const groups = new Set<string>();
    summaryList.forEach((item) => {
      if (item.matchedGroupName) groups.add(item.matchedGroupName);
    });
    return Array.from(groups);
  }, [summaryList]);

  // Filtered units list
  const filteredList = useMemo(() => {
    return summaryList.filter((item) => {
      const matchSearch =
        !searchTerm.trim() ||
        item.unitName.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        item.appProjectCode.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        item.projectName.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        item.brandName.toLowerCase().includes(searchTerm.toLowerCase().trim());

      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'has_project' && item.hasAppProject) ||
        (statusFilter === 'no_project' && !item.hasAppProject) ||
        item.appProjectStatus.toLowerCase() === statusFilter.toLowerCase();

      const matchGroup =
        groupFilter === 'all' ||
        (groupFilter === 'unassigned' && !item.matchedGroupId) ||
        item.matchedGroupName === groupFilter;

      return matchSearch && matchStatus && matchGroup;
    });
  }, [summaryList, searchTerm, statusFilter, groupFilter]);

  const getStatusBadge = (item: DynamicUnitSummaryItem) => {
    if (!item.hasAppProject || !item.appProjectStatus) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-500 border border-slate-700">
          No Project
        </span>
      );
    }

    const s = item.appProjectStatus.toLowerCase();
    if (s.includes('completed') || s.includes('done')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
          <CheckCircle2 size={10} /> Completed
        </span>
      );
    }
    if (s.includes('on process') || s.includes('in progress')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
          <Clock size={10} /> On process
        </span>
      );
    }
    if (s.includes('upcoming') || s.includes('planning')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
          <Clock size={10} /> Upcoming
        </span>
      );
    }
    if (s.includes('delay') || s.includes('late')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
          <AlertTriangle size={10} /> Delay
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
        {item.appProjectStatus}
      </span>
    );
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-3 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between cursor-pointer select-none hover:bg-slate-950 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4 text-brand-400" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            {title}
          </h4>
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-brand-600/20 text-brand-300 border border-brand-500/30">
            {filteredList.length} / {summaryList.length} units
          </span>
        </div>
        <button className="text-slate-400 hover:text-white p-1">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-3 flex-1 flex flex-col min-h-0">
          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 z-10 pointer-events-none" />
              <DebouncedSearchInput
                placeholder="Tìm Unit, Project Code, Brand..."
                value={searchTerm}
                onChange={(val) => setSearchTerm(val)}
                debounceMs={250}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-brand-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-brand-500"
            >
              <option value="all">Tất cả Status</option>
              <option value="has_project">Có Dự Án</option>
              <option value="no_project">Không Dự Án</option>
              <option value="on process">On Process</option>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
              <option value="delay">Delay</option>
            </select>

            {availableGroups.length > 0 && (
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-brand-500"
              >
                <option value="all">Tất cả Nhóm Màu</option>
                {availableGroups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
                <option value="unassigned">Chưa gán nhóm</option>
              </select>
            )}
          </div>

          {/* Table */}
          <div className={cn("overflow-auto custom-scrollbar rounded-xl border border-slate-800/80 bg-slate-950/40", isCompact ? "max-h-56" : "max-h-80")}>
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900/90 sticky top-0 z-10 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                <tr>
                  <th className="px-3 py-2">Mã Unit</th>
                  <th className="px-3 py-2">Dự Án (App)</th>
                  <th className="px-3 py-2">App Status</th>
                  <th className="px-3 py-2">Nhóm Màu (Rule)</th>
                  <th className="px-3 py-2">Màu Tô (Fill)</th>
                  <th className="px-3 py-2">Lý Do Khớp Luật</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 italic text-xs">
                      Không tìm thấy gian hàng nào khớp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((item) => {
                    const isSelected = selectedUnitId === item.unitId;
                    return (
                      <tr
                        key={item.unitId}
                        onClick={() => onSelectUnit?.(item.unitId)}
                        className={cn(
                          "hover:bg-slate-800/50 transition-colors cursor-pointer group",
                          isSelected ? "bg-brand-600/15 ring-1 ring-inset ring-brand-500/40" : ""
                        )}
                      >
                        <td className="px-3 py-2 font-bold text-white flex items-center gap-1.5">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" 
                            style={{ backgroundColor: item.color }} 
                          />
                          <span className="font-mono">{item.unitName}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {item.hasAppProject ? (
                            <span className="font-bold text-blue-400">{item.appProjectCode}</span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {getStatusBadge(item)}
                        </td>
                        <td className="px-3 py-2">
                          {item.matchedGroupName ? (
                            <span 
                              className="px-2 py-0.5 rounded text-[10px] font-bold"
                              style={{ 
                                backgroundColor: `${item.color}20`, 
                                color: item.color,
                                border: `1px solid ${item.color}50` 
                              }}
                            >
                              {item.matchedGroupName}
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[10px]">Mặc định</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="w-4 h-4 rounded border border-white/20 shadow-inner" 
                              style={{ backgroundColor: item.color }} 
                            />
                            <span className="text-[10px] text-slate-400 uppercase">{item.color}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-slate-400 font-sans truncate max-w-[200px]" title={item.matchedRuleReason}>
                          {item.matchedRuleReason}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});
