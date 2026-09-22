import { Project, Task, ActiveNotification } from '../types';
import { useDataStore } from '../components/PictureMapping/DataContext';
import { useAppStore } from '../store/useAppStore';

export interface LayoutUnitMatchResult {
  hasUnit: boolean;
  store: string;
  location: string;
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
 * Searches if a notification (or project/task) has a corresponding unit on the Live Layout floor plans.
 * Returns location, store, matched unit code, and comment flags if found; returns null otherwise.
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

  if (targetType === 'task') {
    matchedTask = tasksList.find((t) => t.id && String(t.id).toLowerCase() === targetId) || null;
    const taskProjCode = (matchedTask?.projectCode || notifProjCode).toLowerCase();
    matchedProject =
      projectsList.find(
        (p) =>
          (p.code && String(p.code).toLowerCase() === taskProjCode) ||
          (p.id && matchedTask && (matchedTask as any).projectId === p.id) ||
          (p.no && String(p.no).toLowerCase() === targetId)
      ) || null;
  } else if (targetType === 'project') {
    matchedProject =
      projectsList.find(
        (p) =>
          (p.id && String(p.id).toLowerCase() === targetId) ||
          (p.no && String(p.no).toLowerCase() === targetId) ||
          (p.code && String(p.code).toLowerCase() === targetId) ||
          (p.code && String(p.code).toLowerCase() === notifProjCode)
      ) || null;
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
  if (matchedProject?.code) candidateKeys.add(String(matchedProject.code).trim().toLowerCase());
  if ((matchedProject as any)?.unit) candidateKeys.add(String((matchedProject as any).unit).trim().toLowerCase());
  if (matchedProject?.name) candidateKeys.add(String(matchedProject.name).trim().toLowerCase());
  if (matchedTask?.taskCodePhu) candidateKeys.add(String(matchedTask.taskCodePhu).trim().toLowerCase());
  if (matchedTask?.projectCode) candidateKeys.add(String(matchedTask.projectCode).trim().toLowerCase());

  if (candidateKeys.size === 0) {
    return null;
  }

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

      // Check group mappings
      if (v.groupMappings && typeof v.groupMappings === 'object') {
        // Group ID match or unit array match
        for (const [groupId, unitIds] of Object.entries(v.groupMappings)) {
          if (Array.isArray(unitIds)) {
            const hasUnit = unitIds.some((uid) => candidateKeys.has(String(uid).trim().toLowerCase()));
            if (hasUnit) {
              const uCode = matchedProject?.code || (matchedProject as any)?.unit || notif.projectCode || unitIds[0];
              return {
                hasUnit: true,
                store: vStore,
                location: vLoc,
                unitCode: String(uCode),
                project: matchedProject,
                task: matchedTask,
                isComment,
                isTaskComment,
                isProjectComment,
              };
            }
          }
          // Check if group itself matches candidates
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
            (u.name && candidateKeys.has(String(u.name).trim().toLowerCase())) ||
            (u.id && candidateKeys.has(String(u.id).trim().toLowerCase()))
        );
        if (foundUnit) {
          const uCode = foundUnit.name || matchedProject?.code || notif.projectCode || foundUnit.id;
          return {
            hasUnit: true,
            store: vStore,
            location: vLoc,
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
        (u.unit && candidateKeys.has(String(u.unit).trim().toLowerCase())) ||
        (u.name && candidateKeys.has(String(u.name).trim().toLowerCase())) ||
        (u.unitId && candidateKeys.has(String(u.unitId).trim().toLowerCase()))
    );

    if (matchedUInfo) {
      const store = matchedUInfo.store || matchedProject?.store || notif.projectStore || 'HCM';
      const location = String(matchedUInfo.floor || matchedUInfo.location || matchedProject?.location || 'L1').trim().toUpperCase();
      const uCode = matchedUInfo.unit || matchedProject?.code || notif.projectCode || matchedUInfo.name;
      return {
        hasUnit: true,
        store,
        location,
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
            (u.name && candidateKeys.has(String(u.name).trim().toLowerCase())) ||
            (u.id && candidateKeys.has(String(u.id).trim().toLowerCase()))
        );
        if (foundUnit) {
          return {
            hasUnit: true,
            store,
            location: cleanLoc,
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

    // 6. Check extracted floor regex from projectCode / unit / name
    const extractedFloor =
      extractFloorFromCodeOrName(notif.projectCode) ||
      extractFloorFromCodeOrName(matchedProject?.code) ||
      extractFloorFromCodeOrName((matchedProject as any)?.unit) ||
      extractFloorFromCodeOrName(matchedProject?.name);

    if (extractedFloor) {
      const store = matchedProject?.store || notif.projectStore || 'HCM';
      const uCode = matchedProject?.code || (matchedProject as any)?.unit || notif.projectCode;
      if (uCode) {
        // Confirm if floor has map units in storeLocationData
        const partKey = `${store}_${extractedFloor}`;
        const record = dataState.storeLocationData?.[partKey];
        if (record?.mapUnits && record.mapUnits.length > 0) {
          return {
            hasUnit: true,
            store,
            location: extractedFloor,
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
  } catch (err) {
    console.warn('Error in findProjectLayoutUnit:', err);
  }

  return null;
}
