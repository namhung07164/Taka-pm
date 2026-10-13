import React, { FC, memo } from 'react';
import { Eye } from 'lucide-react';
import { AuditLog } from '../../types';
import { formatDisplayDateTime } from '../../lib/utils';
import { getActionColor, getEntityBadgeColor } from './auditLogTypes';

interface AuditLogRowItemProps {
  log: AuditLog;
  onSelect: (log: AuditLog) => void;
}

const renderDataPreview = (data: any) => {
  if (!data) return <span className="text-slate-400 italic">No data</span>;
  const str = JSON.stringify(data);
  if (str.length > 80)
    return <span className="text-slate-600 dark:text-slate-300">{str.substring(0, 80)}...</span>;
  return <span className="text-slate-600 dark:text-slate-300">{str}</span>;
};

export const AuditLogRowItem: React.FC<AuditLogRowItemProps> = React.memo(({ log, onSelect }) => {
  return (
    <tr
      onClick={() => onSelect(log)}
      className="cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors group"
      title="Click to view Visual Diff"
    >
      <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-[#d3d3d3] whitespace-nowrap">
        {formatDisplayDateTime(new Date(log.timestamp).toISOString())}
      </td>
      <td className="px-4 py-3">
        <div className="text-xs font-semibold text-slate-800 dark:text-[#e3e3e3]">{log.userEmail}</div>
        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{log.userId}</div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${getEntityBadgeColor(
            log.entityType
          )}`}
        >
          {log.entityType || 'system'}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex px-2 py-1 rounded text-[10px] font-bold tracking-wider ${getActionColor(
            log.action
          )}`}
        >
          {log.action}
        </span>
      </td>
      <td className="px-4 py-3">
        <div
          className="text-xs font-mono text-slate-600 dark:text-[#a3a3a3] max-w-[180px] truncate"
          title={log.docPath}
        >
          {log.docPath}
        </div>
      </td>
      <td className="px-4 py-3 text-xs font-mono">{renderDataPreview(log.data)}</td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(log);
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-[#252528] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 border border-slate-200 dark:border-[#38383c] group-hover:border-indigo-300 dark:group-hover:border-indigo-700 shadow-xs transition-all active:scale-95 touch-manipulation"
          title="Inspect Visual Changes"
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Diff</span>
        </button>
      </td>
    </tr>
  );
});
