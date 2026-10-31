import { doc } from 'firebase/firestore';
import { setDoc } from './firestoreWrites';
import { setDoc as rawFirestoreSetDoc } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useDataStore } from '../components/PictureMapping/DataContext';

let _mappingCloudPersistTimer: ReturnType<typeof setTimeout> | null = null;
const pendingProjectPatches = new Map<string, Record<string, any>>();
let projectPatchTimer: ReturnType<typeof setTimeout> | null = null;

export function queueProjectPatch(docId: string, payload: Record<string, any>) {
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

export function sanitizeForFirestore(val: any): any {
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
export function schedulePersistMappingConfigToFirestore() {
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
