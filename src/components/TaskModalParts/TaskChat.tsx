import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from "../../lib/LanguageContext";
import { X, Pin, FileText, Paperclip, Edit2, Image as ImageIcon, Loader2, Trash2, Link as LinkIcon, ExternalLink, Target, Info, Send, MoreVertical, MessageSquare } from 'lucide-react';
import { Project, Task, AppUser, DelegationGroup } from '../../types';
import { calculateDays, formatToDatetimeLocal, parseDateTime, cn, getDefaultDatetimeLocal, ensureUrlProtocol, getSuggestedCompletionTime, getTaskStatus, resolveActualStatus, formatDisplayDateTime } from '../../lib/utils';
import { doc } from 'firebase/firestore';
import { db, APP_ID, storage, writeBatch, setDoc, deleteDoc } from "../../lib/firebase";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { undoManager } from '../../lib/undoManager';
import { generateId } from '../../lib/utils';
import { ConfirmModal } from '../ConfirmModal';
import { LazyImage } from '../LazyImage';
import { useAppStore } from "../../store/useAppStore";
import { deleteStorageFiles, extractStorageUrls } from "../../lib/storageUtils";
import { addPendingUpdate } from '../../lib/syncQueue';
import { QRCodeButton } from '../QRCodeButton';

import { googleSignIn, getAccessToken } from '../../lib/firebase';
import { scheduleDependentTasks } from '../../lib/ganttUtils';
import { safeGetItemLocal, safeSetItemLocal } from '../../lib/storage';



export const TaskChat = React.memo(function TaskChat({ task, projects, tasks, currentUser, appUsers, subAppUsers, delegationGroups, onNavigateToDelegation, setConfirmModal }: { task: Task, projects: Project[], tasks: Task[], currentUser: AppUser, appUsers: AppUser[], subAppUsers?: any[], delegationGroups: DelegationGroup[], onNavigateToDelegation?: (groupId: string, taskId?: string) => void, setConfirmModal: any }) {
  const { t } = useLanguage();
  const focusCommentId = useAppStore(state => state.focusCommentId);
  const setFocusCommentId = useAppStore(state => state.setFocusCommentId);
  const setZoomableImageSrc = useAppStore(state => state.setZoomableImageSrc);

  const currentProject = useMemo(() => {
    return projects.find(p => 
      p.code === task.projectCode &&
      (task.projectStore ? p.store === task.projectStore : true) &&
      (task.projectYear ? String(p.year) === String(task.projectYear) : true)
    ) || projects.find(p => p.code === task.projectCode);
  }, [projects, task.projectCode, task.projectStore, task.projectYear]);

  useEffect(() => {
    if (focusCommentId) {
      setTimeout(() => {
        const el = document.getElementById('comment-' + focusCommentId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-slate-50', 'dark:ring-offset-[#131314]');
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-slate-50', 'dark:ring-offset-[#131314]');
          }, 3000);
          setFocusCommentId(null);
        }
      }, 300);
    }
  }, [focusCommentId, setFocusCommentId]);

  const chatInputRef = useRef<any>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const [localComments, setLocalComments] = useState(task.comments || []);

  const projectTasks = React.useMemo(() => {
    return tasks.filter(t => 
      t.projectCode === task.projectCode && 
      (t.projectYear == task.projectYear || (!t.projectYear && !task.projectYear)) &&
      (t.projectStore == task.projectStore || (!t.projectStore && !task.projectStore))
    );
  }, [tasks, task.projectCode, task.projectStore, task.projectYear]);

  useEffect(() => {
    setLocalComments(task.comments || []);
  }, [task.comments]);

  const comments = localComments;
  
  const picOptions = useMemo(() => {
    const list = new Set<string>();
    appUsers.forEach(u => u.username && list.add(u.username));
    subAppUsers?.forEach(u => {
      const vals = [u.username, u.name, u.fullName, u.displayName, u.email, u.title, u.id].filter(v => v && typeof v === 'string' && v.trim() !== '');
      if (vals.length > 0) {
        if (vals[0]) {
          list.add(vals[0]);
        }
      }
    });

    if (task && task.party) {
        const parts = String(task.party).split(',').map(s => s.trim()).filter(Boolean);
        parts.forEach(p => list.add(p));
    }

    // Add unique parties from subtasks if any
    const linkedGroup = delegationGroups.find(g => g.parentTaskId === task.id);
    if (linkedGroup && linkedGroup.subTasks) {
       linkedGroup.subTasks.forEach(st => {
         if (st.party) {
             const parts = String(st.party).split(',').map(s => s.trim()).filter(Boolean);
             parts.forEach(p => list.add(p));
         }
       })
    }

    return Array.from(list).sort();
  }, [appUsers, subAppUsers, task?.party, delegationGroups, task?.id]);

  const linkedGroup = delegationGroups.find(g => g.parentTaskId === task.id);

  const handleDeleteComment = async (commentId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Comment',
      message: 'Are you sure you want to delete this comment?',
      onConfirm: async () => {
        const commentToDelete = comments.find((c: any) => c.id === commentId);
        if (commentToDelete) {
          const urls = commentToDelete.text.match(/(https?:\/\/[^\s]+)/g) || [];
          urls.forEach(async (url: string) => {
            if (url.includes('firebasestorage.googleapis.com')) {
              try {
                const fileRef = storageRef(storage, url);
                await deleteObject(fileRef);
              } catch (e) { console.error("Failed to delete attached file from storage:", e); }
            }
            const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
            if (driveMatch) {
              try {
                let accessToken = await getAccessToken();
                if (!accessToken) {
                  const result = await googleSignIn();
                  if (result) accessToken = result.accessToken;
                }
                if (accessToken) {
                  await fetch(`https://www.googleapis.com/drive/v3/files/${driveMatch[1]}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                }
              } catch (e) { console.error("Failed to delete from Drive:", e); }
            }
          });
        }
        setLocalComments(prev => prev.filter((c: any) => c.id !== commentId));
        
        try {
          const nowIso = new Date().toISOString();
          const batch = writeBatch(db);
          const updatedTask = {
            ...task,
            comments: comments.filter((c: any) => c.id !== commentId),
            updatedAt: nowIso
          };
          batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', task.id), { comments: updatedTask.comments, updatedAt: nowIso });
          
          if (commentToDelete && linkedGroup) {
             let groupUpdated = false;
             const textToMatch = commentToDelete.text.trim();
             const updatedSubTasks = linkedGroup.subTasks.map((st: any) => {
               let newComments = st.comments || '';
               let newReport = st.report || '';
               if (newComments.includes(textToMatch)) {
                  newComments = newComments.split('\n').filter((line: string) => line.trim() !== textToMatch).join('\n');
                  groupUpdated = true;
               }
               if (newReport.includes(textToMatch)) {
                  newReport = newReport.split('\n').filter((line: string) => line.trim() !== textToMatch).join('\n');
                  groupUpdated = true;
               }
               return { ...st, comments: newComments, report: newReport };
             });
             if (groupUpdated) {
               const fallbackGrpYear = (linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear)))
                 ? Number(linkedGroup.projectYear)
                 : (Number(currentProject?.year) || new Date().getFullYear());
               batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), { ...linkedGroup, projectYear: fallbackGrpYear, subTasks: JSON.parse(JSON.stringify(updatedSubTasks)) }, { merge: true });
             }
          }
          try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }

          const allTasks = useAppStore.getState().tasks;
          const updatedTasks = allTasks.map(t => t.id === task.id ? updatedTask : t);
          useAppStore.getState().setTasks(updatedTasks);
        } catch (err) {
          console.error(err);
          setLocalComments(task?.comments || []);
        }
      }
    });
  };

  const handleEditComment = async (commentId: string) => {
    if (!editingText.trim()) return;
    
    const oldComment = comments.find((c: any) => c.id === commentId);
    setLocalComments(prev => prev.map((c: any) => c.id === commentId ? { ...c, text: editingText } : c));
    
    try {
      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);
      const updatedTask = {
        ...task,
        comments: comments.map((c: any) => c.id === commentId ? { ...c, text: editingText } : c),
        updatedAt: nowIso
      };
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', task.id), { comments: updatedTask.comments, updatedAt: nowIso });
      
      if (oldComment && linkedGroup) {
        let groupUpdated = false;
        const oldText = oldComment.text.trim();
        const newText = editingText.trim();
        const updatedSubTasks = linkedGroup.subTasks.map((st: any) => {
          let newComments = st.comments || '';
          let newReport = st.report || '';
          if (newComments.includes(oldText)) {
             newComments = newComments.split('\n').map((line: string) => line.trim() === oldText ? newText : line).join('\n');
             groupUpdated = true;
          }
          if (newReport.includes(oldText)) {
             newReport = newReport.split('\n').map((line: string) => line.trim() === oldText ? newText : line).join('\n');
             groupUpdated = true;
          }
          return { ...st, comments: newComments, report: newReport };
        });
        if (groupUpdated) {
          const fallbackGrpYear = (linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear)))
            ? Number(linkedGroup.projectYear)
            : (Number(currentProject?.year) || new Date().getFullYear());
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), { ...linkedGroup, projectYear: fallbackGrpYear, subTasks: JSON.parse(JSON.stringify(updatedSubTasks)) }, { merge: true });
        }
      }
      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }

      const allTasks = useAppStore.getState().tasks;
      const updatedTasks = allTasks.map(t => t.id === task.id ? updatedTask : t);
      useAppStore.getState().setTasks(updatedTasks);

      setEditingCommentId(null);
      setEditingText('');
    } catch (err) {
      console.error(err);
      setLocalComments(task.comments || []);
    }
  };

  const handleSendFromInput = React.useCallback(async (text: string, activeMentions: string[]) => {
    const nowIso = new Date().toISOString();
    const newComment = {
      id: `c_${Date.now()}_${generateId().substring(0,4)}`,
      text: text,
      createdAt: nowIso,
      userId: currentUser.id,
      mentions: activeMentions
    };

    setLocalComments(prev => [...prev, newComment]);

    const updatedTask = {
      ...task,
      comments: [...comments, newComment],
      updatedAt: nowIso
    };

    // Optimistically update store
    const allTasks = useAppStore.getState().tasks;
    const updatedTasks = allTasks.map(t => t.id === task.id ? updatedTask : t);
    useAppStore.getState().setTasks(updatedTasks);

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', task.id), { comments: updatedTask.comments, updatedAt: nowIso });
      
      const taggedTasks = projectTasks.filter(t => t.name && text.includes(`#${t.name}`) && t.id !== task.id);
      taggedTasks.forEach(t => {
        batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), {
          comments: [...(t.comments || []), newComment],
          updatedAt: nowIso
        }, { merge: true });
      });

      if (linkedGroup) {
         const delegator = appUsers.find(u => u.id === linkedGroup.createdBy);
         const delegatorTag = delegator ? `@${delegator.username}` : null;
         const hasDelegatorTag = delegatorTag && text.includes(delegatorTag);

         let groupUpdated = false;
         const updatedSubTasks = linkedGroup.subTasks.map(st => {
           const taskTag = task.name ? `#${task.name}` : '#';
           const partyTag = st.party ? `#${st.party}` : '#';
           const partyMention = st.party ? `@${st.party}` : null;
           
           const hasTaskTag = taskTag !== '#' && text.includes(taskTag);
           const hasPartyTag = partyTag !== '#' && text.includes(partyTag);
           const hasMention = partyMention && text.includes(partyMention);
           // Also check if text has the older format (with underscores) just in case
           const taskTagOld = task.name ? `#${task.name.replace(/\s+/g, '_')}` : '#';
           const hasTaskTagOld = taskTagOld !== '#' && text.includes(taskTagOld);
           
           const hasAnyTagAtAll = text.includes('#') || text.includes('@');

           if (hasTaskTag || hasTaskTagOld || hasPartyTag || hasMention || hasDelegatorTag || !hasAnyTagAtAll) {
             groupUpdated = true;
             return {
               ...st,
               comments: st.comments ? `${st.comments}\n${text}` : text,
               ...(hasDelegatorTag ? { report: st.report ? `${st.report}\n${text}` : text } : {})
             };
           }
           return st;
         });
         
         if (groupUpdated) {
           const fallbackGrpYear = (linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear)))
             ? Number(linkedGroup.projectYear)
             : (Number(currentProject?.year) || new Date().getFullYear());
           batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), {
             ...linkedGroup,
             projectYear: fallbackGrpYear,
             subTasks: JSON.parse(JSON.stringify(updatedSubTasks))
           }, { merge: true });
         }
      }

      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }

      if (taggedTasks.length > 0) {
        const refreshedTasks = useAppStore.getState().tasks.map(t => {
          if (taggedTasks.some(tt => tt.id === t.id)) {
            return { ...t, comments: [...(t.comments || []), newComment], updatedAt: nowIso };
          }
          return t;
        });
        useAppStore.getState().setTasks(refreshedTasks);
      }
    } catch (e) {
      console.error("Failed to send comment", e);
    }
  }, [task, comments, currentUser.id, linkedGroup, projectTasks]);

  const renderLinkedGroupApprovals = (text: string, isMe?: boolean) => {
    if (!text) return null;
    const knownTags: string[] = [];
    tasks.forEach(t => {
      if (t.name) knownTags.push(t.name);
    });
    const taggedTasks = tasks.filter(t => 
      t.name && 
      t.projectCode === task.projectCode && 
      t.projectStore === task.projectStore && 
      t.projectYear === task.projectYear && 
      text.includes(`#${t.name}-approval`)
    );
    // Deduplicate by name just in case there are duplicates in the same project
    const uniqueTaggedTasks = [];
    const seenNames = new Set();
    for (const t of taggedTasks) {
      if (!seenNames.has(t.name)) {
        seenNames.add(t.name);
        uniqueTaggedTasks.push(t);
      }
    }
    const relevantGroups = uniqueTaggedTasks.map(t => delegationGroups.find(g => g.parentTaskId === t.id)).filter(Boolean) as DelegationGroup[];
    if (relevantGroups.length === 0) return null;
    
    return (
        <div className="mt-3 flex flex-col gap-3">
          {relevantGroups.map(g => (
             <div key={g.id} className={cn("p-2 rounded-lg border text-xs shadow-sm", isMe ? "bg-blue-700 border-blue-500" : "bg-slate-50 dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446]")}>
                <div className="font-bold mb-2 pb-1 border-b flex items-center justify-between" style={{ borderColor: isMe ? 'rgba(255,255,255,0.2)' : 'var(--tw-border-opacity)' }}>
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
                      else if (['requested', 'hold', 'waiting for approval'].includes(stStatus) || ['requested', 'hold', 'waiting for approval'].includes(stApproval)) selectValue = 'Hold';

                      let statusColor = isMe ? "text-white" : "text-slate-500 dark:text-slate-400";
                      let bgStatus = isMe ? "bg-white/20" : "bg-slate-100 dark:bg-[#333336]";
                      if (!isMe) {
                          if (selectValue === 'Approved') { statusColor = "text-emerald-700 dark:text-emerald-400"; bgStatus = "bg-emerald-100 dark:bg-emerald-900/30"; }
                          else if (selectValue === 'Rejected') { statusColor = "text-red-700 dark:text-red-400"; bgStatus = "bg-red-100 dark:bg-red-900/30"; }
                          else if (selectValue === 'ReqApproval') { statusColor = "text-orange-700 dark:text-orange-400"; bgStatus = "bg-orange-100 dark:bg-orange-900/30"; }
                          else if (selectValue === 'Hold') { statusColor = "text-amber-700 dark:text-amber-400"; bgStatus = "bg-amber-100 dark:bg-amber-900/30"; }
                          else if (selectValue === 'AcceptTask') { statusColor = "text-blue-700 dark:text-blue-400"; bgStatus = "bg-blue-100 dark:bg-blue-900/30"; }
                      }
                      
                      const isCreator = (g.createdBy === currentUser.id) || (currentUser.role === 'admin');
                      const pPartyList = String(st.party || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
                      const userParties = currentUser.partyPermissions ? Object.keys(currentUser.partyPermissions).filter(k => currentUser.partyPermissions![k]).map(k => k.toLowerCase().trim()) : [];
                      const isPIC = userParties.includes('all') || pPartyList.some(p => userParties.includes(p)) || pPartyList.includes(String(currentUser.username || '').toLowerCase().trim()) || (st.involvedUsers && st.involvedUsers.includes(currentUser.id));
                      
                      if (!isCreator && !isPIC) return null; // Only show if they can interact

                      return (
                          <div key={st.id} className={cn("flex flex-col gap-1.5 p-2 rounded", isMe ? "bg-blue-600" : "bg-white dark:bg-[#28282a] border border-slate-100 dark:border-[#333336]")}>
                             <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-xs line-clamp-1 flex-1">{st.party || 'No PIC'}</span>
                                <select
                                  value={selectValue}
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
                                        payload.status = 'Pending Completed';
                                        payload.delegationStatus = 'Pending Completed';
                                        payload.approvedAt = null;
                                      }
                                      
                                      const updatedSubTasks = g.subTasks.map((sub: any) => sub.id === st.id ? { ...sub, ...payload } : sub);
                                      const fallbackGrpYear = (g.projectYear !== undefined && g.projectYear !== null && !isNaN(Number(g.projectYear)))
                                        ? Number(g.projectYear)
                                        : (Number(currentProject?.year) || new Date().getFullYear());
                                      try {
                                        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', g.id), {
                                            ...g,
                                            projectYear: fallbackGrpYear,
                                            subTasks: updatedSubTasks,
                                        }, { merge: true });
                                      } catch(err) {
                                        console.error(err);
                                      }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className={cn("text-[10px] font-bold p-1 rounded outline-none border border-transparent cursor-pointer hover:opacity-80 transition-opacity", bgStatus, statusColor, isMe ? "border-white/20" : "")}
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
  const renderTextWithHighlights = (text: string, isMe?: boolean) => {
    const knownTags = [];
    if (task.name) knownTags.push(`#${task.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    if (linkedGroup) {
      linkedGroup.subTasks.forEach(st => {
        const pTag = st.party;
        if (pTag) {
          knownTags.push(`#${pTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
        }
      });
    }
    
    const knownTagsPattern = knownTags.length > 0 ? `${knownTags.map(t => `${t}(?:-approval)?`).join('|')}|` : '';
    const urlPattern = `https?:\\/\\/[^\\s]+`;
    const regex = new RegExp(`(${urlPattern}|${knownTagsPattern}#[\\w\\-]+\\b|@[\\w\\-]+\\b)`, 'g');
    
    return text.split(regex).map((chunk, i) => {
      if (!chunk) return null;
      if (chunk.match(/^https?:\/\//)) {
         const isImage = chunk.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)(\?.*)?$/i) || chunk.match(/^https?:\/\/.*(images|img|photo|picture).*/i);
         const googleDriveMatch = chunk.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
         
         const link = <a key={`link-${i}`} href={chunk} target="_blank" rel="noopener noreferrer" className={cn("underline font-medium break-all", isMe ? "text-blue-200 hover:text-white" : "text-blue-600 dark:text-blue-400 hover:text-blue-800")} onClick={(e) => e.stopPropagation()}>{chunk}</a>;
         
         if (isImage || googleDriveMatch) {
            const imgSrc = googleDriveMatch ? `https://drive.google.com/thumbnail?id=${googleDriveMatch[1]}&sz=w800` : chunk;
            return (
               <span key={i} className="inline-flex flex-col gap-2 mt-1 mb-1 w-full">
                 {link}
                 <button
                   type="button"
                   onClick={(e) => {
                     e.stopPropagation();
                     setZoomableImageSrc(chunk);
                   }}
                   className="block max-w-[200px] text-left hover:opacity-90 transition active:scale-95 cursor-pointer"
                 >
                   <LazyImage src={imgSrc} alt="Attachment" />
                 </button>
               </span>
            );
         }
         return link;
      }
      if (chunk.startsWith('@')) return <span key={i} className={cn("font-bold", isMe ? "text-blue-200" : "text-blue-600 dark:text-blue-400")}>{chunk}</span>;
      if (chunk.startsWith('#')) return <span key={i} className={cn("font-bold", isMe ? "text-emerald-200" : "text-emerald-600 dark:text-emerald-400")}>{chunk.replace(/-approval$/, '')}</span>;
      return chunk;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {linkedGroup && (() => {
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
              } else if (flowTxtGroup === 'Pending completed' || flowTxtGroup === 'Pending Completed' || flowTxtGroup === 'Delayed' || ['requested', 'hold', 'waiting for approval'].includes(flowTxtGroup.toLowerCase())) {
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
                      Act: {actualStatus.label}
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
                {picOptions.map((u, i) => <option key={i} value={u} />)}
              </datalist>
              {linkedGroup.subTasks.map(st => {
                 const isCreator = (linkedGroup.createdBy === currentUser.id) || (currentUser.role === 'admin');
                 const pPartyList = String(st.party || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
                 const userParties = currentUser.partyPermissions ? Object.keys(currentUser.partyPermissions).filter(k => currentUser.partyPermissions![k]).map(k => k.toLowerCase().trim()) : [];
                 const isPIC = userParties.includes('all') || pPartyList.some(p => userParties.includes(p)) || pPartyList.includes(String(currentUser.username || '').toLowerCase().trim()) || (st.involvedUsers && st.involvedUsers.includes(currentUser.id));
                 const canWrite = currentUser.role === 'admin' || true; // Or simply assume they can if isCreator or isPIC
                 
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
                              useAppStore.getState().setToast({ title: "Notice", message: String("Invalid PIC. Please select from the dropdown options.") });
                              e.target.value = st.party || "";
                              return;
                          }
                          const updatedSubTasks = linkedGroup.subTasks.map(sub => sub.id === st.id ? { ...sub, party: val } : sub);
                          const fallbackGrpYear = (linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear)))
                            ? Number(linkedGroup.projectYear)
                            : (Number(currentProject?.year) || new Date().getFullYear());
                          try {
                              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), {
                                  ...linkedGroup,
                                  projectYear: fallbackGrpYear,
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
                      <button type="button"
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

                        const parentTask = tasks.find(t => t.id === linkedGroup.parentTaskId);
                        const parentProject = projects.find(p => String(p.no) === parentTask?.projectCode || p.id === parentTask?.projectCode);
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
                          } else if (
                            newActStatusLabel !== 'Completed' &&
                            oldActStatusLabel === 'Completed' &&
                            parentTask.baselineFinish
                          ) {
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
                           const fallbackGrpYear = (linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear)))
                             ? Number(linkedGroup.projectYear)
                             : (Number(currentProject?.year) || new Date().getFullYear());
                           const batch = writeBatch(db);
                           batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), {
                               ...linkedGroup,
                               projectYear: fallbackGrpYear,
                               subTasks: updatedSubTasks,
                           }, { merge: true });
                           if (newT) {
                             batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', newT.id), newT);
                           }
                           for (const u of cascadeUpdates) {
                             batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', u.id), u);
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
                        "appearance-none text-[10px] sm:text-[9px] min-h-[22px] font-bold px-2 py-1 flex-1 min-w-[70px] max-w-[120px] rounded border outline-none cursor-pointer text-left shrink-0",
                        (['requested', 'hold', 'pending completed', 'waiting for approval'].includes((st.delegationStatus || '').toLowerCase()) || ['requested', 'hold', 'pending completed', 'waiting for approval'].includes((st.status || '').toLowerCase()) || ['requested', 'hold', 'pending completed', 'waiting for approval'].includes((st.approvalStatus || '').toLowerCase())) && st.delegationStatus !== 'Completed' && st.status !== 'Completed' ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-purple-50 text-purple-700 border-purple-200",
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
                         const fallbackGrpYear = (linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear)))
                           ? Number(linkedGroup.projectYear)
                           : (Number(currentProject?.year) || new Date().getFullYear());
                         try {
                            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), {
                                ...linkedGroup,
                                projectYear: fallbackGrpYear,
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
                      Approved: {formatDisplayDateTime(st.approvedAt)}
                    </div>
                  )}
                  </div>
                </div>
              )})}
            </div>
          </div>
        )})()}

        {linkedGroup && linkedGroup.subTasks.map(st => {
           const hasReport = !!st.report || !!st.childReport || (st.attachments && st.attachments.length > 0) || !!st.fileUrl || !!st.childFileUrl;
           if (!hasReport) return null;
           
           return (
             <div key={`report-${st.id}`} className="flex flex-col items-start mt-2">
               <div className="flex items-center gap-2 mb-1">
                 <span className="text-xs font-bold text-slate-500">{st.party} (Report)</span>
               </div>
               <div className="flex flex-col gap-1 bg-blue-50/40 dark:bg-[#28282a] rounded-xl rounded-tl-none border border-blue-100 p-3 max-w-[85%]">
                  <span className="text-[9px] font-bold text-blue-600 dark:text-[#8ab4f8] uppercase tracking-wider">Report for {st.name || st.party}</span>
                  <div className="text-sm text-slate-700 dark:text-[#c3c3c3] font-medium whitespace-pre-wrap">{st.report || st.childReport || <span className="italic text-slate-400 dark:text-[#838383] font-normal">No report yet</span>}</div>
                  {st.attachments && st.attachments.length > 0 ? (
                     <div className="mt-2 flex flex-col gap-1.5 text-[10px]">
                       {st.attachments.map((att, iIdx) => (
                         <a key={iIdx} onClick={(e) => e.stopPropagation()} href={ensureUrlProtocol(att.url)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-700 dark:text-[#8ab4f8] hover:text-blue-800 dark:text-[#8ab4f8] font-bold bg-white dark:bg-[#1e1e20] border border-blue-200 shadow-sm rounded px-3 py-1.5 w-fit">
                           <Paperclip className="w-3.5 h-3.5" />
                           <span className="truncate max-w-[150px]">{att.name || att.url || 'Attached Link'}</span>
                         </a>
                       ))}
                     </div>
                  ) : (st.fileUrl || st.childFileUrl) && (
                     <div className="mt-2 text-[10px]">
                       <a onClick={(e) => e.stopPropagation()} href={ensureUrlProtocol(st.fileUrl || st.childFileUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-700 dark:text-[#8ab4f8] hover:text-blue-800 dark:text-[#8ab4f8] font-bold bg-white dark:bg-[#1e1e20] border border-blue-200 shadow-sm rounded px-3 py-1.5 w-fit">
                         <Paperclip className="w-3.5 h-3.5" />
                         <span className="truncate max-w-[150px]">{st.fileName || st.childFileName || 'Download file'}</span>
                       </a>
                     </div>
                  )}
               </div>
             </div>
           );
        })}

        {comments.map((c: any) => {
          const author = appUsers?.find(u => 
            u.id === c.userId || 
            (u.username && String(u.username).toLowerCase() === String(c.userId).toLowerCase()) ||
            (u.email && String(u.email).toLowerCase() === String(c.userId).toLowerCase())
          ) || subAppUsers?.find((u: any) => 
            u.id === c.userId || 
            (u.username && String(u.username).toLowerCase() === String(c.userId).toLowerCase()) ||
            (u.email && String(u.email).toLowerCase() === String(c.userId).toLowerCase())
          );

          const authorDisplayName = c.userName 
            || author?.username 
            || (currentUser && (
                c.userId === currentUser.id ||
                (currentUser.username && String(c.userId).toLowerCase() === currentUser.username.toLowerCase())
               ) ? currentUser.username : null)
            || (c.userId && c.userId !== 'Unknown' && c.userId !== 'null' && c.userId !== 'undefined' ? c.userId : null)
            || 'System';

          const isMe = Boolean(
            c.userId === currentUser.id ||
            (currentUser.username && String(c.userId).toLowerCase() === currentUser.username.toLowerCase()) ||
            (currentUser.email && String(c.userId).toLowerCase() === currentUser.email.toLowerCase()) ||
            currentUser.role === 'admin'
          );
          const isEditing = editingCommentId === c.id;

          return (
            <div id={`comment-${c.id}`} key={c.id} className={cn("flex flex-col group transition-shadow duration-1000 rounded-xl", isMe ? "items-end" : "items-start")}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-slate-500">{authorDisplayName}</span>
                <span className="text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</span>
                {isMe && !isEditing && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setEditingCommentId(c.id); setEditingText(c.text); }} className="p-2 lg:p-1 text-slate-400 hover:text-blue-500 dark:text-[#838383] dark:hover:text-[#8ab4f8] transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteComment(c.id); }} className="p-2 lg:p-1 text-slate-400 hover:text-red-500 dark:text-[#838383] dark:hover:text-[#f28b82] transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              <div className={cn("p-3 rounded-xl max-w-[85%] text-sm whitespace-pre-wrap", isMe ? "bg-blue-600 text-white rounded-tr-none" : "bg-slate-100 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3] rounded-tl-none")}>
                {isEditing ? (
                   <div className="flex flex-col gap-2">
                     <textarea
                       autoFocus
                       value={editingText}
                       onChange={(e) => setEditingText(e.target.value)}
                       className="w-full min-w-[200px] p-2 bg-white/20 text-white placeholder-white/60 border border-white/30 rounded outline-none text-sm resize-none"
                     />
                     <div className="flex items-center gap-2 self-end">
                       <button type="button" onClick={() => { setEditingCommentId(null); setEditingText(''); }} className="text-xs font-bold text-white/80 hover:text-white px-2 py-1">{t("Cancel")}</button>
                       <button type="button" onClick={() => handleEditComment(c.id)} className="text-xs font-bold bg-white/90 dark:bg-[#1e1e20] text-blue-600 dark:text-[#8ab4f8] px-3 py-1 rounded shadow-sm hover:bg-white dark:hover:bg-[#28282a]">{t("Save")}</button>
                     </div>
                   </div>
                ) : (
                  <>
                    {renderTextWithHighlights(c.text, isMe)}
                    {renderLinkedGroupApprovals(c.text, isMe)}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {comments.length === 0 && !linkedGroup && (
          <div className="flex items-center justify-center h-full text-slate-400 dark:text-[#838383] text-sm">
            No comments yet. Start the conversation!
          </div>
        )}
      </div>
      
      <ChatInput ref={chatInputRef} onSend={handleSendFromInput} appUsers={appUsers} projectTasks={projectTasks} linkedGroup={linkedGroup} />
    </div>
  );
});


const recordMention = (userId: string) => {
  try {
    const habitsStr = safeGetItemLocal('mentionHabits');
    const habits = habitsStr ? JSON.parse(habitsStr) : {};
    habits[userId] = (habits[userId] || 0) + 1;
    safeSetItemLocal('mentionHabits', JSON.stringify(habits));
  } catch(e) {}
};

const getMentionFrequencies = (): Record<string, number> => {
  try {
    const habitsStr = safeGetItemLocal('mentionHabits');
    return habitsStr ? JSON.parse(habitsStr) : {};
  } catch(e) {
    return {};
  }
};

const ChatInput = React.memo(React.forwardRef(function ChatInput({ onSend, appUsers, projectTasks, linkedGroup }: { onSend: (text: string, mentions: string[]) => void, appUsers: AppUser[], projectTasks?: Task[], linkedGroup?: any }, ref: React.Ref<any>) {
  const { t } = useLanguage();
  const [commentText, setCommentText] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [taskQuery, setTaskQuery] = useState('');
  const [showTaskMenu, setShowTaskMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      let accessToken = await getAccessToken();

      const imageRef = storageRef(storage, `taka_attachments/${APP_ID}/${Date.now()}_${file.name}`);
      
      let downloadURL = '';
      try {
        const uploadTask = await uploadBytesResumable(imageRef, file);
        downloadURL = await getDownloadURL(uploadTask.ref);
      } catch (err) {
        console.error("Firebase Storage upload failed:", err);
      }

      let driveUrl = '';
      if (accessToken) {
        const res1 = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: file.name, mimeType: file.type })
        });
        const data1 = await res1.json();
        const fileId = data1.id;
        
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': file.type
          },
          body: file
        });

        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });
        
        driveUrl = `https://drive.google.com/file/d/${fileId}/view`;
      }

      const finalUrl = [downloadURL, driveUrl].filter(Boolean).join(' ');
      if (!finalUrl) throw new Error("Both uploads failed");
      setCommentText(prev => prev ? `${prev} ${finalUrl} ` : `${finalUrl} `);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error("Upload error", error);
    } finally {
      setIsUploading(false);
    }
  };

  React.useImperativeHandle(ref, () => ({
    insertTaskTag: (tagName: string) => {
      setCommentText(prev => `${prev} #${tagName} `);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }));

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setCommentText(text);

    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = text.substring(0, cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@(\S*)$/);
    const taskMatch = textBeforeCursor.match(/#([^#]*)$/);

    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setShowMentionMenu(true);
      setShowTaskMenu(false);
    } else if (taskMatch) {
      setTaskQuery(taskMatch[1]);
      setShowTaskMenu(true);
      setShowMentionMenu(false);
    } else {
      setShowMentionMenu(false);
      setShowTaskMenu(false);
    }
  };

  const insertMention = (user: AppUser) => {
    recordMention(user.id);
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeMention = commentText.substring(0, cursorPosition).replace(/@\S*$/, '');
    const textAfterMention = commentText.substring(cursorPosition);
    
    setCommentText(`${textBeforeMention}@${user.username} ${textAfterMention}`);
    if (!mentions.includes(user.id)) {
      setMentions([...mentions, user.id]);
    }
    setShowMentionMenu(false);
    inputRef.current?.focus();
  };

  const insertTask = (task: Task, withApproval: boolean = false) => {
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeTask = commentText.substring(0, cursorPosition).replace(/#([^#]*)$/, '');
    const textAfterTask = commentText.substring(cursorPosition);
    
    setCommentText(`${textBeforeTask}#${task.name}${withApproval ? '-approval' : ''} ${textAfterTask}`);
    setShowTaskMenu(false);
    inputRef.current?.focus();
  };

  const handleSend = () => {
    if (!commentText.trim()) return;

    const lowerCommentText = commentText.toLowerCase();
    const activeMentions = Array.from(new Set([
      ...mentions.filter(userId => {
        const user = appUsers.find(u => u.id === userId);
        return user && lowerCommentText.includes(`@${user.username.toLowerCase()}`);
      }),
      ...appUsers.filter(u => lowerCommentText.includes(`@${u.username.toLowerCase()}`)).map(u => u.id)
    ]));

    activeMentions.forEach(userId => recordMention(userId));

    onSend(commentText, activeMentions);
    setCommentText('');
    setMentions([]);
  };

  const filteredUsers = React.useMemo(() => {
    const freqs = getMentionFrequencies();
    
    // Extract parties from the linked group (e.g. "KSM-01")
    const partyUsernames = (linkedGroup?.subTasks || [])
      .map((st: any) => st.party?.toLowerCase().trim())
      .filter(Boolean);

    return appUsers
      .filter(u => u.username.toLowerCase().includes(mentionQuery.toLowerCase()))
      .sort((a, b) => {
        // Boost party users
        const isPartyA = partyUsernames.includes(a.username.toLowerCase());
        const isPartyB = partyUsernames.includes(b.username.toLowerCase());

        if (isPartyA && !isPartyB) return -1;
        if (!isPartyA && isPartyB) return 1;

        const freqA = freqs[a.id] || 0;
        const freqB = freqs[b.id] || 0;
        if (freqA !== freqB) {
          return freqB - freqA;
        }
        return a.username.localeCompare(b.username);
      });
  }, [appUsers, mentionQuery, linkedGroup]);
  const filteredTasks = React.useMemo(() => {
    return projectTasks.filter(t => t.name?.toLowerCase().includes(taskQuery.toLowerCase()));
  }, [projectTasks, taskQuery]);

  const previewUrls = React.useMemo(() => {
    return commentText.match(/(https?:\/\/[^\s]+)/g) || [];
  }, [commentText]);

  return (
    <div className="p-4 border-t border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20] relative shrink-0">
      {showMentionMenu && filteredUsers.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-xl shadow-xl w-64 max-h-48 overflow-y-auto z-10">
          {filteredUsers.map(u => (
            <button type="button"
              key={u.id}
              onClick={() => insertMention(u)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-[#333336] dark:text-[#e3e3e3] transition-colors flex items-center gap-2"
            >
              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center font-bold text-[10px]">
                {u.username.substring(0, 2).toUpperCase()}
              </div>
              {u.username}
            </button>
          ))}
        </div>
      )}
      {showTaskMenu && filteredTasks.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-xl shadow-xl w-80 max-h-48 overflow-y-auto z-10">
          {filteredTasks.map(t => (
            <button type="button"
              key={t.id}
              onClick={() => insertTask(t)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-[#333336] dark:text-[#e3e3e3] transition-colors flex items-center justify-between"
            >
              <div className="flex flex-col gap-0.5 overflow-hidden">
                <span className="font-medium text-slate-800 dark:text-[#f3f3f3] truncate">{t.name}</span>
                {t.party && <span className="text-xs text-slate-500 dark:text-[#a3a3a3]">{t.party}</span>}
              </div>
              {t.delegation && (
                <div 
                  className="relative inline-flex items-center h-4 rounded-full w-7 bg-orange-500 shrink-0 cursor-pointer" 
                  title="Delegated Task - Include Approval Board"
                  onClick={(e) => {
                    e.stopPropagation();
                    insertTask(t, true);
                  }}
                >
                   <span className="translate-x-3.5 inline-block w-3 h-3 transform bg-white rounded-full transition-transform" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex flex-col gap-2">
        {previewUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2">
            {previewUrls.map((url, i) => (
              <div key={i} className="relative group">
                <img 
                  src={url} 
                  alt="preview" 
                  className="h-24 w-auto rounded-lg border border-slate-200 dark:border-[#444446] object-cover" 
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                />
                <button
                  type="button"
                  onClick={async () => {
                     setCommentText(prev => prev.replace(url, '').replace(/  +/g, ' ').trim());
                     if (url.includes('firebasestorage.googleapis.com')) {
                       try {
                         const fileRef = storageRef(storage, url);
                         await deleteObject(fileRef);
                       } catch (e) { console.error("Error deleting", e); }
                     }
                     const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
                     if (driveMatch) {
                       try {
                         let accessToken = await getAccessToken();
                         if (!accessToken) {
                           const result = await googleSignIn();
                           if (result) accessToken = result.accessToken;
                         }
                         if (accessToken) {
                           await fetch(`https://www.googleapis.com/drive/v3/files/${driveMatch[1]}`, {
                             method: 'DELETE',
                             headers: { 'Authorization': `Bearer ${accessToken}` }
                           });
                         }
                       } catch (e) { console.error("Failed to delete from Drive:", e); }
                     }
                  }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative flex items-center">
                    <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={async () => {
              let accessToken = await getAccessToken();
              if (!accessToken) {
                try {
                  const result = await googleSignIn();
                  if (result) accessToken = result.accessToken;
                } catch (e) {
                  console.error("Auth error", e);
                  return;
                }
              }
              fileInputRef.current?.click();
            }}
            className="absolute left-3 p-1.5 text-slate-400 hover:text-blue-500 disabled:opacity-50 transition-colors bg-slate-100 dark:bg-[#28282a] rounded-lg z-10"
            title="Upload Image"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
          </button>
          <input
            ref={inputRef}
            type="text"
            value={commentText}
            onChange={handleTextChange}
            onKeyDown={(e) => {
              if (showMentionMenu && filteredUsers.length > 0 && e.key === 'Enter') {
                 e.preventDefault();
                 insertMention(filteredUsers[0]);
                 return;
              }
              if (showTaskMenu && filteredTasks.length > 0 && e.key === 'Enter') {
                 e.preventDefault();
                 insertTask(filteredTasks[0]);
                 return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a comment... Use @ user or # subtask"
            className="w-full py-3 pl-12 pr-4 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end">
          <button title="Send"
            type="submit"
            disabled={!commentText.trim()}
            className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-opacity min-w-[120px]"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}));