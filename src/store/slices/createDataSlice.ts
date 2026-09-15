import { StateCreator } from "zustand";
import { safeGetItemLocal } from "../../lib/storage";
import { PermissionMatrix } from "../../types";
import { AppState, DataSlice } from "../storeTypes";

const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {} as PermissionMatrix;

export const createDataSlice: StateCreator<AppState, [], [], DataSlice> = (set) => ({
  user: null,
  setUser: (user) => set({ user }),
  currentUser: (() => {
    try {
      const savedAuth = safeGetItemLocal("taka_auth_v1");
      if (savedAuth) {
        const parsed = JSON.parse(savedAuth);
        if (parsed && typeof parsed === "object" && parsed.id) {
          return parsed;
        }
      }
    } catch {}
    return { id: "guest", username: "Guest", role: "guest", canSee: false, canWrite: false };
  })(),
  setCurrentUser: (currentUser) => set({ currentUser }),

  projects: [],
  setProjects: (projects) => set({ projects }),
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  isTasksRequested: false,
  setIsTasksRequested: (isTasksRequested) => set({ isTasksRequested }),
  isTasksLoading: false,
  setIsTasksLoading: (isTasksLoading) => set({ isTasksLoading }),
  allProjectsForNotifs: [],
  setAllProjectsForNotifs: (allProjectsForNotifs) => set({ allProjectsForNotifs }),
  allTasksForNotifs: [],
  setAllTasksForNotifs: (allTasksForNotifs) => set({ allTasksForNotifs }),
  costs: [],
  setCosts: (costs) => set({ costs }),
  isCostsRequested: false,
  setIsCostsRequested: (isCostsRequested) => set({ isCostsRequested }),
  isCostsLoading: false,
  setIsCostsLoading: (isCostsLoading) => set({ isCostsLoading }),
  appUsers: [],
  setAppUsers: (appUsers) => set({ appUsers }),
  subAppUsers: [],
  setSubAppUsers: (subAppUsers) => set({ subAppUsers }),
  notificationRules: [],
  setNotificationRules: (notificationRules) => set({ notificationRules }),
  locations: [],
  setLocations: (locations) => set({ locations }),
  locationVisibility: {},
  setLocationVisibility: (locationVisibility) => set({ locationVisibility }),
  parties: [],
  setParties: (parties) => set({ parties }),
  delegationGroups: [],
  setDelegationGroups: (delegationGroups) => set({ delegationGroups }),
  isDelegationsRequested: false,
  setIsDelegationsRequested: (isDelegationsRequested) => set({ isDelegationsRequested }),
  isDelegationsLoading: false,
  setIsDelegationsLoading: (isDelegationsLoading) => set({ isDelegationsLoading }),
  permissionMatrix: DEFAULT_PERMISSION_MATRIX,
  setPermissionMatrix: (permissionMatrix) => set({ permissionMatrix }),
  activeNotifications: [],
  setActiveNotifications: (activeNotifications) => set({ activeNotifications }),
  cloudStatus: "offline",
  setCloudStatus: (cloudStatus) => set({ cloudStatus }),

  undoStack: [],
  setUndoStack: (undoStack) => set({ undoStack }),

  currency: 'VND',
  setCurrency: (currency) => set({ currency }),
  jpyRate: 160,
  setJpyRate: (jpyRate) => set({ jpyRate }),
  usdRate: 25000,
  setUsdRate: (usdRate) => set({ usdRate }),
});
