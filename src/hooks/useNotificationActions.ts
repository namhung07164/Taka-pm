import { useCallback } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { useAppStore } from '../store/useAppStore';
import { safeSetItemLocal } from '../lib/storage';

export function useNotificationActions() {
  const currentUser = useAppStore((state) => state.currentUser);
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const appUsers = useAppStore((state) => state.appUsers);
  const setAppUsers = useAppStore((state) => state.setAppUsers);
  const setToast = useAppStore((state) => state.setToast);
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);

  const onTogglePushEnabled = useCallback(async (enabled: boolean) => {
    if (!currentUser || currentUser.id === 'guest') return;
    try {
      setDoc(
        doc(db, "artifacts", APP_ID, "public", "data", "taka_users", currentUser.id),
        { notification: enabled },
        { merge: true }
      );
      const updatedUser = { ...currentUser, notification: enabled };
      setCurrentUser(updatedUser);
      setAppUsers(appUsers.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
      safeSetItemLocal("taka_auth_v1", JSON.stringify(updatedUser));
    } catch (e) {
      console.error(e);
    }
  }, [currentUser, appUsers, setCurrentUser, setAppUsers]);

  const onToggleRead = useCallback(async (id: string) => {
    if (!currentUser) return;
    try {
      const prev = currentUser.readNotifs || [];
      const next = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
      const updatedUser = { ...currentUser, readNotifs: next };
      setCurrentUser(updatedUser);
      
      if (currentUser.id !== "guest") {
        setAppUsers(appUsers.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
        safeSetItemLocal("taka_auth_v1", JSON.stringify(updatedUser));
        setDoc(
          doc(db, "artifacts", APP_ID, "public", "data", "taka_users", currentUser.id),
          { readNotifs: next },
          { merge: true }
        );
      }
      safeSetItemLocal(`taka_read_notifs_${currentUser.id}`, JSON.stringify(next));
    } catch (e) {
      console.error("Error setting read notification", e);
    }
  }, [currentUser, appUsers, setCurrentUser, setAppUsers]);

  const onMarkAllRead = useCallback(async (activeNotifications: any[]) => {
    if (!currentUser) return;
    try {
      const activeIds = activeNotifications.map((n) => n.id);
      const prev = currentUser.readNotifs || [];
      const next = Array.from(new Set([...prev, ...activeIds]));
      const updatedUser = { ...currentUser, readNotifs: next };
      setCurrentUser(updatedUser);
      
      if (currentUser.id !== "guest") {
        setAppUsers(appUsers.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
        safeSetItemLocal("taka_auth_v1", JSON.stringify(updatedUser));
        setDoc(
          doc(db, "artifacts", APP_ID, "public", "data", "taka_users", currentUser.id),
          { readNotifs: next },
          { merge: true }
        );
      }
      safeSetItemLocal(`taka_read_notifs_${currentUser.id}`, JSON.stringify(next));
    } catch (e) {
      console.error(e);
    }
  }, [currentUser, appUsers, setCurrentUser, setAppUsers]);

  const onActionAgree = useCallback(async (notif: any) => {
    if (!currentUser) return;
    if (notif.action === 'cross_year_rollover' && notif.actionData?.taskId) {
      try {
        const taskId = notif.actionData.taskId;
        const newYear = notif.actionData.newYear;
        const taskToUpdate = tasks.find((t: any) => t.id === taskId);
        
        if (taskToUpdate) {
          const updatedTask = { ...taskToUpdate, projectYear: newYear, updatedAt: new Date().toISOString() };
          const projExists = projects.find((p: any) => p.code === taskToUpdate.projectCode && p.store === taskToUpdate.projectStore && Number(p.year) === Number(newYear));
          
          if (!projExists) {
            const oldProj = projects.find((p: any) => p.code === taskToUpdate.projectCode && p.store === taskToUpdate.projectStore && Number(p.year) === Number(taskToUpdate.projectYear));
            if (oldProj) {
              const newProjId = `${oldProj.id}_${newYear}`;
              const newProj = { ...oldProj, id: newProjId, year: newYear, no: Date.now() };
              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', newProjId), newProj);
            }
          }
          
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId), updatedTask, { merge: true });
          setToast({ title: "Rolled Over", message: `Task successfully rolled over to ${newYear}` });
          
          const prev = currentUser.readNotifs || [];
          if (!prev.includes(notif.id)) {
            const next = [...prev, notif.id];
            const updatedUser = { ...currentUser, readNotifs: next };
            setCurrentUser(updatedUser);
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', currentUser.id), { readNotifs: next }, { merge: true }).catch(console.error);
          }
        }
      } catch (e) {
        console.error("Error rolling over task", e);
        setToast({ title: "Error", message: "Failed to roll over task" });
      }
    }
  }, [currentUser, tasks, projects, setCurrentUser, setToast]);

  const onActionReject = useCallback(async (notif: any) => {
    if (!currentUser) return;
    try {
      const prev = currentUser.readNotifs || [];
      if (!prev.includes(notif.id)) {
        const next = [...prev, notif.id];
        const updatedUser = { ...currentUser, readNotifs: next };
        setCurrentUser(updatedUser);
        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', currentUser.id), { readNotifs: next }, { merge: true }).catch(console.error);
      }
    } catch (e) {
      console.error("Error rejecting notification", e);
    }
  }, [currentUser, setCurrentUser]);

  const onNotificationClick = useCallback(async (notif: any) => {
    if (!currentUser) return;
    try {
      const prev = currentUser.readNotifs || [];
      if (!prev.includes(notif.id)) {
        const next = [...prev, notif.id];
        const updatedUser = { ...currentUser, readNotifs: next };
        setCurrentUser(updatedUser);
        if (currentUser.id !== "guest") {
          setAppUsers(appUsers.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
          safeSetItemLocal("taka_auth_v1", JSON.stringify(updatedUser));
          setDoc(
            doc(db, "artifacts", APP_ID, "public", "data", "taka_users", currentUser.id),
            { readNotifs: next },
            { merge: true }
          );
        }
      }
    } catch (e) {
      console.error("Error on notification click", e);
    }
  }, [currentUser, appUsers, setCurrentUser, setAppUsers]);

  return {
    onTogglePushEnabled,
    onToggleRead,
    onMarkAllRead,
    onActionAgree,
    onActionReject,
    onNotificationClick
  };
}
