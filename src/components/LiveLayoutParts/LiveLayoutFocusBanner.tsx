import React from 'react';
import { Target, X } from 'lucide-react';

interface LiveLayoutFocusBannerProps {
  focusedUnit: any;
  targetUnitSearch?: string | null;
  onExitFocus: () => void;
}

export const LiveLayoutFocusBanner: React.FC<LiveLayoutFocusBannerProps> = ({
  focusedUnit,
  targetUnitSearch,
  onExitFocus,
}) => {
  if (!focusedUnit && !targetUnitSearch) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/90 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-full shadow-xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-4 border border-amber-300">
      <Target className="w-3.5 h-3.5 animate-pulse" />
      <span>Đang xem: {focusedUnit?.name || targetUnitSearch}</span>
      <button
        onClick={onExitFocus}
        className="p-0.5 hover:bg-amber-600/30 rounded-full transition-colors ml-1"
        title="Thoát chế độ phóng to gian hàng (Esc)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
