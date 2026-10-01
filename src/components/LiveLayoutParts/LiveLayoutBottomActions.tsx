import React from 'react';
import { Palette, Menu, Maximize2 } from 'lucide-react';

interface LiveLayoutBottomActionsProps {
  onOpenLegendModal: () => void;
  showMenu: boolean;
  setShowMenu: React.Dispatch<React.SetStateAction<boolean>>;
  onFitToScreen: () => void;
}

export const LiveLayoutBottomActions: React.FC<LiveLayoutBottomActionsProps> = ({
  onOpenLegendModal,
  showMenu,
  setShowMenu,
  onFitToScreen,
}) => {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
      {/* Mobile Legend Button */}
      <button
        onClick={onOpenLegendModal}
        className="sm:hidden flex items-center gap-1.5 px-3 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 active:scale-95"
      >
        <Palette className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
        <span>Bảng màu</span>
      </button>

      {/* Floating Bottom Menu for Tablet/Mobile quick-access */}
      <button
        onClick={() => setShowMenu(prev => !prev)}
        className="sm:hidden p-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 active:scale-95"
        title="Bật/Tắt Lớp hiển thị & Cấu hình nhãn"
      >
        <Menu className="w-4 h-4" />
      </button>

      <button
        onClick={onFitToScreen}
        className="sm:hidden p-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 active:scale-95"
        title="Vừa màn hình"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
    </div>
  );
};
