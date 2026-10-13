import React, { useEffect, useRef, useState } from 'react';

export function MultiSelectInput({ 
  value, 
  options, 
  onSave, 
  disabled, 
  className,
  placeholder
}: { 
  value: string; 
  options: string[]; 
  onSave: (val: string) => void; 
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [val, setVal] = useState(value || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const valRef = useRef(val);
  const valueRef = useRef(value);
  const isComponentMounted = useRef(true);

  useEffect(() => {
    isComponentMounted.current = true;
    return () => { isComponentMounted.current = false; };
  }, []);

  useEffect(() => {
    setVal(value || '');
    valueRef.current = value || '';
  }, [value]);

  useEffect(() => {
    valRef.current = val;
  }, [val]);

  const currentPart = String(valRef.current || val || '').split(',').pop()?.trim() || '';
  
  // Deduplicate options case-insensitively, preferring the first encountered case
  const seenLower = new Set<string>();
  const uniqueOptions: string[] = [];
  for (const opt of options) {
    const lower = opt.toLowerCase();
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      uniqueOptions.push(opt);
    }
  }

  const suggestions = uniqueOptions.filter(v => 
    v.toLowerCase().includes(currentPart.toLowerCase()) && currentPart.toLowerCase() !== v.toLowerCase()
  );

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={val}
        onChange={(e) => {
          setVal(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => {
          setTimeout(() => {
            if (!isComponentMounted.current) return;
            const currentVal = valRef.current;
            const oldVal = valueRef.current;
            if (currentVal && currentVal.trim() !== '') {
              const parts = currentVal.split(',').map(s => s.trim()).filter(Boolean);
              const correctedParts = parts.map(p => {
                const matchedOption = options.find(opt => opt.toLowerCase() === p.toLowerCase());
                return matchedOption || p;
              });
              const invalidParts = correctedParts.filter(p => !options.includes(p));
              if (invalidParts.length > 0) {
                setVal(oldVal || '');
              } else {
                const newParts = correctedParts.join(', ');
                setVal(newParts);
                if (newParts !== oldVal) onSave(newParts);
              }
            } else {
              if (oldVal !== '') onSave('');
            }
            setShowSuggestions(false);
          }, 200);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const currentPartStr = String(valRef.current || val || '').split(',').pop()?.trim() || '';
            const match = uniqueOptions.find(opt => opt.toLowerCase().startsWith(currentPartStr.toLowerCase()) || opt.toLowerCase().includes(currentPartStr.toLowerCase()));
            if (currentPartStr && match) {
              const parts = String(valRef.current).split(',');
              parts.pop();
              const newParts = parts.map(p => p.trim()).filter(Boolean);
              newParts.push(match);
              const newValue = newParts.join(', ');
              setVal(newValue);
              valRef.current = newValue;
            }
            setTimeout(() => {
              e.currentTarget.blur();
            }, 0);
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] w-full max-h-40 overflow-y-auto bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded shadow-xl z-[9999]">
          {suggestions.map(s => (
            <div 
              key={s} 
              className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-[#333336] cursor-pointer text-sm text-slate-700 dark:text-[#c3c3c3]"
              onMouseDown={(e) => {
                e.preventDefault();
                const parts = String(valRef.current).split(',');
                parts.pop();
                const newParts = parts.map(p => p.trim()).filter(Boolean);
                newParts.push(s);
                const newValue = newParts.join(', ') + ', ';
                setVal(newValue);
                setShowSuggestions(false);
              }}
              onClick={() => {
                const parts = String(valRef.current).split(',');
                parts.pop();
                const newParts = parts.map(p => p.trim()).filter(Boolean);
                newParts.push(s);
                const newValue = newParts.join(', ') + ', ';
                setVal(newValue);
                setShowSuggestions(false);
                onSave(newValue.trim().replace(/,\s*$/, ''));
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
