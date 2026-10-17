/**
 * summaryAuditService.ts
 *
 * Kiểm tra chéo 3 lớp dữ liệu:
 *   (1) Task thật trên Firestore  (nguồn sự thật)
 *   (2) "Summary" của từng dự án trên Firestore (taskCount + taskSummaries trong tài liệu dự án)
 *   (3) Dữ liệu đang giữ trên thiết bị này (Zustand + Dexie)
 *
 * Quy trình: đọc toàn bộ dự án và task từ SERVER một lần (tốn đúng bằng số tài liệu), rồi so sánh.
 * Chỉ dùng thủ công (admin). Đọc: số dự án + số task. Không ghi gì cho đến khi bấm sửa.
 */
import { collection, getDocsFromServer } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { Project, Task } from '../types';
import {
  calculateProjectComputedDates,
  syncProjectDatesToFirestore,
  matchProjectCode,
} from './projectDatesService';
import { normalizeStoreCode, normalizeYearString } from './taskDeduplicationService';
import { bulkPersistTasks, bulkPersistProjects, deleteLocalRecord } from './localDb';

const RECENT_EDIT_GUARD_MS = 10 * 60 * 1000; // task sửa trong 10 phút gần đây: không coi là "thừa" trên thiết bị

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

const identityKey = (code: unknown, store: unknown, year: unknown): string =>
  `${norm(code)}__${normalizeStoreCode(store as any)}__${normalizeYearString(year as any)}`;

export interface AuditRow {
  projectId: string;
  code: string;
  store: string;
  year: string;
  serverTaskCount: number; // số task thật (chưa xóa) thuộc dự án trên Firestore
  summaryTaskCount: number; // project.taskCount trên Firestore
  summaryEntryCount: number; // độ dài taskSummaries trên Firestore
  missingInSummary: string[]; // task thật nhưng không có trong summary
  ghostInSummary: string[]; // mục summary không có task thật tương ứng
  noIdEntries: number; // mục summary không có id
  countMismatch: boolean;
  summaryIssue: boolean;
  loadedLocally: boolean; // thiết bị này đã nạp task của dự án
  missingLocal: string[]; // task có trên server nhưng thiết bị chưa có
  ghostLocal: string[]; // task thiết bị có nhưng server không có
  localProjectStale: boolean; // bản dự án trên thiết bị khác bản trên server
  deviceIssue: boolean;
}

export interface AuditReport {
  generatedAt: number;
  projectCount: number;
  taskCount: number;
  orphanCount: number; // task không thuộc dự án nào
  ambiguousCount: number; // task khớp nhiều dự án
  issues: AuditRow[];
  internal: {
    projects: Map<string, Project>;
    ownerTasks: Map<string, Task[]>;
    serverTasksById: Map<string, Task>;
  };
}

type OwnerResult = { owner?: Project; status: 'ok' | 'ambiguous' | 'orphan' };

function buildOwnerResolver(projects: Project[]) {
  const byId = new Map<string, Project>();
  const byIdentity = new Map<string, Project[]>();
  projects.forEach((p) => {
    if (p.id) byId.set(String(p.id), p);
    const k = identityKey(p.code, p.store, p.year);
    const arr = byIdentity.get(k);
    if (arr) arr.push(p);
    else byIdentity.set(k, [p]);
  });

  return (t: Task): OwnerResult => {
    if (t.projectId) {
      const p = byId.get(String(t.projectId));
      return p ? { owner: p, status: 'ok' } : { status: 'orphan' };
    }
    const exact = byIdentity.get(identityKey(t.projectCode, t.projectStore, t.projectYear));
    if (exact && exact.length === 1) return { owner: exact[0], status: 'ok' };
    if (exact && exact.length > 1) return { status: 'ambiguous' };

    // Task cũ thiếu store/year, hoặc dự án nhiều mã (linkCodes): khớp theo mã, chỉ nhận khi duy nhất
    const sameStore = (p: Project) =>
      !t.projectStore || normalizeStoreCode(p.store) === normalizeStoreCode(t.projectStore as any);
    const sameYear = (p: Project) =>
      t.projectYear === undefined ||
      t.projectYear === null ||
      t.projectYear === '' ||
      normalizeYearString(p.year as any) === normalizeYearString(t.projectYear as any);
    const candidates = projects.filter(
      (p) =>
        sameStore(p) &&
        sameYear(p) &&
        (matchProjectCode(p.code, t.projectCode) || matchProjectCode((p as any).linkCodes, t.projectCode))
    );
    if (candidates.length === 1) return { owner: candidates[0], status: 'ok' };
    if (candidates.length > 1) return { status: 'ambiguous' };
    return { status: 'orphan' };
  };
}

const isRecent = (t: Task): boolean => {
  const ts = t.updatedAt ? new Date(t.updatedAt as any).getTime() : 0;
  return ts > 0 && Date.now() - ts < RECENT_EDIT_GUARD_MS;
};

export async function runSummaryAudit(onProgress?: (msg: string) => void): Promise<AuditReport> {
  onProgress?.('Đang đọc dự án từ Firestore (server)...');
  const projSnap = await getDocsFromServer(
    collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects')
  );
  const projects = projSnap.docs
    .map((d) => ({ ...(d.data() as any), id: d.id } as Project))
    .filter((p) => !p.isDeleted);

  onProgress?.(`Đã đọc ${projects.length} dự án. Đang đọc task từ Firestore (server)...`);
  const taskSnap = await getDocsFromServer(
    collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks')
  );
  const serverTasks = taskSnap.docs
    .map((d) => ({ ...(d.data() as any), id: d.id } as Task))
    .filter((t) => !t.isDeleted);

  onProgress?.(`Đã đọc ${serverTasks.length} task. Đang đối chiếu...`);

  const resolve = buildOwnerResolver(projects);
  const projectsById = new Map<string, Project>();
  projects.forEach((p) => p.id && projectsById.set(String(p.id), p));

  const serverTasksById = new Map<string, Task>();
  const ownerTasks = new Map<string, Task[]>();
  let orphanCount = 0;
  let ambiguousCount = 0;
  serverTasks.forEach((t) => {
    serverTasksById.set(t.id, t);
    const r = resolve(t);
    if (r.status === 'ok' && r.owner?.id) {
      const k = String(r.owner.id);
      const arr = ownerTasks.get(k);
      if (arr) arr.push(t);
      else ownerTasks.set(k, [t]);
    } else if (r.status === 'ambiguous') ambiguousCount++;
    else orphanCount++;
  });

  // Dữ liệu trên thiết bị này
  const st = useAppStore.getState();
  const localTasks: Task[] = (st.tasks || []).filter((t) => !t.isDeleted && !String(t.id).startsWith('ts_'));
  const localProjects: Project[] = st.projects || [];
  const localProjectsById = new Map<string, Project>();
  localProjects.forEach((p) => p.id && localProjectsById.set(String(p.id), p));
  const localOwner = new Map<string, Task[]>();
  localTasks.forEach((t) => {
    const r = resolve(t);
    if (r.status === 'ok' && r.owner?.id) {
      const k = String(r.owner.id);
      const arr = localOwner.get(k);
      if (arr) arr.push(t);
      else localOwner.set(k, [t]);
    }
  });

  const issues: AuditRow[] = [];
  projects.forEach((p) => {
    const pid = String(p.id);
    const owned = ownerTasks.get(pid) || [];
    const ownedIds = new Set(owned.map((t) => t.id));
    const expectedSummaryIds = new Set(
      owned.filter((t) => t.name || t.start || t.finish).map((t) => t.id)
    );

    const summaries: any[] = Array.isArray(p.taskSummaries) ? (p.taskSummaries as any[]) : [];
    const summaryIds = new Set<string>();
    let noIdEntries = 0;
    summaries.forEach((s) => {
      if (s && s.id) summaryIds.add(String(s.id));
      else noIdEntries++;
    });

    const missingInSummary = [...expectedSummaryIds].filter((id) => !summaryIds.has(id));
    const ghostInSummary = [...summaryIds].filter((id) => !ownedIds.has(id));
    const countMismatch = Number(p.taskCount ?? 0) !== owned.length;
    const summaryIssue =
      missingInSummary.length > 0 || ghostInSummary.length > 0 || noIdEntries > 0 || countMismatch;

    const localOwned = localOwner.get(pid) || [];
    const localIds = new Set(localOwned.map((t) => t.id));
    const loadedLocally = localOwned.length > 0;
    const missingLocal = loadedLocally ? [...ownedIds].filter((id) => !localIds.has(id)) : [];
    const ghostLocal = loadedLocally
      ? localOwned.filter((t) => !serverTasksById.has(t.id) && !isRecent(t)).map((t) => t.id)
      : [];
    const lp = localProjectsById.get(pid);
    const localProjectStale = lp
      ? Number(lp.taskCount ?? 0) !== Number(p.taskCount ?? 0) ||
        (lp.taskSummaries?.length ?? 0) !== summaries.length
      : false;
    const deviceIssue = missingLocal.length > 0 || ghostLocal.length > 0 || localProjectStale;

    if (summaryIssue || deviceIssue) {
      issues.push({
        projectId: pid,
        code: String(p.code || ''),
        store: String(p.store || ''),
        year: String(p.year ?? ''),
        serverTaskCount: owned.length,
        summaryTaskCount: Number(p.taskCount ?? 0),
        summaryEntryCount: summaries.length,
        missingInSummary,
        ghostInSummary,
        noIdEntries,
        countMismatch,
        summaryIssue,
        loadedLocally,
        missingLocal,
        ghostLocal,
        localProjectStale,
        deviceIssue,
      });
    }
  });

  issues.sort((a, b) => a.code.localeCompare(b.code));
  return {
    generatedAt: Date.now(),
    projectCount: projects.length,
    taskCount: serverTasks.length,
    orphanCount,
    ambiguousCount,
    issues,
    internal: { projects: projectsById, ownerTasks, serverTasksById },
  };
}

/**
 * Sửa summary trên Firestore: dựng lại taskCount + taskSummaries CHỈ từ task thật (không gộp summary cũ).
 * Bỏ qua dự án mà server không có task nào nhưng summary đang có dữ liệu (cần xem thủ công).
 */
export async function repairServerSummaries(
  report: AuditReport,
  onProgress?: (done: number, total: number) => void
): Promise<{ fixed: number; skippedEmpty: number }> {
  if (Date.now() - report.generatedAt > 10 * 60 * 1000) {
    throw new Error('Báo cáo đã cũ hơn 10 phút. Hãy chạy kiểm tra lại trước khi sửa.');
  }
  const targets = report.issues.filter((r) => r.summaryIssue);
  let fixed = 0;
  let skippedEmpty = 0;

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    onProgress?.(i + 1, targets.length);
    const serverProject = report.internal.projects.get(row.projectId);
    if (!serverProject) continue;
    if (row.serverTaskCount === 0 && (row.summaryTaskCount > 0 || row.summaryEntryCount > 0)) {
      skippedEmpty++;
      continue;
    }

    // Đưa bản server vào store trước để phép so sánh "dirty check" trong syncProjectDatesToFirestore
    // so với dữ liệu server chứ không phải bản cục bộ cũ.
    const st = useAppStore.getState();
    if (st.projects.some((p) => p.id === row.projectId)) {
      st.setProjects(
        st.projects.map((p) => (p.id === row.projectId ? ({ ...p, ...serverProject } as Project) : p))
      );
    }

    const owned = report.internal.ownerTasks.get(row.projectId) || [];
    const computed = calculateProjectComputedDates(
      { ...serverProject, taskSummaries: [] } as Project,
      owned,
      useAppStore.getState().delegationGroups || []
    );
    await syncProjectDatesToFirestore(row.projectId, computed);
    fixed++;
  }
  return { fixed, skippedEmpty };
}

/**
 * Sửa dữ liệu trên thiết bị này theo Firestore:
 *  - thêm task còn thiếu, xóa task thừa (không động đến task sửa trong 10 phút gần đây)
 *  - thay bản dự án cũ bằng bản server (Zustand + Dexie)
 */
export async function repairLocalDevice(
  report: AuditReport
): Promise<{ added: number; removed: number; projectsRefreshed: number }> {
  if (Date.now() - report.generatedAt > 10 * 60 * 1000) {
    throw new Error('Báo cáo đã cũ hơn 10 phút. Hãy chạy kiểm tra lại trước khi sửa.');
  }
  const st = useAppStore.getState();
  const toDelete = new Set<string>();
  const toAddMap = new Map<string, Task>();
  const staleProjectIds = new Set<string>();

  report.issues
    .filter((r) => r.deviceIssue)
    .forEach((r) => {
      r.ghostLocal.forEach((id) => toDelete.add(id));
      r.missingLocal.forEach((id) => {
        const t = report.internal.serverTasksById.get(id);
        if (t) toAddMap.set(id, t);
      });
      if (r.localProjectStale) staleProjectIds.add(r.projectId);
    });

  const currentTasks = st.tasks || [];
  const kept = currentTasks.filter((t) => !toDelete.has(t.id));
  const existingIds = new Set(kept.map((t) => t.id));
  const added = [...toAddMap.values()].filter((t) => !existingIds.has(t.id));
  st.setTasks([...kept, ...added]);

  if (added.length > 0) await bulkPersistTasks(added);
  for (const id of toDelete) {
    await deleteLocalRecord('taka_tasks', id).catch(() => {});
  }

  let projectsRefreshed = 0;
  if (staleProjectIds.size > 0) {
    const refreshed: Project[] = [];
    const nextProjects = (st.projects || []).map((p) => {
      if (p.id && staleProjectIds.has(String(p.id))) {
        const sp = report.internal.projects.get(String(p.id));
        if (sp) {
          const merged = { ...p, ...sp } as Project;
          refreshed.push(merged);
          projectsRefreshed++;
          return merged;
        }
      }
      return p;
    });
    useAppStore.getState().setProjects(nextProjects);
    if (refreshed.length > 0) await bulkPersistProjects(refreshed);
  }

  return { added: added.length, removed: toDelete.size, projectsRefreshed };
}
