import React, { memo, useMemo } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { PredecessorSearchSuggest, PredecessorChange } from './PredecessorSearchSuggest';
import { Task } from '../../types';

interface TaskPredecessorSectionProps {
  task: Task;
  formData: any;
  canWrite: boolean;
  t: (key: string) => string;
  tasks: any[];
  projects: any[];
  resolvedPredecessors: any[];
  handlePredecessorChange: (val: string) => void;
  handleApplyPredecessorDates: () => void;
  /** Thêm mới: để lưu kèm predecessorTaskIds vào form (bấm Save mới ghi vào dữ liệu) */
  setFormData?: (updater: any) => void;
}

export const TaskPredecessorSection = memo(function TaskPredecessorSection({
  task,
  formData,
  canWrite,
  t,
  resolvedPredecessors,
  handlePredecessorChange,
  handleApplyPredecessorDates,
  setFormData,
}: TaskPredecessorSectionProps) {
  // Bản nháp phản ánh đúng những gì người dùng đang nhập trong form (kể cả task mới chưa lưu)
  const draft = useMemo(
    () =>
      ({
        ...(task || {}),
        id: task?.id || '',
        projectId: formData.projectId ?? task?.projectId,
        projectCode: formData.projectCode ?? task?.projectCode,
        projectYear: formData.projectYear ?? task?.projectYear,
        projectStore: formData.projectStore ?? task?.projectStore,
        location: formData.location ?? task?.location,
        name: formData.name || task?.name || '',
        start: formData.start,
        finish: formData.finish,
        duration: formData.duration,
        predecessor: formData.predecessor || '',
        predecessorTaskIds: formData.predecessorTaskIds ?? task?.predecessorTaskIds ?? [],
      } as Task),
    [
      task,
      formData.projectId,
      formData.projectCode,
      formData.projectYear,
      formData.projectStore,
      formData.location,
      formData.name,
      formData.start,
      formData.finish,
      formData.duration,
      formData.predecessor,
      formData.predecessorTaskIds,
    ]
  );

  const handleLinkChange = (change: PredecessorChange) => {
    // 1) cập nhật chuỗi predecessor + tự tính lại ngày (logic có sẵn của modal)
    handlePredecessorChange(change.predecessor);
    // 2) gắn thêm ID task để không bao giờ nhầm task trùng mã
    setFormData?.((prev: any) => ({
      ...prev,
      predecessorTaskIds: change.predecessorTaskIds,
      predecessors: change.predecessors,
    }));
  };

  const hasResolved = resolvedPredecessors.some((rp) => rp?.task);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs font-bold uppercase text-slate-400 dark:text-[#838383]">
          {t('Predecessor')}
        </label>

        {hasResolved && canWrite && (
          <button
            type="button"
            onClick={handleApplyPredecessorDates}
            className="inline-flex min-h-[36px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 text-[11px] font-bold text-blue-600 shadow-sm hover:bg-blue-50 active:scale-95 touch-manipulation dark:border-blue-700 dark:bg-[#1e1e20] dark:text-blue-400"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Dates
          </button>
        )}
      </div>

      <PredecessorSearchSuggest task={draft} canWrite={canWrite} onChange={handleLinkChange} />
    </div>
  );
});
