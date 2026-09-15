import { useTaskModalLogic } from '../hooks/useTaskModalLogic';
import { TaskChat } from './TaskModalParts/TaskChat';
import { TaskBasicInfo } from './TaskModalParts/TaskBasicInfo';
import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Portal } from './Portal';
import Draggable from 'react-draggable';
import { X, Pin, FileText, Paperclip, Edit2, Image as ImageIcon, Loader2, Trash2, Link as LinkIcon, ExternalLink, Target, Info } from 'lucide-react';
import { Project, Task, AppUser, DelegationGroup } from '../types';
import { calculateDays, formatToDatetimeLocal, parseDateTime, cn, getDefaultDatetimeLocal, ensureUrlProtocol, getSuggestedCompletionTime, getTaskStatus, resolveActualStatus, formatDisplayDateTime } from '../lib/utils';
import { doc } from 'firebase/firestore';
import {    db, APP_ID, storage , writeBatch , setDoc , deleteDoc } from "../lib/firebase";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { googleSignIn, getAccessToken } from '../lib/firebase';
import { undoManager } from '../lib/undoManager';
import { scheduleDependentTasks, computeTaskCode, sortGroupTasks, parsePredecessors, buildTaskNoMap, getPredecessorCodeUpdates, updatePredecessorsStrings, addDays, calculateTaskDatesFromPredecessors } from '../lib/ganttUtils';
import { generateId } from '../lib/utils';
import { MultiSelect } from './MultiSelect';
import { ConfirmModal } from './ConfirmModal';
import { LazyImage } from './LazyImage';
import { useAppStore } from "../store/useAppStore";
import { deleteStorageFiles, extractStorageUrls } from "../lib/storageUtils";

import { useEnrichedData } from '../hooks/useEnrichedData';
import { addPendingUpdate } from '../lib/syncQueue';
import { QRCodeButton } from './QRCodeButton';
import { PredecessorMultiInput } from "./PredecessorMultiInput";
import { syncProjectDatesByCode } from '../lib/projectDatesService';
import { FastInput } from './FastInput';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  visibleDelegationGroups?: DelegationGroup[];
  prefillProjectCode: string | null;
  prefillProjectYear?: string | number | null;
  prefillProjectStore?: string | null;
  isReadOnly?: boolean;
  onNavigateToDelegation?: (groupId: string, taskId?: string) => void;
  initialTab?: 'details' | 'chat';
}

const PredecessorDatalist = React.memo(({ projects, tasks, currentProjectCode, currentProjectYear, currentProjectStore }: { projects: Project[], tasks: Task[], currentProjectCode?: string, currentProjectYear?: string | number, currentProjectStore?: string }) => {
  const options = useMemo(() => {
    try {
      const taskNoMap = buildTaskNoMap(projects || [], tasks || []);
      let ownOptions: React.ReactNode[] = [];
      let otherOptions: React.ReactNode[] = [];

      for (const [code, tList] of taskNoMap.entries()) {
        if (!tList || !tList.length || !tList[0]) continue;
        const t = tList[0];
        const isOwn = currentProjectCode && t.projectCode === currentProjectCode && 
                      (currentProjectYear ? String(t.projectYear) === String(currentProjectYear) : true) &&
                      (currentProjectStore ? String(t.projectStore) === String(currentProjectStore) : true);
                      
        const labelText = `${code}: ${t.name || ''}${t.finish ? ` (${t.finish.substring(0, 10)})` : ''}`;
        const opt = <option key={code} value={code} label={labelText}>{labelText}</option>;
        if (isOwn) {
          ownOptions.push(opt);
        } else {
          otherOptions.push(opt);
        }
      }
      return [...ownOptions, ...otherOptions];
    } catch (err) {
      console.warn("Failed to build predecessor options:", err);
      return [];
    }
  }, [projects, tasks, currentProjectCode, currentProjectYear, currentProjectStore]);
  
  return (
    <datalist id="task-modal-predecessor-options">
      {options}
    </datalist>
  );
});

export function TaskModal(props: TaskModalProps) {
    const logic = useTaskModalLogic(props);
  const {
    activeTab, setActiveTab, confirmModal, setConfirmModal, isSubmitting,
    handleOpenProjectComments, handleSubmit, t, nodeRef, canWrite, formData,
    projects, tasks, nameRef, currentUser, appUsers, subAppUsers, delegationGroups
  } = logic;
  const { task, onNavigateToDelegation, onClose, isOpen } = props;

  if (!isOpen) return null;


  return (
<Portal>
    <div className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-0 md:p-4">
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button">
        <div ref={nodeRef} className="bg-white dark:bg-[#1e1e20] md:rounded-2xl shadow-2xl w-full h-full md:h-auto max-h-[100dvh] md:max-h-[90vh] max-w-md overflow-hidden relative flex flex-col pointer-events-auto">
          <div className="modal-handle cursor-move px-4 md:px-6 py-4 border-b border-slate-100 dark:border-[#333336] flex justify-between items-center bg-slate-50 dark:bg-[#1e1e20]/50 shrink-0 pt-[env(safe-area-inset-top)] md:pt-4">
          {task ? (
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex gap-1 bg-slate-200/50 dark:bg-[#28282a] p-1 rounded-lg">
                <button onClick={() => setActiveTab('details')} 
                  className={cn("px-3 py-1.5 rounded-md text-sm font-bold transition-colors", activeTab === 'details' ? "bg-white dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3] shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
                >{t("Details")}</button>
                <button onClick={() => setActiveTab('chat')} 
                  className={cn("px-3 py-1.5 rounded-md text-sm font-bold transition-colors", activeTab === 'chat' ? "bg-white dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3] shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
                >{t("Comments")}</button>
              </div>
              <button 
                type="button"
                onClick={handleOpenProjectComments}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-200/50 dark:bg-[#28282a] hover:bg-slate-200 dark:hover:bg-[#333336] px-2.5 py-1.5 rounded-lg transition-colors"
                title="Go to Project Comments"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("Project")}</span>
              </button>
            </div>
          ) : (
            <h3 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3]">Task Details</h3>
          )}
          <div className="flex items-center gap-1">
            {task && task.id && (
              <QRCodeButton 
                title={task.name} 
                url={`${window.location.origin}${window.location.pathname}?targetType=task&targetId=${task.id}&code=${encodeURIComponent(task.projectCode || '')}&store=${task.projectStore || ''}&year=${task.projectYear || ''}`} 
              />
            )}
            <button onClick={onClose} className="text-slate-400 dark:text-[#838383] hover:text-slate-600 p-3 -mr-3">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        {activeTab === 'details' && (
          <form onSubmit={handleSubmit} className="p-4 md:p-6 overflow-y-auto flex-grow pb-[env(safe-area-inset-bottom)]">
          <TaskBasicInfo logic={logic} task={task} onNavigateToDelegation={onNavigateToDelegation} onClose={onClose} />
        </form>
        )}

        {activeTab === 'chat' && task && (
          <TaskChat task={task} projects={projects} tasks={tasks} currentUser={currentUser} appUsers={appUsers} subAppUsers={subAppUsers} delegationGroups={delegationGroups} onNavigateToDelegation={onNavigateToDelegation} setConfirmModal={setConfirmModal} />
        )}
      </div>
      </Draggable>
    </div>
</Portal>
  );
}