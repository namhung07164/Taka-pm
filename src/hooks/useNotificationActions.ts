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
        const state = useAppStore.getState();
        const taskId = String(notif.actionData.taskId);
        const newYear = notif.actionData.newYear;
        const allTasks = [...(tasks || []), ...(state.allTasksForNotifs || [])];
        const allProjs = [...(projects || []), ...(state.allProjectsForNotifs || [])];
        const taskToUpdate = allTasks.find((t: any) => String(t.id) === taskId);
        
        if (taskToUpdate) {
          const targetStore = taskToUpdate.projectStore || notif.projectStore || 'HCM';
          const targetCode = taskToUpdate.projectCode || notif.projectCode || '';
          const oldYear = taskToUpdate.projectYear || notif.projectYear;
          let targetProj = allProjs.find(
            (p: any) =>
              !p.isDeleted &&
              String(p.code || '').trim().toLowerCase() === String(targetCode).trim().toLowerCase() &&
              String(p.store || '').trim().toLowerCase() === String(targetStore).trim().toLowerCase() &&
              Number(p.year) === Number(newYear)
          );
          
          if (!targetProj) {
            const oldProj =
              (taskToUpdate.projectId || notif.projectId
                ? allProjs.find(
                    (p: any) =>
                      !p.isDeleted &&
                      String(p.id) === String(taskToUpdate.projectId || notif.projectId)
                  )
                : null) ||
              allProjs.find(
                (p: any) =>
                  !p.isDeleted &&
                  String(p.code || '').trim().toLowerCase() === String(targetCode).trim().toLowerCase() &&
                  String(p.store || '').trim().toLowerCase() === String(targetStore).trim().toLowerCase() &&
                  Number(p.year) === Number(oldYear)
              );
            if (oldProj) {
              const newProjId = `${oldProj.id}_${newYear}`;
              const newProj = { ...oldProj, id: newProjId, year: newYear, no: Date.now() };
              targetProj = newProj;
              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', newProjId), newProj);
              recordDelta({ docId: newProjId, collectionName: 'taka_projects', action: 'create', data: newProj, year: String(newYear) }).catch(console.error);
            }
          }

          const updatedTask = {
            ...taskToUpdate,
            projectId: targetProj?.id || taskToUpdate.projectId || notif.projectId,
            projectCode: targetCode,
            projectStore: targetStore,
            projectYear: newYear,
            updatedAt: new Date().toISOString(),
          };
          
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId), updatedTask, { merge: true });
          setToast({ title: "Rolled Over", message: `Task successfully rolled over to ${newYear} (${targetStore})` });
          
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
      const state = useAppStore.getState();
      const taskId = String(notif.targetId || notif.actionData?.taskId || '').trim();
      if (!taskId) return;
      const isSummaryId = taskId.startsWith('summary_');
      const allTasks = [...(tasks || []), ...(state.allTasksForNotifs || [])];
      const targetTask = allTasks.find((t: any) => String(t.id) === taskId);
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
        if (state.allTasksForNotifs?.length) {
          state.setAllTasksForNotifs(
            state.allTasksForNotifs.map((t: any) => String(t.id) === taskId ? updatedTask : t)
          );
        }
      }

      // Also update p.taskSummaries on the matched parent project (strictly isolated by projectId / store / year / code)
      const matchesNotifProject = (p: any) => {
        if (!p || p.isDeleted) return false;
        if (notif.projectId && p.id) return String(p.id) === String(notif.projectId);
        if (notif.projectId && !p.id) return false;
        if (
          notif.projectCode &&
          String(p.code || '').trim().toLowerCase() !== String(notif.projectCode).trim().toLowerCase()
        ) {
          return false;
        }
        if (
          notif.projectStore &&
          String(p.store || '').trim().toLowerCase() !== String(notif.projectStore).trim().toLowerCase()
        ) {
          return false;
        }
        if (
          notif.projectYear &&
          String(p.year || '').trim() !== String(notif.projectYear).trim()
        ) {
          return false;
        }
        return true;
      };

      const updateProjectSummariesList = (list: any[]) =>
        list.map((p: any) => {
          if (!matchesNotifProject(p) || !Array.isArray(p.taskSummaries)) return p;
          const nextSummaries = p.taskSummaries.map((ts: any, idx: number) => {
            const syntheticId = ts.id || `summary_${p.id}_${idx}`;
            if (
              String(syntheticId) === taskId ||
              (notif.taskName && ts.name === notif.taskName) ||
              (targetTask && ts.name === targetTask.name)
            ) {
              return { ...ts, runningStatus: 'Completed', finish: ts.finish || finishDate };
            }
            return ts;
          });
          return { ...p, taskSummaries: nextSummaries };
        });

      state.setProjects((prev: any[]) => updateProjectSummariesList(prev));
      if (state.allProjectsForNotifs?.length) {
        state.setAllProjectsForNotifs(updateProjectSummariesList(state.allProjectsForNotifs));
      }

      if (!isSummaryId) {
        setDoc(
          doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId),
          updatedFields,
          { merge: true }
        ).catch((err) => console.error("Error updating task in Firestore:", err));

        recordDelta({
          docId: taskId,
          collectionName: 'taka_tasks',
          action: 'update',
          data: {
            ...updatedFields,
            projectId: targetTask?.projectId || notif.projectId,
            projectCode: targetTask?.projectCode || notif.projectCode,
            projectStore: targetTask?.projectStore || notif.projectStore,
            projectYear: targetTask?.projectYear || notif.projectYear,
          },
          year: String(targetTask?.projectYear || notif.projectYear || new Date().getFullYear()),
          updatedBy: currentUser.email || currentUser.username,
        }).catch(console.error);
      }

      await onToggleRead(notif.id);

      setToast({
        title: "Task Completed",
        message: `Task "${targetTask?.name || notif.taskName || notif.title}" marked as completed.`,
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
