import React, { Fragment, lazy, memo } from 'react';
import { Search, Trash2, Paperclip, ExternalLink, FileText } from 'lucide-react';
import { DelegationGroup, DelegationSubTask, AppUser, Project } from '../../types';
import { cn, formatDisplayDateMain, formatDisplayDateTime, ensureUrlProtocol, resolveActualStatus, getActStatusPercent } from '../../lib/utils';
import { MultiSelectInput } from '../DelegationParts/MultiSelectInput';
import { useLanguage } from '../../lib/LanguageContext';
import { useAppStore } from '../../store/useAppStore';

interface TaskDelegationDesktopSubTaskRowProps {
  st: DelegationSubTask;
  group: DelegationGroup;
  parentProject?: Project;
  plStatus: string;
  plStatusColorClass: string;
  visibleColumns: string[];
  focusTarget: { groupId: string; subTaskId?: string } | null;
  defaultStartAct?: string;
  defaultFinishAct?: string;
  canWrite: boolean;
  currentUser: AppUser;
  picOptions: string[];
  uniqueParties: string[];
  handleUpdateSubTask: (group: DelegationGroup, subTaskId: string, updates: Partial<DelegationSubTask>) => void;
  handleDeleteSubTask: (group: DelegationGroup, subTaskId: string) => void;
  handleTextareaInput: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  setMultiSearchTerm: (term: string) => void;
}

export const TaskDelegationDesktopSubTaskRow = React.memo(function TaskDelegationDesktopSubTaskRow({
  st,
  group,
  parentProject,
  plStatus,
  plStatusColorClass,
  visibleColumns,
  focusTarget,
  defaultStartAct,
  defaultFinishAct,
  canWrite,
  currentUser,
  picOptions,
  uniqueParties,
  handleUpdateSubTask,
  handleDeleteSubTask,
  handleTextareaInput,
  setMultiSearchTerm,
}: TaskDelegationDesktopSubTaskRowProps) {
  const { t } = useLanguage();
  const setZoomableImageSrc = useAppStore((state) => state.setZoomableImageSrc);

  const isCreator = group.createdBy === currentUser.id;
  const pPartyList = (st.party || '').split(',').map((p) => p.toLowerCase().trim());
  const userParties = currentUser.partyPermissions
    ? Object.keys(currentUser.partyPermissions)
        .filter((k) => currentUser.partyPermissions![k])
        .map((k) => k.toLowerCase().trim())
    : [];
  const isPIC =
    userParties.includes('all') ||
    pPartyList.some((p) => userParties.includes(p)) ||
    pPartyList.includes(String(currentUser.username || '').toLowerCase().trim()) ||
    (st.involvedUsers && st.involvedUsers.includes(currentUser.id));
  const canEditSubTask = canWrite || isCreator || isPIC;

  const stStatus = (st.delegationStatus || st.status || '').toLowerCase();
  const stApproval = (st.approvalStatus || '').toLowerCase();

  let selectValue = 'None';
  if (stStatus === 'approved' || stStatus === 'completed' || stApproval === 'approved') selectValue = 'Approved';
  else if (stStatus === 'rejected' || stApproval === 'rejected') selectValue = 'Rejected';
  else if (stStatus === 'pending completed' || stApproval === 'pending completed') selectValue = 'ReqApproval';
  else if (stStatus === 'needs rework') selectValue = 'ReqReview';
  else if (stStatus === 'on process' || stStatus === 'accepted') selectValue = 'AcceptTask';
  else if (
    ['requested', 'hold', 'waiting for approval'].includes(stStatus) ||
    ['requested', 'hold', 'waiting for approval'].includes(stApproval)
  )
    selectValue = 'Hold';

  return (
    <React.Fragment key={st.id}>
      <tr
        id={`delegation-subtask-${st.id}`}
        className={`table-row-optimized bg-white dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] hover:bg-blue-50 dark:hover:bg-[#333336]/30 transition-all duration-300 ${
          focusTarget?.subTaskId === st.id
            ? 'bg-yellow-50 dark:bg-yellow-900/30 ring-2 ring-yellow-400 dark:ring-yellow-600 inset-0'
            : ''
        }`}
      >
        {visibleColumns.includes('expand') && <td className="px-4 py-3"></td>}
        {visibleColumns.includes('taskName') && (
          <td className="px-4 py-3 pl-8 text-slate-700 dark:text-[#c3c3c3] break-words whitespace-normal">
            <div className="flex items-center gap-2 mb-2 pl-4">
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-[10px] uppercase text-slate-400 dark:text-[#838383] font-bold ml-1">
                  Start (Act)
                </span>
                <div className="relative w-full min-h-[28px]">
                  <input
                    type="date"
                    value={
                      st.startAct
                        ? st.startAct.substring(0, 10)
                        : defaultStartAct
                        ? defaultStartAct.substring(0, 10)
                        : ''
                    }
                    onChange={(e) => handleUpdateSubTask(group, st.id, { startAct: e.target.value })}
                    disabled={!canEditSubTask}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-auto"
                  />
                  <div
                    className={cn(
                      'w-full bg-transparent border rounded p-1.5 text-[11px] font-medium min-h-[28px] flex items-center whitespace-nowrap',
                      !canEditSubTask ? 'border-transparent' : 'hover:border-slate-300'
                    )}
                  >
                    {formatDisplayDateMain(st.startAct || defaultStartAct)}
                  </div>
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-[10px] uppercase text-slate-400 dark:text-[#838383] font-bold ml-1">
                  Finish (Act)
                </span>
                <div className="relative w-full min-h-[28px]">
                  <input
                    type="date"
                    value={
                      st.finishAct
                        ? st.finishAct.substring(0, 10)
                        : defaultFinishAct
                        ? defaultFinishAct.substring(0, 10)
                        : ''
                    }
                    onChange={(e) => handleUpdateSubTask(group, st.id, { finishAct: e.target.value })}
                    disabled={!canEditSubTask}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-auto"
                  />
                  <div
                    className={cn(
                      'w-full bg-transparent border rounded p-1.5 text-[11px] font-medium min-h-[28px] flex items-center whitespace-nowrap',
                      !canEditSubTask ? 'border-transparent' : 'hover:border-slate-300'
                    )}
                  >
                    {formatDisplayDateMain(st.finishAct || defaultFinishAct)}
                  </div>
                </div>
              </div>
            </div>
          </td>
        )}
        {visibleColumns.includes('projectCode') && <td className="px-4 py-3"></td>}
        {visibleColumns.includes('comments') && (
          <td className="px-4 py-3" title={st.comments}>
            <textarea
              defaultValue={st.comments}
              onBlur={(e) => handleUpdateSubTask(group, st.id, { comments: e.target.value })}
              onInput={handleTextareaInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              disabled={!canEditSubTask}
              className="w-full bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-[#444446] focus:border-blue-500 focus:bg-white dark:focus:bg-[#1e1e20] rounded p-1.5 outline-none resize-y min-h-[60px] text-sm whitespace-pre-wrap"
              placeholder="Add comments..."
            />
          </td>
        )}
        {visibleColumns.includes('status') && (
          <td className="px-4 py-3 align-top pt-5">
            <div className="flex flex-col gap-2 min-w-[120px] items-center justify-center">
              <div
                className={`text-[11px] leading-tight font-bold px-3 py-1 rounded-full border inline-block break-words max-w-[120px] text-center ${plStatusColorClass}`}
              >
                Pl: {plStatus}
              </div>
              <div
                className={`text-[11px] leading-tight font-bold px-3 py-1 rounded-full border inline-block break-words max-w-[120px] text-center ${
                  resolveActualStatus(plStatus, group.subTasks).color
                }`}
              >
                Act: {resolveActualStatus(plStatus, group.subTasks).label}
              </div>
            </div>
          </td>
        )}

        {visibleColumns.includes('priority') && (
          <td className="px-4 py-3">
            <select
              value={st.priority || 'Mid'}
              onChange={(e) => handleUpdateSubTask(group, st.id, { priority: e.target.value as any })}
              disabled={!canEditSubTask}
              style={{
                backgroundImage:
                  "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23334155%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')",
                backgroundPosition: 'calc(100% - 6px) center',
              }}
              className={cn(
                'w-full text-[10px] md:text-xs font-bold pl-1.5 md:pl-2 pr-5 md:pr-6 py-1 md:py-1.5 rounded-md border outline-none cursor-pointer appearance-none bg-[length:10px_10px] md:bg-[length:12px_12px] bg-no-repeat',
                st.priority === 'High'
                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                  : st.priority === 'Mid-high'
                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                  : st.priority === 'Low'
                  ? 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]'
                  : 'bg-blue-50 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8] border-blue-200',
                !canEditSubTask && 'opacity-80 cursor-not-allowed'
              )}
            >
              <option value="High">High</option>
              <option value="Mid-high">Mid-high</option>
              <option value="Mid">Mid</option>
              <option value="Low">Low</option>
            </select>
          </td>
        )}
        {visibleColumns.includes('party') && (
          <td className="px-4 py-3">
            <MultiSelectInput
              value={st.party || ''}
              options={[...picOptions, ...uniqueParties]}
              onSave={(val) => handleUpdateSubTask(group, st.id, { party: val })}
              disabled={!canEditSubTask}
              className="w-full bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-[#444446] focus:border-blue-500 focus:bg-white dark:focus:bg-[#1e1e20] rounded pl-1.5 md:pl-2 pr-6 md:pr-7 py-1 md:py-1.5 outline-none text-xs md:text-sm font-medium h-[28px] md:h-[32px]"
              placeholder="PIC..."
            />
          </td>
        )}
        {visibleColumns.includes('actions') && (
          <td className="px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <div
                className={`text-[10px] leading-tight font-bold px-2 py-1 rounded-full border whitespace-nowrap ${
                  resolveActualStatus(plStatus, [st]).color
                }`}
              >
                Act: {resolveActualStatus(plStatus, [st]).label} ({getActStatusPercent(resolveActualStatus(plStatus, [st]).label)}%)
              </div>
              <button
                type="button"
                onClick={() =>
                  setMultiSearchTerm((parentProject?.code ? parentProject.code + ' ' : '') + (st.name || group.name))
                }
                className="text-blue-400 hover:text-blue-600 dark:text-[#8ab4f8] p-1 rounded hover:bg-blue-50 dark:hover:bg-[#333336] transition-colors cursor-pointer"
                title="Filter by Tracker"
              >
                <Search className="w-4 h-4" />
              </button>
              {canWrite && (
                <button
                  onClick={() => handleDeleteSubTask(group, st.id)}
                  className="text-red-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </td>
        )}
      </tr>

      {/* SubTask Details: Report, Attachments, Flow Status, Approval */}
      <tr className="table-row-optimized bg-slate-50 dark:bg-[#1e1e20]/30 border-b border-slate-100 dark:border-[#333336]">
        <td colSpan={visibleColumns.length} className="px-4 py-3">
          <div className="flex flex-wrap md:flex-nowrap items-stretch gap-4 pl-8">
            {/* Report */}
            <div className="flex-1 bg-blue-100 dark:bg-[#333336]/40 p-2.5 rounded border border-blue-200">
              <span className="text-[10px] font-bold text-blue-800 dark:text-[#8ab4f8] tracking-wider block mb-1 opacity-80">
                {t('Report')}
              </span>
              <div className="text-sm text-slate-700 dark:text-[#c3c3c3] whitespace-pre-wrap min-h-[20px]">
                {st.report || st.childReport || (
                  <span className="text-slate-400 dark:text-[#838383] italic text-xs">No report linked</span>
                )}
              </div>
            </div>

            {/* File Attachment */}
            <div className="w-64 shrink-0 bg-blue-100 dark:bg-[#333336]/40 p-2.5 rounded border border-blue-200 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-blue-800 dark:text-[#8ab4f8] tracking-wider block mb-2 opacity-80">
                Attached file(s)
              </span>
              {st.attachments && st.attachments.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {st.attachments.map((att, iIdx) => {
                    const isImg = att.url?.match(/\.(jpeg|jpg|gif|png|webp|bmp)($|\?)/i);
                    const isPdf = att.url?.match(/\.pdf($|\?|#)/i) || att.type === 'application/pdf';
                    return (
                      <a
                        key={iIdx}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isImg || isPdf) {
                            e.preventDefault();
                            setZoomableImageSrc(att.url);
                          }
                        }}
                        href={ensureUrlProtocol(att.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 group w-full"
                      >
                        <div className="w-8 h-8 shrink-0 bg-white dark:bg-[#1e1e20] border border-blue-200 rounded flex items-center justify-center overflow-hidden relative">
                          {isImg ? (
                            <img src={att.url} alt="Attached preview" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          ) : isPdf ? (
                            <FileText className="w-4 h-4 text-rose-500" />
                          ) : (
                            <Paperclip className="w-4 h-4 text-blue-500" />
                          )}
                          <div className="absolute inset-0 bg-black/40 items-center justify-center hidden group-hover:flex transition-opacity">
                            <ExternalLink className="w-3 h-3 text-white" />
                          </div>
                        </div>
                        <span
                          className="text-xs font-medium text-blue-700 dark:text-[#8ab4f8] group-hover:text-blue-800 hover:underline truncate"
                          title={att.name || att.url || 'Download Attached File'}
                        >
                          {att.name || att.url || 'Attached Link'}
                        </span>
                      </a>
                    );
                  })}
                </div>
              ) : st.fileUrl || st.childFileUrl ? (
                (() => {
                  const fileUrl = st.fileUrl || st.childFileUrl;
                  const isImg = fileUrl?.match(/\.(jpeg|jpg|gif|png|webp|bmp)($|\?)/i);
                  const isPdf = fileUrl?.match(/\.pdf($|\?|#)/i);
                  return (
                    <a
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isImg || isPdf) {
                          e.preventDefault();
                          setZoomableImageSrc(fileUrl);
                        }
                      }}
                      href={ensureUrlProtocol(fileUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 group w-full"
                    >
                      <div className="w-10 h-10 shrink-0 bg-white dark:bg-[#1e1e20] border border-blue-200 rounded flex items-center justify-center overflow-hidden relative">
                        {isImg ? (
                          <img src={fileUrl} alt="Attached preview" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        ) : isPdf ? (
                          <FileText className="w-5 h-5 text-rose-500" />
                        ) : (
                          <Paperclip className="w-5 h-5 text-blue-500" />
                        )}
                        <div className="absolute inset-0 bg-black/40 items-center justify-center hidden group-hover:flex transition-opacity">
                          <ExternalLink className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <span
                        className="text-sm font-medium text-blue-700 dark:text-[#8ab4f8] group-hover:text-blue-800 hover:underline truncate"
                        title={st.fileName || st.childFileName || 'Download Attached File'}
                      >
                        {st.fileName || st.childFileName || 'Download Attached File'}
                      </span>
                    </a>
                  );
                })()
              ) : (
                <span className="text-xs text-slate-400 dark:text-[#838383] italic flex items-center gap-1">
                  <Paperclip className="w-3 h-3" /> No file attached
                </span>
              )}
            </div>

            {/* Flow/Status */}
            <div className="w-40 shrink-0 bg-blue-100 dark:bg-[#333336]/40 p-2.5 rounded border border-blue-200 flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-blue-800 dark:text-[#8ab4f8] tracking-wider block mb-1 opacity-80 text-center">
                Flow Status
              </span>
              <div
                className={cn(
                  'text-[11px] font-bold px-2 py-1.5 rounded-lg border w-full text-center break-words leading-snug',
                  (st.delegationStatus || st.status) === 'Completed'
                    ? 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200'
                    : (st.delegationStatus || st.status) === 'On process' ||
                      (st.delegationStatus || st.status) === 'Accepted'
                    ? 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200'
                    : (st.delegationStatus || st.status) === 'Delayed' ||
                      ['requested', 'hold', 'waiting for approval', 'pending completed'].includes(
                        (st.delegationStatus || st.status || '').toLowerCase()
                      )
                    ? 'bg-orange-50 text-orange-600 border-orange-200'
                    : (st.delegationStatus || st.status) === 'Approved' ||
                      (st.delegationStatus || st.status) === 'Rejected' ||
                      (st.delegationStatus || st.status) === 'Request Delay' ||
                      (st.delegationStatus || st.status) === 'Needs Rework'
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : (st.delegationStatus || st.status) === 'Assigned' || !(st.delegationStatus || st.status)
                    ? 'bg-orange-50 text-orange-600 border-orange-200'
                    : 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]'
                )}
              >
                Flow: {st.delegationStatus || st.status || 'Assigned'}
              </div>
            </div>

            {/* Approve/Reject */}
            <div className="w-48 shrink-0 bg-blue-100 dark:bg-[#333336]/40 p-2.5 rounded border border-blue-200 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-blue-800 dark:text-[#8ab4f8] tracking-wider block mb-1 opacity-80">
                Approval state
              </span>
              <select
                value={selectValue}
                onChange={(e) => {
                  const val = e.target.value;
                  const payload: Partial<DelegationSubTask> = { approvalStatus: val };
                  if (val === 'Approved') {
                    payload.status = 'Approved';
                    payload.delegationStatus = 'Completed';
                    payload.finishAct = new Date().toISOString().substring(0, 10);
                    payload.approvedAt = new Date().toISOString();
                  } else if (val === 'Rejected') {
                    payload.status = 'Rejected';
                    payload.delegationStatus = 'Rejected';
                    payload.approvedAt = null;
                  } else if (val === 'Hold') {
                    payload.approvalStatus = 'Requested';
                    payload.approvedAt = null;
                  } else if (val === 'AcceptTask') {
                    payload.status = 'On process';
                    payload.delegationStatus = 'On process';
                    if (!st.startAct) {
                      payload.startAct = new Date().toISOString().substring(0, 10);
                    }
                    payload.approvedAt = null;
                  } else if (val === 'ReqApproval') {
                    payload.status = 'Pending completed';
                    payload.delegationStatus = 'Pending completed';
                    payload.approvalStatus = 'Requested';
                    payload.approvedAt = null;
                  } else if (val === 'ReqReview') {
                    payload.status = 'Needs Rework';
                    payload.delegationStatus = 'Needs Rework';
                    payload.approvedAt = null;
                  } else {
                    payload.approvedAt = null;
                  }
                  handleUpdateSubTask(group, st.id, payload);
                }}
                disabled={!canEditSubTask}
                className={cn(
                  'text-xs w-full font-bold px-2 py-1.5 rounded border outline-none cursor-pointer',
                  (['requested', 'hold', 'pending completed', 'waiting for approval'].includes(
                    (st.delegationStatus || '').toLowerCase()
                  ) ||
                    ['requested', 'hold', 'pending completed', 'waiting for approval'].includes(
                      (st.status || '').toLowerCase()
                    ) ||
                    ['requested', 'hold', 'pending completed', 'waiting for approval'].includes(
                      (st.approvalStatus || '').toLowerCase()
                    )) &&
                    st.delegationStatus !== 'Completed' &&
                    st.status !== 'Completed'
                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : 'bg-purple-50 text-purple-700 border-purple-200'
                )}
              >
                <option value="None" disabled hidden>
                  State...
                </option>
                {(isPIC || isCreator) && <option value="AcceptTask">Accepted</option>}
                {(isPIC || isCreator) && <option value="ReqApproval">Requested Approval</option>}
                {isCreator && <option value="Approved">{t('Approved')}</option>}
                {isCreator && <option value="Rejected">{t('Rejected')}</option>}
              </select>
              {st.approvedAt && selectValue === 'Approved' && (
                <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-1 whitespace-nowrap">
                  {formatDisplayDateTime(st.approvedAt)}
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>
    </React.Fragment>
  );
});
