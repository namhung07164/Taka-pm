import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Lock, X, Pin, ChevronDown } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Project } from '../types';
import { cn } from '../lib/utils';

interface FixedProjectInputProps {
  projects?: Project[];
  yearFilter?: string;
  storeFilter?: string;
  locationFilter?: string[];
  statusFilter?: string;
  className?: string;
}

export const FixedProjectInput: React.FC<FixedProjectInputProps> = React.memo(({
  projects = [],
  yearFilter,
  storeFilter,
  locationFilter,
  statusFilter,
  className = ''
}) => {
  const fixedProjectCode = useAppStore(state => state.fixedProjectCode);
  const setFixedProjectCode = useAppStore(state => state.setFixedProjectCode);

  const [inputVal, setInputVal] = useState(fixedProjectCode || '');
  const [isOpenDropdown, setIsOpenDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync inputVal when fixedProjectCode changes externally
  useEffect(() => {
    setInputVal(fixedProjectCode || '');
  }, [fixedProjectCode]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpenDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter project candidates
  const candidateProjects = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    const term = inputVal.trim().toLowerCase();

    const filtered = projects.filter(p => {
      if (!p.code) return false;

      if (yearFilter && yearFilter !== 'all') {
        const pYear = p.year ? String(p.year).trim() : null;
        if (pYear === null || pYear !== String(yearFilter).trim()) return false;
      }

      if (storeFilter && storeFilter !== 'all') {
        if (!p.store || String(p.store).toUpperCase().trim() !== String(storeFilter).toUpperCase().trim()) return false;
      }

      if (locationFilter && locationFilter.length > 0) {
        if (!p.location || !locationFilter.includes(p.location)) return false;
      }

      if (statusFilter && statusFilter !== 'all') {
        const computedTakStart = p.computedTakStart || p.start || "";
        const status = p.computedStatus || (p as any).status || "";
        if (statusFilter === 'has_money') {
          const hasBud = ((p.financial as any)?.budget || (p.financial as any)?.totalBudget || (p as any).budget || 0) !== 0;
          const hasAct = ((p.financial as any)?.actual || (p.financial as any)?.totalActual || (p as any).actual || 0) !== 0;
          if (!hasBud && !hasAct) return false;
        } else if (statusFilter === 'has_budget') {
          const hasBud = ((p.financial as any)?.budget || (p.financial as any)?.totalBudget || (p as any).budget || 0) !== 0;
          if (!hasBud) return false;
        } else if (statusFilter === 'has_act_forc') {
          const hasAct = ((p.financial as any)?.actual || (p.financial as any)?.totalActual || (p as any).actual || 0) !== 0;
          if (!hasAct) return false;
        } else if (statusFilter !== 'all' && status && status !== statusFilter) {
          if (statusFilter === 'On process + Upcoming 3 days' && status !== 'On process' && status !== 'Upcoming') {
            return false;
          }
        }
      }

      return true;
    });

    const uniqueMap = new Map<string, Project>();
    filtered.forEach(p => {
      const codeKey = p.code.trim().toUpperCase();
      if (!uniqueMap.has(codeKey)) {
        uniqueMap.set(codeKey, p);
      }
    });

    const uniqueList = Array.from(uniqueMap.values());
    if (!term) return uniqueList.slice(0, 40);

    return uniqueList.filter(p => {
      const code = String(p.code || '').toLowerCase();
      const name = String(p.name || '').toLowerCase();
      const store = String(p.store || '').toLowerCase();
      const location = String(p.location || '').toLowerCase();
      return code.includes(term) || name.includes(term) || store.includes(term) || location.includes(term);
    }).slice(0, 40);
  }, [projects, inputVal, yearFilter, storeFilter, locationFilter, statusFilter]);

  const handleApplyFix = (codeOrName: string) => {
    const clean = codeOrName.trim();
    if (!clean) return;
    // Check if input directly matches a candidate project by name or code
    const matched = candidateProjects.find(
      p => String(p.code || '').trim().toLowerCase() === clean.toLowerCase() ||
           String(p.name || '').trim().toLowerCase() === clean.toLowerCase()
    );
    const effectiveFix = matched ? (matched.code || matched.name || clean) : clean;
    setFixedProjectCode(effectiveFix.trim().toUpperCase());
    setInputVal(effectiveFix.trim().toUpperCase());
    setIsOpenDropdown(false);
  };

  const handleClearFix = () => {
    setFixedProjectCode('');
    setInputVal('');
    setIsOpenDropdown(false);
  };

  const isFixed = Boolean(fixedProjectCode && fixedProjectCode.trim());

  if (isFixed) {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-500 text-amber-900 dark:text-amber-200 rounded-lg text-xs font-bold shadow-xs shrink-0 select-none animate-in fade-in duration-150", className)}>
        <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="font-extrabold uppercase tracking-wide truncate max-w-[180px]">Fix: {fixedProjectCode}</span>
        <button
          type="button"
          onClick={handleClearFix}
          className="ml-0.5 p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800 rounded-md text-amber-700 dark:text-amber-300 hover:text-amber-950 dark:hover:text-white transition-colors cursor-pointer active:scale-95 touch-manipulation"
          title="Clear Fixed Project"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("relative inline-block min-w-[140px] sm:min-w-[170px]", className)} ref={dropdownRef}>
      <div className="relative flex items-center">
        <Pin className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 absolute left-2.5 pointer-events-none" />
        <input
          type="text"
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            setIsOpenDropdown(true);
          }}
          onFocus={() => setIsOpenDropdown(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && inputVal.trim()) {
              e.preventDefault();
              handleApplyFix(inputVal);
            } else if (e.key === 'Escape') {
              setIsOpenDropdown(false);
            }
          }}
          placeholder="Fix Project Code / Name..."
          className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-[#1e1e20] border border-amber-300 dark:border-amber-700/80 text-slate-900 dark:text-[#e3e3e3] text-xs font-semibold rounded-lg focus:ring-2 focus:ring-amber-500 outline-none shadow-xs placeholder:text-slate-400 dark:placeholder:text-slate-500"
        />
        {inputVal.trim() ? (
          <button
            type="button"
            onClick={() => handleApplyFix(inputVal)}
            className="absolute right-1 p-0.5 px-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
            title="Fix Project"
          >
            Fix
          </button>
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 pointer-events-none" />
        )}
      </div>

      {isOpenDropdown && candidateProjects.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-[9999] bg-white dark:bg-[#252528] border border-slate-200 dark:border-[#444446] rounded-xl shadow-2xl max-h-64 overflow-y-auto p-1.5 text-xs select-none animate-in fade-in duration-100 min-w-[280px] sm:min-w-[340px] max-w-[90vw]">
          <div className="px-2 py-1 text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 border-b border-slate-100 dark:border-[#333336] flex items-center justify-between">
            <span>Select Project to Fix</span>
            <span className="text-[9px] text-slate-400 font-normal">Code or Name</span>
          </div>
          {candidateProjects.map((p) => {
            const pStore = String(p.store || '').toLowerCase();
            return (
              <button
                key={`${p.code}_${p.id}`}
                type="button"
                onClick={() => handleApplyFix(p.code)}
                className="w-full text-left px-2 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg flex flex-col gap-0.5 cursor-pointer transition-colors active:scale-98"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  {p.store && (
                    <span className={cn(
                      "px-1 py-0.2 text-[9px] font-black rounded uppercase border",
                      pStore === 'hcm'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    )}>
                      {p.store}
                    </span>
                  )}
                  <span className="font-mono font-black text-xs text-blue-700 dark:text-[#8ab4f8] uppercase">{p.code}</span>
                  {p.year && <span className="text-[10px] text-slate-400 font-medium">• {p.year}</span>}
                  {p.location && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                      {p.location}
                    </span>
                  )}
                </div>
                {p.name && (
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                    {p.name}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

FixedProjectInput.displayName = 'FixedProjectInput';
