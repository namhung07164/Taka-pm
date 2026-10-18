import React, { useEffect } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { X, Bell, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';

interface ToastProps {
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
}

export function Toast({ title, message, type = 'info', onClose }: ToastProps) {
  const { t } = useLanguage();
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const typeConfig = {
    error: {
      border: 'border-red-500/80 dark:border-red-500',
      iconBg: 'bg-red-50 dark:bg-red-950/80',
      iconColor: 'text-red-600 dark:text-red-400',
      titleColor: 'text-red-700 dark:text-red-300',
      icon: AlertCircle,
    },
    warning: {
      border: 'border-amber-500/80 dark:border-amber-500',
      iconBg: 'bg-amber-50 dark:bg-amber-950/80',
      iconColor: 'text-amber-600 dark:text-amber-400',
      titleColor: 'text-amber-700 dark:text-amber-300',
      icon: AlertTriangle,
    },
    success: {
      border: 'border-emerald-500/80 dark:border-emerald-500',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/80',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      titleColor: 'text-emerald-700 dark:text-emerald-300',
      icon: CheckCircle2,
    },
    info: {
      border: 'border-blue-500/80 dark:border-blue-500',
      iconBg: 'bg-blue-50 dark:bg-[#28282a]',
      iconColor: 'text-blue-600 dark:text-[#8ab4f8]',
      titleColor: 'text-slate-800 dark:text-[#e3e3e3]',
      icon: Bell,
    },
  }[type] || {
    border: 'border-blue-500/80 dark:border-blue-500',
    iconBg: 'bg-blue-50 dark:bg-[#28282a]',
    iconColor: 'text-blue-600 dark:text-[#8ab4f8]',
    titleColor: 'text-slate-800 dark:text-[#e3e3e3]',
    icon: Bell,
  };

  const IconComponent = typeConfig.icon;

  return (
    <div
      style={{ zIndex: 99999999 }}
      className={`fixed top-4 right-4 z-[99999999] max-w-sm w-[calc(100vw-2rem)] sm:w-full bg-white dark:bg-[#1e1e20] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.7)] border-2 ${typeConfig.border} p-4 animate-in slide-in-from-top-5 fade-in duration-300 pointer-events-auto`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full ${typeConfig.iconBg} flex items-center justify-center shrink-0 shadow-xs`}>
          <IconComponent className={`w-5 h-5 ${typeConfig.iconColor}`} />
        </div>
        <div className="flex-grow min-w-0 pt-0.5">
          <h4 className={`text-sm font-bold ${typeConfig.titleColor} truncate`}>{title}</h4>
          <p className="text-xs text-slate-600 dark:text-[#c3c3c3] mt-1 line-clamp-3 leading-relaxed">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 text-slate-400 dark:text-[#838383] hover:text-slate-600 dark:hover:text-[#a3a3a3] rounded-lg hover:bg-slate-50 dark:hover:bg-[#28282a] transition-colors cursor-pointer"
          title="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
