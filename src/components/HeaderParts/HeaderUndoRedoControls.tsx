import React from 'react';
import { Undo2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';

export interface HeaderUndoRedoControlsProps {
  onUndo?: () => void;
  canUndo?: boolean;
  hasDataToUndo?: boolean;
  undoDescription?: string;
}

export const HeaderUndoRedoControls: React.FC<HeaderUndoRedoControlsProps> = ({
  onUndo,
  canUndo = false,
  hasDataToUndo = false,
  undoDescription,
}) => {
  const { t } = useLanguage();

  if (!onUndo) return null;

  return (
    <button
      type="button"
      onClick={onUndo}
      disabled={!canUndo && !hasDataToUndo}
      title={undoDescription || t('Undo last action')}
      className={cn(
        'px-2 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95 touch-manipulation',
        canUndo || hasDataToUndo
          ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/80 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
          : 'bg-slate-100 dark:bg-[#28282a] text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50'
      )}
    >
      <Undo2 className="w-3.5 h-3.5" />
      <span className="hidden md:inline">{t('Undo')}</span>
    </button>
  );
};

export default HeaderUndoRedoControls;
