import React from 'react';
import {
  Menu,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Check,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

interface LiveLayoutSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  isSmartAlertCollapsed: boolean;
  setIsSmartAlertCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

export const LiveLayoutSettingsDrawer: React.FC<LiveLayoutSettingsDrawerProps> = ({
  isOpen,
  onClose,
  searchQuery,
  setSearchQuery,
  isSmartAlertCollapsed,
  setIsSmartAlertCollapsed,
}) => {
  const layoutTooltipVisibility = useAppStore(state => state.layoutTooltipVisibility);
  const setLayoutTooltipVisibility = useAppStore(state => state.setLayoutTooltipVisibility);
  const resetLayoutTooltipVisibility = useAppStore(state => state.resetLayoutTooltipVisibility);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 text-slate-800 dark:text-slate-100 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-100">
            <Menu className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            Lớp hiển thị & Cấu hình nhãn (Edit Mode)
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Search Input */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Tìm kiếm nhanh gian hàng
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nhập tên mã gian hàng, tên dự án..."
                className="w-full pl-8 pr-8 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Smart Notifications & Alerts Config (Collapsible Accordion) */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsSmartAlertCollapsed(prev => !prev)}
                className="flex items-center gap-2 text-left focus:outline-none flex-1 py-1"
              >
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Cảnh báo thông minh (Smart Alerts)
                </span>
                {isSmartAlertCollapsed ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                )}
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setLayoutTooltipVisibility((prev) => ({
                      ...prev,
                      alertContract: true,
                      alertHandover: true,
                      alertOpening: true,
                      alertDelay: true,
                      alertActiveTask: true,
                    }));
                  }}
                  className="text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:underline px-1 py-0.5"
                >
                  Bật hết
                </button>
                <span className="text-slate-300 dark:text-slate-600 text-[10px]">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setLayoutTooltipVisibility((prev) => ({
                      ...prev,
                      alertContract: false,
                      alertHandover: false,
                      alertOpening: false,
                      alertDelay: false,
                      alertActiveTask: false,
                    }));
                  }}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-1 py-0.5"
                >
                  Tắt hết
                </button>
              </div>
            </div>

            {!isSmartAlertCollapsed && (
              <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: 'alertDelay', label: 'Cảnh báo Trễ hạn', desc: 'Dự án chậm tiến độ' },
                  { key: 'alertActiveTask', label: 'Công việc Hôm nay', desc: 'Có việc đang làm hôm nay' },
                  { key: 'alertContract', label: 'Nhắc Hợp đồng', desc: 'Ký HĐ trước 7 ngày' },
                  { key: 'alertHandover', label: 'Nhắc Bàn giao', desc: 'Bàn giao trước 3 ngày' },
                  { key: 'alertOpening', label: 'Nhắc Khai trương', desc: 'Khai trương trước 3 ngày' },
                ].map((item) => {
                  const isActive = (layoutTooltipVisibility as any)?.[item.key] !== false;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setLayoutTooltipVisibility((prev) => ({
                          ...prev,
                          [item.key]: !isActive,
                        }));
                      }}
                      className={`flex items-start gap-2.5 p-2 rounded-lg text-left border transition-all ${
                        isActive
                          ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-slate-800 dark:text-slate-200'
                          : 'bg-white dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                        isActive ? 'bg-rose-500 text-white' : 'border border-slate-300 dark:border-slate-600'
                      }`}>
                        {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold leading-tight">{item.label}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{item.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Labels Appear / Tooltip Visibility Config */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] uppercase font-bold text-slate-500">
                <span>Thông tin hiển thị khi di chuột (Tooltip)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setLayoutTooltipVisibility({
                      projectName: true,
                      status: true,
                      targetDate: true,
                      progressBars: true,
                      area: true,
                      legendColor: true,
                      alertContract: true,
                      alertHandover: true,
                      alertOpening: true,
                      alertDelay: true,
                      alertActiveTask: true,
                    } as any);
                  }}
                  className="text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:underline px-1 py-0.5"
                >
                  Bật hết
                </button>
                <span className="text-slate-300 dark:text-slate-600 text-[10px]">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setLayoutTooltipVisibility({
                      projectName: false,
                      status: false,
                      targetDate: false,
                      progressBars: false,
                      area: false,
                      legendColor: (layoutTooltipVisibility as any)?.legendColor ?? true,
                      alertContract: (layoutTooltipVisibility as any)?.alertContract ?? true,
                      alertHandover: (layoutTooltipVisibility as any)?.alertHandover ?? true,
                      alertOpening: (layoutTooltipVisibility as any)?.alertOpening ?? true,
                      alertDelay: (layoutTooltipVisibility as any)?.alertDelay ?? true,
                      alertActiveTask: (layoutTooltipVisibility as any)?.alertActiveTask ?? true,
                    } as any);
                  }}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-1 py-0.5"
                >
                  Tắt hết
                </button>
              </div>
            </div>

            {/* Toggle Items Grid */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { key: 'legendColor', label: 'Màu Chuyên đề (Legend)', desc: 'Bật/tắt phủ màu bản vẽ' },
                { key: 'projectName', label: 'Tên Dự Án (Project Name)', desc: 'Tên gian hàng / thi công' },
                { key: 'status', label: 'Trạng Thái (Status Badge)', desc: 'Tiến độ, trễ hạn, xong' },
                { key: 'targetDate', label: 'Ngày Bàn Giao / Khai Trương', desc: 'Mốc thời gian quan trọng' },
                { key: 'progressBars', label: 'Thanh Tiến Độ (Progress)', desc: 'Tiến độ kế hoạch & thực tế' },
                { key: 'area', label: 'Diện Tích (m²)', desc: 'Kích thước mặt bằng' },
              ].map((item) => {
                const isActive = (layoutTooltipVisibility as any)?.[item.key] !== false;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setLayoutTooltipVisibility((prev) => ({
                        ...prev,
                        [item.key]: !isActive,
                      }));
                    }}
                    className={`flex items-start gap-2.5 p-2 rounded-lg text-left border transition-all ${
                      isActive
                        ? 'bg-brand-50/60 dark:bg-brand-950/20 border-brand-200 dark:border-brand-900/40 text-slate-800 dark:text-slate-200'
                        : 'bg-white dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                      isActive ? 'bg-brand-600 text-white' : 'border border-slate-300 dark:border-slate-600'
                    }`}>
                      {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold leading-tight">{item.label}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={resetLayoutTooltipVisibility}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Khôi phục mặc định
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
