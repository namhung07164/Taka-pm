import React, { FC, useState } from 'react';
import { ShieldCheck, Wrench, RefreshCw, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  runSummaryAudit,
  repairServerSummaries,
  repairLocalDevice,
  purgeExcessFirestoreTasks,
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
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  if (!isAdmin) return null;

  const toast = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') =>
    useAppStore.getState().setToast({ title, message, type });

  const handleAudit = async () => {
    setRunning(true);
    setReport(null);
    setExpandedProjectId(null);
    try {
      const r = await runSummaryAudit(setProgress);
      setReport(r);
      const excessCount = r.issues.reduce((acc, i) => acc + i.missingInSummary.length, 0);
      toast(
        'Kiểm tra xong',
        `${r.projectCount} dự án, ${r.taskCount} task trên server. Có ${excessCount} task thừa trên Firestore ngoài Summary.`,
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
  const excessRows = report ? report.issues.filter((i) => i.missingInSummary.length > 0) : [];
  const totalExcessTasks = excessRows.reduce((acc, r) => acc + r.missingInSummary.length, 0);

  const handlePurgeExcess = (targetProjectIds?: string[]) => {
    if (!report) return;
    const isSingle = targetProjectIds && targetProjectIds.length === 1;
    const row = isSingle ? report.issues.find((r) => r.projectId === targetProjectIds[0]) : null;
    const count = isSingle && row ? row.missingInSummary.length : totalExcessTasks;
    const title = isSingle && row
      ? `Xóa ${count} task thừa của dự án ${row.code}`
      : `Xóa toàn bộ ${totalExcessTasks} task thừa trên Firestore (${excessRows.length} dự án)`;

    const msg = isSingle && row
      ? `Hệ thống sẽ xóa vĩnh viễn ${count} task document trên Firestore taka_tasks không nằm trong Summary của dự án ${row.code}. Số task trên Firestore sẽ về đúng ${row.summaryEntryCount} task chuẩn. Tiếp tục?`
      : `Hệ thống sẽ xóa vĩnh viễn ${totalExcessTasks} task document trên Firestore taka_tasks không nằm trong bảng Summary chuẩn của ${excessRows.length} dự án. Bảng Summary hiện tại của bạn sẽ được giữ nguyên 100%. Tiếp tục?`;

    onConfirmAction(title, msg, async () => {
      setRunning(true);
      try {
        const res = await purgeExcessFirestoreTasks(report, targetProjectIds, (d, t) =>
          setProgress(`Đang xóa ${d}/${t} task thừa...`)
        );
        toast(
          'Đã xóa task thừa',
          `Đã xóa sạch ${res.purgedTasks} task thừa trên Firestore của ${res.updatedProjects} dự án. Hãy bấm Kiểm tra chéo để làm mới.`,
          'success'
        );
        setReport(null);
        setExpandedProjectId(null);
      } catch (e: any) {
        console.error('Purge excess tasks error:', e);
        toast('Xóa thất bại', e?.message || 'Lỗi khi xóa task trên Firestore', 'error');
      } finally {
        setRunning(false);
        setProgress('');
      }
    });
  };

  const handleRepairServer = () => {
    if (!report) return;
    onConfirmAction(
      'Cập nhật Summary theo Firestore',
      `Ghi đè lại bảng tóm tắt của ${summaryIssues.length} dự án để nhận toàn bộ các task đang có trên server Firestore (bao gồm cả task thừa nếu có). Tiếp tục?`,
      async () => {
        setRunning(true);
        try {
          const res = await repairServerSummaries(report, (d, t) => setProgress(`Đang sửa ${d}/${t}...`));
          toast(
            'Đã cập nhật summary',
            `Sửa ${res.fixed} dự án. Bỏ qua ${res.skippedEmpty} dự án không có task thật. Hãy chạy kiểm tra lại.`,
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

        {report && totalExcessTasks > 0 && (
          <button
            onClick={() => handlePurgeExcess()}
            disabled={running}
            title="Xóa vĩnh viễn các task thừa trên Firestore taka_tasks không có trong Summary"
            className={`${btn} border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20`}
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
            Xóa task thừa trên Firestore ({excessRows.length} dự án - {totalExcessTasks} task)
          </button>
        )}

        {report && summaryIssues.length > 0 && (
          <button
            onClick={handleRepairServer}
            disabled={running}
            title="Đồng bộ danh sách summary theo toàn bộ task trên server (chỉ dùng nếu muốn thêm task trên server vào summary)"
            className={`${btn} border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20`}
          >
            <Wrench className="w-4 h-4 text-amber-500" />
            Cập nhật Summary theo Firestore ({summaryIssues.length})
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {report.projectCount} dự án, {report.taskCount} task trên server. Task không thuộc dự án nào:{' '}
              {report.orphanCount}. Task khớp nhiều dự án: {report.ambiguousCount}.
            </span>
            {totalExcessTasks > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                ⚠️ Có {totalExcessTasks} task thừa trên Firestore ngoài bảng Summary (bấm vào dòng dự án để xem chi tiết hoặc bấm nút đỏ để xóa).
              </span>
            )}
          </div>
          {report.issues.length === 0 ? (
            <div className="text-emerald-600 dark:text-emerald-400 font-medium">
              Summary trên Firestore và dữ liệu thiết bị này đều khớp hoàn toàn với task trên Firestore.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto overflow-x-auto border border-slate-200 dark:border-[#444446] rounded-lg">
              <table className="w-full text-left">
                <thead className="bg-slate-100 dark:bg-[#28282a] sticky top-0 z-10 text-[11px]">
                  <tr>
                    <th className="px-2 py-1.5">Dự án</th>
                    <th className="px-2 py-1.5">Task Firestore</th>
                    <th className="px-2 py-1.5">Summary chuẩn</th>
                    <th className="px-2 py-1.5 text-rose-600 dark:text-rose-400">Thừa trên Firestore (ngoài Summary)</th>
                    <th className="px-2 py-1.5">Thiết bị (thiếu / thừa)</th>
                    <th className="px-2 py-1.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {report.issues.slice(0, 80).map((r) => {
                    const isExpanded = expandedProjectId === r.projectId;
                    const hasExcess = r.missingInSummary.length > 0;
                    const excessTasks = hasExcess
                      ? r.missingInSummary
                          .map((id) => report.internal.serverTasksById.get(id))
                          .filter(Boolean) as any[]
                      : [];

                    return (
                      <React.Fragment key={r.projectId}>
                        <tr
                          onClick={() => setExpandedProjectId(isExpanded ? null : r.projectId)}
                          className={`border-t border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 cursor-pointer ${
                            isExpanded ? 'bg-slate-50/80 dark:bg-[#252528]' : ''
                          }`}
                        >
                          <td className="px-2 py-1 whitespace-nowrap font-medium flex items-center gap-1.5">
                            {hasExcess ? (
                              isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )
                            ) : (
                              <span className="w-3.5" />
                            )}
                            <span>{r.code} ({r.store} {r.year})</span>
                          </td>
                          <td className="px-2 py-1 font-mono">{r.serverTaskCount}</td>
                          <td className="px-2 py-1 font-mono text-emerald-600 dark:text-emerald-400">
                            {r.summaryTaskCount} / {r.summaryEntryCount}
                          </td>
                          <td className="px-2 py-1">
                            {hasExcess ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                +{r.missingInSummary.length} task thừa
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-[#777]">-</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-slate-500 dark:text-[#999]">
                            {r.deviceIssue
                              ? r.loadedLocally
                                ? `${r.missingLocal.length} / ${r.ghostLocal.length}${r.localProjectStale ? ', dự án cũ' : ''}`
                                : r.localProjectStale
                                  ? 'dự án cũ'
                                  : '-'
                              : '-'}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {hasExcess && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurgeExcess([r.projectId]);
                                }}
                                disabled={running}
                                title="Xóa các task thừa của dự án này trên Firestore"
                                className="px-2 py-0.5 text-[11px] rounded border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                              >
                                Xóa {r.missingInSummary.length} task thừa
                              </button>
                            )}
                          </td>
                        </tr>

                        {isExpanded && hasExcess && (
                          <tr className="bg-rose-50/30 dark:bg-rose-950/10 border-t border-rose-100 dark:border-rose-900/30">
                            <td colSpan={6} className="px-4 py-2.5">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-rose-700 dark:text-rose-300">
                                  Danh sách {r.missingInSummary.length} task thừa trên Firestore (không có trong Summary của {r.code}):
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePurgeExcess([r.projectId]);
                                  }}
                                  disabled={running}
                                  className="px-2.5 py-1 text-xs rounded bg-rose-600 hover:bg-rose-700 text-white font-medium flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Xóa ngay {r.missingInSummary.length} task này
                                </button>
                              </div>
                              <div className="max-h-40 overflow-y-auto border border-rose-200/60 dark:border-rose-900/40 rounded bg-white dark:bg-[#1a1a1c] p-2 space-y-1">
                                {excessTasks.map((t, idx) => (
                                  <div
                                    key={t.id || idx}
                                    className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-100 dark:border-[#2a2a2c] last:border-0"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-slate-500 w-6 text-right">{idx + 1}.</span>
                                      <span className="font-semibold text-slate-800 dark:text-[#eee]">
                                        {t.taskCodePhu || `#${(t.orderIndex ?? 0) + 1}`}
                                      </span>
                                      <span className="text-slate-600 dark:text-[#bbb]">{t.name || 'Không tên'}</span>
                                    </div>
                                    <div className="text-slate-400 font-mono text-[10px]">
                                      {t.start || 'N/A'} ➔ {t.finish || 'N/A'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
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

