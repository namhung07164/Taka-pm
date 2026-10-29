import { getLocalSyncMeta, setLocalSyncMeta } from '../../lib/localDb';

export const MAX_DAILY_AI_QUOTA = 20;
const LOCAL_STORAGE_CACHE_KEY = 'taka_faq_ai_smart_cache_v1';
const MAX_LOCAL_CACHE_ENTRIES = 100;

interface CachedFaqItem {
  key: string;
  question: string;
  answer: string;
  lang: 'vi' | 'en';
  updatedAt: number;
}

/**
 * Chuẩn hóa câu hỏi để làm khóa tra cứu Smart Cache (không phân biệt hoa thường, khoảng trắng thừa)
 */
export function normalizeFaqCacheKey(question: string, lang: 'vi' | 'en'): string {
  const normalized = question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9#%+]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120);
  return `faq_ai_${lang}_${normalized}`;
}

/**
 * Lấy chuỗi ngày hiện tại YYYY-MM-DD theo múi giờ máy khách
 */
export function getTodayQuotaStorageKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `taka_ai_quota_${yyyy}-${mm}-${dd}`;
}

/**
 * Kiểm tra trạng thái hạn mức (Daily Quota) 20 câu hỏi AI mới / ngày
 */
export function getDailyAiQuotaStatus(): {
  used: number;
  limit: number;
  remaining: number;
  isExceeded: boolean;
  storageKey: string;
} {
  const storageKey = getTodayQuotaStorageKey();
  let used = 0;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        used = parsed;
      }
    }
  } catch {
    used = 0;
  }
  const remaining = Math.max(0, MAX_DAILY_AI_QUOTA - used);
  return {
    used,
    limit: MAX_DAILY_AI_QUOTA,
    remaining,
    isExceeded: used >= MAX_DAILY_AI_QUOTA,
    storageKey
  };
}

/**
 * Tăng bộ đếm Quota sau khi gọi Gemini AI thành công (chỉ tính câu hỏi mới chưa có trong Cache)
 */
export function incrementDailyAiQuota(): {
  used: number;
  limit: number;
  remaining: number;
  isExceeded: boolean;
} {
  const current = getDailyAiQuotaStatus();
  const nextUsed = current.used + 1;
  try {
    localStorage.setItem(current.storageKey, String(nextUsed));
  } catch {
    // Bỏ qua nếu trình duyệt chặn LocalStorage
  }
  return {
    used: nextUsed,
    limit: MAX_DAILY_AI_QUOTA,
    remaining: Math.max(0, MAX_DAILY_AI_QUOTA - nextUsed),
    isExceeded: nextUsed >= MAX_DAILY_AI_QUOTA
  };
}

/**
 * Tầng 3 (Smart Cache - Đọc): Tra cứu câu trả lời từ Dexie.js (IndexedDB) trước, fallback sang LocalStorage
 */
export async function getSmartCachedAiAnswer(
  question: string,
  lang: 'vi' | 'en'
): Promise<string | null> {
  const cacheKey = normalizeFaqCacheKey(question, lang);

  // 1. Ưu tiên đọc từ Dexie.js IndexedDB (TakaLocalDB.syncMeta)
  try {
    const dexieRaw = await getLocalSyncMeta(cacheKey);
    if (dexieRaw) {
      const parsed = JSON.parse(dexieRaw) as CachedFaqItem;
      if (parsed && typeof parsed.answer === 'string' && parsed.answer.trim()) {
        return parsed.answer;
      }
    }
  } catch {
    // Fallback xuống LocalStorage nếu IndexedDB bị khóa
  }

  // 2. Đọc từ LocalStorage LRU Cache
  try {
    const rawList = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
    if (rawList) {
      const list = JSON.parse(rawList) as CachedFaqItem[];
      if (Array.isArray(list)) {
        const found = list.find(item => item.key === cacheKey);
        if (found && found.answer) {
          return found.answer;
        }
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Tầng 3 (Smart Cache - Ghi): Lưu câu trả lời của Gemini vào cả Dexie.js và LocalStorage (Non-blocking microtask)
 */
export function saveSmartCachedAiAnswer(
  question: string,
  answer: string,
  lang: 'vi' | 'en'
): void {
  const cleanAnswer = answer.trim();
  if (!cleanAnswer) return;

  const cacheKey = normalizeFaqCacheKey(question, lang);
  const entry: CachedFaqItem = {
    key: cacheKey,
    question: question.trim(),
    answer: cleanAnswer,
    lang,
    updatedAt: Date.now()
  };

  setTimeout(() => {
    // 1. Lưu vào Dexie.js IndexedDB
    setLocalSyncMeta(cacheKey, JSON.stringify(entry)).catch(() => {});

    // 2. Lưu vào LocalStorage LRU (giữ tối đa 100 câu hỏi phổ biến nhất)
    try {
      const rawList = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
      const list: CachedFaqItem[] = rawList ? JSON.parse(rawList) : [];
      const filtered = Array.isArray(list) ? list.filter(x => x.key !== cacheKey) : [];
      filtered.unshift(entry);
      const trimmed = filtered.slice(0, MAX_LOCAL_CACHE_ENTRIES);
      localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore quota errors on localStorage
    }
  }, 0);
}
