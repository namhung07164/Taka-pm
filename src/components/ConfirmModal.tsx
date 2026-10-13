import React, { useEffect, useRef } from 'react';
import Draggable from 'react-draggable';
import { useLanguage } from "../lib/LanguageContext";
import { Portal } from './Portal';
import { AlertTriangle, Info, X, GripHorizontal } from 'lucide-react';
import { getZIndexClass } from '../lib/zIndexManager';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  confirmStyle?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ isOpen, title = "Confirm", message, confirmText = "Delete", confirmStyle = "danger", onConfirm, onCancel}: ConfirmModalProps) {
  const { t } = useLanguage();
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div className={`fixed inset-0 bg-slate-900/50 flex items-end md:items-center justify-center ${getZIndexClass('CONFIRM_ALERT')} p-0 md:p-4`}>
        <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button">
          <div ref={nodeRef} className="bg-white dark:bg-[#1e1e20] rounded-t-2xl md:rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-transparent dark:border-[#333336] animate-in slide-in-from-bottom-full md:slide-in-from-bottom-0 md:zoom-in-95 duration-200 pointer-events-auto relative">
            <div className="modal-handle cursor-grab active:cursor-grabbing px-6 pt-4 pb-2 flex items-center justify-between border-b border-slate-100 dark:border-[#28282a]">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <GripHorizontal className="w-4 h-4" />
                <span className="font-medium text-[11px]">{t("Drag to move") || "Drag to move"}</span>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-[#e3e3e3] rounded-lg hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors"
                title={t("Cancel") || "Cancel"}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:pb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-full ${confirmStyle === 'danger' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30'} flex items-center justify-center shrink-0`}>
                  {confirmStyle === 'danger' ? (
                     <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                  ) : (
                     <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-[#e3e3e3]">{title}</h3>
                  <p className="text-slate-500 dark:text-[#a3a3a3] text-sm mt-1">{message}</p>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-8">
                <button type="button" title={t("Cancel")}
                  onClick={onCancel}
                  className="flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors"
                >{t("Cancel")}</button>
                <button type="button" onClick={() => {
                    onConfirm();
                    onCancel();
                  }}
                  className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold text-white shadow-md transition-colors ${
                    confirmStyle === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </div>
        </Draggable>
      </div>
    </Portal>
  );
}
