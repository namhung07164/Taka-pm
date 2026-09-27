import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "./storage";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  Project,
  Task,
  NotificationRule,
  ActiveNotification,
  DelegationGroup,
  AppUser,
} from "../types";

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

export function parseDateTime(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  if (dateStr.length === 10) return new Date(dateStr + "T09:00");
  return new Date(dateStr);
}

export function calculateDays(
  start: string | undefined,
  finish: string | undefined,
): string {
  if (!start || !finish) return "";
  const s = parseDateTime(start);
  const f = parseDateTime(finish);
  if (!s || !f) return "";
  const diffTime = f.getTime() - s.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return (diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0) + " days";
}

export const getUserAllowedStores = (
  currentUser: AppUser | null | undefined,
): string[] => {
  if (!currentUser || currentUser.role === "admin") return ["HCM", "HN"];

  // CP & Manager roles default to both stores unless explicitly disabled (set to false)
  if (currentUser.role === "CP" || currentUser.role === "Manager") {
    const list: string[] = [];
    if (currentUser.storePermissions?.hcm !== false) list.push("HCM");
    if (currentUser.storePermissions?.hn !== false) list.push("HN");
    return list.length > 0 ? list : ["HCM", "HN"];
  }

  const list: string[] = [];
  if (currentUser.storePermissions?.hcm) list.push("HCM");
  if (currentUser.storePermissions?.hn) list.push("HN");

  // Default to all stores if storePermissions is not explicitly configured
  if (list.length === 0 && (!currentUser.storePermissions || (currentUser.storePermissions.hcm === undefined && currentUser.storePermissions.hn === undefined))) {
    return ["HCM", "HN"];
  }

  return list.length > 0 ? list : ["HCM", "HN"];
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

export const resolveActualStatus = (plStatus: string, subTasks: any[]) => {
  if (!subTasks || subTasks.length === 0) {
    return {
      label: "Upcoming",
      color: "bg-slate-50 text-slate-600 border-slate-200",
    };
  }
  if (plStatus === "Canceled") {
    return {
      label: "Cancel",
      color: "bg-slate-400 text-white border-slate-500",
    };
  }

  const statuses = subTasks.map((st) =>
    (st.delegationStatus || st.status || "").toLowerCase(),
  );

  let T_group = "Assigned";
  if (statuses.some((s) => ["rejected", "needs rework"].includes(s))) {
    T_group = "Rejected";
  } else if (
    statuses.every((s) => ["completed", "approved"].includes(s) || s === "")
  ) {
    if (statuses.some((s) => s !== "")) {
      T_group = "Completed";
    }
  } else if (
    statuses.some((s) =>
      [
        "pending completed",
        "waiting for approval",
        "hold",
        "requested",
      ].includes(s),
    )
  ) {
    T_group = "Pending Completed";
  }

  const pLower = plStatus.toLowerCase();
  const P_group =
    pLower === "completed"
      ? "Completed"
      : pLower === "on process" || pLower === "handover"
        ? "On Process"
        : "Upcoming";

  if (P_group === "Upcoming" && T_group === "Assigned")
    return {
      label: "Planned",
      color: "bg-slate-200 text-slate-700 border-slate-300",
    };
  if (P_group === "On Process" && T_group === "Assigned")
    return {
      label: "In Progress",
      color: "bg-blue-100 text-blue-800 border-blue-300",
    };
  if (P_group === "On Process" && T_group === "Pending Completed")
    return {
      label: "Pending Approval",
      color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    };
  if (P_group === "Completed" && T_group === "Assigned")
    return {
      label: "Critical Delay",
      color: "bg-red-800 text-red-100 border-red-900",
    };
  if (P_group === "Completed" && T_group === "Pending Completed")
    return {
      label: "Review Late",
      color: "bg-orange-500 text-white border-orange-600",
    };
  if (P_group === "Completed" && T_group === "Rejected")
    return {
      label: "Correction Needed",
      color: "bg-red-500 text-white border-red-600",
    };
  if (T_group === "Completed")
    return {
      label: "Completed",
      color:
        "bg-emerald-50 dark:bg-[#28282a] text-emerald-600 dark:text-[#81c995] border-emerald-200",
    };

  if (T_group === "Rejected")
    return {
      label: "Correction Needed",
      color: "bg-red-500 text-white border-red-600",
    };
  if (T_group === "Pending Completed")
    return {
      label: "Pending Approval",
      color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    };

  return {
    label: "In Progress",
    color: "bg-blue-100 text-blue-800 border-blue-300",
  };
};

export function getStatus(
  start: string | undefined,
  handover: string | undefined,
  opening: string | undefined,
  code: string = "",
) {
  if (code && String(code).toLowerCase().includes("cancel")) return "Canceled";
  if (!start) return "Upcoming";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dStart = parseDateTime(start);
  if (!dStart) return "Upcoming";
  dStart.setHours(0, 0, 0, 0);

  const dHandover = handover ? parseDateTime(handover) : null;
  if (dHandover) dHandover.setHours(0, 0, 0, 0);

  const dOpening = opening ? parseDateTime(opening) : null;
  if (dOpening) dOpening.setHours(0, 0, 0, 0);

  const dEnd =
    dOpening && dHandover
      ? dOpening > dHandover
        ? dOpening
        : dHandover
      : dOpening || dHandover;

  if (today < dStart) return "Upcoming";
  if (dEnd && today > dEnd) return "Completed";

  if (dHandover && dOpening && today >= dHandover && today <= dOpening)
    return "Handover";

  return "On process";
}

/**
 * Strips common floor/zone prefixes like 'L1-', 'F1-', '1F-', 'B1-', 'GF-', 'UG-', 'Unit '
 */
function normalizeUnitCodeBase(code: string): string {
  if (!code) return '';
  let str = code.toLowerCase().trim();
  // Remove leading 'unit ' or 'shop ' or 'lot ' or 'booth '
  str = str.replace(/^(unit|shop|lot|booth|kiosk|store)\s*[-_:]?\s*/i, '');
  // Remove floor prefixes like l1-, l2-, f1-, 1f-, 2f-, b1-, b2-, gf-, ug-
  str = str.replace(/^([a-z]?\d+[a-z]?|gf|ug|mz|basement|ground)\s*[-_:]\s*/i, '');
  return str.trim();
}

/**
 * Extracts all project codes from both project.code and project.linkCodes
 */
export function extractAllProjectCodes(p: { code?: string | null; linkCodes?: string | null }): string[] {
  const codeSet = new Set<string>();
  if (p.code && String(p.code).trim()) {
    codeSet.add(String(p.code).trim().toLowerCase());
  }
  if (p.linkCodes && String(p.linkCodes).trim()) {
    String(p.linkCodes)
      .split(/[\r\n\t,;+/&|]+|\s{2,}/)
      .map(c => c.trim().toLowerCase())
      .filter(Boolean)
      .forEach(c => {
        codeSet.add(c);
        // Also add space-separated sub-codes if present
        const spaceSub = c.split(/\s+/).map(s => s.trim()).filter(Boolean);
        if (spaceSub.length > 1) {
          spaceSub.forEach(s => codeSet.add(s));
        }
      });
  }
  return Array.from(codeSet);
}

/**
 * Checks if a project's codes match a given unit name (exact, stripped prefix, or subdiv/lot prefix)
 */
export function projectMatchesUnitCode(pCodes: string[], unitName: string): boolean {
  const u = (unitName || '').toLowerCase().trim();
  if (!u) return false;
  const uStripped = normalizeUnitCodeBase(u);

  for (const rawCode of pCodes) {
    const c = (rawCode || '').toLowerCase().trim();
    if (!c) continue;

    // 1. Exact match
    if (u === c) return true;

    // 2. Sub-lot prefix match (e.g. '101-A' matching '101' or 'L1-01_sub' matching 'L1-01')
    if (u.startsWith(c + '-') || u.startsWith(c + '_') || u.startsWith(c + ' ')) return true;
    if (c.startsWith(u + '-') || c.startsWith(u + '_') || c.startsWith(u + ' ')) return true;

    // 3. Base code match after stripping floor prefixes (e.g. 'L1-01' matching '01' or 'F1-102' matching 'L1-102')
    const cStripped = normalizeUnitCodeBase(c);
    if (uStripped && cStripped && uStripped === cStripped) return true;
    if (uStripped && cStripped) {
      if (uStripped.startsWith(cStripped + '-') || uStripped.startsWith(cStripped + '_')) return true;
      if (cStripped.startsWith(uStripped + '-') || cStripped.startsWith(uStripped + '_')) return true;
    }

    // 4. Pure number match (e.g. unit '101' matching '101' inside 'L1-101')
    const uNum = u.match(/\d+/)?.[0];
    const cNum = c.match(/\d+/)?.[0];
    if (uNum && cNum && uNum === cNum && uNum.length >= 2) {
      // If stripped text also aligns or numbers are unique
      if (u === `l1-${c}` || u === `l2-${c}` || u === `l3-${c}` || u === `l4-${c}` || u === `l5-${c}` || u === `b1-${c}` || u === `b2-${c}`) {
        return true;
      }
      if (c === `l1-${u}` || c === `l2-${u}` || c === `l3-${u}` || c === `l4-${u}` || c === `l5-${u}` || c === `b1-${u}` || c === `b2-${u}`) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Removes a specific unit code from a linkCodes string.
 * Example: removeCodeFromLinkCodesString("101, 102, 103", "102") -> "101, 103"
 */
export function removeCodeFromLinkCodesString(linkCodesStr: string | null | undefined, codeToRemove: string): string {
  if (!linkCodesStr) return '';
  const target = codeToRemove.trim().toLowerCase();
  if (!target) return linkCodesStr;
  const parts = String(linkCodesStr)
    .split(/[\r\n\t,;+/&|]+|\s{2,}/)
    .map(c => c.trim())
    .filter(Boolean);
  const filtered = parts.filter(c => c.toLowerCase() !== target);
  return filtered.join(', ');
}


export function getTaskStatus(
  start: string | undefined,
  finish: string | undefined,
): string {
  if (!start && !finish) return "Upcoming";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dStart = parseDateTime(start);
  if (dStart) dStart.setHours(0, 0, 0, 0);

  const dFinish = parseDateTime(finish);
  if (dFinish) dFinish.setHours(0, 0, 0, 0);

  if (dStart && today < dStart) return "Upcoming";
  if (dFinish && today > dFinish) return "Completed";

  return "On process";
}

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

export function matchProjectCode(codeA?: string, codeB?: string): boolean {
  if (!codeA || !codeB) return false;
  const a = String(codeA).trim().toLowerCase();
  const b = String(codeB).trim().toLowerCase();
  if (a === b) return true;
  const partsA = a.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  const partsB = b.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  return partsA.some(pa => partsB.includes(pa));
}

export function getTasksForProject(project: Partial<Project>, allTasks: Task[]): Task[] {
  if (!project.code || !allTasks || allTasks.length === 0) return [];
  const pYear = project.year !== undefined && project.year !== null ? String(project.year).trim() : '';
  const pStore = project.store ? String(project.store).trim().toLowerCase() : '';
  const rawPCode = String(project.code).trim().toLowerCase();
  const pCodeParts = rawPCode.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);

  return allTasks.filter(t => {
    if (!t.projectCode) return false;
    const tCode = String(t.projectCode).trim().toLowerCase();
    const matchesCode = tCode === rawPCode || pCodeParts.includes(tCode) || matchProjectCode(t.projectCode, project.code);
    if (!matchesCode) return false;

    const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
    if (pStore && tStore && pStore !== tStore) return false;

    const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
    if (pYear && tYear && pYear !== tYear) return false;

    return true;
  });
}

export function computeProjectActStatus(
  p: Project,
  delegationGroups: DelegationGroup[] = [],
  matchedTasks: Task[] = []
): string {
  if ((p as any).actStatus) return String((p as any).actStatus);
  if ((p as any).actualStatus) return String((p as any).actualStatus);

  if (delegationGroups && delegationGroups.length > 0) {
    const pCode = String(p.code || '').trim().toLowerCase();
    const matchedTaskIds = new Set(matchedTasks.map(t => t.id).filter(Boolean));
    const pGroups = delegationGroups.filter(g => {
      if (g.projectCode && String(g.projectCode).trim().toLowerCase() === pCode) return true;
      if (g.parentTaskId && matchedTaskIds.has(g.parentTaskId)) return true;
      return false;
    });

    if (pGroups.length > 0) {
      const statuses = pGroups.map(g => {
        if (g.actStatus) return g.actStatus;
        return resolveActualStatus(p.computedStatus || 'On process', g.subTasks || []).label;
      });
      if (statuses.some(s => s === 'Rejected')) return 'Rejected';
      if (statuses.every(s => s === 'Completed')) return 'Completed';
      if (statuses.some(s => s === 'Pending Completed')) return 'Pending Completed';
      if (statuses.some(s => s === 'In Progress' || s === 'On Process')) return 'In Progress';
      return statuses[0] || 'Planned';
    }
  }

  if (p.computedActProgress === 100) return 'Completed';
  const plStatus = p.computedStatus || getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
  if (plStatus === 'Completed') return 'Completed';
  if (plStatus === 'Canceled') return 'Cancel';
  if (p.computedActProgress && p.computedActProgress > 0) return 'In Progress';
  if (plStatus === 'On process' || plStatus === 'Handover') return 'In Progress';
  return 'Planned';
}

// Module-level cache for zero-cost multi-component calls to enrichProjects
let _lastProjectsRef: Project[] | null = null;
let _lastTasksRef: Task[] | null = null;
let _lastDelegationRef: DelegationGroup[] | null = null;
let _lastEnrichedResult: Project[] | null = null;

export function enrichProjects(
  projects: Project[], 
  tasks: Task[], 
  delegationGroups: DelegationGroup[] = []
): Project[] {
  if (
    _lastProjectsRef === projects &&
    _lastTasksRef === tasks &&
    _lastDelegationRef === delegationGroups &&
    _lastEnrichedResult
  ) {
    return _lastEnrichedResult;
  }

  const tasksByFullKey = new Map<string, Task[]>();
  const tasksByCodeOnly = new Map<string, Task[]>();

  tasks.forEach(t => {
    if (!t.projectCode) return;
    const tCode = String(t.projectCode).trim().toLowerCase();
    const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : "";
    const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : "";

    const tCodeParts = tCode.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
    const codesToIndex = tCodeParts.length > 0 ? tCodeParts : [tCode];

    codesToIndex.forEach(code => {
      // 1. Full key
      const fullKey = `${code}-${tYear}-${tStore}`;
      let fullList = tasksByFullKey.get(fullKey);
      if (!fullList) {
        fullList = [];
        tasksByFullKey.set(fullKey, fullList);
      }
      fullList.push(t);

      // 2. Code only fallback
      let codeList = tasksByCodeOnly.get(code);
      if (!codeList) {
        codeList = [];
        tasksByCodeOnly.set(code, codeList);
      }
      codeList.push(t);
    });
  });

  const enrichedProjects = projects.map((p) => {
    const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : "";
    const pStore = p.store ? String(p.store).trim().toLowerCase() : "";
    const pCode = String(p.code || "").trim().toLowerCase();
    const rawCodeCombined = (p.linkCodes && p.linkCodes.trim()) ? `${pCode}, ${p.linkCodes.toLowerCase()}` : pCode;
    const pCodeParts = rawCodeCombined.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);

    const matchedTaskMap = new Map<string, Task>();

    // Check direct key and part keys
    const directKey = `${pCode}-${pYear}-${pStore}`;
    const directTasks = tasksByFullKey.get(directKey);
    if (directTasks) {
      for (let i = 0; i < directTasks.length; i++) {
        matchedTaskMap.set(directTasks[i].id, directTasks[i]);
      }
    }

    for (let i = 0; i < pCodeParts.length; i++) {
      const partKey = `${pCodeParts[i]}-${pYear}-${pStore}`;
      const subTasks = tasksByFullKey.get(partKey);
      if (subTasks) {
        for (let j = 0; j < subTasks.length; j++) {
          matchedTaskMap.set(subTasks[j].id, subTasks[j]);
        }
      }
    }

    // Fast fallback to code-only if no exact store/year match
    if (matchedTaskMap.size === 0 && tasks.length > 0) {
      for (let i = 0; i < pCodeParts.length; i++) {
        const fallbackTasks = tasksByCodeOnly.get(pCodeParts[i]);
        if (fallbackTasks) {
          for (let j = 0; j < fallbackTasks.length; j++) {
            const t = fallbackTasks[j];
            const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
            if (pStore && tStore && pStore !== tStore) continue;
            const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
            if (pYear && tYear && pYear !== tYear) continue;
            matchedTaskMap.set(t.id, t);
          }
        }
      }
    }

    const projectTasks = Array.from(matchedTaskMap.values());

    const taskSummaries = projectTasks.length > 0
      ? projectTasks.filter(t => t.start && t.finish && t.name).map(t => ({
          name: t.name!,
          start: t.start!,
          finish: t.finish!
        }))
      : (p.taskSummaries || []);

    let computedTakStart = p.computedTakStart || p.start;
    let computedTakCompl: string | undefined = p.computedTakCompl || p.handover || (p as any).takCompl || undefined;
    let computedOpening = p.computedOpening || p.opening;

    if (projectTasks.length > 0) {
      for (let i = 0; i < projectTasks.length; i++) {
        const t = projectTasks[i];
        if (t.start && (!computedTakStart || t.start < computedTakStart)) {
          computedTakStart = t.start;
        }
        if (t.finish && (!computedTakCompl || t.finish > computedTakCompl)) {
          computedTakCompl = t.finish;
        }
        const name = t.name ? String(t.name).toLowerCase() : "";
        if ((name.includes("opening") || name.includes("open")) && t.finish && (!computedOpening || t.finish > computedOpening)) {
          computedOpening = t.finish;
        }
      }
    } else if (taskSummaries.length > 0) {
      for (let i = 0; i < taskSummaries.length; i++) {
        const ts = taskSummaries[i];
        if (ts.start && !computedTakStart) {
          computedTakStart = ts.start;
        } else if (ts.start && computedTakStart && ts.start < computedTakStart) {
          computedTakStart = ts.start;
        }
        if (ts.finish && !computedTakCompl) {
          computedTakCompl = ts.finish;
        } else if (ts.finish && computedTakCompl && ts.finish > computedTakCompl) {
          computedTakCompl = ts.finish;
        }
        const name = ts.name ? String(ts.name).toLowerCase() : "";
        if ((name.includes("opening") || name.includes("open")) && ts.finish && (!computedOpening || ts.finish > computedOpening)) {
          computedOpening = ts.finish;
        }
      }
    }

    const planProgressPercent = projectTasks.length > 0 
      ? computePlanProgressPercent(projectTasks)
      : (p.computedPlanProgress ?? 0);

    const actProgressPercent = projectTasks.length > 0
      ? computeActProgressPercent(projectTasks, delegationGroups)
      : (p.computedActProgress ?? 0);

    const taskCount = projectTasks.length > 0
      ? projectTasks.length
      : (p.taskCount ?? (p.taskSummaries?.length || 0));

    const status = getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
    const actStatus = computeProjectActStatus(
      { ...p, computedStatus: status, computedActProgress: actProgressPercent },
      delegationGroups,
      projectTasks
    );

    return {
      ...p,
      computedTakStart,
      computedTakCompl,
      computedOpening,
      computedPlanProgress: planProgressPercent,
      computedActProgress: actProgressPercent,
      computedStatus: status,
      computedActStatus: actStatus,
      taskSummaries,
      taskCount,
    };
  });

  const statusPriority: Record<string, number> = {
    'On process': 1,
    'Handover': 2,
    'Upcoming': 3,
    'Completed': 4,
    'Canceled': 5
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  return enrichedProjects.sort((a, b) => {
    const statusA = a.computedStatus || 'Upcoming';
    const statusB = b.computedStatus || 'Upcoming';

    const priorityA = statusPriority[statusA] || 99;
    const priorityB = statusPriority[statusB] || 99;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    if (statusA === 'On process') {
      const finishA = parseDateTime(a.computedTakCompl || a.computedOpening || a.opening || '9999-12-31');
      const finishB = parseDateTime(b.computedTakCompl || b.computedOpening || b.opening || '9999-12-31');
      if (finishA && finishB) {
        const diffA = Math.abs(finishA.getTime() - todayTime);
        const diffB = Math.abs(finishB.getTime() - todayTime);
        if (diffA !== diffB) {
          return diffA - diffB;
        }
      }
    }

    const startA = a.computedTakStart || '9999-12-31';
    const startB = b.computedTakStart || '9999-12-31';

    if (startA < startB) return -1;
    if (startA > startB) return 1;

    return String(a.code || '').localeCompare(String(b.code || '')) || String(a.year || '').localeCompare(String(b.year || ''));
  });

  _lastProjectsRef = projects;
  _lastTasksRef = tasks;
  _lastDelegationRef = delegationGroups;
  _lastEnrichedResult = enrichedProjects;

  return enrichedProjects;
}

export function calculateActiveNotifications(
  projects: Project[],
  tasks: Task[],
  rules: NotificationRule[],
  delegationGroups: DelegationGroup[] = [],
  currentUserId?: string,
  currentUserUsername?: string,
): ActiveNotification[] {
  const now = new Date();
  const fieldLabels: Record<string, string> = {
    start: "Start",
    handover: "Pj Compl",
    opening: "Opening",
    finish: "Finish",
    flow_status: "Flow Status Update",
    mention: "@mention",
    delegation_party: "@delegation party",
  };

  const notifications: ActiveNotification[] = [];

  const currentActualYear = now.getFullYear();

  // Generate notifications for Cross-Year Rollover
  tasks.forEach((task) => {
    if (task.runningStatus !== 'Completed' && task.projectYear && Number(task.projectYear) < currentActualYear) {
      const project = projects.find(
        (p) =>
          p.code === task.projectCode &&
          (String(p.year || "") === String(task.projectYear || "") ||
            (!p.year && !task.projectYear)) &&
          (String(p.store || "") === String(task.projectStore || "") ||
            (!p.store && !task.projectStore)),
      );
      const subtitleStr = project
        ? `${task.projectCode} - ${project.name} - ${task.name}`
        : `${task.projectCode || ""} ${task.name}`.trim();

      notifications.push({
        id: `rollover_task_${task.id}`,
        title: "Cross-Year Task Rollover",
        subtitle: subtitleStr,
        message: `Task from ${task.projectYear} is still pending. Would you like to roll it over to ${currentActualYear}?`,
        dateStr: now.toISOString(),
        diffMs: 0,
        generatedAt: now.getTime(),
        targetType: "task",
        targetId: task.id,
        projectCode: task.projectCode,
        projectStore: task.projectStore || project?.store || "",
        projectYear: task.projectYear || project?.year || "",
        action: 'cross_year_rollover',
        actionData: { taskId: task.id, newYear: currentActualYear }
      });
    }
  });

  // Generate notifications for @mentions
  if (currentUserId) {
    tasks.forEach((task) => {
      const project = projects.find(
        (p) =>
          p.code === task.projectCode &&
          (String(p.year || "") === String(task.projectYear || "") ||
            (!p.year && !task.projectYear)) &&
          (String(p.store || "") === String(task.projectStore || "") ||
            (!p.store && !task.projectStore)),
      );
      if (task.comments && task.comments.length > 0) {
        task.comments.forEach((comment) => {
          if (
            comment.mentions &&
            comment.mentions.includes(currentUserId)
          ) {
            const commentTime = new Date(comment.createdAt).getTime();
            const diffMs = commentTime - now.getTime(); // it will be negative
            // Only show mentions from the last 30 days
            if (diffMs >= -30 * 24 * 60 * 60 * 1000) {
              const subtitleStr = project
                ? `${task.projectCode} - ${project.name} - ${task.name}`
                : `${task.projectCode || ""} ${task.name}`.trim();
              notifications.push({
                id: `mention_${comment.id}`,
                title: "You were mentioned in a task",
                subtitle: subtitleStr,
                message: `"${comment.text}"`,
                dateStr: comment.createdAt,
                diffMs,
                generatedAt: commentTime,
                targetType: "task",
                targetId: task.id,
                projectCode: task.projectCode,
                projectStore: task.projectStore || project?.store || "",
                projectYear: task.projectYear || project?.year || "",
              });
            }
          }
        });
      }
    });

    projects.forEach((project) => {
      if (project.comments && project.comments.length > 0) {
        project.comments.forEach((comment) => {
          if (
            comment.mentions &&
            comment.mentions.includes(currentUserId)
          ) {
            const commentTime = new Date(comment.createdAt).getTime();
            const diffMs = commentTime - now.getTime(); // it will be negative
            // Only show mentions from the last 30 days
            if (diffMs >= -30 * 24 * 60 * 60 * 1000) {
              const subtitleStr = `${project.code} - ${project.name}`;
              notifications.push({
                id: `mention_proj_${comment.id}`,
                title: "You were mentioned in a project",
                subtitle: subtitleStr,
                message: `"${comment.text}"`,
                dateStr: comment.createdAt,
                diffMs,
                generatedAt: commentTime,
                targetType: "project",
                targetId: project.id || project.no,
                projectCode: project.code,
                projectStore: project.store || "",
                projectYear: project.year || "",
              });
            }
          }
        });
      }
    });
  }

  rules.forEach((rule) => {
    if (rule.target === "task_delegation") {
      delegationGroups.forEach((group) => {
        if (!group.updatedAt) return;
        const targetDate = new Date(group.updatedAt);
        if (isNaN(targetDate.getTime())) return;

        let shouldTrigger = false;
        let flowStatus = "";
        let party = "";
        let taskId = group.parentTaskId || group.id;

        let subTaskName = "";
        if (rule.field === "flow_status") {
          // Check subTasks
          if (group.subTasks && group.subTasks.length > 0) {
            let recentSt = group.subTasks[0];
            group.subTasks.forEach((st) => {
              if (
                st.updatedAt &&
                recentSt.updatedAt &&
                new Date(st.updatedAt).getTime() >
                  new Date(recentSt.updatedAt).getTime()
              ) {
                recentSt = st;
              } else if (st.updatedAt && !recentSt.updatedAt) {
                recentSt = st;
              }
            });
            party = recentSt.party || "N/A";
            subTaskName = recentSt.name || "";
            flowStatus =
              recentSt.delegationStatus || recentSt.status || "Assigned";
            shouldTrigger = true;
          }
        } else if (rule.field === "mention" && currentUserUsername) {
          if (group.subTasks && group.subTasks.length > 0) {
            let recentSt = group.subTasks[0];
            group.subTasks.forEach((st) => {
              if (
                st.updatedAt &&
                recentSt.updatedAt &&
                new Date(st.updatedAt).getTime() >
                  new Date(recentSt.updatedAt).getTime()
              ) {
                recentSt = st;
              }
            });

            if (
              recentSt.comments &&
              recentSt.comments.includes(`@${currentUserUsername}`)
            ) {
              party = recentSt.party || "N/A";
              subTaskName = recentSt.name || "";
              flowStatus =
                recentSt.delegationStatus || recentSt.status || "Assigned";
              shouldTrigger = true;
            }
          }
        } else if (rule.field === "delegation_party") {
          if (group.subTasks && group.subTasks.length > 0) {
            let recentSt = group.subTasks[0];
            group.subTasks.forEach((st) => {
              if (
                st.updatedAt &&
                recentSt.updatedAt &&
                new Date(st.updatedAt).getTime() >
                  new Date(recentSt.updatedAt).getTime()
              ) {
                recentSt = st;
              }
            });

            if (
              recentSt.comments &&
              (recentSt.comments.includes("@delegation party") ||
                recentSt.comments.includes("@Delegation party") ||
                (recentSt.party &&
                  recentSt.comments.includes(`@${recentSt.party}`)))
            ) {
              party = recentSt.party || "N/A";
              subTaskName = recentSt.name || "";
              flowStatus =
                recentSt.delegationStatus || recentSt.status || "Assigned";
              shouldTrigger = true;
            }
          }
        }

        if (shouldTrigger) {
          const diffMs = targetDate.getTime() - now.getTime();
          const thresholdMs =
            ((rule.daysBefore || 0) * 24 + (rule.hoursBefore || 0)) *
            60 *
            60 *
            1000;

          if (diffMs <= thresholdMs && diffMs >= -30 * 24 * 60 * 60 * 1000) {
            let projectName = group.name || "Custom Task";
            const isLinked = !!group.parentTaskId || !!group.projectCode;

            let parentTask: Task | null = null;
            let parentProject: Project | undefined = undefined;
            let ps = group.projectStore;
            let py = group.projectYear;

            if (isLinked) {
              parentTask = group.parentTaskId
                ? tasks.find((t) => t.id === group.parentTaskId) || null
                : null;

              if (!ps && parentTask?.projectStore) ps = parentTask.projectStore;
              if (!py && parentTask?.projectYear) py = parentTask.projectYear;

              parentProject = projects.find(
                (p) =>
                  ((group.parentTaskId && p.code === group.parentTaskId) ||
                    (group.projectCode && p.code === group.projectCode) ||
                    (parentTask && p.code === parentTask.projectCode)) &&
                  (ps ? String(p.store) === String(ps) : true) &&
                  (py ? String(p.year) === String(py) : true),
              );

              if (parentTask) {
                projectName = `${parentTask.name}${parentProject?.name ? ` - ${parentProject.name}` : ""}`;
              } else if (parentProject) {
                projectName = parentProject.name || group.name;
              }
            }

            let displayTaskName = subTaskName || group.name || "task";

            notifications.push({
              id: `${rule.id}_${ps || 'store'}_${group.id}_${targetDate.getTime()}`,
              title: projectName,
              subtitle: `Party: ${party} | Status: ${flowStatus}`,
              message: `Delegation task: ${displayTaskName}, status: ${flowStatus.toLowerCase()}.`,
              dateStr: formatDisplayDateTime(group.updatedAt),
              diffMs: diffMs,
              generatedAt: targetDate.getTime() - thresholdMs,
              targetType: "task_delegation",
              targetId: group.id,
              projectCode: group.projectCode || parentTask?.projectCode || parentProject?.code || "",
              projectStore: ps || parentProject?.store || "",
              projectYear: py || parentProject?.year || "",
            });
          }
        }
      });
      return; // Skip normal project/task processing for task_delegation
    }

    const targetList = rule.target === "project" ? projects : tasks;

    targetList.forEach((item) => {
      // For projects, we use computed fields if the rule is for 'start' or 'handover'
      let dateVal = (item as any)[rule.field];
      if (rule.target === "project") {
        const p = item as Project;
        if (rule.field === "start") dateVal = p.computedTakStart || p.start;
        if (rule.field === "handover") dateVal = p.computedTakCompl; // Chỉ lấy từ task con
        if (rule.field === "opening") dateVal = p.computedOpening || p.opening;
      }

      if (dateVal) {
        const targetDate = parseDateTime(dateVal);
        if (targetDate && !isNaN(targetDate.getTime())) {
          const diffMs = targetDate.getTime() - now.getTime();
          const thresholdMs =
            ((rule.daysBefore || 0) * 24 + (rule.hoursBefore || 0)) *
            60 *
            60 *
            1000;

          if (diffMs <= thresholdMs && diffMs >= -30 * 24 * 60 * 60 * 1000) {
            let title = "";
            let subtitle = "";
            let notificationBody = "";

            const isOverdue = diffMs < 0;
            const diffHrsTotal = Math.abs(
              Math.floor(diffMs / (1000 * 60 * 60)),
            );
            const d = Math.floor(diffHrsTotal / 24);
            const h = diffHrsTotal % 24;

            let timeMsg = "";
            if (d === 0 && h === 0)
              timeMsg = isOverdue
                ? "Overdue (under 1 hour)"
                : "Due soon (under 1 hour)";
            else
              timeMsg = isOverdue
                ? `overdue by ${d > 0 ? d + " days " : ""}${h > 0 ? h + " hours" : ""}`
                : `in ${d > 0 ? d + " days " : ""}${h > 0 ? h + " hours" : ""}`;

            const fName = fieldLabels[rule.field] || rule.field;

            let notifId = `${rule.id}_${(item as any).id || (item as any).no}`;
            let itemProjectCode = (item as any).code || (item as any).projectCode || "";
            let itemProjectStore = (item as any).store || (item as any).projectStore || "";
            let itemProjectYear = (item as any).year || (item as any).projectYear || "";

            if (rule.target === "project") {
              const p = item as Project;
              title = `${p.code} - ${p.name || "N/A"}`;
              subtitle = p.name || "N/A";
              notificationBody = `${fName} deadline ${timeMsg}`;
              itemProjectCode = p.code || "";
              itemProjectStore = p.store || "";
              itemProjectYear = p.year || "";
              notifId = `${rule.id}_${p.id || p.no}`;
            } else {
              const t = item as Task;
              let projName = "N/A";
              const tStore = t.projectStore ? String(t.projectStore).trim().toUpperCase() : "";
              const tYear = t.projectYear ? String(t.projectYear).trim() : "";

              // Locate parent project taking STORE and YEAR into account!
              const p = projects.find((proj) =>
                proj.code === t.projectCode &&
                (tStore ? String(proj.store || "").trim().toUpperCase() === tStore : true) &&
                (tYear ? String(proj.year || "").trim() === tYear : true)
              ) || projects.find((proj) =>
                proj.code === t.projectCode &&
                (tStore ? String(proj.store || "").trim().toUpperCase() === tStore : true)
              ) || projects.find((proj) => proj.code === t.projectCode);

              if (p && p.name) projName = p.name;

              title = `${t.projectCode} - ${projName} - ${t.name || "N/A"}`;
              subtitle = `Project ${t.projectCode} | Party: ${t.party || "N/A"}`;
              const pParty = t.party ? ` by ${t.party}` : "";
              notificationBody = `${fName} deadline ${timeMsg}${pParty}`;

              itemProjectCode = t.projectCode || "";
              itemProjectStore = t.projectStore || p?.store || "";
              itemProjectYear = t.projectYear || p?.year || "";
              notifId = `${rule.id}_${t.id}`;
            }

            notifications.push({
              id: notifId,
              title: title,
              subtitle: subtitle,
              message: notificationBody,
              dateStr: formatDisplayDateTime(dateVal),
              diffMs: diffMs,
              generatedAt: targetDate.getTime() - thresholdMs,
              targetType: rule.target as any,
              targetId:
                rule.target === "project"
                  ? ((item as Project).id || (item as Project).no)
                  : (item as Task).id,
              projectCode: itemProjectCode,
              projectStore: itemProjectStore,
              projectYear: itemProjectYear,
            });
          }
        }
      }
    });
  });

  // Smart Grouping / Batching: Group task deadline notifications by project to avoid notification fatigue
  const batchedNotifications: ActiveNotification[] = [];
  const taskNotifsByProject = new Map<string, ActiveNotification[]>();
  const nonBatchedNotifs: ActiveNotification[] = [];

  notifications.forEach((notif) => {
    if (notif.targetType === "task" && !notif.id.startsWith("mention_")) {
      const pCode = notif.projectCode || (notif.title.split(" - ")[0] || "").trim();
      const pStore = notif.projectStore || "";
      const pYear = notif.projectYear || "";
      const groupKey = `${pCode}_${pStore}_${pYear}`;
      if (!taskNotifsByProject.has(groupKey)) {
        taskNotifsByProject.set(groupKey, []);
      }
      taskNotifsByProject.get(groupKey)!.push(notif);
    } else {
      nonBatchedNotifs.push(notif);
    }
  });

  taskNotifsByProject.forEach((items, groupKey) => {
    if (items.length > 1) {
      const first = items[0];
      const pCode = first.projectCode || groupKey.split("_")[0];
      const pStore = first.projectStore || groupKey.split("_")[1] || "";
      const pYear = first.projectYear || groupKey.split("_")[2] || "";
      const project = projects.find(
        (p) =>
          p.code === pCode &&
          (pStore ? String(p.store || "").toUpperCase() === String(pStore).toUpperCase() : true) &&
          (pYear ? String(p.year || "") === String(pYear) : true),
      );
      const projName = project?.name || (first.title.split(" - ")[1] || "").trim() || "Project";

      const urgentDiff = Math.min(...items.map((i) => i.diffMs));
      const latestGen = Math.max(...items.map((i) => i.generatedAt));
      const earliestDateStr = items[0].dateStr;

      const summaryList = items.map((i) => {
        const parts = i.title.split(" - ");
        const taskPart = parts.length >= 3 ? parts.slice(2).join(" - ") : i.title;
        return `• <strong>${taskPart}</strong>: ${i.message}`;
      });

      const messagePreview =
        `Gom nhóm <strong>${items.length} công việc</strong> cần chú ý:<br/>` +
        summaryList.slice(0, 3).join("<br/>") +
        (items.length > 3 ? `<br/><em>...và thêm ${items.length - 3} công việc khác</em>` : "");

      batchedNotifications.push({
        id: `batch_task_${groupKey}_${items.length}`,
        title: `${pCode} - ${projName}`,
        subtitle: `Store: ${pStore || "ALL"} • Year: ${pYear || "ALL"} | ${items.length} tasks`,
        message: messagePreview,
        dateStr: earliestDateStr,
        diffMs: urgentDiff,
        generatedAt: latestGen,
        targetType: "project",
        targetId: project ? (project.id || project.no) : pCode,
        count: items.length,
        projectCode: pCode,
        projectStore: pStore,
        projectYear: pYear,
      });
    } else {
      batchedNotifications.push(items[0]);
    }
  });

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return [...nonBatchedNotifs, ...batchedNotifications]
    .filter((n) => now.getTime() - n.generatedAt <= thirtyDaysMs)
    .sort((a, b) => b.generatedAt - a.generatedAt);
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

export function computePlanProgressPercent(groupTasks: Task[]): number {
  if (groupTasks.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  let totalScore = 0;

  for (const t of groupTasks) {
    if (!t.start && !t.finish) continue;
    
    const start = parseDateTime(t.start);
    if (start) start.setHours(0, 0, 0, 0);
    const finish = parseDateTime(t.finish);
    if (finish) finish.setHours(0, 0, 0, 0);

    if (finish && todayTime > finish.getTime()) {
      totalScore += 1;
    } else if (start && finish && todayTime >= start.getTime() && todayTime <= finish.getTime()) {
      const totalDuration = finish.getTime() - start.getTime();
      if (totalDuration > 0) {
        const passed = todayTime - start.getTime();
        totalScore += passed / totalDuration;
      } else {
        totalScore += 1; // Start and finish on the same day
      }
    }
  }
  
  return Math.round((totalScore / groupTasks.length) * 100);
}

export function computeActProgressPercent(
  groupTasks: Task[],
  delegationGroups: DelegationGroup[] | Map<string, DelegationGroup>,
): number {
  if (groupTasks.length === 0) return 0;

  const getGroup = (tid: string | undefined) => {
    if (!tid) return undefined;
    if (delegationGroups instanceof Map) return delegationGroups.get(tid);
    return delegationGroups.find((g) => g.parentTaskId === tid);
  };

  const completedTasksACT = groupTasks.filter((t) => {
    const delegationGroup = getGroup(t.id);
    const plStatus = getTaskStatus(t.start, t.finish);
    const actStatus = resolveActualStatus(
      plStatus,
      delegationGroup?.subTasks || [],
    );
    return actStatus.label === "Completed";
  });

  const maxCompletedStartTs = Math.max(
    0,
    ...completedTasksACT.map((ct) => parseDateTime(ct.start)?.getTime() || 0),
  );

  const actProgressScore = groupTasks.reduce((acc, t) => {
    const delegationGroup = getGroup(t.id);
    const plStatus = getTaskStatus(t.start, t.finish);
    const actStatus = resolveActualStatus(
      plStatus,
      delegationGroup?.subTasks || [],
    );
    const isCompletedDirectly = actStatus.label === "Completed";

    let score = 0;
    if (isCompletedDirectly) {
      score = 1;
    } else {
      const tFinishTs = parseDateTime(t.finish)?.getTime() || 0;
      if (
        tFinishTs > 0 &&
        tFinishTs <= maxCompletedStartTs &&
        maxCompletedStartTs > 0
      ) {
        score = 1;
      } else {
        const lbl = actStatus.label?.toLowerCase() || "";
        if (lbl === "in progress" || lbl === "planned") {
          score = 0.33;
        } else if (
          lbl === "pending approval" ||
          lbl === "correction needed" ||
          lbl === "review late"
        ) {
          score = 0.66;
        }
      }
    }
    return acc + score;
  }, 0);

  return Math.round((actProgressScore / groupTasks.length) * 100);
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
      // Manual scroll calculation for iOS to bypass smooth/overflow bugs
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
        // Fallback to window scroll
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

export function getUserDelegationRoleForTask(task: import('../types').Task, currentUser: import('../types').AppUser, delegationGroups: import('../types').DelegationGroup[]): 'assignee' | 'creator' | null {
  if (!currentUser) return null;
  const linkedGroup = delegationGroups.find((g) => g.parentTaskId === task.id);
  if (!linkedGroup) return null;

  const userParties = currentUser.partyPermissions 
    ? Object.keys(currentUser.partyPermissions).filter(k => currentUser.partyPermissions![k]).map(k => k.toLowerCase().trim()) 
    : [];
  
  let isAssignee = false;
  if (userParties.includes('all')) {
    isAssignee = true;
  } else {
    const currentUsername = String(currentUser.username || '').toLowerCase().trim();
    const currentUserId = currentUser.id;

    for (const st of linkedGroup.subTasks || []) {
      const pPartyList = String(st.party || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      const isPIC = pPartyList.some(p => userParties.includes(p)) || 
                    pPartyList.includes(currentUsername) || 
                    (st.involvedUsers && st.involvedUsers.includes(currentUserId));
      if (isPIC) {
        isAssignee = true;
        break;
      }
    }
  }

  if (isAssignee) return 'assignee';
  if (linkedGroup.createdBy === currentUser.id) return 'creator';
  
  return null;
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
export const ACTIVE_YEARS = ['2026', '2027', '2028', '2029', '2030']; export const ARCHIVED_YEARS = ['2024', '2025'];
