import React, { useEffect, useRef } from 'react';
import Draggable from 'react-draggable';
import { useLanguage } from "../lib/LanguageContext";
import { Portal } from './Portal';
import { X, Command, GripHorizontal } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ isOpen, onClose}: ShortcutsModalProps) {
  const { t } = useLanguage();
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts = [
    { keys: ['/'], description: 'Global search (Projects, Tasks, Assignees)' },
    { keys: ['Backspace'], description: 'Back to previous page' },
    { keys: ['Esc'], description: 'Close modals / Clear Focus' },
    { keys: ['Shift', 'F'], description: 'Toggle focus mode' },
    { keys: ['Ctrl', 'Z'], description: 'Undo last action' },
    { keys: ['T'], description: 'New Task' },
    { keys: ['P'], description: 'New Project' },
    { keys: ['1', '-', '9'], description: 'Switch tabs' },
  ];

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
        <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button">
          <div 
            ref={nodeRef}
            className="bg-white dark:bg-[#1e1e20] w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-200 dark:border-[#444446]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-handle cursor-grab active:cursor-grabbing flex items-center justify-between p-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50/80 dark:bg-[#252528] select-none">
              <div className="flex items-center gap-2 text-slate-800 dark:text-[#e3e3e3]">
                <GripHorizontal className="w-4 h-4 text-slate-400" />
                <Command className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold">Keyboard Shortcuts</h3>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {shortcuts.map((shortcut, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-[#a3a3a3]">{shortcut.description}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((k, i) => (
                      <span key={i} className="px-2 py-1 text-xs font-mono font-bold bg-slate-100 dark:bg-[#333336] text-slate-700 dark:text-[#c3c3c3] rounded border border-slate-200 dark:border-[#444446]">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Draggable>
      </div>
    </Portal>
  );
}
