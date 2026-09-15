export const safeGetItemLocal = (key: string): string | null => {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
};
export const safeSetItemLocal = (key: string, value: string): void => {
  try { window.localStorage.setItem(key, value); } catch (e) {}
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
