import React, { memo, useState, useMemo, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';

export const SearchableSelect = memo(function SearchableSelect({ 
  options, 
  value, 
  onChange 
}: { 
  options: { value: string; label: string }[]; 
  value: string; 
  onChange: (val: string) => void; 
}) {
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return options.filter(opt => 
      (opt.label || '').toLowerCase().includes(term) || (opt.value || '').toLowerCase().includes(term)
    );
  }, [options, searchTerm]);

  const handleCommit = (valToCommit?: string) => {
    const finalVal = (valToCommit !== undefined ? valToCommit : searchTerm).trim();
    if (finalVal !== value) {
      onChange(finalVal);
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <input 
          type="text"
          className="w-full bg-slate-950 border border-slate-800 rounded pl-2 pr-6 py-1 text-[11px] text-slate-200 outline-none focus:border-brand-500 transition-colors font-medium"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onBlur={() => handleCommit()}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Enter unit..."
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(prev => !prev);
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-52 overflow-y-auto custom-scrollbar">
          {searchTerm.trim() && !options.some(o => (o.value || '').toLowerCase() === searchTerm.trim().toLowerCase()) && (
            <div 
              className="px-2.5 py-1.5 text-xs cursor-pointer transition-colors bg-brand-600/10 text-brand-300 hover:bg-brand-600/20 border-b border-slate-800 flex items-center gap-1.5 font-medium"
              onMouseDown={(e) => {
                e.preventDefault();
                handleCommit(searchTerm.trim());
              }}
            >
              <Plus size={12} className="text-brand-400 shrink-0" />
              <span>Create unit: <span className="text-white font-bold">"{searchTerm.trim()}"</span></span>
            </div>
          )}
          {filteredOptions.length === 0 && !searchTerm.trim() ? (
            <div className="px-2 py-1.5 text-xs text-slate-500 text-center italic">No matching suggestions</div>
          ) : (
            filteredOptions.map(opt => (
              <div 
                key={opt.value}
                className={`px-2 py-1 text-xs cursor-pointer transition-colors flex items-center justify-between ${value === opt.value ? 'bg-brand-600/30 text-brand-300 font-medium' : 'text-slate-300 hover:bg-slate-800'}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSearchTerm(opt.value);
                  handleCommit(opt.value);
                }}
              >
                <span className="truncate">{opt.label}</span>
                {opt.value === value && <span className="text-[9px] uppercase bg-white/20 px-1 py-0.2 rounded text-white">Selected</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
});

export const UnitSizeInput = memo(function UnitSizeInput({
  unitId,
  effectiveSize,
  onCommit,
}: {
  unitId: string;
  effectiveSize: number;
  onCommit: (numVal: number | undefined) => void;
}) {
  const [localVal, setLocalVal] = useState<string>(effectiveSize > 0 ? String(effectiveSize) : '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalVal(effectiveSize > 0 ? String(effectiveSize) : '');
    }
  }, [effectiveSize, unitId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalVal(raw);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const parsed = parseFloat(raw);
      onCommitRef.current(isNaN(parsed) || parsed <= 0 ? undefined : parsed);
    }, 350);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const parsed = parseFloat(localVal);
    onCommitRef.current(isNaN(parsed) || parsed <= 0 ? undefined : parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      step="0.01"
      min="0"
      placeholder="m²"
      value={localVal}
      onFocus={() => { isFocusedRef.current = true; }}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-brand-500 transition-colors font-mono"
    />
  );
});
