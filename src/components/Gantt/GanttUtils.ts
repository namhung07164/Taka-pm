import { parseDateTime, formatDisplayDateTime } from "../../lib/utils";

export const formatGanttDate = (dateStr: string | undefined) => {
  if (!dateStr) return "";
  const d = parseDateTime(dateStr);
  if (!d || isNaN(d.getTime())) return dateStr || "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayStr = days[d.getDay()];
  return `${dayStr}, ${formatDisplayDateTime(dateStr)}`;
};

export const positionTooltip = (e: React.MouseEvent | React.TouchEvent | {clientX: number, clientY: number}, tooltip: HTMLElement | null) => {
  if (!tooltip) return;
  let clientX, clientY;
  if ('touches' in e) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = (e as React.MouseEvent).clientX;
    clientY = (e as React.MouseEvent).clientY;
  }
  
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

