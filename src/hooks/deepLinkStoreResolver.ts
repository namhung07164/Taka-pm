import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { useAppStore } from '../store/useAppStore';
import { Project } from '../types';

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

  if (found) {
    if (!store && found.store) store = String(found.store).trim().toUpperCase();
    if (!year && found.year) year = String(found.year).trim();
  }

  // 3. Search Dexie localDb
  if (!found || !year || !store) {
    try {
      const { localDb } = await import('../lib/localDb');
      const localProjects = await localDb.projects.toArray();
      const localMatch = localProjects.find(matchProject);
      if (localMatch) {
        found = localMatch;
        if (!store && found.store) store = String(found.store).trim().toUpperCase();
        if (!year && found.year) year = String(found.year).trim();
      }
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

export function findProjectWithCompositeIsolation(
  lists: Project[][],
  targetId: string,
  extraParams?: { store?: string; year?: string; code?: string; projectId?: string }
): Project | undefined {
  const normId = String(targetId || '').trim().toLowerCase();
  const expProjId = extraParams?.projectId ? String(extraParams.projectId).trim() : '';
  const expStore = extraParams?.store ? String(extraParams.store).trim().toUpperCase() : '';
  const expYear =
    extraParams?.year && String(extraParams.year).toLowerCase() !== 'all'
      ? String(extraParams.year).trim()
      : '';
  const expCode = extraParams?.code ? String(extraParams.code).trim().toLowerCase() : '';

  // Pass 1: Strict Composite Match (projectId -> store -> year -> id/code/no)
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const match = list.find((item) => {
      if (!item || item.isDeleted) return false;
      if (expProjId && item.id && String(item.id).trim() !== expProjId) return false;
      const itemStore = item.store ? String(item.store).trim().toUpperCase() : '';
      if (expStore && itemStore && itemStore !== expStore) return false;
      const itemYear = item.year ? String(item.year).trim() : '';
      if (expYear && itemYear && itemYear !== expYear) return false;

      if (expProjId && item.id && String(item.id).trim() === expProjId) return true;
      const itemIdLower = item.id ? String(item.id).trim().toLowerCase() : '';
      const itemCodeLower = item.code ? String(item.code).trim().toLowerCase() : '';
      return (
        itemIdLower === normId ||
        String(item.no) === String(targetId) ||
        (itemCodeLower && itemCodeLower === normId) ||
        (expCode && itemCodeLower === expCode)
      );
    });
    if (match) return match;
  }

  // Pass 2: Relax year if not found, but NEVER violate store or projectId isolation (Rule 16.1)
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const match = list.find((item) => {
      if (!item || item.isDeleted) return false;
      if (expProjId && item.id && String(item.id).trim() !== expProjId) return false;
      const itemStore = item.store ? String(item.store).trim().toUpperCase() : '';
      if (expStore && itemStore && itemStore !== expStore) return false;

      const itemIdLower = item.id ? String(item.id).trim().toLowerCase() : '';
      const itemCodeLower = item.code ? String(item.code).trim().toLowerCase() : '';
      return (
        itemIdLower === normId ||
        String(item.no) === String(targetId) ||
        (itemCodeLower && itemCodeLower === normId) ||
        (expCode && itemCodeLower === expCode)
      );
    });
    if (match) return match;
  }

  return undefined;
}

