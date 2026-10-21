import { Project, Task, ActiveNotification } from '../types';
import { useDataStore } from '../components/PictureMapping/DataContext';
import { useAppStore } from '../store/useAppStore';
import { extractAllProjectCodes, projectMatchesUnitCode } from './utils';

export interface LayoutUnitMatchResult {
  hasUnit: boolean;
  store: string;
  location: string;
  year?: string;
  unitCode: string;
  project?: Project | null;
  task?: Task | null;
  isComment: boolean;
  isTaskComment: boolean;
  isProjectComment: boolean;
}

export const extractFloorFromCodeOrName = (str?: string | null): string | null => {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/(?:^|[^a-zA-Z0-9])(B\d|L\d|\d+F|\d+L|GF|MF|RF|BASEMENT\s*\d?|LEVEL\s*\d?|FLOOR\s*\d?)(?:[^a-zA-Z0-9]|$)/i);
  if (m) {
    let token = m[1].toUpperCase().replace(/\s+/g, '');
    if (token.startsWith('BASEMENT')) token = token.replace('BASEMENT', 'B') || 'B1';
    if (token.startsWith('LEVEL')) token = token.replace('LEVEL', 'L') || 'L1';
    if (token.startsWith('FLOOR')) token = token.replace('FLOOR', 'L') || 'L1';
    if (/^\d+F$/.test(token)) token = 'L' + token.replace('F', '');
    if (/^\d+L$/.test(token)) token = 'L' + token.replace('L', '');
    return token;
  }
  return null;
};

/**
 * Searches if a notification (or project/task/delegation) has a corresponding unit on the Live Layout floor plans.
 * Returns location, store, year, matched unit code, and comment flags if found; returns null otherwise.
 */
export function findProjectLayoutUnit(
  notif: ActiveNotification,
  projectsList: Project[],
  tasksList: Task[]
): LayoutUnitMatchResult | null {
  if (!notif) return null;

  const targetType = notif.targetType;
  const targetId = notif.targetId ? String(notif.targetId).trim().toLowerCase() : '';
  const notifProjId = notif.projectId ? String(notif.projectId).trim() : '';
  const notifProjCode = notif.projectCode ? String(notif.projectCode).trim().toLowerCase() : '';

  // 1. Locate the Project and/or Task objects with strict 4-key isolation (Rule 16.1)
  let matchedProject: Project | null = null;
  let matchedTask: Task | null = null;

  const notifStore = notif.projectStore ? String(notif.projectStore).trim().toUpperCase() : '';
  const notifYear = notif.projectYear ? String(notif.projectYear).trim() : '';

  if (targetType === 'task') {
    matchedTask = tasksList.find((t) => t.id && String(t.id).toLowerCase() === targetId) || null;
    const taskProjId = (matchedTask?.projectId ? String(matchedTask.projectId).trim() : '') || notifProjId;
    const taskProjCode = (matchedTask?.projectCode || notifProjCode).toLowerCase();
    const taskStore = String(matchedTask?.projectStore || notifStore).trim().toUpperCase();
    const taskYear = String(matchedTask?.projectYear ? matchedTask.projectYear : notifYear).trim();

    if (taskProjId) {
      matchedProject = projectsList.find((p) => p.id && String(p.id).trim() === taskProjId) || null;
    }

    if (!matchedProject) {
      matchedProject =
        projectsList.find((p) => {
          if (taskProjId && p.id && String(p.id).trim() !== taskProjId) return false;
          const pStore = p.store ? String(p.store).trim().toUpperCase() : '';
          if (taskStore && pStore && taskStore !== pStore) return false;
          const pYear = p.year ? String(p.year).trim() : '';
          if (taskYear && pYear && taskYear !== pYear) return false;

          const pCode = String(p.code || '').trim().toLowerCase();
          return Boolean(pCode && pCode === taskProjCode);
        }) || null;
    }
  } else if (targetType === 'project') {
    if (notifProjId) {
      matchedProject = projectsList.find((p) => p.id && String(p.id).trim() === notifProjId) || null;
    }
    if (!matchedProject) {
      matchedProject =
        projectsList.find((p) => {
          if (notifProjId && p.id && String(p.id).trim() !== notifProjId) return false;
          const pStore = p.store ? String(p.store).trim().toUpperCase() : '';
          if (notifStore && pStore && notifStore !== pStore) return false;
          const pYear = p.year ? String(p.year).trim() : '';
          if (notifYear && pYear && notifYear !== pYear) return false;

          const idMatches =
            (p.id && String(p.id).toLowerCase() === targetId) ||
            (p.no && String(p.no).toLowerCase() === targetId);

          const pCode = String(p.code || '').trim().toLowerCase();
          const codeMatches =
            (pCode && pCode === targetId) ||
            (pCode && notifProjCode && pCode === notifProjCode) ||
            (p.linkCodes && extractAllProjectCodes(p).includes(targetId)) ||
            (p.linkCodes && notifProjCode && extractAllProjectCodes(p).includes(notifProjCode));

          return Boolean(idMatches || codeMatches);
        }) || null;
    }
  } else if (targetType === 'task_delegation') {
    const delegationGroups = useAppStore.getState().delegationGroups || [];
    const matchedGroup = delegationGroups.find((g) => g.id && String(g.id).toLowerCase() === targetId) || null;

    const parentTaskId = matchedGroup?.parentTaskId || (matchedGroup as any)?.taskId;
    if (parentTaskId) {
      matchedTask = tasksList.find((t) => t.id && String(t.id).toLowerCase() === String(parentTaskId).toLowerCase()) || null;
    }

    const groupProjId = String((matchedGroup as any)?.projectId || matchedTask?.projectId || notifProjId || '').trim();
    const groupProjCode = (matchedGroup?.projectCode || matchedTask?.projectCode || notifProjCode).toLowerCase();
    const groupStore = String((matchedGroup as any)?.projectStore || matchedTask?.projectStore || notifStore || '').trim().toUpperCase();
    const groupYear = String((matchedGroup as any)?.projectYear || matchedTask?.projectYear || notifYear || '').trim();

    if (groupProjId) {
      matchedProject = projectsList.find((p) => p.id && String(p.id).trim() === groupProjId) || null;
    }

    if (!matchedProject) {
      matchedProject =
        projectsList.find((p) => {
          if (groupProjId && p.id && String(p.id).trim() !== groupProjId) return false;
          const pStore = p.store ? String(p.store).trim().toUpperCase() : '';
          if (groupStore && pStore && groupStore !== pStore) return false;
          const pYear = p.year ? String(p.year).trim() : '';
          if (groupYear && pYear && groupYear !== pYear) return false;

          const pCode = String(p.code || '').trim().toLowerCase();
          const codeMatches =
            (pCode && pCode === groupProjCode) ||
            (p.linkCodes && groupProjCode && extractAllProjectCodes(p).includes(groupProjCode));

          return Boolean(codeMatches);
        }) || null;
    }
  }

  // Strictly resolved store & year (NEVER allow cross-store pollution)
  const expectedStore = String(
    notifStore || matchedProject?.store || matchedTask?.projectStore || 'HCM'
  ).trim().toUpperCase();
  const targetYear = String(
    notifYear || matchedProject?.year || matchedTask?.projectYear || '2026'
  ).trim();

  // Detect comment flags
  const notifId = String(notif.id || '');
  const notifTitle = String(notif.title || '').toLowerCase();
  const isProjectComment =
    notifId.startsWith('mention_proj_') ||
    (targetType === 'project' && (notifTitle.includes('mention') || notifTitle.includes('comment')));
  const isTaskComment =
    (notifId.startsWith('mention_') && !notifId.startsWith('mention_proj_')) ||
    (targetType === 'task' && (notifTitle.includes('mention') || notifTitle.includes('comment')));
  const isComment = isProjectComment || isTaskComment;

  // 2. Build Candidate Keys to match against layout map units
  const candidateKeys = new Set<string>();
  if (notifProjCode) candidateKeys.add(notifProjCode);
  if (matchedProject) {
    const allProjCodes = extractAllProjectCodes(matchedProject);
    allProjCodes.forEach((c) => candidateKeys.add(c));
    if ((matchedProject as any)?.unit) candidateKeys.add(String((matchedProject as any).unit).trim().toLowerCase());
    if (matchedProject?.name) candidateKeys.add(String(matchedProject.name).trim().toLowerCase());
  }
  if (matchedTask?.taskCodePhu) candidateKeys.add(String(matchedTask.taskCodePhu).trim().toLowerCase());
  if (matchedTask?.projectCode) candidateKeys.add(String(matchedTask.projectCode).trim().toLowerCase());

  const candidateArray = Array.from(candidateKeys);

  // 3. Search in DataContext mapVersions ONLY for expectedStore (Rule 16.1 Store Isolation)
  try {
    const dataState = useDataStore.getState();
    const storesToSearch: ('HCM' | 'HN')[] =
      expectedStore === 'HN' ? ['HN'] : expectedStore === 'HCM' ? ['HCM'] : ['HCM', 'HN'];

    const scopedVersions: Array<{ version: any; storeKey: string }> = [];
    storesToSearch.forEach((stKey) => {
      const vers = dataState.getAllStoreVersions(stKey) || [];
      vers.forEach((v: any) => scopedVersions.push({ version: v, storeKey: stKey }));
    });

    for (const { version: v, storeKey } of scopedVersions) {
      if (!v || !v.location) continue;
      const vStore = String(v.store || storeKey || expectedStore).trim().toUpperCase();
      if (expectedStore && vStore !== expectedStore) continue;

      const vLoc = String(v.location).trim().toUpperCase();
      const vYear = v.year ? String(v.year) : targetYear;

      // Check group mappings
      if (v.groupMappings && typeof v.groupMappings === 'object') {
        for (const [groupId, unitIds] of Object.entries(v.groupMappings)) {
          if (Array.isArray(unitIds)) {
            const hasUnit = unitIds.some((uid) => {
              const strUid = String(uid).trim().toLowerCase();
              return candidateKeys.has(strUid) || projectMatchesUnitCode(candidateArray, strUid);
            });
            if (hasUnit) {
              const uCode = matchedProject?.code || (matchedProject as any)?.unit || notif.projectCode || unitIds[0];
              return {
                hasUnit: true,
                store: expectedStore,
                location: vLoc,
                year: targetYear || vYear,
                unitCode: String(uCode),
                project: matchedProject,
                task: matchedTask,
                isComment,
                isTaskComment,
                isProjectComment,
              };
            }
          }
          const groupObj = v.groups?.find((g: any) => g.id === groupId);
          if (groupObj) {
            const gCode = ((groupObj as any).code || '').trim().toLowerCase();
            const gName = (groupObj.name || '').trim().toLowerCase();
            if ((gCode && candidateKeys.has(gCode)) || (gName && candidateKeys.has(gName))) {
              if (Array.isArray(unitIds) && unitIds.length > 0) {
                const uCode = matchedProject?.code || (matchedProject as any)?.unit || notif.projectCode || unitIds[0];
                return {
                  hasUnit: true,
                  store: expectedStore,
                  location: vLoc,
                  year: targetYear || vYear,
                  unitCode: String(uCode),
                  project: matchedProject,
                  task: matchedTask,
                  isComment,
                  isTaskComment,
                  isProjectComment,
                };
              }
            }
          }
        }
      }

      // Check mapUnits on the version
      const vUnits = (v as any).mapUnits;
      if (vUnits && Array.isArray(vUnits)) {
        const foundUnit = vUnits.find(
          (u: any) =>
            (u.name && (candidateKeys.has(String(u.name).trim().toLowerCase()) || projectMatchesUnitCode(candidateArray, String(u.name)))) ||
            (u.id && (candidateKeys.has(String(u.id).trim().toLowerCase()) || projectMatchesUnitCode(candidateArray, String(u.id))))
        );
        if (foundUnit) {
          const uCode = foundUnit.name || matchedProject?.code || notif.projectCode || foundUnit.id;
          return {
            hasUnit: true,
            store: expectedStore,
            location: vLoc,
            year: targetYear || vYear,
            unitCode: String(uCode),
            project: matchedProject,
            task: matchedTask,
            isComment,
            isTaskComment,
            isProjectComment,
          };
        }
      }
    }

    // 4. Search in unitInfo table strictly scoped to expectedStore
    const unitInfo = dataState.unitInfo || [];
    const matchedUInfo = unitInfo.find((u: any) => {
      if (expectedStore && u.store && String(u.store).trim().toUpperCase() !== expectedStore) {
        return false;
      }
      return (
        (u.unit && (candidateKeys.has(String(u.unit).trim().toLowerCase()) || projectMatchesUnitCode(candidateArray, String(u.unit)))) ||
        (u.name && (candidateKeys.has(String(u.name).trim().toLowerCase()) || projectMatchesUnitCode(candidateArray, String(u.name)))) ||
        (u.unitId && (candidateKeys.has(String(u.unitId).trim().toLowerCase()) || projectMatchesUnitCode(candidateArray, String(u.unitId))))
      );
    });

    if (matchedUInfo) {
      const location = String(matchedUInfo.floor || matchedUInfo.location || matchedProject?.location || 'L1').trim().toUpperCase();
      const uCode = matchedUInfo.unit || matchedProject?.code || notif.projectCode || matchedUInfo.name;
      return {
        hasUnit: true,
        store: expectedStore,
        location,
        year: targetYear || (matchedUInfo.year ? String(matchedUInfo.year) : '2026'),
        unitCode: String(uCode),
        project: matchedProject,
        task: matchedTask,
        isComment,
        isTaskComment,
        isProjectComment,
      };
    }

    // 5. Search in storeLocationData mapUnits for project location in expectedStore
    const projLoc = matchedProject?.location || (matchedTask as any)?.location || notif.location;
    if (projLoc && projLoc.toLowerCase() !== 'all') {
      const cleanLoc = String(projLoc).trim().toUpperCase();
      const partKey = `${expectedStore}_${cleanLoc}`;
      const record = dataState.storeLocationData?.[partKey];
      if (record?.mapUnits && Array.isArray(record.mapUnits)) {
        const foundUnit = record.mapUnits.find(
          (u) =>
            (u.name && (candidateKeys.has(String(u.name).trim().toLowerCase()) || projectMatchesUnitCode(candidateArray, String(u.name)))) ||
            (u.id && (candidateKeys.has(String(u.id).trim().toLowerCase()) || projectMatchesUnitCode(candidateArray, String(u.id))))
        );
        if (foundUnit) {
          return {
            hasUnit: true,
            store: expectedStore,
            location: cleanLoc,
            year: targetYear,
            unitCode: String(foundUnit.name || matchedProject?.code || notif.projectCode || foundUnit.id),
            project: matchedProject,
            task: matchedTask,
            isComment,
            isTaskComment,
            isProjectComment,
          };
        }
      }
    }

    // 6. Check extracted floor regex from projectCode / unit / name / title
    const extractedFloor =
      extractFloorFromCodeOrName(notif.projectCode) ||
      extractFloorFromCodeOrName(matchedProject?.code) ||
      extractFloorFromCodeOrName(notif.title) ||
      extractFloorFromCodeOrName((matchedProject as any)?.unit) ||
      extractFloorFromCodeOrName(matchedProject?.name);

    if (extractedFloor) {
      const uCode = matchedProject?.code || (matchedProject as any)?.unit || notif.projectCode || (notif.title && notif.title.includes(' - ') ? notif.title.split(' - ')[0].trim() : '');
      if (uCode) {
        return {
          hasUnit: true,
          store: expectedStore,
          location: extractedFloor,
          year: targetYear,
          unitCode: String(uCode),
          project: matchedProject,
          task: matchedTask,
          isComment,
          isTaskComment,
          isProjectComment,
        };
      }
    }
  } catch (err) {
    console.warn('Error in findProjectLayoutUnit:', err);
  }

  const fallbackFloor =
    extractFloorFromCodeOrName(notif.projectCode) ||
    extractFloorFromCodeOrName(matchedProject?.code) ||
    extractFloorFromCodeOrName(notif.title) ||
    extractFloorFromCodeOrName((matchedProject as any)?.unit) ||
    extractFloorFromCodeOrName(matchedProject?.name) ||
    'L1';

  const rawLoc = String(matchedProject?.location || (matchedTask as any)?.location || notif.location || fallbackFloor).trim().toUpperCase();
  const finalLocation = (rawLoc && rawLoc !== 'ALL') ? rawLoc : fallbackFloor;
  const finalCode = notif.projectCode || matchedProject?.code || (notif.title && notif.title.includes(' - ') ? notif.title.split(' - ')[0].trim() : '');

  return {
    hasUnit: Boolean(finalCode),
    store: expectedStore,
    location: finalLocation,
    year: targetYear,
    unitCode: String(finalCode),
    project: matchedProject,
    task: matchedTask,
    isComment,
    isTaskComment,
    isProjectComment,
  };
}
