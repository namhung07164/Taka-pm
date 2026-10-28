import { useEffect, useCallback, MutableRefObject } from "react";
import {
  safeGetItemLocal,
  safeSetItemLocal,
  safeRemoveItemLocal,
} from "../../lib/storage";
import { requestNotificationPermission } from "../../lib/notifications";
import { cleanupLocalStorage } from "../../lib/cleanup";
import { undoManager } from "../../lib/undoManager";
import { useAppStore } from "../../store/useAppStore";
import { AppUser } from "../../types";
import { startR2AutoBackupCronDaemon } from "../../lib/r2AutoBackupService";

interface UseAppLifecycleEffectsProps {
  currentUser: AppUser;
  setCurrentUser: (user: AppUser) => void;
  setShowTour: (show: boolean) => void;
  setActiveTab: (tab: string) => void;
  setUndoStack: (stack: any[]) => void;
  setRedoStack: (stack: any[]) => void;
  ribbonDisplayMode: string;
  setRibbonDisplayMode: (mode: any) => void;
  theme: string;
  setTheme: (theme: "light" | "dark") => void;
  setToast: (toast: any) => void;
  isAnyModalOpen: boolean;
  activeTab: string;
  setIsLoginModalOpen: (open: boolean) => void;
  handleTabChange: (tab: string) => void;
  pendingDeepLinkRef: MutableRefObject<any>;
  executeDeepLinkRef: MutableRefObject<any>;
}

export function useAppLifecycleEffects({
  currentUser,
  setCurrentUser,
  setShowTour,
  setActiveTab,
  setUndoStack,
  setRedoStack,
  ribbonDisplayMode,
  setRibbonDisplayMode,
  theme,
  setTheme,
  setToast,
  isAnyModalOpen,
  activeTab,
  setIsLoginModalOpen,
  handleTabChange,
  pendingDeepLinkRef,
  executeDeepLinkRef,
}: UseAppLifecycleEffectsProps) {
  useEffect(() => {
    if (currentUser?.role === "guest") {
      const hasSeenTour = safeGetItemLocal("taka_has_seen_tour");
      if (!hasSeenTour) {
        setShowTour(true);
      }
    }
  }, [currentUser, setShowTour]);

  const handleCloseTour = useCallback(() => {
    safeSetItemLocal("taka_has_seen_tour", "true");
    setShowTour(false);
  }, [setShowTour]);

  useEffect(() => {
    cleanupLocalStorage();
    if (typeof window !== "undefined") {
      const savedAuth = safeGetItemLocal("taka_auth_v1");
      if (savedAuth) {
        try {
          const savedAppUser = JSON.parse(savedAuth) as AppUser;
          if (savedAppUser.preferences?.defaultStore) {
            useAppStore.getState().setGlobalStoreFilter(savedAppUser.preferences.defaultStore);
          }
          if (savedAppUser.preferences?.defaultYear) {
            useAppStore
              .getState()
              .setGlobalYearFilter(String(savedAppUser.preferences.defaultYear));
          }
          if (savedAppUser.preferences?.currency) {
            useAppStore.getState().setCurrency(savedAppUser.preferences.currency);
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [setActiveTab]);

  useEffect(() => {
    return undoManager.subscribe((undo, redo) => {
      setUndoStack(undo);
      setRedoStack(redo);
    });
  }, [setUndoStack, setRedoStack]);

  useEffect(() => {
    if (ribbonDisplayMode !== "fullscreen") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRibbonDisplayMode("always_show");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ribbonDisplayMode, setRibbonDisplayMode]);

  useEffect(() => {
    safeRemoveItemLocal("taka_gantt_custom_today");
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.role === "guest") return;
    return startR2AutoBackupCronDaemon();
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    const savedTheme = safeGetItemLocal("taka_theme_v1");
    if (savedTheme === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    } else {
      setTheme("light");
      document.documentElement.classList.remove("dark");
    }
  }, [setTheme]);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    safeSetItemLocal("taka_theme_v1", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme, setTheme]);

  const handleRequestPermission = useCallback(async () => {
    const token = await requestNotificationPermission(currentUser.id);
    if (token) {
      setTimeout(() => {
        setToast({ title: "Success", message: "Push notifications enabled!" });
      }, 500);
    }
  }, [currentUser.id, setToast]);

  useEffect(() => {
    if (
      currentUser.id !== "guest" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      requestNotificationPermission(currentUser.id, true).catch(console.error);
    }
  }, [currentUser.id]);

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [isAnyModalOpen]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [activeTab]);

  const handleLogin = useCallback(
    (appUser: AppUser) => {
      setCurrentUser(appUser);
      safeSetItemLocal("taka_auth_v1", JSON.stringify(appUser));

      if (appUser.preferences?.defaultStore) {
        useAppStore.getState().setGlobalStoreFilter(appUser.preferences.defaultStore);
      }
      if (appUser.preferences?.defaultYear) {
        useAppStore.getState().setGlobalYearFilter(String(appUser.preferences.defaultYear));
      }
      if (appUser.preferences?.currency) {
        useAppStore.getState().setCurrency(appUser.preferences.currency);
      }

      setIsLoginModalOpen(false);

      if (pendingDeepLinkRef.current && executeDeepLinkRef.current) {
        const pending = pendingDeepLinkRef.current;
        pendingDeepLinkRef.current = null;
        executeDeepLinkRef.current(pending.targetType, pending.targetId, pending.extraParams);
      } else {
        setActiveTab("general");
      }
    },
    [setCurrentUser, setIsLoginModalOpen, pendingDeepLinkRef, executeDeepLinkRef, setActiveTab]
  );

  const handleLogout = useCallback(() => {
    const guest: AppUser = {
      id: "guest",
      username: "Guest",
      role: "guest",
      canSee: false,
      canWrite: false,
    };
    setCurrentUser(guest);
    safeSetItemLocal("taka_auth_v1", JSON.stringify(guest));
    handleTabChange("calendar");
  }, [setCurrentUser, handleTabChange]);

  return {
    handleCloseTour,
    toggleTheme,
    handleRequestPermission,
    handleLogin,
    handleLogout,
  };
}
