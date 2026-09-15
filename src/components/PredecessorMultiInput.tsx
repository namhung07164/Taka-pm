import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Task, Project } from '../types';
import { Search, X, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLanguage } from '../lib/LanguageContext';
import { computeTaskCode } from '../lib/ganttUtils';

export function PredecessorMultiInput({
  value,
  onChange,
  tasks,
  projects,
  currentProjectCode,
  currentProjectYear,
  currentProjectStore,
  disabled
}: {
  value: string;
  onChange: (val: string) => void;
  tasks: Task[];
  projects: Project[];
  currentProjectCode?: string;
  currentProjectYear?: number | string;
  currentProjectStore?: string;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (isOpen) {
          setIsOpen(false);
          const merged = enforceRules(value || '', true);
          if (merged !== value) onChange(merged);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, value, onChange]);

  const segments = (value || '').split(',').map(s => s.trim());
  const lastSegment = segments[segments.length - 1] || '';

  const candidateTasks = useMemo(() => {
    const searchLower = lastSegment ? lastSegment.toLowerCase().replace(/^(fs|ss|ff|sf|\s*[+-]|\s+\d|$)/i, '') : '';
    
    // Filter tasks based on current project scope first
    let scopeTasks = tasks.filter(t => 
      t.projectCode === currentProjectCode &&
      (!currentProjectYear || String(t.projectYear) === String(currentProjectYear)) &&
      (!currentProjectStore || String(t.projectStore) === String(currentProjectStore))
    );
    
    if (scopeTasks.length === 0) scopeTasks = tasks; // Fallback to all tasks if none in scope

    const matches = searchLower ? scopeTasks.filter(t => {
      const codeStr = (t.taskCodePhu || t.id).toLowerCase();
      const nameStr = (t.name || '').toLowerCase();
      return codeStr.includes(searchLower) || nameStr.includes(searchLower);
    }) : scopeTasks;

    return matches.slice(0, 15);
  }, [lastSegment, tasks, currentProjectCode, currentProjectYear, currentProjectStore]);

  const handleSelect = (task: Task, relationship?: string) => {
    const code = computeTaskCode(projects, tasks, task) || task.taskCodePhu || task.id;
    const newSegments = [...segments];
    newSegments[newSegments.length - 1] = code + (relationship || '');
    
    const merged = enforceRules(newSegments.join(', '), false);
    
    if (newSegments.length >= 2) {
      onChange(merged);
      setIsOpen(false);
    } else {
      onChange(merged + ', ');
      setIsOpen(true);
    }
    inputRef.current?.focus();
  };

  const enforceRules = (val: string, isFinal: boolean = false) => {
    let parts = val.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 2) {
      parts = parts.slice(0, 2); 
    }
    
    if (isFinal && parts.length >= 2) {
      if (!/FF|SF/i.test(parts[1])) {
        if (!/SS|FS/i.test(parts[1])) {
          parts[1] += "FF";
        } else {
          parts[1] = parts[1].replace(/SS|FS/ig, "FF");
        }
      }
    }
    
    return parts.join(', ');
  };

  const renderColoredText = (val: string) => {
    if (!val) return null;
    const parts = val.split(",");
    return (
      <>
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            <span className={index === 0 ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400"}>
              {part}
            </span>
            {index < parts.length - 1 && <span className="text-slate-800 dark:text-slate-200">,</span>}
          </React.Fragment>
        ))}
      </>
    );
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase();
    val = val.replace(/[^A-Z0-9\-\+\.,\s]/g, '');
    
    const parts = val.split(',').map(s => s.trim());
    if (parts.length > 2) {
      val = parts.slice(0, 2).join(', '); // Prevent typing a third comma
    }
    
    onChange(val);
    setIsOpen(true);
  };

  // Exact same text formatting to ensure perfect 1:1 overlay alignment
  const commonTextClasses = "text-sm font-sans leading-normal tracking-normal whitespace-pre";

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        className={cn(
          "w-full relative rounded-lg bg-white dark:bg-[#18181a] border overflow-hidden",
          disabled ? "bg-slate-50 dark:bg-[#18181a] border-slate-200 dark:border-[#444446] opacity-60" : "border-slate-200 dark:border-[#444446] focus-within:ring-2 focus-within:ring-purple-500"
        )}
      >
        <div 
          ref={overlayRef} 
          className={cn(
            "absolute inset-0 px-3 py-2 pointer-events-none overflow-hidden z-10 flex items-center",
            commonTextClasses
          )} 
          aria-hidden="true"
        >
          {renderColoredText(value || "")}
        </div>
        
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          value={value || ''}
          onChange={handleChange}
          onScroll={(e) => { if (overlayRef.current) overlayRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          placeholder={value ? "" : "e.g. A01-1SS, A02-2FF"}
          className={cn(
            "w-full px-3 py-2 relative z-20 bg-transparent outline-none border-none focus:ring-0 shadow-none m-0 caret-slate-800 dark:caret-slate-200",
            commonTextClasses
          )}
          style={{ 
            color: value ? "transparent" : "inherit",
            WebkitTextFillColor: value ? "transparent" : "inherit"
          }}
        />
      </div>
      
      {isOpen && lastSegment && candidateTasks.length > 0 && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#1c1c1f] border border-slate-200 dark:border-[#333336] rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {candidateTasks.map((t) => {
            const isSecondPredecessor = segments.length >= 2;
            return (
              <div
                key={t.id}
                onClick={() => !isSecondPredecessor && handleSelect(t)}
                className={cn(
                  "p-2 border-b border-slate-100 dark:border-[#28282a] last:border-0 transition-colors",
                  !isSecondPredecessor ? "hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer flex flex-col" : "flex flex-col bg-slate-50/50 dark:bg-[#18181a]/50"
                )}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    {t.name}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {t.taskCodePhu || t.id}
                  </span>
                </div>
                
                {isSecondPredecessor && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-[#333336]">
                    <button 
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSelect(t, 'FF'); }}
                      className="flex-1 py-1.5 px-2 text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded transition-colors border border-blue-200 dark:border-blue-800/50"
                    >
                      + FF (Finish-to-Finish)
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSelect(t, 'SF'); }}
                      className="flex-1 py-1.5 px-2 text-[10px] font-bold bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-400 rounded transition-colors border border-rose-200 dark:border-rose-800/50"
                    >
                      + SF (Start-to-Finish)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
