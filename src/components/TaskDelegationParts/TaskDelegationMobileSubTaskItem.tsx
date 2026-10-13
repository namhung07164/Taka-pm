import React, { memo } from 'react';
import { Search, Trash2, Paperclip, Maximize2, ExternalLink, FileText } from 'lucide-react';
import { DelegationGroup, DelegationSubTask, AppUser, Project, Task } from '../../types';
import { cn, formatDisplayDateMain, formatDisplayDateTime, resolveActualStatus, parseDateTime, formatToDatetimeLocal, ensureUrlProtocol, getActStatusPercent } from '../../lib/utils';
import { MultiSelectInput } from '../DelegationParts/MultiSelectInput';
import { useLanguage } from '../../lib/LanguageContext';
import { useAppStore } from '../../store/useAppStore';

interface TaskDelegationMobileSubTaskItemProps {
  st: DelegationSubTask;
  group: DelegationGroup;
  parentTask: Task | null | undefined;
  parentProject: Project | null | undefined;
  plStatus: string;
  canWrite: boolean;
  currentUser: AppUser;
  focusTarget: { groupId: string; subTaskId?: string } | null;
  picOptions: string[];
  uniqueParties: string[];
  handleUpdateSubTask: (group: DelegationGroup, subTaskId: string, updates: Partial<DelegationSubTask>) => void;
  handleDeleteSubTask: (group: DelegationGroup, subTaskId: string) => void;
  setMultiSearchTerm: (term: string) => void;
}

export const TaskDelegationMobileSubTaskItem = React.memo(function TaskDelegationMobileSubTaskItem({
  st,
  group,
  parentTask,
  parentProject,
  plStatus,
  canWrite,
  currentUser,
  focusTarget,
  picOptions,
  uniqueParties,
  handleUpdateSubTask,
  handleDeleteSubTask,
  setMultiSearchTerm,
}: TaskDelegationMobileSubTaskItemProps) {
  const { t } = useLanguage();
  const isAdmin = currentUser.role === 'admin';

  const parsedStartObj = parseDateTime(
    parentTask?.start || parentProject?.computedTakStart || parentProject?.start
  );
  const defaultStartAct = parsedStartObj ? formatToDatetimeLocal(parsedStartObj) : '';
  const parsedFinishObj = parseDateTime(parentTask?.finish || parentProject?.computedTakCompl);
  const defaultFinishAct = parsedFinishObj ? formatToDatetimeLocal(parsedFinishObj) : '';

  const isCreator = isAdmin || group.createdBy === currentUser.id;
  const pPartyList = String(st.party || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
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

  let selectValue = 'None';
  const stStatus = String(st.delegationStatus || st.status || '').toLowerCase();
  const stApproval = String(st.approvalStatus || '').toLowerCase();
  if (stStatus === 'completed') selectValue = 'Approved';
  else if (stStatus === 'rejected') selectValue = 'Rejected';
  else if (stStatus === 'pending completed') selectValue = 'ReqApproval';
  else if (stStatus === 'needs rework') selectValue = 'ReqReview';
  else if (stStatus === 'on process' || stStatus === 'accepted') selectValue = 'AcceptTask';
  else if (
    ['requested', 'hold', 'waiting for approval'].includes(stStatus) ||
    ['requested', 'hold', 'waiting for approval'].includes(stApproval)
  )
    selectValue = 'Hold';

  const flowTxt = st.delegationStatus || st.status || 'Assigned';
  let flowColor =
    'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
  let cardBgColor = 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446]';

  if (flowTxt === 'Completed') {
    flowColor = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
    cardBgColor = 'bg-green-50/50 dark:bg-emerald-900/10 border-green-200 dark:border-emerald-900/30';
  } else if (flowTxt === 'On process' || flowTxt === 'Accepted') {
    flowColor = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
    cardBgColor = 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30';
  } else if (
    flowTxt === 'Delayed' ||
    ['requested', 'hold', 'waiting for approval', 'pending completed'].includes(flowTxt.toLowerCase())
  ) {
    flowColor = 'bg-orange-50 text-orange-600 border-orange-200';
    cardBgColor = 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
  } else if (
    flowTxt === 'Approved' ||
    flowTxt === 'Rejected' ||
    flowTxt === 'Request Delay' ||
    flowTxt === 'Needs Rework'
  ) {
    flowColor = 'bg-purple-50 text-purple-700 border-purple-200';
    cardBgColor = 'bg-purple-50/50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-900/30';
  } else if (flowTxt === 'Assigned') {
    flowColor = 'bg-orange-50 text-orange-600 border-orange-200';
    cardBgColor = 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
  }

  return (
    <div
      id={`delegation-subtask-mobile-${st.id}`}
      key={st.id}
      className={cn(
        'border flex flex-col rounded-lg p-3 shadow-sm relative transition-all duration-300',
        cardBgColor,
        focusTarget?.subTaskId === st.id ? 'ring-2 ring-yellow-400 dark:ring-yellow-600' : ''
      )}
    >
      <div className="flex items-start gap-2 mb-3 mt-1 w-full">
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5 max-w-full">
          <select
            value={st.priority || 'Mid'}
            onChange={(e) => handleUpdateSubTask(group, st.id, { priority: e.target.value as any })}
            disabled={!canEditSubTask}
            title="Priority"
            style={{
              backgroundImage:
                "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23334155%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')",
              backgroundPosition: 'calc(100% - 6px) center',
            }}
            className={cn(
              'rounded pl-2 pr-6 md:pr-5 py-1.5 md:py-1.5 text-xs md:text-xs leading-tight font-bold outline-none appearance-none bg-[length:12px_12px] bg-no-repeat w-auto min-w-[70px] max-w-[85px] shrink-1 md:min-w-[80px] h-[32px] md:h-auto',
              st.priority === 'High'
                ? 'bg-orange-50 text-orange-700 border border-orange-200'
                : st.priority === 'Mid-high'
                ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                : st.priority === 'Low'
                ? 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446]'
                : 'bg-blue-50 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8] border border-blue-200'
            )}
          >
            <option value="High">High</option>
            <option value="Mid-high">Mid-H</option>
            <option value="Mid">Mid</option>
            <option value="Low">Low</option>
          </select>
          <MultiSelectInput
            value={st.party || ''}
            options={[...picOptions, ...uniqueParties]}
            onSave={(val) => handleUpdateSubTask(group, st.id, { party: val })}
            disabled={!canEditSubTask}
            placeholder="PIC"
            className="bg-slate-50 dark:bg-[#1e1e20]/50 border border-slate-200 dark:border-[#444446] rounded pl-2.5 pr-2 md:px-2 py-1.5 md:py-1.5 text-xs md:text-xs leading-tight font-bold text-slate-700 dark:text-[#c3c3c3] outline-none flex-grow shrink w-full min-w-[70px] h-[32px] md:h-[24px]"
          />
          <div
            className={`text-[9px] md:text-[10px] leading-tight font-bold px-1.5 py-0.5 md:py-1 rounded-full border whitespace-nowrap ${
              resolveActualStatus(plStatus, [st]).color
            } shrink-0`}
          >
            Act: {resolveActualStatus(plStatus, [st]).label} ({getActStatusPercent(resolveActualStatus(plStatus, [st]).label)}%)
          </div>
          <button
            type="button"
            onClick={() =>
              setMultiSearchTerm((parentProject?.code ? parentProject.code + ' ' : '') + (st.name || group.name))
            }
            className="p-1 md:p-1.5 bg-slate-50 dark:bg-[#1e1e20]/50 text-blue-400 hover:bg-blue-50 dark:hover:bg-[#333336] hover:text-blue-600 dark:text-[#8ab4f8] rounded transition-colors ml-0.5 shrink-0 cursor-pointer"
            title="Filter by Tracker"
          >
            <Search className="w-3 h-3 md:w-4 md:h-4" />
          </button>
          {canWrite && (
            <button
              onClick={() => handleDeleteSubTask(group, st.id)}
              className="p-1 md:p-1.5 bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-400 dark:text-[#838383] hover:bg-red-50 hover:text-red-500 rounded transition-colors ml-0.5 shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="flex flex-col bg-slate-50 dark:bg-[#1e1e20]/80 border border-slate-100 dark:border-[#333336] rounded-lg p-2 min-h-[46px] justify-center">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-[#838383] mb-0.5 tracking-wider">
            Start (Act)
          </span>
          <div className="relative w-full">
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
              className="absolute inset-0 w-full h-full opacity-0 z-10"
            />
            <div className="text-xs font-bold text-slate-700 dark:text-[#c3c3c3]">
              {formatDisplayDateMain(st.startAct || defaultStartAct)}
            </div>
          </div>
        </div>
        <div className="flex flex-col bg-slate-50 dark:bg-[#1e1e20]/80 border border-slate-100 dark:border-[#333336] rounded-lg p-2 min-h-[46px] justify-center">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-[#838383] mb-0.5 tracking-wider">
            Finish (Act)
          </span>
          <div className="relative w-full">
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
              className="absolute inset-0 w-full h-full opacity-0 z-10"
            />
            <div className="text-xs font-bold text-slate-700 dark:text-[#c3c3c3]">
              {formatDisplayDateMain(st.finishAct || defaultFinishAct)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-3 bg-blue-50/30 dark:bg-[#1e1e20] p-2 rounded-lg border border-blue-50">
        <div className="flex gap-2">
          <span
            className={`text-[11px] leading-snug w-1/2 text-center break-words py-1.5 px-2 font-bold border rounded flex items-center justify-center ${flowColor}`}
          >
            Flow: {flowTxt}
          </span>
          <div className="w-1/2 flex flex-col items-end">
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
              style={{ backgroundPosition: 'calc(100% - 4px) center' }}
              className="w-full text-xs font-bold pl-2 pr-6 py-1.5 rounded border border-blue-200 bg-white dark:bg-[#1e1e20] shadow-sm text-blue-700 dark:text-[#8ab4f8] outline-none h-[32px] appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%232563eb%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-no-repeat"
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
      </div>

      <div className="flex flex-col gap-2 text-xs border-t border-slate-100 dark:border-[#333336] pt-3">
        <div className="flex flex-col gap-1 mt-1 bg-slate-50 dark:bg-[#1e1e20]/50 rounded p-2">
          <span className="text-[9px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-wider">
            {t('Comments')}
          </span>
          <textarea
            defaultValue={st.comments || ''}
            onBlur={(e) => handleUpdateSubTask(group, st.id, { comments: e.target.value })}
            disabled={!canEditSubTask}
            rows={1}
            className="w-full text-base md:text-xs text-slate-600 dark:text-[#a3a3a3] bg-transparent outline-none border border-transparent rounded hover:border-slate-200 dark:hover:border-[#444446] focus:border-blue-500 focus:p-1 focus:bg-white dark:focus:bg-[#1e1e20] resize-none font-medium min-h-[24px]"
            placeholder="+ Add comments"
          />
        </div>

        <div className="flex flex-col gap-1 mt-1 bg-blue-50/40 dark:bg-[#28282a] rounded border border-blue-100 p-2.5">
          <span className="text-[9px] font-bold text-blue-600 dark:text-[#8ab4f8] uppercase tracking-wider">
            {t('Report')}
          </span>
          <div className="text-xs text-slate-700 dark:text-[#c3c3c3] font-medium whitespace-pre-wrap">
            {st.report || st.childReport || (
              <span className="italic text-slate-400 dark:text-[#838383] font-normal">No report yet</span>
            )}
          </div>
          {st.attachments && st.attachments.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1.5 text-[10px]">
              {st.attachments.map((att, iIdx) => {
                if (!att.url) return null;
                const isPdf = att.url.match(/\.pdf($|\?|#)/i) || att.type === 'application/pdf';
                return (
                  <div key={iIdx} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        useAppStore.getState().setZoomableImageSrc(att.url);
                      }}
                      className="flex items-center gap-1.5 text-blue-700 dark:text-[#8ab4f8] hover:text-blue-800 font-bold bg-white dark:bg-[#1e1e20] border border-blue-200 shadow-sm rounded px-2.5 py-1.5 w-fit active:scale-95 transition"
                    >
                      {isPdf ? <FileText className="w-3.5 h-3.5 text-rose-500" /> : <Paperclip className="w-3.5 h-3.5 text-blue-500" />}
                      <span className="truncate max-w-[150px]">{att.name || att.url || 'Attached File'}</span>
                      <Maximize2 className="w-3 h-3 text-slate-400 ml-1" />
                    </button>
                    <a
                      onClick={(e) => e.stopPropagation()}
                      href={ensureUrlProtocol(att.url)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open Link"
                      className="p-1.5 text-slate-400 hover:text-blue-500 bg-white dark:bg-[#1e1e20] border border-blue-200 rounded"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                );
              })}
            </div>
          ) : (
            (st.fileUrl || st.childFileUrl) && (
              <div className="mt-2 text-[10px]">
                {(() => {
                  const fUrl = st.fileUrl || st.childFileUrl;
                  if (!fUrl) return null;
                  const isPdf = fUrl.match(/\.pdf($|\?|#)/i);
                  return (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          useAppStore.getState().setZoomableImageSrc(fUrl);
                        }}
                        className="flex items-center gap-1.5 text-blue-700 dark:text-[#8ab4f8] hover:text-blue-800 font-bold bg-white dark:bg-[#1e1e20] border border-blue-200 shadow-sm rounded px-2.5 py-1.5 w-fit active:scale-95 transition"
                      >
                        {isPdf ? <FileText className="w-3.5 h-3.5 text-rose-500" /> : <Paperclip className="w-3.5 h-3.5 text-blue-500" />}
                        <span className="truncate max-w-[150px]">{st.fileName || st.childFileName || 'Download file'}</span>
                        <Maximize2 className="w-3 h-3 text-slate-400 ml-1" />
                      </button>
                      <a
                        onClick={(e) => e.stopPropagation()}
                        href={ensureUrlProtocol(fUrl)}
                        target="_blank"
                        rel="noreferrer"
                        title="Open Link"
                        className="p-1.5 text-slate-400 hover:text-blue-500 bg-white dark:bg-[#1e1e20] border border-blue-200 rounded"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  );
                })()}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
});
