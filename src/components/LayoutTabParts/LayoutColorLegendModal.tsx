import React, { FC, useRef } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { Palette, X, GripHorizontal, Check } from 'lucide-react';
import { useOverlayStack } from '../../lib/zIndexManager';

export interface LayoutColorLegendModalProps {
  showLegendModal: boolean;
  onClose: () => void;
  activeGroups: any[];
  selectedLegendGroupId: string | null;
  setSelectedLegendGroupId: (id: string | null) => void;
}

export const LayoutColorLegendModal: React.FC<LayoutColorLegendModalProps> = ({
  showLegendModal,
  onClose,
  activeGroups,
  selectedLegendGroupId,
  setSelectedLegendGroupId,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);

  const zInfo = useOverlayStack({
    layer: 'MODAL_BASE',
    isOpen: showLegendModal,
    onClose,
    closeOnTabChange: true,
  });

  if (!showLegendModal) return null;

  const content = (
    <div
      className={`fixed inset-0 ${zInfo.zClass} bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150 hide-on-actual-print print:hidden`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Draggable
        handle=".modal-handle"
        cancel="button, input, select, textarea, .no-drag"
        nodeRef={nodeRef}
        bounds="parent"
      >
        <div
          ref={nodeRef}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-800 dark:text-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-hidden flex flex-col select-none"
        >
          {/* Header */}
          <div className="modal-handle flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 cursor-grab active:cursor-grabbing">
            <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-100">
              <span className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <GripHorizontal className="w-4 h-4" />
              </span>
              <Palette className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span>Color Legend & Group Inspector</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Groups Section */}
          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                Active Classification Groups ({activeGroups.length})
              </div>
              {selectedLegendGroupId && (
                <button
                  onClick={() => setSelectedLegendGroupId(null)}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-semibold cursor-pointer"
                >
                  Clear filter
                </button>
              )}
            </div>

            {activeGroups.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center border border-dashed border-slate-200 dark:border-slate-700">
                Map colors currently reflect standard project progress status or have no custom classification groups.
              </div>
            ) : (
              <div className="space-y-2">
                {activeGroups.map((g: any) => {
                  const isSelected = selectedLegendGroupId === g.id;
                  return (
                    <div
                      key={g.id}
                      onClick={() => setSelectedLegendGroupId(isSelected ? null : g.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400 shadow-sm ring-2 ring-purple-400/40'
                          : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-4 h-4 rounded-full shadow-xs border border-black/15 shrink-0"
                            style={{ backgroundColor: g.color }}
                          />
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {g.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isSelected && (
                            <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Filtered
                            </span>
                          )}
                          <span className="text-[11px] font-mono font-bold bg-white dark:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                            {g.matchCount} {g.matchCount === 1 ? 'unit' : 'units'}
                          </span>
                        </div>
                      </div>

                      {g.matchedUnits && g.matchedUnits.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {g.matchedUnits.slice(0, 15).map((u: any) => (
                            <span
                              key={u.id}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                            >
                              {u.name}
                            </span>
                          ))}
                          {g.matchedUnits.length > 15 && (
                            <span className="text-[10px] text-slate-400 self-center">
                              +{g.matchedUnits.length - 15} more...
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Draggable>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};
