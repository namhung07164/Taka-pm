import React, { FC } from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { Task, AppUser, DelegationGroup, Project } from '../../../types';
import { cn } from '../../../lib/utils';
import { doc } from 'firebase/firestore';
import { setDoc } from '../../../lib/firestoreWrites';
import { db, APP_ID } from '../../../lib/firebase';

interface TaskChatApprovalBoardProps {
  text: string;
  isMe?: boolean;
  task: Task;
  tasks: Task[];
  currentProject?: Project;
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
}

export const TaskChatApprovalBoard: React.FC<TaskChatApprovalBoardProps> = ({
  text,
  isMe = false,
  task,
  tasks,
  currentProject,
  delegationGroups,
  currentUser
}) => {
  const { t } = useLanguage();

  if (!text) return null;

  const taggedTasks = tasks.filter(t => 
    t.name && 
    t.projectCode === task.projectCode && 
    t.projectStore === task.projectStore && 
    t.projectYear === task.projectYear && 
    text.includes(`#${t.name}-approval`)
  );

  const uniqueTaggedTasks: Task[] = [];
  const seenNames = new Set<string>();
  for (const tg of taggedTasks) {
    if (!seenNames.has(tg.name)) {
      seenNames.add(tg.name);
      uniqueTaggedTasks.push(tg);
    }
  }

  const relevantGroups = uniqueTaggedTasks
    .map(tg => delegationGroups.find(g => g.parentTaskId === tg.id))
    .filter(Boolean) as DelegationGroup[];

  if (relevantGroups.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-3">
      {relevantGroups.map(g => (
        <div
          key={g.id}
          className={cn(
            "p-2 rounded-lg border text-xs shadow-sm",
            isMe ? "bg-blue-700 border-blue-500" : "bg-slate-50 dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446]"
          )}
        >
          <div
            className="font-bold mb-2 pb-1 border-b flex items-center justify-between"
            style={{ borderColor: isMe ? 'rgba(255,255,255,0.2)' : 'var(--tw-border-opacity)' }}
          >
            <span>{g.name} - Approvals</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {g.subTasks.map(st => {
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

              let statusColor = isMe ? "text-white" : "text-slate-500 dark:text-slate-400";
              let bgStatus = isMe ? "bg-white/20" : "bg-slate-100 dark:bg-[#333336]";
              if (!isMe) {
                if (selectValue === 'Approved') {
                  statusColor = "text-emerald-700 dark:text-emerald-400";
                  bgStatus = "bg-emerald-100 dark:bg-emerald-900/30";
                } else if (selectValue === 'Rejected') {
                  statusColor = "text-red-700 dark:text-red-400";
                  bgStatus = "bg-red-100 dark:bg-red-900/30";
                } else if (selectValue === 'ReqApproval') {
                  statusColor = "text-orange-700 dark:text-orange-400";
                  bgStatus = "bg-orange-100 dark:bg-orange-900/30";
                } else if (selectValue === 'Hold') {
                  statusColor = "text-amber-700 dark:text-amber-400";
                  bgStatus = "bg-amber-100 dark:bg-amber-900/30";
                } else if (selectValue === 'AcceptTask') {
                  statusColor = "text-blue-700 dark:text-blue-400";
                  bgStatus = "bg-blue-100 dark:bg-blue-900/30";
                }
              }

              const isCreator = (g.createdBy === currentUser.id) || (currentUser.role === 'admin');
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

              if (!isCreator && !isPIC) return null;

              return (
                <div
                  key={st.id}
                  className={cn(
                    "flex flex-col gap-1.5 p-2 rounded",
                    isMe ? "bg-blue-600" : "bg-white dark:bg-[#28282a] border border-slate-100 dark:border-[#333336]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs line-clamp-1 flex-1">{st.party || 'No PIC'}</span>
                    <select
                      value={selectValue}
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
                          payload.status = 'Pending Completed';
                          payload.delegationStatus = 'Pending Completed';
                          payload.approvedAt = null;
                        }

                        const updatedSubTasks = g.subTasks.map((sub: any) =>
                          sub.id === st.id ? { ...sub, ...payload } : sub
                        );
                        const fallbackGrpYear =
                          g.projectYear !== undefined && g.projectYear !== null && !isNaN(Number(g.projectYear))
                            ? Number(g.projectYear)
                            : Number(currentProject?.year) || new Date().getFullYear();
                        try {
                          await setDoc(
                            doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', g.id),
                            {
                              ...g,
                              projectYear: fallbackGrpYear,
                              subTasks: updatedSubTasks,
                            },
                            { merge: true }
                          );
                        } catch (err) {
                          console.error('Error updating approval status:', err);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        "text-[10px] font-bold p-1 rounded outline-none border border-transparent cursor-pointer hover:opacity-80 transition-opacity",
                        bgStatus,
                        statusColor,
                        isMe ? "border-white/20" : ""
                      )}
                    >
                      <option value="None" disabled hidden>State...</option>
                      {(isPIC || isCreator) && <option value="AcceptTask">Accepted</option>}
                      {(isPIC || isCreator) && <option value="ReqApproval">Requested Approval</option>}
                      {isCreator && <option value="Approved">{t("Approved")}</option>}
                      {isCreator && <option value="Rejected">{t("Rejected")}</option>}
                    </select>
                  </div>
                  {(st.delegationStatus || st.status) && (
                    <div className={cn("text-[9px] opacity-70 mt-0.5", isMe ? "text-white" : "text-slate-500 dark:text-[#a3a3a3]")}>
                      Flow: {st.delegationStatus || st.status} {st.approvedAt && selectValue === 'Approved' ? `(${new Date(st.approvedAt).toLocaleDateString()})` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
