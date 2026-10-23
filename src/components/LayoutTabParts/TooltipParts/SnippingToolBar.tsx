import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  Copy,
  Crop,
  Edit3,
  Eraser,
  Highlighter,
  Maximize2,
  Redo2,
  Square,
  Trash2,
  Undo2,
  Scan,
  Loader2,
} from 'lucide-react';
import {
  SnippingTool,
  PEN_COLORS,
  HIGHLIGHTER_COLORS,
} from './snippingTypes';

interface SnippingToolBarProps {
  currentTool: SnippingTool;
  setCurrentTool: (tool: SnippingTool) => void;
  penColor: string;
  setPenColor: (color: string) => void;
  penSize: number;
  setPenSize: (size: number) => void;
  highlighterColor: string;
  setHighlighterColor: (color: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCapture: () => void;
  onCopyClipboard: () => void;
  onCancel: () => void;
  isProcessing: boolean;
  copiedFeedback: boolean;
}

export const SnippingToolBar: React.FC<SnippingToolBarProps> = ({
  currentTool,
  setCurrentTool,
  penColor,
  setPenColor,
  penSize,
  setPenSize,
  highlighterColor,
  setHighlighterColor,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCapture,
  onCopyClipboard,
  onCancel,
  isProcessing,
  copiedFeedback,
}) => {
  const [showPenMenu, setShowPenMenu] = useState(false);
  const [showHighlighterMenu, setShowHighlighterMenu] = useState(false);

  const penRef = useRef<HTMLDivElement>(null);
  const highlighterRef = useRef<HTMLDivElement>(null);

  // Close color menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (penRef.current && !penRef.current.contains(e.target as Node)) {
        setShowPenMenu(false);
      }
      if (highlighterRef.current && !highlighterRef.current.contains(e.target as Node)) {
        setShowHighlighterMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      className="inline-flex items-center gap-1.5 p-1.5 bg-[#1f1f22]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.7)] text-slate-100 select-none pointer-events-auto"
      style={{ touchAction: 'none' }}
    >
      {/* 1. Primary Teal Capture Button (Snipping Tool Style) */}
      <button
        type="button"
        disabled={isProcessing}
        onClick={onCapture}
        className="px-3.5 py-1.5 bg-[#2dd4bf] hover:bg-[#14b8a6] text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-60"
        title="Capture and Upload to Cloud (Save Crop)"
      >
        {isProcessing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
        )}
        <span>Capture</span>
        <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
      </button>

      {/* 2. Quick Copy to Clipboard Button */}
      <button
        type="button"
        disabled={isProcessing}
        onClick={onCopyClipboard}
        className={`p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center relative ${
          copiedFeedback
            ? 'bg-emerald-600/30 text-emerald-300'
            : 'hover:bg-white/10 text-slate-300 hover:text-white'
        }`}
        title="Copy Crop to Clipboard"
      >
        {copiedFeedback ? (
          <Check className="w-4 h-4 text-emerald-400 animate-in zoom-in-75 duration-100" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
        {copiedFeedback && (
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] rounded font-bold shadow-md whitespace-nowrap animate-in fade-in duration-150">
            Copied!
          </span>
        )}
      </button>

      {/* 3. Crop / Selection Mode Button */}
      <button
        type="button"
        onClick={() => {
          setCurrentTool('select');
          setShowPenMenu(false);
          setShowHighlighterMenu(false);
        }}
        className={`p-2 rounded-xl transition-all cursor-pointer ${
          currentTool === 'select'
            ? 'bg-white/20 text-teal-300 shadow-inner'
            : 'hover:bg-white/10 text-slate-300 hover:text-white'
        }`}
        title="Select & Resize Crop Box"
      >
        <Crop className="w-4 h-4" />
      </button>

      {/* Vertical divider */}
      <div className="w-[1px] h-5 bg-white/15 mx-0.5" />

      {/* 4. Pen Tool with Color Picker */}
      <div className="relative" ref={penRef}>
        <button
          type="button"
          onClick={() => {
            if (currentTool === 'pen') {
              setShowPenMenu(!showPenMenu);
            } else {
              setCurrentTool('pen');
              setShowPenMenu(false);
            }
            setShowHighlighterMenu(false);
          }}
          className={`p-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
            currentTool === 'pen'
              ? 'bg-white/20 text-white shadow-inner'
              : 'hover:bg-white/10 text-slate-300 hover:text-white'
          }`}
          title="Ballpoint Pen (Click again for colors)"
        >
          <div className="relative flex items-center">
            <Edit3 className="w-4 h-4" />
            <span
              className="absolute -bottom-1 left-0 right-0 h-1 rounded-full border border-black/40"
              style={{ backgroundColor: penColor }}
            />
          </div>
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>

        {/* Pen Color & Size Popover */}
        {showPenMenu && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-[#2a2a2d] border border-white/15 rounded-xl shadow-2xl flex flex-col gap-2 z-50 min-w-[140px] animate-in fade-in zoom-in-95 duration-100">
            <div className="text-[10px] font-bold text-slate-400 px-1">Pen Color</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PEN_COLORS.map((item) => (
                <button
                  key={item.color}
                  type="button"
                  onClick={() => {
                    setPenColor(item.color);
                    setShowPenMenu(false);
                  }}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    penColor === item.color
                      ? 'scale-125 border-teal-400 shadow-md ring-2 ring-teal-400/30'
                      : 'border-white/20 hover:scale-110'
                  }`}
                  style={{ backgroundColor: item.color }}
                  title={item.name}
                />
              ))}
            </div>
            <div className="text-[10px] font-bold text-slate-400 px-1 pt-1 border-t border-white/10">Thickness</div>
            <div className="flex items-center justify-between px-1 gap-1">
              {[2, 4, 7].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setPenSize(s);
                    setShowPenMenu(false);
                  }}
                  className={`flex-1 py-1 rounded text-[10px] font-bold text-center ${
                    penSize === s ? 'bg-teal-500 text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15'
                  }`}
                >
                  {s}px
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5. Highlighter Tool */}
      <div className="relative" ref={highlighterRef}>
        <button
          type="button"
          onClick={() => {
            if (currentTool === 'highlighter') {
              setShowHighlighterMenu(!showHighlighterMenu);
            } else {
              setCurrentTool('highlighter');
              setShowHighlighterMenu(false);
            }
            setShowPenMenu(false);
          }}
          className={`p-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
            currentTool === 'highlighter'
              ? 'bg-white/20 text-white shadow-inner'
              : 'hover:bg-white/10 text-slate-300 hover:text-white'
          }`}
          title="Highlighter (Click again for colors)"
        >
          <div className="relative flex items-center">
            <Highlighter className="w-4 h-4" />
            <span
              className="absolute -bottom-1 left-0 right-0 h-1 rounded-full border border-black/40"
              style={{ backgroundColor: highlighterColor }}
            />
          </div>
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>

        {showHighlighterMenu && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-[#2a2a2d] border border-white/15 rounded-xl shadow-2xl flex flex-col gap-2 z-50 min-w-[130px] animate-in fade-in zoom-in-95 duration-100">
            <div className="text-[10px] font-bold text-slate-400 px-1">Highlight Color</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {HIGHLIGHTER_COLORS.map((item) => (
                <button
                  key={item.color}
                  type="button"
                  onClick={() => {
                    setHighlighterColor(item.color);
                    setShowHighlighterMenu(false);
                  }}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    highlighterColor === item.color
                      ? 'scale-125 border-teal-400 shadow-md ring-2 ring-teal-400/30'
                      : 'border-white/20 hover:scale-110'
                  }`}
                  style={{ backgroundColor: item.color }}
                  title={item.name}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 6. Eraser Tool */}
      <button
        type="button"
        onClick={() => {
          setCurrentTool('eraser');
          setShowPenMenu(false);
          setShowHighlighterMenu(false);
        }}
        className={`p-2 rounded-xl transition-all cursor-pointer ${
          currentTool === 'eraser'
            ? 'bg-white/20 text-white shadow-inner'
            : 'hover:bg-white/10 text-slate-300 hover:text-white'
        }`}
        title="Eraser (Click to clear annotations)"
      >
        <Eraser className="w-4 h-4" />
      </button>

      {/* 7. Shapes / Rectangle Tool */}
      <button
        type="button"
        onClick={() => {
          setCurrentTool('rectangle');
          setShowPenMenu(false);
          setShowHighlighterMenu(false);
        }}
        className={`p-2 rounded-xl transition-all cursor-pointer ${
          currentTool === 'rectangle'
            ? 'bg-white/20 text-white shadow-inner'
            : 'hover:bg-white/10 text-slate-300 hover:text-white'
        }`}
        title="Rectangle Shape Tool"
      >
        <Square className="w-4 h-4" />
      </button>

      {/* Vertical divider */}
      <div className="w-[1px] h-5 bg-white/15 mx-0.5" />

      {/* 8. Undo */}
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className="w-4 h-4" />
      </button>

      {/* 9. Redo */}
      <button
        type="button"
        disabled={!canRedo}
        onClick={onRedo}
        className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
        title="Redo (Ctrl+Y)"
      >
        <Redo2 className="w-4 h-4" />
      </button>

      {/* Vertical divider */}
      <div className="w-[1px] h-5 bg-white/15 mx-0.5" />

      {/* 10. Delete / Close (Cancel) */}
      <button
        type="button"
        onClick={onCancel}
        className="p-2 rounded-xl hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition-all cursor-pointer"
        title="Cancel & Exit Snipping Tool (Esc)"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};
