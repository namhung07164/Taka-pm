export const safeGetItemLocal = (key: string): string | null => {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
};
export const safeSetItemLocal = (key: string, value: string): void => {
  try { 
    window.localStorage.setItem(key, value); 
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError' || e?.message?.includes('quota')) {
      cleanupBloatedStorage();
      try { window.localStorage.setItem(key, value); } catch (_) {}
    }
  }
};
export const safeRemoveItemLocal = (key: string): void => {
  try { window.localStorage.removeItem(key); } catch (e) {}
};

export const safeGetItemSession = (key: string): string | null => {
  try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
};
export const safeSetItemSession = (key: string, value: string): void => {
  try { window.sessionStorage.setItem(key, value); } catch (e) {}
};
export const safeRemoveItemSession = (key: string): void => {
  try { window.sessionStorage.removeItem(key); } catch (e) {}
};

export type DeviceScreenType = 'mobile' | 'tablet' | 'desktop';

export const getDeviceScreenType = (): DeviceScreenType => {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

/**
 * Returns a storage key tailored to the user's specific device screen profile.
 * Example: taka_gantt_scale_mobile, taka_gantt_visible_columns_u123_desktop
 */
export const getDeviceStorageKey = (baseKey: string, userId?: string): string => {
  const device = getDeviceScreenType();
  if (userId) {
    return `${baseKey}_${userId}_${device}`;
  }
  return `${baseKey}_${device}`;
};

/**
 * Safely reads a value with device-screen priority:
 * 1. user + device key (e.g. key_u123_mobile)
 * 2. device key (e.g. key_mobile)
 * 3. user key (e.g. key_u123)
 * 4. base key (e.g. key)
 */
export const safeGetDeviceItemLocal = (baseKey: string, userId?: string): string | null => {
  const device = getDeviceScreenType();
  if (userId) {
    const userDeviceVal = safeGetItemLocal(`${baseKey}_${userId}_${device}`);
    if (userDeviceVal !== null) return userDeviceVal;
  }
  const deviceVal = safeGetItemLocal(`${baseKey}_${device}`);
  if (deviceVal !== null) return deviceVal;
  if (userId) {
    const userVal = safeGetItemLocal(`${baseKey}_${userId}`);
    if (userVal !== null) return userVal;
  }
  return safeGetItemLocal(baseKey);
};

/**
 * Safely saves a value across device-specific and fallback keys.
 */
export const safeSetDeviceItemLocal = (baseKey: string, value: string, userId?: string): void => {
  const device = getDeviceScreenType();
  if (userId) {
    safeSetItemLocal(`${baseKey}_${userId}_${device}`, value);
  }
  safeSetItemLocal(`${baseKey}_${device}`, value);
  // Also keep baseKey up to date as general fallback
  safeSetItemLocal(baseKey, value);
};

/**
 * Remove bloated non-critical cache entries from localStorage to release quota
 * for critical systems like Firebase mutations and app configuration.
 */
export const cleanupBloatedStorage = (): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    // 1. Remove oversized floor plan backup if present (can always be loaded from Cloud/R2)
    window.localStorage.removeItem('taka_mapping_config_backup');

    // 2. Scan and remove orphaned/failed firestore mutations and large temporary caches
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) {
        if (
          key.startsWith('firestore_mutations_') ||
          key.startsWith('firestore_clients_') ||
          key.startsWith('taka_cache_') ||
          key.includes('mapping_config_backup')
        ) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((k) => {
      try { window.localStorage.removeItem(k); } catch (_) {}
    });
  } catch (_) {}
};

/**
 * Proactively verifies if localStorage has free quota on boot.
 * If quota is exceeded, automatically clears bloated caches.
 */
export const checkAndCleanStorageQuota = (): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    // Always prune oversized taka_mapping_config_backup if larger than 1MB
    const backup = window.localStorage.getItem('taka_mapping_config_backup');
    if (backup && backup.length > 1000000) {
      window.localStorage.removeItem('taka_mapping_config_backup');
    }

    const testKey = '__probe_storage_quota__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
  } catch (err: any) {
    console.warn('⚠️ LocalStorage quota exceeded on boot. Purging temporary caches...');
    cleanupBloatedStorage();
  }
};
