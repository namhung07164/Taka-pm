import React from 'react';
import { cn } from '../../lib/utils';

export const FastToggle = ({ value, canWrite, onToggle, isSmall = false }: { value: boolean, canWrite: boolean, onToggle: (val: boolean) => void, isSmall?: boolean }) => {
  const [localVal, setLocalVal] = React.useState(value);
  React.useEffect(() => { setLocalVal(value); }, [value]);
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canWrite) return;
    const newVal = !localVal;
    setLocalVal(newVal); // Optimistically update local state immediately
    
    // Yield to the browser so the CSS animation starts smoothly before any heavy re-renders
    requestAnimationFrame(() => {
      setTimeout(() => {
        onToggle(newVal); // Trigger parent update
      }, 0);
    });
  };

  return (
    <button
      onClick={handleClick}
      disabled={!canWrite}
      className={cn(
        "relative inline-flex items-center rounded-full transition-colors focus:outline-none shrink-0",
        isSmall ? "h-3.5 w-6" : "h-4 w-7",
        localVal ? "bg-green-500" : "bg-slate-200 dark:bg-slate-700",
        !canWrite && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block transform rounded-full bg-white dark:bg-[#1e1e20] transition-transform",
          isSmall ? "h-2.5 w-2.5" : "h-3 w-3",
          localVal ? (isSmall ? "translate-x-3" : "translate-x-3.5") : "translate-x-0.5"
        )}
      />
    </button>
  );
};
