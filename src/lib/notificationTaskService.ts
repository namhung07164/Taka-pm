import { collection, query, where, limit, getDocsFromCache, getDocsFromServer, setDoc, doc } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { getLocalTasks, bulkPersistTasks } from './localDb';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { Task } from '../types';

/**
 * Lưu Task thông báo (không làm crash app nếu doc chưa tồn tại)
 */
export async function saveNotificationTask(taskId: string, data: Partial<Task>): Promise<void> {
  if (!taskId) return;
  try {
    const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId);
    
    // Tuyệt đối không dùng updateDoc (gây crash 404). Dùng setDoc merge: true.
    // Bảo đảm luôn có identification keys để multi-device sync không bị lạc trôi
    const payload = {
      ...data,
      updatedAt: new Date().toISOString()
    };

    await setDoc(taskRef, payload, { merge: true });

    // Phát delta để các máy khác biết
    const { recordDelta } = await import('./deltaSyncService');
    recordDelta({
      docId: taskId,
      collectionName: 'taka_tasks',
      action: 'update',
      isPatch: true,
      data: payload,
      year: data.projectYear ? String(data.projectYear) : undefined
    }).catch(() => {});

  } catch (err) {
    console.warn("[saveNotificationTask] Failed to save notification task:", err);
  }
}

/**
 * Returns the standard notification date window:
 * - Past 7 days (to detect overdue/recent tasks)
 * - Future 14 days (to detect upcoming deadlines)
 */
export function getNotificationDateRange(referenceDate: Date = new Date()): { past7: string; future14: string } {
  const past7 = new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
  const future14 = new Date(referenceDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
  return { past7, future14 };
}

/**
 * Filters a list of tasks for deadline notifications within the target window.
 */
export function filterTasksForNotificationWindow(
  tasks: Task[],
  past7: string,
  future14: string,
  maxCount: number = 50
): Task[] {
  if (!tasks || tasks.length === 0) return [];

  const matched = tasks.filter((t) => {
    if (t.isDeleted) return false;
    if (!t.finish) return false;
    const finishDate = t.finish.substring(0, 10);
    return finishDate >= past7 && finishDate <= future14;
  });

  matched.sort((a, b) => (a.finish || '').localeCompare(b.finish || ''));
  return matched.slice(0, maxCount);
}

/**
 * Loads tasks for notification bell / deadline monitoring.
 *
 * Tối ưu hóa Firestore Read (Phương pháp 1):
 * - Ưu tiên 1 (Cache-First): Đọc 100% từ Dexie Local-First DB (0ms, 0 Firestore Read).
 * - Ưu tiên 2 (Cold-Boot Fallback): Chỉ khi Dexie hoàn toàn rỗng (lần đầu vào app trên máy mới/Incognito),
 *   mới kích hoạt truy vấn 50 tasks từ Firestore, sau đó lưu ngay vào Dexie để lần sau tiếp tục đạt 0 Read.
 */
export async function loadNotificationTasks(options?: {
  referenceDate?: Date;
  maxCount?: number;
  skipFirestoreFallback?: boolean;
}): Promise<Task[]> {
  const { past7, future14 } = getNotificationDateRange(options?.referenceDate);
  const maxCount = options?.maxCount || 50;

  try {
    // 1. Kiểm tra dữ liệu trong Zustand RAM, Dexie Local DB và Project taskSummaries (0 Read Firestore)
    const { useAppStore } = await import('../store/useAppStore');
    const store = useAppStore.getState();
    const storeTasks = store.tasks || [];

    const summaryTasks: Task[] = [];
    if (store.projects) {
      store.projects.forEach((p) => {
        if (p.taskSummaries && Array.isArray(p.taskSummaries)) {
          p.taskSummaries.forEach((ts) => {
            if (ts && ts.id) {
              summaryTasks.push({
                id: ts.id,
                name: ts.name || '',
                start: ts.start || '',
                finish: ts.finish || '',
                status: ts.status || 'On process',
                projectCode: p.code,
                projectStore: p.store,
                projectYear: p.year,
                party: ts.party,
              } as unknown as Task);
            }
          });
        }
      });
    }

    const localTasks = await getLocalTasks();
    const combinedMap = new Map<string, Task>();

    summaryTasks.forEach((t) => combinedMap.set(t.id, t));
    localTasks.forEach((t) => combinedMap.set(t.id, t));
    storeTasks.forEach((t) => combinedMap.set(t.id, t));

    const combinedPool = Array.from(combinedMap.values());

    if (combinedPool.length > 0) {
      const filtered = filterTasksForNotificationWindow(combinedPool, past7, future14, maxCount);

      usePerformanceStore
        .getState()
        .trackGetDoc(
          'local_notif_tasks',
          true,
          filtered.length,
          `Notification tasks from RAM/Dexie/Summaries (0 Firestore Read, pool: ${combinedPool.length})`
        );

      return filtered;
    }

    // 2. Fallback: Nếu hoàn toàn rỗng (Cold Boot / Incognito) và chưa bị vô hiệu hóa
    if (options?.skipFirestoreFallback) {
      return [];
    }

    const qNotifTasks = query(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks'),
      where('finish', '>=', past7),
      where('finish', '<=', future14),
      limit(maxCount)
    );

    let snapshot;
    try {
      snapshot = await getDocsFromCache(qNotifTasks);
      if (snapshot.empty) {
        snapshot = await getDocsFromServer(qNotifTasks);
      }
    } catch {
      snapshot = await getDocsFromServer(qNotifTasks);
    }

    const loadedNotifTasks: Task[] = [];
    snapshot.forEach((docSnap) => {
      const data = { id: docSnap.id, ...docSnap.data() } as Task;
      if (!data.isDeleted) {
        loadedNotifTasks.push(data);
      }
    });

    // Lưu vào Dexie để các lần kiểm tra tiếp theo không phải đọc Firestore nữa
    if (loadedNotifTasks.length > 0) {
      bulkPersistTasks(loadedNotifTasks).catch((e) => {
        console.warn('[notificationTaskService] Error caching notif tasks to Dexie:', e);
      });
    }

    usePerformanceStore
      .getState()
      .trackGetDoc(
        'firestore_notif_tasks_fallback',
        false,
        loadedNotifTasks.length,
        'Cold-boot notification tasks loaded from Firestore and cached to Dexie'
      );

    return loadedNotifTasks;
  } catch (err) {
    console.warn('[notificationTaskService] Failed to load notification tasks:', err);
    return [];
  }
}
