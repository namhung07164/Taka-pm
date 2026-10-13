import { ComponentType, LazyExoticComponent, lazy } from 'react';

/**
 * Robust lazy loader with exponential backoff retry and chunk error handling.
 * Recovers from "Importing a module script failed" / "Failed to fetch dynamically imported module"
 * errors caused by network glitches, dev server restarts, or stale bundle hashes.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<any>,
  namedExport?: string,
  retriesLeft = 3,
  interval = 400
): LazyExoticComponent<T> {
  return lazy(() => {
    return new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (remaining: number, delay: number) => {
        componentImport()
          .then((module: any) => {
            if (namedExport && module[namedExport]) {
              resolve({ default: module[namedExport] });
            } else if (module.default) {
              resolve({ default: module.default });
            } else {
              const firstKey = Object.keys(module)[0];
              if (firstKey && module[firstKey]) {
                resolve({ default: module[firstKey] });
              } else {
                reject(new Error(`Module does not export component "${namedExport || 'default'}"`));
              }
            }
          })
          .catch((error: any) => {
            const errorMsg = String(error?.message || error || '');
            const isModuleScriptError =
              errorMsg.includes('Importing a module script failed') ||
              errorMsg.includes('Failed to fetch dynamically imported module') ||
              errorMsg.includes('error loading dynamically imported module') ||
              errorMsg.includes('dynamically imported module') ||
              errorMsg.includes('Loading chunk') ||
              errorMsg.includes('MIME type') ||
              errorMsg.includes('not a valid JavaScript MIME type') ||
              error?.name === 'ChunkLoadError';

            if (remaining > 0 && isModuleScriptError) {
              setTimeout(() => {
                attempt(remaining - 1, delay * 1.5);
              }, delay);
            } else if (isModuleScriptError) {
              // If all retries failed and it is a chunk load error, try reloading once per session
              const reloadKey = 'chunk_reload_' + (namedExport || 'app');
              const hasReloaded = window.sessionStorage.getItem(reloadKey);
              if (!hasReloaded) {
                window.sessionStorage.setItem(reloadKey, 'true');
                window.location.reload();
                return;
              }
              window.sessionStorage.removeItem(reloadKey);
              reject(error);
            } else {
              reject(error);
            }
          });
      };

      attempt(retriesLeft, interval);
    });
  });
}
