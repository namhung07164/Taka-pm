import React, { useEffect, useState } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { X, Bell } from 'lucide-react';

interface ToastProps {
  title: string;
  message: string;
  onClose: () => void;
}

export function Toast({ title, message, onClose}: ToastProps) {
  const { t } = useLanguage();
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-[200] max-w-sm w-full bg-white dark:bg-[#1e1e20] rounded-xl shadow-2xl border border-slate-100 dark:border-[#444446] p-4 animate-in slide-in-from-top-5 fade-in duration-300">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-[#28282a] flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-blue-600 dark:text-[#8ab4f8]" />
        </div>
        <div className="flex-grow min-w-0">
          <h4 className="text-sm font-bold text-slate-800 dark:text-[#e3e3e3] truncate">{title}</h4>
          <p className="text-xs text-slate-500 dark:text-[#a3a3a3] mt-1 line-clamp-2">{message}</p>
        </div>
        <button onClick={onClose} className="shrink-0 p-1 text-slate-400 dark:text-[#838383] hover:text-slate-600 dark:hover:text-[#a3a3a3] rounded-lg hover:bg-slate-50 dark:hover:bg-[#28282a] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
