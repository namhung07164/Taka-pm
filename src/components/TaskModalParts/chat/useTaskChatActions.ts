import React, { Dispatch, SetStateAction, useCallback } from 'react';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../../lib/firestoreWrites';
import { db, APP_ID, storage, googleSignIn, getAccessToken } from '../../../lib/firebase';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { generateId } from '../../../lib/utils';
import { useAppStore } from '../../../store/useAppStore';
import { Task, AppUser, Project, DelegationGroup } from '../../../types';

interface UseTaskChatActionsParams {
  task: Task;
  comments: any[];
  setLocalComments: React.Dispatch<React.SetStateAction<any[]>>;
  currentUser: AppUser;
  appUsers: AppUser[];
  currentProject: Project | undefined;
  linkedGroup: DelegationGroup | undefined;
  projectTasks: Task[];
  setConfirmModal: any;
  editingText: string;
  setEditingText: (text: string) => void;
  setEditingCommentId: (id: string | null) => void;
}

export function useTaskChatActions({
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
}: UseTaskChatActionsParams) {

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
              } catch (e) {
                console.error("Failed to delete attached file from storage:", e);
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
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                }
              } catch (e) {
                console.error("Failed to delete from Drive:", e);
              }
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
          batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', task.id), {
            comments: updatedTask.comments,
            updatedAt: nowIso
          });

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
              const fallbackGrpYear =
                linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear))
                  ? Number(linkedGroup.projectYear)
                  : (Number(currentProject?.year) || new Date().getFullYear());
              batch.set(
                doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id),
                { ...linkedGroup, projectYear: fallbackGrpYear, subTasks: JSON.parse(JSON.stringify(updatedSubTasks)) },
                { merge: true }
              );
            }
          }
          await batch.commit();

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
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', task.id), {
        comments: updatedTask.comments,
        updatedAt: nowIso
      });

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
          const fallbackGrpYear =
            linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear))
              ? Number(linkedGroup.projectYear)
              : (Number(currentProject?.year) || new Date().getFullYear());
          batch.set(
            doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id),
            { ...linkedGroup, projectYear: fallbackGrpYear, subTasks: JSON.parse(JSON.stringify(updatedSubTasks)) },
            { merge: true }
          );
        }
      }
      await batch.commit();

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
      id: `c_${Date.now()}_${generateId().substring(0, 4)}`,
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
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', task.id), {
        comments: updatedTask.comments,
        updatedAt: nowIso
      });

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
          const fallbackGrpYear =
            linkedGroup.projectYear !== undefined && linkedGroup.projectYear !== null && !isNaN(Number(linkedGroup.projectYear))
              ? Number(linkedGroup.projectYear)
              : (Number(currentProject?.year) || new Date().getFullYear());
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', linkedGroup.id), {
            ...linkedGroup,
            projectYear: fallbackGrpYear,
            subTasks: JSON.parse(JSON.stringify(updatedSubTasks))
          }, { merge: true });
        }
      }

      await batch.commit();

      if (taggedTasks.length > 0) {
        const refreshedTasks = useAppStore.getState().tasks.map(t => {
          if (taggedTasks.some(tt => tt.id === t.id)) {
            return { ...t, comments: [...(t.comments || []), newComment], updatedAt: nowIso };
          }
          return t;
        });
        useAppStore.getState().setTasks(refreshedTasks);
      }
    } catch (e: any) {
      console.error("Failed to send comment", e);
      useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
    }
  }, [task, comments, currentUser.id, linkedGroup, projectTasks, setLocalComments, appUsers, currentProject]);

  return {
    handleDeleteComment,
    handleEditComment,
    handleSendFromInput
  };
}
