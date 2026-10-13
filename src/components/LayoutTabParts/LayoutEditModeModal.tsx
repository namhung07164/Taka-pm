import React, { Dispatch, FC, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Search, 
  Bell, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  SlidersHorizontal, 
  RefreshCw, 
  Printer, 
  Download, 
  Settings 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DebouncedSearchInput } from '../DebouncedSearchInput';

export interface LayoutEditModeModalProps {
  showMenu: boolean;
  onClose: () => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  isSmartAlertCollapsed: boolean;
  setIsSmartAlertCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  layoutTooltipVisibility: any;
  setLayoutTooltipVisibility: React.Dispatch<React.SetStateAction<any>>;
  resetLayoutTooltipVisibility: () => void;
  canWrite: boolean;
  handleTriggerExport: () => void;
  isExporting: boolean;
  exportStatus: string | null;
  setIsPrintPreview: React.Dispatch<React.SetStateAction<boolean>>;
  isPrintPreview: boolean;
  handleExport: () => void;
  onOpenR2Config: () => void;
}

export const LayoutEditModeModal: React.FC<LayoutEditModeModalProps> = ({
  showMenu,
  onClose,
  searchQuery,
  setSearchQuery,
  isSmartAlertCollapsed,
  setIsSmartAlertCollapsed,
  layoutTooltipVisibility,
  setLayoutTooltipVisibility,
  resetLayoutTooltipVisibility,
  canWrite,
  handleTriggerExport,
  isExporting,
  exportStatus,
  setIsPrintPreview,
  isPrintPreview,
  handleExport,
  onOpenR2Config,
}) => {
  if (!showMenu) return null;

  const content = (
    <div className="fixed inset-0 z-[150000] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150 hide-on-actual-print print:hidden">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-800 dark:text-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-100">
            <SlidersHorizontal className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Edit Mode
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
          <DebouncedSearchInput 
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            debounceMs={250}
            placeholder="Search Unit / Brand / Project..."
            className="w-full pl-9 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Smart Notifications & Alerts Config (Collapsible Accordion) */}
        <div className="space-y-2 p-3 bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-2xl">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsSmartAlertCollapsed(prev => !prev)}
              className="flex items-center gap-1.5 text-[11px] uppercase font-bold text-red-600 dark:text-red-400 tracking-wider hover:opacity-80 cursor-pointer active:scale-95 touch-manipulation"
            >
              <Bell className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              <span>Smart Alerts & Badges</span>
              {isSmartAlertCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setLayoutTooltipVisibility({
                    notifications: true,
                    alertOverdue: true,
                    alertDelay: true,
                    alertHandover: true,
                    alertOpening: true,
                    alertOpeningRisk: true,
                  });
                }}
                className="text-[10px] text-red-600 dark:text-red-400 hover:underline font-semibold cursor-pointer active:scale-95"
              >
                Enable All
              </button>
              <span className="text-red-200 dark:text-red-800">|</span>
              <button
                type="button"
                onClick={() => {
                  setLayoutTooltipVisibility({
                    notifications: false,
                    alertOverdue: false,
                    alertDelay: false,
                    alertHandover: false,
                    alertOpening: false,
                    alertOpeningRisk: false,
                  });
                }}
                className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium cursor-pointer active:scale-95"
              >
                Disable All
              </button>
            </div>
          </div>

          {!isSmartAlertCollapsed && (
            <div className="grid grid-cols-2 gap-1.5 pt-1 animate-in fade-in duration-150">
              {[
                { key: 'notifications', label: 'All Alert Badges', desc: 'Master alert switch' },
                { key: 'alertOverdue', label: 'Overdue Tasks', desc: 'Past due unfinished tasks' },
                { key: 'alertDelay', label: 'Project Delay', desc: 'Late / delayed status' },
                { key: 'alertOpeningRisk', label: 'Opening Risk', desc: '<80% prg in 5 days' },
                { key: 'alertHandover', label: 'Handover Notice', desc: 'Handover within 3 days' },
                { key: 'alertOpening', label: 'Opening Notice', desc: 'Opening within 3 days' },
              ].map((item) => {
                const isActive = (layoutTooltipVisibility as any)?.[item.key] !== false;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setLayoutTooltipVisibility((prev: any) => ({
                        ...prev,
                        [item.key]: !isActive,
                      }));
                    }}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-xl border text-left transition-all active:scale-95 touch-manipulation cursor-pointer",
                      isActive
                        ? "bg-red-500/10 dark:bg-red-950/40 border-red-300 dark:border-red-800/80 text-red-900 dark:text-red-200 shadow-xs"
                        : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-400 dark:text-slate-500 opacity-60 hover:opacity-100"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate leading-tight">
                        {item.label}
                      </div>
                      <div className="text-[9px] opacity-75 truncate">
                        {item.desc}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center shrink-0 ml-1.5 transition-colors",
                        isActive
                          ? "bg-red-600 text-white"
                          : "bg-slate-200 dark:bg-slate-700 text-transparent"
                      )}
                    >
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Labels Appear / Tooltip Visibility Config */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Display & Tooltip Fields</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setLayoutTooltipVisibility({
                    projectCode: true,
                    projectName: true,
                    mdStatus: true,
                    actStatus: true,
                    legendColor: true,
                    floor: true,
                    startDate: true,
                    endDate: true,
                    detail: true,
                    description: true,
                    progressBars: true,
                    area: true,
                  });
                }}
                className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-semibold cursor-pointer"
              >
                Enable All
              </button>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <button
                type="button"
                onClick={() => resetLayoutTooltipVisibility()}
                className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium cursor-pointer"
              >
                Default
              </button>
            </div>
          </div>

          {/* Toggle Items Grid */}
          <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
            {[
              { key: 'projectCode', label: 'Project Code', desc: 'Unit / Project ID' },
              { key: 'projectName', label: 'Project Name', desc: 'Brand / Tenant Name' },
              { key: 'mdStatus', label: 'MD Status', desc: 'Merchandising status' },
              { key: 'actStatus', label: 'AC Status', desc: 'Fit-out actual status' },
              { key: 'legendColor', label: 'Legend Color', desc: 'Unit & Tooltip color' },
              { key: 'floor', label: 'Floor / Store', desc: 'Location & Store level' },
              { key: 'startDate', label: 'Start Date', desc: 'Planned start date' },
              { key: 'endDate', label: 'End Date', desc: 'Planned end date' },
              { key: 'detail', label: 'Detail', desc: 'Work breakdown summary' },
              { key: 'description', label: 'Description', desc: 'Notes & Descriptions' },
              { key: 'progressBars', label: 'Progress Bars', desc: 'Plan & Actual progress' },
              { key: 'area', label: 'Area (m²)', desc: 'Floor surface area' },
            ].map((item) => {
              const isActive = (layoutTooltipVisibility as any)?.[item.key] !== false;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setLayoutTooltipVisibility((prev: any) => ({
                      ...prev,
                      [item.key]: !isActive,
                    }));
                  }}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-xl border text-left transition-all active:scale-95 touch-manipulation cursor-pointer",
                    isActive
                      ? "bg-purple-50/80 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/80 text-purple-900 dark:text-purple-200 shadow-xs"
                      : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-400 dark:text-slate-500 opacity-60 hover:opacity-100"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate leading-tight">
                      {item.label}
                    </div>
                    <div className="text-[9px] opacity-75 truncate">
                      {item.desc}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full flex items-center justify-center shrink-0 ml-1.5 transition-colors",
                      isActive
                        ? "bg-purple-600 text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-transparent"
                    )}
                  >
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col gap-2 border-t border-slate-100 dark:border-slate-800">
          {canWrite && (
            <button 
              onClick={handleTriggerExport}
              disabled={isExporting}
              title="Automatically: Step 1 Apply all rules Dynamic -> Step 2 Save Cloud R2"
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} />
              {isExporting ? (exportStatus || 'Processing...') : 'Trigger Export (Apply Rules & Cloud)'}
            </button>
          )}
          
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => {
                onClose();
                setIsPrintPreview(!isPrintPreview);
              }}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm active:scale-95 touch-manipulation"
            >
              <Printer className="w-4 h-4" /> Print Preview
            </button>
            <button 
              onClick={handleExport}
              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm active:scale-95 touch-manipulation"
            >
              <Download className="w-4 h-4" /> Export HD Image
            </button>
            {canWrite && (
              <button 
                onClick={() => {
                  onClose();
                  onOpenR2Config();
                }}
                className="col-span-2 flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-700 active:scale-95 touch-manipulation"
              >
                <Settings className="w-4 h-4" /> R2 Storage Config
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};
