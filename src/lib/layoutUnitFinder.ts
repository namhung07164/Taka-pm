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
  const notifProjCode = notif.projectCode ? String(notif.projectCode).trim().toLowerCase() : '';

  // 1. Locate the Project and/or Task objects
  let matchedProject: Project | null = null;
  let matchedTask: Task | null = null;

  const notifStore = notif.projectStore ? String(notif.projectStore).trim().toLowerCase() : '';
  const notifYear = notif.projectYear ? String(notif.projectYear).trim().toLowerCase() : '';

  if (targetType === 'task') {
    matchedTask = tasksList.find((t) => t.id && String(t.id).toLowerCase() === targetId) || null;
    const taskProjCode = (matchedTask?.projectCode || notifProjCode).toLowerCase();
    const taskStore = (matchedTask?.projectStore || notifStore).toLowerCase();
    const taskYear = (matchedTask?.projectYear ? String(matchedTask.projectYear) : notifYear).toLowerCase();

    matchedProject =
      projectsList.find((p) => {
        const pStore = p.store ? String(p.store).trim().toLowerCase() : '';
        const pYear = p.year ? String(p.year).trim().toLowerCase() : '';
        if (p.id && matchedTask && (matchedTask as any).projectId === p.id) {
          if (taskStore && pStore && taskStore !== pStore) return false;
          if (taskYear && pYear && taskYear !== pYear) return false;
          return true;
        }
        const pCode = String(p.code || '').trim().toLowerCase();
        if (pCode && pCode === taskProjCode) {
          if (taskStore && pStore && taskStore !== pStore) return false;
          if (taskYear && pYear && taskYear !== pYear) return false;
          return true;
        }
        return false;
      }) || null;
  } else if (targetType === 'project') {
    matchedProject =
      projectsList.find((p) => {
        const pStore = p.store ? String(p.store).trim().toLowerCase() : '';
        const pYear = p.year ? String(p.year).trim().toLowerCase() : '';
        const idMatches = (p.id && String(p.id).toLowerCase() === targetId) || (p.no && String(p.no).toLowerCase() === targetId);

        const pCode = String(p.code || '').trim().toLowerCase();
        const codeMatches =
          (pCode && pCode === targetId) ||
          (pCode && notifProjCode && pCode === notifProjCode) ||
          (p.linkCodes && extractAllProjectCodes(p).includes(targetId)) ||
          (p.linkCodes && notifProjCode && extractAllProjectCodes(p).includes(notifProjCode));

        if (idMatches || codeMatches) {
          if (notifStore && pStore && notifStore !== pStore) return false;
          if (notifYear && pYear && notifYear !== pYear) return false;
          return true;
        }
        return false;
      }) || null;
  } else if (targetType === 'task_delegation') {
    const delegationGroups = useAppStore.getState().delegationGroups || [];
    const matchedGroup = delegationGroups.find((g) => g.id && String(g.id).toLowerCase() === targetId) || null;
    
    const parentTaskId = matchedGroup?.parentTaskId || (matchedGroup as any)?.taskId;
    if (parentTaskId) {
      matchedTask = tasksList.find((t) => t.id && String(t.id).toLowerCase() === String(parentTaskId).toLowerCase()) || null;
    }

    const groupProjCode = (matchedGroup?.projectCode || matchedTask?.projectCode || notifProjCode).toLowerCase();
    const groupProjId = (matchedGroup as any)?.projectId;
    const groupStore = (matchedGroup as any)?.projectStore || matchedTask?.projectStore || notifStore;
    const groupYear = (matchedGroup as any)?.projectYear || matchedTask?.projectYear || notifYear;

    matchedProject =
      projectsList.find((p) => {
        const pStore = p.store ? String(p.store).trim().toLowerCase() : '';
        const pYear = p.year ? String(p.year).trim().toLowerCase() : '';

        if (groupProjId && (p.id === groupProjId || String(p.no) === String(groupProjId))) {
          if (groupStore && pStore && groupStore !== pStore) return false;
          if (groupYear && pYear && String(groupYear) !== pYear) return false;
          return true;
        }

        const pCode = String(p.code || '').trim().toLowerCase();
        const codeMatches =
          (pCode && pCode === groupProjCode) ||
          (p.linkCodes && groupProjCode && extractAllProjectCodes(p).includes(groupProjCode));

        if (codeMatches) {
          if (groupStore && pStore && groupStore !== pStore) return false;
          if (groupYear && pYear && String(groupYear) !== pYear) return false;
          return true;
        }
        return false;
      }) || null;
  }

  // Detect comment flags
  const notifId = String(notif.id || '');
  const notifTitle = String(notif.title || '').toLowerCase();
  const isProjectComment =
    notifId.startsWith('mention_proj_') ||
    (targetType === 'project' && (notifTitle.includes('mention') || notifTitle.includes('comment')));
  const isTaskComment =
    notifId.startsWith('mention_') && !notifId.startsWith('mention_proj_') ||
    (targetType === 'task' && (notifTitle.includes('mention') || notifTitle.includes('comment')));
  const isComment = isProjectComment || isTaskComment;

  // 2. Build Candidate Keys to match against layout map units
  const candidateKeys = new Set<string>();
  if (notifProjCode) candidateKeys.add(notifProjCode);
  if (matchedProject) {
    const allProjCodes = extractAllProjectCodes(matchedProject);
    allProjCodes.forEach(c => candidateKeys.add(c));
    if ((matchedProject as any)?.unit) candidateKeys.add(String((matchedProject as any).unit).trim().toLowerCase());
    if (matchedProject?.name) candidateKeys.add(String(matchedProject.name).trim().toLowerCase());
  }
  if (matchedTask?.taskCodePhu) candidateKeys.add(String(matchedTask.taskCodePhu).trim().toLowerCase());
  if (matchedTask?.projectCode) candidateKeys.add(String(matchedTask.projectCode).trim().toLowerCase());

  const candidateArray = Array.from(candidateKeys);
  const targetYear = String(matchedProject?.year || notif.projectYear || '2026');

  // 3. Search in DataContext mapVersions across HCM & HN
  try {
    const dataState = useDataStore.getState();
    const allVersions = [
      ...dataState.getAllStoreVersions('HCM'),
      ...dataState.getAllStoreVersions('HN'),
    ];

    for (const v of allVersions) {
      if (!v.location) continue;
      const vStore = v.store || matchedProject?.store || notif.projectStore || 'HCM';
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
                store: vStore,
                location: vLoc,
                year: vYear,
                unitCode: String(uCode),
                project: matchedProject,
                task: matchedTask,
                isComment,
                isTaskComment,
                isProjectComment,
              };
            }
          }
          const groupObj = v.groups?.find((g) => g.id === groupId);
          if (groupObj) {
            const gCode = ((groupObj as any).code || '').trim().toLowerCase();
            const gName = (groupObj.name || '').trim().toLowerCase();
            if ((gCode && candidateKeys.has(gCode)) || (gName && candidateKeys.has(gName))) {
              if (Array.isArray(unitIds) && unitIds.length > 0) {
                const uCode = matchedProject?.code || (matchedProject as any)?.unit || notif.projectCode || unitIds[0];
                return {
                  hasUnit: true,
                  store: vStore,
                  location: vLoc,
                  year: vYear,
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

      // Check mapUnits on the version (or dynamic version payload)
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
            store: vStore,
            location: vLoc,
            year: vYear,
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

    // 4. Search in unitInfo table
    const unitInfo = dataState.unitInfo || [];
    const matchedUInfo = unitInfo.find(
      (u: any) =>
        (u.unit && (candidateKeys.has(String(u.unit).trim().toLowerCase()) || projectMatchesUnitCode(candidateArray, String(u.unit)))) ||
        (u.name && (candidateKeys.has(String(u.name).trim().toLowerCase()) || projectMatchesUnitCode(candidateArray, String(u.name)))) ||
        (u.unitId && (candidateKeys.has(String(u.unitId).trim().toLowerCase()) || projectMatchesUnitCode(candidateArray, String(u.unitId))))
    );

    if (matchedUInfo) {
      const store = matchedUInfo.store || matchedProject?.store || notif.projectStore || 'HCM';
      const location = String(matchedUInfo.floor || matchedUInfo.location || matchedProject?.location || 'L1').trim().toUpperCase();
      const uCode = matchedUInfo.unit || matchedProject?.code || notif.projectCode || matchedUInfo.name;
      return {
        hasUnit: true,
        store,
        location,
        year: matchedUInfo.year ? String(matchedUInfo.year) : targetYear,
        unitCode: String(uCode),
        project: matchedProject,
        task: matchedTask,
        isComment,
        isTaskComment,
        isProjectComment,
      };
    }

    // 5. Search in storeLocationData mapUnits for project location
    const projLoc = matchedProject?.location || (matchedTask as any)?.location;
    if (projLoc && projLoc.toLowerCase() !== 'all') {
      const cleanLoc = String(projLoc).trim().toUpperCase();
      const store = matchedProject?.store || notif.projectStore || 'HCM';
      const partKey = `${store}_${cleanLoc}`;
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
            store,
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
      const store = String(matchedProject?.store || notif.projectStore || 'HCM').trim().toUpperCase();
      const uCode = matchedProject?.code || (matchedProject as any)?.unit || notif.projectCode || (notif.title && notif.title.includes(' - ') ? notif.title.split(' - ')[0].trim() : '');
      if (uCode) {
        return {
          hasUnit: true,
          store,
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

  const rawLoc = String(matchedProject?.location || (matchedTask as any)?.location || fallbackFloor).trim().toUpperCase();
  const finalLocation = (rawLoc && rawLoc !== 'ALL') ? rawLoc : fallbackFloor;
  const finalStore = String(matchedProject?.store || notif.projectStore || 'HCM').trim().toUpperCase();
  const finalCode = notif.projectCode || matchedProject?.code || (notif.title && notif.title.includes(' - ') ? notif.title.split(' - ')[0].trim() : '');

  // Return project/task info resolved for liveview
  return {
    hasUnit: true,
    store: finalStore,
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
