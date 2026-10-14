// Chuyển updatedAt (ISO string / Firestore Timestamp / number) về ms
export const tsOf = (v: any): number => {
  if (!v) return 0;
  const n =
    typeof v === "string" ? Date.parse(v)
    : typeof v?.toMillis === "function" ? v.toMillis()
    : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Snapshot lấy từ cache cục bộ có thể cũ hơn dữ liệu đã nhận qua delta -> không cho ghi đè.
// Chỉ áp dụng cho snapshot fromCache; snapshot từ server luôn được tin (tránh lệch đồng hồ)
export const isStaleCacheDoc = (existing: any, incoming: any): boolean => {
  if (!existing) return false;
  const e = tsOf(existing.updatedAt);
  const i = tsOf(incoming?.updatedAt);
  return e > 0 && i > 0 && i < e;
};

export function extractKeysToHydrate(activeProjectIds: string[], currentProjects: any[]): Set<string> {
  const keysToHydrate = new Set<string>();
  activeProjectIds.forEach((id) => {
    keysToHydrate.add(String(id));
    const matched = currentProjects.find(
      (p) =>
        String(p.id || "") === String(id) ||
        String(p.no) === String(id) ||
        String(p.code || "") === String(id) ||
        `${p.code}-${p.year}-${p.store}-${p.no}` === String(id)
    );
    if (matched) {
      if (matched.id) keysToHydrate.add(String(matched.id));
      if (matched.code) keysToHydrate.add(String(matched.code));
      if (matched.linkCodes) {
        matched.linkCodes.split(/[,;/]+/).forEach((c: string) => {
          if (c.trim()) keysToHydrate.add(c.trim());
        });
      }
    }
  });
  return keysToHydrate;
}

export function groupActiveProjectsByYear(
  activeProjectIds: string[],
  currentProjects: any[],
  globalYearFilter: string
): Map<string, Array<{ id: string; code: string }>> {
  const projectsByYear = new Map<string, Array<{ id: string; code: string }>>();
  activeProjectIds.forEach((projectId) => {
    const proj = currentProjects.find(
      (p) =>
        String(p.id || "") === String(projectId) ||
        String(p.no) === String(projectId) ||
        String(p.code || "") === String(projectId) ||
        `${p.code}-${p.year}-${p.store}-${p.no}` === String(projectId)
    );
    const codeToQuery = proj?.code || String(projectId);
    const yearToGroup = proj?.year
      ? String(proj.year).trim()
      : proj?.start
      ? String(proj.start).substring(0, 4)
      : globalYearFilter !== "all"
      ? globalYearFilter
      : "2026";

    let list = projectsByYear.get(yearToGroup);
    if (!list) {
      list = [];
      projectsByYear.set(yearToGroup, list);
    }
    list.push({ id: String(projectId), code: codeToQuery });
  });
  return projectsByYear;
}
