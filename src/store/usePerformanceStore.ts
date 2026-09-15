import { create } from "zustand";

export interface ReadEvent {
  id: string;
  timestamp: string;
  collection: string;
  count: number;
  fromCache: boolean;
  type: "snapshot_initial" | "snapshot_delta" | "getDoc" | "getDocs";
  details?: string;
}

export interface CollectionStat {
  serverReads: number;
  cacheReads: number;
  activeListeners: number;
  lastSyncAt: string;
  totalEvents: number;
}

export interface DevicePerformanceData {
  deviceId: string;
  deviceName: string;
  platform: string;
  userName: string;
  userRole: string;
  serverReads: number;
  cacheReads: number;
  activeListeners: number;
  cacheHitRate: number;
  lastActiveAt: string;
  lastActiveTimestamp: number;
  sessionDurationSec: number;
  totalEvents: number;
  status: "online" | "idle" | "offline";
  topCollection?: string;
}

interface PerformanceStore {
  serverReads: number;
  cacheReads: number;
  activeListeners: number;
  sessionStartTime: number;
  collectionStats: Record<string, CollectionStat>;
  events: ReadEvent[];

  // Actions
  trackSnapshot: (collectionName: string, snapshot: any, eventType?: "snapshot_initial" | "snapshot_delta") => void;
  trackGetDoc: (collectionName: string, fromCache: boolean, docCount?: number, details?: string) => void;
  registerListener: (collectionName: string) => void;
  unregisterListener: (collectionName: string) => void;
  resetStats: () => void;
}

const MAX_EVENT_LOGS = 120;

export const usePerformanceStore = create<PerformanceStore>((set, get) => ({
  serverReads: 0,
  cacheReads: 0,
  activeListeners: 0,
  sessionStartTime: Date.now(),
  collectionStats: {},
  events: [],

  trackSnapshot: (collectionName, snapshot, customEventType) => {
    if (!snapshot) return;

    const fromCache = snapshot.metadata?.fromCache ?? false;
    let count = 0;
    let type: "snapshot_initial" | "snapshot_delta" = customEventType || "snapshot_delta";

    if (snapshot.docChanges && typeof snapshot.docChanges === "function") {
      const changes = snapshot.docChanges();
      if (changes.length === 0 && snapshot.size > 0 && !fromCache) {
        count = snapshot.size;
        type = "snapshot_initial";
      } else {
        count = changes.length;
      }
    } else if (typeof snapshot.size === "number") {
      count = snapshot.size;
    } else if (snapshot.exists && typeof snapshot.exists === "function") {
      count = snapshot.exists() ? 1 : 0;
    } else {
      count = 1;
    }

    if (count === 0 && snapshot.size > 0 && fromCache) {
      count = snapshot.size;
      type = "snapshot_initial";
    }

    const serverCount = fromCache ? 0 : count;
    const cacheCount = fromCache ? count : 0;
    const nowStr = new Date().toLocaleTimeString();

    const newEvent: ReadEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: nowStr,
      collection: collectionName,
      count,
      fromCache,
      type,
      details: fromCache ? "Local IndexedDB Cache" : "Cloud Firestore Network (Billable)",
    };

    set((state) => {
      const existing = state.collectionStats[collectionName] || {
        serverReads: 0,
        cacheReads: 0,
        activeListeners: 0,
        lastSyncAt: nowStr,
        totalEvents: 0,
      };

      const updatedStat: CollectionStat = {
        ...existing,
        serverReads: existing.serverReads + serverCount,
        cacheReads: existing.cacheReads + cacheCount,
        lastSyncAt: nowStr,
        totalEvents: existing.totalEvents + 1,
      };

      return {
        serverReads: state.serverReads + serverCount,
        cacheReads: state.cacheReads + cacheCount,
        collectionStats: {
          ...state.collectionStats,
          [collectionName]: updatedStat,
        },
        events: [newEvent, ...state.events].slice(0, MAX_EVENT_LOGS),
      };
    });
  },

  trackGetDoc: (collectionName, fromCache, docCount = 1, details) => {
    const serverCount = fromCache ? 0 : docCount;
    const cacheCount = fromCache ? docCount : 0;
    const nowStr = new Date().toLocaleTimeString();

    const newEvent: ReadEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: nowStr,
      collection: collectionName,
      count: docCount,
      fromCache,
      type: docCount > 1 ? "getDocs" : "getDoc",
      details: details || (fromCache ? "Direct Cache Read" : "Direct Server Read"),
    };

    set((state) => {
      const existing = state.collectionStats[collectionName] || {
        serverReads: 0,
        cacheReads: 0,
        activeListeners: 0,
        lastSyncAt: nowStr,
        totalEvents: 0,
      };

      return {
        serverReads: state.serverReads + serverCount,
        cacheReads: state.cacheReads + cacheCount,
        collectionStats: {
          ...state.collectionStats,
          [collectionName]: {
            ...existing,
            serverReads: existing.serverReads + serverCount,
            cacheReads: existing.cacheReads + cacheCount,
            lastSyncAt: nowStr,
            totalEvents: existing.totalEvents + 1,
          },
        },
        events: [newEvent, ...state.events].slice(0, MAX_EVENT_LOGS),
      };
    });
  },

  registerListener: (collectionName) => {
    set((state) => {
      const existing = state.collectionStats[collectionName] || {
        serverReads: 0,
        cacheReads: 0,
        activeListeners: 0,
        lastSyncAt: "-",
        totalEvents: 0,
      };

      return {
        activeListeners: state.activeListeners + 1,
        collectionStats: {
          ...state.collectionStats,
          [collectionName]: {
            ...existing,
            activeListeners: existing.activeListeners + 1,
          },
        },
      };
    });
  },

  unregisterListener: (collectionName) => {
    set((state) => {
      const existing = state.collectionStats[collectionName];
      const newActive = existing ? Math.max(0, existing.activeListeners - 1) : 0;

      return {
        activeListeners: Math.max(0, state.activeListeners - 1),
        collectionStats: existing
          ? {
              ...state.collectionStats,
              [collectionName]: {
                ...existing,
                activeListeners: newActive,
              },
            }
          : state.collectionStats,
      };
    });
  },

  resetStats: () => {
    set({
      serverReads: 0,
      cacheReads: 0,
      sessionStartTime: Date.now(),
      events: [],
      collectionStats: {},
    });
  },
}));
