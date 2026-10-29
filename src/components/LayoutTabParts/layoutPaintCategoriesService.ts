import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { setDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { useDataStore } from '../PictureMapping/DataContext';
import { useAppStore } from '../../store/useAppStore';

export const CUSTOM_PAINT_CATEGORIES_STORAGE_KEY = 'taka_layout_custom_paint_categories';
export const ACTIVE_PAINT_FILTER_STORAGE_KEY = 'taka_layout_active_paint_filter';
export const PAINT_GROUP_MAPPINGS_STORAGE_KEY = 'taka_layout_paint_group_mappings';

export const DEFAULT_PRESET_CATEGORIES = [
  'Status',
  'Timeline',
  'Department',
  'Risk',
  'Progress',
  'Shop type',
];

export interface PaintCategoriesConfig {
  categories: string[];
  groupMappings?: Record<string, string>;
  activePaintFilter?: string;
  updatedAt?: string;
  updatedBy?: string;
}

// Memory cache to avoid redundant JSON parsing
let cachedCategories: string[] | null = null;
let cachedActiveFilter: string | null = null;
let cachedGroupMappings: Record<string, string> | null = null;

// Shared singleton Firestore listener state (Anti-Read-Storm)
type ConfigSubscriber = (config: PaintCategoriesConfig) => void;
const subscribers = new Set<ConfigSubscriber>();
let sharedFirestoreUnsub: Unsubscribe | null = null;
let hasSeededInitialDoc = false;

/**
 * Get locally cached paint categories (0ms read)
 */
export function getSavedCustomPaintCategories(): string[] {
  if (cachedCategories && cachedCategories.length > 0) {
    return cachedCategories;
  }
  try {
    const raw = localStorage.getItem(CUSTOM_PAINT_CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedCategories = parsed.map((c: any) => String(c || '').trim()).filter(Boolean);
        if (cachedCategories.length > 0) {
          return cachedCategories;
        }
      }
    }
  } catch {
    // fallback
  }
  cachedCategories = [...DEFAULT_PRESET_CATEGORIES];
  return cachedCategories;
}

/**
 * Get locally cached active paint filter (Device-local UI state only)
 */
export function getSavedActivePaintFilter(): string {
  if (cachedActiveFilter) return cachedActiveFilter;
  try {
    const raw = localStorage.getItem(ACTIVE_PAINT_FILTER_STORAGE_KEY);
    if (raw && typeof raw === 'string' && raw.trim()) {
      cachedActiveFilter = raw.trim();
      return cachedActiveFilter;
    }
  } catch {
    // fallback
  }
  return 'Status';
}

/**
 * Save active paint filter locally on this device only (never overwrites other devices' active view)
 */
export function saveActivePaintFilterLocal(activeCategory: string): void {
  const trimmed = String(activeCategory || '').trim();
  if (!trimmed) return;
  cachedActiveFilter = trimmed;
  try {
    localStorage.setItem(ACTIVE_PAINT_FILTER_STORAGE_KEY, trimmed);
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Get locally cached condition group mappings
 */
export function getSavedPaintGroupMappings(): Record<string, string> {
  if (cachedGroupMappings) return cachedGroupMappings;
  try {
    const raw = localStorage.getItem(PAINT_GROUP_MAPPINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        cachedGroupMappings = parsed;
        return cachedGroupMappings;
      }
    }
  } catch {
    // fallback
  }
  return {};
}

/**
 * Resolve effective paint category string for a dynamic condition group,
 * prioritizing synced cloud groupMappings (including empty string "" when unassigned).
 */
export function resolveGroupPaintCategory(
  group: any,
  groupMappings?: Record<string, string> | null
): string {
  if (!group) return '';
  const mappings = groupMappings ?? getSavedPaintGroupMappings();
  if (mappings && typeof mappings === 'object') {
    if (group.id && Object.prototype.hasOwnProperty.call(mappings, group.id)) {
      return String(mappings[group.id] ?? '').trim();
    }
    if (group.name && Object.prototype.hasOwnProperty.call(mappings, gNameKey(group.name))) {
      return String(mappings[gNameKey(group.name)] ?? '').trim();
    }
    if (group.name && Object.prototype.hasOwnProperty.call(mappings, group.name)) {
      return String(mappings[group.name] ?? '').trim();
    }
  }
  return String(group.paintCategory ?? group.category ?? '').trim();
}

function gNameKey(name: string): string {
  return String(name || '').trim();
}

function notifySubscribers(config: PaintCategoriesConfig) {
  subscribers.forEach((cb) => {
    try {
      cb(config);
    } catch (err) {
      console.warn('[layoutPaintCategoriesService] subscriber error:', err);
    }
  });
}

/**
 * Save paint categories filter data (categories list & condition mappings) to LocalStorage + Cloud Firestore
 */
export async function savePaintCategoriesConfig(
  config: Partial<PaintCategoriesConfig>,
  currentEmail?: string
): Promise<void> {
  try {
    // 1. Optimistic local cache update (0ms)
    if (config.categories && Array.isArray(config.categories)) {
      const cleaned = Array.from(
        new Set(config.categories.map((c) => String(c || '').trim()).filter(Boolean))
      );
      cachedCategories = cleaned;
      localStorage.setItem(CUSTOM_PAINT_CATEGORIES_STORAGE_KEY, JSON.stringify(cleaned));
    }
    if (config.groupMappings !== undefined) {
      cachedGroupMappings = config.groupMappings;
      localStorage.setItem(PAINT_GROUP_MAPPINGS_STORAGE_KEY, JSON.stringify(config.groupMappings));
    }
    if (config.activePaintFilter !== undefined) {
      const trimmedFilter = String(config.activePaintFilter || '').trim();
      cachedActiveFilter = trimmedFilter;
      try {
        localStorage.setItem(ACTIVE_PAINT_FILTER_STORAGE_KEY, trimmedFilter);
      } catch {}
      try {
        useAppStore.getState().setLayoutPaintCategory(trimmedFilter);
      } catch {}
    }

    const currentConfigSnapshot: PaintCategoriesConfig = {
      categories: cachedCategories || getSavedCustomPaintCategories(),
      groupMappings: cachedGroupMappings || getSavedPaintGroupMappings(),
      activePaintFilter: cachedActiveFilter || getSavedActivePaintFilter(),
      updatedAt: new Date().toISOString(),
      updatedBy: currentEmail || 'system',
    };

    // Immediate in-memory notification to all mounted Layout components (0ms)
    notifySubscribers(currentConfigSnapshot);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('taka_paint_categories_updated', {
          detail: currentConfigSnapshot,
        })
      );
    }

    // 2. Cloud Firestore Persistence (taka_config/paint_categories)
    const paintCategoriesDocRef = doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'taka_config',
      'paint_categories'
    );

    const payload: Record<string, any> = {
      updatedAt: currentConfigSnapshot.updatedAt,
      updatedBy: currentConfigSnapshot.updatedBy,
    };

    if (config.categories !== undefined) {
      payload.categories = cachedCategories;
    }
    if (config.groupMappings !== undefined) {
      payload.groupMappings = cachedGroupMappings;
    }
    if (config.activePaintFilter !== undefined) {
      payload.activePaintFilter = config.activePaintFilter;
    }

    await setDoc(paintCategoriesDocRef, payload, { merge: true });

    // 3. Touch versions document to alert snapshot listeners
    const versionsDocRef = doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'taka_config',
      'versions'
    );
    await setDoc(
      versionsDocRef,
      {
        paintCategoriesVersion: Date.now(),
        updatedAt: currentConfigSnapshot.updatedAt,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[layoutPaintCategoriesService] Cloud save failed:', err);
  }
}

/**
 * Apply cloud group mappings onto local versions in DataStore
 */
export function applyGroupMappingsToVersions(
  groupMappings: Record<string, string>,
  targetStore: 'HCM' | 'HN'
) {
  if (!groupMappings || Object.keys(groupMappings).length === 0) return;
  try {
    const dataStore = useDataStore.getState();
    const allVers = dataStore.getAllStoreVersions(targetStore) || [];
    if (!allVers || allVers.length === 0) return;

    let hasChanges = false;
    const updatedVers = allVers.map((v) => {
      let vChanged = false;
      const nextGroups = (v.groups || []).map((g: any) => {
        const hasId = g?.id && Object.prototype.hasOwnProperty.call(groupMappings, g.id);
        const hasName = g?.name && Object.prototype.hasOwnProperty.call(groupMappings, g.name);
        if (!hasId && !hasName) return g;

        const assigned = hasId ? String(groupMappings[g.id] ?? '').trim() : String(groupMappings[g.name] ?? '').trim();
        const currentCat = String(g.paintCategory ?? g.category ?? '').trim();
        if (assigned !== currentCat) {
          vChanged = true;
          return {
            ...g,
            paintCategory: assigned,
            category: assigned,
          };
        }
        return g;
      });
      if (vChanged) {
        hasChanges = true;
        return { ...v, groups: nextGroups };
      }
      return v;
    });

    if (hasChanges) {
      dataStore.updateStoreVersionsAcrossLocations(updatedVers, targetStore);
    }
  } catch (err) {
    console.warn('[layoutPaintCategoriesService] applyGroupMappingsToVersions error:', err);
  }
}

function ensureSharedListener() {
  if (sharedFirestoreUnsub) return;

  const paintCategoriesDocRef = doc(
    db,
    'artifacts',
    APP_ID,
    'public',
    'data',
    'taka_config',
    'paint_categories'
  );

  sharedFirestoreUnsub = onSnapshot(
    paintCategoriesDocRef,
    (snap) => {
      if (!snap.exists()) {
        const initialCategories = getSavedCustomPaintCategories();
        const initialMappings = getSavedPaintGroupMappings();
        const initialConfig: PaintCategoriesConfig = {
          categories: initialCategories,
          groupMappings: initialMappings,
        };
        notifySubscribers(initialConfig);

        // Seed initial document once so all devices share the same cloud filter data
        if (!hasSeededInitialDoc) {
          hasSeededInitialDoc = true;
          setDoc(
            paintCategoriesDocRef,
            {
              categories: initialCategories,
              groupMappings: initialMappings,
              updatedAt: new Date().toISOString(),
              updatedBy: 'system_init',
            },
            { merge: true }
          ).catch(() => {});
        }
        return;
      }

      const data = snap.data() as PaintCategoriesConfig;
      const categories =
        Array.isArray(data.categories) && data.categories.length > 0
          ? Array.from(new Set(data.categories.map((c) => String(c || '').trim()).filter(Boolean)))
          : getSavedCustomPaintCategories();

      cachedCategories = categories;
      try {
        localStorage.setItem(CUSTOM_PAINT_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
      } catch {}

      const groupMappings =
        data.groupMappings && typeof data.groupMappings === 'object'
          ? data.groupMappings
          : getSavedPaintGroupMappings();

      cachedGroupMappings = groupMappings;
      try {
        localStorage.setItem(PAINT_GROUP_MAPPINGS_STORAGE_KEY, JSON.stringify(groupMappings));
      } catch {}

      // Apply mappings to both stores in DataStore if loaded
      applyGroupMappingsToVersions(groupMappings, 'HCM');
      applyGroupMappingsToVersions(groupMappings, 'HN');

      if (data.activePaintFilter && typeof data.activePaintFilter === 'string' && data.activePaintFilter.trim()) {
        const nextFilter = data.activePaintFilter.trim();
        cachedActiveFilter = nextFilter;
        try {
          localStorage.setItem(ACTIVE_PAINT_FILTER_STORAGE_KEY, nextFilter);
        } catch {}
        try {
          useAppStore.getState().setLayoutPaintCategory(nextFilter);
        } catch {}
      }

      const nextConfig: PaintCategoriesConfig = {
        categories,
        groupMappings,
        activePaintFilter: data.activePaintFilter || cachedActiveFilter || undefined,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };

      notifySubscribers(nextConfig);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('taka_paint_categories_updated', {
            detail: nextConfig,
          })
        );
      }
    },
    (err) => {
      console.warn('[layoutPaintCategoriesService] onSnapshot error:', err);
    }
  );
}

/**
 * Real-time listener for taka_config/paint_categories filter data across all devices and users
 */
export function subscribePaintCategoriesConfig(
  onUpdate: (config: PaintCategoriesConfig) => void
): Unsubscribe {
  subscribers.add(onUpdate);

  // Immediately deliver cached state on mount (0ms)
  onUpdate({
    categories: getSavedCustomPaintCategories(),
    groupMappings: getSavedPaintGroupMappings(),
    activePaintFilter: getSavedActivePaintFilter(),
  });

  ensureSharedListener();

  return () => {
    subscribers.delete(onUpdate);
    if (subscribers.size === 0 && sharedFirestoreUnsub) {
      sharedFirestoreUnsub();
      sharedFirestoreUnsub = null;
    }
  };
}
