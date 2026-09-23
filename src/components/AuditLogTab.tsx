import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, startAfter, getDocs, where, QueryConstraint } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AuditLog } from '../types';
import { formatDisplayDateTime } from '../lib/utils';
import { Loader2, Search, Filter, ArrowRight, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

const PAGE_SIZE = 20;

export function AuditLogTab() {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [firstVisible, setFirstVisible] = useState<any>(null);
  const [pageHistory, setPageHistory] = useState<any[]>([]); // To go back
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [userEmailFilter, setUserEmailFilter] = useState<string>('');

  const fetchLogs = async (direction: 'next' | 'prev' | 'initial' = 'initial') => {
    try {
      setLoading(true);
      setError(null);

      let qConstraints: QueryConstraint[] = [orderBy('timestamp', 'desc')];

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
        // Simple hack: we use the pageHistory array to find the starting point of the previous page
        const prevDoc = pageHistory[currentPage - 2]; 
        if (prevDoc) {
          qConstraints.push(startAfter(prevDoc));
        } else {
          // If no prevDoc, it means we go to page 1
          // Do nothing, just fetch the first page
        }
      }

      const q = query(collection(db, 'audit_logs'), ...qConstraints);
      const snapshot = await getDocs(q);

      const newLogs: AuditLog[] = [];
      snapshot.forEach(doc => {
        newLogs.push({ id: doc.id, ...doc.data() } as AuditLog);
      });

      setLogs(newLogs);

      if (snapshot.docs.length > 0) {
        if (direction === 'next' || direction === 'initial') {
           if (direction === 'next') {
              setPageHistory(prev => [...prev, lastVisible]);
              setCurrentPage(p => p + 1);
           } else {
              setPageHistory([]);
              setCurrentPage(1);
           }
        } else if (direction === 'prev') {
           setPageHistory(prev => prev.slice(0, prev.length - 1));
           setCurrentPage(p => p - 1);
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
  }, [actionFilter, entityFilter]); // Do not put userEmailFilter here to avoid spamming. We will use a search button or 'Enter'

  const handleSearch = () => {
    fetchLogs('initial');
  };

  const renderDataPreview = (data: any) => {
    if (!data) return <span className="text-slate-400 italic">No data</span>;
    const str = JSON.stringify(data);
    if (str.length > 80) return <span className="text-slate-600 dark:text-slate-300">{str.substring(0, 80)}...</span>;
    return <span className="text-slate-600 dark:text-slate-300">{str}</span>;
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300';
      case 'UPDATE': return 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300';
      case 'DELETE': return 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-300';
    }
  };

  const getEntityBadgeColor = (entity?: string) => {
    switch (entity) {
      case 'project': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300';
      case 'task': return 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300';
      case 'cost': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300';
      case 'user': return 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300';
      case 'delegation': return 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300';
    }
  };

  return (
    <div className="flex-1 w-full h-full p-4 md:p-6 lg:p-8 overflow-y-auto bg-slate-50 dark:bg-[#0e0e11]">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Audit Logs</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">System activity history</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#333336] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Modules</option>
              <option value="project">Projects</option>
              <option value="task">Tasks</option>
              <option value="cost">Costs & Finance</option>
              <option value="delegation">Delegations</option>
              <option value="user">Users & RBAC</option>
            </select>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#333336] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Actions</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
            
            <div className="flex relative">
              <input 
                type="text"
                placeholder="User email..."
                value={userEmailFilter}
                onChange={(e) => setUserEmailFilter(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full sm:w-64 pl-9 pr-3 py-2 bg-white dark:bg-[#18181a] border border-slate-200 dark:border-[#333336] rounded-l-lg text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <button 
                onClick={handleSearch}
                className="bg-slate-800 dark:bg-blue-600 text-white px-4 py-2 rounded-r-lg text-sm font-semibold active:scale-95 transition-transform"
              >
                Search
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#18181a] rounded-2xl shadow-sm border border-slate-200 dark:border-[#333336] overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#202022] border-b border-slate-200 dark:border-[#333336]">
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Module</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Document</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data Snippet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#28282a]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Loading logs...</span>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                      <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <p>No audit logs found matching your filters.</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-[#202022]/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-[#d3d3d3] whitespace-nowrap">
                        {formatDisplayDateTime(new Date(log.timestamp).toISOString())}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold text-slate-800 dark:text-[#e3e3e3]">{log.userEmail}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{log.userId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${getEntityBadgeColor(log.entityType)}`}>
                          {log.entityType || 'system'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded text-[10px] font-bold tracking-wider ${getActionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-mono text-slate-600 dark:text-[#a3a3a3] max-w-[200px] truncate" title={log.docPath}>
                          {log.docPath}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {renderDataPreview(log.data)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="border-t border-slate-200 dark:border-[#333336] p-4 flex items-center justify-between bg-slate-50 dark:bg-[#1e1e20]">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Page {currentPage}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchLogs('prev')}
                disabled={currentPage === 1 || loading}
                className="p-1.5 rounded bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => fetchLogs('next')}
                disabled={!hasMore || loading}
                className="p-1.5 rounded bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
