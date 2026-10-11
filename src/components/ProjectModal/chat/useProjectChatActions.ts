import { doc } from 'firebase/firestore';
import { writeBatch } from '../../../lib/firestoreWrites';
import { db, APP_ID, storage, googleSignIn, getAccessToken } from '../../../lib/firebase';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { generateId } from '../../../lib/utils';
import { useAppStore } from '../../../store/useAppStore';
import { Project, TaskComment, AppUser } from '../../../types';

interface UseProjectChatActionsParams {
  project: Project;
  localComments: TaskComment[];
  setLocalComments: (comments: TaskComment[]) => void;
  currentUser: AppUser;
  setConfirmModal?: any;
  editingText: string;
  setEditingText: (text: string) => void;
  setEditingCommentId: (id: string | null) => void;
  t: (key: string) => string;
}

export function useProjectChatActions({
  project,
  localComments,
  setLocalComments,
  currentUser,
  setConfirmModal,
  editingText,
  setEditingText,
  setEditingCommentId,
  t
}: UseProjectChatActionsParams) {
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
        await batch.commit();
      } catch (err) {
        console.error('Error deleting comment in firestore:', err);
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
      await batch.commit();
    } catch (err) {
      console.error('Error editing comment in firestore:', err);
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
      await batch.commit();
    } catch (e) {
      console.error('Failed to send comment', e);
    }
  };

  return {
    handleDeleteComment,
    handleEditComment,
    handleSendFromInput
  };
}
