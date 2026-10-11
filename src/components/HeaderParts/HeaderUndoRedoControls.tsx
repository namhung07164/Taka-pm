import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';

interface HeaderUndoRedoControlsProps {
  onUndo?: () => void;
  canUndo?: boolean;
  hasDataToUndo?: boolean;
  undoDescription?: string;
  onRedo?: () => void;
  canRedo?: boolean;
  hasDataToRedo?: boolean;
  redoDescription?: string;
}

export const HeaderUndoRedoControls: React.FC<HeaderUndoRedoControlsProps> = React.memo(({
  onUndo,
  canUndo = false,
  hasDataToUndo = false,
  undoDescription,
  onRedo,
  canRedo = false,
  hasDataToRedo = false,
  redoDescription,
}) => {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* Undo Action Button */}
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="h-8 w-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-2xs disabled:opacity-30 disabled:hover:bg-slate-50 relative active:scale-95 touch-manipulation shrink-0 cursor-pointer"
        title={undoDescription ? `${undoDescription} (Ctrl+Z)` : "Nothing to undo (Ctrl+Z)"}
        aria-label="Undo action"
      >
        <Undo2 className="w-4 h-4" />
        {hasDataToUndo && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full border border-white dark:border-slate-900" />
        )}
      </button>

      {/* Redo Action Button */}
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className="h-8 w-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 dark:bg-[#28282a] dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors border border-slate-200 dark:border-[#444446] shadow-2xs disabled:opacity-30 disabled:hover:bg-slate-50 relative active:scale-95 touch-manipulation shrink-0 cursor-pointer"
        title={redoDescription ? `${redoDescription} (Ctrl+Y)` : "Nothing to redo (Ctrl+Y)"}
        aria-label="Redo action"
      >
        <Redo2 className="w-4 h-4" />
        {hasDataToRedo && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full border border-white dark:border-slate-900" />
        )}
      </button>
    </div>
  );
});

HeaderUndoRedoControls.displayName = 'HeaderUndoRedoControls';
