import React, { FC } from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { Edit2, Trash2 } from 'lucide-react';
import { Task, AppUser, DelegationGroup, Project } from '../../../types';
import { cn } from '../../../lib/utils';
import { ChatHighlightedText } from './chatSharedUtils';
import { TaskChatApprovalBoard } from './TaskChatApprovalBoard';

interface TaskChatCommentItemProps {
  comment: any;
  currentUser: AppUser;
  appUsers: AppUser[];
  subAppUsers?: any[];
  editingCommentId: string | null;
  editingText: string;
  setEditingText: (text: string) => void;
  setEditingCommentId: (id: string | null) => void;
  handleEditComment: (commentId: string) => void;
  handleDeleteComment: (commentId: string) => void;
  task: Task;
  tasks: Task[];
  currentProject: Project | undefined;
  linkedGroup: DelegationGroup | null | undefined;
  delegationGroups: DelegationGroup[];
}

export const TaskChatCommentItem: React.FC<TaskChatCommentItemProps> = ({
  comment: c,
  currentUser,
  appUsers,
  subAppUsers,
  editingCommentId,
  editingText,
  setEditingText,
  setEditingCommentId,
  handleEditComment,
  handleDeleteComment,
  task,
  tasks,
  currentProject,
  linkedGroup,
  delegationGroups
}) => {
  const { t } = useLanguage();

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
    <div
      id={`comment-${c.id}`}
      key={c.id}
      className={cn("flex flex-col group transition-shadow duration-1000 rounded-xl", isMe ? "items-end" : "items-start")}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-slate-500">{authorDisplayName}</span>
        <span className="text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</span>
        {isMe && !isEditing && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingCommentId(c.id);
                setEditingText(c.text);
              }}
              className="p-2 lg:p-1 text-slate-400 hover:text-blue-500 dark:text-[#838383] dark:hover:text-[#8ab4f8] transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteComment(c.id);
              }}
              className="p-2 lg:p-1 text-slate-400 hover:text-red-500 dark:text-[#838383] dark:hover:text-[#f28b82] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <div
        className={cn(
          "p-3 rounded-xl max-w-[85%] text-sm whitespace-pre-wrap",
          isMe
            ? "bg-blue-600 text-white rounded-tr-none"
            : "bg-slate-100 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3] rounded-tl-none"
        )}
      >
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              className="w-full min-w-[200px] p-2 bg-white/20 text-white placeholder-white/60 border border-white/30 rounded outline-none text-sm resize-none"
            />
            <div className="flex items-center gap-2 self-end">
              <button
                type="button"
                onClick={() => {
                  setEditingCommentId(null);
                  setEditingText('');
                }}
                className="text-xs font-bold text-white/80 hover:text-white px-2 py-1"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => handleEditComment(c.id)}
                className="text-xs font-bold bg-white/90 dark:bg-[#1e1e20] text-blue-600 dark:text-[#8ab4f8] px-3 py-1 rounded shadow-sm hover:bg-white dark:hover:bg-[#28282a]"
              >
                {t("Save")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <ChatHighlightedText text={c.text} isMe={isMe} taskName={task.name} linkedGroup={linkedGroup} />
            <TaskChatApprovalBoard
              text={c.text}
              isMe={isMe}
              task={task}
              tasks={tasks}
              currentProject={currentProject}
              delegationGroups={delegationGroups}
              currentUser={currentUser}
            />
          </>
        )}
      </div>
    </div>
  );
};
