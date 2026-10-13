import React, { forwardRef, lazy, memo, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../../lib/LanguageContext';
import { AppUser, Task } from '../../../types';
import { APP_ID, storage, googleSignIn, getAccessToken } from '../../../lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { X, ImageIcon, Loader2 } from 'lucide-react';
import { recordMention, getMentionFrequencies } from './chatSharedUtils';

export interface TaskChatInputHandle {
  insertTaskTag: (tagName: string) => void;
}

interface TaskChatInputProps {
  onSend: (text: string, mentions: string[]) => void;
  appUsers: AppUser[];
  projectTasks?: Task[];
  linkedGroup?: any;
}

export const TaskChatInput = React.memo(
  React.forwardRef<TaskChatInputHandle, TaskChatInputProps>(function TaskChatInput(
    { onSend, appUsers, projectTasks, linkedGroup },
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

      setCommentText(`${textBeforeMention}@${user.username || 'user'} ${textAfterMention}`);
      if (!mentions.includes(user.id)) {
        setMentions([...mentions, user.id]);
      }
      setShowMentionMenu(false);
      inputRef.current?.focus();
    };

    const insertTask = (targetTask: Task, withApproval: boolean = false) => {
      const cursorPosition = inputRef.current?.selectionStart || 0;
      const textBeforeTask = commentText.substring(0, cursorPosition).replace(/#([^#]*)$/, '');
      const textAfterTask = commentText.substring(cursorPosition);

      setCommentText(`${textBeforeTask}#${targetTask.name || ''}${withApproval ? '-approval' : ''} ${textAfterTask}`);
      setShowTaskMenu(false);
      inputRef.current?.focus();
    };

    const handleSend = () => {
      if (!commentText.trim()) return;

      const lowerCommentText = commentText.toLowerCase();
      const activeMentions = Array.from(new Set([
        ...(mentions || []).filter(userId => {
          const user = (appUsers || []).find(u => u.id === userId);
          return user && lowerCommentText.includes(`@${user.username.toLowerCase()}`);
        }),
        ...(appUsers || []).filter(u => u.username && lowerCommentText.includes(`@${u.username.toLowerCase()}`)).map(u => u.id)
      ]));

      activeMentions.forEach(userId => recordMention(userId));

      onSend(commentText, activeMentions);
      setCommentText('');
      setMentions([]);
    };

    const filteredUsers = useMemo(() => {
      const freqs = getMentionFrequencies();

      const partyUsernames = (linkedGroup?.subTasks || [])
        .map((st: any) => st.party?.toLowerCase().trim())
        .filter(Boolean);

      return (appUsers || [])
        .filter(u => u.username && u.username.toLowerCase().includes(mentionQuery.toLowerCase()))
        .sort((a, b) => {
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

    const filteredTasks = useMemo(() => {
      return (projectTasks || []).filter(t => t.name?.toLowerCase().includes(taskQuery.toLowerCase()));
    }, [projectTasks, taskQuery]);

    const previewUrls = useMemo(() => {
      return commentText.match(/(https?:\/\/[^\s]+)/g) || [];
    }, [commentText]);

    return (
      <div className="p-4 border-t border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20] relative shrink-0">
        {showMentionMenu && filteredUsers.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-xl shadow-xl w-64 max-h-48 overflow-y-auto z-10">
            {filteredUsers.map(u => (
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
            {filteredTasks.map(t => (
              <button
                type="button"
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
                    loading="lazy"
                    decoding="async"
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
              accept="image/*,.pdf,application/pdf"
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
              title="Upload Image/PDF"
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
            <button
              title="Send"
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
  })
);
