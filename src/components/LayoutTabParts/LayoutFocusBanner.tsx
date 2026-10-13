import React, { FC } from 'react';
import { X } from 'lucide-react';

export interface LayoutFocusBannerProps {
  focusedUnitId: string | null;
  units: any[];
  onClearFocus: () => void;
}

export const LayoutFocusBanner: React.FC<LayoutFocusBannerProps> = ({
  focusedUnitId,
  units,
  onClearFocus,
}) => {
  if (!focusedUnitId) return null;

  const unitName = units.find((u: any) => u.id === focusedUnitId)?.name || 'Gian hàng';

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-900/95 dark:bg-slate-800/95 text-white px-3.5 py-1.5 rounded-full shadow-2xl border border-amber-400/60 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 hide-on-actual-print print:hidden">
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
      <span className="text-xs font-bold text-amber-300">
        {unitName}
      </span>
      <button
        type="button"
        onClick={onClearFocus}
        className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded-full transition-all ml-1 active:scale-95 touch-manipulation cursor-pointer"
        title="Thoát chế độ phóng to"
      >
        <X className="w-3 h-3" />
        <span>Thoát zoom</span>
      </button>
    </div>
  );
};
