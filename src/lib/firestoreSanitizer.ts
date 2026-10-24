const TRANSIENT_FIRESTORE_KEYS = new Set([
  '_isVirtualSummary',
  'realtimeUpdate',
  'importComment',
  'parentTaskCode',
  'parentTaskName',
]);

/**
 * Deeply strips `undefined` properties and transient runtime-only flags from objects/arrays
 * so Firestore operations never fail on `undefined` or store temporary UI/import garbage.
 *
 * Preserves custom objects/classes such as FieldValue (deleteField, serverTimestamp, increment)
 * and Date, RegExp, etc.
 */
export function removeUndefinedDeep<T = any>(val: T, seen?: WeakSet<object>): T {
  if (val === undefined || typeof val === 'function') {
    return undefined as unknown as T;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }

  // Handle Date
  if (val instanceof Date) {
    return val;
  }

  // Guard against circular references
  const visited = seen || new WeakSet<object>();
  if (visited.has(val as object)) {
    return undefined as unknown as T;
  }

  // Handle Arrays
  if (Array.isArray(val)) {
    visited.add(val);
    return val
      .filter((item) => item !== undefined && typeof item !== 'function')
      .map((item) => removeUndefinedDeep(item, visited)) as unknown as T;
  }

  // If object is not a plain object (e.g., Firestore FieldValue like deleteField() or serverTimestamp())
  const proto = Object.getPrototypeOf(val);
  if (proto !== null && proto !== Object.prototype) {
    return val;
  }

  visited.add(val as object);

  // Plain object: remove keys where value is undefined, function, or transient runtime-only key
  const result: Record<string, any> = {};
  for (const [key, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined && typeof v !== 'function' && !TRANSIENT_FIRESTORE_KEYS.has(key)) {
      const cleaned = removeUndefinedDeep(v, visited);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
  }
  return result as T;
}
