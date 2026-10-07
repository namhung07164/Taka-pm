import { collection, query, where, limit, getDocsFromCache, getDocsFromServer } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { getLocalTasks, bulkPersistTasks } from './localDb';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { Task } from '../types';

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
    // 1. Kiểm tra dữ liệu trong Dexie Local DB trước (0 Read Firestore)
    const localTasks = await getLocalTasks();

    if (localTasks && localTasks.length > 0) {
      const filtered = filterTasksForNotificationWindow(localTasks, past7, future14, maxCount);

      usePerformanceStore
        .getState()
        .trackGetDoc(
          'dexie_notif_tasks',
          true,
          filtered.length,
          `Notification tasks from Dexie Local DB (0 Firestore Read, pool: ${localTasks.length})`
        );

      return filtered;
    }

    // 2. Fallback: Nếu Dexie hoàn toàn rỗng (Cold Boot / Incognito) và chưa bị vô hiệu hóa
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
