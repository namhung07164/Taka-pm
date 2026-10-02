import React from 'react';
import {
  Search,
  X,
  RefreshCw,
  Bell,
  FolderOutput,
  Palette,
  Menu,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';

interface LiveLayoutTopControlsProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onRefreshConfig?: () => Promise<void> | void;
  loading: boolean;
  totalFloorAlerts: number;
  filterOnlyAlerts: boolean;
  setFilterOnlyAlerts: React.Dispatch<React.SetStateAction<boolean>>;
  canWrite: boolean;
  isExporting: boolean;
  exportStatus: string;
  onTriggerExport: () => void;
  showMenu: boolean;
  setShowMenu: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenLegendModal: () => void;
  layoutTooltipVisibility: any;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
}

export const LiveLayoutTopControls: React.FC<LiveLayoutTopControlsProps> = ({
  searchQuery,
  setSearchQuery,
  onRefreshConfig,
  loading,
  totalFloorAlerts,
  filterOnlyAlerts,
  setFilterOnlyAlerts,
  canWrite,
  isExporting,
  exportStatus,
  onTriggerExport,
  showMenu: _showMenu,
  setShowMenu,
  onOpenLegendModal,
  layoutTooltipVisibility: _layoutTooltipVisibility,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
}) => {
  return (
    <div className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 z-20 flex items-center gap-1.5 sm:gap-2">
      {/* Quick Search - Hidden on small mobile screens to keep toolbar compact and prevent overlap */}
      <div className="relative hidden md:block">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm kiếm gian hàng..."
          className="w-32 sm:w-48 pl-7 pr-6 py-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/50 shadow-lg transition-all"
        />
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Cloud Refresh */}
      {onRefreshConfig && (
        <button
          onClick={onRefreshConfig}
          disabled={loading}
          className="p-1.5 sm:p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 transition-all active:scale-95"
          title="Tải lại từ Cloud"
        >
          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loading ? 'animate-spin text-brand-600' : ''}`} />
        </button>
      )}

      {/* Filter by Alerts */}
      {totalFloorAlerts > 0 && (
        <button
          onClick={() => setFilterOnlyAlerts(prev => !prev)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl shadow-lg border transition-all text-xs font-bold active:scale-95 ${
            filterOnlyAlerts
              ? 'bg-rose-600 border-rose-500 text-white'
              : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
          }`}
          title={filterOnlyAlerts ? "Hiển thị tất cả" : "Chỉ lọc các gian hàng có Cảnh báo"}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>{totalFloorAlerts}</span>
        </button>
      )}

      {/* Export Button (Write permission only) */}
      {canWrite && (
        <button
          onClick={onTriggerExport}
          disabled={isExporting}
          className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl shadow-lg border transition-all text-xs font-bold active:scale-95 ${
            isExporting
              ? 'bg-emerald-600 text-white border-emerald-500 animate-pulse'
              : 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-slate-200 dark:border-slate-800'
          }`}
          title="Xuất file bản vẽ & hình ảnh lên R2 Cloudflare"
        >
          <FolderOutput className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isExporting ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isExporting ? (exportStatus || 'Đang xuất...') : 'Xuất dữ liệu'}</span>
        </button>
      )}

      {/* Item 5: Bảng Màu (Color Palette button placed next to zoom controls) */}
      <button
        onClick={onOpenLegendModal}
        className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 transition-all text-xs font-bold active:scale-95"
        title="Mở Bảng Chú giải Màu sắc (Color Palette)"
      >
        <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 dark:text-brand-400" />
        <span className="hidden sm:inline">Bảng màu</span>
      </button>

      {/* Layers & Settings Drawer Button */}
      <button
        onClick={() => setShowMenu(prev => !prev)}
        className="p-1.5 sm:p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 transition-all active:scale-95"
        title="Cấu hình nhãn & Lớp hiển thị (Edit View)"
      >
        <Menu className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>

      {/* Zoom / Fit Controls */}
      <div className="flex items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-0.5">
        <button
          onClick={onZoomIn}
          className="p-1 sm:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg transition-colors active:scale-95"
          title="Phóng to (+)"
        >
          <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
        <button
          onClick={onZoomOut}
          className="p-1 sm:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg transition-colors active:scale-95"
          title="Thu nhỏ (-)"
        >
          <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
        <div className="w-[1px] h-3 bg-slate-200 dark:bg-slate-800 mx-0.5"></div>
        <button
          onClick={onFitToScreen}
          className="p-1 sm:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg transition-colors active:scale-95"
          title="Vừa màn hình (Fit View)"
        >
          <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </div>
  );
};
