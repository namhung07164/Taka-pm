import React from 'react';
import {
  Eye,
  Camera,
  FileDown,
  Tags,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Building,
  Calculator,
  CloudUpload,
} from 'lucide-react';
import { MapVersion, UnitShape } from '../types';
import { cn } from '../../../lib/utils';
import { AVAILABLE_LABELS } from './useReviewStyledUnits';

interface ReviewTabHeaderProps {
  isSummaryTableOpen: boolean;
  setIsSummaryTableOpen: React.Dispatch<React.SetStateAction<boolean>>;
  dynamicSummaryCount: number;
  applyAllDynamicRules: () => void;
  handleExportClick: (format: 'pdf' | 'jpeg' | 'r2_jpeg' | 'drive') => void;
  showLabelSettings: boolean;
  setShowLabelSettings: (v: boolean) => void;
  reviewLabelColors: Record<string, string> | undefined;
  setReviewLabelColors: (c: Record<string, string>) => void;
  selectedLabels: string[];
  setSelectedLabels: (labels: string[]) => void;
  effectiveYear: string;
  setGlobalYearFilter: (yr: string) => void;
  availableYears: string[];
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
  filteredVersions: MapVersion[];
  store: string;
  location: string;
}

export const ReviewTabHeader: React.FC<ReviewTabHeaderProps> = React.memo(
  ({
    isSummaryTableOpen,
    setIsSummaryTableOpen,
    dynamicSummaryCount,
    applyAllDynamicRules,
    handleExportClick,
    showLabelSettings,
    setShowLabelSettings,
    reviewLabelColors,
    setReviewLabelColors,
    selectedLabels,
    setSelectedLabels,
    effectiveYear,
    setGlobalYearFilter,
    availableYears,
    activeVersionId,
    setActiveVersionId,
    filteredVersions,
    store,
    location,
  }) => {
    return (
      <div className="flex items-center justify-between py-1 px-2 bg-slate-900/90 rounded-md border border-slate-800 glass relative z-50 flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 bg-brand-600/20 text-brand-400 rounded flex items-center justify-center">
            <Eye size={11} />
          </div>
          <h4 className="text-[10px] font-bold text-white uppercase tracking-wider leading-tight">
            Mapping Review
          </h4>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setIsSummaryTableOpen((prev) => !prev)}
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all shadow-sm',
              isSummaryTableOpen
                ? 'bg-emerald-600 text-white border border-emerald-400 ring-1 ring-emerald-500/30 shadow-emerald-900/30'
                : 'bg-slate-950 hover:bg-slate-800 text-emerald-400 border border-slate-800 hover:border-emerald-500/50'
            )}
            title="Mở Bảng Tổng Hợp So Sánh & Màu Tô Thực Tế (Dynamic Unit Summary)"
          >
            <Building size={10} className="text-emerald-400" />
            <span>Summary</span>
            <span className="px-1 py-0.1 text-[8px] font-mono rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
              {dynamicSummaryCount}
            </span>
          </button>

          <button
            onClick={applyAllDynamicRules}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-[9px] font-bold uppercase transition-colors shadow-sm border border-brand-400"
          >
            <Calculator size={10} /> Apply Rules
          </button>

          <div className="flex bg-slate-950 border border-slate-800 rounded p-0.5">
            <button
              onClick={() => handleExportClick('jpeg')}
              title="Save to JPEG"
              className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded flex items-center justify-center transition-colors text-[9px]"
            >
              <Camera size={10} className="mr-0.5" /> JPEG
            </button>
            <button
              onClick={() => handleExportClick('pdf')}
              title="Save to PDF"
              className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded flex items-center justify-center transition-colors text-[9px]"
            >
              <FileDown size={10} className="mr-0.5" /> PDF
            </button>
            <button
              onClick={() => handleExportClick('drive')}
              title="Upload to Google Drive"
              className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-400 hover:text-brand-400 rounded flex items-center justify-center transition-colors text-[9px]"
            >
              <CloudUpload size={10} className="mr-0.5" /> Drive
            </button>
            <button
              onClick={() => handleExportClick('r2_jpeg')}
              title="Upload to Cloudflare R2"
              className="px-1.5 py-0.5 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded flex items-center justify-center transition-colors text-[9px]"
            >
              <CloudUpload size={10} className="mr-0.5" /> R2
            </button>
            <div className="relative">
              <button
                onClick={() => setShowLabelSettings(!showLabelSettings)}
                className={cn(
                  'px-1.5 py-0.5 rounded flex items-center justify-center transition-colors text-[9px]',
                  showLabelSettings
                    ? 'bg-brand-600 text-white'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-brand-400'
                )}
              >
                <Tags size={10} className="mr-0.5" /> Labels
              </button>
              {showLabelSettings && (
                <div className="absolute top-full right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2.5 w-52 z-[9999] flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5 sticky top-0 bg-slate-900 py-0.5 z-10">
                    Select Labels
                  </div>
                  {AVAILABLE_LABELS.map((label) => (
                    <label key={label} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="color"
                        className="w-3.5 h-3.5 rounded cursor-pointer border-0 p-0 appearance-none bg-transparent"
                        value={reviewLabelColors?.[label] || '#ffffff'}
                        onChange={(e) =>
                          setReviewLabelColors({
                            ...(reviewLabelColors || {}),
                            [label]: e.target.value,
                          })
                        }
                      />
                      <input
                        type="checkbox"
                        className="rounded border-slate-600 bg-slate-800 focus:ring-brand-500"
                        checked={selectedLabels.includes(label)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLabels([...selectedLabels, label]);
                          } else {
                            setSelectedLabels(selectedLabels.filter((l) => l !== label));
                          }
                        }}
                      />
                      <span className="text-xs text-slate-300 group-hover:text-white transition-colors">
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded shadow-inner">
              <Calendar size={10} className="text-brand-400" />
              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">
                Year:
              </span>
              <select
                value={effectiveYear}
                onChange={(e) => setGlobalYearFilter(e.target.value)}
                className="bg-transparent border-none text-[10px] text-white font-bold outline-none cursor-pointer hover:text-brand-300 transition-colors"
                title="Filter Review by Year"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y} className="bg-slate-950 text-white font-semibold">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-[8.5px] font-bold text-slate-500 uppercase tracking-widest hidden sm:inline">
              Ver:
            </span>
            <select
              value={activeVersionId || ''}
              onChange={(e) => setActiveVersionId(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-[9.5px] font-bold rounded px-2 py-0.5 outline-none focus:border-brand-500 transition-all min-w-[100px] uppercase tracking-wider cursor-pointer hover:border-brand-500"
            >
              {filteredVersions.length === 0 && (
                <option value="">
                  No versions for {location} ({effectiveYear})
                </option>
              )}
              {filteredVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 text-[9px] font-semibold">
              <span className="text-brand-400 font-bold">{store}</span>
              <span className="text-slate-600">•</span>
              <span className="text-purple-400 font-bold">{location}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

interface ReviewTabLegendSidebarProps {
  isReviewSidebarCollapsed: boolean;
  setIsReviewSidebarCollapsed: (v: boolean) => void;
  activeVersion: MapVersion | undefined;
  effectiveYear: string;
  unitMap: Map<string, UnitShape>;
}

export const ReviewTabLegendSidebar: React.FC<ReviewTabLegendSidebarProps> = React.memo(
  ({
    isReviewSidebarCollapsed,
    setIsReviewSidebarCollapsed,
    activeVersion,
    effectiveYear,
    unitMap,
  }) => {
    return (
      <div
        className={cn(
          'flex flex-col bg-slate-900/90 rounded-lg border border-slate-800/80 transition-all duration-300 relative shrink-0 overflow-hidden',
          isReviewSidebarCollapsed ? 'w-7 p-1 items-center' : 'w-44 sm:w-48 p-1.5 gap-1.5 glass'
        )}
      >
        <button
          onClick={() => setIsReviewSidebarCollapsed(!isReviewSidebarCollapsed)}
          className={cn(
            'p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shadow-sm',
            isReviewSidebarCollapsed
              ? 'w-5 h-5 flex items-center justify-center my-0.5'
              : 'absolute right-1.5 top-1.5 z-30 border border-slate-700 bg-slate-900'
          )}
          title={
            isReviewSidebarCollapsed ? 'Mở rộng Legend & Groups' : 'Thu gọn để mở rộng Canvas'
          }
        >
          {isReviewSidebarCollapsed ? (
            <ChevronLeft size={11} className="rotate-180" />
          ) : (
            <ChevronRight size={11} />
          )}
        </button>

        {isReviewSidebarCollapsed ? (
          <div className="flex flex-col items-center gap-2 mt-3 text-slate-400">
            <span className="text-[8px] font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 select-none">
              LEGEND & GROUPS
            </span>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden w-full gap-1.5">
            <div className="flex border-b border-slate-800 pb-1 items-center justify-between pr-6">
              <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                Legend / Groups
              </h4>
              <span className="text-[8.5px] text-slate-500 font-mono">
                {activeVersion?.groups.filter(
                  (g) => (activeVersion?.groupMappings[g.id] || []).length > 0
                ).length || 0}{' '}
                grp
              </span>
            </div>

            <div className="space-y-1.5 overflow-y-auto pr-0.5 custom-scrollbar flex-1">
              {(!activeVersion?.groups || activeVersion.groups.length === 0) && (
                <div className="text-center py-4 px-2 bg-slate-950/40 border border-slate-800/80 rounded-lg text-slate-400 text-[11px] space-y-1">
                  <p className="font-semibold text-slate-300">Chưa có nhóm quy tắc</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Phiên bản này ({activeVersion?.name} • {activeVersion?.year || effectiveYear})
                    chưa có nhóm quy tắc nào.
                  </p>
                </div>
              )}
              {activeVersion?.groups?.map((group) => {
                const assignedUnitIds = activeVersion?.groupMappings[group.id] || [];
                if (assignedUnitIds.length === 0) return null;

                return (
                  <div
                    key={group.id}
                    className="p-1.5 bg-slate-950/50 border border-slate-800 rounded-lg space-y-1"
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tight truncate">
                        {group.name}
                      </span>
                      <span className="ml-auto text-[9px] text-slate-500 font-mono flex-shrink-0">
                        {assignedUnitIds.length}u
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-0.5">
                      {assignedUnitIds.map((uid) => {
                        const u = unitMap.get(uid);
                        return u ? (
                          <span
                            key={u.id}
                            className="text-[8.5px] px-1 py-0.2 bg-slate-800 text-slate-400 border border-slate-700/50 rounded"
                          >
                            {u.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }
);
