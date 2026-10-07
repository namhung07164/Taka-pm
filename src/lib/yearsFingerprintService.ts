import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { safeGetItemLocal, safeSetItemLocal } from './storage';
import { Project, Task, Cost } from '../types';

export interface YearMetaInfo {
  updatedAt: string;
  closed?: boolean;
  projectCount?: number;
  taskCount?: number;
  costCount?: number;
}

export type YearsMetaMap = Record<string, YearMetaInfo>;

const FINGERPRINT_CACHE_KEY = 'taka_years_meta_fingerprint_v1';
const DATA_CACHE_PREFIX = 'taka_year_data_v1_';

let memoryYearsMeta: YearsMetaMap | null = null;
let lastMetaFetchTime = 0;

/**
 * Cập nhật snapshot metadata vào bộ nhớ RAM (0 Firestore Read)
 */
export function setMemoryYearsMeta(meta: YearsMetaMap): void {
  memoryYearsMeta = meta;
  lastMetaFetchTime = Date.now();
}

/**
 * Lấy metadata hiện tại từ RAM nếu có
 */
export function getMemoryYearsMeta(): YearsMetaMap | null {
  return memoryYearsMeta;
}

/**
 * Lấy document metadata years_meta từ Firestore hoặc RAM cache (TTL 60s)
 */
export async function fetchYearsMeta(forceRefresh: boolean = false): Promise<YearsMetaMap> {
  const now = Date.now();
  if (!forceRefresh && memoryYearsMeta && (now - lastMetaFetchTime < 60000)) {
    return memoryYearsMeta;
  }

  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'years_meta');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as YearsMetaMap;
      memoryYearsMeta = data;
      lastMetaFetchTime = now;
      return data;
    }
  } catch (err) {
    console.warn('[yearsFingerprint] Unable to fetch remote years_meta:', err);
  }
  return memoryYearsMeta || {};
}

/**
 * Kiểm tra xem dữ liệu của một năm đã lưu trong Local Cache có khớp với phiên bản trên server hay không
 */
export function isYearCacheValid(year: string, remoteMeta: YearsMetaMap): boolean {
  if (!year || !remoteMeta[year]) return false;

  const localFingerprintRaw = safeGetItemLocal(FINGERPRINT_CACHE_KEY);
  if (!localFingerprintRaw) return false;

  try {
    const localFingerprint: Record<string, string> = JSON.parse(localFingerprintRaw);
    const remoteUpdatedAt = remoteMeta[year].updatedAt;
    const localUpdatedAt = localFingerprint[year];

    if (remoteUpdatedAt && localUpdatedAt && remoteUpdatedAt === localUpdatedAt) {
      // Check if data actually exists in local cache
      const cachedData = safeGetItemLocal(`${DATA_CACHE_PREFIX}${year}`);
      return !!cachedData;
    }
  } catch (e) {
    return false;
  }

  return false;
}

/**
 * Đọc dữ liệu đã cache của một năm từ Local Cache (0ms, 0 Read)
 */
export function loadYearDataFromLocal(year: string): {
  projects: Project[];
  tasks?: Task[];
  costs?: Cost[];
} | null {
  try {
    const raw = safeGetItemLocal(`${DATA_CACHE_PREFIX}${year}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[yearsFingerprint] Error parsing cached year ${year}:`, err);
    return null;
  }
}

/**
 * Lưu dữ liệu của một năm và cập nhật fingerprint vào Local Cache
 */
export function saveYearDataToLocal(
  year: string,
  updatedAt: string,
  data: { projects: Project[]; tasks?: Task[]; costs?: Cost[] }
): void {
  try {
    // 1. Lưu payload dữ liệu
    safeSetItemLocal(`${DATA_CACHE_PREFIX}${year}`, JSON.stringify(data));

    // 2. Cập nhật bảng fingerprint
    let localFingerprint: Record<string, string> = {};
    const localFingerprintRaw = safeGetItemLocal(FINGERPRINT_CACHE_KEY);
    if (localFingerprintRaw) {
      try {
        localFingerprint = JSON.parse(localFingerprintRaw);
      } catch {}
    }
    localFingerprint[year] = updatedAt;
    safeSetItemLocal(FINGERPRINT_CACHE_KEY, JSON.stringify(localFingerprint));
  } catch (err) {
    console.warn(`[yearsFingerprint] Failed to write cache for year ${year}:`, err);
  }
}

const pendingYearTouches = new Map<string, { timer: any; firstQueuedAt: number }>();

/**
 * Cập nhật timestamp cho một năm trên Firestore khi có bất kỳ mutation nào
 * Coalescing / Debounce 1.5s để gom nhiều mutation liên tiếp trong cùng năm thành 1 lần ghi Firestore duy nhất (Giảm 80-90% Write)
 */
export async function touchYearMeta(year: string): Promise<void> {
  if (!year || String(year).toLowerCase() === 'all') return;

  const now = Date.now();
  const existing = pendingYearTouches.get(year);

  if (existing) {
    if (now - existing.firstQueuedAt < 5000) {
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        flushTouchYearMeta(year);
      }, 1500);
      return;
    }
    return;
  }

  const timer = setTimeout(() => {
    flushTouchYearMeta(year);
  }, 1500);

  pendingYearTouches.set(year, { timer, firstQueuedAt: now });
}

async function flushTouchYearMeta(year: string): Promise<void> {
  pendingYearTouches.delete(year);
  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'years_meta');
    const now = new Date().toISOString();
    await setDoc(
      docRef,
      {
        [year]: {
          updatedAt: now,
        },
      },
      { merge: true }
    );
  } catch (err) {
    console.error('[yearsFingerprint] Failed to touch years_meta:', err);
  }
}

/**
 * Flush toàn bộ các năm còn đang chờ debounce trước khi đóng tab hoặc reload
 */
export async function flushAllPendingYearTouches(): Promise<void> {
  const years = Array.from(pendingYearTouches.keys());
  await Promise.all(years.map((y) => flushTouchYearMeta(y)));
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushAllPendingYearTouches();
  });
}
