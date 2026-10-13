import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task, AppUser, DelegationGroup } from '../../types';
import { useAppStore } from "../../store/useAppStore";
import { TaskChatDelegationSection } from './chat/TaskChatDelegationSection';
import { TaskChatReportsList } from './chat/TaskChatReportsList';
import { TaskChatCommentItem } from './chat/TaskChatCommentItem';
import { TaskChatInput, TaskChatInputHandle } from './chat/TaskChatInput';
import { useTaskChatActions } from './chat/useTaskChatActions';

export interface TaskChatProps {
  task: Task;
  projects: Project[];
  tasks: Task[];
  currentUser: AppUser;
  appUsers: AppUser[];
  subAppUsers?: any[];
  delegationGroups: DelegationGroup[];
  onNavigateToDelegation?: (groupId: string, taskId?: string) => void;
  setConfirmModal: any;
}

export const TaskChat = React.memo(function TaskChat({
  task,
  projects,
  tasks,
  currentUser,
  appUsers,
  subAppUsers,
  delegationGroups,
  setConfirmModal
}: TaskChatProps) {
  const focusCommentId = useAppStore(state => state.focusCommentId);
  const setFocusCommentId = useAppStore(state => state.setFocusCommentId);

  const currentProject = useMemo(() => {
    return projects.find(p => 
      p.code === task.projectCode &&
      (task.projectStore ? p.store === task.projectStore : true) &&
      (task.projectYear ? String(p.year) === String(task.projectYear) : true)
    ) || projects.find(p => p.code === task.projectCode);
  }, [projects, task.projectCode, task.projectStore, task.projectYear]);

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

  const chatInputRef = useRef<TaskChatInputHandle>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [localComments, setLocalComments] = useState(task.comments || []);

  const projectTasks = useMemo(() => {
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
      if (vals.length > 0 && vals[0]) {
        list.add(vals[0]);
      }
    });

    if (task && task.party) {
      const parts = String(task.party).split(',').map(s => s.trim()).filter(Boolean);
      parts.forEach(p => list.add(p));
    }

    const linkedGroup = delegationGroups.find(g => g.parentTaskId === task.id);
    if (linkedGroup && linkedGroup.subTasks) {
      linkedGroup.subTasks.forEach(st => {
        if (st.party) {
          const parts = String(st.party).split(',').map(s => s.trim()).filter(Boolean);
          parts.forEach(p => list.add(p));
        }
      });
    }

    return Array.from(list).sort();
  }, [appUsers, subAppUsers, task?.party, delegationGroups, task?.id]);

  const linkedGroup = delegationGroups.find(g => g.parentTaskId === task.id);

  const { handleDeleteComment, handleEditComment, handleSendFromInput } = useTaskChatActions({
    task,
    comments,
    setLocalComments,
    currentUser,
    appUsers,
    currentProject,
    linkedGroup,
    projectTasks,
    setConfirmModal,
    editingText,
    setEditingText,
    setEditingCommentId
  });

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {linkedGroup && (
          <TaskChatDelegationSection
            linkedGroup={linkedGroup}
            task={task}
            currentProject={currentProject}
            currentUser={currentUser}
            appUsers={appUsers}
            picOptions={picOptions}
            chatInputRef={chatInputRef}
            tasks={tasks}
            projects={projects}
          />
        )}

        <TaskChatReportsList linkedGroup={linkedGroup} />

        {comments.map((c: any) => (
          <TaskChatCommentItem
            key={c.id}
            comment={c}
            currentUser={currentUser}
            appUsers={appUsers}
            subAppUsers={subAppUsers}
            editingCommentId={editingCommentId}
            editingText={editingText}
            setEditingText={setEditingText}
            setEditingCommentId={setEditingCommentId}
            handleEditComment={handleEditComment}
            handleDeleteComment={handleDeleteComment}
            task={task}
            tasks={tasks}
            currentProject={currentProject}
            linkedGroup={linkedGroup}
            delegationGroups={delegationGroups}
          />
        ))}

        {comments.length === 0 && !linkedGroup && (
          <div className="flex items-center justify-center h-full text-slate-400 dark:text-[#838383] text-sm">
            No comments yet. Start the conversation!
          </div>
        )}
      </div>

      <TaskChatInput
        ref={chatInputRef}
        onSend={handleSendFromInput}
        appUsers={appUsers}
        projectTasks={projectTasks}
        linkedGroup={linkedGroup}
      />
    </div>
  );
});
