import { useDataStore, autoBackupStoreLocationData, StoreLocationRecord } from '../components/PictureMapping/DataContext';
import { MapVersion, UnitShape } from '../components/PictureMapping/components/DataMapping/types';
import { useAppStore } from '../store/useAppStore';
import { extractAllProjectCodes, projectMatchesUnitCode } from './utilsParts/projectCodeAndScopeUtils';
import {
  ensureMappingConfigHydrated,
  extractPrimaryProjectCodes,
  getUnitEffectiveSizeM2,
  isProjectGroupedWithOthers,
  normalizeFloorCode,
  resolveMatchedUnitSizeM2,
} from './unitSizeResolver';
import { doc } from 'firebase/firestore';
import { setDoc } from './firestoreWrites';
import { setDoc as rawFirestoreSetDoc } from 'firebase/firestore';
import { db, APP_ID } from './firebase';

let _mappingCloudPersistTimer: ReturnType<typeof setTimeout> | null = null;
const pendingProjectPatches = new Map<string, Record<string, any>>();
let projectPatchTimer: ReturnType<typeof setTimeout> | null = null;

function queueProjectPatch(docId: string, payload: Record<string, any>) {
  pendingProjectPatches.set(docId, payload);
  if (projectPatchTimer) clearTimeout(projectPatchTimer);
  projectPatchTimer = setTimeout(() => {
    projectPatchTimer = null;
    const entries = Array.from(pendingProjectPatches.entries());
    pendingProjectPatches.clear();
    entries.forEach(([id, patch]) => {
      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', id), patch, { merge: true }).catch(console.error);
    });
  }, 400);
}

function sanitizeForFirestore(val: any): any {
  if (val === undefined) return null;
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(sanitizeForFirestore);
  const out: Record<string, any> = {};
  for (const k of Object.keys(val)) {
    if (val[k] !== undefined) out[k] = sanitizeForFirestore(val[k]);
  }
  return out;
}

/**
 * Debounced background persistence of Picture Mapping storeLocationData to Firestore
 * so unit size changes from either Project Modal or Picture Mapping EditTab are durable.
 */
function schedulePersistMappingConfigToFirestore() {
  if (typeof window === 'undefined') return;
  if (_mappingCloudPersistTimer) {
    clearTimeout(_mappingCloudPersistTimer);
  }
  _mappingCloudPersistTimer = setTimeout(async () => {
    _mappingCloudPersistTimer = null;
    try {
      const state = useDataStore.getState();
      const consolidated = state.getConsolidatedSaveData();
      if (!consolidated.storeLocationData || Object.keys(consolidated.storeLocationData).length === 0) {
        return;
      }
      const sanitized = sanitizeForFirestore({
        storeLocationData: consolidated.storeLocationData,
        updatedAt: new Date().toISOString(),
      });
      await rawFirestoreSetDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'picture_mapping_config'),
        sanitized,
        { merge: true }
      );
    } catch (err) {
      console.warn('[unitProjectSizeSync] Failed to persist mapping config to Firestore:', err);
    }
  }, 600);
}

export interface ProjectSizeSyncInput {
  id?: string;
  code?: string;
  linkCodes?: string;
  store?: string;
  location?: string;
  year?: string | number;
  sizeM2?: number | null;
}

/**
 * Synchronizes a Project's Size (m²) to its matched Unit(s) in Picture Mapping (Zustand + LocalStorage + Firestore).
 * When a project is saved in Project Modal, the corresponding unit(s) in the matched version & floor are updated.
 */
export function syncProjectSizeToUnits(projectInput: ProjectSizeSyncInput): void {
  ensureMappingConfigHydrated();

  const pCodes = isProjectGroupedWithOthers(projectInput)
    ? extractPrimaryProjectCodes(projectInput)
    : extractAllProjectCodes(projectInput);
  if (pCodes.length === 0) return;

  const state = useDataStore.getState();
  const targetStore = (String(projectInput.store || state.store || 'HCM').toUpperCase().trim() === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
  const targetLoc = normalizeFloorCode(projectInput.location);
  const targetYear = String(projectInput.year || '').trim();

  const newProjectSize =
    projectInput.sizeM2 !== undefined &&
    projectInput.sizeM2 !== null &&
    String(projectInput.sizeM2).trim() !== '' &&
    !isNaN(Number(projectInput.sizeM2)) &&
    Number(projectInput.sizeM2) >= 0
      ? Math.round(Number(projectInput.sizeM2) * 100) / 100
      : undefined;

  // Linked unit names via projectLink
  const projectLink = state.projectLink || [];
  const linkedUnitNames = new Set<string>();
  projectLink.forEach((pl: any) => {
    const u = String(pl?.unit || '').trim();
    const plCode = String(pl?.code || pl?.projectCode || pl?.project || '').trim().toLowerCase();
    if (u && plCode) {
      if (pCodes.some((pc) => pc.toLowerCase() === plCode || projectMatchesUnitCode([pc], plCode))) {
        linkedUnitNames.add(u.toLowerCase());
      }
    }
  });

  // Consolidate active partition into storeLocationData copy
  const activeKey = `${state.store}_${normalizeFloorCode(state.location)}`;
  const allPartitions: Record<string, StoreLocationRecord> = {
    ...(state.storeLocationData || {}),
  };
  if ((state.mapUnits && state.mapUnits.length > 0) || (state.mapVersions && state.mapVersions.length > 0)) {
    const existing = allPartitions[activeKey];
    allPartitions[activeKey] = {
      mapUnits: state.mapUnits.length > 0 ? state.mapUnits : (existing?.mapUnits || []),
      mapVersions: state.mapVersions.length > 0 ? state.mapVersions : (existing?.mapVersions || []),
      activeMapVersionId: state.activeMapVersionId || existing?.activeMapVersionId || null,
    };
  }

  const isStorewideLoc =
    !targetLoc ||
    targetLoc === 'ALL' ||
    targetLoc === 'STORE' ||
    targetLoc === 'STOREWIDE' ||
    targetLoc === 'WHOLE STORE' ||
    targetLoc === 'ALL FLOORS';

  const candidatePartitionKeys = Object.keys(allPartitions).filter((k) => {
    if (!k.startsWith(`${targetStore}_`)) return false;
    if (isStorewideLoc) return true;
    const partLoc = normalizeFloorCode(k.split('_')[1]);
    return partLoc === targetLoc;
  });

  if (candidatePartitionKeys.length === 0) return;

  const masterSizeByUnit = new Map<string, number>();
  (state.unitInfo || []).forEach((ui: any) => {
    const uKey = String(ui?.unit || '').trim().toLowerCase();
    const sz = Number(String(ui?.size ?? '').replace(/,/g, '.'));
    if (uKey && !isNaN(sz) && sz > 0) {
      masterSizeByUnit.set(uKey, sz);
    }
  });

  let anyPartitionChanged = false;
  const updatedUnitSizesForMasterInfo = new Map<string, number | undefined>();

  for (const pKey of candidatePartitionKeys) {
    const part = allPartitions[pKey];
    if (!part) continue;

    const versions = Array.isArray(part.mapVersions) ? part.mapVersions : [];
    const targetVersions = targetYear
      ? versions.filter((v) => String(v.year || '').trim() === targetYear)
      : versions;
    const effectiveVersions = targetVersions.length > 0 ? targetVersions : versions;
    const primaryVersion =
      effectiveVersions.find((v) => v.id === state.activeMapVersionId) ||
      effectiveVersions.find((v) => v.id === part.activeMapVersionId) ||
      effectiveVersions[0];

    const partitionUnits = Array.isArray(part.mapUnits) ? part.mapUnits : [];
    const versionUnits = Array.isArray(primaryVersion?.mapUnits) ? primaryVersion!.mapUnits! : [];

    const combinedUnitsMap = new Map<string, UnitShape>();
    partitionUnits.forEach((u) => {
      if (u && (u.name || u.id)) {
        combinedUnitsMap.set(String(u.name || u.id).trim().toLowerCase(), u);
      }
    });
    versionUnits.forEach((u) => {
      if (u && (u.name || u.id)) {
        const key = String(u.name || u.id).trim().toLowerCase();
        const prev = combinedUnitsMap.get(key);
        combinedUnitsMap.set(key, { ...(prev || {}), ...u });
      }
    });

    const matchedUnits: { key: string; unit: UnitShape; currentSize: number }[] = [];
    combinedUnitsMap.forEach((u, key) => {
      const uName = String(u.name || '').trim();
      const uId = String(u.id || '').trim();
      const uNameLower = uName.toLowerCase();
      const uIdLower = uId.toLowerCase();
      if (!uNameLower && !uIdLower) return;

      const isExact = pCodes.some((c) => {
        const cl = c.toLowerCase();
        return cl === uNameLower || (uIdLower && cl === uIdLower);
      });
      const isLinked = linkedUnitNames.has(uNameLower) || (uIdLower ? linkedUnitNames.has(uIdLower) : false);
      const isCodeMatch = isExact || isLinked || projectMatchesUnitCode(pCodes, uName || uId);

      if (isCodeMatch) {
        const fallbackMaster = masterSizeByUnit.get(uNameLower);
        const effSize = getUnitEffectiveSizeM2(u, primaryVersion, fallbackMaster, true);
        matchedUnits.push({ key, unit: u, currentSize: effSize });
      }
    });

    if (matchedUnits.length === 0) continue;

    const currentTotal = matchedUnits.reduce((acc, item) => acc + (item.currentSize || 0), 0);
    const newSizeByUnitKey = new Map<string, number | undefined>();

    if (newProjectSize === undefined) {
      matchedUnits.forEach((m) => newSizeByUnitKey.set(m.key, undefined));
    } else if (matchedUnits.length === 1) {
      newSizeByUnitKey.set(matchedUnits[0].key, newProjectSize);
    } else {
      // Multiple units matched to this project
      if (Math.abs(newProjectSize - currentTotal) < 0.01 && currentTotal > 0) {
        matchedUnits.forEach((m) => newSizeByUnitKey.set(m.key, m.currentSize));
      } else if (currentTotal > 0) {
        let runningSum = 0;
        matchedUnits.forEach((m, idx) => {
          if (idx === matchedUnits.length - 1) {
            const remainder = Math.max(0, Math.round((newProjectSize - runningSum) * 100) / 100);
            newSizeByUnitKey.set(m.key, remainder);
          } else {
            const scaled = Math.round(((m.currentSize / currentTotal) * newProjectSize) * 100) / 100;
            runningSum += scaled;
            newSizeByUnitKey.set(m.key, scaled);
          }
        });
      } else {
        let runningSum = 0;
        const evenShare = Math.round((newProjectSize / matchedUnits.length) * 100) / 100;
        matchedUnits.forEach((m, idx) => {
          if (idx === matchedUnits.length - 1) {
            const remainder = Math.max(0, Math.round((newProjectSize - runningSum) * 100) / 100);
            newSizeByUnitKey.set(m.key, remainder);
          } else {
            runningSum += evenShare;
            newSizeByUnitKey.set(m.key, evenShare);
          }
        });
      }
    }

    const targetVersionIds = new Set(effectiveVersions.map((v) => v.id));
    const isActiveVersionInTarget =
      !part.activeMapVersionId || targetVersionIds.size === 0 || targetVersionIds.has(part.activeMapVersionId);

    // Update partition mapUnits if applicable
    const nextPartitionUnits = partitionUnits.map((u) => {
      const k = String(u.name || u.id || '').trim().toLowerCase();
      if (!newSizeByUnitKey.has(k)) return u;
      const targetVal = newSizeByUnitKey.get(k);
      if (u.name) updatedUnitSizesForMasterInfo.set(u.name.trim().toLowerCase(), targetVal);
      if (!isActiveVersionInTarget && u.sizeM2 !== undefined && u.sizeM2 > 0) {
        return u;
      }
      if (u.sizeM2 === targetVal && u.size === targetVal) return u;
      anyPartitionChanged = true;
      return {
        ...u,
        sizeM2: targetVal,
        size: targetVal,
      };
    });

    // Update target versions' unitSizes and version.mapUnits
    const nextVersions = versions.map((v) => {
      if (effectiveVersions.length > 0 && !targetVersionIds.has(v.id)) return v;
      const nextUnitSizes = { ...(v.unitSizes || {}) };
      let versionChanged = false;

      matchedUnits.forEach((m) => {
        const targetVal = newSizeByUnitKey.get(m.key);
        const uId = m.unit.id;
        const uNameUpper = String(m.unit.name || '').trim().toUpperCase();
        if (targetVal !== undefined && targetVal >= 0) {
          if (uId && nextUnitSizes[uId] !== targetVal) {
            nextUnitSizes[uId] = targetVal;
            versionChanged = true;
          }
          if (uNameUpper && nextUnitSizes[uNameUpper] !== targetVal) {
            nextUnitSizes[uNameUpper] = targetVal;
            versionChanged = true;
          }
        } else {
          if (uId && uId in nextUnitSizes) {
            delete nextUnitSizes[uId];
            versionChanged = true;
          }
          if (uNameUpper && uNameUpper in nextUnitSizes) {
            delete nextUnitSizes[uNameUpper];
            versionChanged = true;
          }
        }
      });

      let nextVerMapUnits = v.mapUnits;
      if (Array.isArray(v.mapUnits) && v.mapUnits.length > 0) {
        nextVerMapUnits = v.mapUnits.map((vu) => {
          const k = String(vu.name || vu.id || '').trim().toLowerCase();
          if (!newSizeByUnitKey.has(k)) return vu;
          const targetVal = newSizeByUnitKey.get(k);
          if (vu.sizeM2 === targetVal && vu.size === targetVal) return vu;
          versionChanged = true;
          return {
            ...vu,
            sizeM2: targetVal,
            size: targetVal,
          };
        });
      }

      if (!versionChanged) return v;
      anyPartitionChanged = true;
      return {
        ...v,
        unitSizes: nextUnitSizes,
        ...(nextVerMapUnits ? { mapUnits: nextVerMapUnits } : {}),
      };
    });

    allPartitions[pKey] = {
      ...part,
      mapUnits: nextPartitionUnits,
      mapVersions: nextVersions,
    };
  }

  if (!anyPartitionChanged) return;

  const currentActivePartition = allPartitions[activeKey];
  const updatedUnitInfo = Array.isArray(state.unitInfo) && state.unitInfo.length > 0
    ? state.unitInfo.map((ui: any) => {
        const uKey = String(ui?.unit || '').trim().toLowerCase();
        if (uKey && updatedUnitSizesForMasterInfo.has(uKey)) {
          const val = updatedUnitSizesForMasterInfo.get(uKey);
          return { ...ui, size: val ?? '' };
        }
        return ui;
      })
    : state.unitInfo;

  useDataStore.setState({
    storeLocationData: allPartitions,
    ...(currentActivePartition
      ? {
          mapUnits: currentActivePartition.mapUnits,
          mapVersions: currentActivePartition.mapVersions,
        }
      : {}),
    unitInfo: updatedUnitInfo,
  });

  autoBackupStoreLocationData(allPartitions, state.store, state.location, state.activeMapVersionId);
  schedulePersistMappingConfigToFirestore();
}

export interface UnitSizeSyncInput {
  unitId?: string;
  unitName?: string;
  newSizeM2?: number;
  store?: string;
  location?: string;
  year?: string | number;
  updatedUnits?: UnitShape[];
  updatedVersions?: MapVersion[];
  activeVersionId?: string | null;
}

/**
 * Synchronizes a Unit's Size (m²) edited in Picture Mapping to all matched Project(s)
 * in Zustand (`useAppStore.projects`), Dexie (`localDb`), and Firestore (`taka_projects`).
 */
export function syncUnitSizeToMatchedProjects(params: UnitSizeSyncInput): void {
  let dataState = useDataStore.getState();
  const targetStore = (String(params.store || dataState.store || 'HCM').toUpperCase().trim() === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
  const targetLoc = normalizeFloorCode(params.location || dataState.location);
  const targetYear = String(params.year || '').trim();

  const uName = String(params.unitName || '').trim();
  const uId = String(params.unitId || '').trim();
  const uNameLower = uName.toLowerCase();
  const uIdLower = uId.toLowerCase();

  // Immediately sync updatedUnits, updatedVersions, and unitInfo into useDataStore so resolvers see fresh state
  if (params.updatedUnits || params.updatedVersions || params.newSizeM2 !== undefined) {
    const partKey = `${targetStore}_${targetLoc}`;
    const existingPart = dataState.storeLocationData?.[partKey];
    const nextMapUnits = params.updatedUnits ?? existingPart?.mapUnits ?? dataState.mapUnits;
    const nextMapVersions = params.updatedVersions ?? existingPart?.mapVersions ?? dataState.mapVersions;
    const nextActiveVerId = params.activeVersionId !== undefined
      ? params.activeVersionId
      : (existingPart?.activeMapVersionId ?? dataState.activeMapVersionId ?? null);

    const nextStoreLocationData: Record<string, StoreLocationRecord> = {
      ...(dataState.storeLocationData || {}),
      [partKey]: {
        mapUnits: nextMapUnits,
        mapVersions: nextMapVersions,
        activeMapVersionId: nextActiveVerId,
      },
    };

    const nextUnitInfo =
      uNameLower && params.newSizeM2 !== undefined && Array.isArray(dataState.unitInfo)
        ? dataState.unitInfo.map((ui: any) => {
            const uKey = String(ui?.unit || '').trim().toLowerCase();
            if (uKey === uNameLower) {
              return { ...ui, size: params.newSizeM2 ?? 0 };
            }
            return ui;
          })
        : dataState.unitInfo;

    const isCurrentActivePartition =
      dataState.store === targetStore && normalizeFloorCode(dataState.location) === targetLoc;

    useDataStore.setState({
      storeLocationData: nextStoreLocationData,
      ...(isCurrentActivePartition
        ? {
            mapUnits: nextMapUnits,
            mapVersions: nextMapVersions,
          }
        : {}),
      unitInfo: nextUnitInfo,
    });

    autoBackupStoreLocationData(nextStoreLocationData, targetStore, targetLoc, nextActiveVerId);
    dataState = useDataStore.getState();
  }

  // Persist mapping config to localStorage & Firestore in background
  schedulePersistMappingConfigToFirestore();

  if (!uNameLower && !uIdLower) return;

  // Linked project codes via projectLink
  const projectLink = dataState.projectLink || [];
  const linkedProjCodes: string[] = [];
  projectLink.forEach((pl: any) => {
    const u = String(pl?.unit || '').trim().toLowerCase();
    const plCode = String(pl?.code || pl?.projectCode || pl?.project || '').trim().toLowerCase();
    if (u && plCode && (u === uNameLower || (uIdLower && u === uIdLower))) {
      linkedProjCodes.push(plCode);
    }
  });

  const allProjects = useAppStore.getState().projects || [];
  if (allProjects.length === 0) return;

  let anyProjectUpdated = false;
  const nowIso = new Date().toISOString();

  const updatedProjects = allProjects.map((p) => {
    if (!p || p.isDeleted) return p;

    const pStore = (String(p.store || 'HCM').toUpperCase().trim() === 'HN' ? 'HN' : 'HCM');
    if (pStore !== targetStore) return p;

    const pYear = String(p.year || '').trim();
    if (targetYear && targetYear !== 'all' && pYear && pYear !== 'ALL' && pYear !== targetYear) {
      return p;
    }

    const pLoc = normalizeFloorCode(p.location);
    const isStorewide =
      !pLoc ||
      pLoc === 'ALL' ||
      pLoc === 'STORE' ||
      pLoc === 'STOREWIDE' ||
      pLoc === 'WHOLE STORE' ||
      pLoc === 'ALL FLOORS';
    if (!isStorewide && targetLoc && pLoc !== targetLoc) {
      return p;
    }

    // Use primary codes when project is grouped with others so secondary unit edits do not overwrite master project size
    const pCodes = isProjectGroupedWithOthers(p)
      ? extractPrimaryProjectCodes(p)
      : extractAllProjectCodes(p);
    if (pCodes.length === 0) return p;

    const isExact = pCodes.some((c) => {
      const cl = c.toLowerCase();
      return cl === uNameLower || (uIdLower && cl === uIdLower);
    });
    const isLinked = linkedProjCodes.some((lc) =>
      pCodes.some((pc) => pc.toLowerCase() === lc || projectMatchesUnitCode([pc], lc))
    );
    const isMatch = isExact || isLinked || projectMatchesUnitCode(pCodes, uName || uId);

    if (!isMatch) return p;

    // Recompute the project's total Size (m²) from its primary matched units in this version/year
    const resolved = resolveMatchedUnitSizeM2({
      code: p.code,
      linkCodes: p.linkCodes ?? p.code,
      store: p.store || targetStore,
      location: p.location || targetLoc,
      year: p.year || targetYear,
    });

    const nextSizeM2 = resolved.sizeM2 !== undefined
      ? resolved.sizeM2
      : (params.newSizeM2 !== undefined ? params.newSizeM2 : undefined);
    const currentSizeM2 = p.sizeM2 !== undefined && p.sizeM2 !== null ? Number(p.sizeM2) : undefined;

    if (currentSizeM2 === nextSizeM2) return p;

    anyProjectUpdated = true;
    const docId = p.id || String(p.no);
    if (docId) {
      queueProjectPatch(String(docId), {
        sizeM2: nextSizeM2 ?? 0,
        updatedAt: nowIso,
      });
    }

    return {
      ...p,
      sizeM2: nextSizeM2 ?? 0,
      updatedAt: nowIso,
    };
  });

  if (anyProjectUpdated) {
    useAppStore.getState().setProjects(updatedProjects);
  }
}
