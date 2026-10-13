import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  where,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AuditLog } from '../../types';
import { PAGE_SIZE } from './auditLogTypes';

export function useAuditLogData() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Pagination state
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [firstVisible, setFirstVisible] = useState<any>(null);
  const [pageHistory, setPageHistory] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [userEmailFilter, setUserEmailFilter] = useState<string>('');
  const [indexWarningUrl, setIndexWarningUrl] = useState<string | null>(null);

  const fetchLogs = async (direction: 'next' | 'prev' | 'initial' = 'initial') => {
    try {
      setLoading(true);
      setError(null);

      const qConstraints: QueryConstraint[] = [orderBy('timestamp', 'desc')];

      if (actionFilter !== 'ALL') {
        qConstraints.push(where('action', '==', actionFilter));
      }
      if (entityFilter !== 'ALL') {
        qConstraints.push(where('entityType', '==', entityFilter));
      }
      if (userEmailFilter.trim()) {
        qConstraints.push(where('userEmail', '==', userEmailFilter.trim()));
      }

      qConstraints.push(limit(PAGE_SIZE));

      if (direction === 'next' && lastVisible) {
        qConstraints.push(startAfter(lastVisible));
      } else if (direction === 'prev') {
        const prevDoc = pageHistory[currentPage - 2];
        if (prevDoc) {
          qConstraints.push(startAfter(prevDoc));
        }
      }

      let snapshot;
      try {
        const q = query(collection(db, 'audit_logs'), ...qConstraints);
        snapshot = await getDocs(q);
      } catch (queryErr: any) {
        const msg = queryErr?.message || '';
        if (
          msg.includes('requires an index') ||
          msg.includes('indexes?create_composite') ||
          queryErr?.code === 'failed-precondition'
        ) {
          console.warn('Firestore composite index not found, falling back to in-memory filtering:', msg);

          const matchUrl = msg.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
          if (matchUrl && matchUrl[0]) {
            setIndexWarningUrl(matchUrl[0]);
          }

          const fallbackQ = query(
            collection(db, 'audit_logs'),
            orderBy('timestamp', 'desc'),
            limit(200)
          );
          const fallbackSnap = await getDocs(fallbackQ);

          const filteredLogs: AuditLog[] = [];
          fallbackSnap.forEach((doc) => {
            const data = doc.data();
            let keep = true;
            if (actionFilter !== 'ALL' && data.action !== actionFilter) keep = false;
            if (entityFilter !== 'ALL' && data.entityType !== entityFilter) keep = false;
            if (userEmailFilter.trim()) {
              const term = userEmailFilter.trim().toLowerCase();
              const email = (data.userEmail || '').toLowerCase();
              const uid = (data.userId || '').toLowerCase();
              if (!email.includes(term) && !uid.includes(term)) keep = false;
            }
            if (keep) {
              filteredLogs.push({ id: doc.id, ...data } as AuditLog);
            }
          });

          setLogs(filteredLogs.slice(0, PAGE_SIZE));
          setHasMore(filteredLogs.length > PAGE_SIZE);
          setFirstVisible(filteredLogs.length > 0 ? filteredLogs[0] : null);
          setLastVisible(
            filteredLogs.length > 0
              ? filteredLogs[Math.min(PAGE_SIZE - 1, filteredLogs.length - 1)]
              : null
          );
          setCurrentPage(1);
          setPageHistory([]);
          setLoading(false);
          setError(null);
          return;
        }
        throw queryErr;
      }

      const newLogs: AuditLog[] = [];
      snapshot.forEach((doc) => {
        newLogs.push({ id: doc.id, ...doc.data() } as AuditLog);
      });

      setLogs(newLogs);

      if (snapshot.docs.length > 0) {
        if (direction === 'next' || direction === 'initial') {
          if (direction === 'next') {
            setPageHistory((prev) => [...prev, lastVisible]);
            setCurrentPage((p) => p + 1);
          } else {
            setPageHistory([]);
            setCurrentPage(1);
          }
        } else if (direction === 'prev') {
          setPageHistory((prev) => prev.slice(0, prev.length - 1));
          setCurrentPage((p) => p - 1);
        }

        setFirstVisible(snapshot.docs[0]);
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === PAGE_SIZE);
      } else {
        if (direction === 'initial') {
          setHasMore(false);
          setFirstVisible(null);
          setLastVisible(null);
        } else if (direction === 'next') {
          setHasMore(false);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch audit logs:', err);
      setError(err.message || 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs('initial');
  }, [actionFilter, entityFilter]);

  const handleSearch = () => {
    fetchLogs('initial');
  };

  return {
    logs,
    loading,
    error,
    selectedLog,
    setSelectedLog,
    currentPage,
    hasMore,
    actionFilter,
    setActionFilter,
    entityFilter,
    setEntityFilter,
    userEmailFilter,
    setUserEmailFilter,
    indexWarningUrl,
    fetchLogs,
    handleSearch,
  };
}
