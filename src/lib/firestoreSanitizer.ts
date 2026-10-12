/**
 * Deeply strips `undefined` properties from objects/arrays so Firestore operations
 * (setDoc, updateDoc, writeBatch.set, writeBatch.update) never fail with:
 * "FirebaseError: Function WriteBatch.set() called with invalid data. Unsupported field value: undefined"
 *
 * Preserves custom objects/classes such as FieldValue (deleteField, serverTimestamp, increment)
 * and Date, RegExp, etc.
 */
export function removeUndefinedDeep<T = any>(val: T): T {
  if (val === undefined) {
    return undefined as unknown as T;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }

  // Handle Date
  if (val instanceof Date) {
    return val;
  }

  // Handle Arrays
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedDeep(item)) as unknown as T;
  }

  // If object is not a plain object (e.g., Firestore FieldValue like deleteField() or serverTimestamp())
  const proto = Object.getPrototypeOf(val);
  if (proto !== null && proto !== Object.prototype) {
    return val;
  }

  // Plain object: remove keys where value is undefined, recurse on nested values
  const result: Record<string, any> = {};
  for (const [key, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined) {
      result[key] = removeUndefinedDeep(v);
    }
  }
  return result as T;
}
