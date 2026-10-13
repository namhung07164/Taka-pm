import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLanguage } from '../../lib/LanguageContext';
import { Project, Task, AppUser, DelegationGroup, TaskComment } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { ChevronUp } from 'lucide-react';
import { useProjectChatActions } from './chat/useProjectChatActions';
import { ProjectCommentItem } from './chat/ProjectCommentItem';
import { ProjectChatInput, ProjectChatInputHandle } from './chat/ProjectChatInput';

export interface ProjectChatProps {
  project: Project;
  projects: Project[];
  tasks: Task[];
  currentUser: AppUser;
  appUsers: AppUser[];
  subAppUsers?: any[];
  delegationGroups: DelegationGroup[];
  onOpenTask?: (taskId: string) => void;
  setConfirmModal?: any;
}

export const ProjectChat = React.memo(function ProjectChat({
  project,
  tasks,
  currentUser,
  appUsers,
  onOpenTask,
  setConfirmModal,
}: ProjectChatProps) {
  const { t } = useLanguage();
  const focusCommentId = useAppStore((state) => state.focusCommentId);
  const setFocusCommentId = useAppStore((state) => state.setFocusCommentId);

  const [localComments, setLocalComments] = useState<TaskComment[]>(project.comments || []);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [visibleCount, setVisibleCount] = useState(25);

  const chatInputRef = useRef<ProjectChatInputHandle>(null);

  useEffect(() => {
    setLocalComments(project.comments || []);
  }, [project.comments]);

  useEffect(() => {
    if (focusCommentId && localComments.length > 0) {
      const idx = localComments.findIndex((c) => c.id === focusCommentId);
      if (idx !== -1) {
        const fromEnd = localComments.length - idx;
        if (fromEnd > visibleCount) {
          setVisibleCount(Math.min(localComments.length, fromEnd + 10));
        }
      }
    }
  }, [focusCommentId, localComments, visibleCount]);

  const displayedComments = useMemo(() => {
    if (localComments.length <= visibleCount) return localComments;
    return localComments.slice(localComments.length - visibleCount);
  }, [localComments, visibleCount]);

  useEffect(() => {
    if (focusCommentId) {
      const timer = setTimeout(() => {
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
      return () => clearTimeout(timer);
    }
  }, [focusCommentId, setFocusCommentId]);

  const projectTasks = useMemo(() => {
    return tasks.filter(
      (t) =>
        t.projectCode === project.code &&
        (String(t.projectYear) === String(project.year) || (!t.projectYear && !project.year)) &&
        (t.projectStore === project.store || (!t.projectStore && !project.store))
    );
  }, [tasks, project.code, project.year, project.store]);

  const { handleDeleteComment, handleEditComment, handleSendFromInput } = useProjectChatActions({
    project,
    localComments,
    setLocalComments,
    currentUser,
    setConfirmModal,
    editingText,
    setEditingText,
    setEditingCommentId,
    t
  });

  return (
    <div 
      className="flex flex-col h-full flex-grow overflow-hidden relative overscroll-contain"
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div 
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 overscroll-contain touch-pan-y custom-scrollbar"
        style={{ touchAction: 'pan-y' }}
      >
        {localComments.length > visibleCount && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => Math.min(localComments.length, prev + 25))}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-600 dark:text-[#8ab4f8] bg-blue-50 dark:bg-[#28282a] hover:bg-blue-100 dark:hover:bg-[#333336] rounded-full border border-blue-200 dark:border-blue-900/60 shadow-sm transition-all active:scale-95 touch-manipulation"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>{t('Load older messages')} ({localComments.length - visibleCount} {t('remaining')})</span>
            </button>
          </div>
        )}

        {displayedComments.map((c) => {
          const isMe = c.userId === currentUser.id;
          const isEditing = editingCommentId === c.id;

          return (
            <ProjectCommentItem
              key={c.id}
              comment={c}
              currentUser={currentUser}
              appUsers={appUsers}
              isMe={isMe}
              isEditing={isEditing}
              editingText={editingText}
              setEditingText={setEditingText}
              setEditingCommentId={setEditingCommentId}
              handleEditComment={handleEditComment}
              handleDeleteComment={handleDeleteComment}
              projectTasks={projectTasks}
              onOpenTask={onOpenTask}
            />
          );
        })}

        {localComments.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-[#838383] text-sm">
            <p>{t('No comments yet. Start the conversation!')}</p>
          </div>
        )}
      </div>

      <ProjectChatInput
        ref={chatInputRef}
        onSend={handleSendFromInput}
        appUsers={appUsers}
        projectTasks={projectTasks}
      />
    </div>
  );
});
