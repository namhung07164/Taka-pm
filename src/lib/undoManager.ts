import { setDoc } from "../lib/firebase";
import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "./storage";
export interface UndoAction {
  description: string;
  revert: () => Promise<void>;
}

type Listener = (stack: UndoAction[]) => void;

let stack: UndoAction[] = [];
let listeners: Listener[] = [];
let currentBatch: UndoAction[] | null = null;
let currentBatchDescription = "";

import { db, APP_ID } from "./firebase";
import { collection, doc } from 'firebase/firestore';

export const logUserAction = async (description: string) => {
  try {
    const authData = safeGetItemLocal("taka_auth_v1");
    if (!authData) return;
    const user = JSON.parse(authData);
    if (!user || !user.id || user.role === "guest") return;

    const logRef = doc(
      collection(db, "artifacts", APP_ID, "public", "data", "taka_action_logs"),
    );
    setDoc(logRef, {
      userId: user.id,
      username: user.username,
      role: user.role,
      description,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to log action", e);
  }
};

export const undoManager = {
  startBatch: (description: string) => {
    if (currentBatch) {
      console.warn("A batch is already in progress. Committing it first.");
      undoManager.commitBatch();
    }
    currentBatch = [];
    currentBatchDescription = description;
  },

  commitBatch: (skipLog?: boolean) => {
    if (!currentBatch) return;
    if (currentBatch.length === 0) {
      currentBatch = null;
      return;
    }
    const actionsToRevert = [...currentBatch];
    const batchedAction: UndoAction = {
      description: currentBatchDescription,
      revert: async () => {
        for (let i = actionsToRevert.length - 1; i >= 0; i--) {
          await actionsToRevert[i].revert();
        }
      }
    };
    currentBatch = null;
    undoManager.push(batchedAction, skipLog);
  },

  cancelBatch: () => {
    currentBatch = null;
  },

  push: (action: UndoAction, skipLog?: boolean) => {
    if (currentBatch) {
      currentBatch.push(action);
      return;
    }
    stack.push(action);
    if (stack.length > 50) stack.shift(); // Keep last 50 actions
    notify();
    if (!skipLog) {
      logUserAction(action.description);
    }
  },

  pop: async () => {
    const action = stack.pop();
    if (action) {
      notify();
      try {
        await action.revert();
        logUserAction(`Undo: ${action.description}`);
      } catch (e) {
        console.error("Failed to revert action:", e);
      }
    }
  },

  getStack: () => stack,

  subscribe: (listener: Listener) => {
    listener([...stack]);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};

function notify() {
  listeners.forEach((l) => l([...stack]));
}
