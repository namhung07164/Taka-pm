import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from '../../lib/LanguageContext';
import { Project, Task, AppUser, DelegationGroup, TaskComment } from '../../types';
import { cn, generateId } from '../../lib/utils';
import { doc } from 'firebase/firestore';
import { db, APP_ID, storage, writeBatch, setDoc } from '../../lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { googleSignIn, getAccessToken } from '../../lib/firebase';
import { LazyImage } from '../LazyImage';
import { useAppStore } from '../../store/useAppStore';
import { safeGetItemLocal, safeSetItemLocal } from '../../lib/storage';
import { X, Paperclip, Edit2, Trash2, Send, Loader2, ExternalLink, Hash, AtSign, Clock, ChevronUp } from 'lucide-react';

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

const recordMention = (userId: string) => {
  try {
    const habitsStr = safeGetItemLocal('mentionHabits');
    const habits = habitsStr ? JSON.parse(habitsStr) : {};
    habits[userId] = (habits[userId] || 0) + 1;
    safeSetItemLocal('mentionHabits', JSON.stringify(habits));
  } catch (e) {}
};

const getMentionFrequencies = (): Record<string, number> => {
  try {
    const habitsStr = safeGetItemLocal('mentionHabits');
    return habitsStr ? JSON.parse(habitsStr) : {};
  } catch (e) {
    return {};
  }
};

export const ProjectChat = React.memo(function ProjectChat({
  project,
  projects,
  tasks,
  currentUser,
  appUsers,
  subAppUsers,
  delegationGroups,
  onOpenTask,
  setConfirmModal,
}: ProjectChatProps) {
  const { t } = useLanguage();
  const focusCommentId = useAppStore((state) => state.focusCommentId);
  const setFocusCommentId = useAppStore((state) => state.setFocusCommentId);
  const setZoomableImageSrc = useAppStore((state) => state.setZoomableImageSrc);

  const [localComments, setLocalComments] = useState<TaskComment[]>(project.comments || []);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  // Limit to last 25 comments by default (Fast UI & Memory Guard)
  const [visibleCount, setVisibleCount] = useState(25);

  const chatInputRef = useRef<any>(null);

  useEffect(() => {
    setLocalComments(project.comments || []);
  }, [project.comments]);

  // If targeted via focusCommentId from an older notification, auto-expand visibleCount
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

  const projectTasks = useMemo(() => {
    return tasks.filter(
      (t) =>
        t.projectCode === project.code &&
        (String(t.projectYear) === String(project.year) || (!t.projectYear && !project.year)) &&
        (t.projectStore === project.store || (!t.projectStore && !project.store))
    );
  }, [tasks, project.code, project.year, project.store]);

  const docId = project.id || String(project.no);

  const handleDeleteComment = async (commentId: string) => {
    const doDelete = async () => {
      const commentToDelete = localComments.find((c) => c.id === commentId);
      if (commentToDelete) {
        const urls = commentToDelete.text.match(/(https?:\/\/[^\s]+)/g) || [];
        urls.forEach(async (url: string) => {
          if (url.includes('firebasestorage.googleapis.com')) {
            try {
              const fileRef = storageRef(storage, url);
              await deleteObject(fileRef);
            } catch (e) {
              console.error('Failed to delete attached file from storage:', e);
            }
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
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
              }
            } catch (e) {
              console.error('Failed to delete from Drive:', e);
            }
          }
        });
      }

      const updatedComments = localComments.filter((c) => c.id !== commentId);
      setLocalComments(updatedComments);

      const nowIso = new Date().toISOString();
      const updatedProject = {
        ...project,
        comments: updatedComments,
        updatedAt: nowIso,
      };

      // Optimistic update in Zustand store
      const allProjects = useAppStore.getState().projects;
      const updatedProjects = allProjects.map((p) =>
        (p.id && p.id === project.id) || p.no === project.no ? updatedProject : p
      );
      useAppStore.getState().setProjects(updatedProjects);

      try {
        const batch = writeBatch(db);
        batch.update(
          doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId),
          { comments: updatedProject.comments, updatedAt: nowIso }
        );
        batch.commit().catch((e) => console.error('Batch commit failed', e));
      } catch (err) {
        console.error(err);
        setLocalComments(project.comments || []);
      }
    };

    if (setConfirmModal) {
      setConfirmModal({
        isOpen: true,
        title: t('Delete Comment'),
        message: t('Are you sure you want to delete this comment?'),
        onConfirm: doDelete,
      });
    } else {
      doDelete();
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editingText.trim()) return;

    const updatedComments = localComments.map((c) =>
      c.id === commentId ? { ...c, text: editingText } : c
    );
    setLocalComments(updatedComments);

    const nowIso = new Date().toISOString();
    const updatedProject = {
      ...project,
      comments: updatedComments,
      updatedAt: nowIso,
    };

    // Optimistic update in store
    const allProjects = useAppStore.getState().projects;
    const updatedProjects = allProjects.map((p) =>
      (p.id && p.id === project.id) || p.no === project.no ? updatedProject : p
    );
    useAppStore.getState().setProjects(updatedProjects);

    setEditingCommentId(null);
    setEditingText('');

    try {
      const batch = writeBatch(db);
      batch.update(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId),
        { comments: updatedProject.comments, updatedAt: nowIso }
      );
      batch.commit().catch((e) => console.error('Batch commit failed', e));
    } catch (err) {
      console.error(err);
      setLocalComments(project.comments || []);
    }
  };

  const handleSendFromInput = async (text: string, activeMentions: string[]) => {
    const nowIso = new Date().toISOString();
    const newComment: TaskComment = {
      id: `c_${Date.now()}_${generateId().substring(0, 4)}`,
      text: text,
      createdAt: nowIso,
      userId: currentUser.id,
      mentions: activeMentions,
    };

    const updatedComments = [...localComments, newComment];
    setLocalComments(updatedComments);

    const updatedProject = {
      ...project,
      comments: updatedComments,
      updatedAt: nowIso,
    };

    // Optimistic store update
    const allProjects = useAppStore.getState().projects;
    const updatedProjects = allProjects.map((p) =>
      (p.id && p.id === project.id) || p.no === project.no ? updatedProject : p
    );
    useAppStore.getState().setProjects(updatedProjects);

    try {
      const batch = writeBatch(db);
      batch.update(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId),
        { comments: updatedProject.comments, updatedAt: nowIso }
      );
      batch.commit().catch((e) => console.error('Batch commit failed', e));
    } catch (e) {
      console.error('Failed to send comment', e);
    }
  };

  const renderTextWithHighlights = (text: string, isMe?: boolean) => {
    const knownTags: string[] = [];
    projectTasks.forEach((t) => {
      if (t.name) {
        knownTags.push(`#${t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      }
    });

    const knownTagsPattern =
      knownTags.length > 0 ? `${knownTags.map((t) => `${t}(?:-approval)?`).join('|')}|` : '';
    const urlPattern = `https?:\\/\\/[^\\s]+`;
    const regex = new RegExp(`(${urlPattern}|${knownTagsPattern}#[\\w\\-]+\\b|@[\\w\\-]+\\b)`, 'g');

    return text.split(regex).map((chunk, i) => {
      if (!chunk) return null;
      if (chunk.match(/^https?:\/\//)) {
        const isImage =
          chunk.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)(\?.*)?$/i) ||
          chunk.match(/^https?:\/\/.*(images|img|photo|picture).*/i);
        const googleDriveMatch = chunk.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);

        const link = (
          <a
            key={`link-${i}`}
            href={chunk}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'underline font-medium break-all',
              isMe ? 'text-blue-200 hover:text-white' : 'text-blue-600 dark:text-blue-400 hover:text-blue-800'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {chunk}
          </a>
        );

        if (isImage || googleDriveMatch) {
          const imgSrc = googleDriveMatch
            ? `https://drive.google.com/thumbnail?id=${googleDriveMatch[1]}&sz=w800`
            : chunk;
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
      if (chunk.startsWith('@')) {
        return (
          <span key={i} className={cn('font-bold', isMe ? 'text-blue-200' : 'text-blue-600 dark:text-blue-400')}>
            {chunk}
          </span>
        );
      }
      if (chunk.startsWith('#')) {
        const taskName = chunk.replace(/^#/, '').replace(/-approval$/, '');
        const matchedTask = projectTasks.find((t) => t.name === taskName);
        return (
          <span
            key={i}
            onClick={() => {
              if (matchedTask && onOpenTask) {
                onOpenTask(matchedTask.id);
              }
            }}
            className={cn(
              'font-bold cursor-pointer hover:underline',
              isMe ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400'
            )}
            title={matchedTask ? `Open task: ${matchedTask.name}` : undefined}
          >
            {chunk.replace(/-approval$/, '')}
          </span>
        );
      }
      return chunk;
    });
  };

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
        {/* Load older messages button if more comments exist (Pagination / Limit to Last 25) */}
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
          const author = appUsers.find((u) => u.id === c.userId);
          const isEditing = editingCommentId === c.id;

          return (
            <div
              key={c.id}
              id={`comment-${c.id}`}
              className={cn('flex flex-col group', isMe ? 'items-end' : 'items-start')}
            >
              <div className="flex items-center gap-2 mb-1 px-1 text-xs text-slate-400 dark:text-[#838383]">
                <span className="font-bold text-slate-600 dark:text-[#a3a3a3]">
                  {author?.username || (isMe ? 'You' : 'Unknown')}
                </span>
                <span>•</span>
                <span>
                  {c.createdAt
                    ? new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
                      ' ' +
                      new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
                    : ''}
                </span>
                {(isMe || currentUser.role === 'admin') && !isEditing && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCommentId(c.id);
                        setEditingText(c.text);
                      }}
                      className="p-1 hover:text-slate-600 dark:hover:text-slate-300 rounded"
                      title={t('Edit')}
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteComment(c.id)}
                      className="p-1 hover:text-red-500 rounded"
                      title={t('Delete')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'p-3 rounded-xl max-w-[85%] text-sm whitespace-pre-wrap',
                  isMe
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-slate-100 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3] rounded-tl-none'
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
                        {t('Cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditComment(c.id)}
                        className="text-xs font-bold bg-white/90 dark:bg-[#1e1e20] text-blue-600 dark:text-[#8ab4f8] px-3 py-1 rounded shadow-sm hover:bg-white dark:hover:bg-[#28282a]"
                      >
                        {t('Save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  renderTextWithHighlights(c.text, isMe)
                )}
              </div>
            </div>
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

interface ProjectChatInputProps {
  onSend: (text: string, mentions: string[]) => void;
  appUsers: AppUser[];
  projectTasks: Task[];
}

const ProjectChatInput = React.memo(
  React.forwardRef(function ProjectChatInput(
    { onSend, appUsers, projectTasks }: ProjectChatInputProps,
    ref: React.Ref<any>
  ) {
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

    React.useImperativeHandle(ref, () => ({
      insertTaskTag: (tagName: string) => {
        setCommentText((prev) => `${prev} #${tagName} `);
        setTimeout(() => inputRef.current?.focus(), 50);
      },
    }));

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
        let accessToken = await getAccessToken();
        if (!accessToken) {
          const result = await googleSignIn();
          if (result) accessToken = result.accessToken;
        }

        let downloadURL = '';
        try {
          const storageReference = storageRef(storage, `comments/${Date.now()}_${file.name}`);
          const uploadTask = await uploadBytesResumable(storageReference, file);
          downloadURL = await getDownloadURL(uploadTask.ref);
        } catch (err) {
          console.error('Firebase Storage upload failed:', err);
        }

        let driveUrl = '';
        if (accessToken) {
          try {
            const res1 = await fetch('https://www.googleapis.com/drive/v3/files', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ name: file.name, mimeType: file.type }),
            });
            const data1 = await res1.json();
            const fileId = data1.id;

            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': file.type,
              },
              body: file,
            });

            await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ role: 'reader', type: 'anyone' }),
            });

            driveUrl = `https://drive.google.com/file/d/${fileId}/view`;
          } catch (err) {
            console.error('Drive upload failed:', err);
          }
        }

        const finalUrl = [downloadURL, driveUrl].filter(Boolean).join(' ');
        if (!finalUrl) throw new Error('Upload failed');
        setCommentText((prev) => (prev ? `${prev} ${finalUrl} ` : `${finalUrl} `));
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (error) {
        console.error('Upload error', error);
      } finally {
        setIsUploading(false);
      }
    };

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

    const insertTask = (task: Task) => {
      const cursorPosition = inputRef.current?.selectionStart || 0;
      const textBeforeTask = commentText.substring(0, cursorPosition).replace(/#([^#]*)$/, '');
      const textAfterTask = commentText.substring(cursorPosition);

      setCommentText(`${textBeforeTask}#${task.name} ${textAfterTask}`);
      setShowTaskMenu(false);
      inputRef.current?.focus();
    };

    const handleSend = () => {
      if (!commentText.trim()) return;

      const lowerCommentText = commentText.toLowerCase();
      const activeMentions = Array.from(
        new Set([
          ...mentions.filter((userId) => {
            const user = appUsers.find((u) => u.id === userId);
            return user && lowerCommentText.includes(`@${user.username.toLowerCase()}`);
          }),
          ...appUsers
            .filter((u) => lowerCommentText.includes(`@${u.username.toLowerCase()}`))
            .map((u) => u.id),
        ])
      );

      activeMentions.forEach((userId) => recordMention(userId));

      onSend(commentText, activeMentions);
      setCommentText('');
      setMentions([]);
    };

    const filteredUsers = useMemo(() => {
      const freqs = getMentionFrequencies();
      return appUsers
        .filter((u) => u.username.toLowerCase().includes(mentionQuery.toLowerCase()))
        .sort((a, b) => {
          const freqA = freqs[a.id] || 0;
          const freqB = freqs[b.id] || 0;
          if (freqA !== freqB) return freqB - freqA;
          return a.username.localeCompare(b.username);
        });
    }, [appUsers, mentionQuery]);

    const filteredTasks = useMemo(() => {
      return projectTasks.filter((t) => t.name?.toLowerCase().includes(taskQuery.toLowerCase()));
    }, [projectTasks, taskQuery]);

    return (
      <div className="p-4 border-t border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20] relative shrink-0">
        {showMentionMenu && filteredUsers.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-xl shadow-xl w-64 max-h-48 overflow-y-auto z-10">
            {filteredUsers.map((u) => (
              <button
                type="button"
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
            {filteredTasks.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => insertTask(t)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-[#333336] dark:text-[#e3e3e3] transition-colors flex items-center justify-between"
              >
                <span className="font-medium text-slate-800 dark:text-[#f3f3f3] truncate">{t.name}</span>
                {t.party && <span className="text-xs text-slate-500 dark:text-[#a3a3a3]">{t.party}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-2 text-slate-500 dark:text-[#a3a3a3] hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#28282a] transition-colors disabled:opacity-50"
            title={t('Attach File / Image')}
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setCommentText((prev) => `${prev}@`);
              setShowMentionMenu(true);
              inputRef.current?.focus();
            }}
            className="p-2 text-slate-500 dark:text-[#a3a3a3] hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#28282a] transition-colors"
            title={t('Mention User')}
          >
            <AtSign className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setCommentText((prev) => `${prev}#`);
              setShowTaskMenu(true);
              inputRef.current?.focus();
            }}
            className="p-2 text-slate-500 dark:text-[#a3a3a3] hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#28282a] transition-colors"
            title={t('Tag Task')}
          >
            <Hash className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={commentText}
              onChange={handleTextChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t('Write a comment... Use @ for users, # for tasks')}
              className="w-full px-4 py-2 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-[#e3e3e3]"
            />
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={!commentText.trim()}
            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all disabled:opacity-50 active:scale-95 touch-manipulation shadow-sm"
            title={t('Send')}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  })
);
