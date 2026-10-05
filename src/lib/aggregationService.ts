import {
  collection,
  query,
  where,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  average,
} from 'firebase/firestore';
import { db, APP_ID } from './firebase';

export interface CollectionCountParams {
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs';
  year?: string;
  store?: string;
}

/**
 * Đếm số lượng document trực tiếp từ Firestore Server (chỉ tính 1 READ cho toàn bộ kết quả đếm)
 */
export async function getCollectionCount({
  collectionName,
  year,
  store,
}: CollectionCountParams): Promise<number> {
  try {
    let q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', collectionName));

    if (year && String(year).toLowerCase() !== 'all') {
      q = query(q, where('year', 'in', [String(year), Number(year)]));
    }

    if (store && String(store).toLowerCase() !== 'all') {
      q = query(q, where('store', 'in', [store, store.toLowerCase()]));
    }

    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (err) {
    console.warn(`[aggregationService] Error getting count for ${collectionName}:`, err);
    return 0;
  }
}

/**
 * Tính tổng chi phí / ngân sách tài chính bằng Firestore Aggregation Query
 * Trả về tổng mà không cần tải hàng trăm/nghìn documents về client
 */
export async function getFinancialAggregates(
  year?: string,
  store?: string
): Promise<{
  totalBudget: number;
  totalActual: number;
  docCount: number;
}> {
  try {
    let q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs'));

    if (year && String(year).toLowerCase() !== 'all') {
      q = query(q, where('year', 'in', [String(year), Number(year)]));
    }

    if (store && String(store).toLowerCase() !== 'all') {
      q = query(q, where('store', 'in', [store, store.toLowerCase()]));
    }

    // Tận dụng getAggregateFromServer với sum
    const snapshot = await getAggregateFromServer(q, {
      totalBudget: sum('budget'),
      totalActual: sum('actualPaymentTotal'),
    });

    const data = snapshot.data();
    const countSnap = await getCountFromServer(q);

    return {
      totalBudget: Number(data.totalBudget) || 0,
      totalActual: Number(data.totalActual) || 0,
      docCount: countSnap.data().count || 0,
    };
  } catch (err) {
    console.warn('[aggregationService] getFinancialAggregates fallback:', err);
    return {
      totalBudget: 0,
      totalActual: 0,
      docCount: 0,
    };
  }
}
