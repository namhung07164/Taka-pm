import React, { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { AppUser, Task } from '../../../types';
import { storage, googleSignIn, getAccessToken } from '../../../lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Paperclip, AtSign, Hash, Send, Loader2 } from 'lucide-react';
import { recordMention, getMentionFrequencies } from '../../TaskModalParts/chat/chatSharedUtils';

export interface ProjectChatInputHandle {
  insertTaskTag: (tagName: string) => void;
}

export interface ProjectChatInputProps {
  onSend: (text: string, mentions: string[]) => void;
  appUsers: AppUser[];
  projectTasks: Task[];
}

export const ProjectChatInput = React.memo(
  React.forwardRef<ProjectChatInputHandle, ProjectChatInputProps>(function ProjectChatInput(
    { onSend, appUsers, projectTasks },
    ref
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
