import React, { FC, useState } from 'react';
import { ShieldCheck, Wrench, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  runSummaryAudit,
  repairServerSummaries,
  repairLocalDevice,
  AuditReport,
} from '../../lib/summaryAuditService';

interface SummaryAuditPanelProps {
  isAdmin: boolean;
  onConfirmAction: (title: string, message: string, onConfirm: () => Promise<void>) => void;
}

export const SummaryAuditPanel: FC<SummaryAuditPanelProps> = ({ isAdmin, onConfirmAction }) => {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState<AuditReport | null>(null);

  if (!isAdmin) return null;

  const toast = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') =>
    useAppStore.getState().setToast({ title, message, type });

  const handleAudit = async () => {
    setRunning(true);
    setReport(null);
    try {
      const r = await runSummaryAudit(setProgress);
      setReport(r);
      toast(
        'Kiểm tra xong',
        `${r.projectCount} dự án, ${r.taskCount} task. Lệch summary: ${r.issues.filter((i) => i.summaryIssue).length} dự án. Lệch thiết bị: ${r.issues.filter((i) => i.deviceIssue).length} dự án.`,
        'success'
      );
    } catch (e: any) {
      console.error('Summary audit error:', e);
      toast('Kiểm tra thất bại', e?.message || 'Không đọc được dữ liệu từ server', 'error');
    } finally {
      setRunning(false);
      setProgress('');
    }
  };

  const summaryIssues = report ? report.issues.filter((i) => i.summaryIssue) : [];
  const deviceIssues = report ? report.issues.filter((i) => i.deviceIssue) : [];

  const handleRepairServer = () => {
    if (!report) return;
    onConfirmAction(
      'Sửa summary trên Firestore',
      `Dựng lại số task và danh sách tóm tắt của ${summaryIssues.length} dự án từ task thật trên Firestore. Các thiết bị khác sẽ tự cập nhật. Tiếp tục?`,
      async () => {
        setRunning(true);
        try {
          const res = await repairServerSummaries(report, (d, t) => setProgress(`Đang sửa ${d}/${t}...`));
          toast(
            'Đã sửa summary',
            `Sửa ${res.fixed} dự án. Bỏ qua ${res.skippedEmpty} dự án không có task thật (cần xem thủ công). Hãy chạy kiểm tra lại.`,
            'success'
          );
          setReport(null);
        } catch (e: any) {
          console.error('Repair server summaries error:', e);
          toast('Sửa thất bại', e?.message || 'Lỗi khi ghi lên Firestore', 'error');
        } finally {
          setRunning(false);
          setProgress('');
        }
      }
    );
  };

  const handleRepairDevice = () => {
    if (!report) return;
    onConfirmAction(
      'Đồng bộ lại thiết bị này theo Firestore',
      `Thêm task còn thiếu, xóa task thừa và làm mới bản dự án cũ trên thiết bị này (${deviceIssues.length} dự án). Không ghi gì lên Firestore. Tiếp tục?`,
      async () => {
        setRunning(true);
        try {
          const res = await repairLocalDevice(report);
          toast(
            'Đã đồng bộ thiết bị',
            `Thêm ${res.added} task, xóa ${res.removed} task thừa, làm mới ${res.projectsRefreshed} dự án.`,
            'success'
          );
          setReport(null);
        } catch (e: any) {
          console.error('Repair device error:', e);
          toast('Đồng bộ thất bại', e?.message || 'Lỗi khi cập nhật dữ liệu thiết bị', 'error');
        } finally {
          setRunning(false);
        }
      }
    );
  };

  const btn =
    'px-5 py-2.5 rounded-lg border bg-white dark:bg-[#1e1e20] transition-colors flex items-center gap-3 font-medium shadow-sm text-sm disabled:opacity-50 cursor-pointer';

  return (
    <div className="w-full basis-full flex flex-col gap-3 pt-2 border-t border-slate-200 dark:border-[#444446]">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleAudit}
          disabled={running}
          title="Đọc toàn bộ dự án và task từ server, đối chiếu summary và dữ liệu thiết bị này"
          className={`${btn} border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20`}
        >
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          {running ? 'Đang chạy...' : 'Kiểm tra chéo với Firestore'}
        </button>

        {report && summaryIssues.length > 0 && (
          <button
            onClick={handleRepairServer}
            disabled={running}
            className={`${btn} border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20`}
          >
            <Wrench className="w-4 h-4 text-amber-500" />
            Sửa summary trên Firestore ({summaryIssues.length})
          </button>
        )}

        {report && deviceIssues.length > 0 && (
          <button
            onClick={handleRepairDevice}
            disabled={running}
            className={`${btn} border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20`}
          >
            <RefreshCw className="w-4 h-4 text-emerald-500" />
            Đồng bộ lại thiết bị này ({deviceIssues.length})
          </button>
        )}

        {progress && <span className="text-xs text-slate-500 dark:text-[#9a9a9a]">{progress}</span>}
      </div>

      {report && (
        <div className="text-xs text-slate-600 dark:text-[#c3c3c3] flex flex-col gap-1">
          <div>
            {report.projectCount} dự án, {report.taskCount} task trên server. Task không thuộc dự án nào:{' '}
            {report.orphanCount}. Task khớp nhiều dự án: {report.ambiguousCount}.
          </div>
          {report.issues.length === 0 ? (
            <div className="text-emerald-600 dark:text-emerald-400 font-medium">
              Summary trên Firestore và dữ liệu thiết bị này đều khớp with task thật.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto overflow-x-auto border border-slate-200 dark:border-[#444446] rounded-lg">
              <table className="w-full text-left">
                <thead className="bg-slate-100 dark:bg-[#28282a] sticky top-0">
                  <tr>
                    <th className="px-2 py-1">Dự án</th>
                    <th className="px-2 py-1">Task thật</th>
                    <th className="px-2 py-1">Summary</th>
                    <th className="px-2 py-1">Thiếu / thừa trong summary</th>
                    <th className="px-2 py-1">Thiết bị (thiếu / thừa)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.issues.slice(0, 80).map((r) => (
                    <tr key={r.projectId} className="border-t border-slate-200 dark:border-[#444446]">
                      <td className="px-2 py-1 whitespace-nowrap">
                        {r.code} ({r.store} {r.year})
                      </td>
                      <td className="px-2 py-1">{r.serverTaskCount}</td>
                      <td className="px-2 py-1">
                        {r.summaryTaskCount} / {r.summaryEntryCount}
                      </td>
                      <td className="px-2 py-1">
                        {r.summaryIssue ? `${r.missingInSummary.length} / ${r.ghostInSummary.length}` : '-'}
                      </td>
                      <td className="px-2 py-1">
                        {r.deviceIssue
                          ? r.loadedLocally
                            ? `${r.missingLocal.length} / ${r.ghostLocal.length}${r.localProjectStale ? ', dự án cũ' : ''}`
                            : r.localProjectStale
                              ? 'dự án cũ'
                              : '-'
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {report.issues.length > 80 && <div>Hiển thị 80 dự án đầu, còn {report.issues.length - 80} dự án nữa.</div>}
        </div>
      )}
    </div>
  );
};

export default SummaryAuditPanel;
