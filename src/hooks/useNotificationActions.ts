import React, { useCallback } from 'react';
import { doc } from 'firebase/firestore';
import { setDoc } from '../lib/firestoreWrites';
import { db, APP_ID } from '../lib/firebase';
import { useAppStore } from '../store/useAppStore';
import { safeSetItemLocal, safeGetItemLocal } from '../lib/storage';
import { recordDelta } from '../lib/deltaSyncService';

export function useNotificationActions() {
  const currentUser = useAppStore((state) => state.currentUser);
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const appUsers = useAppStore((state) => state.appUsers);
  const setAppUsers = useAppStore((state) => state.setAppUsers);
  const setToast = useAppStore((state) => state.setToast);
  const tasks = useAppStore((state) => state.tasks);
  const setTasks = useAppStore((state) => state.setTasks);
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
              recordDelta({ docId: newProjId, collectionName: 'taka_projects', action: 'create', data: newProj, year: String(newYear) }).catch(console.error);
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
        safeSetItemLocal(`taka_read_notifs_${currentUser.id}`, JSON.stringify(next));
        if (currentUser.id !== 'guest') {
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', currentUser.id), { readNotifs: next }, { merge: true }).catch(console.error);
        }
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
        safeSetItemLocal(`taka_read_notifs_${currentUser.id}`, JSON.stringify(next));
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

  const onQuickCompleteTask = useCallback(async (notif: any) => {
    if (!currentUser) return;
    try {
      const taskId = String(notif.targetId || notif.actionData?.taskId || '').trim();
      if (!taskId) return;
      const targetTask = tasks.find((t: any) => String(t.id) === taskId);
      const nowIso = new Date().toISOString();
      const finishDate = targetTask?.finish || nowIso.substring(0, 10);

      const updatedFields = {
        runningStatus: 'Completed',
        finish: finishDate,
        updatedAt: nowIso,
      };

      if (targetTask) {
        const updatedTask = { ...targetTask, ...updatedFields };
        const nextTasks = tasks.map((t: any) => String(t.id) === taskId ? updatedTask : t);
        setTasks(nextTasks);
      }

      setDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId),
        updatedFields,
        { merge: true }
      ).catch((err) => console.error("Error updating task in Firestore:", err));

      recordDelta({
        docId: taskId,
        collectionName: 'taka_tasks',
        action: 'update',
        data: updatedFields,
        year: targetTask?.projectYear ? String(targetTask.projectYear) : undefined,
        updatedBy: currentUser.email || currentUser.username,
      }).catch(console.error);

      await onToggleRead(notif.id);

      setToast({
        title: "Task Completed",
        message: `Task "${targetTask?.name || notif.title}" marked as completed.`,
      });
    } catch (e) {
      console.error("Error quick completing task:", e);
      setToast({ title: "Error", message: "Failed to mark task as completed." });
    }
  }, [currentUser, tasks, setTasks, onToggleRead, setToast]);

  const onSnoozeNotif = useCallback((notifId: string, hours: number) => {
    try {
      const raw = safeGetItemLocal('taka_snoozed_notifs');
      let snoozedMap: Record<string, number> = {};
      if (raw) {
        try { snoozedMap = JSON.parse(raw); } catch {}
      }
      const until = Date.now() + hours * 3600 * 1000;
      snoozedMap[notifId] = until;
      safeSetItemLocal('taka_snoozed_notifs', JSON.stringify(snoozedMap));
      window.dispatchEvent(new CustomEvent('taka_snoozed_notifs_changed'));
      const durationLabel = hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
      setToast({
        title: "Notification Snoozed",
        message: `Reminder snoozed for ${durationLabel}.`,
      });
    } catch (e) {
      console.error("Error snoozing notification:", e);
    }
  }, [setToast]);

  const onClearStaleNotifs = useCallback(async (activeNotifications: any[]) => {
    if (!currentUser) return;
    try {
      const fourteenDaysMs = 14 * 24 * 3600 * 1000;
      const now = Date.now();
      const staleIds = activeNotifications
        .filter((n) => (now - n.generatedAt > fourteenDaysMs) || (n.diffMs < -fourteenDaysMs))
        .map((n) => n.id);

      if (staleIds.length === 0) {
        setToast({ title: "Clean Inbox", message: "No stale notifications older than 14 days." });
        return;
      }

      const prev = currentUser.readNotifs || [];
      const next = Array.from(new Set([...prev, ...staleIds]));
      const updatedUser = { ...currentUser, readNotifs: next };
      setCurrentUser(updatedUser);
      if (currentUser.id !== "guest") {
        setAppUsers(appUsers.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
        safeSetItemLocal("taka_auth_v1", JSON.stringify(updatedUser));
        setDoc(
          doc(db, "artifacts", APP_ID, "public", "data", "taka_users", currentUser.id),
          { readNotifs: next },
          { merge: true }
        ).catch(console.error);
      }
      safeSetItemLocal(`taka_read_notifs_${currentUser.id}`, JSON.stringify(next));
      setToast({
        title: "Stale Notifications Archived",
        message: `Archived ${staleIds.length} notifications older than 14 days.`,
      });
    } catch (e) {
      console.error("Error clearing stale notifications:", e);
    }
  }, [currentUser, appUsers, setCurrentUser, setAppUsers, setToast]);

  return {
    onTogglePushEnabled,
    onToggleRead,
    onMarkAllRead,
    onActionAgree,
    onActionReject,
    onNotificationClick,
    onQuickCompleteTask,
    onSnoozeNotif,
    onClearStaleNotifs
  };
}
