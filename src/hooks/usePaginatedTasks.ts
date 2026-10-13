import React, { useCallback, useEffect, useRef, useState } from 'react';
import { collection, query, where, orderBy, limit, startAfter, getDocs, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { Task } from '../types';
import { useAppStore } from '../store/useAppStore';
import { getEffectiveStoreFilter } from '../lib/utils';

export function usePaginatedTasks(isActiveTab: boolean) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  
  const currentUser = useAppStore(state => state.currentUser);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  
  // Anti cursor drift & dedup
  const taskMapRef = useRef<Map<string, Task>>(new Map());

  const fetchTasks = useCallback(async (isNextPage: boolean = false) => {
    if (!isActiveTab) return;
    if (loading) return;
    if (isNextPage && !hasMore) return;

    setLoading(true);

    try {
      let q = collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks") as import("firebase/firestore").Query;
      
      const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
      
      if (effectiveStore && effectiveStore !== "all") {
         q = query(q, where("projectStore", "==", effectiveStore));
      }
      
      if (globalYearFilter && globalYearFilter !== "all") {
         const yNum = parseInt(globalYearFilter, 10);
         q = query(q, where("projectYear", "in", [globalYearFilter, yNum]));
      }
      
      // orderBy is required when using startAfter/limit for pagination, 
      // but firestore needs a composite index if combining where + orderBy.
      // If no composite index exists, this will throw an error. 
      // We'll order by projectCode as a safe fallback or just limit if orderBy fails.
      // Assuming no composite indexes, we can just fetch and paginate on an ordered field if allowed, 
      // otherwise, we might just rely on limit and startAfter without orderBy if supported, 
      // or we order by document ID (which is supported).
      q = query(q, orderBy("__name__"));

      if (isNextPage && lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      q = query(q, limit(20));

      const snapshot = await getDocs(q);

      if (!isNextPage) {
        taskMapRef.current.clear(); // Reset on fresh load
      }

      snapshot.docs.forEach(docSnap => {
        taskMapRef.current.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Task);
      });

      setTasks(Array.from(taskMapRef.current.values()));
      
      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
      
      if (snapshot.docs.length < 20) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

    } catch (error) {
      console.error("Error paginating tasks:", error);
    } finally {
      setLoading(false);
    }
  }, [isActiveTab, loading, hasMore, lastDoc, globalStoreFilter, globalYearFilter, currentUser]);

  useEffect(() => {
    if (isActiveTab) {
      // Reset and fetch first page
      setLastDoc(null);
      setHasMore(true);
      taskMapRef.current.clear();
      fetchTasks(false);
    }
  }, [isActiveTab, globalStoreFilter, globalYearFilter]); // re-run when filters change

  return { tasks, loading, hasMore, loadMore: () => fetchTasks(true) };
}
