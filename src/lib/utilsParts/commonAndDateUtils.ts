import { safeGetItemLocal } from "../storage";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { AppUser } from "../../types";

export const DELAY_AFTER_WRITE_MS = 2500; // Delay for Firestore consistency guard

export const ACTIVE_YEARS = ['2024', '2025', '2026', '2027', '2028', '2029', '2030'];
export const PRIMARY_ACTIVE_YEARS = ['2024', '2025', '2026', '2027'];
export const SECONDARY_ACTIVE_YEARS = ['2028', '2029', '2030'];
export const ARCHIVED_YEARS = ['2022', '2023'];

export function matchesAdvancedSearch(
  searchTerm: string,
  mainFields: (string | number | boolean | undefined | null)[],
  subFields: (string | number | boolean | undefined | null)[] = [],
  evaluateSubItems?: (term: string, andTerms: string[]) => boolean,
): boolean {
  if (!searchTerm) return true;
  const orGroups = searchTerm
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (orGroups.length === 0) return true;

  return orGroups.some((orGroup) => {
    const andTerms = orGroup
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean);
    if (andTerms.length === 0) return false;

    return andTerms.every((term) => {
      let isExact = false;
      let actualTerm = term;
      if (term.startsWith('"') && term.endsWith('"') && term.length >= 2) {
        isExact = true;
        actualTerm = term.slice(1, -1);
      }

      const inMain = mainFields.some((v) => {
        const val = String(v || "").toLowerCase();
        return isExact ? val === actualTerm : val.includes(actualTerm);
      });
      if (inMain) return true;
      if (subFields.length > 0) {
        const inSub = subFields.some((v) => {
          const val = String(v || "").toLowerCase();
          return isExact ? val === actualTerm : val.includes(actualTerm);
        });
        if (inSub) return true;
      }
      if (evaluateSubItems) {
        return evaluateSubItems(actualTerm, andTerms);
      }
      return false;
    });
  });
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return (
    "id_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).substring(2, 9)
  );
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeDashes(str: string | undefined | null): string {
  if (!str) return '';
  return String(str).replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
}

export function formatToDatetimeLocal(d: Date): string {
  if (!d || isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getDefaultDatetimeLocal(): string {
  const d = new Date();
  d.setHours(21, 0, 0, 0);
  return formatToDatetimeLocal(d);
}

export function getSuggestedCompletionTime(baseDate?: string | Date): string {
  const d = baseDate ? new Date(baseDate) : new Date();
  const currentHour = d.getHours();
  if (currentHour < 12) {
    d.setHours(9, 0, 0, 0);
  } else {
    d.setHours(21, 0, 0, 0);
  }
  return formatToDatetimeLocal(d);
}

const MAX_DATE_PARSE_CACHE = 4000;
const _dateTimeMsCache = new Map<string, number>();
const _dateMidnightMsCache = new Map<string, number>();

let _cachedTodayMidnightMs = 0;
let _cachedTodayCheckTs = 0;

export function getTodayMidnightMs(): number {
  const now = Date.now();
  if (now - _cachedTodayCheckTs < 30000 && _cachedTodayMidnightMs > 0) {
    return _cachedTodayMidnightMs;
  }
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  _cachedTodayMidnightMs = d.getTime();
  _cachedTodayCheckTs = now;
  return _cachedTodayMidnightMs;
}

export function parseDateTimeMs(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const cached = _dateTimeMsCache.get(dateStr);
  if (cached !== undefined) {
    return isNaN(cached) ? null : cached;
  }
  const d = dateStr.length === 10 ? new Date(dateStr + "T09:00") : new Date(dateStr);
  const ms = d.getTime();
  if (_dateTimeMsCache.size >= MAX_DATE_PARSE_CACHE) {
    _dateTimeMsCache.clear();
  }
  _dateTimeMsCache.set(dateStr, ms);
  return isNaN(ms) ? null : ms;
}

export function parseDateMidnightMs(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const cached = _dateMidnightMsCache.get(dateStr);
  if (cached !== undefined) {
    return isNaN(cached) ? null : cached;
  }
  const ms = parseDateTimeMs(dateStr);
  if (ms === null) {
    if (_dateMidnightMsCache.size >= MAX_DATE_PARSE_CACHE) {
      _dateMidnightMsCache.clear();
    }
    _dateMidnightMsCache.set(dateStr, NaN);
    return null;
  }
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const midMs = d.getTime();
  if (_dateMidnightMsCache.size >= MAX_DATE_PARSE_CACHE) {
    _dateMidnightMsCache.clear();
  }
  _dateMidnightMsCache.set(dateStr, midMs);
  return midMs;
}

export function parseDateTime(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const ms = parseDateTimeMs(dateStr);
  if (ms === null) return new Date(NaN);
  return new Date(ms);
}

export function calculateDays(
  start: string | undefined,
  finish: string | undefined,
): string {
  if (!start || !finish) return "";
  const sMs = parseDateTimeMs(start);
  const fMs = parseDateTimeMs(finish);
  if (sMs === null || fMs === null) return "";
  const diffTime = fMs - sMs;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return (diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0) + " days";
}

export const getUserAllowedStores = (
  currentUser: AppUser | null | undefined,
): string[] => {
  if (!currentUser || currentUser.role === "admin") return ["HCM", "HN"];

  const sp = currentUser.storePermissions;
  if (!sp || (sp.hcm === undefined && sp.hn === undefined)) {
    return ["HCM", "HN"];
  }

  const list: string[] = [];
  if (sp.hcm) list.push("HCM");
  if (sp.hn) list.push("HN");

  return list;
};

export const getEffectiveStoreFilter = (
  globalStoreFilter: string,
  currentUser: AppUser | null | undefined,
): string => {
  if (!currentUser || currentUser.role === "admin") return globalStoreFilter || "all";
  const allowed = getUserAllowedStores(currentUser);
  if (allowed.length === 1) {
    return allowed[0];
  }
  if (globalStoreFilter && globalStoreFilter !== "all" && !allowed.includes(globalStoreFilter)) {
    return allowed[0] || "all";
  }
  return globalStoreFilter || "all";
};

export const getDefaultStoreFilter = (
  currentUser: AppUser | null | undefined,
): string => {
  if (!currentUser) return "all";

  const allowed = getUserAllowedStores(currentUser);
  if (allowed.length === 1) return allowed[0];

  let savedHabit: string | null = null;
  try {
    savedHabit = safeGetItemLocal(`taka_store_filter_${currentUser.id}`);
  } catch (e) {
    console.warn("Could not read localStorage", e);
  }

  if (currentUser.role === "admin" || currentUser.locationPermissions?.['all'] || currentUser.partyPermissions?.['all']) return savedHabit || "all";

  if (savedHabit) {
    if (savedHabit.toUpperCase() === "HCM" && currentUser.storePermissions?.hcm)
      return "HCM";
    if (savedHabit.toUpperCase() === "HN" && currentUser.storePermissions?.hn)
      return "HN";
    if (
      savedHabit === "all" &&
      currentUser.storePermissions?.hcm &&
      currentUser.storePermissions?.hn
    )
      return "all";
  }

  if (currentUser.storePermissions?.hcm && currentUser.storePermissions?.hn)
    return "all";
  if (currentUser.storePermissions?.hcm) return "HCM";
  if (currentUser.storePermissions?.hn) return "HN";
  return "all";
};

const displayDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDisplayDateMain(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const d = parseDateTime(dateStr);
  if (!d || isNaN(d.getTime())) return dateStr || "";
  return displayDateFormatter.format(d);
}

export function ensureUrlProtocol(url: string | undefined): string {
  if (!url) return "#";
  const trimmedUrl = url.trim();
  if (trimmedUrl.match(/^[a-zA-Z]+:\/\//) || trimmedUrl.startsWith("mailto:")) {
    return trimmedUrl;
  }
  return `http://${trimmedUrl}`;
}

export function formatDisplayDateTime(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const d = parseDateTime(dateStr);
  if (!d || isNaN(d.getTime())) return dateStr || "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function parseCSVFull(text: string) {
  let result: string[][] = [];
  let row: string[] = [];
  let curVal = "";
  let inQuotes = false;

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  let firstLine = text.split("\n")[0] || "";
  let sep = ",";

  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (tabCount > commaCount && tabCount > semicolonCount) {
    sep = "\t";
  } else if (semicolonCount > commaCount) {
    sep = ";";
  }

  for (let i = 0; i < text.length; i++) {
    let char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          curVal += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        curVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === sep) {
        row.push(curVal.trim());
        curVal = "";
      } else if (char === "\n" || (char === "\r" && text[i + 1] === "\n")) {
        if (char === "\r") i++;
        row.push(curVal.trim());
        if (row.some((cell) => cell !== "")) result.push(row);
        row = [];
        curVal = "";
      } else {
        curVal += char;
      }
    }
  }
  if (curVal !== "" || row.length > 0) {
    row.push(curVal.trim());
    if (row.some((cell) => cell !== "")) result.push(row);
  }
  return { rows: result, separator: sep };
}

export function scrollToElement(el: HTMLElement) {
  if (!el) return;
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (typeof navigator !== "undefined" &&
      navigator.userAgent.includes("Mac") &&
      "ontouchend" in document);

  if (isIOS) {
    try {
      const rect = el.getBoundingClientRect();
      const st = window.pageYOffset || document.documentElement.scrollTop;

      let scrollParent = el.parentElement;
      let handledInnerScroll = false;

      while (
        scrollParent &&
        scrollParent !== document.body &&
        scrollParent !== document.documentElement
      ) {
        const style = window.getComputedStyle(scrollParent);
        if (
          (style.overflowY === "auto" ||
            style.overflowY === "scroll" ||
            style.overflow === "auto" ||
            style.overflow === "scroll") &&
          scrollParent.scrollHeight > scrollParent.clientHeight + 5
        ) {
          const parentRect = scrollParent.getBoundingClientRect();
          const childTargetY =
            rect.top -
            parentRect.top +
            scrollParent.scrollTop -
            scrollParent.clientHeight / 2 +
            rect.height / 2;
          scrollParent.scrollTop = childTargetY;
          handledInnerScroll = true;
          break;
        }
        scrollParent = scrollParent.parentElement;
      }

      if (!handledInnerScroll) {
        const targetY =
          rect.top + st - window.innerHeight / 2 + rect.height / 2;
        window.scrollTo(0, targetY);
      }
      return;
    } catch (e) {
      el.scrollIntoView(true);
      return;
    }
  }

  try {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) {
    el.scrollIntoView(true);
  }
}

export function formatCurrencyValue(val: number | undefined, currency: 'VND' | 'JPY' | 'USD', jpyRate: number, usdRate: number): string {
  if (val === null || val === undefined) return "-";
  let num = Number(val);
  if (currency === 'JPY') {
    num = (num / 10) / jpyRate;
  } else if (currency === 'USD') {
    num = (num * 1000) / usdRate;
  }
  return Math.round(num).toLocaleString("en-US");
}
