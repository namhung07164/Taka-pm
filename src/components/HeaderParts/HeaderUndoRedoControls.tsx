import { Undo2, Redo2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';

export interface HeaderUndoRedoControlsProps {
  onUndo?: () => void;
  canUndo?: boolean;
  hasDataToUndo?: boolean;
  undoDescription?: string;
  onRedo?: () => void;
  canRedo?: boolean;
  hasDataToRedo?: boolean;
  redoDescription?: string;
}

export const HeaderUndoRedoControls: React.FC<HeaderUndoRedoControlsProps> = ({
  onUndo,
  canUndo = false,
  hasDataToUndo = false,
  undoDescription,
  onRedo,
  canRedo = false,
  hasDataToRedo = false,
  redoDescription,
}) => {
  const { t } = useLanguage();

  if (!onUndo && !onRedo) return null;

  return (
    <div className="flex items-center gap-1">
      {onUndo && (
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
      )}

      {onRedo && (
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo && !hasDataToRedo}
          title={redoDescription || t('Redo last action')}
          className={cn(
            'px-2 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95 touch-manipulation',
            canRedo || hasDataToRedo
              ? 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700'
              : 'bg-slate-100 dark:bg-[#28282a] text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50'
          )}
        >
          <Redo2 className="w-3.5 h-3.5" />
          <span className="hidden md:inline">{t('Redo')}</span>
        </button>
      )}
    </div>
  );
};

export default HeaderUndoRedoControls;
