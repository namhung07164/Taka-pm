import React, { FC } from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { FileText, ExternalLink, Pin } from 'lucide-react';
import { Project, Task, AppUser, DelegationGroup } from '../../../types';
import { cn, getTaskStatus, resolveActualStatus, getSuggestedCompletionTime, parseDateTime, formatDisplayDateTime, computeDelegationGroupProgressPercent } from '../../../lib/utils';
import { doc } from 'firebase/firestore';
import { writeBatch, setDoc } from '../../../lib/firestoreWrites';
import { db, APP_ID } from '../../../lib/firebase';
import { scheduleDependentTasks } from '../../../lib/ganttUtils';
import { useAppStore } from '../../../store/useAppStore';

interface TaskChatDelegationSectionProps {
  linkedGroup: DelegationGroup;
  task: Task;
  currentProject: Project | undefined;
  currentUser: AppUser;
  appUsers: AppUser[];
  picOptions: string[];
  chatInputRef: React.RefObject<any>;
  tasks: Task[];
  projects: Project[];
}

export const TaskChatDelegationSection: React.FC<TaskChatDelegationSectionProps> = ({
  linkedGroup,
  task,
  currentProject,
  currentUser,
  appUsers,
  picOptions,
  chatInputRef,
  tasks,
  projects
}) => {
  const { t } = useLanguage();

  const firstSt = linkedGroup.subTasks[0];
  const flowTxtGroup = firstSt ? (firstSt.delegationStatus || firstSt.status || 'Assigned') : 'Assigned';

  const planStatus = getTaskStatus(task.start, task.finish);
  const isRunning = planStatus === 'On process';

  let groupBgColor = 'bg-slate-50 dark:bg-slate-900/10 border-slate-200 dark:border-slate-800/50';
  let groupTitleColor = 'text-slate-900 dark:text-slate-100';
  let groupIconColor = 'text-slate-600 dark:text-slate-400';
  let groupTrackerBtn = 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200';

  if (flowTxtGroup === 'Completed') {
    groupBgColor = 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30';
    groupTitleColor = 'text-green-900 dark:text-green-100';
    groupIconColor = 'text-green-600 dark:text-green-400';
    groupTrackerBtn = 'bg-green-100 dark:bg-green-800/50 hover:bg-green-200 dark:hover:bg-green-700 text-green-700 dark:text-green-200';
  } else if (flowTxtGroup === 'On process' || flowTxtGroup === 'Accepted') {
    groupBgColor = 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30';
    groupTitleColor = 'text-blue-900 dark:text-blue-100';
    groupIconColor = 'text-blue-600 dark:text-blue-400';
    groupTrackerBtn = 'bg-blue-100 dark:bg-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-200';
  } else if (
    flowTxtGroup === 'Pending completed' ||
    flowTxtGroup === 'Pending Completed' ||
    flowTxtGroup === 'Delayed' ||
    ['requested', 'hold', 'waiting for approval'].includes(flowTxtGroup.toLowerCase())
  ) {
    groupBgColor = 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
    groupTitleColor = 'text-orange-900 dark:text-orange-100';
    groupIconColor = 'text-orange-600 dark:text-orange-400';
    groupTrackerBtn = 'bg-orange-100 dark:bg-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-700 text-orange-700 dark:text-orange-200';
  } else if (flowTxtGroup === 'Approved' || flowTxtGroup === 'Rejected' || flowTxtGroup === 'Request Delay' || flowTxtGroup === 'Needs Rework') {
    groupBgColor = 'bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-900/30';
    groupTitleColor = 'text-purple-900 dark:text-purple-100';
    groupIconColor = 'text-purple-600 dark:text-purple-400';
    groupTrackerBtn = 'bg-purple-100 dark:bg-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-700 text-purple-700 dark:text-purple-200';
  } else if (flowTxtGroup === 'Assigned') {
    groupBgColor = 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
    groupTitleColor = 'text-orange-900 dark:text-orange-100';
    groupIconColor = 'text-orange-600 dark:text-orange-400';
    groupTrackerBtn = 'bg-orange-100 dark:bg-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-700 text-orange-700 dark:text-orange-200';
  }

  return (
    <div className={cn("mb-6 p-4 border rounded-xl shadow-sm transition-all duration-500", groupBgColor, isRunning ? "ring-2 ring-blue-500 dark:ring-blue-400 shadow-md" : "")}>
      <div className="flex items-center justify-between mb-3">
        <h4 className={cn("text-sm font-bold flex items-center gap-2", groupTitleColor)}>
          <FileText className={cn("w-4 h-4", groupIconColor)} />
          {task.name || 'Delegated Sub-tasks'}
        </h4>
        <div className="flex items-center gap-2">
          {(() => {
            const actualStatus = resolveActualStatus(planStatus, linkedGroup.subTasks);
            return (
              <span className={`text-[10px] px-2 py-1 rounded-full font-bold border whitespace-nowrap ${actualStatus.color}`}>
                Act: {actualStatus.label} ({computeDelegationGroupProgressPercent(linkedGroup)}%)
              </span>
            );
          })()}
          <a
            href={`https://tracker.taka-pm.org/?search=${encodeURIComponent((linkedGroup.projectCode ? linkedGroup.projectCode + ' ' : '') + linkedGroup.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-bold transition-colors", groupTrackerBtn)}
            title="Open Tracker & Search"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Tracker
          </a>
        </div>
      </div>
      <div className="space-y-2">
        <datalist id="pic-list-modal">
          {picOptions.map((u, i) => (
            <option key={i} value={u} />
          ))}
        </datalist>
        {linkedGroup.subTasks.map(st => {
          const isCreator = (linkedGroup.createdBy === currentUser.id) || (currentUser.role === 'admin');
          const pPartyList = String(st.party || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
          const userParties = currentUser.partyPermissions
            ? Object.keys(currentUser.partyPermissions)
                .filter(k => currentUser.partyPermissions![k])
                .map(k => k.toLowerCase().trim())
            : [];
          const isPIC =
            userParties.includes('all') ||
            pPartyList.some(p => userParties.includes(p)) ||
            pPartyList.includes(String(currentUser.username || '').toLowerCase().trim()) ||
            (st.involvedUsers && st.involvedUsers.includes(currentUser.id));

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
          ) {
            selectValue = 'Hold';
          }

          const flowTxt = st.delegationStatus || st.status || 'Assigned';
          let flowColor = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
          let cardBgColor = 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446]';

          if (flowTxt === 'Completed') {
            flowColor = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
            cardBgColor = 'bg-green-50/50 dark:bg-emerald-900/10 border-green-200 dark:border-emerald-900/30';
          } else if (flowTxt === 'On process' || flowTxt === 'Accepted') {
            flowColor = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
            cardBgColor = 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30';
          } else if (flowTxt === 'Delayed' || ['requested', 'hold', 'waiting for approval', 'pending completed'].includes(flowTxt.toLowerCase())) {
            flowColor = 'bg-orange-50 text-orange-600 border-orange-200';
            cardBgColor = 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
          } else if (flowTxt === 'Approved' || flowTxt === 'Rejected' || flowTxt === 'Request Delay' || flowTxt === 'Needs Rework') {
            flowColor = 'bg-purple-50 text-purple-700 border-purple-200';
            cardBgColor = 'bg-purple-50/50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-900/30';
          } else if (flowTxt === 'Assigned') {
            flowColor = 'bg-orange-50 text-orange-600 border-orange-200';
            cardBgColor = 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
          }

          return (
            <div key={st.id} className={cn("flex flex-col gap-1.5 p-2.5 rounded-lg border text-xs shadow-sm cursor-default", cardBgColor)}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 flex items-center gap-1 min-w-0">
                  <span className="text-slate-500 font-medium whitespace-nowrap">To:</span>
                  <input
                    type="text"
                    list="pic-list-modal"
                    defaultValue={st.party || ''}
                    disabled={!(isCreator || currentUser.role === 'admin')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = e.currentTarget.value.trim();
                        if (val) {
                          const match = picOptions.find(opt => opt.toLowerCase().startsWith(val.toLowerCase()) || opt.toLowerCase().includes(val.toLowerCase()));
                          if (match) {
                            e.currentTarget.value = match;
                          }
                        }
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={async (e) => {
                      const val = e.target.value.trim();
                      const allowed = new Set([...picOptions, ""]);
                      if (val !== "" && !allowed.has(val)) {
                        useAppStore.getState().setToast({ title: "Notice", message: "Invalid PIC. Please select from the dropdown options." });
                        e.target.value = st.party || "";
                        return;
                      }
                      const updatedSubTasks = linkedGroup.subTasks.map(sub => sub.id === st.id ? { ...sub, party: val } : sub);
                      const fallbackGrpYear =
                        linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear))
                          ? Number(linkedGroup.projectYear)
                          : Number(currentProject?.year) || new Date().getFullYear();
                      try {
                        await setDoc(
                          doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id),
                          {
                            ...linkedGroup,
                            projectYear: fallbackGrpYear,
                            subTasks: updatedSubTasks,
                          },
                          { merge: true }
                        );
                      } catch (err) {
                        console.error('Error saving PIC:', err);
                      }
                    }}
                    className="bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-[#444446] focus:border-blue-500 outline-none w-[120px] leading-tight truncate px-0 font-medium text-slate-700 dark:text-[#e3e3e3] disabled:text-slate-500 disabled:cursor-not-allowed"
                    placeholder="Assign CP..."
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const tagName = task.name;
                      if (tagName && chatInputRef.current) {
                        chatInputRef.current.insertTaskTag(tagName);
                      }
                    }}
                    className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 p-1 rounded transition-colors shrink-0"
                    title="Pin this sub-task to comment box"
                  >
                    <Pin className="w-3 h-3" />
                  </button>
                  {linkedGroup.createdBy && (
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                      from {appUsers.find(u => u.id === linkedGroup.createdBy || (u.username && u.username.toLowerCase() === String(linkedGroup.createdBy).toLowerCase()))?.username || linkedGroup.createdBy || 'Unknown'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center gap-2">
                  <span className={cn("px-1.5 py-0 rounded text-[10px] leading-none h-5 flex items-center font-bold border shrink-0", flowColor)}>
                    {flowTxt}
                  </span>
                  <select
                    value={selectValue === 'None' ? 'None' : selectValue}
                    onChange={async (e) => {
                      const val = e.target.value;
                      const payload: any = { approvalStatus: val };
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

                      const updatedSubTasks = linkedGroup.subTasks.map(sub => sub.id === st.id ? { ...sub, ...payload } : sub);

                      const parentTask = tasks.find(t => t.id === linkedGroup.parentTaskId);
                      const parentProject = projects.find(p => String(p.no) === parentTask?.projectCode || p.id === parentTask?.projectCode);
                      const isRealtime = parentTask?.realtimeUpdate || parentProject?.realtimeUpdate;

                      let newT: Task | null = null;
                      let cascadeUpdates: Task[] = [];

                      if (parentTask && isRealtime) {
                        const computedPlStatus = getTaskStatus(parentTask.start, parentTask.finish);
                        const oldActStatusLabel = resolveActualStatus(computedPlStatus, linkedGroup.subTasks).label;
                        const newActStatusLabel = resolveActualStatus(computedPlStatus, updatedSubTasks).label;

                        if (newActStatusLabel === 'Completed' && oldActStatusLabel !== 'Completed') {
                          const nowStr = parentTask.approval === 'Approved' && parentTask.approvedAt ? getSuggestedCompletionTime(parentTask.approvedAt) : getSuggestedCompletionTime();
                          const taskUpdates: Partial<Task> = { finish: nowStr, durationManual: true };

                          if (parentTask.start) {
                            const finishDate = parseDateTime(nowStr);
                            const startDate = parseDateTime(parentTask.start);
                            if (finishDate && startDate) {
                              const diffTime = finishDate.getTime() - startDate.getTime();
                              const diffDays = diffTime / (1000 * 60 * 60 * 24);
                              if (diffDays < 0) {
                                taskUpdates.duration = "0";
                                taskUpdates.finish = taskUpdates.start || parentTask.start;
                              } else {
                                taskUpdates.duration = String(parseFloat(diffDays.toFixed(1)));
                              }
                            }
                          }

                          newT = { ...parentTask, ...taskUpdates, _isAutoActualized: true, updatedAt: new Date().toISOString() } as any;
                          cascadeUpdates = scheduleDependentTasks(newT!, tasks, projects);
                          delete (newT as any)._isAutoActualized;
                        } else if (newActStatusLabel !== 'Completed' && oldActStatusLabel === 'Completed' && parentTask.baselineFinish) {
                          const taskUpdates: Partial<Task> = { finish: parentTask.baselineFinish };
                          const finalStart = parentTask.baselineStart || parentTask.start;
                          if (parentTask.baselineStart) {
                            taskUpdates.start = parentTask.baselineStart;
                          }
                          if (finalStart) {
                            const finishDate = parseDateTime(parentTask.baselineFinish);
                            const startDate = parseDateTime(finalStart);
                            if (finishDate && startDate) {
                              const diffTime = finishDate.getTime() - startDate.getTime();
                              const diffDays = diffTime / (1000 * 60 * 60 * 24);
                              if (diffDays < 0) {
                                taskUpdates.duration = "0";
                                taskUpdates.finish = taskUpdates.start || parentTask.start;
                              } else {
                                taskUpdates.duration = String(parseFloat(diffDays.toFixed(1)));
                              }
                            }
                          }

                          newT = { ...parentTask, ...taskUpdates, _isAutoActualized: true, updatedAt: new Date().toISOString() } as any;
                          cascadeUpdates = scheduleDependentTasks(newT!, tasks, projects);
                          delete (newT as any)._isAutoActualized;
                        }
                      }

                      try {
                        const fallbackGrpYear =
                          linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear))
                            ? Number(linkedGroup.projectYear)
                            : Number(currentProject?.year) || new Date().getFullYear();
                        const batch = writeBatch(db);
                        batch.set(
                          doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id),
                          {
                            ...linkedGroup,
                            projectYear: fallbackGrpYear,
                            subTasks: updatedSubTasks,
                          },
                          { merge: true }
                        );
                        if (newT) {
                          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', newT.id), newT);
                        }
                        for (const u of cascadeUpdates) {
                          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', u.id), u);
                        }
                        await batch.commit();
                      } catch (err: any) {
                        console.error('Batch commit failed', err);
                        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
                      }
                    }}
                    disabled={!isCreator && !isPIC}
                    className={cn(
                      "appearance-none text-[10px] sm:text-[9px] min-h-[22px] font-bold px-2 py-1 flex-1 min-w-[70px] max-w-[120px] rounded border outline-none cursor-pointer text-left shrink-0",
                      (['requested', 'hold', 'pending completed', 'waiting for approval'].includes((st.delegationStatus || '').toLowerCase()) ||
                        ['requested', 'hold', 'pending completed', 'waiting for approval'].includes((st.status || '').toLowerCase()) ||
                        ['requested', 'hold', 'pending completed', 'waiting for approval'].includes((st.approvalStatus || '').toLowerCase())) &&
                        st.delegationStatus !== 'Completed' &&
                        st.status !== 'Completed'
                        ? "bg-orange-50 text-orange-700 border-orange-200"
                        : "bg-purple-50 text-purple-700 border-purple-200",
                      !isCreator && !isPIC && "opacity-50 cursor-not-allowed"
                    )}
                    style={{
                      backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23334155%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')",
                      backgroundPosition: "calc(100% - 4px) center",
                      backgroundRepeat: 'no-repeat',
                      paddingRight: '12px'
                    }}
                  >
                    <option value="None" disabled hidden>State... ▾</option>
                    {(isPIC || isCreator) && <option value="AcceptTask">Accepted</option>}
                    {(isPIC || isCreator) && <option value="ReqApproval">Requested Approval</option>}
                    {isCreator && <option value="Approved">{t("Approved")}</option>}
                    {isCreator && <option value="Rejected">{t("Rejected")}</option>}
                  </select>
                  <select
                    value={st.priority || 'Mid'}
                    onChange={async (e) => {
                      const val = e.target.value;
                      const updatedSubTasks = linkedGroup.subTasks.map(sub => sub.id === st.id ? { ...sub, priority: val } : sub);
                      const fallbackGrpYear =
                        linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear))
                          ? Number(linkedGroup.projectYear)
                          : Number(currentProject?.year) || new Date().getFullYear();
                      try {
                        await setDoc(
                          doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id),
                          {
                            ...linkedGroup,
                            projectYear: fallbackGrpYear,
                            subTasks: updatedSubTasks,
                          },
                          { merge: true }
                        );
                      } catch (err) {
                        console.error('Error saving priority:', err);
                      }
                    }}
                    disabled={!isCreator && !isPIC}
                    className={cn(
                      "appearance-none text-[10px] sm:text-[9px] min-h-[22px] font-bold px-2 py-1 flex-1 min-w-[60px] max-w-[80px] rounded border outline-none cursor-pointer text-left shrink-0",
                      st.priority === 'High' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                      st.priority === 'Mid-high' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                      st.priority === 'Low' ? 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]' :
                      'bg-blue-50 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8] border-blue-200',
                      !isCreator && !isPIC && "opacity-50 cursor-not-allowed"
                    )}
                    style={{
                      backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23334155%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')",
                      backgroundPosition: "calc(100% - 4px) center",
                      backgroundRepeat: 'no-repeat',
                      paddingRight: '12px'
                    }}
                  >
                    <option value="High">High</option>
                    <option value="Mid-high">Mid-high</option>
                    <option value="Mid">Mid</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                {st.approvedAt && selectValue === 'Approved' && (
                  <div className="text-[9px] text-slate-500 dark:text-[#838383] whitespace-nowrap pl-0.5 mt-0.5">
                    Approved: {formatDisplayDateTime(st.approvedAt)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
