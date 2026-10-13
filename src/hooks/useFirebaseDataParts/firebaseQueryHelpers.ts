import { query, where } from "firebase/firestore";

export function buildStoreAndYearQuery(
  colRef: any,
  storeField: string,
  yearField: string,
  yearValue: string,
  userRole?: string,
  allowedStores: string[] = []
) {
  let q = colRef;

  // 1. Year Filter
  if (yearValue && String(yearValue).toLowerCase() !== "all") {
    q = query(q, where(yearField, "in", [String(yearValue), Number(yearValue)]));
  }

  // 2. Store Filter
  if (userRole !== "admin") {
    if (allowedStores.length === 0) {
      q = query(q, where(storeField, "==", "NONE_NO_ACCESS"));
    } else if (allowedStores.length === 1) {
      const singleStore = allowedStores[0];
      q = query(q, where(storeField, "in", [singleStore, singleStore.toLowerCase()]));
    }
  }

  return q;
}
