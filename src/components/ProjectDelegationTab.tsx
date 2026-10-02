import { useAppStore } from '../store/useAppStore';
import React, { useState, useMemo, useRef } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Project, Task, AppUser, DelegationGroup } from '../types';
import { computeTaskCode, scheduleDependentTasks } from '../lib/ganttUtils';
import { cn, getTaskStatus, resolveActualStatus, parseDateTime, getSuggestedCompletionTime } from '../lib/utils';
import { doc } from 'firebase/firestore';
import {    db, APP_ID , writeBatch , setDoc , deleteDoc } from "../lib/firebase";
import { FileText, ExternalLink, Pin, Search, Trash2 } from 'lucide-react';
import { DebouncedSearchInput } from './DebouncedSearchInput';

interface ProjectDelegationTabProps {
  tasks: Task[];
  projects: Project[];
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
  appUsers: AppUser[];
  project: Project;
  onInsertTaskTag?: (tagName: string) => void;
  setConfirmModal?: (modal: {isOpen: boolean, title: string, message: string, onConfirm: () => void}) => void;
}

export const ProjectDelegationTab = React.memo(function ProjectDelegationTab({ project, tasks, projects, delegationGroups, currentUser, appUsers, onInsertTaskTag, setConfirmModal }: ProjectDelegationTabProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const handleDeleteGroup = async (group: DelegationGroup) => {
    if (setConfirmModal) {
      setConfirmModal({
        isOpen: true,
        title: 'Delete Delegation Group',
        message: 'Delete this delegation group?',
        onConfirm: async () => {
          deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));
          if (group.parentTaskId) {
            const parentTask = tasks.find(t => t.id === group.parentTaskId);
            if (parentTask) {
              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), { ...parentTask, delegation: false, updatedAt: new Date().toISOString() }, { merge: true });
            }
          }
        }
      });
    } else {
      if (window.confirm('Delete this delegation group?')) {
        deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));
        if (group.parentTaskId) {
          const parentTask = tasks.find(t => t.id === group.parentTaskId);
          if (parentTask) {
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), { ...parentTask, delegation: false, updatedAt: new Date().toISOString() }, { merge: true });
          }
        }
      }
    }
  };

  const handleDeleteSubTask = async (group: DelegationGroup, subTaskId: string) => {
    const doDelete = async () => {
      const updatedSubTasks = (group.subTasks || []).filter(st => st.id !== subTaskId);
      if (updatedSubTasks.length === 0) {
        deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));
        if (group.parentTaskId) {
          const parentTask = tasks.find(t => t.id === group.parentTaskId);
          if (parentTask) {
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), { ...parentTask, delegation: false, updatedAt: new Date().toISOString() }, { merge: true });
          }
        }
      } else {
        const fallbackYear = (group.projectYear !== undefined && group.projectYear !== null && !isNaN(Number(group.projectYear)))
          ? Number(group.projectYear)
          : (project?.year && !isNaN(Number(project.year)) ? Number(project.year) : new Date().getFullYear());
        const updatedGroup = JSON.parse(JSON.stringify({
          ...group,
          projectYear: fallbackYear,
          subTasks: updatedSubTasks,
          updatedAt: new Date().toISOString()
        }));
        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id), updatedGroup, { merge: true });
      }
    };

    if (setConfirmModal) {
      setConfirmModal({
        isOpen: true,
        title: 'Delete Delegation Task',
        message: 'Delete this delegation sub-task?',
        onConfirm: doDelete
      });
    } else {
      if (window.confirm('Delete this delegation sub-task?')) {
        doDelete();
      }
    }
  };
  
  const projectGroups = useMemo(() => {
    if (!project) return [];
    const seenParentTaskIds = new Set<string>();
    return (delegationGroups || []).filter(g => {
      if (!g || !g.parentTaskId) return false;
      
      // Deduplicate by parentTaskId
      if (seenParentTaskIds.has(g.parentTaskId)) return false;
      seenParentTaskIds.add(g.parentTaskId);

      const t = tasks.find(x => x && x.id === g.parentTaskId);
      const isMatchingProject = 
        (t && t.projectCode === project.code) ||
        (g.projectCode === project.code) ||
        (g.parentTaskId === project.code);

      const isMatchingYear = 
        !project.year || !g.projectYear || String(g.projectYear) === String(project.year) || (t && String(t.projectYear) === String(project.year));

      const isMatchingStore = 
        !project.store || !g.projectStore || String(g.projectStore).toLowerCase() === String(project.store).toLowerCase() || (t && String(t.projectStore).toLowerCase() === String(project.store).toLowerCase());

      return isMatchingProject && isMatchingYear && isMatchingStore;
    }).map(g => {
      const parentTask = tasks.find(t => t && t.id === g.parentTaskId);
      const isChildTask = parentTask ? Boolean(parentTask.parentTaskId) : false;
      const rootParentTask = isChildTask ? tasks.find(t => t.id === parentTask?.parentTaskId) : null;
      return {
        ...g,
        _taskCode: parentTask ? computeTaskCode(projects, tasks, parentTask) : (g.projectCode || ''),
        _taskName: parentTask?.name || g.name || 'Delegated Sub-tasks',
        _isChildTask: isChildTask,
        _parentTaskName: rootParentTask?.name || null
      };
    }).sort((a, b) => (a._taskCode || '').localeCompare(b._taskCode || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [delegationGroups, tasks, project, projects]);

  const picOptions = useMemo(() => {
    const list = new Set<string>();
    (appUsers || []).forEach(u => u && u.username && list.add(u.username));
    projectGroups.forEach(g => {
       (g.subTasks || []).forEach(st => {
         if (st && st.party) {
           const parts = String(st.party).split(',').map(s => s.trim()).filter(Boolean);
           parts.forEach(p => list.add(p));
         }
       });
    });
    return Array.from(list).sort((a,b) => a.localeCompare(b));
  }, [appUsers, projectGroups]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return projectGroups;
    const lowerQuery = searchQuery.toLowerCase();
    return projectGroups.filter(g => 
      (g._taskName && g._taskName.toLowerCase().includes(lowerQuery)) ||
      (g._taskCode && g._taskCode.toLowerCase().includes(lowerQuery))
    );
  }, [projectGroups, searchQuery]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#1e1e20]/50 relative overflow-y-auto p-4 md:p-6 pb-20 sm:pb-24 overscroll-contain">
       <div className="relative w-full mb-4 flex-shrink-0">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-blue-500">
            <Search className="w-4 h-4" />
          </div>
          <DebouncedSearchInput
            placeholder="Search task name or code..."
            value={searchQuery}
            onChange={(val) => setSearchQuery(val)}
            className="bg-blue-50 dark:bg-[#1e1e20] border border-blue-200 dark:border-blue-800/50 text-blue-900 dark:text-blue-100 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 pr-10 p-2 outline-none shadow-sm placeholder:text-blue-400"
          />
       </div>
       <datalist id="pic-list-modal-project">
         {picOptions.map((u, i) => <option key={i} value={u} />)}
       </datalist>

       {filteredGroups.length === 0 ? (
         <div className="text-center text-slate-500 py-10">No delegated tasks for this project yet.</div>
       ) : (
         <div className="flex flex-col gap-6">
           {filteredGroups.map(linkedGroup => {
              const firstSt = linkedGroup.subTasks[0];
              const flowTxtGroup = firstSt ? (firstSt.delegationStatus || firstSt.status || 'Assigned') : 'Assigned';
              
              const parentTask = tasks.find(t => t.id === linkedGroup.parentTaskId);
              const planStatus = parentTask ? getTaskStatus(parentTask.start, parentTask.finish) : 'Upcoming';
              const isRunning = planStatus === 'On process';
              
              let groupBgColor = 'bg-slate-50 dark:bg-slate-900/10 border-slate-200 dark:border-slate-800/50';
              let groupHeaderBorder = 'border-slate-200 dark:border-slate-800/50';
              let groupTitleColor = 'text-slate-900 dark:text-slate-100';
              let groupIconColor = 'text-slate-600 dark:text-slate-400';
              let groupSubTitleColor = 'text-slate-600 dark:text-slate-400';
              let groupTrackerBtn = 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200';

              if (flowTxtGroup === 'Completed') {
                 groupBgColor = 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30';
                 groupHeaderBorder = 'border-green-200 dark:border-green-900/50';
                 groupTitleColor = 'text-green-900 dark:text-green-100';
                 groupIconColor = 'text-green-600 dark:text-green-400';
                 groupSubTitleColor = 'text-green-700 dark:text-green-300';
                 groupTrackerBtn = 'bg-green-100 dark:bg-green-800/50 hover:bg-green-200 dark:hover:bg-green-700 text-green-700 dark:text-green-200';
              } else if (flowTxtGroup === 'On process' || flowTxtGroup === 'Accepted') {
                 groupBgColor = 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30';
                 groupHeaderBorder = 'border-blue-200 dark:border-blue-900/50';
                 groupTitleColor = 'text-blue-900 dark:text-blue-100';
                 groupIconColor = 'text-blue-600 dark:text-blue-400';
                 groupSubTitleColor = 'text-blue-700 dark:text-blue-300';
                 groupTrackerBtn = 'bg-blue-100 dark:bg-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-200';
              } else if (flowTxtGroup === 'Pending completed' || flowTxtGroup === 'Pending Completed' || flowTxtGroup === 'Delayed' || ['requested', 'hold', 'waiting for approval'].includes(flowTxtGroup.toLowerCase())) {
                 groupBgColor = 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
                 groupHeaderBorder = 'border-orange-200 dark:border-orange-900/50';
                 groupTitleColor = 'text-orange-900 dark:text-orange-100';
                 groupIconColor = 'text-orange-600 dark:text-orange-400';
                 groupSubTitleColor = 'text-orange-700 dark:text-orange-300';
                 groupTrackerBtn = 'bg-orange-100 dark:bg-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-700 text-orange-700 dark:text-orange-200';
              } else if (flowTxtGroup === 'Approved' || flowTxtGroup === 'Rejected' || flowTxtGroup === 'Request Delay' || flowTxtGroup === 'Needs Rework') {
                 groupBgColor = 'bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-900/30';
                 groupHeaderBorder = 'border-purple-200 dark:border-purple-900/50';
                 groupTitleColor = 'text-purple-900 dark:text-purple-100';
                 groupIconColor = 'text-purple-600 dark:text-purple-400';
                 groupSubTitleColor = 'text-purple-700 dark:text-purple-300';
                 groupTrackerBtn = 'bg-purple-100 dark:bg-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-700 text-purple-700 dark:text-purple-200';
              } else if (flowTxtGroup === 'Assigned') {
                 groupBgColor = 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
                 groupHeaderBorder = 'border-orange-200 dark:border-orange-900/50';
                 groupTitleColor = 'text-orange-900 dark:text-orange-100';
                 groupIconColor = 'text-orange-600 dark:text-orange-400';
                 groupSubTitleColor = 'text-orange-700 dark:text-orange-300';
                 groupTrackerBtn = 'bg-orange-100 dark:bg-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-700 text-orange-700 dark:text-orange-200';
              }
             
             return (
             <div key={linkedGroup.id} className={cn("p-4 border rounded-xl shadow-sm transition-all duration-500", groupBgColor, isRunning ? "ring-2 ring-blue-500 dark:ring-blue-400 shadow-md" : "")}>
                <div className={cn("flex items-center justify-between mb-3 border-b pb-2", groupHeaderBorder)}>
                  <div className="flex flex-col">
                    <h4 className={cn("text-sm font-bold flex items-center gap-2", groupTitleColor)}>
                      <FileText className={cn("w-4 h-4", groupIconColor)} />
                      <span>{linkedGroup._taskName || linkedGroup.name || 'Delegated Sub-tasks'}</span>
                      {linkedGroup._isChildTask && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-mono">
                          ↳ SUB {linkedGroup._parentTaskName ? `(Cha: ${linkedGroup._parentTaskName})` : ''}
                        </span>
                      )}
                    </h4>
                    <span className={cn("text-[10px] font-mono mt-1", groupSubTitleColor)}>Task Code: {linkedGroup._taskCode}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const proStatus = planStatus || 'On process';
                      let proStatusColorClass = 'bg-amber-500 text-white dark:bg-amber-500 dark:text-white border-amber-400 font-extrabold';
                      if (proStatus === 'Completed') {
                        proStatusColorClass = 'bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white border-emerald-500 font-extrabold';
                      } else if (proStatus === 'Upcoming') {
                        proStatusColorClass = 'bg-slate-500 text-white dark:bg-slate-600 dark:text-white border-slate-400 font-extrabold';
                      } else if (proStatus === 'Delay') {
                        proStatusColorClass = 'bg-rose-600 text-white dark:bg-rose-600 dark:text-white border-rose-500 font-extrabold';
                      }
                      const actualStatus = resolveActualStatus(planStatus, linkedGroup.subTasks);
                      const isDupStatus = actualStatus.label.toLowerCase() === proStatus.toLowerCase();
                      return (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-bold whitespace-nowrap shadow-2xs ${proStatusColorClass}`}>
                            Pro: {proStatus}
                          </span>
                          {!isDupStatus && (
                            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold border whitespace-nowrap shadow-2xs ${actualStatus.color}`}>
                              Act: {actualStatus.label}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    <a 
                      href={`https://tracker.taka-pm.org/?search=${encodeURIComponent((linkedGroup.projectCode ? linkedGroup.projectCode + ' ' : '') + linkedGroup.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-bold transition-colors shrink-0", groupTrackerBtn)}
                      title="Open Tracker & Search"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Tracker
                    </a>
                    {(currentUser.role === 'admin' || linkedGroup.createdBy === currentUser.id) && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(linkedGroup); }}
                        className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-bold transition-colors shrink-0", "bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40")}
                        title="Delete Delegation Group"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2 mt-3">
                  {linkedGroup.subTasks.map(st => {
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

                     let flowTxt = st.delegationStatus || st.status || 'Assigned';
                     let flowColor = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
                     let cardBgColor = 'bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446]';
                     
                     if (flowTxt === 'Completed') {
                        flowColor = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
                        cardBgColor = 'bg-green-50/50 dark:bg-emerald-900/10 border-green-200 dark:border-emerald-900/30';
                     } else if (flowTxt === 'On process' || flowTxt === 'Accepted') {
                        flowColor = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
                        cardBgColor = 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30';
                     } else if (flowTxt === 'Pending completed' || flowTxt === 'Pending Completed') {
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
                                      useAppStore.getState().setToast({ title: "Notice", message: String("Invalid PIC. Please select from the dropdown options.") });
                                      e.target.value = st.party || "";
                                      return;
                                  }
                                  const updatedSubTasks = linkedGroup.subTasks.map(sub => sub.id === st.id ? { ...sub, party: val } : sub);
                                  try {
                                      setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), {
                                          ...linkedGroup,
                                          subTasks: updatedSubTasks,
                                      }, { merge: true });
                                  } catch(err) {
                                      console.error(err);
                                  }
                                }}
                                className="bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-[#444446] focus:border-blue-500 outline-none w-[120px] leading-tight truncate px-0 font-medium text-slate-700 dark:text-[#e3e3e3] disabled:text-slate-500 disabled:cursor-not-allowed"
                                placeholder="Assign CP..."
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              {onInsertTaskTag && linkedGroup._taskName && (
                                <button type="button"
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
                                  }
                                  else if (val === 'Rejected') { payload.status = 'Rejected'; payload.delegationStatus = 'Rejected'; payload.approvedAt = null; }
                                  else if (val === 'Hold') { payload.approvalStatus = 'Requested'; payload.approvedAt = null; }
                                  else if (val === 'AcceptTask') {
                                    payload.status = 'On process';
                                    payload.delegationStatus = 'On process';
                                    payload.approvedAt = null;
                                  }
                                  else if (val === 'ReqApproval') {
                                    payload.status = 'Pending completed';
                                    payload.delegationStatus = 'Pending completed';
                                    payload.approvalStatus = 'Requested';
                                    payload.approvedAt = null;
                                  }
                                  else if (val === 'ReqReview') {
                                    payload.status = 'Needs Rework';
                                    payload.delegationStatus = 'Needs Rework';
                                    payload.approvedAt = null;
                                  } else {
                                    payload.approvedAt = null;
                                  }
                                  
                                  const updatedSubTasks = linkedGroup.subTasks.map(sub => sub.id === st.id ? { ...sub, ...payload } : sub);
                                  
                                  // Update logic for parent task if realtime is enabled
                                  const parentTask = tasks.find(t => t.id === linkedGroup.parentTaskId);
                                  const parentProject = project; // We know it's this project
                                  const isRealtime = parentTask?.realtimeUpdate || parentProject?.realtimeUpdate;
                                  
                                  let newT: Task | null = null;
                                  let cascadeUpdates: Task[] = [];
                                  
                                  if (parentTask && isRealtime) {
                                    const computedPlStatus = getTaskStatus(parentTask.start, parentTask.finish);
                                    const oldActStatusLabel = resolveActualStatus(computedPlStatus, linkedGroup.subTasks).label;
                                    const newActStatusLabel = resolveActualStatus(computedPlStatus, updatedSubTasks).label;
                                    
                                    if (
                                      newActStatusLabel === 'Completed' &&
                                      oldActStatusLabel !== 'Completed'
                                    ) {
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
                                    } else if (
                                      newActStatusLabel === 'On Process' &&
                                      oldActStatusLabel !== 'On Process' &&
                                      oldActStatusLabel !== 'Completed'
                                    ) {
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
                                    
                                    try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
                                  } catch(err) {
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
                                   } catch(err) {
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
                     )
                  })}
                </div>
             </div>
           )})}
         </div>
       )}
    </div>
  );
});
