import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MultiCheckboxSelectProps {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiCheckboxSelect({
  options, value, onChange, placeholder = 'Select...', className}: MultiCheckboxSelectProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  const displayValue = value.length === 0 
    ? placeholder 
    : value.length === 1 
      ? value[0] 
      : `${value.length} selected`;

  const allOptions = Array.from(new Set([...options, ...value])).sort();

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-1.5 bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
      >
        <span className="truncate">{displayValue}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-lg shadow-xl z-[9999] p-1">
          {allOptions.map((opt) => (
            <div
              key={opt}
              onClick={() => toggleOption(opt)}
              className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-[#333336] rounded text-slate-700 dark:text-[#c3c3c3]"
            >
              <div className={cn(
                "w-4 h-4 border rounded flex items-center justify-center transition-colors shrink-0",
                value.includes(opt) 
                  ? "bg-blue-500 border-blue-500 text-white" 
                  : "border-slate-300 dark:border-[#555557]"
              )}>
                {value.includes(opt) && <Check className="w-3 h-3" />}
              </div>
              <span className="truncate">{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
