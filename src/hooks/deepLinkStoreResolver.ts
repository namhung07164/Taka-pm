import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { useAppStore } from '../store/useAppStore';

export interface ResolvedStoreYear {
  store?: string;
  year?: string;
}

/**
 * Resolves the target store and year for a deep link search query (e.g. "HN-TKV-BWW" or "TKV-BWW").
 * Checks in-memory projects first, then Dexie localDb, and finally Firestore.
 */
export async function resolveStoreAndYearForQuery(
  searchQuery: string,
  enrichedProjects: any[] = []
): Promise<ResolvedStoreYear> {
  const qTrim = (searchQuery || '').trim();
  if (!qTrim) return {};

  const qUpper = qTrim.toUpperCase();
  let store: string | undefined;
  let year: string | undefined;

  // 1. Detect store from code prefix
  if (qUpper.startsWith('HN-') || qUpper.startsWith('HN_') || qUpper.startsWith('HN ')) {
    store = 'HN';
  } else if (qUpper.startsWith('HCM-') || qUpper.startsWith('HCM_') || qUpper.startsWith('HCM ')) {
    store = 'HCM';
  }

  const normQ = qTrim.toLowerCase();
  const strippedCode = normQ.replace(/^(hn|hcm)[-_ ]/, '');

  const matchProject = (p: any): boolean => {
    if (!p) return false;
    const pCode = String(p.code || '').trim().toLowerCase();
    const pId = String(p.id || '').trim().toLowerCase();
    const pStoreCode = `${String(p.store || '').toLowerCase()}-${pCode}`;
    const pName = String(p.name || '').trim().toLowerCase();
    return (
      pCode === normQ ||
      pCode === strippedCode ||
      pStoreCode === normQ ||
      pId === normQ ||
      (pName && pName.includes(normQ))
    );
  };

  // 2. Search in-memory projects
  const curProjects = useAppStore.getState().projects || [];
  const curNotifProjects = useAppStore.getState().allProjectsForNotifs || [];

  let found =
    enrichedProjects.find(matchProject) ||
    curProjects.find(matchProject) ||
    curNotifProjects.find(matchProject);

  // 3. Search Dexie localDb
  if (!found || !year || !store) {
    try {
      const { localDb } = await import('../lib/localDb');
      const localProjects = await localDb.projects.toArray();
      const localMatch = localProjects.find(matchProject);
      if (localMatch) found = localMatch;
    } catch (err) {
      console.warn('[DeepLinkResolver] localDb lookup error:', err);
    }
  }

  // 4. Query Firestore taka_projects if still not resolved
  if (!found || !year || !store) {
    try {
      const q1 = query(
        collection(db, "artifacts", APP_ID, "public", "data", "taka_projects"),
        where("code", "==", qTrim),
        limit(1)
      );
      const snap1 = await getDocs(q1);
      if (!snap1.empty) {
        found = snap1.docs[0].data();
      } else if (strippedCode && strippedCode !== normQ) {
        const q2 = query(
          collection(db, "artifacts", APP_ID, "public", "data", "taka_projects"),
          where("code", "==", strippedCode.toUpperCase()),
          limit(1)
        );
        const snap2 = await getDocs(q2);
        if (!snap2.empty) {
          found = snap2.docs[0].data();
        }
      }
    } catch (err) {
      console.warn('[DeepLinkResolver] Firestore lookup error:', err);
    }
  }

  if (found) {
    if (!store && found.store) store = String(found.store).trim().toUpperCase();
    if (!year && found.year) year = String(found.year).trim();
  }

  return { store, year };
}
