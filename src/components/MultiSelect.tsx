import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useLanguage } from "../lib/LanguageContext";
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MultiSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({ value, onChange, options, placeholder = 'Select...', disabled, className}: MultiSelectProps) {
  const { t } = useLanguage();
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItems = value && typeof value === 'string' ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  const handleSelectItem = (item: string) => {
    if (!selectedItems.includes(item)) {
      const newItems = [...selectedItems, item];
      onChange(newItems.join(', '));
    }
    setInputValue('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleRemoveItem = (itemToRemove: string) => {
    if (disabled) return;
    const newItems = selectedItems.filter(item => item !== itemToRemove);
    onChange(newItems.join(', '));
  };

  const safeOptions = Array.isArray(options) ? options : [];
  const filteredOptions = safeOptions.filter(
    (opt) =>
      typeof opt === 'string' &&
      opt.toLowerCase().includes(inputValue.toLowerCase()) &&
      !selectedItems.includes(opt)
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'Backspace' && inputValue === '' && selectedItems.length > 0) {
      handleRemoveItem(selectedItems[selectedItems.length - 1]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
        handleSelectItem(filteredOptions[focusedIndex]);
      } else if (inputValue.trim() !== '') {
        const match = safeOptions.find((opt) => typeof opt === 'string' && opt.toLowerCase() === inputValue.trim().toLowerCase());
        if (match) {
          handleSelectItem(match);
        } else {
          // If custom values are allowed we could add it, but requirement says to pick from options
          useAppStore.getState().setToast({ title: "Notice", message: String("Invalid party. Please select from the dropdown options.") });
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      setFocusedIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div 
        className={cn(
          "flex flex-wrap items-center gap-1.5 p-1.5 border border-slate-200 dark:border-[#444446] rounded-lg bg-white dark:bg-[#1e1e20] focus-within:ring-2 focus-within:ring-blue-500 transition-shadow transition-colors",
          disabled && "bg-slate-50 opacity-100 cursor-not-allowed" // Ensure visually grayed out on disabled
        )}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus();
            setIsOpen(true);
          }
        }}
      >
        {selectedItems.map((item) => (
          <span 
            key={item} 
            className="flex items-center gap-1 bg-slate-100 dark:bg-[#333336] text-slate-700 dark:text-[#e3e3e3] px-2 py-0.5 rounded text-xs font-medium"
          >
            {item}
            {!disabled && (
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveItem(item);
                }}
                className="hover:text-red-500 focus:outline-none"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
            setFocusedIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          placeholder={selectedItems.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[60px] bg-transparent outline-none text-sm text-slate-900 dark:text-[#e3e3e3] disabled:cursor-not-allowed p-0.5"
        />
        {inputValue && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setInputValue("");
              inputRef.current?.focus();
            }}
            className="hover:text-slate-700 text-slate-400 dark:hover:text-slate-300 focus:outline-none p-1"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {isOpen && filteredOptions.length > 0 && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-lg shadow-xl z-[9999]">
          {filteredOptions.map((opt, index) => (
            <div
              key={opt}
              onClick={() => handleSelectItem(opt)}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-[#333336] text-slate-700 dark:text-[#c3c3c3]",
                focusedIndex === index && "bg-blue-50 dark:bg-[#333336]"
              )}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
