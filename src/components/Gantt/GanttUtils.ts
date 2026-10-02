import { parseDateTime, formatDisplayDateTime, cn } from "../../lib/utils";

export { cn };

export const formatGanttDate = (dateStr: string | undefined) => {
  if (!dateStr) return "";
  const d = parseDateTime(dateStr);
  if (!d || isNaN(d.getTime())) return dateStr || "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayStr = days[d.getDay()];
  return `${dayStr}, ${formatDisplayDateTime(dateStr)}`;
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

  if (x + tw > window.innerWidth) {
    x = window.innerWidth - tw - 15;
    if (x < 0) x = 10;
  }

  if (y + th > window.innerHeight) {
    y = window.innerHeight - th - 15;
    if (y < 0) y = 10;
  }

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
};

export const getPKey = (code?: string, year?: string | number, store?: string) => 
  `${String(code || "").trim().toLowerCase()}-${String(year || "").trim().toLowerCase()}-${String(store || "").trim().toLowerCase()}`;

export const filterTaskByDate = (t: any, filterStartDate: string, filterEndDate: string) => {
  if (!filterStartDate && !filterEndDate) return true;
  const tStartStr = t.start;
  const tFinishStr = t.finish;
  if (!tStartStr && !tFinishStr) return true;
  const dStart = tStartStr ? new Date(tStartStr).getTime() : -Infinity;
  const dFinish = tFinishStr ? new Date(tFinishStr).getTime() : Infinity;
  const fStart = filterStartDate ? new Date(filterStartDate).getTime() : -Infinity;
  const fFinish = filterEndDate ? new Date(filterEndDate).getTime() : Infinity;
  return dStart <= fFinish && dFinish >= fStart;
};

export const getBarColor = (status: string, duration?: string | number) => {
  if (
    duration !== undefined &&
    duration !== "" &&
    parseFloat(String(duration)) === 0
  )
    return "bg-orange-500 hover:bg-orange-600";
  if (status === "On process" || status === "In Progress") return "bg-blue-500 hover:bg-blue-600";
  if (status === "Upcoming") return "bg-slate-700 dark:bg-slate-500 hover:bg-slate-800 dark:hover:bg-slate-400";
  if (status === "Completed") return "bg-green-500 hover:bg-green-600";
  if (status === "Handover") return "bg-blue-500 hover:bg-blue-600";
  if (status === "Canceled") return "bg-slate-400 hover:bg-slate-500";
  return "bg-slate-400 hover:bg-slate-500";
};

