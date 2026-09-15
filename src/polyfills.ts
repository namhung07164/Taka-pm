try {
  class MemoryStorage {
    private data: Record<string, string> = {};
    getItem(key: string) { return this.data.hasOwnProperty(key) ? this.data[key] : null; }
    setItem(key: string, value: string) { this.data[key] = String(value); }
    removeItem(key: string) { delete this.data[key]; }
    clear() { this.data = {}; }
    get length() { return Object.keys(this.data).length; }
    key(index: number) { return Object.keys(this.data)[index] || null; }
  }

  const mockLocal = new MemoryStorage();
  const mockSession = new MemoryStorage();

  let isLocalAccessible = true;
  try {
    window.localStorage.getItem('__test__');
  } catch (e) {
    isLocalAccessible = false;
  }

  let isSessionAccessible = true;
  try {
    window.sessionStorage.getItem('__test__');
  } catch (e) {
    isSessionAccessible = false;
  }

  if (!isLocalAccessible || !isSessionAccessible) {
    // 1. Try to redefine the properties on window
    try {
      if (!isLocalAccessible) {
        Object.defineProperty(window, 'localStorage', {
          get: () => mockLocal,
          configurable: true
        });
      }
      if (!isSessionAccessible) {
        Object.defineProperty(window, 'sessionStorage', {
          get: () => mockSession,
          configurable: true
        });
      }
    } catch (e) {
      console.warn("Could not redefine window.localStorage property.");
    }

    // 2. Monkey-patch Storage.prototype as a fallback
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalClear = Storage.prototype.clear;

    Storage.prototype.getItem = function(key: string) {
      try {
        return originalGetItem.call(this, key);
      } catch (e) {
        return mockLocal.getItem(key);
      }
    };
    Storage.prototype.setItem = function(key: string, value: string) {
      try {
        originalSetItem.call(this, key, value);
      } catch (e) {
        mockLocal.setItem(key, value);
      }
    };
    Storage.prototype.removeItem = function(key: string) {
      try {
        originalRemoveItem.call(this, key);
      } catch (e) {
        mockLocal.removeItem(key);
      }
    };
    Storage.prototype.clear = function() {
      try {
        originalClear.call(this);
      } catch (e) {
        mockLocal.clear();
      }
    };
  }
} catch (e) {
  console.warn("Polyfill initialization failed", e);
}
