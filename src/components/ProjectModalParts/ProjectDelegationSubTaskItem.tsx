import React, { FC, memo } from 'react';
import { Project, Task, AppUser, DelegationGroup, DelegationSubTask } from '../../types';
import { getTaskStatus, resolveActualStatus, parseDateTime, getSuggestedCompletionTime, cn } from '../../lib/utils';
import { scheduleDependentTasks } from '../../lib/ganttUtils';
import { doc } from 'firebase/firestore';
import { writeBatch, setDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { useAppStore } from '../../store/useAppStore';
import { useLanguage } from '../../lib/LanguageContext';
import { Pin, Trash2 } from 'lucide-react';

interface ProjectDelegationSubTaskItemProps {
  st: DelegationSubTask;
  linkedGroup: DelegationGroup & {
    _taskCode?: string;
    _taskName?: string;
    _isChildTask?: boolean;
    _parentTaskName?: string | null;
  };
  currentUser: AppUser;
  appUsers: AppUser[];
  project: Project;
  tasks: Task[];
  projects: Project[];
  picOptions: string[];
  onInsertTaskTag?: (tagName: string) => void;
  handleDeleteSubTask: (group: DelegationGroup, subTaskId: string) => Promise<void>;
}

export const ProjectDelegationSubTaskItem: React.FC<ProjectDelegationSubTaskItemProps> = React.memo(({
  st,
  linkedGroup,
  currentUser,
  appUsers,
  project,
  tasks,
  projects,
  picOptions,
  onInsertTaskTag,
  handleDeleteSubTask,
}) => {
  const { t } = useLanguage();
  const isCreator = (linkedGroup.createdBy === currentUser.id) || (currentUser.role === 'admin');
  const pPartyList = String(st.party || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const userParties = currentUser.partyPermissions ? Object.keys(currentUser.partyPermissions).filter(k => currentUser.partyPermissions![k]).map(k => k.toLowerCase().trim()) : [];
  const isPIC = userParties.includes('all') || pPartyList.some(p => userParties.includes(p)) || pPartyList.includes(String(currentUser.username || '').toLowerCase().trim()) || (st.involvedUsers && st.involvedUsers.includes(currentUser.id));

  let selectValue = 'None';
  const stStatus = String(st.delegationStatus || st.status || '').toLowerCase();
  const stApproval = String(st.approvalStatus || '').toLowerCase();
  if (stStatus === 'completed') selectValue = 'Approved';
  else if (stStatus === 'rejected') selectValue = 'Rejected';
  else if (stStatus === 'pending completed') selectValue = 'ReqApproval';
  else if (stStatus === 'needs rework') selectValue = 'ReqReview';
  else if (stStatus === 'on process' || stStatus === 'accepted') selectValue = 'AcceptTask';
  else if (['requested', 'hold', 'waiting for approval'].includes(stStatus) || ['requested', 'hold', 'waiting for approval'].includes(stApproval)) selectValue = 'Hold';

  let cardBgColor = 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446]';
  const flowTxt = st.delegationStatus || st.status || 'Assigned';

  if (flowTxt === 'Completed') {
    cardBgColor = 'bg-green-50/50 dark:bg-emerald-900/10 border-green-200 dark:border-emerald-900/30';
  } else if (flowTxt === 'On process' || flowTxt === 'Accepted') {
    cardBgColor = 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30';
  } else if (flowTxt === 'Pending completed' || flowTxt === 'Pending Completed') {
    cardBgColor = 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
  } else if (flowTxt === 'Approved' || flowTxt === 'Rejected' || flowTxt === 'Request Delay' || flowTxt === 'Needs Rework') {
    cardBgColor = 'bg-purple-50/50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-900/30';
  } else if (flowTxt === 'Assigned') {
    cardBgColor = 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
  }

  return (
    <div key={st.id} className={cn("flex flex-col gap-1.5 p-2.5 rounded-lg border text-xs shadow-sm cursor-default", cardBgColor)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <span className="text-slate-500 font-medium whitespace-nowrap">To:</span>
          <input
            type="text"
            list="pic-list-modal-project"
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
              try {
                setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), {
                  ...linkedGroup,
                  subTasks: updatedSubTasks,
                }, { merge: true });
              } catch (err) {
                console.error(err);
              }
            }}
            className="bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-[#444446] focus:border-blue-500 outline-none w-[120px] leading-tight truncate px-0 font-medium text-slate-700 dark:text-[#e3e3e3] disabled:text-slate-500 disabled:cursor-not-allowed"
            placeholder="Assign CP..."
          />
        </div>
        <div className="flex items-center gap-1">
          {onInsertTaskTag && linkedGroup._taskName && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onInsertTaskTag(linkedGroup._taskName!);
              }}
              className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 p-1 rounded transition-colors shrink-0"
              title="Pin this sub-task to comment box"
            >
              <Pin className="w-3 h-3" />
            </button>
          )}
          {linkedGroup.createdBy && (
            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
              from {appUsers.find(u => u.id === linkedGroup.createdBy || (u.username && u.username.toLowerCase() === String(linkedGroup.createdBy).toLowerCase()))?.username || linkedGroup.createdBy || 'Unknown'}
            </span>
          )}
          {(currentUser.role === 'admin' || linkedGroup.createdBy === currentUser.id) && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteSubTask(linkedGroup, st.id);
              }}
              className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1 rounded transition-colors shrink-0 ml-1"
              title="Delete this sub-task"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 mt-1">
        <div className="flex items-center gap-2">
          <select
            value={selectValue === 'None' ? 'None' : selectValue}
            onChange={async (e) => {
              const val = e.target.value;
              let payload: any = { approvalStatus: val };
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
              const isRealtime = parentTask?.realtimeUpdate || project?.realtimeUpdate;

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
                      const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                      taskUpdates.duration = String(diffDays);
                    }
                  }

                  newT = { ...parentTask, ...taskUpdates };
                  cascadeUpdates = scheduleDependentTasks(newT, tasks, projects);
                } else if (newActStatusLabel === 'On Process' && oldActStatusLabel !== 'On Process' && oldActStatusLabel !== 'Completed') {
                  const nowStr = getSuggestedCompletionTime();
                  const taskUpdates: Partial<Task> = { start: nowStr };

                  if (parentTask.duration && !parentTask.finishManual) {
                    const dur = parseInt(parentTask.duration);
                    if (!isNaN(dur) && dur > 0) {
                      const sd = parseDateTime(nowStr);
                      if (sd) {
                        const ed = new Date(sd);
                        ed.setDate(ed.getDate() + dur - 1);
                        taskUpdates.finish = getSuggestedCompletionTime(ed.toISOString());
                      }
                    }
                  }
                  newT = { ...parentTask, ...taskUpdates };
                  cascadeUpdates = scheduleDependentTasks(newT, tasks, projects);
                }
              }

              try {
                const batch = writeBatch(db);
                batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), {
                  ...linkedGroup,
                  subTasks: updatedSubTasks,
                }, { merge: true });

                if (newT) {
                  const allUpdates = [newT, ...cascadeUpdates];
                  allUpdates.forEach(t => {
                    batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t, { merge: true });
                  });
                }

                batch.commit().catch(e => console.error("Batch commit failed", e));
              } catch (err) {
                console.error(err);
              }
            }}
            disabled={!isCreator && !isPIC}
            className={cn(
              "appearance-none text-[10px] sm:text-[9px] min-h-[22px] font-bold px-2 py-1 flex-1 min-w-[100px] rounded border outline-none cursor-pointer text-left",
              "bg-white dark:bg-[#1e1e20] text-slate-800 dark:text-[#e3e3e3] border-slate-200 dark:border-[#444446]",
              (!isCreator && !isPIC) && "opacity-50 cursor-not-allowed"
            )}
            style={{ backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23334155%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')", backgroundPosition: "calc(100% - 4px) center", backgroundRepeat: 'no-repeat', paddingRight: '12px' }}
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
              try {
                setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), {
                  ...linkedGroup,
                  subTasks: updatedSubTasks,
                }, { merge: true });
              } catch (err) {
                console.error(err);
              }
            }}
            disabled={!isCreator && !isPIC}
            className={cn(
              "appearance-none text-[10px] sm:text-[9px] min-h-[22px] font-bold px-2 py-1 flex-1 min-w-[60px] max-w-[80px] rounded border outline-none cursor-pointer text-left shrink-0",
              st.priority === 'High' ? 'bg-orange-50 text-orange-700 border-orange-200' :
              st.priority === 'Mid-high' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
              st.priority === 'Low' ? 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-500 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]' :
              'bg-blue-50 dark:bg-[#28282a] text-blue-700 dark:text-[#8ab4f8] border-blue-200',
              (!isCreator && !isPIC) && "opacity-50 cursor-not-allowed"
            )}
            style={{ backgroundImage: "url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23334155%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')", backgroundPosition: "calc(100% - 4px) center", backgroundRepeat: 'no-repeat', paddingRight: '12px' }}
          >
            <option value="High">High</option>
            <option value="Mid-high">Mid-high</option>
            <option value="Mid">Mid</option>
            <option value="Low">Low</option>
          </select>
        </div>
        {st.approvedAt && selectValue === 'Approved' && (
          <div className="text-[9px] text-slate-500 dark:text-[#838383] whitespace-nowrap pl-0.5 mt-0.5">
            Approved: {new Date(st.approvedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
});
ProjectDelegationSubTaskItem.displayName = 'ProjectDelegationSubTaskItem';
