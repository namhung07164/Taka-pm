import React from 'react';
import { Bell, X } from 'lucide-react';

interface LiveLayoutAlertFilterBannerProps {
  filterOnlyAlerts: boolean;
  totalFloorAlerts: number;
  onClearFilter: () => void;
}

export const LiveLayoutAlertFilterBanner: React.FC<LiveLayoutAlertFilterBannerProps> = ({
  filterOnlyAlerts,
  totalFloorAlerts,
  onClearFilter,
}) => {
  if (!filterOnlyAlerts) return null;

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-rose-600/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg backdrop-blur-md pointer-events-auto animate-in fade-in slide-in-from-top-2">
      <Bell className="w-3.5 h-3.5 animate-bounce" />
      <span>Đang lọc {totalFloorAlerts} gian hàng có Cảnh báo</span>
      <button
        onClick={onClearFilter}
        className="p-0.5 hover:bg-rose-700 rounded-full transition-colors ml-1"
        title="Bỏ lọc cảnh báo"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
