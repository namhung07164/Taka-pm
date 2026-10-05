import React, { Suspense } from 'react';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { useAuditLogData } from './AuditLogParts/useAuditLogData';
import { AuditLogFilterToolbar } from './AuditLogParts/AuditLogFilterToolbar';
import { AuditLogTableView } from './AuditLogParts/AuditLogTableView';

const AuditDiffViewerModal = lazyWithRetry(
  () => import('./AuditDiffViewerModal'),
  'AuditDiffViewerModal'
);

export function AuditLogTab() {
  const {
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
  } = useAuditLogData();

  return (
    <div className="flex-1 w-full h-full p-4 md:p-6 lg:p-8 overflow-y-auto bg-slate-50 dark:bg-[#0e0e11]">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        <AuditLogFilterToolbar
          entityFilter={entityFilter}
          setEntityFilter={setEntityFilter}
          actionFilter={actionFilter}
          setActionFilter={setActionFilter}
          userEmailFilter={userEmailFilter}
          setUserEmailFilter={setUserEmailFilter}
          onSearch={handleSearch}
          indexWarningUrl={indexWarningUrl}
        />

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl p-3 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => fetchLogs('initial')}
              className="font-bold underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        <AuditLogTableView
          logs={logs}
          loading={loading}
          currentPage={currentPage}
          hasMore={hasMore}
          onPageChange={(dir) => fetchLogs(dir)}
          onSelectLog={setSelectedLog}
        />
      </div>

      {selectedLog && (
        <Suspense fallback={null}>
          <AuditDiffViewerModal
            isOpen={!!selectedLog}
            log={selectedLog}
            onClose={() => setSelectedLog(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default AuditLogTab;
