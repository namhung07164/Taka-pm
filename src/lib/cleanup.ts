import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "./storage";
export function cleanupLocalStorage() {
  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Clean up old notification metadata to prevent unbound growth
      if (key.startsWith('taka_notified_')) {
        try {
          const data = JSON.parse(safeGetItemLocal(key) || '[]');
          if (Array.isArray(data) && data.length > 300) {
            // Keep only the most recent 300 notification IDs
            safeSetItemLocal(key, JSON.stringify(data.slice(-300)));
            console.log(`[Cleanup] Trimmed notification history for ${key}`);
          }
        } catch (e) {
          keysToRemove.push(key); // Remove if malformed
        }
      }

      // Identify malformed or broken view preferences
      if (
        key.startsWith('taka_col_widths_') || 
        key.startsWith('taka_visible_cols_') ||
        key.startsWith('taka_delegation_') ||
        key.startsWith('taka_budget_') ||
        key.startsWith('taka_gantt_')
      ) {
        try {
          const val = safeGetItemLocal(key);
          if (val) {
            // If it's supposed to be an object/array, parse it.
            // If it fails, we remove it.
            if (val.startsWith('{') || val.startsWith('[')) {
              JSON.parse(val);
            }
          }
        } catch (e) {
          keysToRemove.push(key);
        }
      }
    }

    // Remove identified bad keys
    if (keysToRemove.length > 0) {
      keysToRemove.forEach(key => {
        safeRemoveItemLocal(key);
      });
      console.log(`[Cleanup] Removed ${keysToRemove.length} broken/outdated keys.`);
    } else {
      console.log('[Cleanup] LocalStorage is clean.');
    }
  } catch (error) {
    console.error('[Cleanup] Error during LocalStorage cleanup:', error);
  }
}
