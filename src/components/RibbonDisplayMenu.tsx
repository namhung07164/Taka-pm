import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Check, Maximize2, LayoutGrid, SlidersHorizontal, PanelTop, ChevronDown } from 'lucide-react';

interface RibbonDisplayMenuProps {
  className?: string;
  variant?: 'navbar' | 'header' | 'floating';
}

export function RibbonDisplayMenu({ className = '', variant = 'navbar' }: RibbonDisplayMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ribbonDisplayMode = useAppStore(state => state.ribbonDisplayMode);
  const setRibbonDisplayMode = useAppStore(state => state.setRibbonDisplayMode);
  const showQuickAccessToolbar = useAppStore(state => state.showQuickAccessToolbar);
  const setShowQuickAccessToolbar = useAppStore(state => state.setShowQuickAccessToolbar);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-sm cursor-pointer select-none active:scale-95 touch-manipulation ${
          variant === 'floating'
            ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 border-slate-700 dark:border-slate-300 hover:bg-slate-700'
            : variant === 'header'
              ? 'bg-slate-50 hover:bg-slate-100 dark:bg-[#1e1e20] dark:hover:bg-[#28282a] text-slate-700 dark:text-[#c3c3c3] border-slate-200 dark:border-[#444446]'
              : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#1e1e20] dark:hover:bg-[#28282a] text-slate-700 dark:text-[#c3c3c3] border-slate-200 dark:border-[#444446]'
        }`}
        title="Ribbon Display Options"
      >
        <PanelTop className="w-4 h-4 text-slate-600 dark:text-[#a3a3a3]" />
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-[9999] w-72 bg-white dark:bg-[#1e1e20] rounded-xl shadow-2xl border border-slate-200 dark:border-[#444446] p-2 text-slate-800 dark:text-[#e3e3e3] animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
          {/* Menu Title */}
          <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#838383] border-b border-slate-100 dark:border-[#333336] mb-1">
            Show Ribbon
          </div>

          <div className="space-y-0.5">
            {/* 1. Full-screen mode */}
            <button
              type="button"
              onClick={() => {
                setRibbonDisplayMode('fullscreen');
                setIsOpen(false);
              }}
              className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors group ${
                ribbonDisplayMode === 'fullscreen'
                  ? 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-[#28282a] text-slate-700 dark:text-[#c3c3c3]'
              }`}
            >
              <div className="w-4 h-4 mt-0.5 shrink-0 flex items-center justify-center">
                {ribbonDisplayMode === 'fullscreen' ? (
                  <Check className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8]" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-[#e3e3e3]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2">Full-screen mode</div>
                <div className="text-[11px] font-normal text-slate-500 dark:text-[#a3a3a3] mt-0.5">
                  Tự động ẩn Ribbon để tối đa hóa không gian làm việc.
                </div>
              </div>
            </button>

            {/* 2. Show tabs only */}
            <button
              type="button"
              onClick={() => {
                setRibbonDisplayMode('tabs_only');
                setIsOpen(false);
              }}
              className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors group ${
                ribbonDisplayMode === 'tabs_only'
                  ? 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-[#28282a] text-slate-700 dark:text-[#c3c3c3]'
              }`}
            >
              <div className="w-4 h-4 mt-0.5 shrink-0 flex items-center justify-center">
                {ribbonDisplayMode === 'tabs_only' ? (
                  <Check className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8]" />
                ) : (
                  <LayoutGrid className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-[#e3e3e3]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2">Show tabs only</div>
                <div className="text-[11px] font-normal text-slate-500 dark:text-[#a3a3a3] mt-0.5">
                  Chỉ hiển thị thanh thẻ Tab, ẩn thanh Header trên cùng.
                </div>
              </div>
            </button>

            {/* 3. Always show Ribbon */}
            <button
              type="button"
              onClick={() => {
                setRibbonDisplayMode('always_show');
                setIsOpen(false);
              }}
              className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors group ${
                ribbonDisplayMode === 'always_show'
                  ? 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] font-bold'
                  : 'hover:bg-slate-100 dark:hover:bg-[#28282a] text-slate-700 dark:text-[#c3c3c3]'
              }`}
            >
              <div className="w-4 h-4 mt-0.5 shrink-0 flex items-center justify-center">
                {ribbonDisplayMode === 'always_show' ? (
                  <Check className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8]" />
                ) : (
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-[#e3e3e3]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2">Always show Ribbon</div>
                <div className="text-[11px] font-normal text-slate-500 dark:text-[#a3a3a3] mt-0.5">
                  Luôn hiển thị cả thẻ Tab và toàn bộ nút công cụ Header.
                </div>
              </div>
            </button>
          </div>

          <div className="my-1.5 h-px bg-slate-100 dark:bg-[#333336]" />

          {/* 4. Quick Access Toolbar option */}
          <button
            type="button"
            onClick={() => {
              setShowQuickAccessToolbar(!showQuickAccessToolbar);
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-[#c3c3c3] hover:bg-slate-100 dark:hover:bg-[#28282a] transition-colors text-left"
          >
            <div className="w-4 h-4 shrink-0 flex items-center justify-center">
              {showQuickAccessToolbar && <Check className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8]" />}
            </div>
            <span className="underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2">
              {showQuickAccessToolbar ? 'Hide Quick Access Toolbar' : 'Show Quick Access Toolbar'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
