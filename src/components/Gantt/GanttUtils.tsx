import React from 'react';
import { parseDateTime, cn } from "../../lib/utils";

export { cn };

export const formatGanttDate = (dateStr: string | undefined): string => {
  if (!dateStr) return "";
  const d = parseDateTime(dateStr);
  if (!d || isNaN(d.getTime())) return dateStr || "";

  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  const hasExplicitTime = dateStr.includes('T') || (dateStr.includes(':') && (d.getHours() !== 0 || d.getMinutes() !== 0));
  if (hasExplicitTime) {
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${day} ${month} ${year}, ${displayHours}:${minutes} ${period}`;
  }
  return `${day} ${month} ${year}`;
};

export const renderGanttDateCell = (dateStr: string | undefined, colorClass?: string) => {
  if (!dateStr) {
    return <span className="text-slate-400 dark:text-slate-500 font-mono text-xs">-</span>;
  }
  const d = parseDateTime(dateStr);
  if (!d || isNaN(d.getTime())) {
    return <span className={cn("font-mono text-[11px] leading-tight", colorClass)}>{dateStr}</span>;
  }

  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const dateFormatted = `${day} ${month} ${year}`;

  const hasExplicitTime = dateStr.includes('T') || (dateStr.includes(':') && (d.getHours() !== 0 || d.getMinutes() !== 0));
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const timeFormatted = `${displayHours}:${minutes} ${period}`;

  return (
    <div className="flex flex-col items-center justify-center leading-tight whitespace-nowrap select-none py-0.5 w-full text-center">
      <span className={cn("font-mono font-bold tracking-tight text-[11px] leading-tight", colorClass || "text-slate-800 dark:text-slate-200")}>
        {dateFormatted}
      </span>
      {hasExplicitTime && (
        <span className="text-[9.5px] font-mono font-medium tracking-tighter opacity-70 leading-none mt-0.5 text-slate-500 dark:text-slate-400">
          {timeFormatted}
        </span>
      )}
    </div>
  );
};

export const positionTooltip = (
  tooltipOrEvent: HTMLElement | null | React.MouseEvent | React.TouchEvent | { clientX: number; clientY: number },
  xOrTooltip?: number | HTMLElement | null,
  yCoord?: number
) => {
  let tooltip: HTMLElement | null = null;
  let clientX = 0;
  let clientY = 0;

  if (tooltipOrEvent && typeof (tooltipOrEvent as HTMLElement).getBoundingClientRect === 'function' && typeof xOrTooltip === 'number') {
    tooltip = tooltipOrEvent as HTMLElement;
    clientX = xOrTooltip;
    clientY = typeof yCoord === 'number' ? yCoord : 0;
  } else if (xOrTooltip && typeof (xOrTooltip as HTMLElement).getBoundingClientRect === 'function') {
    tooltip = xOrTooltip as HTMLElement;
    const e = tooltipOrEvent as any;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX || 0;
      clientY = e.clientY || 0;
    }
  }

  if (!tooltip) return;

  const tw = tooltip.offsetWidth || 250;
  const th = tooltip.offsetHeight || 150;

  let x = clientX + 15;
  let y = clientY + 15;

  if (x + tw > window.innerWidth - 10) {
    x = window.innerWidth - tw - 15;
    if (x < 10) x = 10;
  }

  if (y + th > window.innerHeight - 10) {
    y = window.innerHeight - th - 15;
    if (y < 10) y = 10;
  }

  tooltip.style.zIndex = '999999';
  tooltip.style.left = `${Math.max(10, x)}px`;
  tooltip.style.top = `${Math.max(10, y)}px`;
};

/**
 * Tự động căn chỉnh lại vị trí của Tooltip trên màn hình để không bao giờ bị tràn ra ngoài màn hình
 * (đặc biệt khi mở panel Edit Predecessor hoặc danh sách gợi ý).
 */
export const ensureTooltipInViewport = (tooltip: HTMLElement | null) => {
  if (!tooltip) return;
  const rect = tooltip.getBoundingClientRect();
  const tw = rect.width || tooltip.offsetWidth || 340;
  const th = rect.height || tooltip.offsetHeight || 200;

  let x = rect.left;
  let y = rect.top;

  let changed = false;

  if (x + tw > window.innerWidth - 10) {
    x = Math.max(10, window.innerWidth - tw - 15);
    changed = true;
  }

  if (y + th > window.innerHeight - 10) {
    y = Math.max(10, window.innerHeight - th - 15);
    changed = true;
  }

  if (x < 10) { x = 10; changed = true; }
  if (y < 10) { y = 10; changed = true; }

  if (changed) {
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
};

export const getBarColor = (status: string, duration?: string | number): string => {
  if (
    duration !== undefined &&
    duration !== "" &&
    parseFloat(String(duration)) === 0
  ) {
    return "bg-amber-500 hover:bg-amber-600 border border-amber-600";
  }
  const s = String(status || "").toLowerCase().trim();
  if (s === "completed" || s === "done") {
    return "bg-emerald-500 hover:bg-emerald-600 border border-emerald-600";
  }
  if (s === "on process" || s === "in progress") {
    return "bg-blue-500 hover:bg-blue-600 border border-blue-600";
  }
  if (s === "delayed" || s === "delay" || s === "overdue") {
    return "bg-rose-500 hover:bg-rose-600 border border-rose-600";
  }
  if (s === "upcoming" || s === "planned") {
    return "bg-slate-400 dark:bg-slate-500 hover:bg-slate-500 dark:hover:bg-slate-400 border border-slate-500/80";
  }
  if (s === "handover") {
    return "bg-blue-500 hover:bg-blue-600 border border-blue-600";
  }
  if (s === "canceled" || s === "cancelled") {
    return "bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 text-slate-600 border border-slate-400";
  }
  return "bg-slate-400 dark:bg-slate-500 hover:bg-slate-500 border border-slate-500/80";
};
