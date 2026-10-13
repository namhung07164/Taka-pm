import React, { FC } from 'react';
import { Loader2, Search, ArrowLeft, ArrowRight } from 'lucide-react';
import { AuditLog } from '../../types';
import { AuditLogRowItem } from './AuditLogRowItem';

interface AuditLogTableViewProps {
  logs: AuditLog[];
  loading: boolean;
  currentPage: number;
  hasMore: boolean;
  onPageChange: (direction: 'prev' | 'next') => void;
  onSelectLog: (log: AuditLog) => void;
}

export const AuditLogTableView: React.FC<AuditLogTableViewProps> = ({
  logs,
  loading,
  currentPage,
  hasMore,
  onPageChange,
  onSelectLog,
}) => {
  return (
    <div className="bg-white dark:bg-[#18181a] rounded-2xl shadow-sm border border-slate-200 dark:border-[#333336] overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#202022] border-b border-slate-200 dark:border-[#333336]">
              <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Time
              </th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Module
              </th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Action
              </th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Document
              </th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Data Snippet
              </th>
              <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">
                Inspect
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#28282a]">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Loading logs...</span>
                  </div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                  <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  <p>No audit logs found matching your filters.</p>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <AuditLogRowItem key={log.id} log={log} onSelect={onSelectLog} />
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
            onClick={() => onPageChange('prev')}
            disabled={currentPage === 1 || loading}
            className="p-1.5 rounded bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange('next')}
            disabled={!hasMore || loading}
            className="p-1.5 rounded bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
