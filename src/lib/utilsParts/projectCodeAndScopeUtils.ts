import { useAppStore } from "../../store/useAppStore";
import { Project, Task, DelegationGroup, AppUser } from "../../types";
import { isTaskDeletedInTracker } from "../taskDeletedTracker";
import { parseDateMidnightMs, getTodayMidnightMs } from "./commonAndDateUtils";

export function matchProjectStatusFilter(
  status: string | undefined,
  filterValue: string,
  startStr?: string
): boolean {
  if (!filterValue || filterValue === 'all') return true;

  const currentStatus = status || 'Upcoming';

  if (filterValue === 'On process & Upcoming' || filterValue === 'On process + Upcoming') {
    return currentStatus === 'On process' || currentStatus === 'Upcoming' || currentStatus === 'Handover';
  }

  if (filterValue === 'On process + Upcoming 3 days') {
    if (currentStatus === 'On process' || currentStatus === 'Handover') {
      return true;
    }
    if (currentStatus === 'Upcoming') {
      if (!startStr) return false;
      const todayMs = getTodayMidnightMs();
      const dStartMs = parseDateMidnightMs(startStr);
      if (dStartMs === null) return false;
      const diffDays = Math.ceil((dStartMs - todayMs) / (1000 * 60 * 60 * 24));
      return diffDays <= 3 && diffDays >= 0;
    }
    return false;
  }

  return currentStatus.toLowerCase() === filterValue.toLowerCase();
}

const INVALID_UNIT_TOKENS = new Set([
  'b1', 'b2', 'b3', 'l1', 'l2', 'l3', 'l4', 'l5',
  '1f', '2f', '3f', '4f', '5f', 'gf', 'ug', 'mz',
  'f1', 'f2', 'f3', 'f4', 'f5',
  'hcm', 'hn', 'taka', 'takashimaya', 'pm', 'project',
  'reserve', 'event', 'common', 'area', 'mall', 'store', 'floor', 'all', 'na', 'null', 'undefined'
]);

const _normUnitCodeCache = new Map<string, string>();
const _extractCodesCache = new Map<string, string[]>();

/**
 * Strips common floor/zone/PM prefixes like 'PM-L1-HCM-2026-', 'L1-', 'F1-', '1F-', 'B1-', 'GF-', 'UG-', 'Unit '
 */
function normalizeUnitCodeBase(code: string): string {
  if (!code) return '';
  const cached = _normUnitCodeCache.get(code);
  if (cached !== undefined) return cached;

  let str = code.toLowerCase().trim();
  str = str.replace(/^(unit|shop|lot|booth|kiosk|store)\s*[-_:]?\s*/i, '');
  str = str.replace(/^pm-(?:(?:b\d|l\d|\d+f|gf|ug|hcm|hn|20\d\d|y\d\d)[-_:]\s*)+/i, '');
  str = str.replace(/^(?:hcm|hn)[-_:]\s*/i, '');
  str = str.replace(/^(?:[blf]\d{1,2}|\d{1,2}f|gf|ug|mz|basement|ground)\s*[-_:]\s*/i, '');
  const res = str.trim();

  if (_normUnitCodeCache.size >= 4000) {
    _normUnitCodeCache.clear();
  }
  _normUnitCodeCache.set(code, res);
  return res;
}

/**
 * Extracts all project codes from both project.code and project.linkCodes
 */
export function extractAllProjectCodes(p: { code?: string | null; linkCodes?: string | null }): string[] {
  if (!p) return [];
  const rawCodeKey = `${p.code || ''}|${p.linkCodes || ''}`;
  if (rawCodeKey === '|') return [];
  const cached = _extractCodesCache.get(rawCodeKey);
  if (cached !== undefined) return cached;

  const codeSet = new Set<string>();

  const addIfValid = (rawCode: string) => {
    const trimmed = (rawCode || '').trim().toLowerCase();
    if (!trimmed || INVALID_UNIT_TOKENS.has(trimmed)) return;
    codeSet.add(trimmed);

    const baseCode = normalizeUnitCodeBase(trimmed);
    if (baseCode && !INVALID_UNIT_TOKENS.has(baseCode)) {
      codeSet.add(baseCode);
    }

    const pmMatch = trimmed.match(/^pm-(?:b\d|l\d|\d+f|gf|ug|hcm|hn)-(?:hcm|hn|b\d|l\d|\d+f|gf|ug)(?:-(?:20\d\d|y\d\d))?-([a-z0-9_-]+)$/i);
    if (pmMatch && pmMatch[1]) {
      const unitPart = pmMatch[1].toLowerCase();
      if (!INVALID_UNIT_TOKENS.has(unitPart)) {
        codeSet.add(unitPart);
        const locMatch = trimmed.match(/(b\d|l\d|\d+f)/i);
        if (locMatch) {
          let fl = locMatch[1].toLowerCase();
          if (fl.endsWith('f')) fl = `l${fl[0]}`;
          codeSet.add(`${fl}-${unitPart}`);
        }
      }
    }
  };

  const hasCustomLinkCodes = Boolean(p.linkCodes && String(p.linkCodes).trim());

  if (hasCustomLinkCodes) {
    String(p.linkCodes)
      .split(/[\r\n\t,;+/&|]+|\s{2,}/)
      .map(c => c.trim().toLowerCase())
      .filter(Boolean)
      .forEach(c => {
        addIfValid(c);
      });
  } else if (p.code && String(p.code).trim()) {
    addIfValid(String(p.code));
  }

  const result = Array.from(codeSet);
  if (_extractCodesCache.size >= 4000) {
    _extractCodesCache.clear();
  }
  _extractCodesCache.set(rawCodeKey, result);
  return result;
}

/**
 * Extracts normalized Year, Store, Location (Floor) from project properties and code/linkCodes.
 */
export function extractProjectMetadata(p: any): { year: string; store: string; location: string } {
  if (!p) return { year: '', store: '', location: '' };

  let year = String(p.year || (p as any).projectYear || '').trim();
  if (!year || year === 'undefined' || year === 'null') {
    const rawSearch = `${p.code || ''} ${p.linkCodes || ''}`;
    const yrMatch = rawSearch.match(/(?:^|[^0-9a-zA-Z])(?:y|Y)?(202\d|203\d)(?:[^0-9a-zA-Z]|$)/i) 
      || rawSearch.match(/y(202\d|203\d)\b/i)
      || rawSearch.match(/\b(202\d|203\d)\b/);
    if (yrMatch) {
      year = yrMatch[1];
    } else {
      const yrShortMatch = rawSearch.match(/(?:^|[^0-9a-zA-Z])(?:y|Y)(2[4-9]|3[0-5])(?:[^0-9a-zA-Z]|$)/i);
      if (yrShortMatch) {
        year = `20${yrShortMatch[1]}`;
      }
    }
  }

  let store = String(p.store || (p as any).projectStore || '').trim().toUpperCase();
  if (!store || store === 'UNDEFINED' || store === 'NULL') {
    const rawSearch = `${p.code || ''} ${p.linkCodes || ''}`;
    if (/(?:^|[^a-zA-Z])HCM(?:[^a-zA-Z]|$)/i.test(rawSearch)) {
      store = 'HCM';
    } else if (/(?:^|[^a-zA-Z])HN(?:[^a-zA-Z]|$)/i.test(rawSearch)) {
      store = 'HN';
    }
  }

  let rawLoc = String((p as any).floor || p.location || (p as any).projectLocation || '').trim().toUpperCase();
  let location = '';
  if (rawLoc && rawLoc !== 'UNDEFINED' && rawLoc !== 'NULL') {
    const m = rawLoc.match(/(?:^|[^a-zA-Z0-9])(B\d|L\d|\d+F|\d+L|GF|MF|RF|BASEMENT\s*\d?|LEVEL\s*\d+[a-zA-Z]?|FLOOR\s*\d+[a-zA-Z]?)(?:[^a-zA-Z0-9]|$)/i);
    if (m) {
      let token = m[1].toUpperCase().replace(/\s+/g, '');
      if (token.startsWith('BASEMENT')) token = token.replace('BASEMENT', 'B') || 'B1';
      if (token.startsWith('LEVEL')) {
        const num = token.match(/LEVEL(\d+)/i);
        token = num ? `L${num[1]}` : 'L1';
      }
      if (token.startsWith('FLOOR')) {
        const num = token.match(/FLOOR(\d+)/i);
        token = num ? `L${num[1]}` : 'L1';
      }
      if (/^\d+F$/.test(token)) token = 'L' + token.replace('F', '');
      if (/^\d+L$/.test(token)) token = 'L' + token.replace('L', '');
      if (/^L\d+[A-Z]$/i.test(token)) token = token.slice(0, -1);
      location = token;
    } else {
      location = rawLoc;
    }
  }

  if (!location || location === 'UNDEFINED' || location === 'NULL') {
    const rawSearch = `${p.code || ''} ${p.linkCodes || ''} ${p.name || ''}`;
    const m = rawSearch.match(/(?:^|[^a-zA-Z0-9])(B\d|L\d|\d+F|\d+L|GF|MF|RF|BASEMENT\s*\d?|LEVEL\s*\d+[a-zA-Z]?|FLOOR\s*\d+[a-zA-Z]?)(?:[^a-zA-Z0-9]|$)/i);
    if (m) {
      let token = m[1].toUpperCase().replace(/\s+/g, '');
      if (token.startsWith('BASEMENT')) token = token.replace('BASEMENT', 'B') || 'B1';
      if (token.startsWith('LEVEL')) {
        const num = token.match(/LEVEL(\d+)/i);
        token = num ? `L${num[1]}` : 'L1';
      }
      if (token.startsWith('FLOOR')) {
        const num = token.match(/FLOOR(\d+)/i);
        token = num ? `L${num[1]}` : 'L1';
      }
      if (/^\d+F$/.test(token)) token = 'L' + token.replace('F', '');
      if (/^\d+L$/.test(token)) token = 'L' + token.replace('L', '');
      if (/^L\d+[A-Z]$/i.test(token)) token = token.slice(0, -1);
      location = token;
    }
  }

  if (location && location.endsWith('F')) {
    location = `L${location[0]}`;
  }
  if (/^L\d+[A-Z]$/i.test(location)) {
    location = location.slice(0, -1);
  }

  return { year, store, location };
}

export function projectMatchesScope(
  meta: { year: string; store: string; location: string },
  scope: { store?: string; location?: string; year?: string }
): boolean {
  if (scope.store && scope.store !== 'all') {
    const targetStore = scope.store.toUpperCase().trim();
    if (meta.store && meta.store !== targetStore) return false;
  }

  if (scope.location && scope.location !== 'all') {
    let targetLoc = scope.location.toUpperCase().trim();
    if (targetLoc.endsWith('F')) targetLoc = `L${targetLoc[0]}`;
    if (/^L\d+[A-Z]$/i.test(targetLoc)) targetLoc = targetLoc.slice(0, -1);
    if (meta.location) {
      let pLoc = meta.location.toUpperCase().trim();
      if (pLoc.endsWith('F')) pLoc = `L${pLoc[0]}`;
      if (/^L\d+[A-Z]$/i.test(pLoc)) pLoc = pLoc.slice(0, -1);
      const isStorewide = pLoc === 'ALL' || pLoc === 'STORE' || pLoc === 'STOREWIDE' || pLoc === 'WHOLE STORE' || pLoc === 'ALL FLOORS';
      if (!isStorewide && pLoc !== targetLoc) return false;
    }
  }

  if (scope.year && scope.year !== 'all') {
    const targetYear = scope.year.trim();
    if (meta.year && meta.year !== targetYear) return false;
  }

  return true;
}

export function projectMatchesUnitCode(pCodes: string[], unitName: string): boolean {
  const u = (unitName || '').toLowerCase().trim();
  if (!u || INVALID_UNIT_TOKENS.has(u)) return false;
  const uStripped = normalizeUnitCodeBase(u);

  for (const rawCode of pCodes) {
    const c = (rawCode || '').toLowerCase().trim();
    if (!c || INVALID_UNIT_TOKENS.has(c)) continue;

    if (u === c) return true;

    const cStripped = normalizeUnitCodeBase(c);
    if (uStripped && cStripped && !INVALID_UNIT_TOKENS.has(uStripped) && !INVALID_UNIT_TOKENS.has(cStripped)) {
      if (uStripped === cStripped) return true;
    }
  }
  return false;
}

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

export function matchProjectCode(codeA?: string, codeB?: string): boolean {
  if (!codeA || !codeB) return false;
  const a = String(codeA).trim().toLowerCase();
  const b = String(codeB).trim().toLowerCase();
  if (a === b) return true;
  const partsA = a.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  const partsB = b.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  return partsA.some(pa => partsB.includes(pa));
}

const _hydratedProjectIds = new Set<string>();

export function markProjectTasksHydrated(projectId?: string | number | null): void {
  if (projectId !== undefined && projectId !== null && String(projectId).trim() !== '') {
    _hydratedProjectIds.add(String(projectId).trim());
  }
}

export function isProjectTasksHydrated(projectId?: string | number | null): boolean {
  if (projectId === undefined || projectId === null) return false;
  return _hydratedProjectIds.has(String(projectId).trim());
}

export function clearHydratedProjectTasks(): void {
  _hydratedProjectIds.clear();
}

export function hasOtherProjectInStoreWithCode(
  storeUpper: string,
  taskCode: string | undefined,
  taskYear: string,
  excludeProjectId?: string,
  allProjects?: Project[]
): boolean {
  if (!taskCode) return false;
  const projects = allProjects || useAppStore.getState().projects || [];
  if (projects.length === 0) return true;
  const tCodeLower = String(taskCode).trim().toLowerCase();
  const exId = excludeProjectId ? String(excludeProjectId).trim() : '';

  for (let i = 0; i < projects.length; i++) {
    const other = projects[i];
    if (!other || (other as any).isDeleted) continue;
    const otherId = other.id ? String(other.id).trim() : '';
    if (exId && otherId === exId) continue;

    const otherStore = other.store ? String(other.store).trim().toUpperCase() : '';
    if (storeUpper && otherStore && storeUpper !== otherStore) continue;

    const otherCode = String(other.code || '').trim().toLowerCase();
    const matchesCode =
      otherCode === tCodeLower ||
      matchProjectCode(taskCode, other.code) ||
      matchProjectCode(taskCode, other.linkCodes);
    if (matchesCode) {
      return true;
    }
  }
  return false;
}

export function isTaskBelongsToProject(
  t: Partial<Task> | undefined | null,
  p: Partial<Project> | undefined | null,
  allProjects?: Project[]
): boolean {
  if (!t || !p || t.isDeleted || (p as any).isDeleted) return false;

  const tProjId = t.projectId ? String(t.projectId).trim() : '';
  const pId = p.id ? String(p.id).trim() : '';

  if (t.id && isTaskDeletedInTracker(t.id, pId || undefined)) return false;

  if (tProjId && pId) {
    return tProjId === pId;
  }

  const tStore = t.projectStore ? String(t.projectStore).trim().toUpperCase() : '';
  const pStore = p.store ? String(p.store).trim().toUpperCase() : '';
  if (tStore && pStore && tStore !== pStore) return false;

  if (!t.projectCode || !p.code) return false;
  const rawPCode = String(p.code || '').trim().toLowerCase();
  const tCode = String(t.projectCode).trim().toLowerCase();
  const rawCombined = p.linkCodes ? `${p.code || ''}, ${p.linkCodes}` : String(p.code || '');
  const pCodeParts = rawCombined.toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  const codeMatches =
    tCode === rawPCode ||
    pCodeParts.includes(tCode) ||
    matchProjectCode(t.projectCode, p.code) ||
    matchProjectCode(t.projectCode, p.linkCodes);
  if (!codeMatches) return false;

  const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
  const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';
  if (tYear && pYear && tYear.toLowerCase() !== 'all' && pYear.toLowerCase() !== 'all' && tYear !== pYear) {
    return false;
  }

  return true;
}

export function isDelegationGroupBelongsToProject(
  g: DelegationGroup | undefined | null,
  p: Partial<Project> | undefined | null,
  matchedTaskIds?: Set<string>
): boolean {
  if (!g || !p || g.isDeleted || (p as any).isDeleted) return false;

  if (g.parentTaskId && matchedTaskIds && matchedTaskIds.has(g.parentTaskId)) {
    return true;
  }

  const gProjId = g.projectId ? String(g.projectId).trim() : '';
  const pId = p.id ? String(p.id).trim() : '';
  if (gProjId && pId) {
    return gProjId === pId;
  }

  const gStore = g.projectStore ? String(g.projectStore).trim().toUpperCase() : '';
  const pStore = p.store ? String(p.store).trim().toUpperCase() : '';
  if (gStore && pStore && gStore !== pStore) return false;

  if (!g.projectCode || !p.code) return false;
  const gCode = String(g.projectCode).trim().toLowerCase();
  const codeMatches = gCode === String(p.code).trim().toLowerCase() || matchProjectCode(g.projectCode, p.code);
  if (!codeMatches) return false;

  const gYear = g.projectYear !== undefined && g.projectYear !== null ? String(g.projectYear).trim() : '';
  const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';
  if (gYear && pYear && gYear.toLowerCase() !== 'all' && pYear.toLowerCase() !== 'all' && gYear !== pYear) {
    return false;
  }

  return true;
}

export function getTasksForProject(project: Partial<Project>, allTasks: Task[]): Task[] {
  if ((!project.code && !project.id) || !allTasks || allTasks.length === 0) return [];
  return allTasks.filter(t => isTaskBelongsToProject(t, project));
}

export function getUserDelegationRoleForTask(
  task: Task,
  currentUser: AppUser,
  delegationGroups: DelegationGroup[]
): 'assignee' | 'creator' | null {
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
