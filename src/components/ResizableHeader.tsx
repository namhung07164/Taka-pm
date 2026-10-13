import React, { ReactNode, useState } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { cn } from '../lib/utils';
import { X } from 'lucide-react';

export function ResizableHeader({ 
  width, 
  minWidth = 50, 
  onResize, 
  children, 
  className, 
  onClick,
  onHide,
  hideable = false
}: { 
  width: number, 
  minWidth?: number, 
  onResize: (w: number) => void, 
  children: React.ReactNode, 
  className?: string, 
  onClick?: () => void,
  onHide?: () => void,
  hideable?: boolean
}) {
  const [isResizing, setIsResizing] = useState(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    
    const startX = e.pageX;
    const startWidth = width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(minWidth, startWidth + (moveEvent.pageX - startX));
      onResize(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <th 
      className={cn("relative group", className)} 
      style={{ width, minWidth: width, maxWidth: width }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between w-full h-full">
        <div className="flex-grow whitespace-normal break-words leading-tight">{children}</div>
        {hideable && onHide && (
          <button onClick={(e) => { e.stopPropagation(); onHide(); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-400 dark:text-[#838383] hover:text-red-500 transition-all z-10 ml-1 shrink-0"
            title="Hide column"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div 
        className={cn(
          "absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-20",
          isResizing ? "bg-blue-500" : "bg-transparent"
        )}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={startResize}
      />
    </th>
  );
}
