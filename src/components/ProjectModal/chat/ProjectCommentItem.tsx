import React, { FC } from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { TaskComment, AppUser, Task } from '../../../types';
import { cn } from '../../../lib/utils';
import { LazyImage } from '../../LazyImage';
import { useAppStore } from '../../../store/useAppStore';
import { Edit2, Trash2, FileText, Maximize2 } from 'lucide-react';

interface ProjectCommentItemProps {
  comment: TaskComment;
  currentUser: AppUser;
  appUsers: AppUser[];
  isMe: boolean;
  isEditing: boolean;
  editingText: string;
  setEditingText: (text: string) => void;
  setEditingCommentId: (id: string | null) => void;
  handleEditComment: (commentId: string) => void;
  handleDeleteComment: (commentId: string) => void;
  projectTasks: Task[];
  onOpenTask?: (taskId: string) => void;
}

export const ProjectCommentItem: React.FC<ProjectCommentItemProps> = ({
  comment: c,
  currentUser,
  appUsers,
  isMe,
  isEditing,
  editingText,
  setEditingText,
  setEditingCommentId,
  handleEditComment,
  handleDeleteComment,
  projectTasks,
  onOpenTask
}) => {
  const { t } = useLanguage();
  const setZoomableImageSrc = useAppStore((state) => state.setZoomableImageSrc);
  const author = appUsers.find((u) => u.id === c.userId);

  const renderTextWithHighlights = (text: string, isSelf?: boolean) => {
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
        const isPdf =
          chunk.match(/\.pdf($|\?|#)/i) ||
          chunk.match(/drive\.google\.com\/.*(?:file|document|pdf)/i) ||
          chunk.match(/docs\.google\.com/i);
        const googleDriveMatch = chunk.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);

        const link = (
          <a
            key={`link-${i}`}
            href={chunk}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'underline font-medium break-all',
              isSelf ? 'text-blue-200 hover:text-white' : 'text-blue-600 dark:text-blue-400 hover:text-blue-800'
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
            <span key={i} className="inline-flex flex-col gap-1.5 mt-1 mb-1 w-full">
              {link}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomableImageSrc(chunk);
                }}
                className="block max-w-[220px] text-left hover:opacity-90 transition active:scale-95 cursor-pointer rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm"
              >
                <LazyImage src={imgSrc} alt="Attachment" />
              </button>
            </span>
          );
        }

        if (isPdf) {
          return (
            <span key={i} className="inline-flex flex-col gap-1.5 mt-1 mb-1 w-full">
              {link}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomableImageSrc(chunk);
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 transition active:scale-95 cursor-pointer w-fit"
              >
                <FileText className="w-4 h-4 text-red-500" />
                <span>View PDF (Full Display)</span>
                <Maximize2 className="w-3.5 h-3.5 ml-1 opacity-70" />
              </button>
            </span>
          );
        }

        return link;
      }
      if (chunk.startsWith('@')) {
        return (
          <span key={i} className={cn('font-bold', isSelf ? 'text-blue-200' : 'text-blue-600 dark:text-blue-400')}>
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
              isSelf ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400'
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
};
