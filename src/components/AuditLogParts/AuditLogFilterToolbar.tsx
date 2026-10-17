import React, { FC } from 'react';
import { Sparkles } from 'lucide-react';
import { DebouncedSearchInput } from '../DebouncedSearchInput';

interface AuditLogFilterToolbarProps {
  entityFilter: string;
  setEntityFilter: (val: string) => void;
  actionFilter: string;
  setActionFilter: (val: string) => void;
  userEmailFilter: string;
  setUserEmailFilter: (val: string) => void;
  onSearch: () => void;
  indexWarningUrl: string | null;
}

export const AuditLogFilterToolbar: React.FC<AuditLogFilterToolbarProps> = ({
  entityFilter,
  setEntityFilter,
  actionFilter,
  setActionFilter,
  userEmailFilter,
  setUserEmailFilter,
  onSearch,
  indexWarningUrl,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Audit Logs</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Sparkles className="w-3 h-3" /> Diff Visualizer Active
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Enterprise activity history & immutable audit trail. Click any row to inspect visual Before & After changes.
          </p>
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

          <div className="flex relative items-center">
            <DebouncedSearchInput
              placeholder="User email..."
              value={userEmailFilter}
              onChange={(val) => setUserEmailFilter(val)}
              debounceMs={250}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              className="w-full sm:w-64"
            />
            <button
              onClick={onSearch}
              className="bg-slate-800 dark:bg-blue-600 text-white px-4 py-2 rounded-r-lg text-sm font-semibold active:scale-95 transition-transform"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {indexWarningUrl && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <span className="font-bold">⚡ In-Memory Filtering Active:</span>
            <span>Firestore composite index is being synced. Logs are automatically filtered in memory without interruption.</span>
          </div>
          <a
            href={indexWarningUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
          >
            Build Index in Firebase Console ↗
          </a>
        </div>
      )}
    </div>
  );
};
